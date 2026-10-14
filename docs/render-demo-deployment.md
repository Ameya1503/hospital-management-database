# Free demo deployment: Render

This is the zero-cost demonstration path. It deploys Django and PostgreSQL; it does not enable Gemini, Razorpay, or S3. The React UI runs locally and uses its Django API compatibility adapter through `VITE_API_BASE_URL`.

`render.yaml` creates one free Render PostgreSQL database and one free Django web service. The web service may sleep after 15 idle minutes and the free database expires after 30 days. These constraints are acceptable for a short demonstration, not production.

## Deploy

1. Push this repository to a GitHub repository. Do not commit `.env`, `.venv`, `private-media`, or credentials.
2. Sign in to Render using GitHub.
3. Choose **New** → **Blueprint**, select this repository, and approve the resources shown from `render.yaml`.
4. Keep every selected plan as **Free**. Do not add a payment method.
5. Wait for both resources to become Available, then open `https://<render-service>.onrender.com/api/health/`.
6. The first API startup applies Django migrations automatically for this one-instance demo service.

## Local frontend

Create `hospital-frontend/.env` with:

```env
VITE_API_BASE_URL=https://pulse-hms-django-api.onrender.com/api
```

Restart Vite after changing `.env`, then run `npm run dev`. The frontend uses Django REST Framework token authentication and communicates with the cloud API over HTTPS. Legacy Socket.IO real-time updates are intentionally not part of this Render demonstration.
