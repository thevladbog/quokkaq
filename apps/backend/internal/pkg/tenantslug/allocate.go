package tenantslug

import (
	"fmt"
)

// SlugExists returns true if the slug is already taken (e.g. DB row exists).
type SlugExists func(slug string) (bool, error)

// PickUniqueSlug chooses a unique slug from a company display name, mirroring migration v1.2.0_sso_tenant_slug.
// exists must report collisions in the same datastore used for insert (e.g. within a transaction).
func PickUniqueSlug(companyName string, exists SlugExists) (string, error) {
	base := Normalize(companyName)
	if len(base) < MinLen {
		base = "tenant"
	}
	for attempt := 0; attempt < 50; attempt++ {
		var slug string
		if attempt == 0 {
			slug = base
		} else {
			slug = fmt.Sprintf("%s-%d", base, attempt)
		}
		if err := Validate(slug); err != nil {
			continue
		}
		taken, err := exists(slug)
		if err != nil {
			return "", err
		}
		if !taken {
			return slug, nil
		}
	}
	return "", fmt.Errorf("could not allocate a unique slug")
}
