# Contributing to QuokkaQ Backend

Thank you for your interest in contributing to QuokkaQ Backend! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Guidelines](#coding-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [Testing Guidelines](#testing-guidelines)

---

## Code of Conduct

This project is proprietary software. Contributing is restricted to authorized collaborators only. Please contact the project maintainers for access.

### Our Standards

- ✅ Be respectful and inclusive
- ✅ Welcome newcomers and help them learn
- ✅ Focus on constructive feedback
- ✅ Accept responsibility and apologize for mistakes
- ✅ Prioritize the community and project success

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear descriptive title**
- **Steps to reproduce** the behavior
- **Expected behavior**
- **Actual behavior**
- **Screenshots** (if applicable)
- **Environment details** (OS, Go version, database version)
- **Error messages and logs**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear descriptive title**
- **Detailed description** of the proposed feature
- **Use cases** and benefits
- **Possible implementation approach**
- **Alternative solutions** you've considered

### Pull Requests

We actively welcome pull requests:

1. Fork the repo and create your branch from `main`
2. If you've added code, add tests
3. Ensure the test suite passes
4. Update documentation as needed
5. Issue the pull request

---

## Development Setup

### Prerequisites

- Go 1.26.2 or higher
- PostgreSQL 16+ (migrations use `NULLS NOT DISTINCT` on `units_company_parent_code_uq`)
- Redis 6+
- MinIO or S3-compatible storage
- Git

### Setup Steps

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/quokkaq-go-backend.git
cd quokkaq-go-backend

# Add upstream remote
git remote add upstream https://github.com/ORIGINAL-OWNER/quokkaq-go-backend.git

# Install dependencies
go mod download

# Copy environment configuration
cp .env.example .env
# Edit .env with your local configuration

# Run database migrations (automatic on startup)
go run cmd/api/main.go

# Run tests
go test ./...
```

---

## Coding Guidelines

### Go Style Guide

Follow the official [Effective Go](https://golang.org/doc/effective_go.html) guidelines and these project-specific rules:

#### General Principles

- **Idiomatic Go**: Write idiomatic Go code
- **Simplicity**: Prefer simple solutions over clever ones
- **Readability**: Code is read more than written
- **No Magic**: Avoid hidden behavior and implicit dependencies

#### Naming Conventions

```go
// ✅ Good: Clear, descriptive names
func CreateTicket(ctx context.Context, req CreateTicketRequest) (*Ticket, error)
type TicketService struct { ... }
var ErrTicketNotFound = errors.New("ticket not found")

// ❌ Bad: Unclear or overly abbreviated
func CrTkt(c context.Context, r CTR) (*T, error)
type TktSvc struct { ... }
var e1 = errors.New("not found")
```

#### Error Handling

```go
// ✅ Good: Always handle errors
result, err := service.DoSomething()
if err != nil {
    return nil, fmt.Errorf("failed to do something: %w", err)
}

// ❌ Bad: Ignoring errors
result, _ := service.DoSomething()
```

#### Comments

```go
// ✅ Good: Document exported types and functions
// CreateTicket creates a new ticket for the specified service.
// It returns an error if the service is not found or the unit is closed.
func CreateTicket(ctx context.Context, serviceID string) (*Ticket, error) {
    // ...
}

// ❌ Bad: No documentation for exported function
func CreateTicket(ctx context.Context, serviceID string) (*Ticket, error) {
    // ...
}
```

### Code Organization

#### Layered Architecture

Follow the established layered architecture:

```
Handler → Service → Repository → Database
```

- **Handlers**: Parse HTTP requests, validate input, call services
- **Services**: Implement business logic, orchestrate repositories
- **Repositories**: Provide data access, abstract database operations
- **Models**: Define database schemas with GORM

#### Dependency Injection

Use constructor functions for dependency injection:

```go
// ✅ Good: Constructor with dependencies
func NewTicketService(
    repo TicketRepository,
    counterRepo CounterRepository,
    hub *ws.Hub,
) *TicketService {
    return &TicketService{
        repo:        repo,
        counterRepo: counterRepo,
        hub:         hub,
    }
}

// ❌ Bad: Global state or package-level variables
var globalRepo TicketRepository
```

### API Design

#### RESTful Conventions

Follow REST best practices:

```
GET    /tickets         - List tickets
GET    /tickets/{id}    - Get ticket by ID
POST   /tickets         - Create ticket
PUT    /tickets/{id}    - Update ticket (full)
PATCH  /tickets/{id}    - Update ticket (partial)
DELETE /tickets/{id}    - Delete ticket
```

#### Request/Response DTOs

Define clear request and response types:

```go
type CreateTicketRequest struct {
    ServiceID string `json:"serviceId" binding:"required"`
    UnitID    string `json:"unitId" binding:"required"`
}

type TicketResponse struct {
    ID        string    `json:"id"`
    Number    string    `json:"number"`
    Status    string    `json:"status"`
    CreatedAt time.Time `json:"createdAt"`
}
```

#### Swagger Annotations

Document all endpoints with Swagger:

```go
// CreateTicket godoc
// @Summary Create a new ticket
// @Description Creates a new ticket for a service in a unit
// @Tags tickets
// @Accept json
// @Produce json
// @Param unitId path string true "Unit ID"
// @Param request body CreateTicketRequest true "Ticket creation request"
// @Success 201 {object} TicketResponse
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /units/{unitId}/tickets [post]
func (h *TicketHandler) CreateTicket(w http.ResponseWriter, r *http.Request) {
    // ...
}
```

### Database

#### GORM Best Practices

```go
// ✅ Good: Use context, handle errors, use transactions when needed
func (r *ticketRepository) Create(ctx context.Context, ticket *Ticket) error {
    return r.db.WithContext(ctx).Create(ticket).Error
}

// ✅ Good: Use transactions for multiple operations
func (r *ticketRepository) TransferTicket(ctx context.Context, ticketID, newCounterID string) error {
    return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        if err := tx.Model(&Ticket{}).Where("id = ?", ticketID).Update("counter_id", newCounterID).Error; err != nil {
            return err
        }
        // ... other operations
        return nil
    })
}
```

---

## Commit Messages

### Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(tickets): add ticket transfer functionality

Implement the ability to transfer tickets between counters.
Includes validation to ensure target counter can handle the service.

Closes #123

---

fix(auth): correct JWT token expiration handling

The token expiration was not being properly validated, allowing
expired tokens to be accepted.

Fixes #456

---

docs(readme): update installation instructions

Add instructions for Redis setup and MinIO configuration.
```

---

## Pull Request Process

### Before Submitting

1. ✅ Ensure all tests pass: `go test ./...`
2. ✅ Run `go fmt ./...` to format code
3. ✅ Run `go vet ./...` to check for issues
4. ✅ Update documentation if needed
5. ✅ Add tests for new functionality
6. ✅ Regenerate API docs: `swag init -g cmd/api/main.go`

### PR Template

When creating a pull request, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Description of how you tested the changes

## Checklist
- [ ] Tests pass locally
- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] API docs regenerated (if applicable)
- [ ] No new warnings
```

### Review Process

1. At least one maintainer review is required
2. All CI checks must pass
3. Address review feedback promptly
4. Keep PRs focused and reasonably sized
5. Maintain a clean commit history

---

## Project Structure

Understanding the project structure helps you navigate and contribute effectively:

```
cmd/
├── api/           - Main application
├── seed/          - Database seeding
└── test_email/    - Email testing

internal/
├── config/        - Configuration
├── handlers/      - HTTP handlers (controllers)
├── middleware/    - HTTP middleware
├── models/        - Database models
├── repository/    - Data access layer
├── services/      - Business logic
├── jobs/          - Background jobs
└── ws/            - WebSocket functionality

pkg/
└── database/      - Database utilities
```

### Adding New Modules

When adding a new module (e.g., a new entity like "Appointment"):

1. **Model**: `internal/models/appointment.go`
2. **Repository**: `internal/repository/appointment_repository.go`
3. **Service**: `internal/services/appointment_service.go`
4. **Handler**: `internal/handlers/appointment_handler.go`
5. **Routes**: Register in `cmd/api/main.go`
6. **Tests**: Add tests for each layer

---

## Testing Guidelines

### Test Organization

```go
// Example: internal/services/ticket_service_test.go
package services_test

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestTicketService_CreateTicket(t *testing.T) {
    // Arrange
    mockRepo := &MockTicketRepository{}
    service := NewTicketService(mockRepo, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
    
    // Act
    ticket, err := service.CreateTicket(ctx, request)
    
    // Assert
    assert.NoError(t, err)
    assert.NotNil(t, ticket)
    assert.Equal(t, "A001", ticket.Number)
}
```

### Testing Best Practices

- ✅ Write table-driven tests for multiple scenarios
- ✅ Use mocks/stubs for external dependencies
- ✅ Test error cases, not just happy paths
- ✅ Keep tests independent and isolated
- ✅ Name tests clearly: `TestFunctionName_Scenario_ExpectedResult`

---

## Questions?

If you have questions or need help:

- 📧 Open an issue for discussion
- 💬 Join our community chat (if available)
- 📖 Check existing documentation and issues

Thank you for contributing to QuokkaQ! 🎉
