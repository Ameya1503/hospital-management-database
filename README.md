# Pulse HMS

Pulse HMS is a role-based Hospital Management System for appointments, clinical records, prescriptions, pharmacy inventory, billing, and operational administration.

The active implementation uses a **React/Vite frontend**, a **Django REST Framework API**, and **PostgreSQL**. The Django API and PostgreSQL database are deployed on Render for the project demonstration. The React frontend can run locally and call the deployed API.

## Current architecture

```text
React + Vite frontend (local browser)
              |
              | HTTPS REST requests with DRF token authentication
              v
Render Django / Gunicorn web service
              |
              | managed internal PostgreSQL connection
              v
Render PostgreSQL database
```

The frontend is a React 19 application. Django owns authentication, authorization, validation, business rules, persistence, and audit events. PostgreSQL stores the hospital data.

## Cloud deployment status

| Component | Current status |
| --- | --- |
| React frontend | Runs locally with Vite and targets the Django API through `VITE_API_BASE_URL` |
| Django REST API | Deployed to Render |
| PostgreSQL | Managed Render database |
| Django Admin | Available at `/admin/` for authorised administrators |
| API health check | Available at `/api/health/` |
| AI triage | Optional and disabled until a Gemini key is configured |
| Razorpay | Optional and disabled until provider credentials are configured |
| Clinical object storage | Deferred for the demo; production should use private S3 storage |
| Socket.IO live updates | Legacy Node capability; not part of the Django cloud path |

Current deployed API:

```text
https://pulse-hms-django-api.onrender.com
```

Render free services can sleep after inactivity. The first request after a sleep may take roughly a minute.

## Features

- Role-based access for administrators, receptionists, doctors, patients, nurses, and pharmacists
- Email/password login using Django REST Framework tokens
- Patient registration and password-reset flows using one-time codes
- Department, doctor, patient, appointment, medical-record, medicine, and bill management
- Patient-specific appointment, record, and bill isolation
- Doctor-specific analytics and prescription workflow
- Prescription workflow with transactional stock deduction and bill generation
- Medicine inventory and stock movement records
- Django Admin for authorised data management
- Audit events for sensitive workflows
- Optional private clinical attachment access controls

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS, Lucide React |
| API | Python, Django 5.2, Django REST Framework |
| Database | PostgreSQL with `psycopg` |
| Application server | Gunicorn |
| Static files | WhiteNoise |
| Demo cloud platform | Render Web Service and Render PostgreSQL |
| Production cloud target | AWS ECS/Fargate, RDS PostgreSQL, private S3, CloudFront |

## Repository layout

```text
django-backend/       Django API, models, migrations, tests, settings
hospital-frontend/    React/Vite user interface and Django API adapter
hospital-api/         Legacy Node/Express implementation retained as migration reference
docs/                 Render deployment notes and AWS production runbook
render.yaml           Render Blueprint for the API and PostgreSQL database
```

`hospital-api/` is not the active cloud backend. Do not deploy it together with the Django API.

## Local setup

### Prerequisites

- Python 3.12 or later
- Node.js 20 or later
- PostgreSQL 17 or a compatible PostgreSQL server
- Git

### 1. Configure Django

Create `django-backend/.env` from `django-backend/.env.example`. Keep secrets out of Git.

Required local settings include:

```env
DJANGO_SECRET_KEY=use-a-long-local-development-secret
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
POSTGRES_DB=pulse_hms
POSTGRES_USER=pulse_hms_app
POSTGRES_PASSWORD=your-local-password
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
```

Create and activate a virtual environment, install dependencies, then migrate:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r .\django-backend\requirements.txt
python .\django-backend\manage.py migrate
python .\django-backend\manage.py createsuperuser
python .\django-backend\manage.py runserver
```

The local API is available at `http://127.0.0.1:8000/api/health/`.

### 2. Configure React

Create `hospital-frontend/.env`:

```env
# Local Django API
VITE_API_BASE_URL=http://127.0.0.1:8000/api

# Or the deployed Render API
# VITE_API_BASE_URL=https://pulse-hms-django-api.onrender.com/api
```

Start the frontend:

```powershell
cd hospital-frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## API entry points

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health/` | Public service health check |
| `POST /api/auth/login/` | Returns a DRF token and user role |
| `/api/appointments/` | Appointment workflow |
| `/api/doctors/` | Doctor profiles |
| `/api/patients/` | Patient profiles with role-based visibility |
| `/api/records/` | Medical records and prescriptions |
| `/api/medicines/` | Pharmacy inventory |
| `/api/bills/` | Billing workflow |
| `/api/prescriptions/` | Doctor-only prescription and stock workflow |
| `/admin/` | Django administration interface |

Protected endpoints require the header:

```text
Authorization: Token <token>
```

## Security controls

- Django password hashing and password validators
- Token authentication for protected API routes
- Role-Based Access Control (RBAC)
- Patient, doctor, receptionist, and admin data-access boundaries
- Django ORM and serializers to avoid string-built SQL queries
- Input validation through Django REST Framework serializers
- Transactional prescription, stock, and bill updates
- Unique doctor appointment-slot constraint
- CORS restricted to local frontend origins for the demo
- HTTPS through Render for the deployed API
- Audit logging for selected sensitive workflows

This is an academic/demo deployment. It is not a certified HIPAA-compliant production system. A production release requires private object storage, centralised logging, secret rotation, backups, monitoring, formal threat modelling, and compliance review.

## Testing

The project includes 16 API tests covering login, role permissions, OTP registration, password reset, appointment isolation, doctor analytics isolation, medical attachments, prescription transactions, stock rollback, payment webhook checks, and optional AI fallback behavior.

Run them from the repository root:

```powershell
python .\django-backend\manage.py test api --verbosity 2
```

## Render deployment

`render.yaml` provisions:

- `pulse-hms-django-api`: Django web service
- `pulse-hms-db`: PostgreSQL database

Deploy from GitHub using **New > Blueprint** in Render and select the repository branch containing `render.yaml`.

For this free demo, Django migrations run at service startup. This is acceptable for a single-instance demonstration service. A production deployment should run migrations as a controlled release job before scaling web containers.

Never commit `.env`, database URLs, access tokens, private media, or local virtual environments.

## AWS production target

The planned production architecture is:

```text
React static build -> CloudFront + private S3 origin
                         |
                         v
               Application Load Balancer
                         |
                         v
          ECS Fargate Django containers in private subnets
                         |
                         v
             RDS PostgreSQL in private subnets
```

This is a public/private tiered architecture within an AWS VPC. Public traffic reaches the load balancer; application containers and RDS remain private. Secrets belong in AWS Secrets Manager, and clinical files belong in private S3 with authenticated short-lived access.

Read [AWS cloud migration](docs/aws-cloud-migration.md) and the [AWS deployment runbook](docs/ecs-cloud-runbook.md) before a production cutover.

## Important limitations

- Render free services are suitable only for a short demonstration.
- Configure a real email service before relying on registration or password-reset messages.
- Configure private S3-compatible storage before accepting clinical attachments in production.
- Keep `GEMINI_API_KEY` and `RAZORPAY_*` unset until those integrations are intentionally enabled and tested.
- Rotate any token or database credential that has been exposed.
