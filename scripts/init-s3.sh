#!/usr/bin/env bash
set -euo pipefail

BUCKET="${S3_BUCKET:-evidencias}"

echo "Inicializando bucket S3 '${BUCKET}' en LocalStack..."

awslocal s3 mb "s3://${BUCKET}" || true

awslocal s3api put-bucket-cors \
  --bucket "${BUCKET}" \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": ["http://localhost:3000", "http://localhost:5173"],
        "AllowedMethods": ["GET", "PUT", "HEAD"],
        "AllowedHeaders": ["*"]
      }
    ]
  }'

awslocal s3api put-bucket-policy \
  --bucket "${BUCKET}" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"PublicReadGetObject\",
        \"Effect\": \"Allow\",
        \"Principal\": \"*\",
        \"Action\": \"s3:GetObject\",
        \"Resource\": \"arn:aws:s3:::${BUCKET}/*\"
      }
    ]
  }"

echo "Bucket '${BUCKET}' configurado con CORS y política de lectura pública."
