/**
 * Openvote — hook du tab Users (CRUD utilisateurs, pagination, scope région).
 *
 * C'est le PREMIER hook extrait du god-hook `useAdminPanelState` dans le cadre
 * du refactor admin (option B, incrémental par tab). Le pattern :
 *
 *   - Le hook possède TOUT son state et ses handlers
 *   - Il expose une interface typée claire (UsersTabState)
 *   - Il prend ses dépendances (apiClient, notify) en paramètres
 *   - Aucun couplage avec useAdminPanelState : il est testable en isolation
 *   - Le god-hook le compose et expose le résultat sous les mêmes noms
 *     pour ne pas casser les autres consommateurs (RegionsTab, AdminPanel PDF,
 *     observersByRegion).
 *
 * Pattern à dupliquer pour les 7 autres domaines :
 *   useAuditLogsTab, useRegionsTab, useElectionsTab, useIncidentTypesTab,
 *   useConfigTab, useLegalTab, useTokensTab.
 */

import { useCallback, useState } from 'react';
import { type AxiosInstance, isAxiosError } from 'axios';
import type { ApiPagination } from '../../../apiTypes';
import type { AdminUser } from '../../../types';
import { USERS_PAGE_SIZE } from '../constants';

// ============================================================
// Types
// ============================================================

export type NotifyFn = (type: 'success' | 'error' | 'info', text: string) => void;

export interface UsersTabState {
    // Données
    users: AdminUser[];
    usersPage: number;
    usersPagination: ApiPagination;
    usersLoading: boolean;

    // Actions
    fetchUsers: (page?: number) => Promise<void>;
    handleRoleChange: (userId: string, newRole: string) => Promise<void>;
    handleDeleteUser: (userId: string, username: string) => Promise<void>;
    handleRegionChange: (userId: string, newRegionId: string) => Promise<void>;
    exportUsersCSV: () => void;
}

// ============================================================
// Hook
// ============================================================

/**
 * useUsersTab encapsule la logique du tab Users : pagination server-side (M5),
 * scope région pour region_admin (M6), et 3 actions CRUD (role, region, delete).
 *
 * Note d'impl : `isAxiosError` est importé dynamiquement car `axios` est un
 * package qui dépend du bundler pour les types — l'import statique de
 * `import { isAxiosError }` fonctionne aussi en runtime, mais on le garde
 * typé via `typeof` pour ne pas coupler la signature au module axios entier.
 */
export function useUsersTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): UsersTabState {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [usersPage, setUsersPage] = useState(1);
    const [usersPagination, setUsersPagination] = useState<ApiPagination>({
        page: 1, limit: USERS_PAGE_SIZE, total: 0, total_pages: 0,
    });
    const [usersLoading, setUsersLoading] = useState(false);

    // -------- Fetch paginé --------
    const fetchUsers = useCallback(async (page = usersPage) => {
        setUsersLoading(true);
        try {
            const res = await apiClient.get(`/admin/users?page=${page}&limit=${USERS_PAGE_SIZE}`);
            setUsers(res.data.items || []);
            setUsersPagination(res.data.pagination || {
                page, limit: USERS_PAGE_SIZE, total: 0, total_pages: 0,
            });
            setUsersPage(page);
        } catch {
            notify('error', 'Erreur chargement utilisateurs');
        } finally {
            setUsersLoading(false);
        }
    }, [apiClient, notify, usersPage]);

    // -------- Handlers CRUD --------
    const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
        try {
            await apiClient.patch(`/admin/users/${userId}`, { role: newRole, region_id: '' });
            notify('success', `Rôle mis à jour`);
            await fetchUsers();
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? err.response?.data?.error
                : 'Erreur';
            notify('error', msg || 'Erreur lors de la mise à jour');
        }
    }, [apiClient, notify, fetchUsers]);

    const handleDeleteUser = useCallback(async (userId: string, username: string) => {
        if (!confirm(`Supprimer l'utilisateur "${username}" ?\nCette action est irréversible.`)) return;
        try {
            await apiClient.delete(`/admin/users/${userId}`);
            notify('success', `Utilisateur "${username}" supprimé`);
            await fetchUsers();
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? err.response?.data?.error
                : 'Erreur';
            notify('error', msg || 'Erreur lors de la suppression');
        }
    }, [apiClient, notify, fetchUsers]);

    const handleRegionChange = useCallback(async (userId: string, newRegionId: string) => {
        const user = users.find((u) => u.id === userId);
        if (!user) return;
        try {
            await apiClient.patch(`/admin/users/${userId}`, { role: user.role, region_id: newRegionId });
            notify('success', 'Région assignée');
            await fetchUsers();
        } catch {
            notify('error', 'Erreur assignation région');
        }
    }, [apiClient, notify, users, fetchUsers]);

    // -------- Export CSV --------
    // Note d'impl : `window.confirm` + création d'un <a> cliquable est un
    // pattern "à l'ancienne" mais ça marche sans dépendance externe. Un
    // composant <ConfirmDialog> est dans la roadmap de structuration du
    // backoffice.
    const exportUsersCSV = useCallback(() => {
        if (users.length === 0) {
            notify('error', 'Aucun utilisateur à exporter');
            return;
        }
        const csv = 'Username,Role,Region,Created\n' +
            users.map((u) => `${u.username},${u.role},${u.region_id},${u.created_at}`).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `openvote_users_page${usersPage}.csv`;
        a.click();
        notify('info', `CSV exporté pour la page ${usersPage}/${usersPagination.total_pages} — pour un export complet, contactez l'admin`);
    }, [users, usersPage, usersPagination.total_pages, notify]);

    return {
        users,
        usersPage,
        usersPagination,
        usersLoading,
        fetchUsers,
        handleRoleChange,
        handleDeleteUser,
        handleRegionChange,
        exportUsersCSV,
    };
}