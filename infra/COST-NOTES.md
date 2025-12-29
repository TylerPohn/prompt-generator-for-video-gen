# AWS Cost Analysis for AI Video Generation Infrastructure

This document provides a detailed breakdown of costs for running the AI video generation infrastructure on AWS.

## Table of Contents
- [Monthly Cost Summary](#monthly-cost-summary)
- [Service-by-Service Breakdown](#service-by-service-breakdown)
- [Cost Scenarios](#cost-scenarios)
- [Cost Optimization Strategies](#cost-optimization-strategies)
- [Monitoring and Alerts](#monitoring-and-alerts)
- [FAQ](#faq)

---

## Monthly Cost Summary

### Baseline Infrastructure Costs (Serverless Components Only)

| Service | Monthly Cost |
|---------|--------------|
| API Gateway | $3.50 |
| Lambda (3 functions) | $1.00 |
| DynamoDB (On-Demand) | $1.25 |
| SQS | $0.40 |
| S3 Storage (100GB) | $2.30 |
| CloudWatch Logs | $0.50 |
| **Total (No GPU)** | **~$9/month** |

### With GPU Instances

| Scenario | GPU Hours | Monthly Cost |
|----------|-----------|--------------|
| Development (4 hrs/day) | 120 hrs/month | ~$100 |
| Light Production (8 hrs/day) | 240 hrs/month | ~$195 |
| 24/7 Production | 720 hrs/month | ~$560 |

### Total Infrastructure Cost Estimates

| Scenario | Components | Monthly Cost |
|----------|------------|--------------|
| **Idle (Dev)** | Serverless only, GPU scaled to 0 | **$9 - $20** |
| **Light Usage** | 4 hrs/day GPU + serverless | **$110 - $150** |
| **Medium Usage** | 8 hrs/day GPU + serverless + ALB | **$210 - $270** |
| **Heavy Usage** | 24/7 GPU + full stack | **$600 - $700** |

> All prices based on us-east-1 region as of December 2025. Prices vary by region and may change.

---

## Service-by-Service Breakdown

### 1. EC2 GPU Instances (g5.xlarge)

**Instance Type:** g5.xlarge
- **vCPUs:** 4
- **Memory:** 16 GiB
- **GPU:** 1 × NVIDIA A10G Tensor Core GPU (24GB GPU memory)
- **Network:** Up to 10 Gbps
- **Storage:** 250 GB NVMe SSD

**Pricing (us-east-1):**
- **On-Demand:** $1.006/hour
- **1-Year Reserved:** $0.604/hour (40% savings)
- **3-Year Reserved:** $0.403/hour (60% savings)
- **Spot Instance:** $0.302-0.503/hour (50-70% savings)

**Monthly Costs:**
| Usage Pattern | On-Demand | 1-Yr Reserved | Spot (avg) |
|---------------|-----------|---------------|------------|
| 24/7 | $726 | $436 | $217-362 |
| 12 hrs/day | $363 | $218 | $109-181 |
| 8 hrs/day | $242 | $145 | $73-121 |
| 4 hrs/day | $121 | $73 | $36-60 |

**Key Considerations:**
- Model loading takes 2-5 minutes, factor into cost calculations
- Consider keeping instances warm during business hours
- Auto-scaling can help manage costs but has cold-start overhead

**Alternative GPU Options:**

| Instance Type | GPU | vCPU | Memory | Price/hr (On-Demand) | Use Case |
|--------------|-----|------|---------|---------------------|-----------|
| g5.xlarge | 1×A10G | 4 | 16GB | $1.006 | Recommended for Wan2.2-T2V |
| g5.2xlarge | 1×A10G | 8 | 32GB | $1.212 | Better for batch processing |
| g4dn.xlarge | 1×T4 | 4 | 16GB | $0.526 | Budget option (slower) |
| p3.2xlarge | 1×V100 | 8 | 61GB | $3.06 | Overkill for inference |

### 2. S3 Storage

**Video Output Bucket:**
- **Standard Storage:** $0.023/GB/month
- **Lifecycle Policy:** 7-day expiration (included in stack)
- **Data Transfer Out:** $0.09/GB (to internet)

**Cost Examples:**
| Videos/Month | Avg Size | Storage | Transfer | Monthly Cost |
|--------------|----------|---------|----------|--------------|
| 100 | 100MB | 10GB | 10GB | $1.13 |
| 500 | 100MB | 50GB | 50GB | $5.65 |
| 1000 | 100MB | 100GB | 100GB | $11.30 |
| 1000 | 200MB | 200GB | 200GB | $22.60 |

**Model Weights Bucket:**
- **Wan2.2-T2V Model:** ~14GB (one-time download)
- **Intelligent Tiering:** $0.023/GB/month (same as standard)
- **Monthly Cost:** ~$0.32/month

**Data Transfer Costs:**
- **S3 to EC2 (same region):** FREE
- **S3 to Internet (first 100GB/month):** FREE
- **S3 to Internet (next 10TB/month):** $0.09/GB
- **S3 to CloudFront:** $0.00/GB (free tier available)

**Cost Optimization:**
- Lifecycle policies reduce storage costs automatically
- Use CloudFront for video delivery to reduce transfer costs
- Enable requester pays for customer downloads

### 3. API Gateway

**Pricing:**
- **REST API Requests:** $3.50 per million requests
- **Data Transfer Out:** $0.09/GB

**Cost Examples:**
| Requests/Month | Data Out | Monthly Cost |
|----------------|----------|--------------|
| 10,000 | 1GB | $0.13 |
| 100,000 | 10GB | $1.25 |
| 1,000,000 | 100GB | $12.50 |
| 10,000,000 | 1TB | $125.00 |

**Included in Stack:**
- Request validation (reduces Lambda invocations)
- Rate limiting (prevents cost overruns)
- API key authentication (controls access)

### 4. Lambda Functions

**Pricing:**
- **Requests:** $0.20 per 1 million requests
- **Duration:** $0.0000166667 per GB-second
- **Free Tier:** 1M requests + 400,000 GB-seconds per month

**Our Functions:**

| Function | Memory | Avg Duration | Cost per 1M Invocations |
|----------|--------|--------------|------------------------|
| Submit Job | 512MB | 100ms | $1.04 |
| Get Status | 256MB | 50ms | $0.41 |
| Process Job | 512MB | 30s | $250.00 |

**Monthly Cost Examples:**
| Job Submissions | Status Checks | Processing Jobs | Monthly Cost |
|----------------|---------------|----------------|--------------|
| 1,000 | 5,000 | 1,000 | $0.51 |
| 10,000 | 50,000 | 10,000 | $5.13 |
| 100,000 | 500,000 | 100,000 | $51.25 |

**Notes:**
- Process Job function polls GPU container, increasing duration
- Consider SQS-triggered Lambda instead of polling
- Free tier covers most development usage

### 5. DynamoDB

**Pricing Model:** On-Demand (Pay per request)
- **Write Requests:** $1.25 per million
- **Read Requests:** $0.25 per million
- **Storage:** $0.25/GB/month

**Our Usage Pattern:**
| Operation | Frequency per Job | Cost per Million Jobs |
|-----------|------------------|---------------------|
| Create Job | 1 write | $1.25 |
| Update Status | 3 writes | $3.75 |
| Get Status | 5 reads | $1.25 |
| **Total** | **4 writes + 5 reads** | **$6.25** |

**Monthly Cost Examples:**
| Jobs/Month | Read Requests | Write Requests | Storage | Monthly Cost |
|------------|---------------|----------------|---------|--------------|
| 1,000 | 5,000 | 4,000 | 1GB | $1.51 |
| 10,000 | 50,000 | 40,000 | 10GB | $5.13 |
| 100,000 | 500,000 | 400,000 | 100GB | $51.25 |

**Cost Optimization:**
- On-Demand is cost-effective for variable workloads
- Consider Provisioned Capacity for predictable loads
- Use TTL to automatically delete old jobs
- Global Secondary Index adds 2× write cost

**Alternative: Provisioned Capacity**
- Better for consistent, predictable traffic
- Requires capacity planning
- Can be 50% cheaper for steady-state workloads

### 6. SQS (Simple Queue Service)

**Pricing:**
- **Standard Queue:** $0.40 per million requests (after free tier)
- **Free Tier:** 1 million requests per month

**Our Usage:**
| Operation | Frequency per Job |
|-----------|------------------|
| Send Message | 1 |
| Receive Message | ~10 (polling) |
| Delete Message | 1 |
| **Total** | **~12 requests** |

**Monthly Cost Examples:**
| Jobs/Month | Total Requests | Monthly Cost |
|------------|----------------|--------------|
| 1,000 | 12,000 | $0.00 (free tier) |
| 10,000 | 120,000 | $0.00 (free tier) |
| 100,000 | 1,200,000 | $0.08 |
| 1,000,000 | 12,000,000 | $4.40 |

**Cost Optimization:**
- Long polling reduces empty receives
- Batch message processing
- Dead Letter Queue prevents retry loops

### 7. Application Load Balancer (ALB)

**Pricing:**
- **ALB Hour:** $0.0225/hour
- **LCU (Load Balancer Capacity Unit):** $0.008/hour
- **1 LCU =** 25 new connections/sec OR 3,000 active connections OR 1,000 requests/min OR 1 GB/hour

**Monthly Costs:**
| Component | Usage | Monthly Cost |
|-----------|-------|--------------|
| ALB (24/7) | 730 hours | $16.43 |
| LCU (light) | ~2 LCUs avg | $11.68 |
| LCU (medium) | ~5 LCUs avg | $29.20 |
| LCU (heavy) | ~10 LCUs avg | $58.40 |

**Total ALB Cost:**
- **Light usage:** ~$28/month
- **Medium usage:** ~$45/month
- **Heavy usage:** ~$75/month

**Notes:**
- Required for ECS GPU instances
- Costs accrue even when GPU instances are scaled to 0
- Consider NLB for lower costs if HTTP features not needed

### 8. Elastic Container Registry (ECR)

**Pricing:**
- **Storage:** $0.10/GB/month
- **Data Transfer:** $0.09/GB (to internet)

**Our Usage:**
- **Docker Image Size:** ~10-15GB (PyTorch + Diffusers + Model)
- **Monthly Storage Cost:** $1.00-1.50
- **Data Transfer:** Minimal (EC2 pulls are free in same region)

**Total ECR Cost:** ~$1.50/month

### 9. CloudWatch

**Pricing:**
- **Logs Ingestion:** $0.50/GB
- **Logs Storage:** $0.03/GB/month
- **Custom Metrics:** $0.30/metric/month
- **Alarms:** $0.10/alarm/month

**Our Usage:**
| Component | Volume | Monthly Cost |
|-----------|--------|--------------|
| Lambda Logs | 5GB | $2.65 |
| ECS Logs | 10GB | $5.30 |
| Custom Metrics | 10 | $3.00 |
| Alarms | 5 | $0.50 |

**Total CloudWatch Cost:** $10-15/month

**Cost Optimization:**
- Set log retention to 7-30 days
- Filter logs before ingestion
- Use log insights sparingly
- Consolidate metrics

### 10. Data Transfer

**Inter-Service Transfer (Same Region):**
- EC2 ↔ S3: FREE
- EC2 ↔ DynamoDB: FREE
- Lambda ↔ S3: FREE
- ECS ↔ ECR: FREE

**Internet Data Transfer Out:**
- First 100 GB/month: FREE
- Next 10 TB/month: $0.09/GB
- Next 40 TB/month: $0.085/GB

**Cross-Region Transfer:**
- $0.02/GB (avoid if possible)

**Example Scenarios:**
| Videos Served/Month | Avg Size | Data Out | Monthly Cost |
|--------------------|----------|----------|--------------|
| 500 | 100MB | 50GB | $0.00 (free tier) |
| 1,500 | 100MB | 150GB | $4.50 |
| 5,000 | 100MB | 500GB | $36.00 |
| 10,000 | 200MB | 2TB | $171.00 |

---

## Cost Scenarios

### Scenario 1: Development/Testing
**Usage:**
- GPU: 2 hours/day × 20 days = 40 hours/month
- Jobs: 100 jobs/month
- API Requests: 1,000/month

**Monthly Costs:**
| Component | Cost |
|-----------|------|
| EC2 g5.xlarge (40 hrs) | $40 |
| S3 Storage (10GB) | $0.23 |
| API Gateway | $0.03 |
| Lambda | $0.00 (free tier) |
| DynamoDB | $0.00 (free tier) |
| SQS | $0.00 (free tier) |
| CloudWatch | $1.00 |
| **Total** | **~$42/month** |

### Scenario 2: Small Business
**Usage:**
- GPU: 8 hours/day × 30 days = 240 hours/month
- Jobs: 2,000 jobs/month
- API Requests: 20,000/month
- Videos stored: 50GB

**Monthly Costs:**
| Component | Cost |
|-----------|------|
| EC2 g5.xlarge (240 hrs) | $242 |
| ALB | $28 |
| S3 Storage + Transfer | $6.00 |
| API Gateway | $0.70 |
| Lambda | $1.03 |
| DynamoDB | $1.50 |
| SQS | $0.00 (free tier) |
| ECR | $1.50 |
| CloudWatch | $8.00 |
| **Total** | **~$289/month** |

### Scenario 3: Production (24/7)
**Usage:**
- GPU: 720 hours/month (always on)
- Jobs: 10,000 jobs/month
- API Requests: 100,000/month
- Videos stored: 200GB with 500GB transfer

**Monthly Costs:**
| Component | Cost |
|-----------|------|
| EC2 g5.xlarge (24/7) | $726 |
| ALB | $45 |
| S3 Storage + Transfer | $49.60 |
| API Gateway | $3.50 |
| Lambda | $5.13 |
| DynamoDB | $5.13 |
| SQS | $0.08 |
| ECR | $1.50 |
| CloudWatch | $12.00 |
| **Total** | **~$848/month** |

### Scenario 4: Spot Instance Production (Cost Optimized)
**Usage:**
- GPU: 720 hours/month (Spot @ 60% discount)
- Same workload as Scenario 3

**Monthly Costs:**
| Component | Cost |
|-----------|------|
| EC2 g5.xlarge Spot (24/7) | $290 |
| ALB | $45 |
| S3 Storage + Transfer | $49.60 |
| API Gateway | $3.50 |
| Lambda | $5.13 |
| DynamoDB | $5.13 |
| SQS | $0.08 |
| ECR | $1.50 |
| CloudWatch | $12.00 |
| **Total** | **~$412/month** |

**Savings:** $436/month (51% reduction)

---

## Cost Optimization Strategies

### 1. GPU Instance Management

#### Scale to Zero When Idle
```bash
# Scale down
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
  --desired-capacity 0

# Scale up when needed
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
  --desired-capacity 1
```

**Savings:** ~$726/month when scaled to zero

#### Use Spot Instances
- **Savings:** 50-70% vs On-Demand
- **Risk:** Can be interrupted with 2-minute warning
- **Best for:** Non-time-critical workloads, batch processing
- **Implementation:** Configure in Auto Scaling Group mixed instances policy

#### Reserved Instances
- **1-Year:** 40% savings
- **3-Year:** 60% savings
- **Best for:** Predictable 24/7 workloads
- **Break-even:** ~6-8 months for 1-year RI

#### Schedule-Based Auto-Scaling
```bash
# Scale up at 8 AM
aws autoscaling put-scheduled-action \
  --scheduled-action-name ScaleUpMorning \
  --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
  --recurrence "0 8 * * *" \
  --desired-capacity 1

# Scale down at 6 PM
aws autoscaling put-scheduled-action \
  --scheduled-action-name ScaleDownEvening \
  --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
  --recurrence "0 18 * * *" \
  --desired-capacity 0
```

**Savings:** ~$363/month (50% reduction for 12-hour operation)

### 2. S3 Cost Optimization

#### Lifecycle Policies (Already Configured)
- Videos auto-delete after 7 days
- Adjust retention period based on needs
- Consider Glacier for long-term archival

#### Intelligent Tiering
- Automatically moves objects between access tiers
- Best for unpredictable access patterns
- Saves 40-70% on infrequently accessed data

#### CloudFront for Video Delivery
- Reduce S3 data transfer costs
- CloudFront data transfer: $0.085/GB vs S3: $0.09/GB
- Caching reduces S3 GET requests
- Free tier: 1TB/month for 12 months

#### Requester Pays Buckets
- Customer pays for download costs
- Good for high-volume B2B scenarios

### 3. API Gateway Optimization

#### Caching
- Enable caching for GET /status endpoint
- Cache size: 0.5GB = $0.02/hour
- Reduces Lambda invocations and DynamoDB reads
- Best for frequently checked jobs

#### Request Throttling (Already Configured)
- Rate limit: 100 requests/second
- Burst limit: 200 requests
- Prevents cost overruns from DDoS or bugs

### 4. Lambda Optimization

#### Right-Size Memory
- Lambda CPU scales with memory
- Test optimal memory/duration trade-off
- Use AWS Lambda Power Tuning tool

#### Reduce Cold Starts
- Provisioned concurrency (costs extra)
- Keep functions warm with CloudWatch Events
- Only for critical hot path functions

#### Batch Processing
- Process multiple jobs per invocation
- Reduces number of Lambda invocations
- Better for Process Job function

### 5. DynamoDB Optimization

#### Time-to-Live (TTL) - Already Configured
- Automatically delete old job records
- Reduces storage costs
- Set ttl attribute when creating jobs

#### On-Demand vs Provisioned
- On-Demand: Good for variable workloads
- Provisioned: 50% cheaper for predictable loads
- Switch when traffic patterns stabilize

#### Optimize Indexes
- Global Secondary Index doubles write costs
- Only index fields that need querying
- Consider sparse indexes

### 6. Monitoring and Alerting

#### Set Up Billing Alarms
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name ai-video-billing-alarm \
  --alarm-description "Alert when charges exceed $300" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --threshold 300 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=Currency,Value=USD
```

#### Budget Alerts
- Set up AWS Budgets
- Get alerts at 80%, 90%, 100% of budget
- Forecast overage alerts
- Free tier: 2 budgets

#### Cost Explorer
- Enable in Billing Console
- Filter by tags: `Project=AI-Video-Generation`
- Identify cost trends
- Find optimization opportunities

### 7. Network Optimization

#### Use VPC Endpoints
- S3 VPC Endpoint: Free, avoids NAT Gateway costs
- DynamoDB VPC Endpoint: Free
- Lambda doesn't need NAT for AWS services

#### Avoid Cross-Region Traffic
- Keep all resources in same region
- Cross-region transfer: $0.02/GB

#### Compress Videos
- Use H.265/HEVC for 50% smaller files
- Reduces storage and transfer costs
- Trade-off: More CPU for encoding

---

## Monitoring and Alerts

### Cost Monitoring Dashboard

**Create CloudWatch Dashboard:**
1. GPU instance hours (ASG metrics)
2. API request count (API Gateway)
3. Lambda invocations (CloudWatch Metrics)
4. S3 storage size (CloudWatch Metrics)
5. DynamoDB read/write units

### Recommended Alarms

#### 1. GPU Instance Running Unexpectedly
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name gpu-instance-running-off-hours \
  --metric-name GroupDesiredCapacity \
  --namespace AWS/AutoScaling \
  --dimensions Name=AutoScalingGroupName,Value=AiVideo-dev-GpuInference-ASG \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 0.5 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching
```

#### 2. High API Request Rate
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name high-api-requests \
  --metric-name Count \
  --namespace AWS/ApiGateway \
  --dimensions Name=ApiName,Value=Video-Generation-API \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 10000 \
  --comparison-operator GreaterThanThreshold
```

#### 3. S3 Storage Growing Unexpectedly
- Monitor S3 bucket size metrics
- Alert if growth exceeds expected rate
- May indicate lifecycle policies not working

### Cost Allocation Tags

**Tag all resources with:**
- `Project: AI-Video-Generation`
- `Environment: dev/staging/prod`
- `CostCenter: Engineering`
- `Owner: team-name`

**Benefits:**
- Filter costs in Cost Explorer
- Allocate costs to departments
- Track cost by environment
- Identify resource owners

---

## FAQ

### Q: What's the cheapest way to run this in production?

**A:** For production on a budget:
1. Use Spot Instances (50-70% savings)
2. Scale GPU to zero during off-hours
3. Use CloudFront for video delivery
4. Enable all lifecycle policies
5. Right-size Lambda memory allocations

**Estimated cost:** $150-250/month for light production workload

### Q: Can I use a smaller instance than g5.xlarge?

**A:** The Wan2.2-T2V-A14B model requires:
- 24GB GPU memory (minimum)
- 16GB+ system memory
- CUDA 11.8+

**Options:**
- **g5.xlarge:** 1× A10G (24GB) - Recommended
- **g4dn.xlarge:** 1× T4 (16GB) - Too small for Wan2.2
- **g4dn.2xlarge:** 1× T4 (16GB) - Still too small

**Verdict:** g5.xlarge is the minimum viable instance

### Q: How much does each video generation cost?

**Breakdown (assuming g5.xlarge on-demand):**

| Component | Cost per Video |
|-----------|----------------|
| GPU time (5 min) | $0.084 |
| Lambda invocations | $0.0005 |
| DynamoDB operations | $0.00001 |
| S3 storage (7 days) | $0.0005 |
| API Gateway | $0.000003 |
| **Total** | **~$0.085/video** |

**With Spot Instances:** ~$0.025/video (70% savings)

### Q: What happens if I exceed my budget?

**Options:**
1. **Set up Service Control Policies** to deny instance launches
2. **Lambda rate limiting** to prevent excessive job submissions
3. **API Gateway throttling** (already configured)
4. **Auto-scaling limits** to cap max instances
5. **Billing alerts** to notify before limits hit

### Q: How do I estimate my monthly costs?

**Formula:**
```
Total Cost = (GPU_hours × $1.006) + 
             (API_requests ÷ 1M × $3.50) +
             (Lambda_invocations ÷ 1M × $0.20) +
             (DynamoDB_WCU × $1.25 + DynamoDB_RCU × $0.25) +
             (S3_storage_GB × $0.023) +
             (Data_transfer_GB × $0.09) +
             $20 (fixed overhead)
```

**Online Calculator:**
Use AWS Pricing Calculator: https://calculator.aws/

### Q: Is there a free tier?

**Yes, for these services:**
- Lambda: 1M requests + 400K GB-seconds/month
- API Gateway: 1M requests for 12 months (new accounts)
- DynamoDB: 25 GB storage + 25 WCU + 25 RCU
- S3: 5GB storage for 12 months (new accounts)
- CloudWatch: 10 custom metrics + 10 alarms

**BUT:** EC2 g5.xlarge has NO free tier

### Q: Can I run this on AWS Free Tier?

**No.** GPU instances are not included in free tier. Minimum cost is ~$40/month for minimal GPU usage plus serverless components.

### Q: What's the most expensive part?

**Answer:** GPU instances (g5.xlarge)
- 24/7: $726/month (85% of total cost)
- Even 4 hrs/day: $121/month (75% of total cost)

**Cost reduction priority:**
1. Optimize GPU usage (biggest impact)
2. Use Spot Instances
3. Enable lifecycle policies
4. Monitor data transfer

### Q: How do Spot Instances work?

**Spot Instances:**
- Bid on unused EC2 capacity
- Save 50-70% vs On-Demand
- AWS can reclaim with 2-minute warning
- Interruption rate varies (typically <5%)

**Best practices:**
- Use for batch workloads
- Implement graceful shutdown
- Checkpoint long-running jobs
- Use multiple instance types

**Our implementation:**
- Modify Auto Scaling Group to use Spot
- Set max price to on-demand price
- Use instance weighting

### Q: Should I use Reserved Instances?

**Use Reserved Instances if:**
- Running 24/7 for 1-3 years
- Predictable, steady workload
- Can commit to specific instance type

**ROI Calculator:**
- 1-Year RI break-even: ~6 months
- 3-Year RI break-even: ~8 months

**Example:**
- On-Demand: $726/month
- 1-Year RI: $436/month (saves $290/month)
- 3-Year RI: $291/month (saves $435/month)

---

## Additional Resources

### AWS Cost Tools
- [AWS Pricing Calculator](https://calculator.aws/)
- [AWS Cost Explorer](https://console.aws.amazon.com/cost-management/home)
- [AWS Budgets](https://console.aws.amazon.com/billing/home#/budgets)
- [AWS Compute Optimizer](https://console.aws.amazon.com/compute-optimizer/)

### Cost Optimization Guides
- [AWS Well-Architected Framework - Cost Optimization](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/)
- [AWS Cost Optimization Best Practices](https://aws.amazon.com/pricing/cost-optimization/)
- [EC2 Spot Instance Best Practices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-best-practices.html)

### Monitoring Tools
- [CloudWatch Cost Anomaly Detection](https://aws.amazon.com/aws-cost-management/aws-cost-anomaly-detection/)
- [Trusted Advisor](https://console.aws.amazon.com/trustedadvisor/)
- [AWS Cost and Usage Reports](https://docs.aws.amazon.com/cur/latest/userguide/what-is-cur.html)

---

**Last Updated:** 2025-12-23  
**Region:** us-east-1  
**Currency:** USD

> Prices are subject to change. Always verify current pricing at https://aws.amazon.com/pricing/
