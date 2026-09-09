package postgres

import (
	"testing"

	"github.com/openvote/backend/internal/domain/entity"
)

func TestBuildPVAnomaliesDetectsVerificationRisks(t *testing.T) {
	pv := &entity.PVSubmission{
		RegisteredVoters: 100,
		VotersCount:      98,
		NullVotes:        1,
		BlankVotes:       1,
		DisputedVotes:    0,
	}
	results := []entity.PVResult{
		{Votes: 80},
		{Votes: 10},
	}

	anomalies := buildPVAnomalies(pv, results, 2)

	codes := map[string]bool{}
	for _, anomaly := range anomalies {
		codes[anomaly.Code] = true
	}
	for _, code := range []string{"vote_totals_mismatch", "high_turnout", "duplicate_polling_station_pv"} {
		if !codes[code] {
			t.Fatalf("anomalie %q attendue dans %+v", code, anomalies)
		}
	}
	if codes["voters_above_registered"] {
		t.Fatalf("voters_above_registered ne doit pas être signalée pour ce PV")
	}
}

func TestBuildPVAnomaliesDetectsVotersAboveRegistered(t *testing.T) {
	pv := &entity.PVSubmission{
		RegisteredVoters: 100,
		VotersCount:      101,
	}

	anomalies := buildPVAnomalies(pv, []entity.PVResult{{Votes: 101}}, 1)

	for _, anomaly := range anomalies {
		if anomaly.Code == "voters_above_registered" {
			return
		}
	}
	t.Fatalf("voters_above_registered attendue dans %+v", anomalies)
}
