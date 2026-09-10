/**
 * Openvote — types partagés (auth, données API, modèles UI).
 *
 * Extrait de l'ancien god-component App.tsx (cf. M2 audit).
 * Centraliser ici évite les duplications et les divergences silencieuses
 * entre les écrans.
 */

// ============================================================
// Auth
// ============================================================

/**
 * État d'authentification passé entre LoginScreen → Dashboard / AdminPanel.
 * Stocké en RAM uniquement (cf. H4 audit) — JAMAIS dans sessionStorage / localStorage.
 */
export interface AuthState {
    token: string;
    role: string;
    username: string;
}

// ============================================================
// Signalements (rapports terrain)
// ============================================================

export interface Report {
    id: string;
    incident_type: string;
    description: string;
    gps_location: string; // "POINT(lon lat)"
    status: string;
    created_at: string;
    h3_index: string;
    observer_id: string;
}

/**
 * Croisement entre un rapport terrain et un article de loi (RAG).
 * Alimenté par les routes /admin/reports/:id/legal-matches et /analysis.
 */
export interface ReportLegalMatch {
    id: string;
    report_id: string;
    article_id: string;
    similarity_score: number;
    match_type: string;
    notes: string;
    article_number?: string;
    article_title?: string;
    article_content?: string;
    created_at: string;
}

// ============================================================
// Admin — Utilisateurs et audit
// ============================================================

export interface AdminUser {
    id: string;
    username: string;
    role: string;
    region_id: string;
    created_at: string;
    updated_at: string;
    last_login_at?: string;
}

export interface AuditLog {
    id: string;
    admin_id: string;
    admin_name: string;
    action: string;
    target_id: string;
    details: string;
    created_at: string;
}

// ============================================================
// Géographie administrative
// ============================================================

export interface DepartmentData {
    id: string;
    name: string;
    code: string;
    region_id: string;
    population: number;
    registered_voters: number;
    created_at: string;
}

export interface RegionWithDepts {
    id: string;
    name: string;
    code: string;
    created_at: string;
    departments: DepartmentData[];
    dept_count: number;
}

// ============================================================
// Cadre légal (CMS + RAG)
// ============================================================

export interface LegalDocument {
    id: string;
    title: string;
    description: string;
    doc_type: string;
    version: string;
    full_text?: string;
    file_path?: string;
    created_at: string;
}

export interface SourceDocument {
    id: string;
    slug: string;
    title: string;
    publisher: string;
    source_url: string;
    document_type: string;
    language: string;
    published_date?: string;
    retrieved_at?: string;
    local_path: string;
    extracted_text_path: string;
    sha256_checksum: string;
    mime_type: string;
    file_size_bytes: number;
    granularity: string;
    reference_year?: number;
    confidence: string;
    status: string;
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface LegalArticle {
    id: string;
    document_id: string;
    article_number: string;
    title: string;
    content: string;
    category: string;
    created_at: string;
}

export interface SemanticSearchResult {
    article: LegalArticle;
    similarity: number;
}

// ============================================================
// Élections et types d'incidents
// ============================================================

export interface ElectionData {
    id: string;
    name: string;
    type: string;
    status: string;
    date: string;
    description: string;
    region_ids: string;
    created_at: string;
}

export interface HistoricalElectionResult {
    id: string;
    election_id: string;
    election_name: string;
    election_type: string;
    election_date: string;
    source_document_slug: string;
    election_year: number;
    contest_type: string;
    result_level: string;
    region_name: string;
    department_name: string;
    commune_name: string;
    actor_type: string;
    actor_name: string;
    party: string;
    metric_type: string;
    registered_voters?: number;
    actual_voters?: number;
    valid_votes?: number;
    blank_or_invalid_votes?: number;
    abstentions?: number;
    polling_stations?: number;
    councils?: number;
    lists_presented?: number;
    votes?: number;
    percentage?: number;
    seats?: number;
    women_seats?: number;
    councils_controlled?: number;
    source_line_start?: number;
    source_line_end?: number;
    confidence: string;
    status: string;
    notes: string;
}

export interface IncidentTypeData {
    id: string;
    name: string;
    code: string;
    description: string;
    severity: number;
    color: string;
}

// ============================================================
// Comptage parallèle — bureaux de vote, candidats et PV
// ============================================================

export interface PollingStation {
    id: string;
    election_id: string;
    code: string;
    name: string;
    region_id: string;
    department_id: string;
    arrondissement_id: string;
    registered_voters: number;
    location_name: string;
    gps_location: string;
    h3_index: string;
    source_name: string;
    source_document_id: string;
    source_document_slug: string;
    source_sha256: string;
    source_position?: number;
    source_confidence: string;
    created_at: string;
    updated_at: string;
}

export interface Candidate {
    id: string;
    election_id: string;
    name: string;
    party: string;
    ballot_number?: number;
    created_at: string;
}

export interface PVResultInput {
    candidate_id: string;
    votes: number;
}

export interface PVSubmission {
    id: string;
    election_id: string;
    polling_station_id: string;
    observer_id: string;
    status: string;
    registered_voters: number;
    voters_count: number;
    null_votes: number;
    blank_votes: number;
    disputed_votes: number;
    pv_photo_url: string;
    pv_hash: string;
    signed_payload_hash: string;
    signature: string;
    proof_manifest_version?: number;
    client_recorded_at?: string;
    device_latitude?: number;
    device_longitude?: number;
    device_id?: string;
    server_payload_hash?: string;
    integrity_status?: string;
    integrity_errors?: string[];
    canonical_payload?: string;
    notes: string;
    submitted_at: string;
    results?: PVResult[];
}

export interface PVAuditEvent {
    id: string;
    pv_submission_id: string;
    election_id: string;
    polling_station_id: string;
    actor_id?: string;
    actor_role?: string;
    event_type: string;
    from_status?: string;
    to_status?: string;
    integrity_status?: string;
    server_payload_hash?: string;
    comment: string;
    metadata?: string;
    created_at: string;
}

export interface PVResult {
    id: string;
    pv_submission_id: string;
    candidate_id: string;
    votes: number;
    candidate_name?: string;
    party?: string;
    created_at: string;
}

export interface CandidateResultSummary {
    candidate_id: string;
    candidate_name: string;
    party: string;
    total_votes: number;
    pv_count: number;
}

export interface ElectionResultSummary {
    election_id: string;
    total_stations: number;
    submitted_pv: number;
    coverage_rate: number;
    total_voters: number;
    total_candidate_votes: number;
    results: CandidateResultSummary[];
}

export interface RegionPVSummary {
    election_id: string;
    region_id: string;
    region_name: string;
    total_stations: number;
    submitted_pv: number;
    coverage_rate: number;
    registered_voters: number;
    reported_voters: number;
    blank_or_invalid_votes: number;
    total_candidate_votes: number;
    leader_candidate_id: string;
    leader_name: string;
    leader_party: string;
    leader_votes: number;
}

export interface RegionalRiskRule {
    code: string;
    label: string;
    severity: string;
    weight: number;
    value?: number;
}

export interface RegionalRiskSnapshot {
    id: string;
    election_id: string;
    region_id: string;
    region_name: string;
    normalized_region_name: string;
    reference_election_id: string;
    reference_election_year?: number;
    reference_contest_type: string;
    reference_source_document_slug: string;
    total_stations: number;
    submitted_pv: number;
    coverage_rate: number;
    registered_voters: number;
    reported_voters: number;
    blank_or_invalid_votes: number;
    turnout_rate?: number;
    reference_turnout_rate?: number;
    turnout_gap_points?: number;
    invalid_rate?: number;
    reference_invalid_rate?: number;
    invalid_gap_points?: number;
    leader_candidate_id: string;
    leader_name: string;
    leader_party: string;
    leader_votes: number;
    risk_score: number;
    risk_status: string;
    rules: RegionalRiskRule[];
    evidence: string[];
    snapshot_hash: string;
    created_at: string;
}

export interface FieldCoverageRegion {
    region_id: string;
    region_name: string;
    total_stations: number;
    assigned_stations: number;
    submitted_pv: number;
    observer_count: number;
    coverage_rate: number;
}

export interface FieldCoverageObserver {
    observer_id: string;
    observer_name: string;
    region_id: string;
    assigned_stations: number;
    submitted_pv: number;
    completion_rate: number;
}

export interface FieldCoverageZone {
    zone_type: string;
    region_id: string;
    region_name: string;
    department_id: string;
    department_name: string;
    arrondissement_id: string;
    arrondissement_name: string;
    total_stations: number;
    assigned_stations: number;
    submitted_pv: number;
    observer_count: number;
    coverage_rate: number;
    priority_score: number;
    priority_label: string;
}

export interface FieldCoverageSummary {
    election_id: string;
    total_stations: number;
    assigned_stations: number;
    unassigned_stations: number;
    submitted_pv: number;
    observer_count: number;
    coverage_rate: number;
    regions: FieldCoverageRegion[];
    observers: FieldCoverageObserver[];
    silent_zones?: FieldCoverageZone[];
}

export type PVVerificationStatus = 'submitted' | 'pending' | 'verified' | 'rejected' | 'needs_clarification' | string;

export interface PVAnomaly {
    code: string;
    severity: 'low' | 'medium' | 'high' | 'critical' | string;
    message: string;
    field?: string;
    expected?: number | string;
    actual?: number | string;
}

export interface PVVerificationItem extends PVSubmission {
    polling_station_code?: string;
    polling_station_name?: string;
    polling_station_region?: string;
    observer_name?: string;
    observer_username?: string;
    anomalies?: PVAnomaly[];
    anomaly_count?: number;
    total_candidate_votes?: number;
    verification_comment?: string;
    verified_at?: string;
}

export interface PublicPVProof {
    id: string;
    election_id: string;
    polling_station_id: string;
    polling_station_code: string;
    polling_station_name: string;
    polling_station_region?: string;
    status: string;
    pv_hash: string;
    server_payload_hash: string;
    integrity_status: string;
    anomalies: PVAnomaly[];
    submitted_at: string;
    updated_at: string;
}

export interface PublicRegionalRiskProof {
    region_id: string;
    region_name: string;
    normalized_region_name: string;
    risk_score: number;
    risk_status: string;
    rules: RegionalRiskRule[];
    coverage_rate: number;
    submitted_pv: number;
    total_stations: number;
    turnout_gap_points?: number;
    invalid_gap_points?: number;
    reference_election_year?: number;
    reference_contest_type?: string;
    reference_source_document_slug?: string;
    evidence: string[];
    snapshot_hash: string;
    created_at: string;
}

export interface PublicPVProofExport {
    proof_manifest_version: number;
    election_id: string;
    generated_at: string;
    total: number;
    pv_proofs: PublicPVProof[];
    regional_risks?: PublicRegionalRiskProof[];
}

export interface PublicPVExportProof {
    algorithm: string;
    export_hash: string;
    signature: string;
    public_key: string;
    canonical_export?: string;
}

// ============================================================
// KPIs dashboard
// ============================================================

export interface KPIData {
    users: { total: number; by_role: Record<string, number> };
    reports: { total: number; verified: number; pending: number; rejected: number };
    elections: { total: number; active: number };
}
