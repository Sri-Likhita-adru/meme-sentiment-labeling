# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps for pandas if needed
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    build-essential gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV FLASK_ENV=production

# Fly will route to 8080
EXPOSE 8080

# Use gunicorn for prod
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:8080", "app:app"]
