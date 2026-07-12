/**
 * Onglet Incidents — gestion des types d'incidents (fraude, violence, etc.).
 *
 * ConfirmDialog : la suppression passe par une modale au lieu de
 * `window.confirm()`. Le hook `useIncidentTypesTab` expose `pendingDeleteIncidentType` /
 * `confirmDeleteIncidentType` / `cancelDeleteIncidentType` ; on rend la modale ici.
 */

import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand, type KPIItem } from '../components/TabHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function IncidentsTab({ state }: { state: AdminPanelState }) {
    const {
        incidentTypes, newIncident, setNewIncident,
        handleCreateIncidentType, handleDeleteIncidentType,
        pendingDeleteIncidentType, confirmDeleteIncidentType, cancelDeleteIncidentType, deletingIncidentType,
    } = state;

    // KPI Band : distribution par sévérité (depuis incidentTypes[].severity).
    // Si aucun type créé, on affiche 1 seul KPI "Aucun type".
    const bySeverity = incidentTypes.reduce<Record<number, number>>((acc, t) => {
        acc[t.severity] = (acc[t.severity] ?? 0) + 1;
        return acc;
    }, {});
    const kpiItems: KPIItem[] = incidentTypes.length === 0
        ? [{ label: 'Types', value: 0 }]
        : [
            { label: 'Total', value: incidentTypes.length },
            {
                label: 'Critique (5)',
                value: bySeverity[5] ?? 0,
                valueColor: 'var(--color-accent-red, #f85149)',
            },
            {
                label: 'Haute (3-4)',
                value: (bySeverity[4] ?? 0) + (bySeverity[3] ?? 0),
                valueColor: 'var(--color-accent-orange, #f0883e)',
            },
            {
                label: 'Moyenne+ (1-2)',
                value: (bySeverity[2] ?? 0) + (bySeverity[1] ?? 0),
                valueColor: 'var(--color-accent-blue, #58a6ff)',
            },
        ];

    return (
        <div className="admin-section">
            <TabHeader
                title="⚠️ Types d'incidents"
                subtitle={`${incidentTypes.length} type${incidentTypes.length > 1 ? 's' : ''} configuré${incidentTypes.length > 1 ? 's' : ''}`}
            >
                <KPIBand items={kpiItems} />
            </TabHeader>

            <div className="region-add-form">
                <h3>➕ Ajouter un Type d'Incident</h3>
                <div className="token-form">
                    <div className="form-group">
                        <label>Nom</label>
                        <input
                            className="admin-input"
                            placeholder="Ex: Bourrage d'urnes"
                            value={newIncident.name}
                            onChange={(e) => setNewIncident({ ...newIncident, name: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Code</label>
                        <input
                            className="admin-input"
                            placeholder="Ex: STUFF"
                            value={newIncident.code}
                            onChange={(e) => setNewIncident({ ...newIncident, code: e.target.value })}
                            style={{ maxWidth: 120 }}
                        />
                    </div>
                    <div className="form-group">
                        <label>Sévérité (1-5)</label>
                        <select
                            className="admin-select"
                            value={newIncident.severity}
                            onChange={(e) => setNewIncident({ ...newIncident, severity: parseInt(e.target.value) })}
                        >
                            {[1, 2, 3, 4, 5].map((s) => (
                                <option key={s} value={s}>
                                    {s} - {['Faible', 'Modérée', 'Moyenne', 'Haute', 'Critique'][s - 1]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Couleur</label>
                        <input
                            className="admin-input"
                            type="color"
                            value={newIncident.color}
                            onChange={(e) => setNewIncident({ ...newIncident, color: e.target.value })}
                            style={{ maxWidth: 60, padding: 4, height: 42 }}
                        />
                    </div>
                    <button className="admin-primary-btn" onClick={handleCreateIncidentType}>➕ Créer</button>
                </div>
            </div>

            <div className="incident-list">
                {incidentTypes.map((it) => (
                    <div key={it.id} className="incident-chip">
                        <span className="incident-color-dot" style={{ background: it.color }}></span>
                        <span className="incident-severity">{'⚠️'.repeat(it.severity)}</span>
                        <strong>{it.code}</strong>
                        <span>{it.name}</span>
                        {it.description && <small>{it.description}</small>}
                        <button className="dept-delete" onClick={() => handleDeleteIncidentType(it.id, it.name)}>×</button>
                    </div>
                ))}
            </div>

            {/* ConfirmDialog : confirme la suppression avant DELETE. */}
            <ConfirmDialog
                open={!!pendingDeleteIncidentType}
                title="Supprimer le type d'incident ?"
                message={
                    pendingDeleteIncidentType
                        ? `Cette action est irréversible. Supprimer "${pendingDeleteIncidentType.name}" ?`
                        : ''
                }
                confirmLabel={deletingIncidentType ? 'Suppression…' : 'Supprimer'}
                variant="danger"
                onConfirm={confirmDeleteIncidentType}
                onCancel={cancelDeleteIncidentType}
            />
        </div>
    );
}