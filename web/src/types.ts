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

export interface IncidentTypeData {
    id: string;
    name: string;
    code: string;
    description: string;
    severity: number;
    color: string;
}

// ============================================================
// KPIs dashboard
// ============================================================

export interface KPIData {
    users: { total: number; by_role: Record<string, number> };
    reports: { total: number; verified: number; pending: number; rejected: number };
    elections: { total: number; active: number };
}