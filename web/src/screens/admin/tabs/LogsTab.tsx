/**
 * Onglet Logs — journal d'audit paginé (M5).
 */

import Pagination from '../../../components/Pagination';
import { formatDate } from '../../../utils/format';
import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand, type KPIItem } from '../components/TabHeader';

export default function LogsTab({ state }: { state: AdminPanelState }) {
    const { auditLogs, auditPagination, auditLoading, fetchAuditLogs } = state;

    // KPI Band : agrégats sur la page courante des logs + total global.
    // "Sur cette page" reflète ce que l'admin voit ; "Total" vient de
    // la pagination (compteur global côté backend).
    const onPage = auditLogs.length;
    const kpiItems: KPIItem[] = [
        { label: 'Total', value: auditPagination.total },
        { label: 'Sur cette page', value: onPage },
        {
            label: 'Pages',
            value: auditPagination.total_pages,
            valueColor: 'var(--color-text-muted, #7d8590)',
        },
    ];

    return (
        <div className="admin-section">
            <TabHeader
                title="📋 Logs d'audit"
                subtitle={`${auditPagination.total} action${auditPagination.total > 1 ? 's' : ''} enregistrée${auditPagination.total > 1 ? 's' : ''} dans le journal`}
                actions={
                    <button className="admin-refresh-btn" onClick={() => fetchAuditLogs()} disabled={auditLoading}>
                        {auditLoading ? '⏳' : '🔄'} Actualiser
                    </button>
                }
            >
                <KPIBand items={kpiItems} />
            </TabHeader>
            {auditLogs.length === 0 && !auditLoading ? (
                <div className="admin-empty">Aucune action enregistrée pour le moment.</div>
            ) : (
                <div className="audit-log-list">
                    {auditLogs.map((log) => (
                        <div key={log.id} className="audit-log-entry">
                            <div className="audit-log-icon">
                                {log.action === 'UPDATE_ROLE' ? '🔄' :
                                 log.action === 'DELETE_USER' ? '🗑️' :
                                 log.action === 'GENERATE_TOKEN' ? '🔑' : '📋'}
                            </div>
                            <div className="audit-log-content">
                                <strong>{log.action}</strong>
                                <span className="audit-log-details">{log.details}</span>
                                <small>Par: {log.admin_name} | Cible: {log.target_id?.substring(0, 8)}...</small>
                            </div>
                            <div className="audit-log-time">{formatDate(log.created_at)}</div>
                        </div>
                    ))}
                </div>
            )}
            <Pagination
                page={auditPagination.page}
                limit={auditPagination.limit}
                total={auditPagination.total}
                totalPages={auditPagination.total_pages}
                onPageChange={(p) => fetchAuditLogs(p)}
                isLoading={auditLoading}
            />
        </div>
    );
}