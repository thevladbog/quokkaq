# CI/CD Pipeline Documentation

This document provides detailed information about the CI/CD pipeline implemented for the QuokkaQ Backend project.

## Overview

The CI/CD pipeline automates the process of releasing new versions of the application and deploying them to production infrastructure in Yandex Cloud. The pipeline can be triggered in two ways:

1. By pushing changes directly to the `prod-release` branch
2. By merging a pull request into the `prod-release` branch

## Pipeline Workflow

### Triggers

The pipeline can be triggered by:

1. **Push to prod-release branch**: Direct pushes to the `prod-release` branch
2. **Pull Request Merge**: Merging a pull request into the `prod-release` branch

### Steps

1. **PR Title Validation** (for PR merges): Validates that the PR title follows the required format
2. **Checkout**: The pipeline checks out the code from the repository
3. **Version Calculation**: The pipeline determines the current version from CHANGELOG.md and calculates the next version
4. **CHANGELOG Update**: The pipeline updates CHANGELOG.md with the release date and creates a new "Unreleased" section
5. **Docker Build**: The pipeline builds a Docker image using the multi-stage Dockerfile
6. **Docker Push**: The pipeline pushes the Docker image to Yandex Cloud Container Registry
7. **Git Tag**: The pipeline creates a Git tag for the release
8. **Yandex Cloud Deploy**: The pipeline deploys the new version to the Yandex Cloud VM using docker-compose.prod.yml
9. **GitHub Release**: The pipeline creates a GitHub release with release notes

## Version Management

The pipeline uses semantic versioning (SemVer) to manage releases. The version format is `MAJOR.MINOR.PATCH`:

- **MAJOR**: Incremented for incompatible API changes
- **MINOR**: Incremented for backward-compatible functionality additions
- **PATCH**: Incremented for backward-compatible bug fixes

### Version Bump Types

The pipeline automatically determines the version bump type based on the PR title (for PR merges):

| PR Title Format | Version Bump Type | Description |
|-----------------|------------------|-------------|
| `[Major] Description` or `[Breaking] Description` | Major | Incompatible API changes |
| `[Minor] Description` or `[Feature] Description` | Minor | Backward-compatible functionality additions |
| `[Patch] Description` or `[Fix] Description` | Patch | Backward-compatible bug fixes |

For direct pushes to the `prod-release` branch, the pipeline defaults to a patch version bump.

## Pull Request Requirements

When creating a pull request to the `prod-release` branch, the following requirements must be met:

1. **Title Format**: The PR title must follow the format `[Type] Description`
   - Valid types: Major, Minor, Patch, Feature, Fix, Breaking
   - Example: `[Feature] Add user authentication`

2. **Code Review**: The PR must be reviewed and approved by team members

3. **Tests**: All tests must pass before merging

## Configuration

### Environment Variables

The pipeline requires the following environment variables to be configured as secrets in the CI/CD environment:

| Variable | Description | Required |
|----------|-------------|----------|
| `YC_REGISTRY_USERNAME` | Username for Yandex Cloud Container Registry | Yes |
| `YC_REGISTRY_PASSWORD` | Password for Yandex Cloud Container Registry | Yes |
| `YC_REGISTRY_ID` | Yandex Cloud Container Registry ID | Yes |
| `YC_SERVICE_ACCOUNT_KEY` | Yandex Cloud service account key | Yes |
| `VM_SSH_KEY` | SSH private key for accessing the Yandex Cloud VM | Yes |
| `ACME_EMAIL` | Email for Let's Encrypt SSL certificates | Yes |
| `POSTGRES_USER` | PostgreSQL username | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes |
| `POSTGRES_DB` | PostgreSQL database name | Yes |
| `REDIS_PASSWORD` | Redis password | Yes |
| `MINIO_ROOT_USER` | MinIO root username | Yes |
| `MINIO_ROOT_PASSWORD` | MinIO root password | Yes |
| `AWS_S3_BUCKET` | S3 bucket name | Yes |
| `SMTP_HOST` | SMTP server hostname | Yes |
| `SMTP_PORT` | SMTP server port | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password | Yes |
| `SMTP_FROM` | SMTP from address | Yes |
| `SMTP_SECURE` | SMTP secure setting | Yes |
| `JWT_SECRET` | JWT secret for authentication | Yes |
| `APP_BASE_URL` | Application base URL | Yes |

### Secrets Management

All sensitive information should be stored as encrypted secrets in the CI/CD platform:

1. Yandex Cloud Container Registry credentials
2. Yandex Cloud service account key
3. SSH private key for VM access
4. All production environment variables

## Deployment Process

### Yandex Cloud Setup

The deployment targets a specific VM with ID: `fhmf3i36jq46rgl67sme`. This VM must be pre-configured with:

1. Docker installed
2. Access to Yandex Cloud Container Registry
3. Required environment variables set
4. Network access to required services
5. Traefik network created (`traefik-public`)

### Deployment Steps

1. Connect to the Yandex Cloud VM using SSH
2. Pull the new Docker image from Yandex Cloud Container Registry
3. Stop current services using docker-compose.prod.yml
4. Start new services with the updated image using docker-compose.prod.yml
5. Run database migrations
6. Check service health

### Rollback Process

To rollback to a previous version:

1. Identify the previous working version
2. Update the `prod-release` branch to point to the previous version's commit
3. The CI/CD pipeline will automatically deploy the previous version
4. Alternatively, manually deploy the previous Docker image to the VM

## Monitoring

### Health Checks

The pipeline includes health checks at various stages:

1. Docker image build success
2. Docker image push success
3. Deployment success on Yandex Cloud VM
4. Application health check after deployment

### Notifications

The pipeline sends notifications on:

1. Successful deployment
2. Failed deployment
3. Pipeline completion status

## Best Practices

### Branch Management

1. Use the `prod-release` branch only for production-ready code
2. Ensure all tests pass before merging to `prod-release`
3. Use feature branches for development work
4. Use pull requests for code review before merging to `prod-release`

### Pull Request Titles

1. Always follow the `[Type] Description` format for PR titles to `prod-release`
2. Choose the appropriate type based on the changes:
   - `Major` or `Breaking` for incompatible changes
   - `Minor` or `Feature` for new functionality
   - `Patch` or `Fix` for bug fixes

### Versioning

1. Update CHANGELOG.md with all notable changes
2. Follow semantic versioning principles
3. Use appropriate version increments based on change types
4. Include release dates in CHANGELOG.md

### Security

1. Regularly rotate secrets and keys
2. Scan Docker images for vulnerabilities
3. Use minimal base images
4. Keep dependencies up to date

## Troubleshooting

### Common Issues

1. **PR title format**: If the PR title doesn't follow the required format, the pipeline will fail.
   - Solution: Ensure the PR title follows the `[Type] Description` format.

2. **Yandex Cloud Container Registry authentication**: If the registry credentials are incorrect, the build will fail.
   - Solution: Verify the YC_REGISTRY_USERNAME and YC_REGISTRY_PASSWORD secrets.

3. **Yandex Cloud deployment failures**: If the VM is not accessible or the credentials are incorrect, deployment will fail.
   - Solution: Verify the YC_SERVICE_ACCOUNT_KEY and VM_SSH_KEY secrets.

4. **Environment variables missing**: If required environment variables are not set, deployment will fail.
   - Solution: Ensure all required secrets are configured in the CI/CD environment.

### Debugging

1. Check pipeline logs for detailed error messages
2. Verify secrets are correctly set
3. Ensure the Yandex Cloud VM is accessible
4. Check Docker image availability in the registry
5. Verify all required environment variables are set

## Customization

### Modifying the Pipeline

To modify the pipeline behavior:

1. Edit the `.github/workflows/prod-release-deploy.yml` file
2. Commit and push changes to the repository
3. Test the changes by pushing to `prod-release` or creating a PR

### Adding New Steps

To add new steps to the pipeline:

1. Add new job or step to the workflow file
2. Ensure required secrets are available
3. Test the new functionality

## Future Improvements

### Planned Enhancements

1. Automatic testing before deployment
2. Blue-green deployment strategy
3. Database migration rollback support
4. Enhanced monitoring and alerting
5. Slack/Telegram notifications

### Contributing

To contribute improvements to the pipeline:

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Submit a pull request for review