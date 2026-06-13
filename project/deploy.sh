#!/bin/sh
gcloud builds submit --tag gcr.io/acousmatic-time-protocol/atp-server:latest .

gcloud run deploy atp \
  --image gcr.io/acousmatic-time-protocol/atp-server:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
