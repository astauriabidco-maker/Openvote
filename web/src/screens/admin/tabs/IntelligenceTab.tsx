/**
 * Onglet Intelligence — intelligence électorale & analyse démographique.
 *
 * Sections :
 *   1. Synthèse nationale (4 KPIs)
 *   2. Carte électorale interactive du Cameroun (lazy)
 *   3. Consolidation par région (table)
 *   4. Import CSV de données officielles
 *   5. Focus départements avec édition inline
 *
 * Note : utilise le lazy CameroonInteractiveMap (cf. M2).
 */

import { lazy, Suspense } from 'react';
import { API_URL } from '../../../constants';
import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand } from '../components/TabHeader';
import BUCREPDemographics from './BUCREPDemographics';

const CameroonInteractiveMap = lazy(() => import('../../../CameroonInteractiveMap'));

export default function IntelligenceTab({ state }: { state: AdminPanelState }) {
    const {
        regions, fetchRegions, fetchElections,
        editingDeptId, setEditingDeptId, deptDraft, setDeptDraft, handleUpdateDeptData,
    } = state;

    // Synthèse nationale — agrégats calculés à la volée.
    const totalPop = regions.reduce(
        (acc, r) => acc + r.departments.reduce((s, d) => s + (d.population || 0), 0), 0,
    );
    const totalVoters = regions.reduce(
        (acc, r) => acc + r.departments.reduce((s, d) => s + (d.registered_voters || 0), 0), 0,
    );
    const nationalRate = totalPop > 0 ? (totalVoters / totalPop) * 100 : 0;
    const totalDepts = regions.reduce((acc, r) => acc + r.departments.length, 0);

    return (
        <div className="admin-section">
            <TabHeader
                title="📈 Intelligence électorale"
                subtitle="Données démographiques et projections par région/département"
                actions={
                    <button className="admin-refresh-btn" onClick={() => { fetchRegions(); fetchElections(); }}>
                        🔄 Recalculer les ratios
                    </button>
                }
            >
                <KPIBand items={[
                    {
                        label: 'Population totale',
                        value: `${(totalPop / 1_000_000).toFixed(1)}M`,
                        delta: `${regions.length} régions · ${totalDepts} départements`,
                        valueColor: '#58a6ff',
                    },
                    {
                        label: 'Inscrits totaux',
                        value: `${(totalVoters / 1_000_000).toFixed(2)}M`,
                        delta: 'Source : ELECAM consolidé',
                        valueColor: '#3fb950',
                    },
                    {
                        label: "Taux d'enrôlement",
                        value: `${nationalRate.toFixed(1)}%`,
                        delta: nationalRate > 40 ? 'Au-dessus du seuil' : 'Sous le seuil critique',
                        trend: nationalRate > 40 ? 'up' : 'down',
                        valueColor: nationalRate > 40 ? '#3fb950' : '#d29922',
                    },
                ]} />
            </TabHeader>

            {/* 1. SYNTHÈSE NATIONALE */}
            <div className="analytics-summary" style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px', marginBottom: '30px', marginTop: '20px',
            }}>
                <div className="config-card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
                    <small>Population Totale (Est.)</small>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {(totalPop / 1000000).toFixed(1)}M
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Source : Recensement & Estimations</div>
                </div>
                <div className="config-card" style={{ borderLeft: '4px solid var(--accent-green)' }}>
                    <small>Inscrits Totaux (BI)</small>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {(totalVoters / 1000000).toFixed(2)}M
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Données consolidées ELECAM</div>
                </div>
                <div className="config-card" style={{ borderLeft: '4px solid var(--accent-yellow)' }}>
                    <small>Taux d'Enrôlement National</small>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{nationalRate.toFixed(1)}%</div>
                    <div className="progress-bg" style={{ height: '4px', background: '#30363d', borderRadius: '2px', marginTop: '8px' }}>
                        <div className="progress-fill" style={{ height: '100%', width: '35%', background: 'var(--accent-yellow)', borderRadius: '2px' }}></div>
                    </div>
                </div>
                <div className="config-card" style={{ borderLeft: '4px solid var(--accent-red)' }}>
                    <small>Indice de Tension Moyen</small>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>4.2 / 10</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-red)' }}>⚠️ 12 alertes critiques actives</div>
                </div>
            </div>

            {/* 1b. DÉMOGRAPHIE BUCREP (refonte 2026-07) — pyramide + tableau */}
            <BUCREPDemographics state={state} />

            {/* 2. CARTE ÉLECTORALE INTERACTIVE */}
            <div className="config-card" style={{ padding: '0', marginBottom: '40px', overflow: 'hidden' }}>
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <h3 style={{ margin: 0 }}>🗺️ Carte Électorale Interactive du Cameroun</h3>
                    <small style={{ color: 'var(--text-secondary)' }}>Sources : BUCREP 2023 / ELECAM 2025 — Cliquez sur une région</small>
                </div>
                <div style={{ padding: '16px' }}>
                    <Suspense fallback={
                        <div style={{ height: '560px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                            Chargement de la carte...
                        </div>
                    }>
                        <CameroonInteractiveMap
                            regions={regions.map((r) => ({
                                name: r.name,
                                population: r.departments.reduce((s: number, d) => s + (d.population || 0), 0),
                                registered_voters: r.departments.reduce((s: number, d) => s + (d.registered_voters || 0), 0),
                                departments: r.departments,
                            }))}
                        />
                    </Suspense>
                </div>
            </div>

            {/* 3. CONSOLIDATION PAR RÉGION */}
            <div style={{ marginBottom: '40px' }}>
                <h3>📍 Consolidation par Région</h3>
                <div className="admin-table-wrapper" style={{ marginTop: '16px' }}>
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Région</th>
                                <th>Départements</th>
                                <th>Population</th>
                                <th>Inscrits</th>
                                <th>Taux d'Enrôlement</th>
                                <th>Poids Électoral</th>
                            </tr>
                        </thead>
                        <tbody>
                            {regions.map((region) => {
                                const pop = region.departments.reduce((s, d) => s + (d.population || 0), 0);
                                const voters = region.departments.reduce((s, d) => s + (d.registered_voters || 0), 0);
                                const rate = (voters / (pop || 1)) * 100;
                                if (pop === 0) return null;
                                return (
                                    <tr key={region.id}>
                                        <td style={{ fontWeight: 'bold' }}>{region.name}</td>
                                        <td>{region.dept_count}</td>
                                        <td>{pop.toLocaleString()}</td>
                                        <td>{voters.toLocaleString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.8rem' }}>{rate.toFixed(1)}%</span>
                                                <div className="progress-bg" style={{ height: '6px', flex: 1, background: '#30363d', borderRadius: '3px' }}>
                                                    <div className="progress-fill" style={{
                                                        height: '100%', width: `${rate}%`,
                                                        background: rate > 40 ? 'var(--accent-green)' : 'var(--accent-yellow)',
                                                        borderRadius: '3px',
                                                    }}></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{((voters / (totalVoters || 1)) * 100).toFixed(1)}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 4. IMPORT CSV */}
            <div className="config-card" style={{ padding: '0', marginBottom: '30px' }}>
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <h3 style={{ margin: 0 }}>📥 Import de Données Officielles (CSV)</h3>
                    <button
                        className="admin-action-btn"
                        style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                        onClick={() => {
                            const token = localStorage.getItem('token');
                            window.open(`${API_URL}/admin/import/template?token=${token}`, '_blank');
                        }}
                    >
                        📄 Télécharger le Template CSV
                    </button>
                </div>
                <div style={{ padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Source des données</label>
                            <input
                                className="admin-input"
                                id="csv-source-name"
                                placeholder="Ex: BUCREP RGPH-4 2026, ELECAM oct 2025..."
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Année</label>
                                <input className="admin-input" id="csv-data-year" type="number" defaultValue={2025} style={{ width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Fiabilité</label>
                                <select className="admin-input" id="csv-confidence" style={{ width: '100%', padding: '8px' }}>
                                    <option value="official">🟢 Officiel</option>
                                    <option value="estimated">🟡 Estimé</option>
                                    <option value="unverified">🔴 Non vérifié</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            border: '2px dashed var(--border-color)', borderRadius: '12px', padding: '30px',
                            textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                            background: 'var(--bg-secondary)',
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.background = 'rgba(56,139,253,0.05)'; }}
                        onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                        onDrop={async (e) => {
                            e.preventDefault();
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.background = 'var(--bg-secondary)';
                            const file = e.dataTransfer.files[0];
                            if (!file || !file.name.endsWith('.csv')) { alert('Fichier CSV requis'); return; }
                            const formData = new FormData();
                            formData.append('file', file);
                            formData.append('source_name', (document.getElementById('csv-source-name') as HTMLInputElement)?.value || 'Import CSV');
                            formData.append('data_year', (document.getElementById('csv-data-year') as HTMLInputElement)?.value || '2025');
                            formData.append('data_confidence', (document.getElementById('csv-confidence') as HTMLSelectElement)?.value || 'official');
                            const token = localStorage.getItem('token');
                            const res = await fetch(`${API_URL}/admin/import/demographics`, {
                                method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
                            });
                            const data = await res.json();
                            if (res.ok) {
                                alert(`✅ Import réussi !\n${data.updated} départements mis à jour\n${data.failed} échecs`);
                                fetchRegions();
                            } else {
                                alert(`❌ Erreur : ${data.error}`);
                            }
                        }}
                        onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.csv';
                            input.onchange = async (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (!file) return;
                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('source_name', (document.getElementById('csv-source-name') as HTMLInputElement)?.value || 'Import CSV');
                                formData.append('data_year', (document.getElementById('csv-data-year') as HTMLInputElement)?.value || '2025');
                                formData.append('data_confidence', (document.getElementById('csv-confidence') as HTMLSelectElement)?.value || 'official');
                                const token = localStorage.getItem('token');
                                const res = await fetch(`${API_URL}/admin/import/demographics`, {
                                    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
                                });
                                const data = await res.json();
                                if (res.ok) {
                                    alert(`✅ Import réussi !\n${data.updated} départements mis à jour\n${data.failed} échecs`);
                                    fetchRegions();
                                } else {
                                    alert(`❌ Erreur : ${data.error}`);
                                }
                            };
                            input.click();
                        }}
                    >
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📁</div>
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Glissez un fichier CSV ici ou cliquez pour sélectionner</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Format : <code>code,population,registered_voters,data_source</code>
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. FOCUS DÉPARTEMENTS (édition inline) */}
            <div className="intelligence-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
                <div className="config-card" style={{ padding: '0' }}>
                    <div style={{
                        padding: '20px', borderBottom: '1px solid var(--border-color)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <h3 style={{ margin: 0 }}>📋 Focus Départements (Zones d'Analyse)</h3>
                        <small>Cliquez sur ✏️ pour mettre à jour les statistiques ELECAM</small>
                    </div>
                    <div className="admin-table-wrapper">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Département</th>
                                    <th>Code</th>
                                    <th>Fiabilité</th>
                                    <th>Population</th>
                                    <th>Inscrits</th>
                                    <th>Taux (%)</th>
                                    <th>Indice Risque</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {regions.flatMap((r) => r.departments)
                                    .filter((d) => d.population > 0)
                                    .sort((a, b) => b.population - a.population)
                                    .map((dept) => {
                                        const isEditing = editingDeptId === dept.id;
                                        const enrolmentRate = (dept.registered_voters / dept.population) * 100;
                                        const riskIndex = enrolmentRate < 30 ? 7.5 : (enrolmentRate > 60 ? 2.1 : 4.8);
                                        const confidence = (dept as { data_confidence?: string }).data_confidence || 'estimated';
                                        const source = (dept as { data_source?: string }).data_source || '';
                                        return (
                                            <tr key={dept.id}>
                                                <td>{dept.name}</td>
                                                <td><code>{dept.code}</code></td>
                                                <td>
                                                    <span
                                                        title={source || (confidence === 'official' ? 'Source officielle' : confidence === 'estimated' ? 'Estimation' : 'Non vérifié')}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600,
                                                            background: confidence === 'official' ? 'rgba(46,160,67,0.15)' : confidence === 'estimated' ? 'rgba(210,153,34,0.15)' : 'rgba(248,81,73,0.15)',
                                                            color: confidence === 'official' ? '#3fb950' : confidence === 'estimated' ? '#d29922' : '#f85149',
                                                        }}
                                                    >
                                                        {confidence === 'official' ? '🟢 Officiel' : confidence === 'estimated' ? '🟡 Estimé' : '🔴 Non vérifié'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            className="admin-input"
                                                            type="number"
                                                            value={deptDraft.population}
                                                            onChange={(e) => setDeptDraft({ ...deptDraft, population: Number(e.target.value) })}
                                                            style={{ width: '100px', fontSize: '0.8rem' }}
                                                        />
                                                    ) : (
                                                        <>
                                                            <div style={{ fontSize: '0.85rem' }}>{dept.population.toLocaleString()}</div>
                                                            <div className="progress-bg" style={{ height: '4px', width: '100px', background: '#30363d', borderRadius: '2px', marginTop: '4px' }}>
                                                                <div className="progress-fill" style={{
                                                                    height: '100%', width: `${Math.min(100, (dept.population / 4200000) * 100)}%`,
                                                                    background: 'var(--accent-blue)', borderRadius: '2px',
                                                                }}></div>
                                                            </div>
                                                        </>
                                                    )}
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            className="admin-input"
                                                            type="number"
                                                            value={deptDraft.registered_voters}
                                                            onChange={(e) => setDeptDraft({ ...deptDraft, registered_voters: Number(e.target.value) })}
                                                            style={{ width: '100px', fontSize: '0.8rem' }}
                                                        />
                                                    ) : (
                                                        <>
                                                            <div style={{ fontSize: '0.85rem' }}>
                                                                {dept.registered_voters.toLocaleString()} ({enrolmentRate.toFixed(1)}%)
                                                            </div>
                                                            <div className="progress-bg" style={{ height: '4px', width: '100px', background: '#30363d', borderRadius: '2px', marginTop: '4px' }}>
                                                                <div className="progress-fill" style={{
                                                                    height: '100%', width: `${enrolmentRate}%`,
                                                                    background: enrolmentRate < 40 ? 'var(--accent-red)' : 'var(--accent-green)',
                                                                    borderRadius: '2px',
                                                                }}></div>
                                                            </div>
                                                        </>
                                                    )}
                                                </td>
                                                <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>{enrolmentRate.toFixed(1)}%</td>
                                                <td style={{
                                                    fontWeight: 600,
                                                    color: riskIndex > 7 ? 'var(--accent-red)' : (riskIndex > 4 ? 'var(--accent-yellow)' : 'var(--accent-green)'),
                                                }}>
                                                    {riskIndex} / 10
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button className="admin-primary-btn" onClick={() => handleUpdateDeptData(dept)} title="Enregistrer">💾</button>
                                                            <button className="admin-cancel-btn" onClick={() => setEditingDeptId(null)} title="Annuler">❌</button>
                                                        </div>
                                                    ) : (
                                                        <button className="admin-btn" onClick={() => {
                                                            setEditingDeptId(dept.id);
                                                            setDeptDraft({ population: dept.population, registered_voters: dept.registered_voters });
                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                        }} title="Modifier les données">✏️</button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}