package models

import (
	"encoding/json"
	"time"
)

// KioskETAGBDTArtifact stores ensemble blend weights (5.2) learned when slot calibration is rebuilt.
// Weights: [wBaseline, wP50, wP90, wP95] in [0,1] approximately summing to 1 (stochastic gradient-boosting-style fit).
type KioskETAGBDTArtifact struct {
	UnitID    string          `gorm:"primaryKey;not null" json:"unitId"`
	UpdatedAt time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`
	Weights   json.RawMessage `gorm:"column:weights_json;type:jsonb;not null" json:"weightsJson" swaggertype:"array,number"`
}

func (KioskETAGBDTArtifact) TableName() string { return "kiosk_eta_gbm_artifact" }
