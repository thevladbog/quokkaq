# Docker Quick Start Guide

## Prerequisites

- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed (included with Docker Desktop)

## Quick Start

### 1. Start All Services

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database on port 5432
- Redis on port 6379
- MinIO on ports 9000 (API) and 9001 (console)
- QuokkaQ Backend API on port 3001

### 2. Initial Setup

1. **Create MinIO bucket:**
   - Open http://localhost:9001
   - Login: `minioadmin` / `minioadmin`
   - Create bucket: `quokkaq-materials`

2. **Verify services:**
   ```bash
   docker-compose ps
   ```

3. **Check API:**
   - API: http://localhost:3001
   - API Docs: http://localhost:3001/swagger/

### 3. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
```

### 4. Stop Services

```bash
# Stop but keep data
docker-compose down

# Stop and remove all data (clean slate)
docker-compose down -v
```

## Environment Variables

Create `.env` file (or use `.env.example`):

```env
APP_BASE_URL=http://localhost:3000
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@example.com
SMTP_SECURE=false
```

## Useful Commands

```bash
# Rebuild backend after code changes
docker-compose up -d --build backend

# Execute command in container
docker-compose exec backend sh

# Reset database (warning: deletes all data!)
docker-compose down -v postgres
docker-compose up -d postgres

# View resource usage
docker stats
```

## Troubleshooting

### Backend fails to start
```bash
# Check logs
docker-compose logs backend

# Common issues:
# 1. Database not ready - wait 10 seconds and retry
# 2. Port 3001 already in use - stop other services
# 3. MinIO bucket missing - create in console
```

### Database connection fails
```bash
# Verify postgres is running
docker-compose ps postgres

# Check postgres logs
docker-compose logs postgres
```

### MinIO issues
```bash
# Recreate MinIO
docker-compose stop minio
docker volume rm quokkaq-go-backend_minio_data
docker-compose up -d minio
```

## Production Deployment with Traefik

### Using docker-compose.prod.yml

For production deployment with automatic SSL:

```bash
# 1. Create Traefik network
docker network create traefik-public

# 2. Configure environment
cp .env.prod.example .env.prod
nano .env.prod  # Set your production values

# 3. Deploy with Traefik
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Features**:
- ✅ Automatic SSL via Let's Encrypt
- ✅ HTTP → HTTPS redirect
- ✅ Traefik reverse proxy
- ✅ Security headers
- ✅ CORS middleware

**DNS Required** (point to server IP):
- `api.quokkaq.v-b.tech` - Backend API
- `s3.quokkaq.v-b.tech` - MinIO S3 API
- `minio.quokkaq.v-b.tech` - MinIO Console
- `traefik.quokkaq.v-b.tech` - Traefik Dashboard (optional)

**See Also**:
- [TRAEFIK.md](TRAEFIK.md) - Detailed Traefik configuration
- [DEPLOYMENT.md](DEPLOYMENT.md) - Full deployment guide

### Manual Production Setup

Without Traefik, modify `docker-compose.yml`:

1. Remove port exposures for postgres/redis
2. Use strong passwords (environment variables)
3. Enable TLS for MinIO
4. Use named networks for security
5. Add backup volumes
6. Configure resource limits
