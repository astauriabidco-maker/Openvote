import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from './constants';
import { getPendingPVs, type DecryptedPV } from './offlineManager';
import type {
    ElectionData,
    ElectionResultSummary,
    PublicPVExportProof,
    PublicPVProof,
    PublicPVProofExport,
} from './types';

interface ParallelCountDashboardProps {
    token: string;
    refreshKey?: number;
}

function safeExportFilePart(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'election';
}

export default function ParallelCountDashboard({ token, refreshKey = 0 }: ParallelCountDashboardProps) {
    const apiClient = useMemo(() => axios.create({
        baseURL: API_URL,
        headers: { Authorization: `Bearer ${token}` },
    }), [token]);

    const [elections, setElections] = useState<ElectionData[]>([]);
    const [electionId, setElectionId] = useState('');
    const [summary, setSummary] = useState<ElectionResultSummary | null>(null);
    const [publicProofs, setPublicProofs] = useState<PublicPVProof[]>([]);
    const [publicExport, setPublicExport] = useState<PublicPVProofExport | null>(null);
    const [publicExportProof, setPublicExportProof] = useState<PublicPVExportProof | null>(null);
    const [pendingPVs, setPendingPVs] = useState<DecryptedPV[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const selectedElection = elections.find((e) => e.id === electionId);
    const topVotes = Math.max(...(summary?.results || []).map((r) => r.total_votes), 1);

    const loadElections = useCallback(async () => {
        const res = await apiClient.get('/elections');
        const list = res.data.elections || [];
        setElections(list);
        if (!electionId) {
            const active = list.find((e: ElectionData) => e.status === 'active') || list[0];
            if (active) setElectionId(active.id);
        }
    }, [apiClient, electionId]);

    const loadSummary = useCallback(async () => {
        if (!electionId) return;
        setLoading(true);
        setError('');
        try {
            const [summaryRes, publicRes, localPVs] = await Promise.all([
                apiClient.get(`/pv-summary?election_id=${electionId}`),
                axios.get(`${API_URL}/public/pv-proofs?election_id=${encodeURIComponent(electionId)}`),
                getPendingPVs(),
            ]);
            setSummary(summaryRes.data.summary);
            setPublicProofs(publicRes.data.export?.pv_proofs || publicRes.data.pv_proofs || []);
            setPublicExport(publicRes.data.export || null);
            setPublicExportProof(publicRes.data.export_proof || null);
            setPendingPVs(localPVs.filter((pv) => pv.election_id === electionId && pv.status !== 'synced'));
        } catch {
            setError('Impossible de charger le comptage parallèle.');
        } finally {
            setLoading(false);
        }
    }, [apiClient, electionId]);

    useEffect(() => {
        loadElections().catch(() => setError('Impossible de charger les scrutins.'));
    }, [loadElections]);

    useEffect(() => {
        loadSummary();
    }, [loadSummary, refreshKey]);

    const localVotes = pendingPVs.reduce((sum, pv) => {
        return sum + pv.results.reduce((inner, result) => inner + result.votes, 0);
    }, 0);
    const trustedProofs = publicProofs.filter((proof) => proof.integrity_status === 'trusted').length;
    const anomalousProofs = publicProofs.filter((proof) => (proof.anomalies || []).length > 0).length;

    const exportPublicProofs = () => {
        if (!publicExport || !publicExportProof) return;
        const payload = {
            exported_by_client_at: new Date().toISOString(),
            election_name: selectedElection?.name || '',
            source_endpoint: `/public/pv-proofs?election_id=${encodeURIComponent(electionId)}`,
            export: publicExport,
            export_proof: publicExportProof,
            pv_proofs: publicExport.pv_proofs || publicProofs,
            total: publicExport.total ?? publicProofs.length,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openvote-public-proof-${safeExportFilePart(selectedElection?.name || electionId)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <section className="parallel-dashboard">
            <div className="parallel-topbar">
                <div>
                    <h2>Comptage parallèle</h2>
                    <p>{selectedElection?.name || 'Sélectionne un scrutin'}</p>
                </div>
                <div className="parallel-actions">
                    <select value={electionId} onChange={(e) => setElectionId(e.target.value)}>
                        <option value="">Scrutin</option>
                        {elections.map((election) => (
                            <option key={election.id} value={election.id}>{election.name}</option>
                        ))}
                    </select>
                    <button type="button" onClick={loadSummary} disabled={loading}>
                        {loading ? '...' : 'Actualiser'}
                    </button>
                    <button type="button" onClick={exportPublicProofs} disabled={!publicExport || !publicExportProof}>
                        Télécharger le paquet vérifiable
                    </button>
                </div>
            </div>

            {error && <div className="pv-alert error">{error}</div>}

            <div className="parallel-kpis">
                <div>
                    <span>{summary?.total_stations ?? 0}</span>
                    <small>Bureaux</small>
                </div>
                <div>
                    <span>{summary?.submitted_pv ?? 0}</span>
                    <small>PV reçus</small>
                </div>
                <div>
                    <span>{Math.round((summary?.coverage_rate ?? 0) * 100)}%</span>
                    <small>Couverture</small>
                </div>
                <div>
                    <span>{summary?.total_voters ?? 0}</span>
                    <small>Votants compilés</small>
                </div>
                <div>
                    <span>{pendingPVs.length}</span>
                    <small>PV locaux</small>
                </div>
                <div>
                    <span>{trustedProofs}</span>
                    <small>Preuves OK</small>
                </div>
                <div>
                    <span>{anomalousProofs}</span>
                    <small>Anomalies preuve</small>
                </div>
            </div>

            <div className="parallel-export-proof">
                <div>
                    <span>Hash export</span>
                    <code>{publicExportProof?.export_hash ? `${publicExportProof.export_hash.slice(0, 24)}...` : '-'}</code>
                </div>
                <div>
                    <span>Signature serveur</span>
                    <code>{publicExportProof?.signature ? `${publicExportProof.signature.slice(0, 24)}...` : '-'}</code>
                </div>
                <div>
                    <span>Clé publique</span>
                    <code>{publicExportProof?.public_key ? `${publicExportProof.public_key.slice(0, 24)}...` : '-'}</code>
                </div>
            </div>

            <div className="parallel-layout">
                <div className="parallel-results">
                    <h3>Résultats consolidés</h3>
                    {(summary?.results || []).map((result) => (
                        <div key={result.candidate_id} className="parallel-result-row">
                            <div className="parallel-result-label">
                                <strong>{result.candidate_name}</strong>
                                <small>{result.party || 'Sans parti'} · {result.pv_count} PV</small>
                            </div>
                            <div className="parallel-result-bar">
                                <span style={{ width: `${(result.total_votes / topVotes) * 100}%` }} />
                            </div>
                            <b>{result.total_votes}</b>
                        </div>
                    ))}
                    {(!summary || summary.results.length === 0) && (
                        <p className="pv-muted">Aucun résultat candidat synchronisé pour ce scrutin.</p>
                    )}
                </div>

                <div className="parallel-local">
                    <h3>File offline</h3>
                    <p className="parallel-local-total">{localVotes} voix dans les PV non synchronisés</p>
                    <div className="parallel-pending-list">
                        {pendingPVs.slice(0, 8).map((pv) => (
                            <div key={pv.id} className="parallel-pending-item">
                                <strong>{pv.polling_station_code}</strong>
                                <span>{pv.polling_station_name}</span>
                                <small>{pv.status} · {pv.voters_count} votants</small>
                            </div>
                        ))}
                        {pendingPVs.length === 0 && <p className="pv-muted">Aucun PV local en attente.</p>}
                    </div>
                </div>
            </div>

            <div className="parallel-public-proofs">
                <div className="parallel-section-head">
                    <h3>Preuves publiques vérifiables</h3>
                    <span>{publicProofs.length} PV publiés</span>
                </div>
                <div className="parallel-proof-table">
                    <div className="parallel-proof-head">
                        <span>Bureau</span>
                        <span>Statut</span>
                        <span>Intégrité</span>
                        <span>Hash photo</span>
                        <span>Hash serveur</span>
                        <span>Anom.</span>
                    </div>
                    {publicProofs.slice(0, 80).map((proof) => (
                        <div key={proof.id} className="parallel-proof-row">
                            <span>
                                <strong>{proof.polling_station_code || proof.polling_station_id}</strong>
                                <small>{proof.polling_station_name || proof.polling_station_region || 'Bureau publié'}</small>
                            </span>
                            <span>{proof.status}</span>
                            <span>{proof.integrity_status || '-'}</span>
                            <code>{proof.pv_hash ? `${proof.pv_hash.slice(0, 14)}...` : '-'}</code>
                            <code>{proof.server_payload_hash ? `${proof.server_payload_hash.slice(0, 14)}...` : '-'}</code>
                            <span className={(proof.anomalies || []).length > 0 ? 'parallel-proof-danger' : ''}>{(proof.anomalies || []).length}</span>
                        </div>
                    ))}
                    {publicProofs.length === 0 && (
                        <p className="pv-muted">Aucune preuve publique publiée pour ce scrutin.</p>
                    )}
                </div>
            </div>
        </section>
    );
}
