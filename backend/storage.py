import os
import shutil

_S3_BUCKET = os.getenv("S3_BUCKET")
_BASE_URL = os.getenv("BASE_URL", "http://localhost:9000")

_s3 = None
_AWS_REGION = "us-east-1"

if _S3_BUCKET:
    import boto3
    _AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    _s3 = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=_AWS_REGION,
    )


def save_file(file_obj, filename: str, content_type: str = "application/octet-stream") -> str:
    if _s3 and _S3_BUCKET:
        _s3.upload_fileobj(
            file_obj, _S3_BUCKET, filename,
            ExtraArgs={"ContentType": content_type},
        )
        return f"https://{_S3_BUCKET}.s3.{_AWS_REGION}.amazonaws.com/{filename}"
    dest = f"uploads/{filename}"
    with open(dest, "wb") as buf:
        shutil.copyfileobj(file_obj, buf)
    return f"{_BASE_URL}/{dest}"


def delete_file(url: str) -> None:
    if not url:
        return
    if _s3 and _S3_BUCKET:
        key = url.split("amazonaws.com/", 1)[-1]
        _s3.delete_object(Bucket=_S3_BUCKET, Key=key)
    else:
        path = url.replace(f"{_BASE_URL}/", "", 1)
        if os.path.isfile(path):
            os.remove(path)
