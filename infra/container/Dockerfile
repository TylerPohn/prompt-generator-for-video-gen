# Multi-stage Dockerfile for HunyuanVideo-1.5 inference server
FROM nvidia/cuda:12.1.0-devel-ubuntu22.04 AS builder

# Build stage for bitsandbytes (needs CUDA dev tools)
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3.10-dev \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1
RUN python -m pip install --upgrade pip

# Pre-compile bitsandbytes with CUDA support
RUN pip install bitsandbytes>=0.42.0

# Runtime stage
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/hf_cache \
    TRANSFORMERS_CACHE=/app/hf_cache \
    TORCH_HOME=/app/torch_cache \
    GGUF_MODEL_PATH=/app/models/hunyuan-video-t2v-720p-Q4_0.gguf \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:512 \
    CUDA_LAUNCH_BLOCKING=0 \
    PYTORCH_NO_CUDA_MEMORY_CACHING=0

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3.10-dev \
    python3-pip \
    git \
    wget \
    curl \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
    && rm -rf /var/lib/apt/lists/*

# Set python3.10 as default python
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Upgrade pip
RUN python -m pip install --upgrade pip setuptools wheel

# Create app directory
WORKDIR /app

# Install PyTorch with CUDA 12.1 support
RUN pip install --no-cache-dir \
    torch==2.4.0 \
    torchvision==0.19.0 \
    torchaudio==2.4.0 \
    --extra-index-url https://download.pytorch.org/whl/cu121

# Copy pre-built bitsandbytes from builder
COPY --from=builder /usr/local/lib/python3.10/dist-packages/bitsandbytes /usr/local/lib/python3.10/dist-packages/bitsandbytes

# Copy requirements first for better caching
COPY requirements.txt .

# Install remaining Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create cache directories
RUN mkdir -p /app/hf_cache /app/torch_cache /app/tmp_videos /app/logs /app/models

# GGUF Q4 quantized model (~7GB) will be downloaded at runtime
# This is the transformer model quantized with GGUF Q4 for good quality with lower memory
# Source: https://huggingface.co/city96/HunyuanVideo-gguf
# Using Q4 instead of Q8 to fit in 24GB GPU alongside VAE and text encoders
# The model is too large to include in the Docker image during build.
# It will be downloaded on first startup to the /app/models directory,
# which should be mounted as a persistent volume on the GPU instance.
# Model file: hunyuan-video-t2v-720p-Q4_0.gguf (note: uppercase Q4_0)

# Copy application code
COPY app/ ./app/

# Copy test script for dependency verification
COPY test_deps.py .

# Create non-root user for security
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app && \
    chmod -R 755 /app/models

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check - increased start period for larger model
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
