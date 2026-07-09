/**
 * Onglet Regions — gestion des régions et départements.
 *
 * Affiche les régions sous forme de cards expansibles avec leurs
 * départements. Inclut deux formulaires : ajouter une région, ajouter
 * un département. Toutes les opérations passent par les handlers du hook.
 */

import type { AdminPanelState } from '../useAdminPanelState';

export default function RegionsTab({ state }: { state: AdminPanelState }) {
    const {
        regions, fetchRegions,
        expandedRegion, setExpandedRegion,
        newRegionName, setNewRegionName, newRegionCode, setNewRegionCode,
        newDeptName, setNewDeptName, newDeptCode, setNewDeptCode, newDeptRegionId, setNewDeptRegionId,
        handleAddRegion, handleDeleteRegion, handleAddDepartment, handleDeleteDepartment,
    } = state;

    return (
        <div className="admin-section">
            <div className="admin-section-header">
                <h2>🗺️ Régions & Départements ({regions.length} régions, {regions.reduce((a, r) => a + r.dept_count, 0)} départements)</h2>
                <button className="admin-refresh-btn" onClick={fetchRegions}>🔄 Actualiser</button>
            </div>

            {/* Ajouter une région */}
            <div className="region-add-form">
                <h3>➕ Ajouter une Région</h3>
                <div className="token-form">
                    <div className="form-group">
                        <label>Nom</label>
                        <input className="admin-input" placeholder="Ex: Adamaoua"
                            value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Code</label>
                        <input className="admin-input" placeholder="Ex: AD"
                            value={newRegionCode} onChange={(e) => setNewRegionCode(e.target.value)}
                            style={{ maxWidth: 100 }} />
                    </div>
                    <button className="admin-primary-btn" onClick={handleAddRegion}>➕ Créer</button>
                </div>
            </div>

            {/* Ajouter un département */}
            <div className="region-add-form" style={{ marginTop: 16 }}>
                <h3>➕ Ajouter un Département</h3>
                <div className="token-form">
                    <div className="form-group">
                        <label>Nom</label>
                        <input className="admin-input" placeholder="Ex: Mfoundi"
                            value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Code</label>
                        <input className="admin-input" placeholder="Ex: CE-MF"
                            value={newDeptCode} onChange={(e) => setNewDeptCode(e.target.value)}
                            style={{ maxWidth: 120 }} />
                    </div>
                    <div className="form-group">
                        <label>Région</label>
                        <select className="admin-select" value={newDeptRegionId} onChange={(e) => setNewDeptRegionId(e.target.value)}>
                            <option value="">Sélectionner...</option>
                            {regions.map((r) => (
                                <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                            ))}
                        </select>
                    </div>
                    <button className="admin-primary-btn" onClick={handleAddDepartment}>➕ Créer</button>
                </div>
            </div>

            {/* Liste des régions avec départements */}
            <div className="region-list">
                {regions.map((region) => (
                    <div key={region.id} className="region-card">
                        <div className="region-card-header" onClick={() => setExpandedRegion(expandedRegion === region.id ? null : region.id)}>
                            <div className="region-card-info">
                                <span className="region-code-badge">{region.code}</span>
                                <strong>{region.name}</strong>
                                <span className="region-dept-count">{region.dept_count} département{region.dept_count > 1 ? 's' : ''}</span>
                            </div>
                            <div className="region-card-actions">
                                <button
                                    className="admin-delete-btn"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteRegion(region.id, region.name); }}
                                    title="Supprimer"
                                >🗑️</button>
                                <span className="expand-icon">{expandedRegion === region.id ? '▼' : '▶'}</span>
                            </div>
                        </div>
                        {expandedRegion === region.id && (
                            <div className="region-departments">
                                {region.departments && region.departments.length > 0 ? (
                                    <div className="dept-grid">
                                        {region.departments.map((dept) => (
                                            <div key={dept.id} className="dept-chip" style={{
                                                display: 'flex', flexDirection: 'column',
                                                alignItems: 'flex-start', padding: '8px 12px', minWidth: '150px',
                                            }}>
                                                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span className="dept-code" style={{ marginRight: 8 }}>{dept.code}</span>
                                                    <button className="dept-delete" onClick={() => handleDeleteDepartment(dept.id, dept.name)}>×</button>
                                                </div>
                                                <span className="dept-name" style={{ fontWeight: 600, marginBottom: 4 }}>{dept.name}</span>
                                                {dept.population > 0 && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                        👥 {dept.population.toLocaleString()} habitants<br />
                                                        🗳️ {dept.registered_voters.toLocaleString()} inscrits
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="admin-empty">Aucun département dans cette région.</div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}