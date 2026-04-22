<div align="center">
  <img src="./quokka-logo.svg" alt="QuokkaQ Logo" width="150"/>
  <h1>QuokkaQ Go Backend</h1>
  <p><strong>High-performance queue management system backend built with Go</strong></p>
  
  [![Go Version](https://img.shields.io/badge/Go-1.26.2-00ADD8?style=flat&logo=go)](https://golang.org/)
  [![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
  [![API Documentation](https://img.shields.io/badge/API-Scalar-6366f1)](http://localhost:3001/swagger/)
</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [API Documentation](#-api-documentation)
- [Development](#-development)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**QuokkaQ** is a modern, scalable queue management system designed for organizations that need to efficiently manage customer flows across multiple service units. The backend is built with Go for high performance and reliability.

### Key Capabilities

- **Multi-tenant Support**: Manage multiple units/branches from a single system with full RBAC
- **Real-time Updates**: WebSocket-based notifications for queue updates and SLA alerts
- **Flexible Service Configuration**: Hierarchical services with skill-based routing and custom prefixes
- **Staff Management**: Counter assignment, shift tracking, and performance monitoring
- **Booking & Pre-registration**: Slot-based appointment system with calendar sync
- **Kiosk & Display Integration**: APIs for self-service kiosks, queue screens, counter displays, and workplace boards
- **Email Notifications**: Template-based email system with invitation management
- **File Storage**: MinIO/S3-compatible storage for logos, media, and survey assets
- **SSO Authentication**: OIDC and SAML 2.0 single sign-on with external identity mapping and group synchronization
- **Billing & Subscriptions**: Stripe checkout/cancellation and YooKassa payment links with webhook processing
- **SaaS Platform API**: Multi-tenant operator endpoints for managing companies, plans, catalog items, and platform invoices
- **Statistics & SLA Monitoring**: Advanced analytics including heatmaps, staffing forecast, SLA tracking, and PDF export
- **Calendar Integrations**: Google Calendar OAuth flow, CalDAV/iCal sync for per-unit and company-level scheduling
- **SMS Notifications**: Multi-provider SMS delivery (Twilio, SMS.ru, SMSAero, SMSC) via background jobs
- **Support Reports**: Internal issue workflow with Plane and Yandex Tracker integration
- **Guest Surveys**: Configurable satisfaction surveys with response tracking and idle/completion media
- **1C / CommerceML**: Russian accounting system integration for automated data exchange
- **DaData Proxy**: Russian address, party, and bank data enrichment endpoints
- **OpenTelemetry Tracing**: Distributed tracing via OTLP HTTP exporter

---

## ✨ Features

### Core Functionality

- ✅ **Queue Management**: Create, call, transfer, and complete tickets with full status lifecycle
- ✅ **Service Configuration**: Hierarchical service tree with custom prefixes, skills, and workflows
- ✅ **Counter Control**: Assign staff to counters, track occupancy, breaks, and availability
- ✅ **Real-time Notifications**: WebSocket hub for live updates to displays and staff panels
- ✅ **Shift Management**: Track shifts, generate statistics, and execute end-of-day operations
- ✅ **Pre-registration & Slots**: Slot grid management and appointment booking with validation
- ✅ **User Invitation System**: Token-based user registration with email templates
- ✅ **Audit Logging**: Comprehensive activity tracking for compliance
- ✅ **Role-Based Access Control**: Tenant roles, permission catalog, and unit-scoped access
- ✅ **SSO & External Identities**: OIDC/SAML with external identity linking and group mapping
- ✅ **Billing**: Stripe checkout/cancel, YooKassa payment links, subscription and invoice management
- ✅ **Platform Admin**: SaaS operator API for tenant management, plans, catalog, and invoicing
- ✅ **Statistics & Analytics**: SLA monitoring, heatmaps, utilization, staffing forecast, PDF reports
- ✅ **Guest Surveys**: Survey definitions, response collection, and display media management
- ✅ **Desktop Terminals**: Kiosk and display terminal provisioning and bootstrap management
- ✅ **Client Management**: CRM-style client records, visit history, and visitor tag definitions
- ✅ **Virtual Queue**: Public remote queue joining without a physical kiosk visit
- ✅ **Support Reports**: Internal issue tracking with external tracker integration

### Technical Features

- 🚀 **High Performance**: Built with Go for speed and efficiency
- 🔄 **Background Jobs**: Async task processing with Redis-backed queue (Asynq) — SMS, TTS, visitor notify
- 🔐 **JWT Authentication**: Secure token-based authentication with terminal bootstrap tokens
- 📡 **WebSocket Support**: Room-based real-time communication with SLA breach alerts
- 🗄️ **PostgreSQL Database**: Reliable data persistence with GORM and versioned migrations
- 📦 **S3-Compatible Storage**: MinIO integration for file uploads, logos, and survey media
- 📧 **SMTP Email**: Template-based email notifications via gomail v2
- 📚 **API Documentation**: Interactive Scalar API reference (OpenAPI 3)
- 🔭 **Observability**: OpenTelemetry distributed tracing with OTLP HTTP exporter

---

## 🏗️ Architecture

### Layered Architecture

```
┌─────────────────────────────────────────┐
│           HTTP Handlers                 │  ← REST API Endpoints
├─────────────────────────────────────────┤
│           Services Layer                │  ← Business Logic
├─────────────────────────────────────────┤
│         Repository Layer                │  ← Data Access
├─────────────────────────────────────────┤
│      Database (PostgreSQL)              │  ← Persistence
└─────────────────────────────────────────┘

      ┌──────────────┐     ┌──────────────┐
      │  WebSocket   │     │ Background   │
      │     Hub      │     │    Jobs      │
      └──────────────┘     └──────────────┘
```

### Technology Stack

| Component | Technology |
|-----------|-----------|
| **Language** | Go 1.26.2 |
| **Web Framework** | Chi Router v5 |
| **Database** | PostgreSQL 16+ (via GORM) |
| **Real-time** | Gorilla WebSocket |
| **Authentication** | JWT (golang-jwt/jwt) |
| **SSO** | go-oidc (OIDC), crewjam/saml (SAML 2.0) |
| **Background Jobs** | Asynq (Redis-backed) |
| **Storage** | AWS SDK v2 (MinIO/S3) |
| **Email** | gomail v2 |
| **Payments** | stripe-go v76, yookassa-sdk-go |
| **Calendar** | Google API (OAuth), go-webdav (CalDAV), go-ical |
| **Observability** | OpenTelemetry (OTLP exporter) |
| **API Docs** | Swagger → Scalar API Reference (OpenAPI 3) |

---

## 🔗 External Integrations

| Integration | Purpose |
|-------------|---------|
| **Stripe** | Subscription checkout, customer management, cancellation |
| **YooKassa** | Russian payment links for invoices; webhook for payment confirmation |
| **OIDC (go-oidc)** | Single sign-on with any OpenID Connect provider |
| **SAML 2.0 (crewjam/saml)** | Enterprise SSO with SAML identity providers |
| **Google Calendar** | OAuth 2.0 flow for per-company and per-unit calendar sync |
| **CalDAV / iCal** | Generic calendar integration (emersion/go-webdav, go-ical) |
| **Twilio** | SMS provider for visitor notifications |
| **SMS.ru / SMSAero / SMSC** | Alternative Russian SMS providers (configurable per deployment) |
| **DaData** | Russian address, party (INN), and bank data lookup |
| **Plane** | Support report issue creation and workflow tracking |
| **Yandex Tracker** | Lead and plan-change issue creation (Yandex Cloud SDK) |
| **1C / CommerceML** | Automated data exchange with 1C: Enterprise accounting systems |
| **MinIO / AWS S3** | File uploads, media assets, survey imagery, printer logos |
| **Redis** | Asynq background job queue |
| **OpenTelemetry** | Distributed tracing (OTLP HTTP exporter) |

---

## 📦 Prerequisites

Before running QuokkaQ Backend, ensure you have:

- **Go** 1.26.2 or higher ([Download](https://golang.org/dl/))
- **PostgreSQL** 16+ ([Download](https://www.postgresql.org/download/)) — required for `units_company_parent_code_uq` (`NULLS NOT DISTINCT`); local stack uses `postgres:16-alpine` in Docker Compose
- **Redis** 6+ ([Download](https://redis.io/download)) - for background jobs
- **MinIO** or AWS S3 ([MinIO Setup](https://min.io/docs/minio/linux/operations/installation.html))
- **SMTP Server** (e.g., Yandex, Gmail, SendGrid) - for email notifications

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/thevladbog/quokkaq-go-backend.git
cd quokkaq-go-backend
```

### 2. Install Dependencies

```bash
go mod download
```

### 3. Set Up the Database

Create a PostgreSQL database:

```bash
psql -U postgres
CREATE DATABASE quokkaq;
\q
```

The application will automatically run migrations on startup.

### 4. Set Up MinIO (Development)

Using Docker Compose:

```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

Access MinIO Console at <http://localhost:9001> and create a bucket named `quokkaq-materials`.

### 5. Set Up Redis (for Background Jobs)

Using Docker:

```bash
docker run -d -p 6379:6379 --name redis redis:latest
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quokkaq

# Server Configuration
PORT=3001
APP_BASE_URL=http://localhost:3000

# MinIO / AWS S3 Configuration
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=quokkaq-materials
AWS_ENDPOINT=http://localhost:9000

# SMTP Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@example.com
SMTP_SECURE=false

```

### Development Mode

```bash
go run cmd/api/main.go
```

The server will start on <http://localhost:3001>

### Production Build

```bash
go build -o quokkaq-backend cmd/api/main.go
./quokkaq-backend
```

### Monorepo dev (`nx run backend:serve`)

The default command from the repo root runs `go run ./cmd/api` via [`scripts/run-backend-dev.js`](./scripts/run-backend-dev.js): it can free `PORT` from a previous API process and maps **Ctrl+C** to exit code **0** so Nx does not mark the task as failed after a clean shutdown (plain `go run` often returns **1** on interrupt).

```bash
pnpm nx run backend:serve
```

From `apps/backend` without Nx:

```bash
node scripts/run-backend-dev.js
# or
go run ./cmd/api
```

After changing `.go` files, restart the process manually (there is no hot reload).

If the API exits right after **`Server starting on port …`**, check the lines above in the log — often **`ListenAndServe: listen tcp …: bind: address already in use`**: `PORT` (default **3001**) is still held by another process. Stop it (`lsof -iTCP:3001 -sTCP:LISTEN` / Activity Monitor) or set a different `PORT`.

---

## 📚 API Documentation

### Interactive API Documentation

Once the server is running, access the interactive API documentation:

**Scalar API Reference**: <http://localhost:3001/swagger/>

### OpenAPI 3 specification

The published spec is OpenAPI 3.0 (converted from Swagger 2 annotations):

- **JSON (preferred URL)**: <http://localhost:3001/docs/openapi.json>
- **JSON (legacy path)**: <http://localhost:3001/docs/swagger.json>
- **YAML**: `./docs/swagger.yaml`

### Generating API docs

Code annotations use swag (Swagger 2). Run the two-step pipeline from `apps/backend`:

```bash
go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g cmd/api/main.go -o ./docs
go run ./cmd/swagger-to-openapi3
```

Or via Nx from the repo root:

```bash
pnpm nx run backend:openapi
```

---

## 🛠️ Development

### Project Structure

```
quokkaq-go-backend/
├── cmd/
│   ├── api/              # Main application entry point
│   ├── seed/             # Database seeding utilities
│   ├── test_email/       # Email testing tool
│   └── debug_email/      # Email debugging tool
├── internal/
│   ├── config/           # Configuration loading
│   ├── handlers/         # HTTP request handlers
│   ├── middleware/        # HTTP middleware (auth, logging)
│   ├── models/           # Database models (GORM)
│   ├── repository/        # Data access layer
│   ├── services/         # Business logic layer
│   ├── jobs/             # Background job definitions
│   └── ws/               # WebSocket hub and client
├── pkg/
│   └── database/         # Database connection and utilities
├── docs/                 # Generated API documentation
├── go.mod                # Go module dependencies
├── go.sum                # Dependency checksums
└── .env                  # Environment configuration
```

### Key Components

#### Handlers (`internal/handlers/`)
HTTP request handlers responsible for parsing requests, calling services, and returning responses.

#### Services (`internal/services/`)
Business logic layer that orchestrates repository calls, implements domain rules, and manages transactions.

#### Repositories (`internal/repository/`)
Data access layer providing an abstraction over database operations.

#### Models (`internal/models/`)
GORM models representing database entities.

#### WebSocket Hub (`internal/ws/`)
Real-time communication hub supporting room-based broadcasting for unit-specific updates.

#### Background Jobs (`internal/jobs/`)
Async task processing for operations like email sending and TTS generation.

### Adding a New Feature

1. **Define the Model** in `internal/models/`
2. **Create Repository** in `internal/repository/`
3. **Implement Service Logic** in `internal/services/`
4. **Create Handler** in `internal/handlers/`
5. **Register Routes** in `cmd/api/main.go`
6. **Add Swagger Annotations** to handler methods
7. **Regenerate API Docs** with `pnpm nx run backend:openapi` (or `swag init -g cmd/api/main.go -o ./docs && go run ./cmd/swagger-to-openapi3` from `apps/backend`)

---

## 🧪 Testing

### Running Tests

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run tests in a specific package
go test ./internal/services/...
```

### Test Email Configuration

Use the test email command:

```bash
go run cmd/test_email/main.go
```

---

## 🚢 Deployment

### Automated Deployment

This project includes an automated deployment pipeline that is triggered when changes are pushed to the `prod-release` branch. The pipeline performs the following actions:

1. Automatically calculates the next semantic version
2. Updates the CHANGELOG.md with release information
3. Builds and pushes a Docker image to the registry
4. Creates a Git tag for the release
5. Deploys the new version to a Yandex Cloud VM
6. Creates a GitHub release

For detailed information about the deployment process, see [DEPLOYMENT.md](DEPLOYMENT.md).

### Docker Deployment

#### Quick Start with Docker Compose (Recommended)

The easiest way to run the entire stack:

```bash
# Start all services (PostgreSQL, Redis, MinIO, API)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

After starting, the services will be available at:
- **API**: <http://localhost:3001>
- **API Documentation**: <http://localhost:3001/swagger/>
- **MinIO Console**: <http://localhost:9001> (login: minioadmin/minioadmin)

**First-time setup:**
1. Access MinIO Console at <http://localhost:9001>
2. Create a bucket named `quokkaq-materials`
3. The API will automatically run migrations on first start

**Platform operator UI (`/platform`):** Compose sets `PLATFORM_ALLOW_TENANT_ADMIN` to **`false` by default** (tenant `admin` cannot call `/platform/*` unless they have `platform_admin`). To allow tenant admins on `/platform` in this dev stack only, set `PLATFORM_ALLOW_TENANT_ADMIN=true` in your environment or Compose `.env`. See [SETUP.md](../../SETUP.md#saas-platform-admin-product-owner) for roles and production behavior.

#### Building Docker Image Only

```bash
# Build production image
docker build -t quokkaq-backend .

# Run standalone (requires external database)
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e AWS_ENDPOINT=http://minio:9000 \
  quokkaq-backend
```

#### Docker Compose Services

The `docker-compose.yml` includes:

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL 16 database |
| `redis` | 6379 | Redis for background jobs |
| `minio` | 9000, 9001 | S3-compatible storage |
| `backend` | 3001 | QuokkaQ API server |

All services include health checks and automatic restarts.

### Production Considerations

- ✅ Use a reverse proxy (Nginx, Traefik)
- ✅ Enable HTTPS/TLS
- ✅ Configure CORS for your frontend domain
- ✅ Set up database backups
- ✅ Configure log aggregation
- ✅ Use a managed Redis service
- ✅ Set up health check endpoints
- ✅ Configure rate limiting
- ✅ Use environment-specific `.env` files
- ✅ Implement monitoring (Prometheus, Grafana)

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow Go best practices and idioms
- Write unit tests for new features
- Update API documentation for endpoint changes
- Keep commits atomic and well-described
- Run `go fmt` before committing
- Ensure tests pass before submitting PR

---

## 📄 License

This project is proprietary software. **All rights reserved.**

The source code is made available for viewing and evaluation purposes only. Any use, modification, or distribution requires explicit written permission from the copyright holder. See the [LICENSE](LICENSE) file for complete terms.

---

## 🙏 Acknowledgments

- Built with [Chi Router](https://github.com/go-chi/chi)
- WebSockets powered by [Gorilla WebSocket](https://github.com/gorilla/websocket)
- Database ORM by [GORM](https://gorm.io/)
- Background jobs with [Asynq](https://github.com/hibiken/asynq)
- API documentation by [Scalar](https://github.com/scalar/scalar)

---

<div align="center">
  <p>Made with ❤️ by the QuokkaQ Team</p>
  <img src="./logo-text.svg" alt="QuokkaQ" width="120"/>
</div>
