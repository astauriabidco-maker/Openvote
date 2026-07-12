/**
 * Onglet Dashboard — synthèse KPIs.
 *
 * Dépendances : kpis, regions (computed). Pas de fetch propre (déclenché
 * automatiquement par le hook quand activeTab === 'dashboard').
 *
 * TabHeader (refonte 2026-07) : utilise le composant partagé, avec
 * le bouton "📄 Export PDF" migré depuis l'ancien admin-header-actions
 * du shell AdminPanel.
 */

import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader from '../components/TabHeader';
import { exportAdminReport } from '../../../utils/adminReport';

export default function DashboardTab({ state }: { state: AdminPanelState }) {
    const { kpis, regions, users, elections } = state;

    if (!kpis) {
        return <div className="admin-empty">Chargement des KPIs...</div>;
    }

    return (
        <div className="admin-section">
            <TabHeader
                title="📊 Tableau de bord"
                subtitle="Vue d'ensemble des indicateurs clés du système."
                actions={
                    <button
                        className="admin-primary-btn"
                        onClick={() => exportAdminReport({ kpis, users, elections, regions })}
                    >
                        📄 Exporter en PDF
                    </button>
                }
            />
            <div className="kpi-grid">
                <div className="kpi-card kpi-blue">
                    <div className="kpi-value">{kpis.users.total}</div>
                    <div className="kpi-label">Utilisateurs</div>
                    <div className="kpi-detail">
                        {Object.entries(kpis.users.by_role).map(([role, count]) => (
                            <span key={role}>{role}: {count}</span>
                        ))}
                    </div>
                </div>
                <div className="kpi-card kpi-green">
                    <div className="kpi-value">{kpis.reports.total}</div>
                    <div className="kpi-label">Signalements</div>
                    <div className="kpi-detail">
                        <span>✅ {kpis.reports.verified} vérifiés</span>
                        <span>⏳ {kpis.reports.pending} en attente</span>
                        <span>❌ {kpis.reports.rejected} rejetés</span>
                    </div>
                </div>
                <div className="kpi-card kpi-purple">
                    <div className="kpi-value">{kpis.elections.total}</div>
                    <div className="kpi-label">Scrutins</div>
                    <div className="kpi-detail">
                        <span>🟢 {kpis.elections.active} actif(s)</span>
                    </div>
                </div>
                <div className="kpi-card kpi-orange">
                    <div className="kpi-value">{regions.length || '—'}</div>
                    <div className="kpi-label">Régions</div>
                    <div className="kpi-detail">
                        <span>10 régions officielles</span>
                    </div>
                </div>
            </div>
        </div>
    );
}