package handler

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

const (
	testElectionID = "78c278a1-8ca1-4a37-bed4-62300d7145ba"
	testStationID  = "78c278a1-8ca1-4a37-bed4-62300d7145bb"
	testObserverID = "78c278a1-8ca1-4a37-bed4-62300d7145bc"
	testAdminID    = "78c278a1-8ca1-4a37-bed4-62300d7145bd"
)

type mockPVRepo struct {
	repository.PVRepository
	createCalls      int
	reviewElectionID string
	reviewStatus     string
	reviewPVs        []entity.PVSubmission
	publicElectionID string
	publicProofs     []entity.PublicPVProof
	updatedPV        *entity.PVSubmission
	updateCalls      int
	updateStatus     entity.PVStatus
	updateComment    string
	updateAdminID    string
	createdPV        *entity.PVSubmission
	existingPV       *entity.PVSubmission
}

func (m *mockPVRepo) Create(ctx context.Context, pv *entity.PVSubmission) error {
	m.createCalls++
	if pv.ID == "" {
		pv.ID = "78c278a1-8ca1-4a37-bed4-62300d7145be"
	}
	m.createdPV = pv
	return nil
}

func (m *mockPVRepo) GetByID(ctx context.Context, id string) (*entity.PVSubmission, error) {
	return m.existingPV, nil
}

func (m *mockPVRepo) GetForReview(ctx context.Context, electionID, status string) ([]entity.PVSubmission, error) {
	m.reviewElectionID = electionID
	m.reviewStatus = status
	return m.reviewPVs, nil
}

func (m *mockPVRepo) GetPublicProofs(ctx context.Context, electionID string) ([]entity.PublicPVProof, error) {
	m.publicElectionID = electionID
	return m.publicProofs, nil
}

func (m *mockPVRepo) UpdateVerificationStatus(ctx context.Context, id string, status entity.PVStatus, comment, adminID string) (*entity.PVSubmission, error) {
	m.updateCalls++
	m.updateStatus = status
	m.updateComment = comment
	m.updateAdminID = adminID
	return m.updatedPV, nil
}

type mockPVAuditRepo struct {
	repository.PVAuditRepository
	createdEvents []entity.PVAuditEvent
	eventsByPV    []entity.PVAuditEvent
	requestedPVID string
}

func (m *mockPVAuditRepo) Create(ctx context.Context, event *entity.PVAuditEvent) error {
	if event.ID == "" {
		event.ID = "78c278a1-8ca1-4a37-bed4-62300d7145bf"
	}
	m.createdEvents = append(m.createdEvents, *event)
	return nil
}

func (m *mockPVAuditRepo) GetByPV(ctx context.Context, pvID string) ([]entity.PVAuditEvent, error) {
	m.requestedPVID = pvID
	return m.eventsByPV, nil
}

type mockStationRepo struct {
	repository.PollingStationRepository
	createCalls int
	failCodes   map[string]error
}

func (m *mockStationRepo) Create(ctx context.Context, station *entity.PollingStation) error {
	m.createCalls++
	if err := m.failCodes[station.Code]; err != nil {
		return err
	}
	station.ID = testStationID
	return nil
}

type mockCandidateRepo struct {
	repository.CandidateRepository
	createCalls int
	failNames   map[string]error
}

func (m *mockCandidateRepo) Create(ctx context.Context, candidate *entity.Candidate) error {
	m.createCalls++
	if err := m.failNames[candidate.Name]; err != nil {
		return err
	}
	candidate.ID = testStationID
	return nil
}

type mockAssignmentRepo struct {
	repository.PollingStationAssignmentRepository
	createCalls int
	failIDs     map[string]error
}

func (m *mockAssignmentRepo) Create(ctx context.Context, assignment *entity.PollingStationAssignment) error {
	m.createCalls++
	if err := m.failIDs[assignment.PollingStationID]; err != nil {
		return err
	}
	assignment.ID = assignment.PollingStationID + "-assignment"
	return nil
}

func setupPVRouter(h *PVHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/pv", func(c *gin.Context) {
		c.Set("userID", testObserverID)
		c.Set("role", string(entity.RoleObserver))
		h.SubmitPV(c)
	})
	r.GET("/public/pv-proofs", func(c *gin.Context) {
		h.ListPublicPVProofs(c)
	})
	return r
}

func setupAdminPVRouter(h *PVHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/admin/polling-stations/import-csv", func(c *gin.Context) {
		c.Set("userID", testAdminID)
		h.ImportPollingStationsCSV(c)
	})
	r.POST("/admin/candidates/import-csv", func(c *gin.Context) {
		c.Set("userID", testAdminID)
		h.ImportCandidatesCSV(c)
	})
	r.POST("/admin/polling-station-assignments/bulk", func(c *gin.Context) {
		c.Set("userID", testAdminID)
		h.CreateAssignmentsBulk(c)
	})
	r.GET("/admin/pv-review", func(c *gin.Context) {
		c.Set("userID", testAdminID)
		h.ListPVsForReview(c)
	})
	r.PATCH("/admin/pv-review/:id/status", func(c *gin.Context) {
		c.Set("userID", testAdminID)
		c.Set("role", string(entity.RoleRegionAdmin))
		h.UpdatePVVerification(c)
	})
	r.GET("/admin/pv-review/:id/audit", func(c *gin.Context) {
		c.Set("userID", testAdminID)
		c.Set("role", string(entity.RoleRegionAdmin))
		h.ListPVAuditEvents(c)
	})
	return r
}

func csvUploadRequest(t *testing.T, path string, electionID string, csvContent string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("election_id", electionID); err != nil {
		t.Fatalf("écriture election_id: %v", err)
	}
	part, err := writer.CreateFormFile("file", "elecam.csv")
	if err != nil {
		t.Fatalf("création fichier multipart: %v", err)
	}
	if _, err := part.Write([]byte(csvContent)); err != nil {
		t.Fatalf("écriture CSV multipart: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("fermeture multipart: %v", err)
	}
	req := httptest.NewRequest("POST", path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestSubmitPVRejectsDuplicatedCandidate(t *testing.T) {
	pvRepo := &mockPVRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupPVRouter(h)

	body := `{
		"election_id":"78c278a1-8ca1-4a37-bed4-62300d7145ba",
		"polling_station_id":"78c278a1-8ca1-4a37-bed4-62300d7145bb",
		"voters_count":10,
		"results":[
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bc","votes":4},
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bc","votes":3}
		]
	}`
	req := httptest.NewRequest("POST", "/pv", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.createCalls != 0 {
		t.Fatalf("le repo ne doit pas être appelé pour un PV invalide")
	}
}

func TestSubmitPVComputesCanonicalIntegrityHash(t *testing.T) {
	body := `{
		"election_id":"78c278a1-8ca1-4a37-bed4-62300d7145ba",
		"polling_station_id":"78c278a1-8ca1-4a37-bed4-62300d7145bb",
		"registered_voters":100,
		"voters_count":90,
		"null_votes":1,
		"blank_votes":2,
		"disputed_votes":3,
		"pv_hash":"photo-hash",
		"client_recorded_at":"2026-09-09T18:30:00Z",
		"device_latitude":3.8667,
		"device_longitude":11.5167,
		"signed_payload_hash":"WRONG",
		"results":[
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bd","votes":40},
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bc","votes":44}
		]
	}`
	var parsed createPVRequest
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		t.Fatalf("requête invalide: %v", err)
	}
	_, expectedHash, err := buildCanonicalPVProof(parsed)
	if err != nil {
		t.Fatalf("hash canonique impossible: %v", err)
	}

	pvRepo := &mockPVRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupPVRouter(h)
	req := httptest.NewRequest("POST", "/pv", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("attendu 201, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.createdPV == nil {
		t.Fatalf("PV créé attendu")
	}
	if pvRepo.createdPV.ServerPayloadHash != expectedHash {
		t.Fatalf("hash serveur inattendu: %s", pvRepo.createdPV.ServerPayloadHash)
	}
	if pvRepo.createdPV.IntegrityStatus != "hash_mismatch" {
		t.Fatalf("statut intégrité inattendu: %s", pvRepo.createdPV.IntegrityStatus)
	}
	if len(pvRepo.createdPV.IntegrityErrors) != 3 {
		t.Fatalf("erreurs intégrité inattendues: %+v", pvRepo.createdPV.IntegrityErrors)
	}
}

func TestSubmitPVRecordsAuditEvent(t *testing.T) {
	pvRepo := &mockPVRepo{}
	auditRepo := &mockPVAuditRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, auditRepo, nil)
	r := setupPVRouter(h)

	body := `{
		"election_id":"` + testElectionID + `",
		"polling_station_id":"` + testStationID + `",
		"registered_voters":100,
		"voters_count":10,
		"results":[
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bc","votes":10}
		]
	}`
	req := httptest.NewRequest("POST", "/pv", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("attendu 201, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if len(auditRepo.createdEvents) != 1 {
		t.Fatalf("attendu 1 événement audit, obtenu %d", len(auditRepo.createdEvents))
	}
	event := auditRepo.createdEvents[0]
	if event.EventType != "submitted" || event.ToStatus != entity.PVStatusSubmitted {
		t.Fatalf("événement audit inattendu: %+v", event)
	}
	if event.ActorID != testObserverID || event.ActorRole != entity.RoleObserver {
		t.Fatalf("acteur audit inattendu: %+v", event)
	}
}

func TestVerifyECDSAP256SignatureAcceptsWebCryptoRawSignature(t *testing.T) {
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("génération clé: %v", err)
	}
	jwk := map[string]string{
		"kty": "EC",
		"crv": "P-256",
		"x":   base64.RawURLEncoding.EncodeToString(privateKey.X.Bytes()),
		"y":   base64.RawURLEncoding.EncodeToString(privateKey.Y.Bytes()),
	}
	rawJWK, err := json.Marshal(jwk)
	if err != nil {
		t.Fatalf("jwk: %v", err)
	}
	publicKey, err := parseECDSAP256JWK(rawJWK)
	if err != nil {
		t.Fatalf("clé publique refusée: %v", err)
	}

	canonicalPayload := `{"proof_manifest_version":1,"election_id":"election-001"}`
	digest := sha256.Sum256([]byte(canonicalPayload))
	r, s, err := ecdsa.Sign(rand.Reader, privateKey, digest[:])
	if err != nil {
		t.Fatalf("signature: %v", err)
	}
	signature := append(leftPad32(r), leftPad32(s)...)
	encodedSignature := base64.RawURLEncoding.EncodeToString(signature)

	if !verifyECDSAP256Signature(publicKey, canonicalPayload, encodedSignature) {
		t.Fatalf("signature WebCrypto raw attendue valide")
	}
}

func leftPad32(n *big.Int) []byte {
	raw := n.Bytes()
	out := make([]byte, 32)
	copy(out[32-len(raw):], raw)
	return out
}

func TestImportPollingStationsCSVReturnsLineErrors(t *testing.T) {
	stationRepo := &mockStationRepo{failCodes: map[string]error{"BV002": errors.New("bureau déjà importé")}}
	h := NewPVHandler(stationRepo, nil, nil, nil, nil, nil, nil)
	r := setupAdminPVRouter(h)

	csvContent := strings.Join([]string{
		"code,name,region_id,department_id,arrondissement_id,registered_voters,location_name,latitude,longitude",
		"BV001,Ecole Publique,,,,320,Yaounde,,",
		",Nom manquant,,,,120,,,",
		"BV002,Lycee,,,,450,,,",
	}, "\n")
	req := csvUploadRequest(t, "/admin/polling-stations/import-csv", testElectionID, csvContent)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	var payload struct {
		Imported int              `json:"imported"`
		Failed   int              `json:"failed"`
		Errors   []csvImportError `json:"errors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	if payload.Imported != 1 || payload.Failed != 2 {
		t.Fatalf("résultat import inattendu: %+v", payload)
	}
	if len(payload.Errors) != 2 {
		t.Fatalf("attendu 2 erreurs de ligne, obtenu %d", len(payload.Errors))
	}
	if payload.Errors[0].Line != 3 || !strings.Contains(payload.Errors[0].Reason, "code") {
		t.Fatalf("première erreur inattendue: %+v", payload.Errors[0])
	}
	if payload.Errors[1].Line != 4 || !strings.Contains(payload.Errors[1].Reason, "déjà importé") {
		t.Fatalf("seconde erreur inattendue: %+v", payload.Errors[1])
	}
}

func TestImportCandidatesCSVKeepsImportedFailedContract(t *testing.T) {
	candidateRepo := &mockCandidateRepo{failNames: map[string]error{"Candidat B": errors.New("numéro déjà utilisé")}}
	h := NewPVHandler(nil, candidateRepo, nil, nil, nil, nil, nil)
	r := setupAdminPVRouter(h)

	csvContent := strings.Join([]string{
		"name,party,ballot_number",
		"Candidat A,Parti A,1",
		",Parti vide,2",
		"Candidat B,Parti B,2",
	}, "\n")
	req := csvUploadRequest(t, "/admin/candidates/import-csv", testElectionID, csvContent)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	var payload struct {
		Imported int              `json:"imported"`
		Failed   int              `json:"failed"`
		Errors   []csvImportError `json:"errors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	if payload.Imported != 1 || payload.Failed != 2 || len(payload.Errors) != 2 {
		t.Fatalf("résultat import inattendu: %+v", payload)
	}
}

func TestCreateAssignmentsBulkReturnsPartialResult(t *testing.T) {
	assignmentRepo := &mockAssignmentRepo{failIDs: map[string]error{
		"78c278a1-8ca1-4a37-bed4-62300d7145be": errors.New("bureau inexistant"),
	}}
	h := NewPVHandler(nil, nil, nil, assignmentRepo, nil, nil, nil)
	r := setupAdminPVRouter(h)

	body := `{
		"election_id":"` + testElectionID + `",
		"observer_id":"` + testObserverID + `",
		"polling_station_ids":[
			"` + testStationID + `",
			"78c278a1-8ca1-4a37-bed4-62300d7145be",
			"` + testStationID + `"
		],
		"notes":"zone nord"
	}`
	req := httptest.NewRequest("POST", "/admin/polling-station-assignments/bulk", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("attendu 201, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	var payload struct {
		Created     int                               `json:"created"`
		Failed      int                               `json:"failed"`
		Assignments []entity.PollingStationAssignment `json:"assignments"`
		Errors      []bulkAssignmentFailure           `json:"errors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	if payload.Created != 1 || payload.Failed != 2 {
		t.Fatalf("résultat bulk inattendu: %+v", payload)
	}
	if len(payload.Assignments) != 1 || payload.Assignments[0].AssignedBy != testAdminID {
		t.Fatalf("affectation créée inattendue: %+v", payload.Assignments)
	}
	if len(payload.Errors) != 2 {
		t.Fatalf("attendu 2 erreurs bulk, obtenu %d", len(payload.Errors))
	}
}

func TestCreateAssignmentsBulkRejectsEmptyList(t *testing.T) {
	assignmentRepo := &mockAssignmentRepo{}
	h := NewPVHandler(nil, nil, nil, assignmentRepo, nil, nil, nil)
	r := setupAdminPVRouter(h)

	body := `{"election_id":"` + testElectionID + `","observer_id":"` + testObserverID + `","polling_station_ids":[]}`
	req := httptest.NewRequest("POST", "/admin/polling-station-assignments/bulk", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if assignmentRepo.createCalls != 0 {
		t.Fatalf("le repo ne doit pas être appelé pour une liste vide")
	}
}

func TestListPVsForReviewFiltersByElectionAndStatus(t *testing.T) {
	pvRepo := &mockPVRepo{reviewPVs: []entity.PVSubmission{
		{
			ID:               "78c278a1-8ca1-4a37-bed4-62300d7145be",
			ElectionID:       testElectionID,
			PollingStationID: testStationID,
			Status:           entity.PVStatusSubmitted,
			Anomalies: []entity.PVAnomaly{
				{Code: "high_turnout", Severity: "medium", Message: "Le taux de participation dépasse 95%."},
			},
		},
	}}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupAdminPVRouter(h)

	req := httptest.NewRequest("GET", "/admin/pv-review?election_id="+testElectionID+"&status=submitted", nil)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.reviewElectionID != testElectionID || pvRepo.reviewStatus != "submitted" {
		t.Fatalf("filtres transmis inattendus: election=%q status=%q", pvRepo.reviewElectionID, pvRepo.reviewStatus)
	}
	var payload struct {
		PVs   []entity.PVSubmission `json:"pv_submissions"`
		Total int                   `json:"total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	if payload.Total != 1 || len(payload.PVs) != 1 || len(payload.PVs[0].Anomalies) != 1 {
		t.Fatalf("liste review inattendue: %+v", payload)
	}
}

func TestListPVsForReviewRejectsInvalidStatus(t *testing.T) {
	pvRepo := &mockPVRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupAdminPVRouter(h)

	req := httptest.NewRequest("GET", "/admin/pv-review?election_id="+testElectionID+"&status=closed", nil)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.reviewElectionID != "" {
		t.Fatalf("le repo ne doit pas être appelé pour un statut invalide")
	}
}

func TestListPublicPVProofsReturnsAnonymizedProofs(t *testing.T) {
	pvRepo := &mockPVRepo{publicProofs: []entity.PublicPVProof{
		{
			ID:                 "78c278a1-8ca1-4a37-bed4-62300d7145be",
			ElectionID:         testElectionID,
			PollingStationID:   testStationID,
			PollingStationCode: "BV001",
			Status:             entity.PVStatusVerified,
			PVHash:             "photo-hash",
			ServerPayloadHash:  "server-hash",
			IntegrityStatus:    "trusted",
			Anomalies:          []entity.PVAnomaly{},
		},
	}}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupPVRouter(h)

	req := httptest.NewRequest("GET", "/public/pv-proofs?election_id="+testElectionID, nil)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.publicElectionID != testElectionID {
		t.Fatalf("election_id public inattendu: %q", pvRepo.publicElectionID)
	}
	var payload struct {
		Export      entity.PublicPVProofExport `json:"export"`
		ExportProof entity.PublicPVExportProof `json:"export_proof"`
		Proofs      []entity.PublicPVProof     `json:"pv_proofs"`
		Total       int                        `json:"total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	if payload.Total != 1 || payload.Proofs[0].PVHash != "photo-hash" {
		t.Fatalf("preuves publiques inattendues: %+v", payload)
	}
	if payload.ExportProof.Algorithm != "ED25519_SHA256_EXPORT_V1" || payload.ExportProof.Signature == "" {
		t.Fatalf("signature export absente: %+v", payload.ExportProof)
	}
	canonical := []byte(payload.ExportProof.CanonicalExport)
	digest := sha256.Sum256(canonical)
	if payload.ExportProof.ExportHash != hex.EncodeToString(digest[:]) {
		t.Fatalf("hash export invalide: %s", payload.ExportProof.ExportHash)
	}
	publicKey, err := base64.RawURLEncoding.DecodeString(payload.ExportProof.PublicKey)
	if err != nil {
		t.Fatalf("clé publique invalide: %v", err)
	}
	signature, err := base64.RawURLEncoding.DecodeString(payload.ExportProof.Signature)
	if err != nil {
		t.Fatalf("signature invalide: %v", err)
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), digest[:], signature) {
		t.Fatalf("signature export non vérifiable")
	}
}

func TestUpdatePVVerificationAcceptsNeedsClarification(t *testing.T) {
	pvRepo := &mockPVRepo{
		existingPV: &entity.PVSubmission{
			ID:               "78c278a1-8ca1-4a37-bed4-62300d7145be",
			ElectionID:       testElectionID,
			PollingStationID: testStationID,
			Status:           entity.PVStatusSubmitted,
		},
		updatedPV: &entity.PVSubmission{
			ID:                  "78c278a1-8ca1-4a37-bed4-62300d7145be",
			ElectionID:          testElectionID,
			PollingStationID:    testStationID,
			Status:              entity.PVStatusNeedsClarification,
			VerificationComment: "Photo illisible",
		}}
	auditRepo := &mockPVAuditRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, auditRepo, nil)
	r := setupAdminPVRouter(h)

	body := `{"status":"needs_clarification","comment":" Photo illisible "}`
	req := httptest.NewRequest("PATCH", "/admin/pv-review/78c278a1-8ca1-4a37-bed4-62300d7145be/status", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.updateCalls != 1 || pvRepo.updateStatus != entity.PVStatusNeedsClarification {
		t.Fatalf("mise à jour statut inattendue: calls=%d status=%s", pvRepo.updateCalls, pvRepo.updateStatus)
	}
	if pvRepo.updateComment != "Photo illisible" || pvRepo.updateAdminID != testAdminID {
		t.Fatalf("commentaire/admin inattendus: %q / %q", pvRepo.updateComment, pvRepo.updateAdminID)
	}
	if len(auditRepo.createdEvents) != 1 {
		t.Fatalf("attendu 1 événement audit, obtenu %d", len(auditRepo.createdEvents))
	}
	event := auditRepo.createdEvents[0]
	if event.FromStatus != entity.PVStatusSubmitted || event.ToStatus != entity.PVStatusNeedsClarification {
		t.Fatalf("transition audit inattendue: %+v", event)
	}
}

func TestListPVAuditEventsReturnsEvents(t *testing.T) {
	pvID := "78c278a1-8ca1-4a37-bed4-62300d7145be"
	auditRepo := &mockPVAuditRepo{eventsByPV: []entity.PVAuditEvent{
		{
			ID:                "78c278a1-8ca1-4a37-bed4-62300d7145bf",
			PVSubmissionID:    pvID,
			ElectionID:        testElectionID,
			PollingStationID:  testStationID,
			EventType:         "submitted",
			ToStatus:          entity.PVStatusSubmitted,
			ServerPayloadHash: "abc123",
		},
	}}
	h := NewPVHandler(nil, nil, nil, nil, nil, auditRepo, nil)
	r := setupAdminPVRouter(h)

	req := httptest.NewRequest("GET", "/admin/pv-review/"+pvID+"/audit", nil)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if auditRepo.requestedPVID != pvID {
		t.Fatalf("pv id demandé inattendu: %q", auditRepo.requestedPVID)
	}
	var payload struct {
		Events []entity.PVAuditEvent `json:"audit_events"`
		Total  int                   `json:"total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("JSON invalide: %v", err)
	}
	if payload.Total != 1 || len(payload.Events) != 1 || payload.Events[0].EventType != "submitted" {
		t.Fatalf("historique audit inattendu: %+v", payload)
	}
}

func TestUpdatePVVerificationRejectsSubmittedStatus(t *testing.T) {
	pvRepo := &mockPVRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupAdminPVRouter(h)

	body := `{"status":"submitted","comment":"retour arrière"}`
	req := httptest.NewRequest("PATCH", "/admin/pv-review/78c278a1-8ca1-4a37-bed4-62300d7145be/status", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.updateCalls != 0 {
		t.Fatalf("le repo ne doit pas être appelé pour un statut non-admin")
	}
}

func TestSubmitPVRejectsVoteTotalAboveVoters(t *testing.T) {
	pvRepo := &mockPVRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupPVRouter(h)

	body := `{
		"election_id":"78c278a1-8ca1-4a37-bed4-62300d7145ba",
		"polling_station_id":"78c278a1-8ca1-4a37-bed4-62300d7145bb",
		"voters_count":10,
		"null_votes":2,
		"results":[
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bc","votes":9}
		]
	}`
	req := httptest.NewRequest("POST", "/pv", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.createCalls != 0 {
		t.Fatalf("le repo ne doit pas être appelé pour un total incohérent")
	}
}

func TestSubmitPVAcceptsZeroVoteCandidate(t *testing.T) {
	pvRepo := &mockPVRepo{}
	h := NewPVHandler(nil, nil, pvRepo, nil, nil, nil, nil)
	r := setupPVRouter(h)

	body := `{
		"election_id":"78c278a1-8ca1-4a37-bed4-62300d7145ba",
		"polling_station_id":"78c278a1-8ca1-4a37-bed4-62300d7145bb",
		"voters_count":10,
		"results":[
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bc","votes":0},
			{"candidate_id":"78c278a1-8ca1-4a37-bed4-62300d7145bd","votes":10}
		]
	}`
	req := httptest.NewRequest("POST", "/pv", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("attendu 201, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if pvRepo.createCalls != 1 {
		t.Fatalf("attendu 1 appel repo, obtenu %d", pvRepo.createCalls)
	}
}
