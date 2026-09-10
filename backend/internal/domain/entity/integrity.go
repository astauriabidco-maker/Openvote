package entity

const (
	PVIntegrityTrusted              = "trusted"
	PVIntegrityHashVerifiedUnsigned = "hash_verified_unsigned"
	PVIntegrityHashMismatch         = "hash_mismatch"
	PVIntegrityIncomplete           = "incomplete"
	PVIntegrityUnverified           = "unverified"
)

var PVIntegrityStatuses = []string{
	PVIntegrityTrusted,
	PVIntegrityHashVerifiedUnsigned,
	PVIntegrityHashMismatch,
	PVIntegrityIncomplete,
	PVIntegrityUnverified,
}

const (
	IntegrityErrorPayloadHashMismatch       = "payload_hash_mismatch"
	IntegrityErrorMissingPayloadHash        = "missing_payload_hash"
	IntegrityErrorMissingPhotoHash          = "missing_photo_hash"
	IntegrityErrorMissingPhotoURL           = "missing_photo_url"
	IntegrityErrorMissingSignature          = "missing_signature"
	IntegrityErrorMissingDeviceID           = "missing_device_id"
	IntegrityErrorUnregisteredDevice        = "unregistered_device"
	IntegrityErrorInvalidSignature          = "invalid_signature"
	IntegrityErrorDeviceRegistryUnavailable = "device_key_registry_unavailable"
	IntegrityErrorDeviceKeyLookupFailed     = "device_key_lookup_failed"
	IntegrityErrorInvalidRegisteredKey      = "invalid_registered_public_key"
	IntegrityErrorUnsupportedSignatureAlgo  = "unsupported_signature_algorithm"
	IntegrityErrorMissingClientRecordedAt   = "missing_client_recorded_at"
	IntegrityErrorUnreadable                = "integrity_errors_unreadable"
)

var PVIntegrityErrorCodes = []string{
	IntegrityErrorPayloadHashMismatch,
	IntegrityErrorMissingPayloadHash,
	IntegrityErrorMissingPhotoHash,
	IntegrityErrorMissingPhotoURL,
	IntegrityErrorMissingSignature,
	IntegrityErrorMissingDeviceID,
	IntegrityErrorUnregisteredDevice,
	IntegrityErrorInvalidSignature,
	IntegrityErrorDeviceRegistryUnavailable,
	IntegrityErrorDeviceKeyLookupFailed,
	IntegrityErrorInvalidRegisteredKey,
	IntegrityErrorUnsupportedSignatureAlgo,
	IntegrityErrorMissingClientRecordedAt,
}
