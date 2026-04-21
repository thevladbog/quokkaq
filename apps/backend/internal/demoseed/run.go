package demoseed

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/tenantslug"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/tenantroleseed"
	"quokkaq-go-backend/internal/ticketaudit"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Run inserts the full demo dataset. Caller must run on a freshly migrated empty
// application schema (after seed-plans). It is not idempotent across re-runs on a non-empty DB.
func Run(db *gorm.DB, cfg Config) error {
	loc := cfg.Anchor.Location()
	var plan models.SubscriptionPlan
	if err := db.Where("code = ?", "professional").First(&plan).Error; err != nil {
		if err := db.Where("is_active = ?", true).Order("display_order ASC").First(&plan).Error; err != nil {
			return fmt.Errorf("demoseed: need at least one subscription plan (run seed-plans first): %w", err)
		}
	}

	return db.Transaction(func(tx *gorm.DB) error {
		roleByName, err := ensureGlobalRoles(tx)
		if err != nil {
			return err
		}

		slug, err := tenantslug.PickUniqueSlug("QuokkaQ Demo", func(s string) (bool, error) {
			var n int64
			e := tx.Model(&models.Company{}).Where("slug = ?", s).Count(&n).Error
			return n > 0, e
		})
		if err != nil {
			return fmt.Errorf("demoseed: slug: %w", err)
		}

		company := models.Company{
			Name:           "QuokkaQ Demo",
			Slug:           slug,
			IsSaaSOperator: true,
		}
		if err := tx.Create(&company).Error; err != nil {
			return fmt.Errorf("demoseed: company: %w", err)
		}

		unit := models.Unit{
			CompanyID: company.ID,
			Name:      "Main Office",
			Code:      "MAIN",
			Kind:      models.UnitKindSubdivision,
			Timezone:  cfg.UnitTimezone,
		}
		if err := tx.Create(&unit).Error; err != nil {
			return fmt.Errorf("demoseed: unit: %w", err)
		}

		sysTenantRoleID, err := tenantroleseed.EnsureSystemTenantRole(tx, company.ID)
		if err != nil {
			return fmt.Errorf("demoseed: tenant system role: %w", err)
		}

		anon := models.UnitClient{
			UnitID:      unit.ID,
			FirstName:   "Аноним",
			LastName:    "",
			PhoneE164:   nil,
			IsAnonymous: true,
		}
		if err := tx.Create(&anon).Error; err != nil {
			return fmt.Errorf("demoseed: anonymous client: %w", err)
		}

		prefixA := "A"
		prefixB := "B"
		svcA := models.Service{
			UnitID: unit.ID, Name: "Consultation", NameRu: strPtr("Консультация"),
			NameEn: strPtr("Consultation"), Description: strPtr("Primary queue"),
			Prefix: &prefixA, Duration: intPtr(15), IsLeaf: true,
		}
		svcB := models.Service{
			UnitID: unit.ID, Name: "Priority", NameRu: strPtr("Приоритет"),
			NameEn: strPtr("Priority"), Description: strPtr("Premium"),
			Prefix: &prefixB, Duration: intPtr(25), IsLeaf: true,
		}
		if err := tx.Create(&svcA).Error; err != nil {
			return err
		}
		if err := tx.Create(&svcB).Error; err != nil {
			return err
		}

		c1 := models.Counter{UnitID: unit.ID, Name: "Window 1"}
		c2 := models.Counter{UnitID: unit.ID, Name: "Window 2"}
		if err := tx.Create(&c1).Error; err != nil {
			return err
		}
		if err := tx.Create(&c2).Error; err != nil {
			return err
		}

		now := time.Now().UTC()
		periodEnd := cfg.Anchor.AddDate(0, 1, 0)
		sub := models.Subscription{
			CompanyID:          company.ID,
			PlanID:             plan.ID,
			Status:             "active",
			CurrentPeriodStart: cfg.Anchor.AddDate(0, -2, 0).UTC(),
			CurrentPeriodEnd:   periodEnd.UTC(),
		}
		if err := tx.Create(&sub).Error; err != nil {
			return fmt.Errorf("demoseed: subscription: %w", err)
		}
		if err := tx.Model(&company).Update("subscription_id", sub.ID).Error; err != nil {
			return err
		}

		adminUser, err := createPasswordUser(tx, "Demo Admin", cfg.AdminEmail, cfg.AdminPass)
		if err != nil {
			return err
		}
		opUser, err := createPasswordUser(tx, "Demo Operator", cfg.OperatorEmail, cfg.OperatorPass)
		if err != nil {
			return err
		}

		if err := tx.Create(&models.UserRole{UserID: adminUser.ID, RoleID: roleByName["admin"]}).Error; err != nil {
			return err
		}
		// Deliberately no platform_admin for public demo.
		if err := tx.Create(&models.UserRole{UserID: opUser.ID, RoleID: roleByName["operator"]}).Error; err != nil {
			return err
		}

		if err := tx.Create(&models.UserTenantRole{
			UserID: adminUser.ID, CompanyID: company.ID, TenantRoleID: sysTenantRoleID,
		}).Error; err != nil {
			return fmt.Errorf("demoseed: user tenant role admin: %w", err)
		}

		if err := tx.Create(&models.UserUnit{UserID: adminUser.ID, UnitID: unit.ID}).Error; err != nil {
			return err
		}
		opUnitPerms := append(
			append([]string{}, rbac.DefaultInvitationUnitPermissions()...),
			rbac.PermSupportReports,
		)
		if err := tx.Create(&models.UserUnit{
			UserID:      opUser.ID,
			UnitID:      unit.ID,
			Permissions: opUnitPerms,
		}).Error; err != nil {
			return err
		}

		if err := tx.Model(&company).Update("owner_user_id", adminUser.ID).Error; err != nil {
			return err
		}
		if err := tenantroleseed.RebuildUserUnitsFromTenantRoles(tx, adminUser.ID, company.ID); err != nil {
			return fmt.Errorf("demoseed: rebuild user units admin: %w", err)
		}

		tpl := models.MessageTemplate{
			CompanyID: company.ID,
			Name:      "Welcome",
			Subject:   "Welcome to QuokkaQ Demo",
			Content:   "Hello {{name}}, this is a demo environment.",
			IsDefault: true,
		}
		if err := tx.Create(&tpl).Error; err != nil {
			return err
		}

		actorAgg := repository.StatisticsUnitAggregateActor()
		zoneWhole := repository.StatisticsWholeSubdivisionServiceZoneID()
		surveyAgg := repository.StatisticsSurveyAggregateSurveyID()

		// Deterministic demo statistics (PCG); not for cryptographic use.
		rng := rand.New(rand.NewPCG( // #nosec G404 -- demo fixture PRNG only, not for secrets or tokens
			pcgSeedFromUnixNano(cfg.Anchor.UnixNano())^pcgSeedFromNonNegInt(cfg.HistoryDays),
			pcgSeedFromNonNegInt(cfg.HistoryDays)^0x9e3779b97f4a7c15,
		))
		anchorCalDay := calendarDay(cfg.Anchor, 0)

		for offset := cfg.HistoryDays; offset >= 0; offset-- {
			day := calendarDay(cfg.Anchor, -offset)
			dateStr := day.Format("2006-01-02")
			weekday := day.Weekday()
			mult := 1
			if weekday == time.Saturday || weekday == time.Sunday {
				mult = 0
			}
			created := (12 + offset%9) * mult
			if created < 2 {
				created = 2 + offset%4
			}
			completed := created * (70 + rng.IntN(25)) / 100
			if completed > created {
				completed = created
			}

			bucket := models.StatisticsDailyBucket{
				UnitID:           unit.ID,
				BucketDate:       dateStr,
				ActorUserID:      actorAgg,
				ServiceZoneID:    zoneWhole,
				WaitSumMs:        int64(created) * (180_000 + int64(rng.IntN(120_000))),
				WaitCount:        created,
				ServiceSumMs:     int64(completed) * (420_000 + int64(rng.IntN(180_000))),
				ServiceCount:     completed,
				TicketsCreated:   created,
				TicketsCompleted: completed,
				NoShowCount:      rng.IntN(3),
				SlaWaitMet:       completed - rng.IntN(2),
				SlaWaitTotal:     completed,
				ComputedAt:       now,
			}
			if bucket.SlaWaitMet < 0 {
				bucket.SlaWaitMet = 0
			}
			if err := tx.Create(&bucket).Error; err != nil {
				return fmt.Errorf("demoseed: stat bucket %s: %w", dateStr, err)
			}

			surveyRow := models.StatisticsSurveyDaily{
				UnitID:             unit.ID,
				BucketDate:         dateStr,
				SurveyDefinitionID: surveyAgg,
				QuestionKey:        "",
				SumNorm5:           float64(completed) * (4.0 + rng.Float64()),
				CountNorm5:         completed,
				SumNative:          float64(completed) * (4.0 + rng.Float64()),
				CountNative:        completed,
				ComputedAt:         now,
			}
			scaleMin := 1.0
			scaleMax := 5.0
			surveyRow.ScaleMin = &scaleMin
			surveyRow.ScaleMax = &scaleMax
			if err := tx.Create(&surveyRow).Error; err != nil {
				return fmt.Errorf("demoseed: survey stat %s: %w", dateStr, err)
			}

			if err := seedTicketsForDay(tx, &seedTicketsDayParams{
				day:          day,
				anchorCalDay: anchorCalDay,
				loc:          loc,
				unitID:       unit.ID,
				serviceAID:   svcA.ID,
				serviceBID:   svcB.ID,
				counter1ID:   &c1.ID,
				clientID:     &anon.ID,
				createdN:     created,
				completedN:   completed,
				rng:          rng,
			}); err != nil {
				return err
			}
		}

		return nil
	})
}

type seedTicketsDayParams struct {
	day          time.Time
	anchorCalDay time.Time
	loc          *time.Location
	unitID       string
	serviceAID   string
	serviceBID   string
	counter1ID   *string
	clientID     *string
	createdN     int
	completedN   int
	rng          *rand.Rand // math/rand/v2
}

func seedTicketsForDay(tx *gorm.DB, p *seedTicketsDayParams) error {
	for i := 0; i < p.createdN; i++ {
		svc := p.serviceAID
		if i%5 == 0 {
			svc = p.serviceBID
		}
		hour := 9 + p.rng.IntN(8)
		minute := p.rng.IntN(60)
		created := time.Date(p.day.Year(), p.day.Month(), p.day.Day(), hour, minute, 0, 0, p.loc).UTC()

		qn := fmt.Sprintf("D%s-%04d", p.day.Format("20060102"), i)
		var n int64
		if err := tx.Model(&models.Ticket{}).Where("unit_id = ? AND queue_number = ?", p.unitID, qn).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}

		status := "completed"
		if i >= p.completedN {
			if p.day.Equal(p.anchorCalDay) && i%4 == 0 {
				status = "waiting"
			} else if p.day.Equal(p.anchorCalDay) && i%4 == 1 {
				status = "serving"
			} else {
				status = "cancelled"
			}
		}

		tk := models.Ticket{
			UnitID:      p.unitID,
			ServiceID:   svc,
			QueueNumber: qn,
			Status:      status,
			CreatedAt:   created,
			ClientID:    p.clientID,
		}
		if status == "serving" || status == "completed" {
			ca := created.Add(3 * time.Minute)
			tk.CalledAt = &ca
			tk.CounterID = p.counter1ID
		}
		if status == "completed" {
			co := created.Add(12*time.Minute + time.Duration(p.rng.IntN(20))*time.Minute)
			tk.CompletedAt = &co
		}
		if err := tx.Create(&tk).Error; err != nil {
			return fmt.Errorf("demoseed: ticket %s: %w", qn, err)
		}

		if err := tx.Create(&models.TicketHistory{
			TicketID: tk.ID, Action: ticketaudit.ActionTicketCreated, CreatedAt: created,
		}).Error; err != nil {
			return err
		}
		if tk.CalledAt != nil {
			if err := tx.Create(&models.TicketHistory{
				TicketID: tk.ID, Action: ticketaudit.ActionTicketCalled, CreatedAt: *tk.CalledAt,
			}).Error; err != nil {
				return err
			}
		}
		if tk.CompletedAt != nil {
			pl, _ := json.Marshal(map[string]any{"to": "completed"})
			if err := tx.Create(&models.TicketHistory{
				TicketID: tk.ID, Action: ticketaudit.ActionTicketStatusChanged,
				Payload: pl, CreatedAt: *tk.CompletedAt,
			}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func pcgSeedFromUnixNano(n int64) uint64 {
	if n < 0 {
		return 0
	}
	return uint64(n)
}

func pcgSeedFromNonNegInt(v int) uint64 {
	if v < 0 {
		return 0
	}
	return uint64(v)
}

func calendarDay(ref time.Time, addDays int) time.Time {
	loc := ref.Location()
	d := time.Date(ref.Year(), ref.Month(), ref.Day(), 0, 0, 0, 0, loc)
	return d.AddDate(0, 0, addDays)
}

func ensureGlobalRoles(tx *gorm.DB) (map[string]string, error) {
	names := []string{"admin", "supervisor", "operator", "platform_admin"}
	out := make(map[string]string, len(names))
	for _, name := range names {
		var r models.Role
		err := tx.Where("name = ?", name).First(&r).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			r = models.Role{Name: name}
			if err := tx.Create(&r).Error; err != nil {
				return nil, err
			}
		} else if err != nil {
			return nil, err
		}
		out[name] = r.ID
	}
	return out, nil
}

func createPasswordUser(tx *gorm.DB, name, email, plain string) (*models.User, error) {
	hashB, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	hash := string(hashB)
	em := email
	u := models.User{
		ID:       uuid.New().String(),
		Name:     name,
		Email:    &em,
		Password: &hash,
	}
	if err := tx.Create(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func strPtr(s string) *string { return &s }
func intPtr(i int) *int       { return &i }
