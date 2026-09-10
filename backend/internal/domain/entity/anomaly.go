package entity

const (
	PVAnomalyIntegrityError        = "integrity_error"
	PVAnomalyVotersAboveRegistered = "voters_above_registered"
	PVAnomalyVoteTotalsMismatch    = "vote_totals_mismatch"
	PVAnomalyHighTurnout           = "high_turnout"
	PVAnomalyDuplicateStationPV    = "duplicate_polling_station_pv"
)

var PVAnomalyCodes = []string{
	PVAnomalyIntegrityError,
	PVAnomalyVotersAboveRegistered,
	PVAnomalyVoteTotalsMismatch,
	PVAnomalyHighTurnout,
	PVAnomalyDuplicateStationPV,
}
