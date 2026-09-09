import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand, type KPIItem } from '../components/TabHeader';
import type {
    ElectionData,
    PVAnomaly,
    PVAuditEvent,
    PVResult,
    PVVerificationItem,
    PVVerificationStatus,
} from '../../../types';

const STATUS_OPTIONS = [
    { value: '', label: 'Tous les statuts' },
    { value: 'submitted', label: 'À vérifier' },
    { value: 'pending', label: 'En attente' },
    { value: 'needs_clarification', label: 'Clarification' },
    { value: 'verified', label: 'Validés' },
    { value: 'rejected', label: 'Rejetés' },
] as const;

const STATUS_LABELS: Record<string, string> = {
    submitted: 'À vérifier',
    pending: 'En attente',
    needs_clarification: 'Clarification',
    verified: 'Validé',
    rejected: 'Rejeté',
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
    submitted: 'Soumission terrain',
    verification_decision: 'Décision admin',
};

function toArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
}

function getHTTPStatus(error: unknown): number | undefined {
    return (error as AxiosError | undefined)?.response?.status;
}

function normalizePV(raw: unknown): PVVerificationItem {
    const item = raw as PVVerificationItem & {
        polling_station?: { code?: string; name?: string; region_id?: string };
        observer?: { username?: string; name?: string };
    };
    return {
        ...item,
        polling_station_code: item.polling_station_code || item.polling_station?.code,
        polling_station_name: item.polling_station_name || item.polling_station?.name,
        polling_station_region: item.polling_station_region || item.polling_station?.region_id,
        observer_name: item.observer_name || item.observer_username || item.observer?.username || item.observer?.name,
        anomalies: toArray<PVAnomaly>(item.anomalies),
    };
}

function extractPVs(data: unknown): PVVerificationItem[] {
    const payload = data as {
        pv_submissions?: unknown[];
        pvs?: unknown[];
        items?: unknown[];
        data?: unknown[];
    };
    return toArray<unknown>(payload.pv_submissions || payload.pvs || payload.items || payload.data).map(normalizePV);
}

function extractAuditEvents(data: unknown): PVAuditEvent[] {
    const payload = data as {
        audit_events?: unknown[];
        events?: unknown[];
        items?: unknown[];
        data?: unknown[];
    };
    return toArray<PVAuditEvent>(payload.audit_events || payload.events || payload.items || payload.data);
}

function totalCandidateVotes(results?: PVResult[]): number {
    return (results || []).reduce((sum, result) => sum + (Number(result.votes) || 0), 0);
}

function fallbackAnomalies(pv: PVVerificationItem): PVAnomaly[] {
    if (pv.anomalies && pv.anomalies.length > 0) return pv.anomalies;

    const anomalies: PVAnomaly[] = [];
    const candidateVotes = pv.total_candidate_votes ?? totalCandidateVotes(pv.results);
    const expressedTotal = candidateVotes + (pv.blank_votes || 0) + (pv.null_votes || 0);

    if (pv.voters_count > 0 && expressedTotal > 0 && expressedTotal !== pv.voters_count) {
        anomalies.push({
            code: 'totals_mismatch',
            severity: 'high',
            message: 'Total candidats + blancs + nuls différent du nombre de votants.',
            expected: pv.voters_count,
            actual: expressedTotal,
        });
    }

    if (pv.registered_voters > 0 && pv.voters_count > pv.registered_voters) {
        anomalies.push({
            code: 'voters_above_registered',
            severity: 'critical',
            message: 'Le nombre de votants dépasse les inscrits du bureau.',
            expected: pv.registered_voters,
            actual: pv.voters_count,
        });
    }

    if (pv.registered_voters > 0 && pv.voters_count / pv.registered_voters >= 0.98) {
        anomalies.push({
            code: 'very_high_turnout',
            severity: 'medium',
            message: 'Participation très élevée à vérifier.',
            actual: `${Math.round((pv.voters_count / pv.registered_voters) * 100)}%`,
        });
    }

    return anomalies;
}

function statusClass(status: PVVerificationStatus): string {
    if (status === 'verified') return 'verified';
    if (status === 'rejected') return 'rejected';
    if (status === 'needs_clarification') return 'clarification';
    return 'pending';
}

function integrityLabel(status?: string): string {
    switch (status) {
        case 'trusted': return 'Hash + signature OK';
        case 'hash_verified_unsigned': return 'Hash OK, signature absente';
        case 'hash_mismatch': return 'Hash divergent';
        case 'incomplete': return 'Preuve incomplète';
        default: return status || 'Non vérifié';
    }
}

function formatDate(value?: string): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function percent(numerator: number, denominator: number): string {
    if (denominator <= 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

export default function PVVerificationTab({ state }: { state: AdminPanelState }) {
    const { apiClient, elections, fetchElections, notify } = state;
    const [selectedElectionId, setSelectedElectionId] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [pvs, setPVs] = useState<PVVerificationItem[]>([]);
    const [selectedPVId, setSelectedPVId] = useState('');
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [acting, setActing] = useState(false);
    const [apiUnavailable, setAPIUnavailable] = useState(false);
    const [auditEvents, setAuditEvents] = useState<PVAuditEvent[]>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);

    const enrichedPVs = useMemo(() => {
        return pvs.map((pv) => ({
            ...pv,
            anomalies: fallbackAnomalies(pv),
        }));
    }, [pvs]);

    const selectedElection = elections.find((e) => e.id === selectedElectionId);
    const selectedPV = enrichedPVs.find((pv) => pv.id === selectedPVId) || enrichedPVs[0];

    const filteredPVs = useMemo(() => {
        return enrichedPVs.filter((pv) => !statusFilter || pv.status === statusFilter);
    }, [enrichedPVs, statusFilter]);

    const stats = useMemo(() => {
        const open = enrichedPVs.filter((pv) => !['verified', 'rejected'].includes(pv.status)).length;
        const verified = enrichedPVs.filter((pv) => pv.status === 'verified').length;
        const rejected = enrichedPVs.filter((pv) => pv.status === 'rejected').length;
        const anomalous = enrichedPVs.filter((pv) => (pv.anomalies || []).length > 0).length;
        return { open, verified, rejected, anomalous };
    }, [enrichedPVs]);

    const kpis: KPIItem[] = [
        { label: 'PV reçus', value: enrichedPVs.length },
        { label: 'À traiter', value: stats.open, valueColor: 'var(--color-warning)' },
        { label: 'Anomalies', value: stats.anomalous, valueColor: 'var(--color-danger)' },
        { label: 'Validés', value: stats.verified, valueColor: 'var(--color-success)' },
        { label: 'Rejetés', value: stats.rejected, valueColor: 'var(--color-danger)' },
        { label: 'Taux vérifié', value: percent(stats.verified, enrichedPVs.length), valueColor: 'var(--color-accent)' },
    ];

    const loadPVs = useCallback(async () => {
        if (!selectedElectionId) return;
        setLoading(true);
        setAPIUnavailable(false);
        try {
            const query = new URLSearchParams({ election_id: selectedElectionId });
            if (statusFilter) query.set('status', statusFilter);
            const response = await apiClient.get(`/admin/pv-review?${query.toString()}`);
            const items = extractPVs(response.data);
            setPVs(items);
            setSelectedPVId((current) => current && items.some((pv) => pv.id === current) ? current : items[0]?.id || '');
        } catch (error) {
            if ([404, 405, 501].includes(getHTTPStatus(error) ?? 0)) {
                setAPIUnavailable(true);
                setPVs([]);
            } else {
                notify('error', 'Impossible de charger les PV à vérifier.');
            }
        } finally {
            setLoading(false);
        }
    }, [apiClient, notify, selectedElectionId, statusFilter]);

    const loadPVAudit = useCallback(async (pvId: string) => {
        if (!pvId) {
            setAuditEvents([]);
            return;
        }
        setLoadingAudit(true);
        try {
            const response = await apiClient.get(`/admin/pv-review/${pvId}/audit`);
            setAuditEvents(extractAuditEvents(response.data));
        } catch (error) {
            if ([404, 405, 501, 503].includes(getHTTPStatus(error) ?? 0)) {
                setAuditEvents([]);
            } else {
                notify('error', 'Impossible de charger l’historique du PV.');
            }
        } finally {
            setLoadingAudit(false);
        }
    }, [apiClient, notify]);

    useEffect(() => {
        if (elections.length === 0) {
            fetchElections();
        } else if (!selectedElectionId) {
            const active = elections.find((e: ElectionData) => e.status === 'active') || elections[0];
            setSelectedElectionId(active.id);
        }
    }, [elections, fetchElections, selectedElectionId]);

    useEffect(() => {
        loadPVs();
    }, [loadPVs]);

    useEffect(() => {
        loadPVAudit(selectedPV?.id || '');
    }, [loadPVAudit, selectedPV?.id]);

    const updatePVStatus = async (nextStatus: 'verified' | 'rejected' | 'needs_clarification') => {
        if (!selectedPV) {
            notify('error', 'Sélectionnez un PV.');
            return;
        }
        if (nextStatus !== 'verified' && comment.trim().length < 3) {
            notify('error', 'Ajoutez un commentaire pour rejeter ou demander clarification.');
            return;
        }

        setActing(true);
        try {
            await apiClient.patch(`/admin/pv-review/${selectedPV.id}/status`, {
                status: nextStatus,
                comment: comment.trim(),
            });
            notify('success', `PV ${STATUS_LABELS[nextStatus].toLowerCase()}.`);
            setComment('');
            await loadPVs();
            await loadPVAudit(selectedPV.id);
        } catch {
            notify('error', 'Action indisponible côté API pour le moment.');
        } finally {
            setActing(false);
        }
    };

    return (
        <div className="admin-section pvverify-tab">
            <TabHeader
                title="✅ Vérification PV"
                subtitle={selectedElection ? `${selectedElection.name} · revue des PV et anomalies` : 'Revue des PV, anomalies et décisions admin'}
                actions={<button className="admin-refresh-btn" onClick={loadPVs} disabled={loading}>🔄 Actualiser</button>}
            >
                <KPIBand items={kpis} />
            </TabHeader>

            <div className="pvverify-controls">
                <div className="form-group">
                    <label>Scrutin</label>
                    <select className="admin-select" value={selectedElectionId} onChange={(e) => setSelectedElectionId(e.target.value)}>
                        <option value="">Sélectionner</option>
                        {elections.map((election) => (
                            <option key={election.id} value={election.id}>{election.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>Statut</label>
                    <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {apiUnavailable && (
                <div className="pvverify-notice">
                    L’endpoint de vérification PV n’est pas encore disponible. L’écran est prêt et se remplira dès que l’API renverra les PV.
                </div>
            )}

            <div className="pvverify-layout">
                <section className="pvverify-panel pvverify-list-panel">
                    <div className="pvverify-section-head">
                        <h3>PV à examiner</h3>
                        <span>{filteredPVs.length} résultat(s)</span>
                    </div>
                    <div className="pvverify-table">
                        <div className="pvverify-table-head">
                            <span>Bureau</span>
                            <span>Observateur</span>
                            <span>Votants</span>
                            <span>Anom.</span>
                            <span>Statut</span>
                        </div>
                        {filteredPVs.map((pv) => (
                            <button
                                key={pv.id}
                                type="button"
                                className={`pvverify-row ${selectedPV?.id === pv.id ? 'active' : ''}`}
                                onClick={() => setSelectedPVId(pv.id)}
                            >
                                <span>
                                    <strong>{pv.polling_station_code || pv.polling_station_id}</strong>
                                    <small>{pv.polling_station_name || pv.polling_station_region || 'Bureau non enrichi'}</small>
                                </span>
                                <span>{pv.observer_name || pv.observer_id || '-'}</span>
                                <span>{pv.voters_count?.toLocaleString('fr-FR') ?? '-'}</span>
                                <span className={(pv.anomalies || []).length > 0 ? 'pvverify-danger' : ''}>{(pv.anomalies || []).length}</span>
                                <span><mark className={`pvverify-status ${statusClass(pv.status)}`}>{STATUS_LABELS[pv.status] || pv.status}</mark></span>
                            </button>
                        ))}
                        {!loading && filteredPVs.length === 0 && (
                            <p className="pvverify-empty">Aucun PV ne correspond aux filtres.</p>
                        )}
                        {loading && <p className="pvverify-empty">Chargement des PV...</p>}
                    </div>
                </section>

                <section className="pvverify-panel pvverify-detail-panel">
                    {selectedPV ? (
                        <>
                            <div className="pvverify-section-head">
                                <div>
                                    <h3>{selectedPV.polling_station_code || 'PV sélectionné'}</h3>
                                    <p>{selectedPV.polling_station_name || selectedPV.polling_station_id}</p>
                                </div>
                                <mark className={`pvverify-status ${statusClass(selectedPV.status)}`}>{STATUS_LABELS[selectedPV.status] || selectedPV.status}</mark>
                            </div>

                            <div className="pvverify-metrics">
                                <div><span>Inscrits</span><strong>{selectedPV.registered_voters?.toLocaleString('fr-FR') ?? '-'}</strong></div>
                                <div><span>Votants</span><strong>{selectedPV.voters_count?.toLocaleString('fr-FR') ?? '-'}</strong></div>
                                <div><span>Blancs</span><strong>{selectedPV.blank_votes ?? 0}</strong></div>
                                <div><span>Nuls</span><strong>{selectedPV.null_votes ?? 0}</strong></div>
                                <div><span>Contestés</span><strong>{selectedPV.disputed_votes ?? 0}</strong></div>
                                <div><span>Soumis</span><strong>{formatDate(selectedPV.submitted_at)}</strong></div>
                                <div><span>Intégrité</span><strong>{integrityLabel(selectedPV.integrity_status)}</strong></div>
                                <div><span>Hash serveur</span><strong>{selectedPV.server_payload_hash ? `${selectedPV.server_payload_hash.slice(0, 12)}...` : '-'}</strong></div>
                                <div><span>Hash photo</span><strong>{selectedPV.pv_hash ? `${selectedPV.pv_hash.slice(0, 12)}...` : '-'}</strong></div>
                                <div><span>Photo PV</span><strong>{selectedPV.pv_photo_url || '-'}</strong></div>
                            </div>

                            <div className="pvverify-subsection">
                                <h4>Anomalies</h4>
                                {(selectedPV.anomalies || []).length > 0 ? (
                                    <div className="pvverify-anomaly-list">
                                        {(selectedPV.anomalies || []).map((anomaly, index) => (
                                            <div key={`${anomaly.code}-${index}`} className={`pvverify-anomaly ${anomaly.severity}`}>
                                                <strong>{anomaly.message}</strong>
                                                <small>{anomaly.code}{anomaly.actual !== undefined ? ` · valeur: ${anomaly.actual}` : ''}</small>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="pvverify-muted">Aucune anomalie signalée.</p>
                                )}
                            </div>

                            <div className="pvverify-subsection">
                                <h4>Résultats candidats</h4>
                                <div className="pvverify-results">
                                    {(selectedPV.results || []).map((result) => (
                                        <div key={result.id || result.candidate_id}>
                                            <span>{result.candidate_name || result.candidate_id}</span>
                                            <strong>{result.votes.toLocaleString('fr-FR')}</strong>
                                        </div>
                                    ))}
                                    {(selectedPV.results || []).length === 0 && (
                                        <p className="pvverify-muted">Résultats détaillés non fournis par l’API.</p>
                                    )}
                                </div>
                            </div>

                            <div className="pvverify-subsection">
                                <h4>Décision admin</h4>
                                <textarea
                                    className="admin-input pvverify-comment"
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Commentaire de validation, rejet ou clarification..."
                                />
                                <div className="pvverify-actions">
                                    <button className="admin-primary-btn" onClick={() => updatePVStatus('verified')} disabled={acting}>Valider</button>
                                    <button className="admin-refresh-btn pvverify-reject-btn" onClick={() => updatePVStatus('rejected')} disabled={acting}>Rejeter</button>
                                    <button className="admin-refresh-btn" onClick={() => updatePVStatus('needs_clarification')} disabled={acting}>Demander clarification</button>
                                </div>
                            </div>

                            <div className="pvverify-subsection">
                                <h4>Historique d’audit</h4>
                                <div className="pvverify-audit-list">
                                    {auditEvents.map((event) => (
                                        <div key={event.id} className="pvverify-audit-event">
                                            <div>
                                                <strong>{AUDIT_EVENT_LABELS[event.event_type] || event.event_type}</strong>
                                                <small>
                                                    {formatDate(event.created_at)}
                                                    {event.actor_role ? ` · ${event.actor_role}` : ''}
                                                    {event.actor_id ? ` · ${event.actor_id.slice(0, 8)}` : ''}
                                                </small>
                                            </div>
                                            <div className="pvverify-audit-meta">
                                                {(event.from_status || event.to_status) && (
                                                    <span>{event.from_status ? STATUS_LABELS[event.from_status] || event.from_status : 'Initial'} → {event.to_status ? STATUS_LABELS[event.to_status] || event.to_status : '-'}</span>
                                                )}
                                                <span>{integrityLabel(event.integrity_status)}</span>
                                                <span>{event.server_payload_hash ? `${event.server_payload_hash.slice(0, 12)}...` : 'Hash non lié'}</span>
                                            </div>
                                            {event.comment && <p>{event.comment}</p>}
                                        </div>
                                    ))}
                                    {!loadingAudit && auditEvents.length === 0 && (
                                        <p className="pvverify-muted">Aucun événement d’audit disponible pour ce PV.</p>
                                    )}
                                    {loadingAudit && <p className="pvverify-muted">Chargement de l’historique...</p>}
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="pvverify-empty">Sélectionnez un PV pour voir le détail.</p>
                    )}
                </section>
            </div>
        </div>
    );
}
