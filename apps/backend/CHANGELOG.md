# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
