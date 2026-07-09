/**
 * Openvote — helpers de formatage partagés.
 *
 * Extrait de l'ancien god-component App.tsx (cf. M2 audit) où formatDate
 * existait en double (AdminPanel + Dashboard) avec des signatures presque
 * identiques. Unification ici.
 */

/**
 * formatDate formate une date ISO en français lisible.
 * Utilisée partout dans l'UI admin et la carte des signalements.
 *
 * @param dateStr Date au format ISO 8601 (ex: "2026-01-15T14:30:00Z")
 * @returns Date formatée "15/01/2026, 15:30:00" ou date brute si parsing échoue
 */
export function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleString('fr-FR');
    } catch {
        return dateStr;
    }
}

const ROLE_LABEL_MAP: Record<string, string> = {
    super_admin: '🛡️ Super Admin',
    region_admin: '🏛️ Admin Régional',
    local_coord: '📋 Coord. Local',
    observer: '👁️ Observateur',
    verified_citizen: '✅ Citoyen Vérifié',
    citizen: '🏠 Citoyen',
};

/**
 * getRoleBadge retourne le libellé humain d'un rôle.
 * Utilisé dans le header de Dashboard.
 */
export function getRoleBadge(role: string): string {
    return ROLE_LABEL_MAP[role] || role;
}