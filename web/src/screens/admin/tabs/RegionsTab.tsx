/**
 * Onglet Regions — gestion des régions et départements.
 *
 * Affiche les régions sous forme de cards expansibles avec leurs
 * départements. Inclut deux formulaires : ajouter une région, ajouter
 * un département. Toutes les opérations passent par les handlers du hook.
 *
 * ConfirmDialog : deux modales distinctes pour la suppression (région vs
 * département) — les messages diffèrent (région = cascade départements).
 *
 * Import CSV : un troisième FormModal permet d'uploader un CSV
 * démographique (colonnes code, population, registered_voters, data_source)
 * via POST /admin/regions/import-csv. Bouton "📥 Import CSV" + lien de
 * téléchargement du modèle pré-rempli.
 */

import type { AdminPanelState } from '../useAdminPanelState';
import ConfirmDialog from '../components/ConfirmDialog';
import FormModal from '../components/FormModal';

export default function RegionsTab({ state }: { state: AdminPanelState }) {
    const {
        regions, fetchRegions,
        expandedRegion, setExpandedRegion,
        newRegionName, setNewRegionName, newRegionCode, setNewRegionCode,
        newDeptName, setNewDeptName, newDeptCode, setNewDeptCode, newDeptRegionId, setNewDeptRegionId,
        handleAddRegion, handleDeleteRegion, handleAddDepartment, handleDeleteDepartment,
        pendingDeleteRegion, confirmDeleteRegion, cancelDeleteRegion, deletingRegion,
        pendingDeleteDepartment, confirmDeleteDepartment, cancelDeleteDepartment, deletingDepartment,
        importCSVMopen, setImportCSVMopen,
        importCSVFile, setImportCSVFile,
        importCSVYear, setImportCSVYear,
        importCSVSource, setImportCSVSource,
        importingCSV, handleImportCSV, handleDownloadTemplate,
    } = state;

    return (
        <div className="admin-section">
            <div className="admin-section-header">
                <h2>🗺️ Régions & Départements ({regions.length} régions, {regions.reduce((a, r) => a + r.dept_count, 0)} départements)</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="admin-refresh-btn" onClick={() => setImportCSVMopen(true)}>📥 Import CSV</button>
                    <button className="admin-refresh-btn" onClick={fetchRegions}>🔄 Actualiser</button>
                </div>
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

            {/* ConfirmDialog : suppression d'une région (avec cascade départements). */}
            <ConfirmDialog
                open={!!pendingDeleteRegion}
                title="Supprimer la région ?"
                message={
                    pendingDeleteRegion
                        ? `Cette action supprimera "${pendingDeleteRegion.name}" et TOUS ses départements. Irréversible.`
                        : ''
                }
                confirmLabel={deletingRegion ? 'Suppression…' : 'Supprimer'}
                variant="danger"
                onConfirm={confirmDeleteRegion}
                onCancel={cancelDeleteRegion}
            />

            {/* ConfirmDialog : suppression d'un département. */}
            <ConfirmDialog
                open={!!pendingDeleteDepartment}
                title="Supprimer le département ?"
                message={
                    pendingDeleteDepartment
                        ? `Cette action est irréversible. Supprimer "${pendingDeleteDepartment.name}" ?`
                        : ''
                }
                confirmLabel={deletingDepartment ? 'Suppression…' : 'Supprimer'}
                variant="danger"
                onConfirm={confirmDeleteDepartment}
                onCancel={cancelDeleteDepartment}
            />

            {/* FormModal : import CSV démographique. */}
            <FormModal
                open={importCSVMopen}
                title="📥 Import CSV démographie"
                onClose={() => {
                    if (importingCSV) return;
                    setImportCSVMopen(false);
                    setImportCSVFile(null);
                }}
                onSubmit={handleImportCSV}
                submitting={importingCSV}
                submitLabel={importingCSV ? 'Import en cours…' : 'Importer'}
                submitDisabled={!importCSVFile}
            >
                <div style={{
                    padding: '10px 12px',
                    background: 'rgba(88,166,255,0.08)',
                    border: '1px solid rgba(88,166,255,0.25)',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                }}>
                    <strong style={{ color: 'var(--accent-blue)' }}>Format attendu :</strong>
                    <br />Colonnes <code>code</code>, <code>population</code>,{' '}
                    <code>registered_voters</code> (ou <code>inscrits</code>),{' '}
                    <code>data_source</code> (optionnel).
                    <br />Le <code>code</code> doit correspondre à un département existant
                    (voir le modèle).
                </div>

                <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    style={{
                        background: 'none',
                        border: '1px dashed rgba(88,166,255,0.4)',
                        color: 'var(--accent-blue)',
                        padding: '6px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        alignSelf: 'flex-start',
                    }}
                >
                    📋 Télécharger le modèle pré-rempli
                </button>

                <div className="form-group">
                    <label style={{ color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 6, display: 'block' }}>
                        Fichier CSV
                    </label>
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => setImportCSVFile(e.target.files?.[0] ?? null)}
                        disabled={importingCSV}
                        style={{
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem',
                            padding: 6,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            width: '100%',
                        }}
                    />
                    {importCSVFile && (
                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: 4, display: 'block' }}>
                            ✓ {importCSVFile.name} ({(importCSVFile.size / 1024).toFixed(1)} KB)
                        </small>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                        <label style={{ color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 6, display: 'block' }}>
                            Année des données
                        </label>
                        <input
                            type="number"
                            min="2000"
                            max="2100"
                            value={importCSVYear}
                            onChange={(e) => setImportCSVYear(parseInt(e.target.value, 10) || 2025)}
                            disabled={importingCSV}
                            className="admin-input"
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                        <label style={{ color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 6, display: 'block' }}>
                            Source
                        </label>
                        <input
                            type="text"
                            value={importCSVSource}
                            onChange={(e) => setImportCSVSource(e.target.value)}
                            disabled={importingCSV}
                            placeholder="Ex: BUCREP 2023, MINATD, Estimé"
                            className="admin-input"
                            style={{ width: '100%' }}
                        />
                    </div>
                </div>
            </FormModal>
        </div>
    );
}