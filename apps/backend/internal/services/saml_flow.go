package services

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"encoding/xml"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/tenantslug"
	"quokkaq-go-backend/internal/sso/redisstore"

	"github.com/crewjam/saml"
	"github.com/crewjam/saml/samlsp"
)

type samlRelayPayload struct {
	CompanyID string `json:"companyId"`
	RequestID string `json:"requestId"`
	UILocale  string `json:"uiLocale,omitempty"`
}

// CompanyAndConnectionForTenantSlug resolves tenant slug to company and SSO row.
func (s *SSOService) CompanyAndConnectionForTenantSlug(tenantSlug string) (*models.Company, *models.CompanySSOConnection, error) {
	slug := tenantslug.Normalize(strings.TrimSpace(tenantSlug))
	if err := tenantslug.Validate(slug); err != nil {
		return nil, nil, err
	}
	c, err := s.companyRepo.FindBySlug(slug)
	if err != nil {
		return nil, nil, err
	}
	conn, err := s.ssoRepo.GetConnectionByCompanyID(c.ID)
	if err != nil {
		return nil, nil, err
	}
	return c, conn, nil
}

func loadSAMLSPCredentials() (cert *x509.Certificate, key crypto.Signer, err error) {
	keyPEM := strings.TrimSpace(os.Getenv("SAML_SP_PRIVATE_KEY_PEM"))
	certPEM := strings.TrimSpace(os.Getenv("SAML_SP_CERT_PEM"))
	if keyPEM == "" || certPEM == "" {
		return nil, nil, errors.New("SAML_SP_PRIVATE_KEY_PEM and SAML_SP_CERT_PEM must be set for SAML")
	}
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return nil, nil, errors.New("invalid SAML_SP_CERT_PEM")
	}
	cert, err = x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, nil, err
	}
	kb, _ := pem.Decode([]byte(keyPEM))
	if kb == nil {
		return nil, nil, errors.New("invalid SAML_SP_PRIVATE_KEY_PEM")
	}
	pk, err := x509.ParsePKCS8PrivateKey(kb.Bytes)
	if err != nil {
		pk2, err2 := x509.ParsePKCS1PrivateKey(kb.Bytes)
		if err2 != nil {
			return nil, nil, fmt.Errorf("parse private key: %w", err)
		}
		return cert, pk2, nil
	}
	signer, ok := pk.(*rsa.PrivateKey)
	if !ok {
		return nil, nil, errors.New("SAML SP key must be RSA for this build")
	}
	return cert, signer, nil
}

func (s *SSOService) buildSAMLServiceProvider(c *models.Company, conn *models.CompanySSOConnection) (*saml.ServiceProvider, error) {
	cert, key, err := loadSAMLSPCredentials()
	if err != nil {
		return nil, err
	}
	metaBase, err := url.Parse(apiPublicURL() + "/auth/saml/metadata")
	if err != nil {
		return nil, err
	}
	q := metaBase.Query()
	q.Set("tenant", c.Slug)
	metaBase.RawQuery = q.Encode()

	acs, err := url.Parse(apiPublicURL() + "/auth/saml/acs")
	if err != nil {
		return nil, err
	}
	q2 := acs.Query()
	q2.Set("tenant", c.Slug)
	acs.RawQuery = q2.Encode()

	idpURL, err := url.Parse(strings.TrimSpace(conn.SAMLIDPMetadataURL))
	if err != nil || idpURL.String() == "" {
		return nil, errors.New("invalid SAML IdP metadata URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	entity, err := samlsp.FetchMetadata(ctx, http.DefaultClient, *idpURL)
	if err != nil {
		return nil, err
	}

	sp := &saml.ServiceProvider{
		EntityID:          metaBase.String(),
		Key:               key,
		Certificate:       cert,
		HTTPClient:        &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}}},
		MetadataURL:       *metaBase,
		AcsURL:            *acs,
		IDPMetadata:       entity,
		AuthnNameIDFormat: saml.EmailAddressNameIDFormat,
	}
	return sp, nil
}

// BeginSAMLAuth starts SP-initiated SAML (HTTP-Redirect).
func (s *SSOService) BeginSAMLAuth(ctx context.Context, w http.ResponseWriter, r *http.Request, c *models.Company, conn *models.CompanySSOConnection) error {
	sp, err := s.buildSAMLServiceProvider(c, conn)
	if err != nil {
		log.Printf("saml sp: %v", err)
		http.Error(w, "SAML not configured", http.StatusBadRequest)
		return err
	}
	authnReq, err := sp.MakeAuthenticationRequest(sp.GetSSOBindingLocation(saml.HTTPRedirectBinding), saml.HTTPRedirectBinding, saml.HTTPPostBinding)
	if err != nil {
		log.Printf("saml MakeAuthenticationRequest: %v", err)
		http.Error(w, "SAML error", http.StatusInternalServerError)
		return err
	}
	relay := randomHex(24)
	rdb := redisstore.Client()
	if rdb == nil {
		http.Error(w, "SSO store unavailable", http.StatusServiceUnavailable)
		return errors.New("redis")
	}
	payload := samlRelayPayload{
		CompanyID: c.ID,
		RequestID: authnReq.ID,
		UILocale:  normalizeSSOUILocale(r.URL.Query().Get("locale")),
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeySAMLRelay(relay), payload, 15*time.Minute); err != nil {
		http.Error(w, "SSO store error", http.StatusServiceUnavailable)
		return err
	}
	loc, err := authnReq.Redirect(relay, sp)
	if err != nil {
		http.Error(w, "SAML redirect error", http.StatusInternalServerError)
		return err
	}
	http.Redirect(w, r, loc.String(), http.StatusFound)
	return nil
}

func emailFromSAMLAssertion(a *saml.Assertion) string {
	if a == nil {
		return ""
	}
	if a.Subject != nil && a.Subject.NameID != nil {
		v := strings.TrimSpace(a.Subject.NameID.Value)
		if v != "" && strings.Contains(v, "@") {
			return v
		}
	}
	for _, stmt := range a.AttributeStatements {
		for _, attr := range stmt.Attributes {
			n := strings.ToLower(attr.Name)
			if strings.Contains(n, "mail") || strings.Contains(n, "email") {
				for _, v := range attr.Values {
					t := strings.TrimSpace(v.Value)
					if t != "" {
						return t
					}
				}
			}
		}
	}
	return ""
}

// HandleSAMLACS handles POST /auth/saml/acs.
func (s *SSOService) HandleSAMLACS(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	relay := strings.TrimSpace(r.PostForm.Get("RelayState"))
	if relay == "" {
		http.Error(w, "missing RelayState", http.StatusBadRequest)
		return
	}
	var payload samlRelayPayload
	if err := redisstore.GetJSON(ctx, redisstore.KeySAMLRelay(relay), &payload); err != nil {
		http.Error(w, "invalid or expired SAML relay", http.StatusBadRequest)
		return
	}
	_ = redisstore.Del(ctx, redisstore.KeySAMLRelay(relay))

	c, err := s.companyRepo.FindByID(payload.CompanyID)
	if err != nil {
		http.Error(w, "tenant error", http.StatusBadRequest)
		return
	}
	conn, err := s.ssoRepo.GetConnectionByCompanyID(c.ID)
	if err != nil {
		http.Error(w, "SSO not found", http.StatusBadRequest)
		return
	}
	sp, err := s.buildSAMLServiceProvider(c, conn)
	if err != nil {
		http.Error(w, "SAML error", http.StatusInternalServerError)
		return
	}
	assertion, err := sp.ParseResponse(r, []string{payload.RequestID})
	if err != nil {
		log.Printf("saml ParseResponse: %v", err)
		http.Error(w, "invalid SAML response", http.StatusBadRequest)
		return
	}
	email := emailFromSAMLAssertion(assertion)
	if email == "" {
		cid := c.ID
		s.redirectLoginSSOError(ctx, w, r, &cid, "saml_email_missing", "saml_email_missing", payload.UILocale)
		return
	}
	iss := ""
	if assertion.Issuer.Value != "" {
		iss = assertion.Issuer.Value
	} else if sp.IDPMetadata != nil {
		iss = sp.IDPMetadata.EntityID
	}
	sub := ""
	if assertion.Subject != nil && assertion.Subject.NameID != nil {
		sub = strings.TrimSpace(assertion.Subject.NameID.Value)
	}
	if sub == "" {
		sub = email
	}
	displayName := ""
	if assertion.Subject != nil && assertion.Subject.NameID != nil {
		displayName = strings.TrimSpace(assertion.Subject.NameID.Value)
	}

	user, err := s.resolveSSOUser(ctx, c, conn, iss, sub, email, displayName, true)
	if err != nil {
		log.Printf("saml resolve user: %v", err)
		code := ssoErrorQueryCode(err)
		cid := c.ID
		s.redirectLoginSSOError(ctx, w, r, &cid, code, "saml_acs_denied:"+code, payload.UILocale)
		return
	}

	finish := randomHex(16)
	if err := redisstore.SetJSON(ctx, redisstore.KeyExchange(finish), map[string]string{
		"userId": user.ID,
	}, 3*time.Minute); err != nil {
		http.Error(w, "session error", http.StatusServiceUnavailable)
		return
	}
	loc := loginSSOCallbackSuccessURL(finish, payload.UILocale)
	cid := c.ID
	uid := user.ID
	s.persistSSOAudit(ctx, &cid, &uid, true, "saml_acs_ok")
	http.Redirect(w, r, loc, http.StatusFound)
}

// HandleSAMLMetadata serves SP metadata XML (GET).
func (s *SSOService) HandleSAMLMetadata(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	tenant := strings.TrimSpace(r.URL.Query().Get("tenant"))
	c, conn, err := s.CompanyAndConnectionForTenantSlug(tenant)
	if err != nil || !strings.EqualFold(strings.TrimSpace(conn.SSOProtocol), "saml") {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	sp, err := s.buildSAMLServiceProvider(c, conn)
	if err != nil {
		http.Error(w, "SAML not configured", http.StatusBadRequest)
		return
	}
	md := sp.Metadata()
	buf, err := xml.MarshalIndent(md, "", "  ")
	if err != nil {
		http.Error(w, "metadata error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/samlmetadata+xml")
	_, _ = w.Write(buf)
}
