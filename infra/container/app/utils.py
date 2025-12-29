"""
Utility functions for S3 upload, file cleanup, and other helpers.
"""
import os
from typing import Optional
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from loguru import logger


def upload_to_s3(
    file_path: str,
    bucket_name: str,
    s3_key: str,
    aws_region: Optional[str] = None
) -> str:
    """
    Upload a file to S3 bucket.

    Args:
        file_path: Local path to file to upload
        bucket_name: S3 bucket name
        s3_key: S3 object key (path within bucket)
        aws_region: AWS region (optional, uses default from credentials)

    Returns:
        S3 URL of uploaded file

    Raises:
        Exception if upload fails
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        # Initialize S3 client
        if aws_region:
            s3_client = boto3.client('s3', region_name=aws_region)
        else:
            s3_client = boto3.client('s3')

        logger.info(f"Uploading {file_path} to s3://{bucket_name}/{s3_key}")

        # Upload file
        extra_args = {
            'ContentType': 'video/mp4',
            'ContentDisposition': 'inline'
        }

        s3_client.upload_file(
            file_path,
            bucket_name,
            s3_key,
            ExtraArgs=extra_args
        )

        # Generate URL
        s3_url = f"s3://{bucket_name}/{s3_key}"
        logger.info(f"Upload successful: {s3_url}")

        return s3_url

    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', str(e))

        logger.error(f"S3 upload failed - Code: {error_code}, Message: {error_message}")
        raise Exception(f"S3 upload failed: {error_message}")

    except Exception as e:
        logger.error(f"S3 upload error: {str(e)}")
        raise


def cleanup_temp_file(file_path: str):
    """
    Clean up temporary file.

    Args:
        file_path: Path to file to delete
    """
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup file {file_path}: {str(e)}")


def ensure_dir(directory: str):
    """
    Ensure directory exists, create if not.

    Args:
        directory: Directory path
    """
    Path(directory).mkdir(parents=True, exist_ok=True)


def get_file_size_mb(file_path: str) -> float:
    """
    Get file size in megabytes.

    Args:
        file_path: Path to file

    Returns:
        File size in MB
    """
    if not os.path.exists(file_path):
        return 0.0

    size_bytes = os.path.getsize(file_path)
    return size_bytes / (1024 * 1024)


def validate_s3_bucket(bucket_name: str) -> bool:
    """
    Validate that S3 bucket exists and is accessible.

    Args:
        bucket_name: S3 bucket name

    Returns:
        True if bucket is accessible, False otherwise
    """
    try:
        s3_client = boto3.client('s3')
        s3_client.head_bucket(Bucket=bucket_name)
        return True
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        logger.error(f"S3 bucket validation failed - Bucket: {bucket_name}, Error: {error_code}")
        return False
    except Exception as e:
        logger.error(f"S3 bucket validation error: {str(e)}")
        return False
