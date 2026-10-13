# AWS cloud migration: Pulse HMS

## Chosen strategy: phased strangler migration to ECS Express Mode

The current React frontend and Node API are not switched off in one step. Django and PostgreSQL are built, tested, and deployed alongside the working system. Each frontend capability moves only when its Django replacement has passed tests and user acceptance checks. The Node API remains an immediate rollback target until the cutover is complete.

The original App Runner proposal is superseded: AWS has closed App Runner to new customers and recommends **Amazon ECS Express Mode** as the low-operations successor. ECS Express deploys the Django Docker image to Fargate and provisions an Application Load Balancer and scaling infrastructure.

## Target architecture

```text
React/Vite static build -> CloudFront + S3 (HTTPS)
                               |
                               v
                   ECS Express Mode (Django on Fargate/ALB)
                         |              |
                         |              +--> private S3 clinical attachments
                         v
                    RDS PostgreSQL (private)
```

ECS tasks connect to private RDS through private subnets and security groups. Secrets are supplied from AWS Secrets Manager or Parameter Store; no production credentials are committed to this repository. Clinical attachments are private S3 objects and are accessed only through authenticated API-issued, short-lived URLs.

## Why this strategy

- It avoids the risk of a big-bang rewrite of a healthcare workflow system.
- RDS PostgreSQL provides managed backups, patching, point-in-time recovery, encryption, and a production-compatible version of the local database.
- ECS Express Mode is AWS's supported low-operations deployment path for new customers while still deploying the Django Docker image in this repository.
- S3 is durable and suitable for uploads; container disk is not.
- CloudFront serves the React application efficiently and separates static delivery from healthcare data processing.

## Ordered migration and deployment plan

1. **Finish Django feature parity locally.** Keep the Node API as the frontend default while each Django endpoint receives tests.
2. **Prepare data.** Export the old TiDB/MySQL data, profile it, map valid records to the Django model schema, and rehearse a one-way import into a disposable PostgreSQL database. Do not directly run the legacy SQL schema against PostgreSQL.
3. **Create AWS foundations manually.** Create a non-production AWS account/project, configure a budget alert, choose the deployment region, and create a VPC with private RDS subnets.
4. **Provision RDS PostgreSQL.** Use PostgreSQL 17, encryption at rest, automated backups, deletion protection, and a private security group allowing only the ECS task security group. Store the DB password in Secrets Manager.
5. **Create private S3 buckets.** Create one bucket for clinical files and one for the frontend build. Enable versioning, default encryption, block all public access on the clinical bucket, and configure CORS only for the frontend domain.
6. **Deploy Django.** Build the provided `django-backend/Dockerfile`, push it to Amazon ECR, create an ECS Express Mode service from that image, use private workload subnets, configure the health check as `/api/health/`, and inject secrets from Secrets Manager or Parameter Store.
7. **Run migrations once.** Run `python manage.py migrate` as a controlled release task with the same network and secrets before directing user traffic to the new API. Do not let multiple scaling instances race to migrate.
8. **Deploy the React build.** Keep `VITE_API_BASE_URL` on Node initially, build the frontend, upload `hospital-frontend/dist` to the frontend S3 bucket, and connect CloudFront. Change individual frontend capabilities to Django only after their acceptance tests pass.
9. **Cut over incrementally.** Route one tested feature at a time (authentication, appointments, records/prescriptions, billing). Verify audit records, permissions, and error rate after each step.
10. **Retire safely.** After a defined rollback window and database/data validation, disable writes on the Node API, take a final backup, then remove it.

## Required production secrets

- `DJANGO_SECRET_KEY`
- PostgreSQL database name, user, password, host, and port
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`
- `AWS_STORAGE_BUCKET_NAME` and `AWS_S3_REGION_NAME`
- Production email-provider credentials when replacing Django's local console backend

## Not production-ready yet

The Django API now replaces EmailJS-style OTP flows and clinical attachments. AI-assisted routing and Razorpay are deliberately deferred: leave `GEMINI_API_KEY` and all `RAZORPAY_*` variables unset. The React application is still configured for the Node API, so it must not be repointed until its API client and remaining real-time Socket.IO behavior have been migrated and acceptance-tested.
