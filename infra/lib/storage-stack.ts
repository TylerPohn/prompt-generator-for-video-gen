import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  public readonly videoBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for Video Outputs
    this.videoBucket = new s3.Bucket(this, 'VideoOutputBucket', {
      // Versioning disabled for cost efficiency
      versioned: false,

      // Auto-delete objects and bucket on stack destruction (dev mode)
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,

      // Block all public access for security
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // Encryption at rest
      encryption: s3.BucketEncryption.S3_MANAGED,

      // Enforce SSL/TLS
      enforceSSL: true,

      // CORS for presigned URL access
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],

      // Lifecycle: delete after 7 days for cost control
      lifecycleRules: [
        {
          id: 'DeleteOldVideos',
          enabled: true,
          expiration: cdk.Duration.days(7),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
    });

    // Output bucket name
    new cdk.CfnOutput(this, 'VideoBucketName', {
      value: this.videoBucket.bucketName,
      description: 'S3 bucket for generated videos',
    });
  }
}
