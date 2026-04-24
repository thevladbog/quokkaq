package services

import (
	"testing"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// --- stubs ---

// spyNotifRepo records calls to Create so tests can inspect enqueued notifications.
type spyNotifRepo struct {
	repository.NotificationRepository
	created   []*models.Notification
	createErr error
}

func (s *spyNotifRepo) Create(n *models.Notification) error {
	if s.createErr != nil {
		return s.createErr
	}
	// Give the notification a fake ID so the job enqueue can reference it.
	n.ID = "notif-" + n.Type
	s.created = append(s.created, n)
	return nil
}

func (s *spyNotifRepo) HasNotificationForTicketType(_, _ string) (bool, error) {
	return false, nil
}

// spySMSEnqueuer records EnqueueSMSSend calls.
type spySMSEnqueuer struct {
	noopJobEnqueuer
	sent []SMSSendJobPayload
}

func (s *spySMSEnqueuer) EnqueueSMSSend(p SMSSendJobPayload) error {
	s.sent = append(s.sent, p)
	return nil
}

// stubUnitClientRepo returns a preset client by ID; all other methods panic.
type stubUnitClientRepo struct {
	repository.UnitClientRepository
	client *models.UnitClient
	err    error
}

func (s *stubUnitClientRepo) GetByID(_ string) (*models.UnitClient, error) {
	return s.client, s.err
}

// --- helpers ---

// newNotifSvc builds a NotificationService that skips the CompanyHasPlanFeature gate by
// passing a nil unitRepo (resolveCompanyID returns "", gate returns false). Tests that
// want the gate to pass must mock CompanyHasPlanFeature separately; instead we test body
// content via internal helpers directly.
func newNotifSvcNoGate(notifRepo repository.NotificationRepository, clientRepo repository.UnitClientRepository, enqueuer JobEnqueuer) *NotificationService {
	return &NotificationService{
		notifRepo:  notifRepo,
		clientRepo: clientRepo,
		jobClient:  enqueuer,
	}
}

// --- buildCalledBody (pure function, no gate, no DB) ---

func TestBuildCalledBody_ruWithCounter(t *testing.T) {
	t.Parallel()
	ns := &NotificationService{}
	body := ns.buildCalledBody("А-42", "5", "ru")
	want := "Ваш номер А-42 вызван. Пройдите к окну 5."
	if body != want {
		t.Errorf("got %q, want %q", body, want)
	}
}

func TestBuildCalledBody_enWithCounter(t *testing.T) {
	t.Parallel()
	ns := &NotificationService{}
	body := ns.buildCalledBody("B-7", "Counter 3", "en")
	want := "Your number B-7 has been called. Please proceed to counter Counter 3."
	if body != want {
		t.Errorf("got %q, want %q", body, want)
	}
}

func TestBuildCalledBody_ruNoCounter(t *testing.T) {
	t.Parallel()
	ns := &NotificationService{}
	body := ns.buildCalledBody("А-1", "", "ru")
	want := "Ваш номер А-1 вызван. Пожалуйста, подойдите на стойку."
	if body != want {
		t.Errorf("got %q, want %q", body, want)
	}
}

func TestBuildCalledBody_enNoCounter(t *testing.T) {
	t.Parallel()
	ns := &NotificationService{}
	body := ns.buildCalledBody("C-99", "", "en")
	want := "Your number C-99 has been called. Please approach the service counter."
	if body != want {
		t.Errorf("got %q, want %q", body, want)
	}
}

// --- buildNextInLineBody ---

func TestBuildNextInLineBody_ru(t *testing.T) {
	t.Parallel()
	ns := &NotificationService{}
	body := ns.buildNextInLineBody("А-5", "ru")
	want := "Ваш номер А-5 — вы следующий в очереди! Приготовьтесь."
	if body != want {
		t.Errorf("got %q, want %q", body, want)
	}
}

func TestBuildNextInLineBody_en(t *testing.T) {
	t.Parallel()
	ns := &NotificationService{}
	body := ns.buildNextInLineBody("B-3", "en")
	want := "Your number B-3 — you're next in line! Please be ready."
	if body != want {
		t.Errorf("got %q, want %q", body, want)
	}
}

// --- SendTicketCalledSMS: no-op cases ---

func TestSendTicketCalledSMS_nilTicketIsNoop(t *testing.T) {
	t.Parallel()
	enq := &spySMSEnqueuer{}
	ns := newNotifSvcNoGate(nil, nil, enq)
	ns.SendTicketCalledSMS(nil) // must not panic
	if len(enq.sent) != 0 {
		t.Errorf("expected no SMS for nil ticket, got %d", len(enq.sent))
	}
}

func TestSendTicketCalledSMS_noPhoneIsNoop(t *testing.T) {
	t.Parallel()
	enq := &spySMSEnqueuer{}
	// No phone on client, clientID nil → resolvePhone returns ""
	ticket := &models.Ticket{
		ID:          "t1",
		QueueNumber: "А-1",
		UnitID:      "u1",
		Client:      &models.UnitClient{},
	}
	ns := newNotifSvcNoGate(nil, nil, enq)
	ns.SendTicketCalledSMS(ticket)
	if len(enq.sent) != 0 {
		t.Errorf("expected no SMS without phone, got %d", len(enq.sent))
	}
}

// --- resolvePhone ---

func TestResolvePhone_prefersPreloadedClient(t *testing.T) {
	t.Parallel()
	phone := "+79001112233"
	ticket := &models.Ticket{
		Client: &models.UnitClient{PhoneE164: &phone},
	}
	ns := &NotificationService{}
	if got := ns.resolvePhone(ticket); got != phone {
		t.Errorf("resolvePhone: want %q, got %q", phone, got)
	}
}

func TestResolvePhone_fallsBackToClientRepo(t *testing.T) {
	t.Parallel()
	phone := "+79009998877"
	clientID := "client-123"
	clientRepo := &stubUnitClientRepo{
		client: &models.UnitClient{PhoneE164: &phone},
	}
	ticket := &models.Ticket{ClientID: &clientID}
	ns := &NotificationService{clientRepo: clientRepo}
	if got := ns.resolvePhone(ticket); got != phone {
		t.Errorf("resolvePhone fallback: want %q, got %q", phone, got)
	}
}

func TestResolvePhone_returnsEmptyWhenNoClientID(t *testing.T) {
	t.Parallel()
	ns := &NotificationService{}
	if got := ns.resolvePhone(&models.Ticket{}); got != "" {
		t.Errorf("resolvePhone no client: want empty, got %q", got)
	}
}

// --- enqueueSMS creates row + enqueues job ---

func TestEnqueueSMS_createsRowAndEnqueuesJob(t *testing.T) {
	t.Parallel()
	notifRepo := &spyNotifRepo{}
	enq := &spySMSEnqueuer{}
	ns := &NotificationService{
		notifRepo: notifRepo,
		jobClient: enq,
	}
	tk := &models.Ticket{ID: "ticket-1", UnitID: "u1"}
	ns.enqueueSMS("ticket-1", "co1", "+79001234567", "Test body", "ticket_called", "u1", tk)

	if len(notifRepo.created) != 1 {
		t.Fatalf("expected 1 notification row, got %d", len(notifRepo.created))
	}
	if notifRepo.created[0].Type != "ticket_called" {
		t.Errorf("notification type: want 'ticket_called', got %q", notifRepo.created[0].Type)
	}
	if len(enq.sent) != 1 {
		t.Fatalf("expected 1 enqueued SMS job, got %d", len(enq.sent))
	}
	if enq.sent[0].To != "+79001234567" {
		t.Errorf("SMS recipient: want '+79001234567', got %q", enq.sent[0].To)
	}
	if enq.sent[0].Body != "Test body" {
		t.Errorf("SMS body: want 'Test body', got %q", enq.sent[0].Body)
	}
}

func TestEnqueueSMS_noopWhenNotifRepoNil(t *testing.T) {
	t.Parallel()
	enq := &spySMSEnqueuer{}
	ns := &NotificationService{notifRepo: nil, jobClient: enq}
	tk := &models.Ticket{ID: "t1", UnitID: "u1"}
	ns.enqueueSMS("t1", "c1", "+7000", "body", "ticket_called", "u1", tk) // must not panic
	if len(enq.sent) != 0 {
		t.Errorf("should not enqueue when notifRepo is nil")
	}
}

func TestEnqueueSMS_noopWhenJobClientNil(t *testing.T) {
	t.Parallel()
	notifRepo := &spyNotifRepo{}
	ns := &NotificationService{notifRepo: notifRepo, jobClient: nil}
	tk := &models.Ticket{ID: "t1", UnitID: "u1"}
	ns.enqueueSMS("t1", "c1", "+7000", "body", "ticket_called", "u1", tk) // must not panic
}

// --- SendQueuePositionAlert: gate check (nil unitRepo → no-op) ---

func TestSendQueuePositionAlert_nilTicketIsNoop(t *testing.T) {
	t.Parallel()
	enq := &spySMSEnqueuer{}
	ns := newNotifSvcNoGate(nil, nil, enq)
	ns.SendQueuePositionAlert(nil)
	if len(enq.sent) != 0 {
		t.Errorf("expected no SMS for nil ticket")
	}
}
