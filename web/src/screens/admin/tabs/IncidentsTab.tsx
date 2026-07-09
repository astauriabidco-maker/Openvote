/**
 * Onglet Incidents — gestion des types d'incidents (fraude, violence, etc.).
 */

import type { AdminPanelState } from '../useAdminPanelState';

export default function IncidentsTab({ state }: { state: AdminPanelState }) {
    const {
        incidentTypes, newIncident, setNewIncident,
        handleCreateIncidentType, handleDeleteIncidentType,
    } = state;

    return (
        <div className="admin-section">
            <div className="admin-section-header">
                <h2>⚠️ Types d'Incidents ({incidentTypes.length})</h2>
            </div>

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
        </div>
    );
}