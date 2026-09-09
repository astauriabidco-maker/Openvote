import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand, type KPIItem } from '../components/TabHeader';
import type {
    AdminUser,
    Candidate,
    ElectionData,
    FieldCoverageSummary,
    PollingStation,
} from '../../../types';

function percent(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function getHTTPStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('response' in error)) return undefined;
    return (error as { response?: { status?: number } }).response?.status;
}

export default function FieldOpsTab({ state }: { state: AdminPanelState }) {
    const { apiClient, elections, users, fetchElections, fetchUsers, notify } = state;
    const [selectedElectionId, setSelectedElectionId] = useState('');
    const [stations, setStations] = useState<PollingStation[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [coverage, setCoverage] = useState<FieldCoverageSummary | null>(null);
    const [stationFile, setStationFile] = useState<File | null>(null);
    const [candidateFile, setCandidateFile] = useState<File | null>(null);
    const [assignmentStationId, setAssignmentStationId] = useState('');
    const [assignmentObserverId, setAssignmentObserverId] = useState('');
    const [bulkObserverId, setBulkObserverId] = useState('');
    const [selectedStationIds, setSelectedStationIds] = useState<Set<string>>(new Set());
    const [stationRegionFilter, setStationRegionFilter] = useState('');
    const [stationSearch, setStationSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [importingStations, setImportingStations] = useState(false);
    const [importingCandidates, setImportingCandidates] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [bulkAssigning, setBulkAssigning] = useState(false);

    const selectedElection = elections.find((e) => e.id === selectedElectionId);
    const observers = useMemo(() => users.filter((u) => ['observer', 'local_coord'].includes(u.role)), [users]);
    const stationRegions = useMemo(() => {
        return Array.from(new Set(stations.map((station) => station.region_id).filter(Boolean))).sort();
    }, [stations]);
    const filteredStations = useMemo(() => {
        const query = stationSearch.trim().toLowerCase();
        return stations.filter((station) => {
            const matchesRegion = !stationRegionFilter || station.region_id === stationRegionFilter;
            const searchable = `${station.code} ${station.name} ${station.location_name} ${station.region_id} ${station.department_id} ${station.arrondissement_id}`.toLowerCase();
            const matchesText = !query || searchable.includes(query);
            return matchesRegion && matchesText;
        });
    }, [stationRegionFilter, stationSearch, stations]);
    const visibleSelectedCount = filteredStations.filter((station) => selectedStationIds.has(station.id)).length;
    const selectedStationCount = selectedStationIds.size;
    const allVisibleSelected = filteredStations.length > 0 && visibleSelectedCount === filteredStations.length;

    const loadFieldData = useCallback(async () => {
        if (!selectedElectionId) return;
        setLoading(true);
        try {
            const [stationRes, candidateRes, coverageRes] = await Promise.all([
                apiClient.get(`/polling-stations?election_id=${selectedElectionId}`),
                apiClient.get(`/candidates?election_id=${selectedElectionId}`),
                apiClient.get(`/admin/field-coverage?election_id=${selectedElectionId}`),
            ]);
            setStations(stationRes.data.polling_stations || []);
            setCandidates(candidateRes.data.candidates || []);
            setCoverage(coverageRes.data.coverage);
        } catch {
            notify('error', 'Impossible de charger les données terrain.');
        } finally {
            setLoading(false);
        }
    }, [apiClient, notify, selectedElectionId]);

    useEffect(() => {
        if (elections.length === 0) {
            fetchElections();
        } else if (!selectedElectionId) {
            const active = elections.find((e: ElectionData) => e.status === 'active') || elections[0];
            setSelectedElectionId(active.id);
        }
    }, [elections, fetchElections, selectedElectionId]);

    useEffect(() => {
        if (users.length === 0) fetchUsers();
    }, [fetchUsers, users.length]);

    useEffect(() => {
        loadFieldData();
    }, [loadFieldData]);

    useEffect(() => {
        const knownStationIds = new Set(stations.map((station) => station.id));
        setSelectedStationIds((current) => new Set(Array.from(current).filter((id) => knownStationIds.has(id))));
    }, [stations]);

    const uploadCSV = async (kind: 'stations' | 'candidates') => {
        if (!selectedElectionId) {
            notify('error', 'Choisissez un scrutin.');
            return;
        }
        const file = kind === 'stations' ? stationFile : candidateFile;
        if (!file) {
            notify('error', 'Sélectionnez un fichier CSV.');
            return;
        }
        const setImporting = kind === 'stations' ? setImportingStations : setImportingCandidates;
        setImporting(true);
        try {
            const form = new FormData();
            form.append('election_id', selectedElectionId);
            form.append('file', file);
            const url = kind === 'stations'
                ? '/admin/polling-stations/import-csv'
                : '/admin/candidates/import-csv';
            const res = await apiClient.post(url, form);
            notify('success', `${res.data.imported} ligne(s) importée(s), ${res.data.failed} échec(s).`);
            if (kind === 'stations') setStationFile(null);
            if (kind === 'candidates') setCandidateFile(null);
            await loadFieldData();
        } catch {
            notify('error', 'Import CSV impossible.');
        } finally {
            setImporting(false);
        }
    };

    const assignStation = async () => {
        if (!selectedElectionId || !assignmentStationId || !assignmentObserverId) {
            notify('error', 'Scrutin, bureau et observateur sont requis.');
            return;
        }
        setAssigning(true);
        try {
            await apiClient.post('/admin/polling-station-assignments', {
                election_id: selectedElectionId,
                polling_station_id: assignmentStationId,
                observer_id: assignmentObserverId,
            });
            notify('success', 'Bureau assigné à l’observateur.');
            await loadFieldData();
        } catch {
            notify('error', 'Affectation impossible.');
        } finally {
            setAssigning(false);
        }
    };

    const toggleStationSelection = (stationId: string) => {
        setSelectedStationIds((current) => {
            const next = new Set(current);
            if (next.has(stationId)) next.delete(stationId);
            else next.add(stationId);
            return next;
        });
    };

    const toggleVisibleStations = () => {
        setSelectedStationIds((current) => {
            const next = new Set(current);
            if (allVisibleSelected) {
                filteredStations.forEach((station) => next.delete(station.id));
            } else {
                filteredStations.forEach((station) => next.add(station.id));
            }
            return next;
        });
    };

    const clearStationSelection = () => {
        setSelectedStationIds(new Set());
    };

    const assignSelectedStations = async () => {
        const pollingStationIds = Array.from(selectedStationIds);
        if (!selectedElectionId || pollingStationIds.length === 0 || !bulkObserverId) {
            notify('error', 'Scrutin, sélection de bureaux et observateur sont requis.');
            return;
        }

        setBulkAssigning(true);
        try {
            try {
                await apiClient.post('/admin/polling-station-assignments/bulk', {
                    election_id: selectedElectionId,
                    observer_id: bulkObserverId,
                    polling_station_ids: pollingStationIds,
                });
            } catch (error) {
                const status = getHTTPStatus(error);
                if (![404, 405, 501].includes(status ?? 0)) throw error;
                await Promise.all(pollingStationIds.map((pollingStationId) => apiClient.post('/admin/polling-station-assignments', {
                    election_id: selectedElectionId,
                    polling_station_id: pollingStationId,
                    observer_id: bulkObserverId,
                })));
            }

            notify('success', `${pollingStationIds.length} bureau(x) assigné(s).`);
            clearStationSelection();
            await loadFieldData();
        } catch {
            notify('error', 'Affectation en masse impossible.');
        } finally {
            setBulkAssigning(false);
        }
    };

    const kpis: KPIItem[] = [
        { label: 'Bureaux', value: coverage?.total_stations ?? stations.length },
        { label: 'Assignés', value: coverage?.assigned_stations ?? 0, valueColor: 'var(--color-accent)' },
        { label: 'Candidats', value: candidates.length, valueColor: 'var(--color-text-primary)' },
        { label: 'Sans observateur', value: coverage?.unassigned_stations ?? 0, valueColor: 'var(--color-warning)' },
        { label: 'PV reçus', value: coverage?.submitted_pv ?? 0, valueColor: 'var(--color-success)' },
        { label: 'Couverture', value: percent(coverage?.coverage_rate ?? 0), valueColor: 'var(--color-purple)' },
    ];

    return (
        <div className="admin-section fieldops-tab">
            <TabHeader
                title="🧾 Terrain & PV"
                subtitle={selectedElection ? `${selectedElection.name} · ${observers.length} observateur(s) mobilisables` : 'Import, affectations et couverture terrain'}
                actions={<button className="admin-refresh-btn" onClick={loadFieldData} disabled={loading}>🔄 Actualiser</button>}
            >
                <KPIBand items={kpis} />
            </TabHeader>

            <div className="fieldops-controls">
                <div className="form-group">
                    <label>Scrutin</label>
                    <select className="admin-select" value={selectedElectionId} onChange={(e) => setSelectedElectionId(e.target.value)}>
                        <option value="">Sélectionner</option>
                        {elections.map((election) => (
                            <option key={election.id} value={election.id}>{election.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="fieldops-grid">
                <section className="fieldops-panel">
                    <h3>Importer les listes ELECAM</h3>
                    <p className="fieldops-help">Bureaux CSV: code, name, region_id, department_id, arrondissement_id, registered_voters, location_name, latitude, longitude</p>
                    <div className="fieldops-import-row">
                        <input className="admin-input" type="file" accept=".csv,text/csv" onChange={(e) => setStationFile(e.target.files?.[0] ?? null)} />
                        <button className="admin-primary-btn" onClick={() => uploadCSV('stations')} disabled={importingStations}>
                            {importingStations ? 'Import...' : 'Importer bureaux'}
                        </button>
                    </div>
                    <p className="fieldops-help">Candidats CSV: name, party, ballot_number</p>
                    <div className="fieldops-import-row">
                        <input className="admin-input" type="file" accept=".csv,text/csv" onChange={(e) => setCandidateFile(e.target.files?.[0] ?? null)} />
                        <button className="admin-primary-btn" onClick={() => uploadCSV('candidates')} disabled={importingCandidates}>
                            {importingCandidates ? 'Import...' : 'Importer candidats'}
                        </button>
                    </div>
                </section>

                <section className="fieldops-panel">
                    <h3>Affecter un bureau</h3>
                    <div className="form-group">
                        <label>Bureau</label>
                        <select className="admin-select" value={assignmentStationId} onChange={(e) => setAssignmentStationId(e.target.value)}>
                            <option value="">Sélectionner</option>
                            {stations.map((station) => (
                                <option key={station.id} value={station.id}>{station.code} · {station.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Observateur</label>
                        <select className="admin-select" value={assignmentObserverId} onChange={(e) => setAssignmentObserverId(e.target.value)}>
                            <option value="">Sélectionner</option>
                            {observers.map((user: AdminUser) => (
                                <option key={user.id} value={user.id}>{user.username} · {user.role}</option>
                            ))}
                        </select>
                    </div>
                    <button className="admin-primary-btn" onClick={assignStation} disabled={assigning}>
                        {assigning ? 'Affectation...' : 'Affecter'}
                    </button>
                </section>
            </div>

            <section className="fieldops-panel fieldops-stations-panel">
                <div className="fieldops-section-head">
                    <div>
                        <h3>Affectation en masse</h3>
                        <p className="fieldops-help">{filteredStations.length} bureau(x) affiché(s), {selectedStationCount} sélectionné(s).</p>
                    </div>
                    <button className="admin-refresh-btn" onClick={clearStationSelection} disabled={selectedStationCount === 0}>Effacer</button>
                </div>

                <div className="fieldops-bulk-controls">
                    <div className="form-group">
                        <label>Rechercher</label>
                        <input
                            className="admin-input"
                            value={stationSearch}
                            onChange={(e) => setStationSearch(e.target.value)}
                            placeholder="Code, nom, lieu..."
                        />
                    </div>
                    <div className="form-group">
                        <label>Région</label>
                        <select className="admin-select" value={stationRegionFilter} onChange={(e) => setStationRegionFilter(e.target.value)}>
                            <option value="">Toutes</option>
                            {stationRegions.map((regionId) => (
                                <option key={regionId} value={regionId}>{regionId}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Observateur</label>
                        <select className="admin-select" value={bulkObserverId} onChange={(e) => setBulkObserverId(e.target.value)}>
                            <option value="">Sélectionner</option>
                            {observers.map((user: AdminUser) => (
                                <option key={user.id} value={user.id}>{user.username} · {user.role}</option>
                            ))}
                        </select>
                    </div>
                    <button className="admin-primary-btn fieldops-bulk-action" onClick={assignSelectedStations} disabled={bulkAssigning || selectedStationCount === 0 || !bulkObserverId}>
                        {bulkAssigning ? 'Affectation...' : `Assigner ${selectedStationCount || ''}`}
                    </button>
                </div>

                <div className="fieldops-station-table">
                    <div className="fieldops-station-head">
                        <label className="fieldops-check">
                            <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleVisibleStations}
                                disabled={filteredStations.length === 0}
                            />
                            <span>Sélection</span>
                        </label>
                        <span>Bureau</span>
                        <span>Région</span>
                        <span>Inscrits</span>
                        <span>Lieu</span>
                    </div>
                    {filteredStations.slice(0, 250).map((station) => (
                        <div key={station.id} className="fieldops-station-row">
                            <label className="fieldops-check">
                                <input
                                    type="checkbox"
                                    checked={selectedStationIds.has(station.id)}
                                    onChange={() => toggleStationSelection(station.id)}
                                />
                                <span>{selectedStationIds.has(station.id) ? 'Oui' : 'Non'}</span>
                            </label>
                            <span>
                                <strong>{station.code}</strong>
                                <small>{station.name}</small>
                            </span>
                            <span>{station.region_id || '—'}</span>
                            <span>{station.registered_voters?.toLocaleString('fr-FR') ?? '—'}</span>
                            <span>{station.location_name || '—'}</span>
                        </div>
                    ))}
                    {filteredStations.length > 250 && (
                        <p className="fieldops-help">Affichage limité aux 250 premiers bureaux filtrés. Affinez la recherche pour une affectation plus ciblée.</p>
                    )}
                    {filteredStations.length === 0 && (
                        <p className="fieldops-help">Aucun bureau ne correspond aux filtres.</p>
                    )}
                </div>
            </section>

            <div className="fieldops-grid fieldops-grid-wide">
                <section className="fieldops-panel">
                    <h3>Couverture par région</h3>
                    <div className="fieldops-table">
                        <div className="fieldops-table-head">
                            <span>Région</span><span>Bureaux</span><span>Assignés</span><span>PV</span><span>Couverture</span>
                        </div>
                        {(coverage?.regions || []).map((region) => (
                            <div key={region.region_id || region.region_name} className="fieldops-table-row">
                                <span>{region.region_name}</span>
                                <span>{region.total_stations}</span>
                                <span>{region.assigned_stations}</span>
                                <span>{region.submitted_pv}</span>
                                <span>{percent(region.coverage_rate)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="fieldops-panel">
                    <h3>Couverture par observateur</h3>
                    <div className="fieldops-table">
                        <div className="fieldops-table-head fieldops-observer-grid">
                            <span>Observateur</span><span>Assignés</span><span>PV</span><span>Taux</span>
                        </div>
                        {(coverage?.observers || []).map((observer) => (
                            <div key={observer.observer_id} className="fieldops-table-row fieldops-observer-grid">
                                <span>{observer.observer_name}</span>
                                <span>{observer.assigned_stations}</span>
                                <span>{observer.submitted_pv}</span>
                                <span>{percent(observer.completion_rate)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
