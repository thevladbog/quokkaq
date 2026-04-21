# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Customer Experience and Communications (Phase 3)

##### Customer Notifications (SMS)

- `SMSProvider` interface with four production implementations: **SMSC** (`smsc`), **SMS.ru** (`smsru`), **SMSAero** (`smsaero`), and **Twilio** (`twilio`); `LogSMSProvider` for development/fallback.
- `NewSMSProviderFromSettings` and `applySMSEnvOverrides`: environment variables `SMS_API_KEY` and `SMS_API_SECRET` always override DB credentials; `SMS_PROVIDER` and `SMS_FROM_NAME` fill when the DB value is empty.
- `NotificationService`: orchestrates visitor-facing SMS — creates a `notifications` row for persistence and retry tracking, then enqueues an `sms:send` Asynq job.
- `SendTicketCalledSMS`: fires automatically when an operator calls (`CallNext`), re-calls (`Recall`), or manually picks (`Pick`) a ticket.
- `SendQueuePositionAlert` ("you're next" SMS): fires via `notifyNextInLine` in `CallNext` and `Pick` when the next-waiting visitor reaches position 1.
- Visitor locale (`UnitClient.locale` column, migration `v1.6.3_unit_clients_locale`) drives RU/EN SMS message language.

##### Virtual Queue / Remote Check-in

- `POST /units/{unitId}/virtual-queue` — visitor joins the queue remotely; gated on plan feature `virtual_queue` and unit config `virtualQueue.enabled`.
- `GET /units/{unitId}/queue-status` — unauthenticated public endpoint returning queue length, estimated wait minutes, active counter count, and optional per-service breakdowns.
- Frontend virtual queue join page (`/[locale]/queue/[unitId]`) with 30-second polling for live queue stats.

##### Estimated Wait Time (ETA)

- `ETAService`: computes 1-based queue position and estimated wait seconds per ticket using a rolling average of the last 20 completed service durations; falls back to `MaxWaitingTime` from the service snapshot when fewer than 3 samples are available.
- `GetUnitQueueSummary`: returns aggregate and per-service queue stats; per-service breakdown is populated only when `serviceRepo` is injected and more than one service has waiting tickets.
- `GET /tickets/{id}` now includes `queuePosition` and `estimatedWaitSeconds` virtual fields for waiting tickets.
- `packages/shared-types`: `TicketModelSchema` extended with `queuePosition`, `estimatedWaitSeconds`, and `smsOptInAvailable` (Zod optional fields).

##### Two-Way Communication

- `POST /tickets/{id}/cancel` — visitor self-cancels a waiting ticket; transitions status to `no_show` and writes a `ticket.visitor_cancelled` history entry.
- `POST /tickets/{id}/phone` — SMS opt-in: visitor attaches an E.164 phone to a waiting ticket; creates or links a `UnitClient`; returns `HTTP 409` (`ErrTicketNotWaiting`) when ticket is not in waiting status.
- `ErrTicketNotWaiting` sentinel error added to `ticket_service.go`.
- Ticket page (`/[locale]/ticket/[ticketId]`) shows inline SMS opt-in form when `smsOptInAvailable` is true and ticket is waiting.

##### SaaS Integrations Admin

- `GET /platform/integrations` — returns SMS provider name, masked API key (last 4 chars), sender name, and enabled flag alongside existing tracker fields.
- `PATCH /platform/integrations` — accepts SMS patch fields (`smsProvider`, `smsApiKey`, `smsApiSecret`, `smsFromName`, `smsEnabled`); API credentials are write-only and never returned in plaintext.
- `POST /platform/integrations/sms/test` — sends a test SMS using the current provider configuration; useful for credential validation.
- `DeploymentSaaSSettings` model extended with SMS columns (`sms_provider`, `sms_api_key`, `sms_api_secret`, `sms_from_name`, `sms_enabled`).
- Frontend integrations page (`/platform/integrations`) includes SMS section with provider selector, credential inputs, enable toggle, and test-send button.

---

#### RBAC / tenant permissions (database migrations v1.4.x)

- **v1.4.0** — Expanded permission catalog in code (`internal/rbac`); tenant role TRU rows pick up new keys when edited in UI.
- **v1.4.1** — Backfill: legacy global `admin` users receive the reserved tenant role `system_admin` per company where they have units (`BackfillLegacyGlobalAdminsToSystemTenantRole`).
- **v1.4.2** — Backfill: users with legacy global roles `staff`, `supervisor`, or `operator` get default unit permissions merged into `user_units.permissions` (`BackfillLegacyStaffSupervisorOperatorUnitPermissions`), including `support.reports` where applicable.

#### API / auth behavior

- `/support/*` routes use `RequireTenantPermission(PermSupportReports)` with `TenantPermissionAllowed` (platform/global admin, tenant `system_admin`, tenant-catalog permission, or matching `user_units` permission).
- `GET /auth/me`-style user DTO: legacy `roles` is still serialized for backward compatibility (global role names such as `platform_admin`); clients should prefer `tenantRoles` and per-unit `permissions` for authorization, while some clients may still derive flags (e.g. platform admin) from legacy role names until a dedicated schema field is adopted everywhere.
- Removed unused middleware: `RequireSupportReportAccess`, `RequireAdminOrTenantPermission`, `EnsureTenantAccess`, `RequireCompanyOwner`; removed `HasSupportReportAccess` from the user repository.

- Initial release with core queue management functionality
- WebSocket support for real-time updates
- User authentication and authorization with JWT
- Multi-tenant unit management
- Service configuration with hierarchical structure
- Counter management and staff assignment
- Ticket lifecycle management (create, call, transfer, complete)
- Booking system integration
- Email notification system with templates
- User invitation system
- Background job processing with Asynq
- MinIO/S3 integration for file storage
- Scalar API documentation
- Shift management and statistics
- Audit logging

### Features by Module

#### Authentication & Users
- JWT-based authentication
- User CRUD operations
- Role-based access control
- User-unit assignment
- Invitation system with email verification

#### Queue Management
- Ticket creation with service prefixes
- Call next ticket functionality
- Ticket transfer between counters
- Ticket recall and return to queue
- Status tracking (waiting, called, in_service, completed)
- Real-time WebSocket notifications

#### Services & Counters
- Hierarchical service tree
- Service prefix configuration
- Counter creation and management
- Counter occupation/release
- Automatic ticket assignment

#### Units & Organizations
- Multi-tenant support
- Unit configuration
- Kiosk and display settings
- Custom branding (logos, colors)
- Material/file management

#### Background Jobs
- TTS generation for ticket numbers
- Email sending queue
- Async job processing with Redis

#### API & Documentation
- RESTful API design
- Scalar interactive API documentation
- Swagger/OpenAPI specification
- CORS configuration

## [1.0.0] - 2025-01-XX

### Initial Release
- First stable release of QuokkaQ Backend
- Full feature set for queue management
- Production-ready deployment

---

## Version History Guidelines

### Types of Changes
- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security improvements

### Example Entry Format
```markdown
## [1.1.0] - 2025-02-15

### Added
- New analytics dashboard endpoint
- Export queue statistics to CSV

### Changed
- Improved WebSocket reconnection logic
- Updated GORM to v1.32.0

### Fixed
- Fixed ticket number sequencing issue
- Resolved race condition in counter assignment

### Security
- Updated JWT library to address CVE-XXXX-XXXX
```
