import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as efs from 'aws-cdk-lib/aws-efs';
import { Construct } from 'constructs';

export interface GpuInferenceStackProps extends cdk.StackProps {
  vpcId?: string;
  subnetIds?: string[];
}

export class GpuInferenceStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly autoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: GpuInferenceStackProps) {
    super(scope, id, props);

    // Use default VPC (no VPC_ID needed)
    this.vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', {
      isDefault: true,
    });

    // Security Group for GPU instances
    this.securityGroup = new ec2.SecurityGroup(this, 'GpuSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for GPU inference instances',
      allowAllOutbound: true,
    });

    // Allow FastAPI port 8000 from within VPC
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(8000),
      'Allow FastAPI from VPC'
    );

    // EFS Filesystem for model cache
    const modelCacheFs = new efs.FileSystem(this, 'ModelCacheEfs', {
      vpc: this.vpc,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep models on stack deletion
      encrypted: true,
    });

    // Allow GPU instances to mount EFS
    modelCacheFs.connections.allowDefaultPortFrom(this.securityGroup);

    // Create access point for the model cache
    const accessPoint = modelCacheFs.addAccessPoint('ModelCacheAccessPoint', {
      path: '/hf_cache',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
      posixUser: {
        gid: '1000',
        uid: '1000',
      },
    });

    // IAM Role for EC2
    const instanceRole = new iam.Role(this, 'GpuInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // S3 and ECR permissions
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
        ],
        resources: ['arn:aws:s3:::*/*'],
      })
    );

    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: ['*'],
      })
    );

    // SSM parameter access for configuration
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/video-generation/*`,
        ],
      })
    );

    // User data to start Docker container with native inference
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      'exec > >(tee /var/log/user-data.log) 2>&1',
      '',
      '# Docker should be pre-installed on ECS-optimized AMI',
      'systemctl start docker || true',
      'systemctl enable docker || true',
      '',
      '# Install AWS CLI v2 (not pre-installed on ECS-optimized AMI)',
      'echo "Installing AWS CLI..."',
      'yum install -y unzip curl',
      'curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"',
      'unzip -q /tmp/awscliv2.zip -d /tmp',
      '/tmp/aws/install',
      'export PATH=$PATH:/usr/local/bin',
      '',
      '# Verify GPU is available',
      'echo "Checking GPU..."',
      'nvidia-smi',
      '',
      '# ECR login',
      'REGION="us-east-1"',
      'ACCOUNT_ID="971422717446"',
      '/usr/local/bin/aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com',
      '',
      '# Pull and run inference container',
      'ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/video-inference:latest"',
      'echo "Pulling container: $ECR_URI"',
      'docker pull $ECR_URI',
      '',
      '# Get Replicate token from SSM (fallback for hybrid mode)',
      'REPLICATE_TOKEN=$(/usr/local/bin/aws ssm get-parameter --name /video-generation/replicate-token --query Parameter.Value --output text --region $REGION 2>/dev/null || echo "")',
      '',
      '# Install EFS utils and mount (optional - use local cache as fallback)',
      'yum install -y amazon-efs-utils || apt-get install -y amazon-efs-utils',
      `EFS_ID="${modelCacheFs.fileSystemId}"`,
      'MOUNT_BASE=/mnt/efs',
      'mkdir -p $MOUNT_BASE',
      'if mount -t efs -o tls,noresvport $EFS_ID:/ $MOUNT_BASE; then',
      '  echo "EFS mounted successfully"',
      '  HF_CACHE_DIR=$MOUNT_BASE/hf_cache',
      '  MODEL_DIR=$MOUNT_BASE/models',
      'else',
      '  echo "WARNING: EFS mount failed, using local cache"',
      '  HF_CACHE_DIR=/opt/hf_cache',
      '  MODEL_DIR=/opt/models',
      'fi',
      'mkdir -p $HF_CACHE_DIR',
      'mkdir -p $MODEL_DIR',
      'chown -R 1000:1000 $HF_CACHE_DIR',
      'chown -R 1000:1000 $MODEL_DIR',
      '',
      '# Run the container with GPU support',
      'docker run -d \\',
      '  --name video-inference \\',
      '  --gpus all \\',
      '  --restart unless-stopped \\',
      '  -p 8000:8000 \\',
      '  -e HF_HOME=/app/hf_cache \\',
      '  -e TRANSFORMERS_CACHE=/app/hf_cache \\',
      '  -e GGUF_MODEL_PATH=/app/models/hunyuan-video-t2v-720p-Q8_0.gguf \\',
      '  -v $HF_CACHE_DIR:/app/hf_cache:rw \\',
      '  -v $MODEL_DIR:/app/models:rw \\',
      '  -e AWS_DEFAULT_REGION=$REGION \\',
      '  $ECR_URI',
      '',
      '# Wait for container to be ready',
      'echo "Waiting for container to start..."',
      'for i in {1..60}; do',
      '  if curl -s http://localhost:8000/health | grep -q "healthy"; then',
      '    echo "Container is ready!"',
      '    break',
      '  fi',
      '  sleep 5',
      'done',
      '',
      'echo "GPU inference instance ready with native container"'
    );

    // ECS-optimized GPU AMI (includes Docker + NVIDIA drivers)
    const ami = ec2.MachineImage.fromSsmParameter(
      '/aws/service/ecs/optimized-ami/amazon-linux-2/gpu/recommended/image_id',
      { os: ec2.OperatingSystemType.LINUX }
    );

    // Launch Template
    const launchTemplate = new ec2.LaunchTemplate(this, 'GpuLaunchTemplate', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.G5, ec2.InstanceSize.XLARGE16),
      machineImage: ami,
      securityGroup: this.securityGroup,
      role: instanceRole,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(200, {  // Increased from 100GB to 200GB for HunyuanVideo model
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      requireImdsv2: true,
      httpPutResponseHopLimit: 2,  // Allow Docker containers to access IMDS for IAM credentials
    });

    // Auto Scaling Group (min=0 for cost control)
    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'GpuAsg', {
      vpc: this.vpc,
      launchTemplate,
      minCapacity: 0,
      maxCapacity: 1,
      desiredCapacity: 0, // Start with 0, scale up when needed
    });

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID (default VPC)',
    });

    new cdk.CfnOutput(this, 'AsgName', {
      value: this.autoScalingGroup.autoScalingGroupName,
      description: 'Auto Scaling Group name',
    });

    new cdk.CfnOutput(this, 'SecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'Security Group ID',
    });

    new cdk.CfnOutput(this, 'EfsFileSystemId', {
      value: modelCacheFs.fileSystemId,
      description: 'EFS Filesystem ID for model cache',
    });
  }
}
