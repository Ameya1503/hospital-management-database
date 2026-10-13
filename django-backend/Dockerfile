FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/staticfiles && \
    DJANGO_SECRET_KEY=build-only-not-for-runtime DJANGO_DEBUG=false DJANGO_ALLOWED_HOSTS=build.internal \
    POSTGRES_PASSWORD=unused python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "hms.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
