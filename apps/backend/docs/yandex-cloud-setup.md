# Yandex Cloud Setup for Deployment

This document provides instructions for setting up Yandex Cloud infrastructure to support the automated deployment pipeline.

## Overview

The deployment pipeline targets a specific Virtual Machine (VM) in Yandex Cloud with ID: `fhmf3i36jq46rgl67sme`. This document describes the required setup for this VM to support automated deployments using the production Docker Compose configuration.

## Prerequisites

Before setting up the deployment infrastructure, ensure you have:

1. A Yandex Cloud account with appropriate permissions
2. A created VM with ID: `fhmf3i36jq46rgl67sme`
3. Network access to the VM
4. A service account with necessary permissions
5. A Container Registry set up in Yandex Cloud
6. A `traefik-public` Docker network created

## Container Registry Setup

### Create Container Registry

1. In the Yandex Cloud Console, navigate to the Container Registry section
2. Create a new container registry
3. Note the registry ID for use in the CI/CD pipeline

### Configure Registry Access

1. Create an IAM token for the service account with registry access:
   ```bash
   yc iam key create --service-account-name <service-account-name> --output key.json
   ```

2. Store the full JSON content of the key file and provide it to the CI/CD pipeline as `YC_REGISTRY_PASSWORD`.

## VM Configuration

### Base Setup

The VM should be configured with the following specifications:

- **Operating System**: Ubuntu 20.04 LTS or later
- **CPU**: 2 vCPUs or more
- **RAM**: 4 GB or more
- **Disk**: 20 GB or more of persistent storage
- **Network**: Public IP address or access through Load Balancer

### Required Software

Install the following software on the VM:

1. **Docker Engine**:
   ```bash
   # Update package index
   sudo apt-get update
   
   # Install prerequisites
   sudo apt-get install \
       ca-certificates \
       curl \
       gnupg \
       lsb-release
   
   # Add Docker's official GPG key
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   
   # Set up the repository
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   
   # Install Docker Engine
   sudo apt-get update
   sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin
   ```

2. **Yandex Cloud CLI** (for registry authentication):
   ```bash
   curl https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
   ```

3. **Docker Compose** (if not included with Docker Engine):
   ```bash
   # Install Docker Compose
   sudo apt install docker-compose-plugin
   ```

4. **SSH Access**:
   Ensure SSH access is configured for the CI/CD pipeline to connect to the VM.

### User Permissions

Create a dedicated user for deployment operations:

```bash
# Create deployment user
sudo adduser deploy

# Add user to docker group
sudo usermod -aG docker deploy

# Set up SSH key authentication for the deploy user
sudo mkdir -p /home/deploy/.ssh
sudo cp /path/to/public/key /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

## Traefik Network Setup

Create the required Docker network for Traefik:

```bash
# Create traefik-public network
docker network create traefik-public
```

## Service Account Setup

### Create Service Account

1. In the Yandex Cloud Console, navigate to the IAM section
2. Create a new service account with the following roles:
   - `container-registry.images.puller` - for pulling images from Container Registry
   - `compute.admin` - for VM management
   - `iam.serviceAccounts.user` - for service account management
   - `vpc.publicAdmin` - for network management (if needed)

### Generate Authentication Key

1. Create an authorized key for the service account:
   ```bash
   yc iam key create --service-account-name <service-account-name> --output key.json
   ```

2. Store the full JSON content of the key file and provide it to the CI/CD pipeline as `YC_SERVICE_ACCOUNT_KEY`.

## Environment Configuration

### Environment Variables

The deployment process will automatically create the required environment variables on the VM. These include:

- Database configuration (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB)
- Redis configuration (REDIS_PASSWORD)
- MinIO configuration (MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, AWS_S3_BUCKET)
- SMTP configuration (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE)
- Application configuration (ACME_EMAIL, JWT_SECRET, APP_BASE_URL)

### Docker Registry Authentication

The deployment process will automatically authenticate with Yandex Cloud Container Registry using the provided credentials.

## Deployment Directory Structure

Set up the following directory structure on the VM:

```
/home/deploy/
├── quokkaq/
│   ├── .env.prod           # Production environment variables (created by deployment process)
│   ├── docker-compose.prod.yml # Production Docker Compose configuration (copied during deployment)
│   └── logs/                # Application logs
└── scripts/
    ├── deploy.sh            # Deployment script
    └── health-check.sh     # Health check script
```

### Deployment Script

The CI/CD pipeline automatically handles the deployment process, including:

1. Creating the .env.prod file with production variables
2. Pulling the new Docker image from Yandex Cloud Container Registry
3. Stopping current services using docker-compose.prod.yml
4. Starting new services with the updated image using docker-compose.prod.yml
5. Running database migrations
6. Checking service health

## Docker Compose Configuration

The production deployment uses `docker-compose.prod.yml`, which includes:

1. **Traefik Reverse Proxy** with automatic SSL certificates via Let's Encrypt
2. **PostgreSQL Database** with secure password authentication
3. **Redis** with password authentication
4. **MinIO** with Traefik integration for S3 API and Console access
5. **QuokkaQ Backend API** with Traefik integration and security headers

### Key Features

- ✅ Automatic SSL certificates via Let's Encrypt
- ✅ HTTP to HTTPS redirection
- ✅ CORS middleware for frontend integration
- ✅ Security headers (HSTS, etc.)
- ✅ Proper service isolation with Docker networks
- ✅ Health checks for all services

## Security Considerations

### Network Security

1. Restrict access to the VM using security groups:
   - Allow SSH access only from trusted IP addresses
   - Allow HTTP/HTTPS access from necessary sources
   - Restrict database access to internal network only

2. Use private networks where possible:
   - Place database and other internal services on private networks
   - Use load balancers for public access

### Data Security

1. Enable encryption at rest for persistent volumes
2. Use TLS for all network communications
3. Regularly rotate passwords and API keys
4. Implement proper backup and recovery procedures

### Access Control

1. Use separate service accounts for different services
2. Implement role-based access control
3. Regularly audit access logs
4. Use multi-factor authentication for administrative access

## Monitoring and Logging

### System Monitoring

Set up monitoring for the following metrics:

1. CPU and memory usage
2. Disk space utilization
3. Network traffic
4. Application response times
5. Error rates

### Log Management

Configure log rotation and retention:

```bash
# Create log rotation configuration
sudo tee /etc/logrotate.d/quokkaq << EOF
/home/deploy/quokkaq/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 deploy deploy
}
EOF
```

## Backup and Recovery

### Database Backup

Set up regular database backups:

```bash
# Create backup script
sudo tee /home/deploy/scripts/backup-db.sh << EOF
#!/bin/bash
docker exec quokkaq-postgres pg_dump -U postgres quokkaq > /home/deploy/backups/quokkaq-$(date +%Y%m%d-%H%M%S).sql
EOF

# Make script executable
chmod +x /home/deploy/scripts/backup-db.sh

# Schedule backups with cron
echo "0 2 * * * /home/deploy/scripts/backup-db.sh" | crontab -
```

### File Backup

Set up regular file backups for MinIO data:

```bash
# Create backup script
sudo tee /home/deploy/scripts/backup-minio.sh << EOF
#!/bin/bash
docker exec quokkaq-minio mc cp --recursive local/quokkaq-materials /backups/quokkaq-materials-$(date +%Y%m%d-%H%M%S)
EOF

# Make script executable
chmod +x /home/deploy/scripts/backup-minio.sh

# Schedule backups with cron
echo "0 3 * * * /home/deploy/scripts/backup-minio.sh" | crontab -
```

## Testing the Setup

### Initial Deployment Test

1. Trigger the CI/CD pipeline by merging a PR to the `prod-release` branch
2. Monitor the deployment process in the Actions tab
3. Verify all services are running:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod ps
   ```

4. Check application health:
   ```bash
   curl -f http://localhost:3001/health
   ```

### Rollback Test

1. Deploy a known good version by reverting the `prod-release` branch
2. Verify the application is working correctly

## Maintenance

### Regular Updates

1. Update the base OS regularly:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. Update Docker and related tools:
   ```bash
   sudo apt update && sudo apt install docker-ce docker-compose-plugin
   ```

3. Restart services after updates:
   ```bash
   sudo systemctl restart docker
   ```

### Performance Tuning

1. Monitor resource usage and adjust VM specifications as needed
2. Optimize database queries and indexes
3. Configure appropriate caching strategies
4. Implement connection pooling for database connections

## Troubleshooting

### Common Issues

1. **Docker daemon not starting**:
   - Check system logs: `journalctl -u docker.service`
   - Verify Docker installation: `docker --version`
   - Restart Docker service: `sudo systemctl restart docker`

2. **Insufficient disk space**:
   - Check disk usage: `df -h`
   - Clean up unused Docker data: `docker system prune -a`
   - Remove old backups if necessary

3. **Network connectivity issues**:
   - Check firewall rules
   - Verify security group settings
   - Test connectivity to required services

4. **Traefik SSL certificate issues**:
   - Check Traefik logs: `docker compose -f docker-compose.prod.yml logs traefik`
   - Verify DNS configuration
   - Check Let's Encrypt rate limits

### Logs and Diagnostics

1. Check Docker logs:
   ```bash
   docker compose -f docker-compose.prod.yml logs
   ```

2. Check system logs:
   ```bash
   journalctl -u docker.service
   ```

3. Check application logs:
   ```bash
   tail -f /home/deploy/quokkaq/logs/application.log
   ```

## Conclusion

This setup provides a robust foundation for deploying the QuokkaQ Backend application to Yandex Cloud using the production Docker Compose configuration. The configuration supports automated deployments, monitoring, and maintenance operations. Regular review and updates to this setup will ensure continued reliability and security of the deployed application.