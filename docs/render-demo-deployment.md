# Free demo deployment: Render

This is the zero-cost demonstration path. It deploys Django and PostgreSQL; it does not enable Gemini, Razorpay, S3, or the React cutover. The existing React UI remains unchanged and can keep running locally.

`render.yaml` creates one free Render PostgreSQL database and one free Django web service. The web service may sleep after 15 idle minutes and the free database expires after 30 days. These constraints are acceptable for a short demonstration, not production.

## Deploy

1. Push this repository to a GitHub repository. Do not commit `.env`, `.venv`, `private-media`, or credentials.
2. Sign in to Render using GitHub.
3. Choose **New** → **Blueprint**, select this repository, and approve the resources shown from `render.yaml`.
4. Keep every selected plan as **Free**. Do not add a payment method.
5. Wait for both resources to become Available, then open `https://<render-service>.onrender.com/api/health/`.
6. The first API startup applies Django migrations automatically for this one-instance demo service.

## Local frontend

Keep `hospital-frontend` unchanged and run it locally as before. It remains pointed at the existing Node API until the Django compatibility adapter is finished. The cloud backend can be demonstrated through its health endpoint and Django Admin/API independently.
