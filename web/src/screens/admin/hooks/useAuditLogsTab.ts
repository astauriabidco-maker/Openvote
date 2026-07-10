/**
 * Openvote — hook du tab Audit logs (lecture paginée des événements d'audit).
 *
 * Pattern identique à useUsersTab (refactor admin, option B incrémental).
 * Le state + le fetch sont extraits du god-hook useAdminPanelState.
 *
 * Particularité : pas de handlers CRUD ici. L'audit log est en lecture seule
 * côté UI (les événements sont écrits par le backend automatiquement via
 * logAuthEvent, etc.). Le seul handler exposé est le fetch paginé.
 */

import { useCallback, useState } from 'react';
import { type AxiosInstance } from 'axios';
import type { ApiPagination } from '../../../apiTypes';
import type { AuditLog } from '../../../types';
import { AUDIT_PAGE_SIZE } from '../constants';
import type { NotifyFn } from './useUsersTab';

export interface AuditLogsTabState {
    // Données
    auditLogs: AuditLog[];
    auditPage: number;
    auditPagination: ApiPagination;
    auditLoading: boolean;

    // Actions
    fetchAuditLogs: (page?: number) => Promise<void>;
}

export function useAuditLogsTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): AuditLogsTabState {
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [auditPage, setAuditPage] = useState(1);
    const [auditPagination, setAuditPagination] = useState<ApiPagination>({
        page: 1, limit: AUDIT_PAGE_SIZE, total: 0, total_pages: 0,
    });
    const [auditLoading, setAuditLoading] = useState(false);

    const fetchAuditLogs = useCallback(async (page = auditPage) => {
        setAuditLoading(true);
        try {
            const res = await apiClient.get(`/admin/audit-logs?page=${page}&limit=${AUDIT_PAGE_SIZE}`);
            setAuditLogs(res.data.items || []);
            setAuditPagination(res.data.pagination || {
                page, limit: AUDIT_PAGE_SIZE, total: 0, total_pages: 0,
            });
            setAuditPage(page);
        } catch {
            notify('error', 'Erreur chargement logs');
        } finally {
            setAuditLoading(false);
        }
    }, [apiClient, notify, auditPage]);

    return {
        auditLogs,
        auditPage,
        auditPagination,
        auditLoading,
        fetchAuditLogs,
    };
}