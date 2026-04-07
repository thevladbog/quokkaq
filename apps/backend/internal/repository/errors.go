package repository

import (
	"errors"

	"gorm.io/gorm"
)

// IsNotFound reports whether err is a missing-row error from GORM First/Take used by this package's FindByID methods.
func IsNotFound(err error) bool {
	return err != nil && errors.Is(err, gorm.ErrRecordNotFound)
}
