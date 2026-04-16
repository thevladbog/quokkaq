// Package vulnpins pins minimum versions of security-sensitive transitive dependencies
// (SAML / OIDC stack) so go.mod keeps patched releases under MVS and govulncheck stays clean.
//
// Remove this package only after crewjam/saml and coreos/go-oidc declare fixed floors themselves.
package vulnpins

import (
	_ "github.com/go-jose/go-jose/v4"
	_ "github.com/russellhaering/goxmldsig"
)
