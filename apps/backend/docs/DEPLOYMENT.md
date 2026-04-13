# Deployment Process

This document describes the automated deployment process for the QuokkaQ Backend.

## Overview

The deployment process is triggered automatically when changes are pushed to the `prod-release` branch. The CI/CD pipeline performs the following actions:

1. Automatically calculates the next semantic version
2. Updates the CHANGELOG.md with release information
3. Builds and pushes a Docker image to the registry
4. Creates a Git tag for the release
5. Deploys the new version to a Yandex Cloud VM using docker-compose.prod.yml
6. Creates a GitHub release

## Prerequisites

### Environment Variables

The following environment variables need to be configured in the CI/CD environment:

- `YC_REGISTRY_USERNAME` - Username for the Yandex Cloud Container Registry
- `YC_REGISTRY_PASSWORD` - Password for the Yandex Cloud Container Registry
- `YC_REGISTRY_ID` - Yandex Cloud Container Registry ID
- `YC_SERVICE_ACCOUNT_KEY` - Yandex Cloud service account key for deployment
- `VM_SSH_KEY` - SSH private key for accessing the Yandex Cloud VM
- `ACME_EMAIL` - Email for Let's Encrypt SSL certificates
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_DB` - PostgreSQL database name
- `REDIS_PASSWORD` - Redis password
- `MINIO_ROOT_USER` - MinIO root username
- `MINIO_ROOT_PASSWORD` - MinIO root password
- `AWS_S3_BUCKET` - S3 bucket name
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `SMTP_FROM` - SMTP from address
- `SMTP_SECURE` - SMTP secure setting
- `SMTP_TLS_INSECURE_SKIP_VERIFY` - optional; set to `true` only for dev or self-signed SMTP (STARTTLS otherwise uses normal certificate verification)
- `JWT_SECRET` - JWT secret for authentication
- `APP_BASE_URL` - Application base URL

### Yandex Cloud Setup

The deployment targets a specific VM with ID: `fhmf3i36jq46rgl67sme`

## Deployment Process Details

### 1. Version Management

The system automatically determines the next version by:
1. Reading the current version from CHANGELOG.md
2. Incrementing the patch version number (e.g., 1.0.0 → 1.0.1)
3. Updating CHANGELOG.md with the release date
4. Adding a new "Unreleased" section for future changes

### 2. Docker Image Build

A Docker image is built using the multi-stage Dockerfile:
- Base image: golang:1.26.0-alpine for building
- Runtime image: alpine:latest for minimal size
- The final image contains only the compiled binary and necessary assets

The image is tagged with:
- The new version number (e.g., 1.0.1)
- `latest` tag

### 3. Deployment to Yandex Cloud

The deployment process uses `docker-compose.prod.yml` which includes:
1. Traefik reverse proxy with automatic SSL certificates
2. PostgreSQL database with secure authentication
3. Redis with password authentication
4. MinIO with Traefik integration
5. QuokkaQ Backend API with Traefik integration

Deployment steps:
1. Connects to the Yandex Cloud VM (ID: fhmf3i36jq46rgl67sme)
2. Pulls the new Docker image from Yandex Cloud Container Registry
3. Creates .env.prod file with production environment variables
4. Stops current services using docker-compose.prod.yml
5. Starts new services with the updated image using docker-compose.prod.yml
6. Runs database migrations
7. Checks service health

### 4. Release Management

After successful deployment:
- A Git tag is created (e.g., v1.0.1)
- A GitHub release is created with release notes
- The CHANGELOG.md is updated

## Manual Deployment

For manual deployment, follow these steps:

1. Ensure you have the required environment variables set
2. Build the Docker image:
   ```bash
   docker build -t quokkaq-backend:manual .
   ```
3. Push to registry:
   ```bash
   docker push quokkaq-backend:manual
   ```
4. Deploy to Yandex Cloud VM using docker-compose.prod.yml:
   ```bash
   # Create .env.prod file
   cp .env.prod.example .env.prod
   # Edit .env.prod with your production values
   
   # Deploy with Traefik
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
   ```

## Troubleshooting

### Common Issues

1. **Version conflicts**: If the version in CHANGELOG.md is not properly formatted, the pipeline will fail.
   - Solution: Ensure the CHANGELOG.md follows the expected format with versions in brackets.

2. **Docker registry authentication**: If the Docker registry credentials are incorrect, the build will fail.
   - Solution: Verify the YC_REGISTRY_USERNAME and YC_REGISTRY_PASSWORD environment variables.

3. **Yandex Cloud deployment failures**: If the VM is not accessible or the credentials are incorrect, deployment will fail.
   - Solution: Verify the YC_SERVICE_ACCOUNT_KEY and VM_SSH_KEY environment variables.

4. **Missing environment variables**: If required environment variables are not set, deployment will fail.
   - Solution: Ensure all required environment variables are configured.

### Rollback Process

To rollback to a previous version:
1. Identify the previous working version
2. Update the prod-release branch to point to the previous version's commit
3. The CI/CD pipeline will automatically deploy the previous version
4. Alternatively, manually deploy the previous Docker image to the VM:
   ```bash
   # Deploy previous version
   TAG=previous_version docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
   ```

## SaaS platform admin (operator UI)

- The product-owner console is served by the same Next.js app at **`/{locale}/platform`** and calls the API under **`/platform/*`**. Users need the **`platform_admin`** role (distinct from the tenant **`admin`** role).
- Grant the role on the server or locally: from the backend module, run `go run ./cmd/assign-platform-admin -email=user@example.com` with `DATABASE_URL` set (see monorepo [SETUP.md](../../../SETUP.md) for details).
- If the operator UI uses a **dedicated hostname** (for example `platform.example.com`), add that origin to **`CORS_ALLOWED_ORIGINS`** on the API.
- **Manual invoices** created via the platform API are stored in the application database only; they do not create Stripe invoices unless you add that workflow. Prefer Stripe as the source of truth for self-serve Checkout while using manual rows for offline or custom billing.

## Security Considerations

- All sensitive credentials are stored as encrypted environment variables
- Docker images are scanned for vulnerabilities before deployment
- SSH keys for VM access are rotated regularly
- All communication with Yandex Cloud uses encrypted connections
- Production environment variables are securely managed

## Monitoring

After deployment, verify the application is running correctly:
1. Check the application health endpoint
2. Verify all services are responding
3. Check logs for any errors
4. Confirm database connectivity
5. Test critical user flows
6. Verify SSL certificates are working correctly
7. Check Traefik dashboard (if enabled)