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
 *
 * Historique des imports : une modale ad-hoc (pas de form, juste un
 * <DataTable>) affiche les imports passés via GET /admin/regions/import-csv/history.
 * Fetch paresseux à l'ouverture pour éviter un GET inutile au mount.
 *
 * Graphique d'évolution : un bouton 📈 sur chaque département ouvre
 * une modale avec un <LineChart> (SVG custom) traçant l'évolution
 * population + électeurs. Données via GET /admin/departments/:id/demographics-history.
 */

import { useEffect } from 'react';
import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader from '../components/TabHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import FormModal from '../components/FormModal';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import LineChart from '../components/LineChart';
import type { DataImportRow } from '../hooks/useRegionsTab';

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
        pendingLargeImport, confirmLargeImport, cancelLargeImport,
        importHistoryOpen, setImportHistoryOpen,
        importHistory, importHistoryLoading,
        historyPage, historyPagination, handleFetchImportHistory,
        evolutionChartDept, closeEvolutionChart, evolutionChartData,
        evolutionChartLoading, handleFetchEvolutionChart,
    } = state;

    // Fetch paresseux : on ne charge l'historique qu'à l'ouverture de la modale.
    // L'effet se déclenche aussi à l'ouverture d'un import réussi, pour
    // voir la nouvelle ligne apparaître dans l'historique si l'admin le rouvre.
    useEffect(() => {
        if (importHistoryOpen) {
            void handleFetchImportHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [importHistoryOpen]);

    // Colonnes du tableau d'historique. Tri client-side sur les colonnes
    // 'date' (created_at), 'updated', 'failed'. Le rendu de 'updated' et
    // 'failed' est custom (couleur rouge si > 0).
    const historyColumns: DataTableColumn<DataImportRow>[] = [
        {
            key: 'created_at', label: 'Date', sortable: true,
            render: (row) => {
                const d = new Date(row.created_at);
                return (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                        {d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                );
            },
        },
        {
            key: 'source_name', label: 'Source', sortable: true,
            render: (row) => <strong>{row.source_name || '—'}</strong>,
        },
        {
            key: 'file_name', label: 'Fichier', sortable: true,
            render: (row) => (
                <code style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {row.file_name}
                </code>
            ),
        },
        {
            key: 'records_updated', label: 'MàJ', sortable: true, align: 'right',
            render: (row) => (
                <span style={{ color: '#3fb950', fontWeight: 600 }}>{row.records_updated}</span>
            ),
        },
        {
            key: 'records_failed', label: 'Échecs', sortable: true, align: 'right',
            render: (row) => (
                <span style={{ color: row.records_failed > 0 ? '#f85149' : 'var(--text-secondary)', fontWeight: 600 }}>
                    {row.records_failed}
                </span>
            ),
        },
        {
            key: 'imported_by', label: 'Par', sortable: true,
            render: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.imported_by}</span>,
        },
        {
            key: 'notes', label: 'Notes', sortable: false,
            render: (row) => (
                <span
                    style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}
                    title={row.notes}
                >
                    {row.notes.length > 60 ? `${row.notes.slice(0, 57)}…` : row.notes}
                </span>
            ),
        },
    ];

    return (
        <div className="admin-section">
            <TabHeader
                title="🌍 Régions & Départements"
                subtitle={`${regions.length} régions · ${regions.reduce((a, r) => a + r.dept_count, 0)} départements`}
                actions={
                    <>
                        <button className="admin-refresh-btn" onClick={() => setImportHistoryOpen(true)}>📊 Historique</button>
                        <button className="admin-refresh-btn" onClick={() => setImportCSVMopen(true)}>📥 Import CSV</button>
                        <button className="admin-refresh-btn" onClick={fetchRegions}>🔄 Actualiser</button>
                    </>
                }
            />

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
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button
                                                            className="dept-delete"
                                                            onClick={() => handleFetchEvolutionChart(dept.id, dept.name)}
                                                            title="Voir l'évolution démographique"
                                                            style={{ fontSize: '0.8rem' }}
                                                        >📈</button>
                                                        <button className="dept-delete" onClick={() => handleDeleteDepartment(dept.id, dept.name)}>×</button>
                                                    </div>
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

            {/* Modale Historique des imports CSV (pas de form, juste DataTable). */}
            {importHistoryOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="import-history-title"
                    onClick={() => setImportHistoryOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(4px)',
                        animation: 'confirm-fade-in 200ms ease',
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(135deg, #161b22, #0d1117)',
                            border: '1px solid rgba(48,54,61,0.8)',
                            borderRadius: 14,
                            padding: '24px 28px',
                            maxWidth: 920,
                            width: '100%',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 16,
                            }}
                        >
                            <h2
                                id="import-history-title"
                                style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}
                            >
                                📊 Historique des imports CSV
                                {historyPagination.total > 0 && (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginLeft: 10, fontWeight: 400 }}>
                                        ({historyPagination.total} import{historyPagination.total > 1 ? 's' : ''} — page {historyPage}/{historyPagination.total_pages})
                                    </span>
                                )}
                            </h2>
                            <button
                                type="button"
                                aria-label="Fermer"
                                onClick={() => setImportHistoryOpen(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    fontSize: '1.2rem',
                                    cursor: 'pointer',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        <div style={{ overflow: 'auto', flex: 1 }}>
                            <DataTable
                                columns={historyColumns}
                                rows={importHistory}
                                keyExtractor={(r) => r.id}
                                loading={importHistoryLoading}
                                emptyMessage="Aucun import enregistré pour le moment"
                                rowLabel="import"
                                pagination={historyPagination}
                                onPageChange={(p) => handleFetchImportHistory(p)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Modale Graphique d'évolution démographique. */}
            {evolutionChartDept && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="evolution-chart-title"
                    onClick={closeEvolutionChart}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(4px)',
                        animation: 'confirm-fade-in 200ms ease',
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(135deg, #161b22, #0d1117)',
                            border: '1px solid rgba(48,54,61,0.8)',
                            borderRadius: 14,
                            padding: '24px 28px',
                            maxWidth: 720,
                            width: '100%',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 16,
                            }}
                        >
                            <h2
                                id="evolution-chart-title"
                                style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}
                            >
                                📈 Évolution : {evolutionChartDept.deptName}
                            </h2>
                            <button
                                type="button"
                                aria-label="Fermer"
                                onClick={closeEvolutionChart}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    fontSize: '1.2rem',
                                    cursor: 'pointer',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {evolutionChartLoading ? (
                            <div
                                style={{
                                    height: 220,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.85rem',
                                }}
                            >
                                ⏳ Chargement…
                            </div>
                        ) : evolutionChartData.length > 0 ? (
                            <>
                                <LineChart
                                    data={evolutionChartData as unknown as Array<{ recorded_at: string; [key: string]: string | number }>}
                                    series={[
                                        { key: 'population', label: 'Population', color: '#58a6ff' },
                                        { key: 'registered_voters', label: 'Électeurs inscrits', color: '#3fb950' },
                                    ]}
                                    height={240}
                                    yFormat={(n) => {
                                        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
                                        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
                                        return n.toString();
                                    }}
                                />
                                <div
                                    style={{
                                        marginTop: 12,
                                        padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.04)',
                                        borderRadius: 6,
                                        fontSize: '0.78rem',
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    {evolutionChartData.length} point{evolutionChartData.length > 1 ? 's' : ''} mesuré{evolutionChartData.length > 1 ? 's' : ''} —
                                    source : trigger SQL sur mise à jour départements (migration 016)
                                </div>
                            </>
                        ) : (
                            <div
                                style={{
                                    height: 220,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.85rem',
                                }}
                            >
                                Aucune donnée d'évolution disponible.
                            </div>
                        )}
                    </div>
                </div>
            )}

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

            {/* ConfirmDialog : si le fichier > 1 MiB, on demande confirmation
                explicite avant l'upload. Évite un clic accidentel qui lance un
                parse long sur des centaines de lignes. */}
            <ConfirmDialog
                open={pendingLargeImport}
                title="Fichier volumineux détecté"
                message={
                    importCSVFile
                        ? `Le fichier "${importCSVFile.name}" fait ${(importCSVFile.size / (1024 * 1024)).toFixed(2)} MiB (> 1 MiB). L'upload et le parsing peuvent prendre plusieurs secondes. Confirmer l'import ?`
                        : ''
                }
                confirmLabel={importingCSV ? 'Import en cours…' : "Oui, importer l'ensemble"}
                cancelLabel="Annuler"
                variant="primary"
                onConfirm={confirmLargeImport}
                onCancel={cancelLargeImport}
            />
        </div>
    );
}