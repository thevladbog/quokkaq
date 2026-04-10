package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"quokkaq-go-backend/internal/config"
	"quokkaq-go-backend/internal/handlers"
	"quokkaq-go-backend/internal/jobs"
	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/ws"
	"quokkaq-go-backend/pkg/database"
	"strconv"
	"strings"

	"github.com/MarceloPetrucio/go-scalar-api-reference"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// @title           QuokkaQ Go Backend API
// @version         1.0
// @description     This is the backend API for QuokkaQ, rewritten in Go.
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
	config.Load()
	database.Connect()

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
		err := database.RunVersionedMigrations(
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
			&models.Service{},
			&models.Counter{},
			&models.Ticket{},
			&models.TicketHistory{},
			&models.TicketNumberSequence{},
			&models.Booking{},
			&models.Notification{},
			&models.AuditLog{},
			&models.UnitMaterial{},
			&models.Invitation{},
			&models.MessageTemplate{},
			&models.PasswordResetToken{},
			&models.PreRegistration{},
			&models.SlotConfig{},
			&models.WeeklySlotCapacity{},
			&models.DaySchedule{},
			&models.ServiceSlot{},
			&models.DesktopTerminal{},
		)
		if err != nil {
			log.Fatalf("Failed to run migrations: %v", err)
		}
	}

	hub := ws.NewHub()
	go hub.Run()

	jobClient := jobs.NewJobClient()
	defer func() {
		if err := jobClient.Close(); err != nil {
			fmt.Printf("Error closing job client: %v\n", err)
		}
	}()

	storageService := services.NewStorageService()
	ttsService := services.NewTtsService(storageService)

	userRepo := repository.NewUserRepository()
	unitRepo := repository.NewUnitRepository()
	ticketRepo := repository.NewTicketRepository()
	serviceRepo := repository.NewServiceRepository()
	counterRepo := repository.NewCounterRepository()
	bookingRepo := repository.NewBookingRepository()
	templateRepo := repository.NewTemplateRepository()
	invitationRepo := repository.NewInvitationRepository()
	slotRepo := repository.NewSlotRepository()
	preRegRepo := repository.NewPreRegistrationRepository()
	desktopTerminalRepo := repository.NewDesktopTerminalRepository()
	subscriptionRepo := repository.NewSubscriptionRepository()
	invoiceRepo := repository.NewInvoiceRepository()
	catalogRepo := repository.NewCatalogRepository()
	companyRepo := repository.NewCompanyRepository()

	jobWorker := jobs.NewJobWorker(ttsService, ticketRepo)
	jobWorker.Start()
	defer jobWorker.Stop()

	userService := services.NewUserService(userRepo)
	mailService := services.NewMailService()
	authService := services.NewAuthService(userRepo, mailService, subscriptionRepo)
	unitService := services.NewUnitService(unitRepo)
	ticketService := services.NewTicketService(ticketRepo, counterRepo, serviceRepo, hub, jobClient)
	serviceService := services.NewServiceService(serviceRepo)
	counterService := services.NewCounterService(counterRepo, ticketRepo, userRepo)
	bookingService := services.NewBookingService(bookingRepo)
	auditLogRepo := repository.NewAuditLogRepository()
	shiftService := services.NewShiftService(ticketRepo, counterRepo, auditLogRepo, hub)
	templateService := services.NewTemplateService(templateRepo)
	invitationService := services.NewInvitationService(invitationRepo, mailService, userRepo, templateService)
	slotService := services.NewSlotService(slotRepo, preRegRepo)
	preRegService := services.NewPreRegistrationService(preRegRepo, slotRepo, ticketRepo, serviceRepo)
	desktopTerminalService := services.NewDesktopTerminalService(desktopTerminalRepo, unitRepo)
	quotaService := services.NewQuotaService()

	userHandler := handlers.NewUserHandler(userService)
	authHandler := handlers.NewAuthHandler(authService)
	unitHandler := handlers.NewUnitHandler(unitService, storageService)
	ticketHandler := handlers.NewTicketHandler(ticketService)
	serviceHandler := handlers.NewServiceHandler(serviceService, userRepo)
	counterHandler := handlers.NewCounterHandler(counterService)
	bookingHandler := handlers.NewBookingHandler(bookingService, userRepo)
	shiftHandler := handlers.NewShiftHandler(shiftService)
	templateHandler := handlers.NewTemplateHandler(templateService)
	invitationHandler := handlers.NewInvitationHandler(invitationService)
	slotHandler := handlers.NewSlotHandler(slotService)
	preRegHandler := handlers.NewPreRegistrationHandler(preRegService, ticketService)
	uploadHandler := handlers.NewUploadHandler(storageService)
	desktopTerminalHandler := handlers.NewDesktopTerminalHandler(desktopTerminalService)
	usageHandler := handlers.NewUsageHandler(quotaService, userRepo)

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
	subscriptionHandler := handlers.NewSubscriptionHandler(subscriptionRepo, userRepo, paymentProvider)
	var yooInvoice *services.YooKassaInvoiceClient
	if yShop := strings.TrimSpace(os.Getenv("YOOKASSA_SHOP_ID")); yShop != "" {
		yooInvoice = services.NewYooKassaInvoiceClient(
			yShop,
			strings.TrimSpace(os.Getenv("YOOKASSA_SECRET_KEY")),
			strings.TrimSpace(os.Getenv("YOOKASSA_WEBHOOK_SECRET")),
		)
	}
	invoiceHandler := handlers.NewInvoiceHandler(
		invoiceRepo,
		companyRepo,
		userRepo,
		yooInvoice,
		strings.TrimSpace(os.Getenv("YOOKASSA_PAYMENT_RETURN_URL")),
		strings.TrimSpace(os.Getenv("PUBLIC_APP_URL")),
	)
	companyHandler := handlers.NewCompanyHandler(companyRepo, userRepo)
	platformHandler := handlers.NewPlatformHandler(companyRepo, subscriptionRepo, invoiceRepo, catalogRepo)
	dadataHandler := handlers.NewDaDataHandler()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	allowedOrigins := config.ParseCORSAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://localhost:3001",
			"http://127.0.0.1:3001",
			"https://quokkaq.v-b.tech",
			"https://app.quokkaq.v-b.tech",
		}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte("Hello from QuokkaQ Go Backend!")); err != nil {
			fmt.Printf("Error writing response: %v\n", err)
		}
	})

	r.Post("/webhooks/yookassa", handlers.ServeYooKassaWebhook)

	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWs(hub, w, r)
	})

	r.Get("/swagger/*", func(w http.ResponseWriter, r *http.Request) {
		content, err := os.ReadFile("./docs/swagger.json")
		if err != nil {
			http.Error(w, "Failed to read swagger.json", http.StatusInternalServerError)
			return
		}

		htmlContent, err := scalar.ApiReferenceHTML(&scalar.Options{
			SpecContent: string(content),
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
			fmt.Printf("Error writing API reference: %v\n", err)
		}
	})

	r.Get("/docs/swagger.json", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./docs/swagger.json")
	})

	r.Route("/auth", func(r chi.Router) {
		r.Post("/login", authHandler.Login)
		r.Post("/forgot-password", authHandler.RequestPasswordReset)
		r.Post("/reset-password", authHandler.ResetPassword)
		r.With(authmiddleware.TerminalBootstrapRateLimit).Post("/terminal/bootstrap", desktopTerminalHandler.Bootstrap)

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuth)
			r.Get("/me", authHandler.GetMe)
		})
	})

	r.Route("/system", func(r chi.Router) {
		r.Get("/status", userHandler.GetSystemStatus)
		r.Post("/setup", userHandler.SetupFirstAdmin)
	})

	r.Route("/users", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Use(authmiddleware.RequireAdmin(userRepo))
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
		r.Get("/", unitHandler.GetAllUnits)
		r.Get("/{id}", unitHandler.GetUnitByID)
		r.Post("/{unitId}/tickets", ticketHandler.CreateTicket)
		r.Get("/{unitId}/tickets", ticketHandler.GetTicketsByUnit)
		r.Get("/{unitId}/services", serviceHandler.GetServicesByUnit)
		r.Get("/{unitId}/services-tree", serviceHandler.GetServicesByUnit)
		r.Get("/{unitId}/counters", counterHandler.GetCountersByUnit)
		r.Get("/{unitId}/materials", unitHandler.GetMaterials)
		r.Get("/{unitId}/pre-registrations/slots", preRegHandler.GetAvailableSlots)
		r.Post("/{unitId}/pre-registrations/validate", preRegHandler.Validate)
		r.Post("/{unitId}/pre-registrations", preRegHandler.Create)
		r.Post("/{unitId}/pre-registrations/redeem", preRegHandler.Redeem)

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuth)
			r.Use(authmiddleware.RequireAdmin(userRepo))
			r.Post("/", unitHandler.CreateUnit)
			r.Patch("/{id}", unitHandler.UpdateUnit)
			r.Delete("/{id}", unitHandler.DeleteUnit)
		})

		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuth)
			r.Use(authmiddleware.RequireUnitMember(userRepo))
			r.Post("/{unitId}/call-next", ticketHandler.CallNext)
			r.Get("/{unitId}/bookings", bookingHandler.GetBookingsByUnit)
			r.Get("/{unitId}/shift/dashboard", shiftHandler.GetDashboardStats)
			r.Get("/{unitId}/shift/queue", shiftHandler.GetQueueTickets)
			r.Get("/{unitId}/shift/counters", shiftHandler.GetShiftCounters)
			r.Post("/{unitId}/shift/eod", shiftHandler.ExecuteEndOfDay)
			r.Post("/{unitId}/materials", unitHandler.AddMaterial)
			r.Delete("/{unitId}/materials/{materialId}", unitHandler.DeleteMaterial)
			r.Patch("/{unitId}/ad-settings", unitHandler.UpdateAdSettings)
			r.Get("/{unitId}/slots/config", slotHandler.GetConfig)
			r.Put("/{unitId}/slots/config", slotHandler.UpdateConfig)
			r.Get("/{unitId}/slots/capacities", slotHandler.GetCapacities)
			r.Put("/{unitId}/slots/capacities", slotHandler.UpdateCapacities)
			r.Post("/{unitId}/slots/generate", slotHandler.Generate)
			r.Get("/{unitId}/slots/day/{date}", slotHandler.GetDay)
			r.Put("/{unitId}/slots/day/{date}", slotHandler.UpdateDay)
			r.Get("/{unitId}/pre-registrations", preRegHandler.GetByUnit)
			r.Put("/{unitId}/pre-registrations/{id}", preRegHandler.Update)
			r.Post("/{unitId}/counters", counterHandler.CreateCounter)
		})
	})

	r.Route("/services", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Post("/", serviceHandler.CreateService)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireServiceUnit(userRepo, serviceRepo))
			r.Get("/{id}", serviceHandler.GetServiceByID)
			r.Put("/{id}", serviceHandler.UpdateService)
			r.Delete("/{id}", serviceHandler.DeleteService)
		})
	})

	r.Route("/counters", func(r chi.Router) {
		r.Get("/{id}", counterHandler.GetCounterByID)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuth)
			r.Use(authmiddleware.RequireCounterUnit(userRepo, counterRepo))
			r.Put("/{id}", counterHandler.UpdateCounter)
			r.Delete("/{id}", counterHandler.DeleteCounter)
			r.Post("/{id}/occupy", counterHandler.Occupy)
			r.Post("/{id}/release", counterHandler.Release)
			r.Post("/{id}/force-release", counterHandler.ForceRelease)
			r.Post("/{id}/call-next", counterHandler.CallNext)
		})
	})

	r.Route("/bookings", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Post("/", bookingHandler.CreateBooking)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireBookingUnit(userRepo, bookingRepo))
			r.Get("/{id}", bookingHandler.GetBookingByID)
			r.Put("/{id}", bookingHandler.UpdateBooking)
			r.Delete("/{id}", bookingHandler.DeleteBooking)
		})
	})

	r.Route("/templates", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Use(authmiddleware.RequireAdmin(userRepo))
		r.Post("/", templateHandler.CreateTemplate)
		r.Get("/", templateHandler.GetAllTemplates)
		r.Get("/{id}", templateHandler.GetTemplateByID)
		r.Put("/{id}", templateHandler.UpdateTemplate)
		r.Patch("/{id}", templateHandler.UpdateTemplate)
		r.Delete("/{id}", templateHandler.DeleteTemplate)
	})

	r.Route("/desktop-terminals", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Use(authmiddleware.RequireAdmin(userRepo))
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
			r.Use(authmiddleware.JWTAuth)
			r.Use(authmiddleware.RequireAdmin(userRepo))
			r.Post("/", invitationHandler.CreateInvitation)
			r.Get("/", invitationHandler.GetAllInvitations)
			r.Delete("/{id}", invitationHandler.DeleteInvitation)
			r.Patch("/{id}/resend", invitationHandler.ResendInvitation)
		})
	})

	r.Group(func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Use(authmiddleware.RequireAdmin(userRepo))
		r.Post("/upload", uploadHandler.UploadLogo)
	})

	r.Route("/companies", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.RequireAdmin(userRepo))
			r.Get("/me", companyHandler.GetMyCompany)
			r.Patch("/me", companyHandler.PatchMyCompany)
			r.Post("/dadata/party/find-by-inn", dadataHandler.FindPartyByInn)
			r.Post("/dadata/party/suggest", dadataHandler.SuggestParty)
			r.Post("/dadata/address/suggest", dadataHandler.SuggestAddress)
			r.Post("/dadata/bank/suggest", dadataHandler.SuggestBank)
			r.Post("/dadata/address/clean", dadataHandler.CleanAddress)
		})
		r.Post("/me/complete-onboarding", companyHandler.CompleteOnboarding)
		r.Get("/{companyId}/usage-metrics", usageHandler.GetUsageMetrics)
	})

	r.Route("/usage-metrics", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Get("/me", usageHandler.GetMyUsageMetrics)
	})

	r.Route("/subscriptions", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuth)
			r.Get("/me", subscriptionHandler.GetMySubscription)
			r.Post("/checkout", subscriptionHandler.CreateCheckout)
			r.Post("/{id}/cancel", subscriptionHandler.CancelSubscription)
		})
		r.Get("/plans", subscriptionHandler.GetPlans)
	})

	r.Route("/invoices", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Get("/me", invoiceHandler.GetMyInvoices)
		// Must live under /me/... so chi does not treat the last segment as /{id} (e.g. "saas-vendor").
		r.Get("/me/vendor", invoiceHandler.GetSaaSVendor)
		r.Post("/{id}/yookassa-payment-link", invoiceHandler.RequestYooKassaPaymentLink)
		r.Get("/{id}", invoiceHandler.GetMyInvoiceByID)
		r.Get("/{id}/download", invoiceHandler.DownloadInvoice)
	})

	r.Route("/platform", func(r chi.Router) {
		r.Use(authmiddleware.JWTAuth)
		r.Use(authmiddleware.RequirePlatformAdmin(userRepo))
		r.Get("/features", platformHandler.GetFeatures)
		r.Get("/saas-operator-company", platformHandler.GetSaaSOperatorCompany)
		r.Get("/companies", platformHandler.ListCompanies)
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
		r.Get("/{id}", ticketHandler.GetTicketByID)
		r.Group(func(r chi.Router) {
			r.Use(authmiddleware.JWTAuth)
			r.Use(authmiddleware.RequireTicketUnit(userRepo, ticketRepo))
			r.Patch("/{id}/status", ticketHandler.UpdateStatus)
			r.Post("/{id}/recall", ticketHandler.Recall)
			r.Post("/{id}/pick", ticketHandler.Pick)
			r.Post("/{id}/transfer", ticketHandler.Transfer)
			r.Post("/{id}/return", ticketHandler.ReturnToQueue)
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	fmt.Printf("Server starting on port %s\n", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}
