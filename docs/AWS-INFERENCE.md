
## META-PROMPT: AWS CDK Video Gen Infra (Wan2.2-T2V-A14B)

> Role:
> 
> 
> You are a senior cloud infrastructure engineer and ML platform engineer.
> 
> **Context:**
> 
> I have an existing AWS project that already makes API calls. I want to add GPU-backed video generation using the **Wan2.2-T2V-A14B** open-source text-to-video model.
> 
> I do **not** want fine-tuning — inference only.
> 
> **Hard requirements:**
> 
> - Use **AWS CDK (TypeScript)**
> - Assume AWS credentials are loaded from a `.env` file locally (do NOT hardcode creds)
> - Deploy into an **existing AWS account and VPC**
> - Expose inference via a **REST API**
> - API must accept a text prompt and return a job ID, then allow polling or callback for the video URL
> - Use **GPU instances** suitable for inference (A10G preferred)
> 
> ---
> 
> ## Architecture to Implement
> 
> ### Compute
> 
> - Use **EC2 g5.xlarge or g5.2xlarge** for inference
> - Run Wan2.2-T2V-A14B inside a **Docker container**
> - Container loads the model at startup and keeps it warm
> 
> ### API Layer
> 
> - **API Gateway** (REST)
> - Endpoints:
>     - `POST /generate` → accepts `{ prompt: string, seed?, steps?, duration? }`
>     - `GET /status/{jobId}`
> - API forwards requests to the GPU instance via:
>     - ALB **OR**
>     - SQS + worker (preferred if you think async is better)
> 
> ### Storage
> 
> - Output videos saved to **S3**
> - API returns a **presigned S3 URL**
> 
> ### Networking & Security
> 
> - Private GPU instance
> - Public API Gateway
> - IAM roles:
>     - EC2 can read model weights + write to S3
>     - API Gateway can invoke backend
> 
> ---
> 
> ## CDK Expectations
> 
> - Add CDK stacks **without breaking the existing project**
> - Use `dotenv` to load environment variables
> - Clean separation:
>     - `VideoApiStack`
>     - `GpuInferenceStack`
> - Include:
>     - Security Groups
>     - IAM roles
>     - S3 bucket
>     - API Gateway
>     - EC2 launch template or autoscaling group (size = 1)
> 
> ---
> 
> ## Container Expectations
> 
> - Dockerfile installs:
>     - PyTorch
>     - Diffusers
>     - Wan2.2-T2V-A14B weights
> - Exposes an internal HTTP server (FastAPI preferred)
> - `/generate` endpoint runs inference and uploads MP4 to S3
> 
> ---
> 
> ## Deliverables
> 
> 1. CDK stack code (TypeScript)
> 2. Dockerfile for the GPU container
> 3. FastAPI inference server example
> 4. Example curl request to the public API
> 5. Notes on cost control and safe shutdown
> 
> **Constraints:**
> 
> - No fine-tuning
> - No third-party SaaS
> - Assume Linux AMI
> - Assume this is for production, not a demo
> 
> **Output the solution with clear file boundaries and explanations.**
>