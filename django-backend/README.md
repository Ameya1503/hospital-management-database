# Pulse HMS Django backend

This is the new Django + Django REST Framework backend. It replaces the Node API incrementally; the React frontend remains in `../hospital-frontend`.

## One-time local setup

1. Install PostgreSQL 17 with the official installer. In PowerShell, run `winget install --id PostgreSQL.PostgreSQL.17 -e`. During setup, choose and retain a strong password for the `postgres` administrator account, keep port `5432`, and install pgAdmin if you want a GUI.
2. Create a database and least-privilege application role:

```sql
CREATE ROLE pulse_hms_app LOGIN PASSWORD 'choose-a-new-local-password';
CREATE DATABASE pulse_hms OWNER pulse_hms_app;
```

3. Copy `.env.example` to `.env` and set the same database password plus a long random `DJANGO_SECRET_KEY`.
4. From the repository root, run:

```powershell
.\.venv\Scripts\python.exe django-backend\manage.py migrate
.\.venv\Scripts\python.exe django-backend\manage.py createsuperuser
.\.venv\Scripts\python.exe django-backend\manage.py runserver
```

The API health endpoint is `http://127.0.0.1:8000/api/health/`; Django Admin is at `/admin/`.

## Phase 2 configuration

- Payments and AI routing are intentionally deferred for the cloud migration. Leave every `RAZORPAY_*` and `GEMINI_*` setting unset.
- Without `GEMINI_API_KEY`, `/api/triage/` selects an existing doctor safely and labels the response as a fallback; it is appointment routing, not diagnosis.

## Important

- PostgreSQL is the default and only intended persistent database.
- `DJANGO_USE_EPHEMERAL_SQLITE=true` exists solely for local schema validation before PostgreSQL is installed. It never stores data.
- Do not import the old MySQL/TiDB schema directly. The Django migrations are the new authoritative schema.
