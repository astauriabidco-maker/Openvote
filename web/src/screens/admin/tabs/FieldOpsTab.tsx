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

function splitLocation(locationName: string): { region: string; department: string; arrondissement: string; locality: string } {
    const [region = '', department = '', arrondissement = '', ...localityParts] = locationName
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);
    return { region, department, arrondissement, locality: localityParts.join(' / ') };
}

function formatNumber(value: number): string {
    return value.toLocaleString('fr-FR');
}

function shortHash(value: string): string {
    if (!value) return '—';
    return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function priorityLabel(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

type GeoBucket = {
    key: string;
    label: string;
    totalStations: number;
    registeredVoters: number;
    assignedStations: number;
    submittedPV: number;
    observerCount?: number;
};

type SourceBucket = {
    slug: string;
    hash: string;
    totalStations: number;
    registeredVoters: number;
};

type PriorityZone = GeoBucket & {
    coverageRate: number;
    priority: 'critical' | 'high' | 'medium';
    priorityLabel: string;
    reason: string;
};

type PriorityDisplayZone = {
    key: string;
    label: string;
    scope: string;
    totalStations: number;
    assignedStations: number;
    submittedPV: number;
    observerCount: number;
    coverageRate: number;
    priorityLabel: string;
    priorityClass: string;
};

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
    const [stationDepartmentFilter, setStationDepartmentFilter] = useState('');
    const [stationArrondissementFilter, setStationArrondissementFilter] = useState('');
    const [stationSourceFilter, setStationSourceFilter] = useState('');
    const [stationSearch, setStationSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [importingStations, setImportingStations] = useState(false);
    const [importingCandidates, setImportingCandidates] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [bulkAssigning, setBulkAssigning] = useState(false);

    const selectedElection = elections.find((e) => e.id === selectedElectionId);
    const observers = useMemo(() => users.filter((u) => ['observer', 'local_coord'].includes(u.role)), [users]);
    const stationsWithGeo = useMemo(() => {
        return stations.map((station) => ({
            ...station,
            geo: splitLocation(station.location_name || ''),
        }));
    }, [stations]);
    const stationRegions = useMemo(() => {
        return Array.from(new Set(stationsWithGeo.map((station) => station.geo.region).filter(Boolean))).sort();
    }, [stationsWithGeo]);
    const stationDepartments = useMemo(() => {
        return Array.from(new Set(stationsWithGeo
            .filter((station) => !stationRegionFilter || station.geo.region === stationRegionFilter)
            .map((station) => station.geo.department)
            .filter(Boolean))).sort();
    }, [stationRegionFilter, stationsWithGeo]);
    const stationArrondissements = useMemo(() => {
        return Array.from(new Set(stationsWithGeo
            .filter((station) => !stationRegionFilter || station.geo.region === stationRegionFilter)
            .filter((station) => !stationDepartmentFilter || station.geo.department === stationDepartmentFilter)
            .map((station) => station.geo.arrondissement)
            .filter(Boolean))).sort();
    }, [stationDepartmentFilter, stationRegionFilter, stationsWithGeo]);
    const stationSources = useMemo(() => {
        return Array.from(new Set(stationsWithGeo.map((station) => station.source_document_slug).filter(Boolean))).sort();
    }, [stationsWithGeo]);
    const filteredStations = useMemo(() => {
        const query = stationSearch.trim().toLowerCase();
        return stationsWithGeo.filter((station) => {
            const matchesRegion = !stationRegionFilter || station.geo.region === stationRegionFilter;
            const matchesDepartment = !stationDepartmentFilter || station.geo.department === stationDepartmentFilter;
            const matchesArrondissement = !stationArrondissementFilter || station.geo.arrondissement === stationArrondissementFilter;
            const matchesSource = !stationSourceFilter || station.source_document_slug === stationSourceFilter;
            const searchable = `${station.code} ${station.name} ${station.location_name} ${station.geo.region} ${station.geo.department} ${station.geo.arrondissement} ${station.region_id} ${station.department_id} ${station.arrondissement_id} ${station.source_document_slug} ${station.source_sha256}`.toLowerCase();
            const matchesText = !query || searchable.includes(query);
            return matchesRegion && matchesDepartment && matchesArrondissement && matchesSource && matchesText;
        });
    }, [stationArrondissementFilter, stationDepartmentFilter, stationRegionFilter, stationSearch, stationSourceFilter, stationsWithGeo]);
    const regionSummary = useMemo<GeoBucket[]>(() => {
        const buckets = new Map<string, GeoBucket>();
        stationsWithGeo.forEach((station) => {
            const key = station.geo.region || station.region_id || 'Non renseignée';
            const bucket = buckets.get(key) || {
                key,
                label: key,
                totalStations: 0,
                registeredVoters: 0,
                assignedStations: 0,
                submittedPV: 0,
            };
            bucket.totalStations += 1;
            bucket.registeredVoters += station.registered_voters || 0;
            buckets.set(key, bucket);
        });
        (coverage?.regions || []).forEach((region) => {
            const key = region.region_name || region.region_id || 'Non renseignée';
            const bucket = buckets.get(key) || {
                key,
                label: key,
                totalStations: region.total_stations,
                registeredVoters: 0,
                assignedStations: 0,
                submittedPV: 0,
            };
            bucket.assignedStations = region.assigned_stations;
            bucket.submittedPV = region.submitted_pv;
            bucket.observerCount = region.observer_count;
            buckets.set(key, bucket);
        });
        return Array.from(buckets.values()).sort((a, b) => b.totalStations - a.totalStations);
    }, [coverage?.regions, stationsWithGeo]);
    const departmentSummary = useMemo<GeoBucket[]>(() => {
        const buckets = new Map<string, GeoBucket>();
        filteredStations.forEach((station) => {
            const key = [station.geo.region, station.geo.department].filter(Boolean).join(' / ') || station.department_id || 'Non renseigné';
            const bucket = buckets.get(key) || {
                key,
                label: key,
                totalStations: 0,
                registeredVoters: 0,
                assignedStations: 0,
                submittedPV: 0,
            };
            bucket.totalStations += 1;
            bucket.registeredVoters += station.registered_voters || 0;
            buckets.set(key, bucket);
        });
        return Array.from(buckets.values()).sort((a, b) => b.totalStations - a.totalStations);
    }, [filteredStations]);
    const arrondissementSummary = useMemo<GeoBucket[]>(() => {
        const buckets = new Map<string, GeoBucket>();
        filteredStations.forEach((station) => {
            const key = [station.geo.department, station.geo.arrondissement].filter(Boolean).join(' / ') || station.arrondissement_id || 'Non renseigné';
            const bucket = buckets.get(key) || {
                key,
                label: key,
                totalStations: 0,
                registeredVoters: 0,
                assignedStations: 0,
                submittedPV: 0,
            };
            bucket.totalStations += 1;
            bucket.registeredVoters += station.registered_voters || 0;
            buckets.set(key, bucket);
        });
        return Array.from(buckets.values()).sort((a, b) => b.totalStations - a.totalStations);
    }, [filteredStations]);
    const sourceSummary = useMemo<SourceBucket[]>(() => {
        const buckets = new Map<string, SourceBucket>();
        stationsWithGeo.forEach((station) => {
            const slug = station.source_document_slug || 'Non renseignée';
            const bucket = buckets.get(slug) || {
                slug,
                hash: station.source_sha256 || '',
                totalStations: 0,
                registeredVoters: 0,
            };
            bucket.totalStations += 1;
            bucket.registeredVoters += station.registered_voters || 0;
            if (!bucket.hash && station.source_sha256) bucket.hash = station.source_sha256;
            buckets.set(slug, bucket);
        });
        return Array.from(buckets.values()).sort((a, b) => b.totalStations - a.totalStations);
    }, [stationsWithGeo]);
    const priorityZones = useMemo<PriorityZone[]>(() => {
        const coverageByRegion = new Map((coverage?.regions || []).map((region) => [
            region.region_name || region.region_id || 'Non renseignée',
            region,
        ]));
        const buckets = new Map<string, GeoBucket>();
        const useRegionalCoverageTotals = !stationDepartmentFilter
            && !stationArrondissementFilter
            && !stationSourceFilter
            && !stationSearch.trim();

        filteredStations.forEach((station) => {
            const key = station.geo.region || station.region_id || 'Non renseignée';
            const bucket = buckets.get(key) || {
                key,
                label: key,
                totalStations: 0,
                registeredVoters: 0,
                assignedStations: 0,
                submittedPV: 0,
            };
            bucket.totalStations += 1;
            bucket.registeredVoters += station.registered_voters || 0;
            buckets.set(key, bucket);
        });

        return Array.from(buckets.values())
            .map((bucket) => {
                const regionCoverage = coverageByRegion.get(bucket.label);
                const totalStations = useRegionalCoverageTotals
                    ? (regionCoverage?.total_stations ?? bucket.totalStations)
                    : bucket.totalStations;
                const assignedStations = regionCoverage?.assigned_stations ?? bucket.assignedStations;
                const submittedPV = regionCoverage?.submitted_pv ?? bucket.submittedPV;
                const coverageRate = totalStations > 0 ? submittedPV / totalStations : 0;
                const observerCount = regionCoverage?.observer_count;
                let priority: PriorityZone['priority'] = 'medium';
                let priorityLabel = 'À renforcer';
                let reason = 'Couverture faible';

                if (submittedPV === 0) {
                    priority = bucket.totalStations >= 100 ? 'critical' : 'high';
                    priorityLabel = bucket.totalStations >= 100 ? 'Critique' : 'Haute';
                    reason = assignedStations === 0 ? '0 PV et aucun bureau assigné' : '0 PV reçu';
                } else if (coverageRate < 0.1) {
                    priority = 'high';
                    priorityLabel = 'Haute';
                    reason = 'Moins de 10 % de PV reçus';
                } else if (coverageRate < 0.25 || assignedStations === 0) {
                    reason = assignedStations === 0 ? 'Aucune affectation active' : 'Moins de 25 % de PV reçus';
                }

                return {
                    ...bucket,
                    totalStations,
                    assignedStations,
                    submittedPV,
                    observerCount,
                    coverageRate,
                    priority,
                    priorityLabel,
                    reason,
                };
            })
            .filter((zone) => zone.submittedPV === 0 || zone.coverageRate < 0.25 || zone.assignedStations === 0)
            .sort((a, b) => {
                const priorityRank = { critical: 0, high: 1, medium: 2 };
                return priorityRank[a.priority] - priorityRank[b.priority]
                    || b.totalStations - a.totalStations
                    || a.label.localeCompare(b.label);
            })
            .slice(0, 10);
    }, [coverage?.regions, filteredStations, stationArrondissementFilter, stationDepartmentFilter, stationSearch, stationSourceFilter]);
    const visibleSelectedCount = filteredStations.filter((station) => selectedStationIds.has(station.id)).length;
    const selectedStationCount = selectedStationIds.size;
    const allVisibleSelected = filteredStations.length > 0 && visibleSelectedCount === filteredStations.length;
    const totalStations = coverage?.total_stations ?? stations.length;
    const totalRegisteredVoters = stations.reduce((sum, station) => sum + (station.registered_voters || 0), 0);
    const auditedStations = stations.filter((station) => station.source_document_slug && station.source_sha256).length;
    const displayPriorityZones = useMemo<PriorityDisplayZone[]>(() => {
        const backendZones = coverage?.silent_zones || [];
        const stationScopedFilterActive = Boolean(stationSourceFilter || stationSearch.trim());
        const visibleBackendZones = backendZones.filter((zone) => {
            const matchesRegion = !stationRegionFilter || zone.region_name === stationRegionFilter || zone.region_id === stationRegionFilter;
            const matchesDepartment = !stationDepartmentFilter || zone.department_name === stationDepartmentFilter || zone.department_id === stationDepartmentFilter;
            const matchesArrondissement = !stationArrondissementFilter || zone.arrondissement_name === stationArrondissementFilter || zone.arrondissement_id === stationArrondissementFilter;
            return matchesRegion && matchesDepartment && matchesArrondissement;
        });

        if (!stationScopedFilterActive && visibleBackendZones.length > 0) {
            return visibleBackendZones
                .map((zone) => {
                    const zoneName = zone.zone_type === 'arrondissement'
                        ? [zone.region_name, zone.department_name, zone.arrondissement_name].filter(Boolean).join(' / ')
                        : [zone.region_name, zone.department_name].filter(Boolean).join(' / ');
                    const normalizedPriority = zone.priority_label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const priorityClass = normalizedPriority.includes('critique') || normalizedPriority.includes('critical')
                        ? 'critical'
                        : normalizedPriority.includes('haute') || normalizedPriority.includes('high') || normalizedPriority.includes('silencieuse')
                            ? 'high'
                            : 'medium';
                    return {
                        key: `${zone.zone_type}-${zone.department_id}-${zone.arrondissement_id}`,
                        label: zoneName || 'Non renseignée',
                        scope: zone.zone_type === 'arrondissement' ? 'Arrondissement' : 'Département',
                        totalStations: zone.total_stations,
                        assignedStations: zone.assigned_stations,
                        submittedPV: zone.submitted_pv,
                        observerCount: zone.observer_count,
                        coverageRate: zone.coverage_rate,
                        priorityLabel: priorityLabel(zone.priority_label),
                        priorityClass,
                    };
                })
                .slice(0, 12);
        }

        return priorityZones.map((zone) => ({
            key: zone.key,
            label: zone.label,
            scope: 'Région visible',
            totalStations: zone.totalStations,
            assignedStations: zone.assignedStations,
            submittedPV: zone.submittedPV,
            observerCount: zone.observerCount ?? 0,
            coverageRate: zone.coverageRate,
            priorityLabel: zone.priorityLabel,
            priorityClass: zone.priority,
        }));
    }, [coverage?.silent_zones, priorityZones, stationArrondissementFilter, stationDepartmentFilter, stationRegionFilter, stationSearch, stationSourceFilter]);

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

    useEffect(() => {
        setStationDepartmentFilter('');
        setStationArrondissementFilter('');
    }, [stationRegionFilter]);

    useEffect(() => {
        setStationArrondissementFilter('');
    }, [stationDepartmentFilter]);

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
        { label: 'Bureaux', value: totalStations },
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
                <section className="fieldops-panel fieldops-reference-panel">
                    <div className="fieldops-section-head">
                        <div>
                            <h3>Référentiel ELECAM 2025</h3>
                            <p className="fieldops-help">Bureaux officiels regroupés par découpage administratif.</p>
                        </div>
                        <span className="fieldops-source-badge">Source vérifiée</span>
                    </div>
                    <div className="fieldops-reference-kpis">
                        <div>
                            <strong>{formatNumber(totalStations)}</strong>
                            <span>Bureaux</span>
                        </div>
                        <div>
                            <strong>{formatNumber(totalRegisteredVoters)}</strong>
                            <span>Inscrits</span>
                        </div>
                        <div>
                            <strong>{formatNumber(auditedStations)}</strong>
                            <span>Auditables</span>
                        </div>
                    </div>
                    <div className="fieldops-mini-table">
                        {regionSummary.slice(0, 10).map((region) => (
                            <div key={region.key} className="fieldops-mini-row">
                                <span>{region.label}</span>
                                <strong>{formatNumber(region.totalStations)}</strong>
                                <small>{formatNumber(region.registeredVoters)} inscrits</small>
                            </div>
                        ))}
                    </div>
                    <div className="fieldops-source-summary">
                        {sourceSummary.slice(0, 9).map((source) => (
                            <button
                                key={source.slug}
                                className={source.slug === stationSourceFilter ? 'active' : ''}
                                type="button"
                                onClick={() => setStationSourceFilter((current) => current === source.slug ? '' : source.slug)}
                            >
                                <span>{source.slug}</span>
                                <strong>{formatNumber(source.totalStations)}</strong>
                                <small>{shortHash(source.hash)}</small>
                            </button>
                        ))}
                    </div>
                </section>

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

            <section className="fieldops-panel fieldops-priority-panel">
                <div className="fieldops-section-head">
                    <div>
                        <h3>Zones silencieuses / priorité terrain</h3>
                        <p className="fieldops-help">Zones visibles avec 0 PV reçu, faible couverture ou aucune affectation.</p>
                    </div>
                    <span className="fieldops-source-badge">{formatNumber(displayPriorityZones.length)} priorité(s)</span>
                </div>
                <div className="fieldops-priority-table">
                    <div className="fieldops-priority-head">
                        <span>Zone</span>
                        <span>Priorité</span>
                        <span>Bureaux</span>
                        <span>Assignés</span>
                        <span>PV</span>
                        <span>Couverture</span>
                    </div>
                    {displayPriorityZones.map((zone) => (
                        <div key={zone.key} className={`fieldops-priority-row priority-${zone.priorityClass}`}>
                            <span>
                                <strong>{zone.label}</strong>
                                <small>{zone.scope}</small>
                            </span>
                            <span className={`fieldops-priority-badge priority-${zone.priorityClass}`}>
                                {zone.priorityLabel}
                            </span>
                            <span>{formatNumber(zone.totalStations)}</span>
                            <span>{formatNumber(zone.assignedStations)}</span>
                            <span>{formatNumber(zone.submittedPV)}</span>
                            <span>
                                <strong>{percent(zone.coverageRate)}</strong>
                                <small>{formatNumber(zone.observerCount)} observateur(s)</small>
                            </span>
                        </div>
                    ))}
                    {displayPriorityZones.length === 0 && (
                        <p className="fieldops-help">Aucune zone silencieuse ou faiblement couverte dans les filtres actifs.</p>
                    )}
                </div>
            </section>

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
                            {stationRegions.map((region) => (
                                <option key={region} value={region}>{region}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Département</label>
                        <select className="admin-select" value={stationDepartmentFilter} onChange={(e) => setStationDepartmentFilter(e.target.value)}>
                            <option value="">Tous</option>
                            {stationDepartments.map((department) => (
                                <option key={department} value={department}>{department}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Arrondissement</label>
                        <select className="admin-select" value={stationArrondissementFilter} onChange={(e) => setStationArrondissementFilter(e.target.value)}>
                            <option value="">Tous</option>
                            {stationArrondissements.map((arrondissement) => (
                                <option key={arrondissement} value={arrondissement}>{arrondissement}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Source</label>
                        <select className="admin-select" value={stationSourceFilter} onChange={(e) => setStationSourceFilter(e.target.value)}>
                            <option value="">Toutes</option>
                            {stationSources.map((source) => (
                                <option key={source} value={source}>{source}</option>
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
                        <span>Département</span>
                        <span>Arrond.</span>
                        <span>Inscrits</span>
                        <span>Lieu</span>
                        <span>Preuve</span>
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
                            <span>{station.geo.region || '—'}</span>
                            <span>{station.geo.department || '—'}</span>
                            <span>{station.geo.arrondissement || '—'}</span>
                            <span>{station.registered_voters ? formatNumber(station.registered_voters) : '—'}</span>
                            <span>{station.geo.locality || station.location_name || '—'}</span>
                            <span className="fieldops-source-proof">
                                <strong>{station.source_document_slug || '—'}</strong>
                                <small>
                                    {station.source_position ? `ligne ${station.source_position}` : 'ligne —'}
                                    {' · '}
                                    {shortHash(station.source_sha256 || '')}
                                </small>
                            </span>
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
                    <h3>Bureaux par département</h3>
                    <div className="fieldops-table">
                        <div className="fieldops-table-head fieldops-geo-grid">
                            <span>Département</span><span>Bureaux</span><span>Inscrits</span>
                        </div>
                        {departmentSummary.slice(0, 20).map((department) => (
                            <div key={department.key} className="fieldops-table-row fieldops-geo-grid">
                                <span>{department.label}</span>
                                <span>{formatNumber(department.totalStations)}</span>
                                <span>{formatNumber(department.registeredVoters)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="fieldops-panel">
                    <h3>Bureaux par arrondissement</h3>
                    <div className="fieldops-table">
                        <div className="fieldops-table-head fieldops-geo-grid">
                            <span>Arrondissement</span><span>Bureaux</span><span>Inscrits</span>
                        </div>
                        {arrondissementSummary.slice(0, 20).map((arrondissement) => (
                            <div key={arrondissement.key} className="fieldops-table-row fieldops-geo-grid">
                                <span>{arrondissement.label}</span>
                                <span>{formatNumber(arrondissement.totalStations)}</span>
                                <span>{formatNumber(arrondissement.registeredVoters)}</span>
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
