from __future__ import annotations

from typing import Optional, Tuple

import boto3

from .config import settings


class ObjectStorage:
    def __init__(self) -> None:
        self.enabled = settings.r2_enabled
        self.bucket = settings.R2_BUCKET
        self.client = None

        if not self.enabled:
            return

        self.client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name=settings.R2_REGION or "auto",
        )

    def upload_bytes(self, key: str, content: bytes, content_type: Optional[str] = None) -> None:
        if not self.enabled or self.client is None:
            return
        kwargs = {"Bucket": self.bucket, "Key": key, "Body": content}
        if content_type:
            kwargs["ContentType"] = content_type
        self.client.put_object(**kwargs)

    def get_bytes(self, key: str) -> Optional[Tuple[bytes, Optional[str]]]:
        if not self.enabled or self.client is None:
            return None
        try:
            obj = self.client.get_object(Bucket=self.bucket, Key=key)
        except Exception:
            return None
        body = obj.get("Body")
        data = body.read() if body else b""
        return data, obj.get("ContentType")

    def delete_object(self, key: str) -> None:
        if not self.enabled or self.client is None:
            return
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            # Deleting a missing object should not break user flow.
            return


object_storage = ObjectStorage()
