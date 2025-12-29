# H100 Upgrade Plan (g5.48xlarge → p5.4xlarge)

**Created:** 2025-12-29  
**Owner:** Infra / GPU Team  
**Status:** Draft plan – approved to execute

---

## 1. Summary
- **Goal:** Replace the current g5.48xlarge (4× A10G) inference host with a single **p5.4xlarge** (1× H100 80 GB) to improve single-GPU performance and simplify utilization.
- **Why:** Our pipeline currently binds to one GPU, so we are paying ~$16.29/hr for underutilized hardware. A single H100 offers significantly more throughput per card at a comparable hourly rate (~$13–14/hr on-demand) and removes the need to parallelize across four A10Gs.
- **Scope:** Update CDK stack, container dependencies (CUDA 12.x/Hopper), and documentation to adopt p5.4xlarge in `us-east-1`.

---

## 2. Instance Comparison

| Property | **Current** g5.48xlarge | **Target** p5.4xlarge |
|----------|-------------------------|-----------------------|
| GPU(s) | 4 × NVIDIA A10G (24 GB each, 96 GB total) | 1 × NVIDIA H100 80 GB |
| GPU Arch | Ampere (A10G) | Hopper (H100) |
| vCPUs | 192 | 16 |
| RAM | 768 GiB | 256 GiB |
| Local Storage | 200 GB gp3 EBS (root) | 3.8 TB NVMe instance store + EBS |
| Network | Up to 100 Gbps | 100 Gbps (ENA/EFA) |
| On-Demand Cost | ~$16.29/hr | ~$13–14/hr |
| Spot Availability | Limited, high interruption | Limited, high interruption |
| Utilization Fit | Pipeline only uses one GPU ⇒ wasted capacity | Perfect fit (single-GPU workload) |

---

## 3. Benefits of p5.4xlarge
1. **Higher single-GPU performance:** H100 delivers >2× throughput vs A10G for diffusion/video synthesis workloads.
2. **Cost alignment:** Pay for exactly one GPU, lowering idle burn without needing multi-GPU orchestration.
3. **Larger VRAM per card:** 80 GB vs 24 GB eliminates current VRAM ceiling pains and enables higher resolutions/durations.
4. **Future-proofing:** Hopper instructions (FP8, Transformer Engine) keep us aligned with next-gen model requirements.

---

## 4. Required Changes
1. **CDK Stack (`infra/lib/gpu-inference-stack.ts`):**
   - Update `InstanceType` to `ec2.InstanceType.of(ec2.InstanceClass.P5, ec2.InstanceSize.XLARGE4)`.
   - Adjust block device mappings (p5.4xlarge includes NVMe; ensure root EBS sizing still sufficient).
   - Review ASG limits (still min 0 / max 1).

2. **AMI & Drivers:**
   - Use the **Amazon Linux 2023 HVM GPU AMI** or latest ECS-optimized GPU AMI that supports CUDA 12.x/Hopper drivers.
   - Validate NVIDIA driver + CUDA toolkit compatibility with H100 (minimum CUDA 12.0).

3. **Container / Requirements:**
   - Rebuild inference image with CUDA 12 runtime + matching PyTorch/cuDNN.
   - Ensure `torch==2.4+cu12x` binaries are installed and tested on Hopper.

4. **Scripts:**
   - Update `start-gpu.sh`, `gpu-status.sh`, and related scripts to reference new instance type (optional but keeps logs accurate).

5. **Monitoring / Docs:**
   - Refresh `infra/GPU-STATUS.md`, `docs/COST-NOTES.md`, and new H100 doc with latest costs + instructions.

---

## 5. Migration Plan
1. **Prep (Local):**
   - Update CDK stack & scripts.
   - Build and push new Docker image with CUDA 12.x support to ECR (`video-inference:hopper`).

2. **Deploy:**
   - `cd infra && npm run build && npx cdk deploy AiVideo-dev-GpuInference --require-approval never`.
   - Confirm CloudFormation replaces ASG and Launch Template.

3. **Bring Up H100 Node:**
   - `./scripts/start-gpu.sh` → verify ASG launches `p5.4xlarge`.
   - Use `./scripts/gpu-status.sh` to capture new instance ID/IP.

4. **Validation:**
   - SSM into instance, run `nvidia-smi` (should show 1× H100 80GB).
   - `docker logs -f video-inference` to ensure container boots with Hopper drivers.
   - Execute `./scripts/test-native-inference.sh` and confirm no CUDA warnings.
   - Record GPU memory logs (expect ~80GB total).

5. **Cleanup:**
   - Stop GPU when idle (`./scripts/stop-gpu.sh`).
   - Update status docs + announce change in Slack.

---

## 6. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| CUDA/toolchain incompatibility | Container fails to boot | Pre-test container locally using NVIDIA Container Toolkit + H100 (or AWS DLAMI). |
| Limited p5.4xlarge capacity | Launch failures | Keep g5.48xlarge launch template as fallback; enable multi-instance policy temporarily. |
| Cost surprises | Higher than expected | Monitor CloudWatch billing alarms; keep ASG at min 0 and stop instances when idle. |
| Model assumptions | Pipeline may still default to GPU 0 but now only one GPU exists | No change needed; verify logging reflects 80 GB total VRAM. |

---

## 7. Follow-Up Tasks
- [ ] Update `infra/GPU-STATUS.md` once migration completes.
- [ ] Refresh `docs/COST-NOTES.md` with new pricing snapshot.
- [ ] Consider enabling Spot capacity for p5.4xlarge (if acceptable risk).
- [ ] Benchmark inference latency vs g5.48xlarge to quantify gains.

---

**Next Action:** implement CDK + container updates, then execute migration steps above.
