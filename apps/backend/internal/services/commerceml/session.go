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

// Create issues a new session id for companyID. It returns an error if cryptographic randomness fails.
func (s *SessionStore) Create(companyID string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	id := hex.EncodeToString(b)
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneExpiredLocked(now)
	s.data[id] = sessionEntry{companyID: companyID, expires: now.Add(s.ttl)}
	return id, nil
}

func (s *SessionStore) pruneExpiredLocked(now time.Time) {
	for id, entry := range s.data {
		if now.After(entry.expires) {
			delete(s.data, id)
		}
	}
}

func (s *SessionStore) CompanyID(session string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	s.pruneExpiredLocked(now)
	e, ok := s.data[session]
	if !ok || now.After(e.expires) {
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
