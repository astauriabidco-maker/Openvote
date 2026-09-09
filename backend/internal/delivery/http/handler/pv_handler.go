package handler

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/service"
	"github.com/uber/h3-go/v4"
)

type PVHandler struct {
	stationRepo    repository.PollingStationRepository
	candidateRepo  repository.CandidateRepository
	pvRepo         repository.PVRepository
	assignmentRepo repository.PollingStationAssignmentRepository
	deviceKeyRepo  repository.ObserverDeviceKeyRepository
	pvAuditRepo    repository.PVAuditRepository
	storageService service.StorageService
}

func NewPVHandler(
	stationRepo repository.PollingStationRepository,
	candidateRepo repository.CandidateRepository,
	pvRepo repository.PVRepository,
	assignmentRepo repository.PollingStationAssignmentRepository,
	deviceKeyRepo repository.ObserverDeviceKeyRepository,
	pvAuditRepo repository.PVAuditRepository,
	storageService service.StorageService,
) *PVHandler {
	return &PVHandler{
		stationRepo:    stationRepo,
		candidateRepo:  candidateRepo,
		pvRepo:         pvRepo,
		assignmentRepo: assignmentRepo,
		deviceKeyRepo:  deviceKeyRepo,
		pvAuditRepo:    pvAuditRepo,
		storageService: storageService,
	}
}

type createPollingStationRequest struct {
	ElectionID       string  `json:"election_id" binding:"required"`
	Code             string  `json:"code" binding:"required"`
	Name             string  `json:"name" binding:"required"`
	RegionID         string  `json:"region_id"`
	DepartmentID     string  `json:"department_id"`
	ArrondissementID string  `json:"arrondissement_id"`
	RegisteredVoters int     `json:"registered_voters"`
	LocationName     string  `json:"location_name"`
	Latitude         float64 `json:"latitude"`
	Longitude        float64 `json:"longitude"`
	SourceName       string  `json:"source_name"`
}

type csvImportError struct {
	Line   int    `json:"line"`
	Reason string `json:"reason"`
}

const maxCSVImportErrors = 20

type registerDeviceKeyRequest struct {
	DeviceID     string          `json:"device_id" binding:"required"`
	Algorithm    string          `json:"algorithm"`
	PublicKeyJWK json.RawMessage `json:"public_key_jwk" binding:"required"`
}

func (h *PVHandler) RegisterDeviceKey(c *gin.Context) {
	if h.deviceKeyRepo == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "registre de clés indisponible"})
		return
	}
	userID := CallerUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "utilisateur non identifié"})
		return
	}
	var req registerDeviceKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	algorithm := strings.TrimSpace(req.Algorithm)
	if algorithm == "" {
		algorithm = "ECDSA_P256_SHA256"
	}
	if algorithm != "ECDSA_P256_SHA256" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "algorithm doit être ECDSA_P256_SHA256"})
		return
	}
	if _, err := parseECDSAP256JWK(req.PublicKeyJWK); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "public_key_jwk invalide: " + err.Error()})
		return
	}
	key := &entity.ObserverDeviceKey{
		UserID:       userID,
		DeviceID:     strings.TrimSpace(req.DeviceID),
		Algorithm:    algorithm,
		PublicKeyJWK: string(req.PublicKeyJWK),
		Active:       true,
	}
	if err := h.deviceKeyRepo.Upsert(c.Request.Context(), key); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"device_key": key})
}

func (h *PVHandler) GetPVUploadURL(c *gin.Context) {
	if h.storageService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "stockage preuve indisponible"})
		return
	}
	fileName := strings.TrimSpace(c.Query("file_name"))
	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name est requis"})
		return
	}
	fileName = strings.TrimLeft(fileName, "/")
	if strings.Contains(fileName, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name invalide"})
		return
	}
	if !strings.HasPrefix(fileName, "pv/") {
		fileName = "pv/" + fileName
	}
	url, err := h.storageService.GenerateUploadURL(c.Request.Context(), fileName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "URL upload PV impossible: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"upload_url":   url,
		"pv_photo_url": fileName,
	})
}

func (h *PVHandler) ListPollingStations(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	stations, err := h.stationRepo.GetByElection(c.Request.Context(), electionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if stations == nil {
		stations = []entity.PollingStation{}
	}
	c.JSON(http.StatusOK, gin.H{"polling_stations": stations, "total": len(stations)})
}

func (h *PVHandler) ListMyPollingStations(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	observerID := CallerUserID(c)
	if observerID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "observateur non identifié"})
		return
	}
	stations, err := h.stationRepo.GetAssignedToObserver(c.Request.Context(), electionID, observerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if stations == nil {
		stations = []entity.PollingStation{}
	}
	c.JSON(http.StatusOK, gin.H{"polling_stations": stations, "total": len(stations)})
}

func (h *PVHandler) CreatePollingStation(c *gin.Context) {
	var req createPollingStationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.RegisteredVoters < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "registered_voters ne peut pas être négatif"})
		return
	}

	station := &entity.PollingStation{
		ElectionID:       req.ElectionID,
		Code:             req.Code,
		Name:             req.Name,
		RegionID:         req.RegionID,
		DepartmentID:     req.DepartmentID,
		ArrondissementID: req.ArrondissementID,
		RegisteredVoters: req.RegisteredVoters,
		LocationName:     req.LocationName,
		SourceName:       req.SourceName,
	}
	if req.Latitude != 0 || req.Longitude != 0 {
		station.GPSLocation = fmt.Sprintf("POINT(%f %f)", req.Longitude, req.Latitude)
		station.H3Index = h3.LatLngToCell(h3.NewLatLng(req.Latitude, req.Longitude), 10).String()
	}

	if err := h.stationRepo.Create(c.Request.Context(), station); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"polling_station": station})
}

func (h *PVHandler) ImportPollingStationsCSV(c *gin.Context) {
	electionID := c.PostForm("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fichier CSV requis"})
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true
	rows, err := reader.ReadAll()
	if err != nil && err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV invalide: " + err.Error()})
		return
	}

	imported := 0
	failed := 0
	importErrors := []csvImportError{}
	for i, row := range rows {
		if i == 0 && len(row) > 0 && strings.EqualFold(strings.TrimSpace(row[0]), "code") {
			continue
		}
		line := i + 1
		if len(row) < 2 {
			failed++
			importErrors = appendCSVImportError(importErrors, line, "colonnes code et name requises")
			continue
		}
		registered := parseCSVInt(row, 5)
		lat := parseCSVFloat(row, 7)
		lon := parseCSVFloat(row, 8)
		station := &entity.PollingStation{
			ElectionID:       electionID,
			Code:             strings.TrimSpace(row[0]),
			Name:             strings.TrimSpace(row[1]),
			RegionID:         csvString(row, 2),
			DepartmentID:     csvString(row, 3),
			ArrondissementID: csvString(row, 4),
			RegisteredVoters: registered,
			LocationName:     csvString(row, 6),
			SourceName:       header.Filename,
		}
		if lat != 0 || lon != 0 {
			station.GPSLocation = fmt.Sprintf("POINT(%f %f)", lon, lat)
			station.H3Index = h3.LatLngToCell(h3.NewLatLng(lat, lon), 10).String()
		}
		if station.Code == "" || station.Name == "" {
			failed++
			importErrors = appendCSVImportError(importErrors, line, "code et name ne peuvent pas être vides")
			continue
		}
		if err := h.stationRepo.Create(c.Request.Context(), station); err != nil {
			failed++
			importErrors = appendCSVImportError(importErrors, line, err.Error())
			continue
		}
		imported++
	}

	c.JSON(http.StatusOK, gin.H{"imported": imported, "failed": failed, "errors": importErrors})
}

type createCandidateRequest struct {
	ElectionID   string `json:"election_id" binding:"required"`
	Name         string `json:"name" binding:"required"`
	Party        string `json:"party"`
	BallotNumber *int   `json:"ballot_number"`
}

func (h *PVHandler) ListCandidates(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	candidates, err := h.candidateRepo.GetByElection(c.Request.Context(), electionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if candidates == nil {
		candidates = []entity.Candidate{}
	}
	c.JSON(http.StatusOK, gin.H{"candidates": candidates, "total": len(candidates)})
}

func (h *PVHandler) CreateCandidate(c *gin.Context) {
	var req createCandidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.BallotNumber != nil && *req.BallotNumber <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ballot_number doit être positif"})
		return
	}
	candidate := &entity.Candidate{
		ElectionID:   req.ElectionID,
		Name:         req.Name,
		Party:        req.Party,
		BallotNumber: req.BallotNumber,
	}
	if err := h.candidateRepo.Create(c.Request.Context(), candidate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"candidate": candidate})
}

func (h *PVHandler) ImportCandidatesCSV(c *gin.Context) {
	electionID := c.PostForm("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fichier CSV requis"})
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true
	rows, err := reader.ReadAll()
	if err != nil && err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV invalide: " + err.Error()})
		return
	}

	imported := 0
	failed := 0
	importErrors := []csvImportError{}
	for i, row := range rows {
		if i == 0 && len(row) > 0 && strings.EqualFold(strings.TrimSpace(row[0]), "name") {
			continue
		}
		line := i + 1
		if len(row) < 1 || strings.TrimSpace(row[0]) == "" {
			failed++
			importErrors = appendCSVImportError(importErrors, line, "name est requis")
			continue
		}
		ballot := parseOptionalCSVInt(row, 2)
		candidate := &entity.Candidate{
			ElectionID:   electionID,
			Name:         strings.TrimSpace(row[0]),
			Party:        csvString(row, 1),
			BallotNumber: ballot,
		}
		if err := h.candidateRepo.Create(c.Request.Context(), candidate); err != nil {
			failed++
			importErrors = appendCSVImportError(importErrors, line, err.Error())
			continue
		}
		imported++
	}

	c.JSON(http.StatusOK, gin.H{"imported": imported, "failed": failed, "errors": importErrors})
}

type createAssignmentRequest struct {
	ElectionID       string `json:"election_id" binding:"required"`
	PollingStationID string `json:"polling_station_id" binding:"required"`
	ObserverID       string `json:"observer_id" binding:"required"`
	Notes            string `json:"notes"`
}

type bulkAssignmentRequest struct {
	ElectionID        string   `json:"election_id" binding:"required"`
	ObserverID        string   `json:"observer_id" binding:"required"`
	PollingStationIDs []string `json:"polling_station_ids" binding:"required"`
	Notes             string   `json:"notes"`
}

type bulkAssignmentFailure struct {
	PollingStationID string `json:"polling_station_id"`
	Reason           string `json:"reason"`
}

func (h *PVHandler) CreateAssignment(c *gin.Context) {
	var req createAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	assignment := &entity.PollingStationAssignment{
		ElectionID:       req.ElectionID,
		PollingStationID: req.PollingStationID,
		ObserverID:       req.ObserverID,
		AssignedBy:       CallerUserID(c),
		Notes:            req.Notes,
	}
	if err := h.assignmentRepo.Create(c.Request.Context(), assignment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"assignment": assignment})
}

func (h *PVHandler) CreateAssignmentsBulk(c *gin.Context) {
	var req bulkAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.PollingStationIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "polling_station_ids ne peut pas être vide"})
		return
	}

	created := 0
	failed := 0
	assignments := []entity.PollingStationAssignment{}
	failures := []bulkAssignmentFailure{}
	assignedBy := CallerUserID(c)
	seen := map[string]bool{}

	for _, stationID := range req.PollingStationIDs {
		stationID = strings.TrimSpace(stationID)
		if stationID == "" {
			failed++
			failures = append(failures, bulkAssignmentFailure{Reason: "polling_station_id vide"})
			continue
		}
		if seen[stationID] {
			failed++
			failures = append(failures, bulkAssignmentFailure{PollingStationID: stationID, Reason: "bureau dupliqué dans la requête"})
			continue
		}
		seen[stationID] = true

		assignment := entity.PollingStationAssignment{
			ElectionID:       req.ElectionID,
			PollingStationID: stationID,
			ObserverID:       req.ObserverID,
			AssignedBy:       assignedBy,
			Notes:            req.Notes,
		}
		if err := h.assignmentRepo.Create(c.Request.Context(), &assignment); err != nil {
			failed++
			failures = append(failures, bulkAssignmentFailure{PollingStationID: stationID, Reason: err.Error()})
			continue
		}
		created++
		assignments = append(assignments, assignment)
	}

	status := http.StatusCreated
	if created == 0 && failed > 0 {
		status = http.StatusBadRequest
	}
	c.JSON(status, gin.H{
		"created":     created,
		"failed":      failed,
		"assignments": assignments,
		"errors":      failures,
	})
}

func (h *PVHandler) ListMyAssignments(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	observerID := CallerUserID(c)
	if observerID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "observateur non identifié"})
		return
	}
	assignments, err := h.assignmentRepo.GetByObserver(c.Request.Context(), electionID, observerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if assignments == nil {
		assignments = []entity.PollingStationAssignment{}
	}
	c.JSON(http.StatusOK, gin.H{"assignments": assignments, "total": len(assignments)})
}

func (h *PVHandler) GetFieldCoverage(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	coverage, err := h.assignmentRepo.GetCoverage(c.Request.Context(), electionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"coverage": coverage})
}

type pvResultRequest struct {
	CandidateID string `json:"candidate_id" binding:"required"`
	Votes       int    `json:"votes"`
}

type createPVRequest struct {
	ElectionID           string            `json:"election_id" binding:"required"`
	PollingStationID     string            `json:"polling_station_id" binding:"required"`
	RegisteredVoters     int               `json:"registered_voters"`
	VotersCount          int               `json:"voters_count"`
	NullVotes            int               `json:"null_votes"`
	BlankVotes           int               `json:"blank_votes"`
	DisputedVotes        int               `json:"disputed_votes"`
	PVPhotoURL           string            `json:"pv_photo_url"`
	PVHash               string            `json:"pv_hash"`
	SignedPayloadHash    string            `json:"signed_payload_hash"`
	Signature            string            `json:"signature"`
	ProofManifestVersion int               `json:"proof_manifest_version"`
	ClientRecordedAt     string            `json:"client_recorded_at"`
	DeviceLatitude       float64           `json:"device_latitude"`
	DeviceLongitude      float64           `json:"device_longitude"`
	DeviceID             string            `json:"device_id"`
	Notes                string            `json:"notes"`
	Results              []pvResultRequest `json:"results" binding:"required"`
}

type updatePVVerificationRequest struct {
	Status  entity.PVStatus `json:"status" binding:"required"`
	Comment string          `json:"comment"`
}

type canonicalPVResult struct {
	CandidateID string `json:"candidate_id"`
	Votes       int    `json:"votes"`
}

type canonicalPVProof struct {
	ProofManifestVersion int                 `json:"proof_manifest_version"`
	ElectionID           string              `json:"election_id"`
	PollingStationID     string              `json:"polling_station_id"`
	RegisteredVoters     int                 `json:"registered_voters"`
	VotersCount          int                 `json:"voters_count"`
	NullVotes            int                 `json:"null_votes"`
	BlankVotes           int                 `json:"blank_votes"`
	DisputedVotes        int                 `json:"disputed_votes"`
	PVHash               string              `json:"pv_hash"`
	ClientRecordedAt     string              `json:"client_recorded_at"`
	DeviceLatitude       float64             `json:"device_latitude"`
	DeviceLongitude      float64             `json:"device_longitude"`
	DeviceID             string              `json:"device_id"`
	Results              []canonicalPVResult `json:"results"`
}

func buildCanonicalPVProof(req createPVRequest) (string, string, error) {
	version := req.ProofManifestVersion
	if version == 0 {
		version = 1
	}
	results := make([]canonicalPVResult, 0, len(req.Results))
	for _, result := range req.Results {
		results = append(results, canonicalPVResult{
			CandidateID: strings.TrimSpace(result.CandidateID),
			Votes:       result.Votes,
		})
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].CandidateID < results[j].CandidateID
	})

	proof := canonicalPVProof{
		ProofManifestVersion: version,
		ElectionID:           strings.TrimSpace(req.ElectionID),
		PollingStationID:     strings.TrimSpace(req.PollingStationID),
		RegisteredVoters:     req.RegisteredVoters,
		VotersCount:          req.VotersCount,
		NullVotes:            req.NullVotes,
		BlankVotes:           req.BlankVotes,
		DisputedVotes:        req.DisputedVotes,
		PVHash:               strings.TrimSpace(req.PVHash),
		ClientRecordedAt:     strings.TrimSpace(req.ClientRecordedAt),
		DeviceLatitude:       req.DeviceLatitude,
		DeviceLongitude:      req.DeviceLongitude,
		DeviceID:             strings.TrimSpace(req.DeviceID),
		Results:              results,
	}
	raw, err := json.Marshal(proof)
	if err != nil {
		return "", "", err
	}
	digest := sha256.Sum256(raw)
	return string(raw), hex.EncodeToString(digest[:]), nil
}

func classifyPVIntegrity(req createPVRequest, serverHash string, signatureVerified bool, signatureError string) (string, []string) {
	errors := []string{}
	if strings.TrimSpace(req.PVHash) == "" {
		errors = append(errors, "missing_photo_hash")
	}
	if strings.TrimSpace(req.PVHash) != "" && strings.TrimSpace(req.PVPhotoURL) == "" {
		errors = append(errors, "missing_photo_url")
	}
	if strings.TrimSpace(req.ClientRecordedAt) == "" {
		errors = append(errors, "missing_client_recorded_at")
	}
	if strings.TrimSpace(req.SignedPayloadHash) == "" {
		errors = append(errors, "missing_payload_hash")
	} else if !strings.EqualFold(strings.TrimSpace(req.SignedPayloadHash), serverHash) {
		errors = append(errors, "payload_hash_mismatch")
	}
	if strings.TrimSpace(req.Signature) == "" {
		errors = append(errors, "missing_signature")
	} else if strings.TrimSpace(req.DeviceID) == "" {
		errors = append(errors, "missing_device_id")
	} else if !signatureVerified {
		if signatureError == "" {
			signatureError = "invalid_signature"
		}
		errors = append(errors, signatureError)
	}

	if len(errors) == 0 {
		return "trusted", errors
	}
	if len(errors) == 1 && errors[0] == "missing_signature" {
		return "hash_verified_unsigned", errors
	}
	for _, err := range errors {
		if err == "payload_hash_mismatch" {
			return "hash_mismatch", errors
		}
	}
	return "incomplete", errors
}

type ecdsaJWK struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func parseECDSAP256JWK(raw []byte) (*ecdsa.PublicKey, error) {
	var jwk ecdsaJWK
	if err := json.Unmarshal(raw, &jwk); err != nil {
		return nil, err
	}
	if jwk.Kty != "EC" || jwk.Crv != "P-256" || jwk.X == "" || jwk.Y == "" {
		return nil, fmt.Errorf("clé EC P-256 attendue")
	}
	xBytes, err := base64.RawURLEncoding.DecodeString(jwk.X)
	if err != nil {
		return nil, fmt.Errorf("x invalide")
	}
	yBytes, err := base64.RawURLEncoding.DecodeString(jwk.Y)
	if err != nil {
		return nil, fmt.Errorf("y invalide")
	}
	x := new(big.Int).SetBytes(xBytes)
	y := new(big.Int).SetBytes(yBytes)
	curve := elliptic.P256()
	if !curve.IsOnCurve(x, y) {
		return nil, fmt.Errorf("point hors courbe")
	}
	return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
}

func verifyECDSAP256Signature(publicKey *ecdsa.PublicKey, canonicalPayload, signature string) bool {
	sig, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil || len(sig) != 64 {
		return false
	}
	r := new(big.Int).SetBytes(sig[:32])
	s := new(big.Int).SetBytes(sig[32:])
	digest := sha256.Sum256([]byte(canonicalPayload))
	return ecdsa.Verify(publicKey, digest[:], r, s)
}

func (h *PVHandler) verifyDeviceSignature(c *gin.Context, observerID string, req createPVRequest, canonicalPayload string) (bool, string) {
	if strings.TrimSpace(req.Signature) == "" {
		return false, ""
	}
	if strings.TrimSpace(req.DeviceID) == "" {
		return false, "missing_device_id"
	}
	if h.deviceKeyRepo == nil {
		return false, "device_key_registry_unavailable"
	}
	key, err := h.deviceKeyRepo.GetActiveByUserAndDevice(c.Request.Context(), observerID, strings.TrimSpace(req.DeviceID))
	if err != nil {
		return false, "device_key_lookup_failed"
	}
	if key == nil {
		return false, "unregistered_device"
	}
	if key.Algorithm != "ECDSA_P256_SHA256" {
		return false, "unsupported_signature_algorithm"
	}
	publicKey, err := parseECDSAP256JWK([]byte(key.PublicKeyJWK))
	if err != nil {
		return false, "invalid_registered_public_key"
	}
	if !verifyECDSAP256Signature(publicKey, canonicalPayload, strings.TrimSpace(req.Signature)) {
		return false, "invalid_signature"
	}
	_ = h.deviceKeyRepo.MarkUsed(c.Request.Context(), key.ID)
	return true, ""
}

func (h *PVHandler) SubmitPV(c *gin.Context) {
	var req createPVRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Results) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "au moins un résultat candidat est requis"})
		return
	}
	if req.RegisteredVoters < 0 || req.VotersCount < 0 || req.NullVotes < 0 || req.BlankVotes < 0 || req.DisputedVotes < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "les compteurs de voix ne peuvent pas être négatifs"})
		return
	}
	totalCandidateVotes := 0
	results := make([]entity.PVResult, 0, len(req.Results))
	seenCandidates := map[string]bool{}
	for _, item := range req.Results {
		if item.Votes < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "les voix candidat ne peuvent pas être négatives"})
			return
		}
		if seenCandidates[item.CandidateID] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "candidat dupliqué dans le PV"})
			return
		}
		seenCandidates[item.CandidateID] = true
		totalCandidateVotes += item.Votes
		results = append(results, entity.PVResult{CandidateID: item.CandidateID, Votes: item.Votes})
	}
	if totalCandidateVotes+req.NullVotes+req.BlankVotes+req.DisputedVotes > req.VotersCount {
		c.JSON(http.StatusBadRequest, gin.H{"error": "la somme des voix dépasse le nombre de votants"})
		return
	}

	observerID := CallerUserID(c)
	if observerID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "observateur non identifié"})
		return
	}
	canonicalPayload, serverPayloadHash, err := buildCanonicalPVProof(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "empreinte PV impossible"})
		return
	}
	signatureVerified, signatureError := h.verifyDeviceSignature(c, observerID, req, canonicalPayload)
	integrityStatus, integrityErrors := classifyPVIntegrity(req, serverPayloadHash, signatureVerified, signatureError)
	proofVersion := req.ProofManifestVersion
	if proofVersion == 0 {
		proofVersion = 1
	}

	pv := &entity.PVSubmission{
		ElectionID:           req.ElectionID,
		PollingStationID:     req.PollingStationID,
		ObserverID:           observerID,
		Status:               entity.PVStatusSubmitted,
		RegisteredVoters:     req.RegisteredVoters,
		VotersCount:          req.VotersCount,
		NullVotes:            req.NullVotes,
		BlankVotes:           req.BlankVotes,
		DisputedVotes:        req.DisputedVotes,
		PVPhotoURL:           req.PVPhotoURL,
		PVHash:               strings.TrimSpace(req.PVHash),
		SignedPayloadHash:    strings.TrimSpace(req.SignedPayloadHash),
		Signature:            strings.TrimSpace(req.Signature),
		ProofManifestVersion: proofVersion,
		ClientRecordedAt:     strings.TrimSpace(req.ClientRecordedAt),
		DeviceLatitude:       req.DeviceLatitude,
		DeviceLongitude:      req.DeviceLongitude,
		DeviceID:             strings.TrimSpace(req.DeviceID),
		ServerPayloadHash:    serverPayloadHash,
		IntegrityStatus:      integrityStatus,
		IntegrityErrors:      integrityErrors,
		CanonicalPayload:     canonicalPayload,
		Notes:                req.Notes,
		Results:              results,
	}
	if err := h.pvRepo.Create(c.Request.Context(), pv); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.recordPVAudit(c, &entity.PVAuditEvent{
		PVSubmissionID:    pv.ID,
		ElectionID:        pv.ElectionID,
		PollingStationID:  pv.PollingStationID,
		ActorID:           observerID,
		ActorRole:         CallerRole(c),
		EventType:         "submitted",
		ToStatus:          pv.Status,
		IntegrityStatus:   pv.IntegrityStatus,
		ServerPayloadHash: pv.ServerPayloadHash,
		Comment:           "PV soumis depuis le terrain",
		Metadata: h.auditMetadata(map[string]any{
			"device_id":          pv.DeviceID,
			"client_recorded_at": pv.ClientRecordedAt,
			"proof_version":      pv.ProofManifestVersion,
			"pv_hash":            pv.PVHash,
			"pv_photo_url":       pv.PVPhotoURL,
		}),
	})
	c.JSON(http.StatusCreated, gin.H{"pv": pv})
}

func (h *PVHandler) GetPV(c *gin.Context) {
	pv, err := h.pvRepo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pv == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "PV introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"pv": pv})
}

func (h *PVHandler) ListPVs(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	pvs, err := h.pvRepo.GetByElection(c.Request.Context(), electionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pvs == nil {
		pvs = []entity.PVSubmission{}
	}
	c.JSON(http.StatusOK, gin.H{"pv_submissions": pvs, "total": len(pvs)})
}

func (h *PVHandler) ListPVsForReview(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && !isKnownPVStatus(entity.PVStatus(status)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status PV invalide"})
		return
	}
	pvs, err := h.pvRepo.GetForReview(c.Request.Context(), electionID, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pvs == nil {
		pvs = []entity.PVSubmission{}
	}
	c.JSON(http.StatusOK, gin.H{"pv_submissions": pvs, "total": len(pvs)})
}

func (h *PVHandler) UpdatePVVerification(c *gin.Context) {
	var req updatePVVerificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !isPVVerificationStatus(req.Status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status doit être verified, rejected ou needs_clarification"})
		return
	}
	before, err := h.pvRepo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if before == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "PV introuvable"})
		return
	}
	pv, err := h.pvRepo.UpdateVerificationStatus(
		c.Request.Context(),
		c.Param("id"),
		req.Status,
		strings.TrimSpace(req.Comment),
		CallerUserID(c),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pv == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "PV introuvable"})
		return
	}
	h.recordPVAudit(c, &entity.PVAuditEvent{
		PVSubmissionID:    pv.ID,
		ElectionID:        pv.ElectionID,
		PollingStationID:  pv.PollingStationID,
		ActorID:           CallerUserID(c),
		ActorRole:         CallerRole(c),
		EventType:         "verification_decision",
		FromStatus:        before.Status,
		ToStatus:          pv.Status,
		IntegrityStatus:   pv.IntegrityStatus,
		ServerPayloadHash: pv.ServerPayloadHash,
		Comment:           strings.TrimSpace(req.Comment),
		Metadata: h.auditMetadata(map[string]any{
			"previous_verified_by": before.VerifiedBy,
			"previous_comment":     before.VerificationComment,
		}),
	})
	c.JSON(http.StatusOK, gin.H{"pv": pv})
}

func (h *PVHandler) ListPVAuditEvents(c *gin.Context) {
	if h.pvAuditRepo == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "journal PV indisponible"})
		return
	}
	events, err := h.pvAuditRepo.GetByPV(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if events == nil {
		events = []entity.PVAuditEvent{}
	}
	c.JSON(http.StatusOK, gin.H{"audit_events": events, "total": len(events)})
}

func (h *PVHandler) recordPVAudit(c *gin.Context, event *entity.PVAuditEvent) {
	if h.pvAuditRepo == nil {
		return
	}
	if err := h.pvAuditRepo.Create(c.Request.Context(), event); err != nil {
		fmt.Printf("[PV_AUDIT] write failed for pv=%s event=%s: %v\n", event.PVSubmissionID, event.EventType, err)
	}
}

func (h *PVHandler) auditMetadata(data map[string]any) string {
	payload, err := json.Marshal(data)
	if err != nil {
		return "{}"
	}
	return string(payload)
}

func (h *PVHandler) GetSummary(c *gin.Context) {
	electionID := c.Query("election_id")
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	summary, err := h.pvRepo.GetSummary(c.Request.Context(), electionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"summary": summary})
}

func (h *PVHandler) ListPublicPVProofs(c *gin.Context) {
	electionID := strings.TrimSpace(c.Query("election_id"))
	if electionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "election_id est requis"})
		return
	}
	proofs, err := h.pvRepo.GetPublicProofs(c.Request.Context(), electionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if proofs == nil {
		proofs = []entity.PublicPVProof{}
	}
	export := entity.PublicPVProofExport{
		ProofManifestVersion: 1,
		ElectionID:           electionID,
		GeneratedAt:          time.Now().UTC().Format(time.RFC3339Nano),
		Total:                len(proofs),
		PVProofs:             proofs,
	}
	signature, err := signPublicPVProofExport(export)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"export":       export,
		"export_proof": signature,
		"pv_proofs":    proofs,
		"total":        len(proofs),
	})
}

func signPublicPVProofExport(export entity.PublicPVProofExport) (entity.PublicPVExportProof, error) {
	privateKey, publicKey, err := publicExportSigningKey()
	if err != nil {
		return entity.PublicPVExportProof{}, err
	}
	raw, err := json.Marshal(export)
	if err != nil {
		return entity.PublicPVExportProof{}, fmt.Errorf("export public non sérialisable")
	}
	digest := sha256.Sum256(raw)
	signature := ed25519.Sign(privateKey, digest[:])
	return entity.PublicPVExportProof{
		Algorithm:       "ED25519_SHA256_EXPORT_V1",
		ExportHash:      hex.EncodeToString(digest[:]),
		Signature:       base64.RawURLEncoding.EncodeToString(signature),
		PublicKey:       base64.RawURLEncoding.EncodeToString(publicKey),
		CanonicalExport: string(raw),
	}, nil
}

func publicExportSigningKey() (ed25519.PrivateKey, ed25519.PublicKey, error) {
	if raw := strings.TrimSpace(os.Getenv("PUBLIC_EXPORT_SIGNING_PRIVATE_KEY_BASE64")); raw != "" {
		key, err := base64.RawStdEncoding.DecodeString(raw)
		if err != nil {
			key, err = base64.StdEncoding.DecodeString(raw)
		}
		if err != nil || len(key) != ed25519.PrivateKeySize {
			return nil, nil, fmt.Errorf("PUBLIC_EXPORT_SIGNING_PRIVATE_KEY_BASE64 doit être une clé Ed25519 de 64 octets encodée en base64")
		}
		privateKey := ed25519.PrivateKey(key)
		return privateKey, privateKey.Public().(ed25519.PublicKey), nil
	}
	if raw := strings.TrimSpace(os.Getenv("PUBLIC_EXPORT_SIGNING_SEED_BASE64")); raw != "" {
		seed, err := base64.RawStdEncoding.DecodeString(raw)
		if err != nil {
			seed, err = base64.StdEncoding.DecodeString(raw)
		}
		if err != nil || len(seed) != ed25519.SeedSize {
			return nil, nil, fmt.Errorf("PUBLIC_EXPORT_SIGNING_SEED_BASE64 doit être une seed Ed25519 de 32 octets encodée en base64")
		}
		privateKey := ed25519.NewKeyFromSeed(seed)
		return privateKey, privateKey.Public().(ed25519.PublicKey), nil
	}
	if os.Getenv("APP_ENV") == "production" {
		return nil, nil, fmt.Errorf("clé de signature export public non configurée")
	}
	seed := sha256.Sum256([]byte("openvote-dev-public-pv-export-signing-key"))
	privateKey := ed25519.NewKeyFromSeed(seed[:])
	return privateKey, privateKey.Public().(ed25519.PublicKey), nil
}

func csvString(row []string, index int) string {
	if index >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[index])
}

func appendCSVImportError(errors []csvImportError, line int, reason string) []csvImportError {
	if len(errors) >= maxCSVImportErrors {
		return errors
	}
	return append(errors, csvImportError{Line: line, Reason: reason})
}

func isKnownPVStatus(status entity.PVStatus) bool {
	switch status {
	case entity.PVStatusDraft, entity.PVStatusSubmitted, entity.PVStatusVerified,
		entity.PVStatusDisputed, entity.PVStatusRejected, entity.PVStatusNeedsClarification:
		return true
	default:
		return false
	}
}

func isPVVerificationStatus(status entity.PVStatus) bool {
	switch status {
	case entity.PVStatusVerified, entity.PVStatusRejected, entity.PVStatusNeedsClarification:
		return true
	default:
		return false
	}
}

func parseCSVInt(row []string, index int) int {
	value, _ := strconv.Atoi(csvString(row, index))
	return value
}

func parseOptionalCSVInt(row []string, index int) *int {
	value := csvString(row, index)
	if value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseCSVFloat(row []string, index int) float64 {
	value, _ := strconv.ParseFloat(csvString(row, index), 64)
	return value
}
