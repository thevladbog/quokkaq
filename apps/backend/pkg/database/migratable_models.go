package database

import "quokkaq-go-backend/internal/models"

// AllMigratableModels returns the GORM model pointers passed to RunVersionedMigrations.
// Keep this list in sync with schema expectations; cmd/api and integration tests use it as the single source of truth.
func AllMigratableModels() []any {
	return []any{
		// Core models (no dependencies)
		&models.Company{},
		&models.SubscriptionPlan{},
		&models.Role{},

		// Models with foreign keys (in dependency order)
		&models.Subscription{},
		&models.Invoice{},
		&models.CatalogItem{},
		&models.InvoiceLine{},
		&models.InvoiceNumberSequence{},
		&models.UsageRecord{},
		&models.Unit{},
		&models.User{},
		&models.UserRole{},
		&models.UserUnit{},
		// Tenant RBAC & IdP group mappings (tenant = Company). Order: TenantRole → role-unit/user rows → optional TenantRole FK on group mapping.
		&models.TenantRole{},
		&models.TenantRoleUnit{},
		&models.UserTenantRole{},
		&models.CompanySSOGroupMapping{},
		&models.Service{},
		&models.Counter{},
		&models.CounterOperatorInterval{},
		&models.UnitClient{},
		&models.UnitVisitorTagDefinition{},
		&models.UnitClientTagAssignment{},
		&models.UnitClientHistory{},
		&models.Ticket{},
		&models.TicketHistory{},
		&models.TicketNumberSequence{},
		&models.Booking{},
		&models.Notification{},
		&models.AuditLog{},
		&models.UnitMaterial{},
		&models.Playlist{},
		&models.PlaylistItem{},
		&models.PlaylistSchedule{},
		&models.ExternalFeed{},
		&models.ScreenAnnouncement{},
		&models.Invitation{},
		&models.MessageTemplate{},
		&models.PasswordResetToken{},
		&models.PreRegistration{},
		&models.UnitCalendarIntegration{},
		&models.CalendarExternalSlot{},
		&models.CalendarSyncIncident{},
		&models.SlotConfig{},
		&models.WeeklySlotCapacity{},
		&models.DaySchedule{},
		&models.ServiceSlot{},
		&models.DesktopTerminal{},
		&models.UnitOperationalState{},
		&models.StatisticsDailyBucket{},
		&models.AnomalyAlert{},
		&models.StatisticsSurveyDaily{},
		&models.SupportReport{},
		&models.DeploymentSaaSSettings{},
		&models.CompanyOneCSettings{},
		&models.IntegrationAPIKey{},
		&models.WebhookEndpoint{},
		&models.WebhookDeliveryLog{},
		&models.WebhookOutbox{},
	}
}
