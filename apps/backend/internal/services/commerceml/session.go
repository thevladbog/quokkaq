package commerceml

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type sessionEntry struct {
	companyID string
	expires   time.Time
}

// SessionStore holds short-lived CommerceML checkauth sessions (in-memory POC).
type SessionStore struct {
	mu   sync.Mutex
	data map[string]sessionEntry
	ttl  time.Duration
}

func NewSessionStore(ttl time.Duration) *SessionStore {
	return &SessionStore{
		data: make(map[string]sessionEntry),
		ttl:  ttl,
	}
}

func (s *SessionStore) Create(companyID string) string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	id := hex.EncodeToString(b)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[id] = sessionEntry{companyID: companyID, expires: time.Now().Add(s.ttl)}
	return id
}

func (s *SessionStore) CompanyID(session string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.data[session]
	if !ok || time.Now().After(e.expires) {
		delete(s.data, session)
		return "", false
	}
	return e.companyID, true
}

func (s *SessionStore) Invalidate(session string) {
	s.mu.Lock()
	delete(s.data, session)
	s.mu.Unlock()
}
