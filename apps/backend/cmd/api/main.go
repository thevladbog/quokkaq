package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"quokkaq-go-backend/docs"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/handlers"
	"quokkaq-go-backend/internal/jobs"
	"quokkaq-go-backend/internal/logger"
	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/services/billing"
	"quokkaq-go-backend/internal/services/commerceml"
	"quokkaq-go-backend/internal/telemetry"
	"quokkaq-go-backend/internal/ws"
	"quokkaq-go-backend/pkg/database"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/MarceloPetrucio/go-scalar-api-reference"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// @title           QuokkaQ Go Backend API
// @version         1.0
// @description     This is the backend API for QuokkaQ, rewritten in Go. Published docs are OpenAPI 3 (see /docs/openapi.json); annotations target Swagger 2 for swag, then converted.
// @termsOfService  http://swagger.io/terms/

// @contact.name    API Support
// @contact.url     http://www.swagger.io/support
// @contact.email   support@swagger.io

// @license.name    Apache 2.0
// @license.url     http://www.apache.org/licenses/LICENSE-2.0.html

// @host            localhost:3001
// @BasePath        /

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}

func run() error {
	config.Load()
	logger.Init()
	if err := database.Connect(); err != nil {
		return err
	}

	runAutoMigrate := true
	if v := os.Getenv("RUN_AUTO_MIGRATE"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			runAutoMigrate = b
		} else {
			// Unrecognized values keep migrations enabled (same as unset; only explicit false opts out).
			runAutoMigrate = true
		}
	}
	if runAutoMigrate {
		// Use versioned migrations with tracking
		err := database.RunVersionedMigrations(database.AllMigratableModels()...)
		if err != nil {
			logger.Error("failed to run migrations", "err", err)
			return fmt.Errorf("failed to run migrations: %w", err)
		}
	}

	hub := ws.NewHub()
	go hub.Run()

	jobClient := jobs.NewJobClient()
	defer func() {
		if err := jobClient.Close(); err != nil {
			slog.Error("error closing job client", "err", err)
		}
	}()
	// jobEnqueuerAdapter bridges jobs.JobClient to services.JobEnqueuer without circular imports.
	jobEnqueuerAdapter := &jobEnqueuerAdapter{client: jobClient}

	storageService := services.NewStorageService()
	ttsService := services.NewTtsService(storageService)

	userRepo := repository.NewUserRepository()
	unitRepo := repository.NewUnitRepository()
	signageRepo := repository.NewSignageRepository()
	signageService := services.NewSignageService(signageRepo, unitRepo, hub)
	ticketRepo := repository.NewTicketRepository()
	serviceRepo := repository.NewServiceRepository()
	counterRepo := repository.NewCounterRepository()
	bookingRepo := repository.NewBookingRepository()
	templateRepo := repository.NewTemplateRepository()
	invitationRepo := repository.NewInvitationRepository()
	slotRepo := repository.NewSlotRepository()
	preRegRepo := repository.NewPreRegistrationRepository()
	calendarIntegrationRepo := repository.NewCalendarIntegrationRepository()
	desktopTerminalRepo := repository.NewDesktopTerminalRepository()
	subscriptionRepo := repository.NewSubscriptionRepository()
	invoiceRepo := repository.NewInvoiceRepository()
	catalogRepo := repository.NewCatalogRepository()
	companyRepo := repository.NewCompanyRepository()
	onecSettingsRepo := repository.NewOneCSettingsRepository()
	onecSessionStore := commerceml.NewSessionStore(2 * time.Hour)
	slog.Info("CommerceML checkauth sessions use in-memory storage; multiple API replicas require sticky routing or a future shared session backend")
	operatorIntervalRepo := repository.NewOperatorIntervalRepository()

	notifRepo := repository.NewNotificationRepository()

	userService := services.NewUserService(userRepo, companyRepo)
	deploymentSetupService := services.NewDeploymentSetupService(userRepo, companyRepo)
	mailService := services.NewMailService()
	tenantRBACRepo := repository.NewTenantRBACRepository()
	deploymentSaaSSettingsRepo := repository.NewDeploymentSaaSSettingsRepository()
	deploymentSaaSSettingsService := services.NewDeploymentSaaSSettingsService(deploymentSaaSSettingsRepo)

	trackerClient := services.NewYandexTrackerClientFromEnv()
	leadIssueService := services.NewLeadIssueService(deploymentSaaSSettingsRepo, trackerClient)
	authService, err := services.NewAuthService(userRepo, companyRepo, mailService, subscriptionRepo, tenantRBACRepo, leadIssueService)
	if err != nil {
		logger.Error("auth service", "err", err)
		return fmt.Errorf("auth service: %w", err)
	}
	ssoRepo := repository.NewSSORepository()
	ssoService := services.NewSSOService(companyRepo, userRepo, ssoRepo, unitRepo, tenantRBACRepo, authService)
	unitClientRepo := repository.NewUnitClientRepository()
	visitorTagDefRepo := repository.NewVisitorTagDefinitionRepository()
	unitClientHistRepo := repository.NewUnitClientHistoryRepository()
	unitClientService := services.NewUnitClientService(unitClientRepo, visitorTagDefRepo, unitClientHistRepo, database.DB)
	quotaService := services.NewQuotaService()
	unitService := services.NewUnitServiceWithQuota(unitRepo, unitClientService, tenantRBACRepo, quotaService)
	visitorTagDefService := services.NewVisitorTagDefinitionService(visitorTagDefRepo)
	calendarIntegrationService := services.NewCalendarIntegrationService(calendarIntegrationRepo, serviceRepo, unitRepo, mailService)
	auditLogRepo := repository.NewAuditLogRepository()
	opStateRepo := repository.NewOperationalStateRepository()
	statsRepo := repository.NewStatisticsRepository()
	statsSegmentsRepo := repository.NewStatisticsTicketSegmentsRepository()
	operatorSkillRepo := repository.NewOperatorSkillRepository()
	statsRefresh := services.NewStatisticsRefreshService(statsRepo, unitRepo, opStateRepo, statsSegmentsRepo)
	operationalService := services.NewOperationalService(opStateRepo, unitRepo, statsRefresh)
	ticketService := services.NewTicketServiceWithQuota(ticketRepo, counterRepo, serviceRepo, unitRepo, operatorIntervalRepo, unitClientRepo, visitorTagDefRepo, unitClientHistRepo, preRegRepo, operatorSkillRepo, calendarIntegrationService, hub, jobEnqueuerAdapter, quotaService, operationalService)
	notificationService := services.NewNotificationService(notifRepo, unitRepo, unitClientRepo, jobEnqueuerAdapter, deploymentSaaSSettingsService)
	ticketService.SetNotificationService(notificationService)
	anomalyAlertRepo := repository.NewAnomalyAlertRepository()
	anomalyService := services.NewAnomalyService(database.DB, hub, unitRepo, anomalyAlertRepo)
	jobWorker := jobs.NewJobWorkerWithSMS(ttsService, ticketRepo, notifRepo, deploymentSaaSSettingsService)
	// Wire notification service into the Asynq worker so visitor:notify jobs can delegate to it.
	jobs.WithNotificationService(jobWorker, notificationService)
	jobs.WithAnomalyService(jobWorker, anomalyService)
	jobs.WithSignageService(jobWorker, signageService)
	if err := jobWorker.Start(); err != nil {
		return err
	}
	defer jobWorker.Stop()
	serviceService := services.NewServiceServiceWithQuota(serviceRepo, unitRepo, quotaService)
	counterService := services.NewCounterServiceWithQuota(counterRepo, ticketRepo, serviceRepo, userRepo, operatorIntervalRepo, unitRepo, operatorSkillRepo, hub, quotaService)
	bookingService := services.NewBookingService(bookingRepo)
	statsService := services.NewStatisticsService(statsRepo, opStateRepo, statsSegmentsRepo, anomalyAlertRepo)
	refreshCtx, refreshCancel := context.WithCancel(context.Background())
	defer refreshCancel()
	statsRefresh.StartPeriodicRefresh(refreshCtx)
	go func() {
		if err := jobClient.EnqueueAnomalyCheck(); err != nil {
			slog.Error("EnqueueAnomalyCheck", "err", err)
		}
		ticker := time.NewTicker(anomalyService.AnomalyCheckInterval())
		defer ticker.Stop()
		for {
			select {
			case <-refreshCtx.Done():
				return
			case <-ticker.C:
				if err := jobClient.EnqueueAnomalyCheck(); err != nil {
					slog.Error("EnqueueAnomalyCheck", "err", err)
				}
			}
		}
	}()
	go func() {
		if err := jobClient.EnqueueWebhookFlushOutbox(); err != nil {
			slog.Error("EnqueueWebhookFlushOutbox", "err", err)
		}
		ticker := time.NewTicker(12 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-refreshCtx.Done():
				return
			case <-ticker.C:
				if err := jobClient.EnqueueWebhookFlushOutbox(); err != nil {
					slog.Error("EnqueueWebhookFlushOutbox", "err", err)
				}
			}
		}
	}()
	go func() {
		if err := jobClient.EnqueueSignageFeedPoll(); err != nil {
			slog.Error("EnqueueSignageFeedPoll", "err", err)
		}
		feedTick := time.NewTicker(60 * time.Second)
		defer feedTick.Stop()
		for {
			select {
			case <-refreshCtx.Done():
				return
			case <-feedTick.C:
				if err := jobClient.EnqueueSignageFeedPoll(); err != nil {
					slog.Error("EnqueueSignageFeedPoll", "err", err)
				}
			}
		}
	}()
	slaMonitor := services.NewSlaMonitorService(ticketRepo, hub)
	slaMonitor.Start(refreshCtx)
	go func() {
		ticker := time.NewTicker(3 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-refreshCtx.Done():
				return
			case <-ticker.C:
				rows, err := calendarIntegrationRepo.ListEnabled()
				if err != nil {
					slog.Error("calendar ListEnabled", "err", err)
					continue
				}
				for i := range rows {
					iid := rows[i].ID
					if err := calendarIntegrationService.SyncIntegration(context.Background(), iid); err != nil {
						slog.Error("calendar SyncIntegration", "integration_id", iid, "err", err)
					}
				}
			}
		}
	}()
	shiftService := services.NewShiftService(ticketRepo, counterRepo, serviceRepo, auditLogRepo, operatorIntervalRepo, hub, userRepo)
	templateService := services.NewTemplateService(templateRepo)
	invitationService := services.NewInvitationServiceWithQuota(invitationRepo, mailService, userRepo, unitRepo, templateService, quotaService)
	slotService := services.NewSlotService(slotRepo, preRegRepo)
	preRegService := services.NewPreRegistrationService(preRegRepo, slotRepo, ticketRepo, serviceRepo, calendarIntegrationService)
	desktopTerminalService := services.NewDesktopTerminalService(desktopTerminalRepo, unitRepo, counterRepo)
	surveyRepo := repository.NewSurveyRepository()
	surveyService := services.NewSurveyService(surveyRepo, unitRepo, userRepo, ticketRepo, desktopTerminalRepo, counterRepo, storageService)
	userHandler := handlers.NewUserHandler(userService, userRepo, unitRepo, deploymentSetupService, storageService)
	authHandler := handlers.NewAuthHandlerWithSubscription(authService, userService, userRepo, tenantRBACRepo, leadIssueService, subscriptionRepo)
	integrationsHandler := handlers.NewIntegrationsHandler(deploymentSaaSSettingsService)
	leadHandler := handlers.NewLeadHandler(leadIssueService)
	ssoHandler := handlers.NewSSOHandler(ssoService)
	companySSOHTTP := handlers.NewCompanySSOHTTP(ssoService, userRepo, companyRepo)
	tenantRBACHTTP := handlers.NewTenantRBACHTTP(tenantRBACRepo, userRepo, ssoService)
	unitHandler := handlers.NewUnitHandler(unitService, storageService, operationalService, userRepo).WithWebSocketHub(hub)
	signageHandler := handlers.NewSignageHandler(signageService, unitRepo)
	etaService := services.NewETAServiceFull(ticketRepo, counterRepo, serviceRepo, unitRepo, statsRepo)
	predictionService := services.NewPredictionService(database.DB, hub, etaService, unitRepo, ticketRepo)
	etaBroadcaster := services.NewETABroadcaster(etaService, hub, 0)
	etaBroadcaster.SetAfterFlush(func(unitID string) {
		uid := unitID
		go func() {
			ctx, cancel := context.WithTimeout(refreshCtx, 15*time.Second)
			defer cancel()
			predictionService.MaybeBroadcastStaffingAlert(ctx, uid)
		}()
	})
	services.WireTicketServiceETAScheduler(ticketService, etaBroadcaster)
	services.WireCounterServiceETAScheduler(counterService, etaBroadcaster)
	ticketHandler := handlers.NewTicketHandlerFull(ticketService, operationalService, etaService, unitService, database.DB).WithSettingsService(deploymentSaaSSettingsService)
	serviceHandler := handlers.NewServiceHandler(serviceService, userRepo)
	counterHandler := handlers.NewCounterHandler(counterService, counterRepo, operationalService, userRepo, unitRepo)
	bookingHandler := handlers.NewBookingHandler(bookingService, userRepo)
	shiftHandler := handlers.NewShiftHandler(shiftService, operationalService)
	statisticsHandler := handlers.NewStatisticsHandler(statsService, userRepo, unitRepo)
	statisticsExportHandler := handlers.NewStatisticsExportHandler(statsService, userRepo, unitRepo)
	operatorSkillHandler := handlers.NewOperatorSkillHandler(operatorSkillRepo, userRepo, serviceRepo)
	operationsHandler := handlers.NewOperationsHandler(operationalService, userRepo, auditLogRepo)
	templateHandler := handlers.NewTemplateHandler(templateService, userRepo)
	invitationHandler := handlers.NewInvitationHandler(invitationService, userRepo)
	slotHandler := handlers.NewSlotHandler(slotService, calendarIntegrationService)
	preRegHandler := handlers.NewPreRegistrationHandler(preRegService, ticketService)
	calendarIntegrationHandler := handlers.NewCalendarIntegrationHandler(calendarIntegrationService, userRepo)
	integrationAPIKeyRepo := repository.NewIntegrationAPIKeyRepository(database.DB)
	webhookEndpointRepo := repository.NewWebhookEndpointRepository(database.DB)
	integrationAPIKeysHandler := handlers.NewIntegrationAPIKeysHandler(database.DB, integrationAPIKeyRepo, userRepo, unitRepo)
	webhookEndpointsHandler := handlers.NewWebhookEndpointsHandler(database.DB, webhookEndpointRepo, userRepo, unitRepo)
	webhookDeliveryLogsHandler := handlers.NewWebhookDeliveryLogsHandler(database.DB, userRepo)
	publicWidgetTokenHandler := handlers.NewPublicWidgetTokenHandler(database.DB, userRepo, unitRepo)
	unitClientHandler := handlers.NewUnitClientHandler(unitClientService, ticketService)
	visitorTagHandler := handlers.NewVisitorTagHandler(visitorTagDefService)
	uploadHandler := handlers.NewUploadHandler(storageService)
	desktopTerminalHandler := handlers.NewDesktopTerminalHandler(desktopTerminalService, userRepo, unitRepo)
	surveyHandler := handlers.NewSurveyHandler(surveyService, storageService)
	guestSurveyHandler := handlers.NewGuestSurveyHandler(surveyService)
	counterBoardHandler := handlers.NewCounterBoardHandler(surveyService)
	usageHandler := handlers.NewUsageHandler(quotaService, userRepo)

	supportReportRepo := repository.NewSupportReportRepository()
	supportReportShareRepo := repository.NewSupportReportShareRepository()
	planeClient := services.NewPlaneClientFromEnv()
	supportReportCreatePlatform := services.ParseSupportReportCreatePlatform()
	supportReportService := services.NewSupportReportService(supportReportRepo, supportReportShareRepo, planeClient, trackerClient, deploymentSaaSSettingsRepo, supportReportCreatePlatform, userRepo, tenantRBACRepo, companyRepo)
	supportReportHandler := handlers.NewSupportReportHandler(supportReportService)

	var paymentProvider services.PaymentProvider
	stripeKey := strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY"))
	if stripeKey != "" {
		billingOff := false
		switch strings.ToLower(strings.TrimSpace(os.Getenv("BILLING_ENABLED"))) {
		case "false", "0", "no":
			billingOff = true
		}
		if !billingOff {
			paymentProvider = services.NewStripeProvider(stripeKey, strings.TrimSpace(os.Getenv("STRIPE_WEBHOOK_SECRET")))
		}
	}
	subscriptionSvc := services.NewSubscriptionService(subscriptionRepo, userRepo, companyRepo, leadIssueService)
	subscriptionHandler := handlers.NewSubscriptionHandler(subscriptionRepo, userRepo, companyRepo, unitRepo, paymentProvider, subscriptionSvc)
	yShop := strings.TrimSpace(os.Getenv("YOOKASSA_SHOP_ID"))
	ySecret := strings.TrimSpace(os.Getenv("YOOKASSA_SECRET_KEY"))
	yWebhook := strings.TrimSpace(os.Getenv("YOOKASSA_WEBHOOK_SECRET"))
	yReturn := strings.TrimSpace(os.Getenv("YOOKASSA_PAYMENT_RETURN_URL"))
	pubApp := strings.TrimSpace(os.Getenv("PUBLIC_APP_URL"))

	// Return URL: YOOKASSA_PAYMENT_RETURN_URL or PUBLIC_APP_URL (see InvoiceHandler.RequestYooKassaPaymentLink).
	// Local dev only: if both are empty and APP_ENV allows, the handler uses a localhost placeholder (never in production/staging).
	// Webhook HMAC may use YOOKASSA_WEBHOOK_SECRET or fall back to YOOKASSA_SECRET_KEY (.env.example / internal/services/billing).
	yookassaInvoiceReady := yShop != "" && ySecret != "" && (yReturn != "" || pubApp != "" || config.AppEnvAllowsYooKassaDevReturnURLFallback())

	var yooInvoice *billing.YooKassaInvoiceClient
	if yookassaInvoiceReady {
		yooInvoice = billing.NewYooKassaInvoiceClient(yShop, ySecret, yWebhook)
	} else if yShop != "" || ySecret != "" || yWebhook != "" || yReturn != "" {
		slog.Warn("YooKassa invoice integration disabled: incomplete env (need non-empty YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, and YOOKASSA_PAYMENT_RETURN_URL or PUBLIC_APP_URL (unless APP_ENV is local dev for localhost fallback only); optional YOOKASSA_WEBHOOK_SECRET falls back to shop secret)")
	}

	invoiceHandler := handlers.NewInvoiceHandler(
		invoiceRepo,
		companyRepo,
		userRepo,
		yooInvoice,
		yReturn,
		pubApp,
	)
	companyHandler := handlers.NewCompanyHandler(companyRepo, userRepo, tenantRBACRepo, database.DB)
	screenLayoutTemplateRepo := repository.NewScreenLayoutTemplateRepository()
	screenLayoutTemplateService := services.NewScreenLayoutTemplateService(screenLayoutTemplateRepo)
	screenLayoutTemplateHandler := handlers.NewScreenLayoutTemplateHandler(screenLayoutTemplateService, userRepo)
	onecSettingsHandler := handlers.NewOneCSettingsHandler(companyRepo, onecSettingsRepo)
	commerceMLExchangeHandler := handlers.NewCommerceMLExchangeHandler(companyRepo, invoiceRepo, onecSettingsRepo, onecSessionStore)
	platformHandler := handlers.NewPlatformHandler(companyRepo, subscriptionRepo, invoiceRepo, catalogRepo)
	dadataHandler := handlers.NewDaDataHandler()

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if id := middleware.GetReqID(r.Context()); id != "" {
				w.Header().Set(middleware.RequestIDHeader, id)
			}
			next.ServeHTTP(w, r)
		})
	})
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(authmiddleware.LocaleMiddleware)

	allowedOrigins := config.ParseCORSAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://localhost:3010",
			"http://127.0.0.1:3010",
			"http://localhost:3001",
			"http://127.0.0.1:3001",
			"https://quokkaq.v-b.tech",
			"https://app.quokkaq.v-b.tech",
		}
	}
	ws.SetWebSocketAllowedOrigins(allowedOrigins)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Accept-Language", "Authorization", "Content-Type", "X-CSRF-Token", "X-Company-Id", "X-Request-Id", "X-Setup-Token", "traceparent", "tracestate"},
		ExposedHeaders:   []string{"Link", "X-Request-Id", "Content-Disposition", "traceparent", "tracestate"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health/live", healthLive)
	r.Head("/health/live", healthLiveHead)
	r.Get("/health/ready", healthReady)
	r.Head("/health/ready", healthReadyHead)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte("Hello from QuokkaQ Go Backend!")); err != nil {
			slog.ErrorContext(r.Context(), "error writing response", "err", err)
		}
	})

	r.Post("/webhooks/yookassa", handlers.ServeYooKassaWebhook)

	// CommerceML exchange: 1C UNF uses GET and POST on the same URL; constrain methods and rate-limit (see SSOPublicRateLimit).
	mlExchange := http.HandlerFunc(commerceMLExchangeHandler.ServeHTTP)
	r.With(authmiddleware.SSOPublicRateLimit).Post("/commerceml/exchange", mlExchange)
	r.With(authmiddleware.SSOPublicRateLimit).Get("/commerceml/exchange", mlExchange)

	r.Route("/public", func(r chi.Router) {
		r.Use(authmiddleware.SSOPublicRateLimit)
		r.Get("/tenants/{slug}", ssoHandler.PublicTenant)
		r.Post("/leads/request", leadHandler.PostPublicLeadRequest)
	})

	r.Get("/ws", authmiddleware.WebSocketHandler(hub, userRepo))

	r.Get("/swagger/*", func(w http.ResponseWriter, r *http.Request) {
		htmlContent, err := scalar.ApiReferenceHTML(&scalar.Options{
			SpecContent: string(docs.OpenAPIJSON),
			CustomOptions: scalar.CustomOptions{
				PageTitle: "QuokkaQ API Reference",
			},
			DarkMode: true,
		})
		if err != nil {
			http.Error(w, "Failed to render API reference", http.StatusInternalServerError)
			return
		}
		if _, err := fmt.Fprintln(w, htmlContent); err != nil {
			slog.ErrorContext(r.Context(), "error writing API reference", "err", err)
		}
	})

	// openapi.json is the canonical spec; swagger.json is a backward-compatible alias.
	// Both are served from the embedded bytes (docs.OpenAPIJSON) so the binary has no
	// working-directory dependency.
	serveSpec := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if _, err := w.Write(docs.OpenAPIJSON); err != nil {
			slog.ErrorContext(r.Context(), "error writing OpenAPI spec", "err", err)
		}
	}
	r.Get("/docs/openapi.json", serveSpec)
	r.Get("/docs/swagger.json", serveSpec)

	r.Route("/auth", func(r chi.Router) {
		r.Post("/login", authHandler.Login)
		r.Post("/signup", authHandler.Signup)
		r.Post("/logout", authHandler.Logout)
		r.With(authmiddleware.SSOPublicRateLimit).Post("/login/tenant-hint", ssoHandler.TenantHint)
		r.With(authmiddleware.SSOPublicRateLimit).Get("/login-context", ssoHandler.LoginContext)
		r.With(authmiddleware.SSOPublicRateLimit).Get("/sso/authorize", ssoHandler.SSOAuthorize)
		r.With(authmiddleware.SSOPublicRateLimit).Get("/saml/metadata", ssoHandler.SAMLMetadata)
		r.With(authmiddleware.SSOPublicRateLimit).Post("/saml/acs", ssoHandler.SAMLACS)
		// Callback uses SSOCallbackRateLimit (softer than SSOPublicRateLimit): IdP redirect chains can hit this route more often than typical API calls. See middleware/sso_ratelimit.go.
		r.With(authmiddleware.SSOCallbackRateLimit).Get("/sso/callback", ssoHandler.SSOCallback)
		r.With(authmiddleware.SSOPublicRateLimit).Post("/sso/exchange", ssoHandler.SSOExchange)
		r.Post("/refresh", authHandler.Refresh)
		r.Post("/forgot-password", authHandler.RequestPasswordReset)
		r.Post("/reset-password", authHandler.ResetPassword)
		r.With(authmiddleware.TerminalBootstrapRateLimit).Post("/terminal/bootstrap", desktopTerminalHandler.Bootstrap)

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Get("/me", authHandler.GetMe)
			r.Patch("/me", authHandler.PatchMe)
			r.Get("/accessible-companies", authHandler.ListAccessibleCompanies)
		})
	})

	// Google Calendar OAuth browser callback (must match GOOGLE_CALENDAR_OAUTH_REDIRECT_URL path on API origin, not under /auth).
	r.With(authmiddleware.SSOCallbackRateLimit).Get("/calendar-integrations/google/oauth/callback", calendarIntegrationHandler.GoogleOAuthCallback)
	r.With(authmiddleware.SSOCallbackRateLimit).Get("/calendar-integrations/microsoft/oauth/callback", calendarIntegrationHandler.MicrosoftOAuthCallback)

	r.Route("/system", func(r chi.Router) {
		r.Get("/status", userHandler.GetSystemStatus)
		r.With(authmiddleware.SSOPublicRateLimit, authmiddleware.SetupWizardTokenGate).Get("/health", userHandler.GetSystemHealth)
		r.With(authmiddleware.SSOPublicRateLimit, authmiddleware.SetupWizardTokenGate).Post("/setup", userHandler.SetupFirstAdmin)
	})

	r.Route("/users", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Use(authmiddleware.RequireTenantPermission(userRepo, tenantRBACRepo, rbac.PermUsersManage))
		r.Post("/", userHandler.CreateUser)
		r.Get("/", userHandler.GetAllUsers)
		r.Get("/{id}", userHandler.GetUserByID)
		r.Patch("/{id}", userHandler.UpdateUser)
		r.Delete("/{id}", userHandler.DeleteUser)
		r.Get("/{id}/units", userHandler.GetUserUnits)
		r.Post("/{id}/units/assign", userHandler.AssignUnit)
		r.Post("/{id}/units/remove", userHandler.RemoveUnit)
	})

	r.Route("/units", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Get("/", unitHandler.GetAllUnits)
			r.Get("/{id}", unitHandler.GetUnitByID)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTerminalUnitMatchOrUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermTicketsWrite))
			r.Post("/{unitId}/tickets", ticketHandler.CreateTicket)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTerminalUnitMatchOrUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermTicketsRead))
			r.Get("/{unitId}/tickets", ticketHandler.GetTicketsByUnit)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTerminalUnitMatchOrUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermAccessKiosk))
			r.Get("/{unitId}/services", serviceHandler.GetServicesByUnit)
			r.Get("/{unitId}/services-tree", serviceHandler.GetServicesByUnit)
			r.Post("/{unitId}/kiosk-printer-telemetry", unitHandler.PostKioskPrinterTelemetry)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTerminalUnitMatchOrUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermAccessStaffPanel))
			r.Get("/{unitId}/counters", counterHandler.GetCountersByUnit)
		})

		r.With(authmiddleware.PublicAPIRateLimit).Get("/{unitId}/materials", unitHandler.GetMaterials)
		r.With(authmiddleware.PublicAPIRateLimit).Get("/{unitId}/active-playlist", signageHandler.ActivePlaylistPublic)
		r.With(authmiddleware.PublicAPIRateLimit).Get("/{unitId}/public-screen-announcements", signageHandler.ListAnnouncementsPublic)
		r.With(authmiddleware.PublicAPIRateLimit).Get("/{unitId}/feeds/{feedId}/data", signageHandler.PublicFeedData)
		r.With(authmiddleware.PublicAPIRateLimit).Get("/{unitId}/queue-status", ticketHandler.GetUnitQueueStatus)
		r.With(authmiddleware.PublicAPIRateLimit).Post("/{unitId}/virtual-queue", ticketHandler.JoinVirtualQueue)

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitAnyPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", []string{rbac.PermUnitTicketScreenManage, rbac.PermUnitSignageManage}))
			r.Get("/{unitId}/signage-health", signageHandler.SignageHealth)
			r.Get("/{unitId}/playlists", signageHandler.ListPlaylists)
			r.Get("/{unitId}/playlists/{playlistId}", signageHandler.GetPlaylist)
			r.Post("/{unitId}/playlists", signageHandler.CreatePlaylist)
			r.Put("/{unitId}/playlists/{playlistId}", signageHandler.UpdatePlaylist)
			r.Delete("/{unitId}/playlists/{playlistId}", signageHandler.DeletePlaylist)
			r.Get("/{unitId}/playlist-schedules", signageHandler.ListSchedules)
			r.Get("/{unitId}/playlist-schedules/{scheduleId}", signageHandler.GetSchedule)
			r.Post("/{unitId}/playlist-schedules", signageHandler.CreateSchedule)
			r.Put("/{unitId}/playlist-schedules/{scheduleId}", signageHandler.UpdateSchedule)
			r.Delete("/{unitId}/playlist-schedules/{scheduleId}", signageHandler.DeleteSchedule)
			r.Get("/{unitId}/feeds", signageHandler.ListFeeds)
			r.Post("/{unitId}/feeds", signageHandler.CreateFeed)
			r.Put("/{unitId}/feeds/{feedId}", signageHandler.UpdateFeed)
			r.Delete("/{unitId}/feeds/{feedId}", signageHandler.DeleteFeed)
			r.Get("/{unitId}/screen-announcements", signageHandler.ListAnnouncements)
			r.Post("/{unitId}/screen-announcements", signageHandler.CreateAnnouncement)
			r.Put("/{unitId}/screen-announcements/{annId}", signageHandler.UpdateAnnouncement)
			r.Delete("/{unitId}/screen-announcements/{annId}", signageHandler.DeleteAnnouncement)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermUnitSettingsManage))
			r.Get("/{unitId}/pre-registrations/slots", preRegHandler.GetAvailableSlots)
			r.Post("/{unitId}/pre-registrations", preRegHandler.Create)
		})
		r.With(authmiddleware.PublicAPIRateLimit).Post("/{unitId}/pre-registrations/validate", preRegHandler.Validate)
		r.With(authmiddleware.PublicAPIRateLimit).Post("/{unitId}/pre-registrations/redeem", preRegHandler.Redeem)

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireAdminTerminalOrUnitMemberForUnit(userRepo, "unitId"))
			r.Patch("/{unitId}/kiosk-config", unitHandler.PatchUnitKioskConfig)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTerminalWithCounter("unitId"))
			r.Get("/{unitId}/guest-survey/session", guestSurveyHandler.Session)
			r.Post("/{unitId}/guest-survey/responses", guestSurveyHandler.SubmitResponse)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTerminalUnitMatch("unitId"))
			r.Get("/{unitId}/counter-board/session", counterBoardHandler.Session)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireGuestSurveyCompletionImageRead(userRepo, "unitId"))
			r.Get("/{unitId}/guest-survey/completion-images/{fileName}", surveyHandler.GetSurveyCompletionImage)
			r.Get("/{unitId}/guest-survey/idle-media/{fileName}", surveyHandler.GetSurveyIdleMedia)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTenantAdmin(userRepo, tenantRBACRepo))
			r.Post("/", unitHandler.CreateUnit)
			r.Patch("/{id}", unitHandler.UpdateUnit)
			r.Delete("/{id}", unitHandler.DeleteUnit)
		})

		// Staff operational (queue, shift, clients)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermAccessStaffPanel))
			r.Post("/{unitId}/call-next", ticketHandler.CallNext)
			r.Get("/{unitId}/bookings", bookingHandler.GetBookingsByUnit)
			r.Get("/{unitId}/shift/dashboard", shiftHandler.GetDashboardStats)
			r.Get("/{unitId}/shift/queue", shiftHandler.GetQueueTickets)
			r.Get("/{unitId}/child-workplaces", unitHandler.GetUnitChildWorkplaces)
			r.Get("/{unitId}/child-units", unitHandler.GetUnitChildUnits)
			r.Get("/{unitId}/shift/counters", shiftHandler.GetShiftCounters)
			r.Get("/{unitId}/shift/activity/actors", shiftHandler.ListShiftActivityActors)
			r.Get("/{unitId}/shift/activity", shiftHandler.GetShiftActivity)
			r.Post("/{unitId}/shift/eod", shiftHandler.ExecuteEndOfDay)
			r.Get("/{unitId}/clients/search", unitClientHandler.SearchClients)
			r.Get("/{unitId}/clients/{clientId}/history", unitClientHandler.ListClientHistory)
			r.Get("/{unitId}/clients/{clientId}/visits", unitClientHandler.ListClientVisits)
			r.Get("/{unitId}/clients/{clientId}/survey-responses", surveyHandler.ListResponsesForClient)
			r.Get("/{unitId}/clients", unitClientHandler.ListUnitClients)
			r.Get("/{unitId}/clients/{clientId}", unitClientHandler.GetUnitClient)
			r.Patch("/{unitId}/clients/{clientId}", unitClientHandler.PatchUnitClient)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermUnitSettingsManage))
			r.Post("/{unitId}/materials", unitHandler.AddMaterial)
			r.Delete("/{unitId}/materials/{materialId}", unitHandler.DeleteMaterial)
			r.Patch("/{unitId}/ad-settings", unitHandler.UpdateAdSettings)
			r.Get("/{unitId}/pre-registrations", preRegHandler.GetByUnit)
			r.Get("/{unitId}/pre-registrations/calendar-slots", preRegHandler.GetCalendarSlots)
			r.Put("/{unitId}/pre-registrations/{id}", preRegHandler.Update)
			r.Get("/{unitId}/visitor-tag-definitions", visitorTagHandler.ListVisitorTagDefinitions)
			r.Post("/{unitId}/visitor-tag-definitions", visitorTagHandler.CreateVisitorTagDefinition)
			r.Patch("/{unitId}/visitor-tag-definitions/{definitionId}", visitorTagHandler.PatchVisitorTagDefinition)
			r.Delete("/{unitId}/visitor-tag-definitions/{definitionId}", visitorTagHandler.DeleteVisitorTagDefinition)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermUnitGridManage))
			r.Get("/{unitId}/slots/config", slotHandler.GetConfig)
			r.Put("/{unitId}/slots/config", slotHandler.UpdateConfig)
			r.Get("/{unitId}/slots/capacities", slotHandler.GetCapacities)
			r.Put("/{unitId}/slots/capacities", slotHandler.UpdateCapacities)
			r.Post("/{unitId}/slots/generate", slotHandler.Generate)
			r.Get("/{unitId}/slots/day/{date}", slotHandler.GetDay)
			r.Put("/{unitId}/slots/day/{date}", slotHandler.UpdateDay)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermCalendarManage))
			r.Get("/{unitId}/calendar-integration", calendarIntegrationHandler.Get)
			r.Put("/{unitId}/calendar-integration", calendarIntegrationHandler.Put)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermUnitServicesManage))
			r.Post("/{unitId}/counters", counterHandler.CreateCounter)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermSurveyManage))
			r.Get("/{unitId}/surveys", surveyHandler.ListDefinitions)
			r.Post("/{unitId}/surveys", surveyHandler.CreateDefinition)
			r.Post("/{unitId}/survey-completion-images", surveyHandler.UploadCompletionImage)
			r.Post("/{unitId}/guest-survey/idle-media", surveyHandler.UploadIdleMedia)
			r.Delete("/{unitId}/guest-survey/idle-media/{fileName}", surveyHandler.DeleteSurveyIdleMedia)
			r.Patch("/{unitId}/surveys/{surveyId}", surveyHandler.PatchDefinition)
			r.Post("/{unitId}/surveys/{surveyId}/activate", surveyHandler.ActivateDefinition)
			r.Get("/{unitId}/survey-responses", surveyHandler.ListResponses)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitStatisticsAccess(userRepo, tenantRBACRepo, unitRepo))
			r.Get("/{unitId}/statistics/timeseries", statisticsHandler.GetTimeseries)
			r.Get("/{unitId}/statistics/sla-deviations", statisticsHandler.GetSLADeviations)
			r.Get("/{unitId}/statistics/load", statisticsHandler.GetLoad)
			r.Get("/{unitId}/statistics/tickets-by-service", statisticsHandler.GetTicketsByService)
			r.Get("/{unitId}/statistics/sla-summary", statisticsHandler.GetSlaSummary)
			r.Get("/{unitId}/statistics/sla-heatmap", statisticsHandler.GetSLAHeatmap)
			r.Get("/{unitId}/statistics/utilization", statisticsHandler.GetUtilization)
			r.Get("/{unitId}/statistics/survey-scores", statisticsHandler.GetSurveyScores)
			r.Get("/{unitId}/statistics/employee-radar", statisticsHandler.GetEmployeeRadar)
			r.Get("/{unitId}/statistics/staff-performance", statisticsHandler.GetStaffPerformanceList)
			r.Get("/{unitId}/statistics/staff-performance/{userId}", statisticsHandler.GetStaffPerformanceDetail)
			r.Get("/{unitId}/statistics/staffing-forecast", statisticsHandler.GetStaffingForecast)
			r.Get("/{unitId}/statistics/anomaly-alerts", statisticsHandler.GetAnomalyAlerts)
			r.Get("/{unitId}/statistics/export/pdf", statisticsExportHandler.ExportPDF)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireUnitPermission(userRepo, tenantRBACRepo, unitRepo, "unitId", rbac.PermUnitSettingsManage))
			r.Get("/{unitId}/operator-skills", operatorSkillHandler.ListOperatorSkills)
			r.Put("/{unitId}/operator-skills", operatorSkillHandler.UpsertOperatorSkills)
			r.Delete("/{unitId}/operator-skills/{skillId}", operatorSkillHandler.DeleteOperatorSkill)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTenantAdmin(userRepo, tenantRBACRepo))
			r.Get("/{unitId}/operations/status", operationsHandler.GetOperationsStatus)
			r.Post("/{unitId}/operations/emergency-unlock", operationsHandler.PostEmergencyUnlock)
			r.Post("/{unitId}/operations/clear-statistics-quiet", operationsHandler.PostClearStatisticsQuiet)
		})
	})

	r.Route("/integrations/v1", func(r chi.Router) {
		r.Use(authmiddleware.IntegrationAPIKeyAuth(database.DB))
		r.Use(authmiddleware.IntegrationAPIRateLimit)
		r.Use(authmiddleware.RequireIntegrationUnitBelongsToCompany(unitRepo, "unitId"))
		r.With(authmiddleware.RequireIntegrationAPIScope("tickets:read"), authmiddleware.RequireIntegrationUnitURLMatch("unitId")).Get("/units/{unitId}/tickets", ticketHandler.GetTicketsByUnit)
		r.With(authmiddleware.RequireIntegrationAPIScope("tickets:read"), authmiddleware.RequireIntegrationUnitURLMatch("unitId")).Get("/units/{unitId}/queue-summary", ticketHandler.GetIntegrationUnitQueueSummary)
		r.With(authmiddleware.RequireIntegrationAPIScope("tickets:write"), authmiddleware.RequireIntegrationUnitURLMatch("unitId")).Post("/units/{unitId}/tickets", ticketHandler.CreateTicket)
	})

	r.Route("/services", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Post("/", serviceHandler.CreateService)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireServiceUnit(userRepo, serviceRepo))
			r.Get("/{id}", serviceHandler.GetServiceByID)
			r.Put("/{id}", serviceHandler.UpdateService)
			r.Delete("/{id}", serviceHandler.DeleteService)
		})
	})

	r.Route("/counters", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Get("/{id}", counterHandler.GetCounterByID)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireCounterUnit(userRepo, counterRepo))
			r.Put("/{id}", counterHandler.UpdateCounter)
			r.Delete("/{id}", counterHandler.DeleteCounter)
			r.Post("/{id}/occupy", counterHandler.Occupy)
			r.Post("/{id}/release", counterHandler.Release)
			r.Post("/{id}/force-release", counterHandler.ForceRelease)
			r.Post("/{id}/call-next", counterHandler.CallNext)
			r.Post("/{id}/break/start", counterHandler.StartBreak)
			r.Post("/{id}/break/end", counterHandler.EndBreak)
		})
	})

	r.Route("/bookings", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Post("/", bookingHandler.CreateBooking)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireBookingUnit(userRepo, bookingRepo))
			r.Get("/{id}", bookingHandler.GetBookingByID)
			r.Put("/{id}", bookingHandler.UpdateBooking)
			r.Delete("/{id}", bookingHandler.DeleteBooking)
		})
	})

	r.Route("/templates", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Use(authmiddleware.RequireTenantPermission(userRepo, tenantRBACRepo, rbac.PermTemplatesManage))
		r.Post("/", templateHandler.CreateTemplate)
		r.Get("/", templateHandler.GetAllTemplates)
		r.Get("/{id}", templateHandler.GetTemplateByID)
		r.Put("/{id}", templateHandler.UpdateTemplate)
		r.Patch("/{id}", templateHandler.UpdateTemplate)
		r.Delete("/{id}", templateHandler.DeleteTemplate)
	})

	r.Route("/desktop-terminals", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Use(authmiddleware.RequireTenantPermission(userRepo, tenantRBACRepo, rbac.PermKioskManage))
		r.Post("/", desktopTerminalHandler.Create)
		r.Get("/", desktopTerminalHandler.List)
		r.Get("/{id}", desktopTerminalHandler.GetByID)
		r.Patch("/{id}", desktopTerminalHandler.Update)
		r.Post("/{id}/revoke", desktopTerminalHandler.Revoke)
	})

	r.Route("/invitations", func(r chi.Router) {
		r.Get("/token/{token}", invitationHandler.GetInvitationByToken)
		r.Post("/register", invitationHandler.RegisterUser)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTenantPermission(userRepo, tenantRBACRepo, rbac.PermInvitationsManage))
			r.Post("/", invitationHandler.CreateInvitation)
			r.Get("/", invitationHandler.GetAllInvitations)
			r.Delete("/{id}", invitationHandler.DeleteInvitation)
			r.Patch("/{id}/resend", invitationHandler.ResendInvitation)
		})
	})

	r.Group(func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Use(authmiddleware.RequireTenantAdmin(userRepo, tenantRBACRepo))
		// Printer logo: flat path is canonical; nested path kept for older frontends.
		r.Post("/upload-printer-logo", uploadHandler.UploadPrinterLogo)
		r.Post("/upload/printer-logo", uploadHandler.UploadPrinterLogo)
		r.Post("/upload", uploadHandler.UploadLogo)
	})

	r.Route("/companies", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireTenantAdmin(userRepo, tenantRBACRepo))
			r.Get("/me/sso", companySSOHTTP.GetCompanySSO)
			r.Patch("/me/sso", companySSOHTTP.PatchCompanySSO)
			r.Patch("/me/slug", companySSOHTTP.PatchCompanySlug)
			r.Post("/me/login-links", companySSOHTTP.CreateOpaqueLoginLink)
			r.Get("/me/calendar-integrations", calendarIntegrationHandler.ListMine)
			r.Post("/me/calendar-integrations/google/oauth/start", calendarIntegrationHandler.GoogleOAuthStart)
			r.Post("/me/calendar-integrations/microsoft/oauth/start", calendarIntegrationHandler.MicrosoftOAuthStart)
			r.Post("/me/calendar-integrations/google/oauth/list-calendars", calendarIntegrationHandler.GooglePickListCalendars)
			r.Post("/me/calendar-integrations/google/oauth/complete", calendarIntegrationHandler.GooglePickComplete)
			r.Post("/me/calendar-integrations", calendarIntegrationHandler.CreateMine)
			r.Put("/me/calendar-integrations/{integrationId}", calendarIntegrationHandler.PutMine)
			r.Delete("/me/calendar-integrations/{integrationId}", calendarIntegrationHandler.DeleteMine)
			r.Get("/me/integration-api-keys", integrationAPIKeysHandler.List)
			r.Post("/me/integration-api-keys", integrationAPIKeysHandler.Create)
			r.Delete("/me/integration-api-keys/{id}", integrationAPIKeysHandler.Revoke)
			r.Get("/me/webhook-endpoints", webhookEndpointsHandler.List)
			r.Post("/me/webhook-endpoints", webhookEndpointsHandler.Create)
			r.Post("/me/webhook-endpoints/{id}/rotate-secret", webhookEndpointsHandler.RotateSecret)
			r.Post("/me/webhook-endpoints/{id}/test", webhookEndpointsHandler.TestPing)
			r.Patch("/me/webhook-endpoints/{id}", webhookEndpointsHandler.Patch)
			r.Delete("/me/webhook-endpoints/{id}", webhookEndpointsHandler.Delete)
			r.Get("/me/webhook-delivery-logs", webhookDeliveryLogsHandler.List)
			r.Post("/me/public-widget-token", publicWidgetTokenHandler.Issue)
			r.Get("/me/public-queue-widget-settings", publicWidgetTokenHandler.GetPublicQueueWidgetSettings)
			r.Patch("/me/public-queue-widget-settings", publicWidgetTokenHandler.PatchPublicQueueWidgetSettings)
			r.Post("/dadata/party/find-by-inn", dadataHandler.FindPartyByInn)
			r.Post("/dadata/party/suggest", dadataHandler.SuggestParty)
			r.Post("/dadata/address/suggest", dadataHandler.SuggestAddress)
			r.Post("/dadata/bank/suggest", dadataHandler.SuggestBank)
			r.Post("/dadata/address/clean", dadataHandler.CleanAddress)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireTenantAdmin(userRepo, tenantRBACRepo))
			r.Get("/me", companyHandler.GetMyCompany)
			r.Patch("/me", companyHandler.PatchMyCompany)
			r.Get("/me/rbac/permissions", tenantRBACHTTP.GetPermissionCatalog)
			r.Get("/me/sso/group-mappings", tenantRBACHTTP.ListGroupMappings)
			r.Post("/me/sso/group-mappings", tenantRBACHTTP.UpsertGroupMapping)
			r.Delete("/me/sso/group-mappings/{mappingId}", tenantRBACHTTP.DeleteGroupMapping)
			r.Get("/me/tenant-roles", tenantRBACHTTP.ListTenantRoles)
			r.Post("/me/tenant-roles", tenantRBACHTTP.CreateTenantRole)
			r.Patch("/me/tenant-roles/{roleId}", tenantRBACHTTP.PatchTenantRole)
			r.Delete("/me/tenant-roles/{roleId}", tenantRBACHTTP.DeleteTenantRole)
			r.Get("/me/users", tenantRBACHTTP.ListCompanyUsers)
			r.Patch("/me/users/{userId}/tenant-roles", tenantRBACHTTP.PatchUserTenantRoles)
			r.Patch("/me/users/{userId}/sso-directory", tenantRBACHTTP.PatchUserSSOFlags)
			r.Get("/me/users/{userId}/external-identity", tenantRBACHTTP.GetExternalIdentity)
			r.Patch("/me/users/{userId}/external-identity", tenantRBACHTTP.PatchExternalIdentity)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireTenantAdmin(userRepo, tenantRBACRepo))
			r.Post("/me/complete-onboarding", companyHandler.CompleteOnboarding)
		})
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireTenantPermission(userRepo, tenantRBACRepo, rbac.PermUnitSignageManage))
			r.Get("/me/screen-layout-templates", screenLayoutTemplateHandler.List)
			r.Post("/me/screen-layout-templates", screenLayoutTemplateHandler.Create)
			r.Put("/me/screen-layout-templates/{templateId}", screenLayoutTemplateHandler.Update)
			r.Delete("/me/screen-layout-templates/{templateId}", screenLayoutTemplateHandler.Delete)
		})
		r.Get("/{companyId}/usage-metrics", usageHandler.GetUsageMetrics)
	})

	r.Route("/usage-metrics", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Get("/me", usageHandler.GetMyUsageMetrics)
	})

	r.Route("/support", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Use(authmiddleware.RequireTenantPermission(userRepo, tenantRBACRepo, rbac.PermSupportReports))
		r.Post("/reports", supportReportHandler.Create)
		r.Get("/reports", supportReportHandler.List)
		r.Get("/reports/{id}/share-candidates", supportReportHandler.ListShareCandidates)
		r.Get("/reports/{id}/shares", supportReportHandler.ListShares)
		r.Post("/reports/{id}/shares", supportReportHandler.AddShare)
		r.Delete("/reports/{id}/shares/{sharedWithUserId}", supportReportHandler.RemoveShare)
		r.Get("/reports/{id}/comments", supportReportHandler.ListComments)
		r.Post("/reports/{id}/comments", supportReportHandler.PostComment)
		r.Get("/reports/{id}", supportReportHandler.GetByID)
		r.Post("/reports/{id}/mark-irrelevant", supportReportHandler.MarkIrrelevant)
	})

	r.Route("/subscriptions", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Get("/me/plans", subscriptionHandler.GetMySubscriptionPlans)
			r.Get("/me", subscriptionHandler.GetMySubscription)
			r.Post("/checkout", subscriptionHandler.CreateCheckout)
			r.Post("/plan-change-request", subscriptionHandler.PostPlanChangeRequest)
			r.Post("/custom-terms-lead-request", subscriptionHandler.PostCustomTermsLeadRequest)
			r.Post("/{id}/cancel", subscriptionHandler.CancelSubscription)
		})
		r.Get("/plans", subscriptionHandler.GetPlans)
	})

	r.Route("/invoices", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Get("/me", invoiceHandler.GetMyInvoices)
		// Must live under /me/... so chi does not treat the last segment as /{id} (e.g. "saas-vendor").
		r.Get("/me/vendor", invoiceHandler.GetSaaSVendor)
		r.Post("/{id}/yookassa-payment-link", invoiceHandler.RequestYooKassaPaymentLink)
		r.Get("/{id}", invoiceHandler.GetMyInvoiceByID)
		r.Get("/{id}/download", invoiceHandler.DownloadInvoice)
	})

	r.Route("/platform", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuthAndActive(userRepo))
		r.Use(authmiddleware.RequirePlatformAdmin(userRepo))
		r.Get("/features", platformHandler.GetFeatures)
		r.Get("/integrations", integrationsHandler.GetPlatformIntegrations)
		r.Patch("/integrations", integrationsHandler.PatchPlatformIntegrations)
		r.Post("/integrations/sms/test", integrationsHandler.TestSMSIntegration)
		r.Get("/saas-operator-company", platformHandler.GetSaaSOperatorCompany)
		r.Get("/companies", platformHandler.ListCompanies)
		r.Get("/companies/{id}/onec-settings", onecSettingsHandler.GetPlatformCompanyOneCSettings)
		r.Put("/companies/{id}/onec-settings", onecSettingsHandler.PutPlatformCompanyOneCSettings)
		r.Get("/companies/{id}", platformHandler.GetCompany)
		r.Patch("/companies/{id}", platformHandler.PatchCompany)
		r.Post("/dadata/party/find-by-inn", dadataHandler.FindPartyByInn)
		r.Post("/dadata/party/suggest", dadataHandler.SuggestParty)
		r.Post("/dadata/address/suggest", dadataHandler.SuggestAddress)
		r.Post("/dadata/bank/suggest", dadataHandler.SuggestBank)
		r.Post("/dadata/address/clean", dadataHandler.CleanAddress)
		r.Get("/subscriptions", platformHandler.ListSubscriptions)
		r.Post("/subscriptions", platformHandler.CreateSubscription)
		r.Patch("/subscriptions/{id}", platformHandler.PatchSubscription)
		r.Get("/subscription-plans", platformHandler.ListSubscriptionPlans)
		r.Post("/subscription-plans", platformHandler.CreateSubscriptionPlan)
		r.Put("/subscription-plans/{id}", platformHandler.UpdateSubscriptionPlan)
		r.Get("/catalog-items", platformHandler.ListCatalogItems)
		r.Post("/catalog-items", platformHandler.CreateCatalogItem)
		r.Get("/catalog-items/{id}", platformHandler.GetCatalogItem)
		r.Patch("/catalog-items/{id}", platformHandler.PatchCatalogItem)
		r.Delete("/catalog-items/{id}", platformHandler.DeleteCatalogItem)
		r.Get("/invoices", platformHandler.ListInvoices)
		r.Post("/invoices", platformHandler.CreateInvoice)
		r.Get("/invoices/{id}", platformHandler.GetPlatformInvoice)
		r.Patch("/invoices/{id}/draft", platformHandler.PatchInvoiceDraft)
		r.Post("/invoices/{id}/issue", platformHandler.IssueInvoice)
		r.Patch("/invoices/{id}", platformHandler.PatchInvoice)
	})

	r.Route("/tickets", func(r chi.Router) {
		r.With(authmiddleware.PublicAPIRateLimit).Get("/{id}", ticketHandler.GetTicketByID)
		r.With(authmiddleware.PublicAPIRateLimit).Post("/{id}/cancel", ticketHandler.VisitorCancelTicket)
		r.With(authmiddleware.PublicAPIRateLimit).Post("/{id}/phone", ticketHandler.AttachPhone)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuthAndActive(userRepo))
			r.Use(authmiddleware.RequireTicketUnit(userRepo, ticketRepo))
			r.Patch("/{id}/status", ticketHandler.UpdateStatus)
			r.Patch("/{id}/operator-comment", ticketHandler.UpdateOperatorComment)
			r.Post("/{id}/recall", ticketHandler.Recall)
			r.Post("/{id}/pick", ticketHandler.Pick)
			r.Post("/{id}/transfer", ticketHandler.Transfer)
			r.Post("/{id}/return", ticketHandler.ReturnToQueue)
			r.Patch("/{id}/visitor", ticketHandler.UpdateTicketVisitor)
			r.Put("/{id}/visitor-tags", ticketHandler.SetVisitorTags)
		})
	})

	ctx := context.Background()
	shutdownOtel, err := telemetry.Setup(ctx)
	if err != nil {
		logger.Error("telemetry setup", "err", err)
		shutdownOtel = func(context.Context) error { return nil }
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()
		if err := shutdownOtel(ctx); err != nil {
			slog.Error("telemetry shutdown", "err", err)
		}
	}()

	otelHandler := otelhttp.NewHandler(r, "quokkaq-api")

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	slog.Info("server starting", "port", port)
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           otelHandler,
		ReadHeaderTimeout: 15 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		// The next process can start while the previous release is still shutting down (Air hot reload):
		// HTTP Shutdown allows up to 30s, plus asynq/DB — the old listener can outlive a short retry window.
		errCh <- listenAndServeWithBindRetry(srv, 2*time.Minute)
	}()

	quit := make(chan os.Signal, 1)
	if runtime.GOOS == "windows" {
		signal.Notify(quit, os.Interrupt)
	} else {
		signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	}

	select {
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			shCtx, shCancel := context.WithTimeout(context.Background(), 10*time.Second)
			_ = shutdownOtel(shCtx)
			shCancel()
			logger.Error("http server", "err", err)
			return fmt.Errorf("http server: %w", err)
		}
		return nil
	case <-quit:
		refreshCancel()
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("server shutdown", "err", err)
			return fmt.Errorf("server shutdown: %w", err)
		}
		return nil
	}
}

func isAddrInUse(err error) bool {
	var opErr *net.OpError
	if !errors.As(err, &opErr) {
		return false
	}
	return errors.Is(opErr.Err, syscall.EADDRINUSE)
}

// listenAndServeWithBindRetry mirrors http.Server.ListenAndServe but retries when the listen address
// is still held by a previous instance (hot reload / overlapping shutdown).
func listenAndServeWithBindRetry(srv *http.Server, retryFor time.Duration) error {
	addr := srv.Addr
	if addr == "" {
		addr = ":http"
	}
	deadline := time.Now().Add(retryFor)
	warned := false
	for {
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			return srv.Serve(ln)
		}
		if !isAddrInUse(err) || time.Now().After(deadline) {
			return err
		}
		if !warned {
			slog.Info("listen: address in use, retrying (previous instance still shutting down)", "addr", addr)
			warned = true
		}
		time.Sleep(250 * time.Millisecond)
	}
}

// jobEnqueuerAdapter wraps jobs.JobClient to satisfy the services.JobEnqueuer interface,
// avoiding a circular import between the services and jobs packages.
type jobEnqueuerAdapter struct {
	client jobs.JobClient
}

func (a *jobEnqueuerAdapter) EnqueueTtsGenerate(payload services.TtsJobPayload) error {
	return a.client.EnqueueTtsGenerate(payload)
}

func (a *jobEnqueuerAdapter) EnqueueSMSSend(payload services.SMSSendJobPayload) error {
	return a.client.EnqueueSMSSendRaw(jobs.SMSSendPayload{
		NotificationID: payload.NotificationID,
		To:             payload.To,
		Body:           payload.Body,
	})
}

func (a *jobEnqueuerAdapter) EnqueueVisitorNotify(payload services.VisitorNotifyJobPayload) error {
	return a.client.EnqueueVisitorNotifyRaw(jobs.VisitorNotifyPayload{
		TicketID: payload.TicketID,
		Type:     payload.Type,
	})
}
