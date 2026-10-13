# Pulse HMS AWS deployment runbook

This runbook is the execution companion to `aws-cloud-migration.md`. It intentionally excludes Gemini and Razorpay. Do not begin a production cutover until every numbered checkpoint is complete.

## 1. Manual account prerequisites

The AWS account owner must do these items in the AWS Console:

1. Enable MFA for the root account; do not use root for deployment.
2. Create a least-privilege operator identity or IAM Identity Center permission set for ECS, ECR, RDS, S3, CloudFront, VPC, IAM, Secrets Manager, CloudWatch, and AWS Budgets.
3. Create a monthly AWS Budget with alerts at 50%, 80%, and 100%.
4. Select one region. Use `ap-south-1` for India unless there is a documented reason not to.

Stop here if these cannot be completed; deployment credentials must never be shared in this repository or chat.

## 2. Network and database

1. Create a VPC spanning at least two Availability Zones.
2. Create private subnets for RDS and ECS tasks. RDS must have `Publicly accessible = No`.
3. Create `pulse-hms-ecs` and `pulse-hms-rds` security groups.
4. Give `pulse-hms-rds` one inbound rule: TCP `5432`, source `pulse-hms-ecs`. Do not use `0.0.0.0/0`.
5. Create RDS PostgreSQL 17 with storage encryption, automated backups, deletion protection, and a DB subnet group made only from the private subnets.
6. Create the database and the `pulse_hms_app` application role. Save the endpoint and credentials only in Secrets Manager.

## 3. Secrets and S3

Create these Secrets Manager values before creating the service:

- `DJANGO_SECRET_KEY`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`
- `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME`

Create two versioned S3 buckets:

- `pulse-hms-clinical-<unique-suffix>`: block all public access and enable default encryption.
- `pulse-hms-web-<unique-suffix>`: keep its origin private and expose it only through CloudFront Origin Access Control.

## 4. Container release

From the repository root, after authenticating Docker to the account ECR registry, build and push an immutable versioned image. Do not use a production secret during a Docker build; the existing Dockerfile uses only build-safe placeholder settings for static collection.

```powershell
docker build -t pulse-hms-django:release-1 .\django-backend
docker tag pulse-hms-django:release-1 <account>.dkr.ecr.<region>.amazonaws.com/pulse-hms-django:release-1
docker push <account>.dkr.ecr.<region>.amazonaws.com/pulse-hms-django:release-1
```

Create an ECS Express Mode service from this ECR image with port `8000`, 1 vCPU, 2 GB memory, HTTP health path `/api/health/`, and initial task range `1–2`. Attach the private workload networking and a task role that can read only the named secrets and clinical bucket.

## 5. One-time migration and verification

Run `python manage.py migrate --noinput` through a one-off ECS task or VPC-connected CI job using the same image, networking, and secrets. Never put `migrate` in the web-container startup command: concurrent tasks can race.

Before any real user traffic, verify:

1. `GET /api/health/` returns `200`.
2. Django Admin works over HTTPS.
3. RDS has no public access and only permits the ECS security group.
4. A doctor upload, authorized download, and unauthorized download denial all behave correctly.
5. CloudWatch shows no startup, database, or permission errors.

## 6. React and cutover

Deploy a React production build to the web bucket, create a CloudFront distribution, and validate the existing Node-backed version first. Keep `VITE_API_BASE_URL` on Node until the feature-flagged Django client passes acceptance tests. Move login/read-only data, appointments, records, inventory, and billing separately. Keep Node live for at least 48 hours after the last Django write cutover.

## Rollback

If a migrated feature fails, change that frontend capability back to Node, preserve the audit and CloudWatch evidence, and investigate before retrying. Do not roll back by restoring partial database data or by deleting the RDS instance.
