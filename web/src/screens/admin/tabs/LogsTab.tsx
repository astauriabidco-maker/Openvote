/**
 * Onglet Logs — journal d'audit paginé (M5).
 */

import Pagination from '../../../components/Pagination';
import { formatDate } from '../../../utils/format';
import type { AdminPanelState } from '../useAdminPanelState';

export default function LogsTab({ state }: { state: AdminPanelState }) {
    const { auditLogs, auditPagination, auditLoading, fetchAuditLogs } = state;

    return (
        <div className="admin-section">
            <div className="admin-section-header">
                <h2>📜 Journal d'Audit</h2>
                <button className="admin-refresh-btn" onClick={() => fetchAuditLogs()} disabled={auditLoading}>
                    {auditLoading ? '⏳' : '🔄'} Actualiser
                </button>
            </div>
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