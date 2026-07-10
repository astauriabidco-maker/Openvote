/**
 * Constantes UI du backoffice admin.
 *
 * Centralise les listes enum (rôles, types d'élection), les libellés,
 * et la matrice RBAC pour éviter les duplications entre les 12 onglets
 * et le hook useAdminPanelState.
 */

export const ROLES = [
    'super_admin',
    'region_admin',
    'local_coord',
    'observer',
    'verified_citizen',
    'citizen',
] as const;

export const ROLE_LABELS: Record<string, string> = {
    super_admin: '🛡️ Super Admin',
    region_admin: '🏛️ Admin Régional',
    local_coord: '📋 Coord. Local',
    observer: '👁️ Observateur',
    verified_citizen: '✅ Citoyen Vérifié',
    citizen: '🏠 Citoyen',
};

export const ELECTION_TYPES = [
    'présidentielle',
    'législative',
    'municipale',
    'référendum',
    'générale',
] as const;

export const STATUS_LABELS: Record<string, string> = {
    planned: '📌 Planifié',
    active: '🟢 Actif',
    closed: '🛑 Clôturé',
    archived: '📦 Archivé',
};

export const STATUS_COLORS: Record<string, string> = {
    planned: '#d29922',
    active: '#3fb950',
    closed: '#f85149',
    archived: '#8b949e',
};

/**
 * Matrice RBAC affichée dans l'onglet RBAC.
 * Source de vérité pour les permissions de chaque rôle.
 * TODO : à terme, l'API doit exposer cette matrice (handler backend à créer).
 */
export const RBAC_MATRIX = [
    { action: 'Voir la carte', super_admin: true, region_admin: true, local_coord: true, observer: true, verified_citizen: true, citizen: true },
    { action: 'Soumettre un rapport', super_admin: true, region_admin: true, local_coord: true, observer: true, verified_citizen: true, citizen: false },
    { action: 'Vérifier un rapport', super_admin: true, region_admin: true, local_coord: true, observer: false, verified_citizen: false, citizen: false },
    { action: 'Gérer les utilisateurs', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Créer des scrutins', super_admin: true, region_admin: false, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Générer des tokens', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Voir les audit logs', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Modifier la config', super_admin: true, region_admin: false, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Supprimer des utilisateurs', super_admin: true, region_admin: false, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Accéder au backoffice', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
] as const;

// Tailles de pagination par ressource (alignées avec le backend).
export const USERS_PAGE_SIZE = 25;
export const AUDIT_PAGE_SIZE = 50;

// Clés d'onglets — utilisées par le shell pour le routing et par chaque tab.
export const TAB_KEYS = [
    'dashboard',
    'users',
    'elections',
    'tokens',
    'regions',
    'incidents',
    'logs',
    'config',
    'rbac',
    'mfa',
    'map',
    'intelligence',
    'legal',
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

/**
 * Traductions FR/EN du chrome (libellés d'onglets, actions globales, etc.).
 * Centralisé ici plutôt que dans useAdminUI pour faciliter la migration
 * future vers un système i18n complet (react-i18next).
 */
export const TRANSLATIONS: Record<string, Record<string, string>> = {
    dashboard: { fr: '📊 Tableau de Bord', en: '📊 Dashboard' },
    users: { fr: '👥 Utilisateurs', en: '👥 Users' },
    elections: { fr: '🗳️ Scrutins', en: '🗳️ Elections' },
    tokens: { fr: '🔑 Enrôlement', en: '🔑 Enrollment' },
    regions: { fr: '🗺️ Régions', en: '🗺️ Regions' },
    incidents: { fr: '⚠️ Incidents', en: '⚠️ Incidents' },
    logs: { fr: '📜 Audit', en: '📜 Audit' },
    config: { fr: '⚙️ Config', en: '⚙️ Config' },
    rbac: { fr: '🛡️ RBAC', en: '🛡️ RBAC' },
    mfa: { fr: '🔐 MFA', en: '🔐 MFA' },
    map: { fr: '🗺️ Carte Observateurs', en: '🗺️ Observers Map' },
    intelligence: { fr: '📊 Veille Électorale', en: '📊 Election Intel' },
    legal: { fr: '📜 Cadre Légal', en: '📜 Legal Framework' },
    observers_map: { fr: '🗺️ Carte Observateurs', en: '🗺️ Observers Map' },
    search_placeholder: { fr: '🔍 Rechercher par nom, rôle, ID...', en: '🔍 Search by name, role, ID...' },
    export_csv: { fr: '📥 CSV', en: '📥 CSV' },
    export_pdf: { fr: '📄 PDF', en: '📄 PDF' },
    refresh: { fr: '🔄 Actualiser', en: '🔄 Refresh' },
    create: { fr: '➕ Créer', en: '➕ Create' },
    delete_confirm: { fr: 'Confirmer la suppression ?', en: 'Confirm deletion?' },
    never: { fr: 'Jamais', en: 'Never' },
    no_region: { fr: '— Aucune', en: '— None' },
    alerts: { fr: 'alertes', en: 'alerts' },
    // Tokens tab
    generate: { fr: '🔑 Générer Token', en: '🔑 Generate Token' },
    token_role: { fr: 'Rôle', en: 'Role' },
    token_region: { fr: 'Région', en: 'Region' },
    token_placeholder: { fr: 'Sélectionner une région', en: 'Select a region' },
    token_expires: { fr: 'Expire le', en: 'Expires on' },
    // Login
    login_subtitle: { fr: 'Accédez au tableau de bord tactique et aux données terrain', en: 'Access the tactical dashboard and field data' },
    // Export PDF
    user_count: { fr: 'Utilisateurs', en: 'Users' },
    report_count: { fr: 'Signalements', en: 'Reports' },
    election_count: { fr: 'Scrutins', en: 'Elections' },
    regions_table: { fr: 'Régions', en: 'Regions' },
    elections_table: { fr: 'Scrutins', en: 'Elections' },
    users_table: { fr: 'Utilisateurs', en: 'Users' },
    code: { fr: 'Code', en: 'Code' },
    region: { fr: 'Région', en: 'Region' },
    name: { fr: 'Nom', en: 'Name' },
    role: { fr: 'Rôle', en: 'Role' },
    created: { fr: 'Créé', en: 'Created' },
    status: { fr: 'Statut', en: 'Status' },
    date: { fr: 'Date', en: 'Date' },
    departements: { fr: 'Départements', en: 'Departments' },
    // Config tab
    config_title: { fr: '⚙️ Configuration runtime', en: '⚙️ Runtime config' },
    save_config: { fr: '💾 Sauvegarder', en: '💾 Save' },
    edit_config: { fr: '✏️ Modifier', en: '✏️ Edit' },
    // Intelligence tab
    intelligence_subtitle: { fr: 'Données démographiques et projections par région/département', en: 'Demographic data and projections by region/department' },
    // Users tab
    users_subtitle: { fr: 'Liste, modification de rôle/région, suppression', en: 'List, role/region change, deletion' },
};