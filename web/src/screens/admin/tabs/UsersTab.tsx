/**
 * Onglet Users — gestion des utilisateurs avec pagination serveur (M5)
 * et scope régional (M6).
 *
 * M5 : pagination via server-side `?page=&limit=`, retournée par le hook
 *      dans `usersPagination`. Composant <Pagination> réutilisable.
 * M6 : pour un region_admin, le backend filtre déjà les résultats — on
 *      affiche un bandeau bleu d'avertissement pour transparence.
 *
 * POC ConfirmDialog : la suppression passe par une modale au lieu de
 * `window.confirm()`. Le hook `useUsersTab` expose `pendingDelete` /
 * `confirmDeleteUser` / `cancelDeleteUser` ; on rend la modale ici.
 *
 * TabHeader (refonte 2026-07) : utilise le nouveau composant
 * <TabHeader> + <KPIBand> au lieu de l'ancien admin-section-header
 * inline. C'est le premier onglet à adopter le pattern ; les autres
 * migreront au fil de l'eau.
 */

import Pagination from '../../../components/Pagination';
import { formatDate } from '../../../utils/format';
import { ROLES, ROLE_LABELS } from '../constants';
import ConfirmDialog from '../components/ConfirmDialog';
import TabHeader, { KPIBand, type KPIItem } from '../components/TabHeader';
import type { AdminPanelState } from '../useAdminPanelState';

export default function UsersTab({ state }: { state: AdminPanelState }) {
    const {
        users, usersPagination, usersLoading, regions,
        fetchUsers, exportUsersCSV,
        handleRoleChange, handleDeleteUser, handleRegionChange,
        pendingDelete, confirmDeleteUser, cancelDeleteUser, deletingUser,
        auth, kpis,
    } = state;

    // KPI Band : chiffres réels depuis kpis.users (endpoint /admin/kpis
    // expose déjà by_role — pas besoin d'un endpoint /stats dédié).
    // Pour les deltas (variation temporelle), il faudrait un endpoint
    // time-series — non exposé pour l'instant, on omet le delta plutôt
    // que d'afficher un placeholder trompeur.
    // `usersPagination.total` est utilisé comme fallback si kpis n'est
    // pas encore chargé (1er mount avant le GET /admin/kpis).
    const roleByName = kpis?.users.by_role ?? {};
    const kpiItems: KPIItem[] = [
        { label: 'Total', value: kpis?.users.total ?? usersPagination.total },
        {
            label: 'Super admin',
            value: roleByName.super_admin ?? 0,
            valueColor: 'var(--color-accent-red, #f85149)',
        },
        {
            label: 'Region admin',
            value: roleByName.region_admin ?? 0,
            valueColor: 'var(--color-accent-blue, #58a6ff)',
        },
        {
            label: 'Observateurs',
            value: roleByName.observer ?? 0,
            valueColor: 'var(--color-accent-green, #3fb950)',
        },
    ];

    return (
        <div className="admin-section">
            {/* Nouveau TabHeader (refonte 2026-07) : titre + actions + KPI */}
            <TabHeader
                title="👥 Utilisateurs"
                subtitle={`${kpis?.users.total ?? usersPagination.total} utilisateurs · ${Object.keys(roleByName).length} rôles représentés`}
                actions={
                    <>
                        <button className="admin-refresh-btn" onClick={exportUsersCSV}>📥 CSV</button>
                        <button className="admin-refresh-btn" onClick={() => fetchUsers()} disabled={usersLoading}>
                            {usersLoading ? '⏳' : '🔄'} Actualiser
                        </button>
                    </>
                }
            >
                <KPIBand items={kpiItems} />
            </TabHeader>

            {/* Bandeau scope régional (M6) — visible uniquement pour region_admin. */}
            {auth.role === 'region_admin' && (
                <div style={{
                    padding: '10px 14px', marginBottom: 12,
                    background: 'rgba(88,166,255,0.08)',
                    border: '1px solid rgba(88,166,255,0.25)',
                    borderRadius: '8px', color: '#79c0ff',
                    fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{ fontSize: '1rem' }}>🔒</span>
                    <span>
                        <strong>Scope régional actif :</strong> vous ne voyez et gérez
                        que les utilisateurs de votre région. Cette restriction est
                        appliquée côté serveur.
                    </span>
                </div>
            )}

            <div className="admin-table-wrapper">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Utilisateur</th>
                            <th>Rôle</th>
                            <th>Région</th>
                            <th>Dernier login</th>
                            <th>Créé le</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className={user.id === auth.username ? 'current-user' : ''}>
                                <td>
                                    <div className="user-cell">
                                        <span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span>
                                        <div>
                                            <strong>{user.username}</strong>
                                            <small>{user.id.substring(0, 8)}...</small>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <select
                                        className={`role-select role-${user.role}`}
                                        value={user.role}
                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                    >
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                        ))}
                                    </select>
                                </td>
                                <td>
                                    <select
                                        className="admin-select"
                                        value={user.region_id || ''}
                                        onChange={(e) => handleRegionChange(user.id, e.target.value)}
                                        style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                                    >
                                        <option value="">— Aucune</option>
                                        {regions.map((r) => (
                                            <option key={r.id} value={r.id}>{r.code} - {r.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td>{user.last_login_at ? formatDate(user.last_login_at) : <span style={{ color: 'var(--text-secondary)' }}>Jamais</span>}</td>
                                <td>{formatDate(user.created_at)}</td>
                                <td>
                                    <button
                                        className="admin-delete-btn"
                                        onClick={() => handleDeleteUser(user.id, user.username)}
                                        title="Supprimer"
                                    >🗑️</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination
                page={usersPagination.page}
                limit={usersPagination.limit}
                total={usersPagination.total}
                totalPages={usersPagination.total_pages}
                onPageChange={(p) => fetchUsers(p)}
                isLoading={usersLoading}
            />

            {/* POC ConfirmDialog : confirme la suppression avant DELETE. */}
            <ConfirmDialog
                open={!!pendingDelete}
                title="Supprimer l'utilisateur ?"
                message={
                    pendingDelete
                        ? `Cette action est irréversible. Supprimer "${pendingDelete.name}" ?`
                        : ''
                }
                confirmLabel={deletingUser ? 'Suppression…' : 'Supprimer'}
                variant="danger"
                onConfirm={confirmDeleteUser}
                onCancel={cancelDeleteUser}
            />
        </div>
    );
}