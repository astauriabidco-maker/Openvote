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