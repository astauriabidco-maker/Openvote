import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from './constants';
import {
    cacheData,
    getCachedData,
    getPendingPVs,
    savePVOffline,
    syncPendingPVs,
    type DecryptedPV,
    type PVResultInput,
} from './offlineManager';
import {
    buildPVProofManifest,
    ensureDeviceKeyRegistered,
    getOrCreateDeviceId,
    hashPVProofManifest,
    readDeviceCoordinates,
    sha256HexBytes,
    signPVProofManifest,
} from './pvProof';
import type { Candidate, ElectionData, PollingStation } from './types';

interface PVOfflineFormProps {
    token: string;
    isOnline: boolean;
    onPVSubmitted?: () => void;
}

async function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export default function PVOfflineForm({ token, isOnline, onPVSubmitted }: PVOfflineFormProps) {
    const apiClient = useMemo(() => axios.create({
        baseURL: API_URL,
        headers: { Authorization: `Bearer ${token}` },
    }), [token]);

    const [elections, setElections] = useState<ElectionData[]>([]);
    const [stations, setStations] = useState<PollingStation[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [pendingPVs, setPendingPVs] = useState<DecryptedPV[]>([]);
    const [electionId, setElectionId] = useState('');
    const [stationId, setStationId] = useState('');
    const [registeredVoters, setRegisteredVoters] = useState(0);
    const [votersCount, setVotersCount] = useState(0);
    const [nullVotes, setNullVotes] = useState(0);
    const [blankVotes, setBlankVotes] = useState(0);
    const [disputedVotes, setDisputedVotes] = useState(0);
    const [notes, setNotes] = useState('');
    const [pvPhotoData, setPVPhotoData] = useState<string | undefined>();
    const [pvHash, setPVHash] = useState('');
    const [votesByCandidate, setVotesByCandidate] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    const selectedElection = elections.find((e) => e.id === electionId);
    const selectedStation = stations.find((s) => s.id === stationId);
    const candidateVotesTotal = candidates.reduce((sum, c) => sum + (votesByCandidate[c.id] || 0), 0);
    const ballotTotal = candidateVotesTotal + nullVotes + blankVotes + disputedVotes;
    const isOverTotal = ballotTotal > votersCount;

    const refreshPending = async () => {
        try {
            setPendingPVs((await getPendingPVs()).filter((pv) => pv.status !== 'synced'));
        } catch {
            setPendingPVs([]);
        }
    };

    useEffect(() => {
        async function loadElections() {
            const cacheKey = 'pv:elections';
            try {
                const res = await apiClient.get('/elections');
                const list = res.data.elections || [];
                setElections(list);
                await cacheData(cacheKey, list);
                const active = list.find((e: ElectionData) => e.status === 'active') || list[0];
                if (active) setElectionId(active.id);
            } catch {
                const cached = await getCachedData<ElectionData[]>(cacheKey);
                if (cached?.length) {
                    setElections(cached);
                    const active = cached.find((e) => e.status === 'active') || cached[0];
                    if (active) setElectionId(active.id);
                    setMessage({ type: 'info', text: 'Scrutins chargés depuis le cache offline.' });
                } else {
                    setMessage({ type: 'error', text: 'Impossible de charger les scrutins.' });
                }
            }
        }
        loadElections();
        refreshPending();
    }, [apiClient]);

    useEffect(() => {
        if (!electionId) return;
        async function loadElectionData() {
            const stationsCacheKey = `pv:my-stations:${electionId}`;
            const candidatesCacheKey = `pv:candidates:${electionId}`;
            try {
                const [stationRes, candidateRes] = await Promise.all([
                    apiClient.get(`/my-polling-stations?election_id=${electionId}`),
                    apiClient.get(`/candidates?election_id=${electionId}`),
                ]);
                const stationList = stationRes.data.polling_stations || [];
                const candidateList = candidateRes.data.candidates || [];
                setStations(stationList);
                setCandidates(candidateList);
                await Promise.all([
                    cacheData(stationsCacheKey, stationList),
                    cacheData(candidatesCacheKey, candidateList),
                ]);
                setStationId('');
                setVotesByCandidate({});
            } catch {
                const [cachedStations, cachedCandidates] = await Promise.all([
                    getCachedData<PollingStation[]>(stationsCacheKey),
                    getCachedData<Candidate[]>(candidatesCacheKey),
                ]);
                if (cachedStations || cachedCandidates) {
                    setStations(cachedStations || []);
                    setCandidates(cachedCandidates || []);
                    setMessage({ type: 'info', text: 'Bureaux et candidats chargés depuis le cache offline.' });
                } else {
                    setMessage({ type: 'error', text: 'Impossible de charger les bureaux ou candidats.' });
                }
            }
        }
        loadElectionData();
    }, [apiClient, electionId]);

    useEffect(() => {
        if (selectedStation) {
            setRegisteredVoters(selectedStation.registered_voters || 0);
        }
    }, [selectedStation]);

    const handlePhoto = async (file?: File) => {
        if (!file) return;
        const data = await fileToDataURL(file);
        const bytes = await file.arrayBuffer();
        setPVPhotoData(data);
        setPVHash(await sha256HexBytes(bytes));
    };

    const reset = () => {
        setStationId('');
        setRegisteredVoters(0);
        setVotersCount(0);
        setNullVotes(0);
        setBlankVotes(0);
        setDisputedVotes(0);
        setNotes('');
        setPVPhotoData(undefined);
        setPVHash('');
        setVotesByCandidate({});
    };

    const submit = async () => {
        if (!selectedElection || !selectedStation) {
            setMessage({ type: 'error', text: 'Choisis un scrutin et un bureau de vote.' });
            return;
        }
        if (candidates.length === 0) {
            setMessage({ type: 'error', text: 'Aucun candidat configuré pour ce scrutin.' });
            return;
        }
        if (isOverTotal) {
            setMessage({ type: 'error', text: 'La somme des bulletins dépasse le nombre de votants.' });
            return;
        }

        setLoading(true);
        try {
            const results: PVResultInput[] = candidates.map((candidate) => ({
                candidate_id: candidate.id,
                candidate_name: candidate.name,
                party: candidate.party,
                votes: votesByCandidate[candidate.id] || 0,
            }));
            const clientRecordedAt = new Date().toISOString();
            const coordinates = await readDeviceCoordinates();
            const deviceId = isOnline ? await ensureDeviceKeyRegistered(apiClient) : getOrCreateDeviceId();
            const proofInput = {
                election_id: electionId,
                polling_station_id: stationId,
                registered_voters: registeredVoters,
                voters_count: votersCount,
                null_votes: nullVotes,
                blank_votes: blankVotes,
                disputed_votes: disputedVotes,
                pv_hash: pvHash,
                client_recorded_at: clientRecordedAt,
                device_latitude: coordinates.latitude,
                device_longitude: coordinates.longitude,
                device_id: deviceId,
                results,
            };
            const canonicalPayload = JSON.stringify(buildPVProofManifest(proofInput));
            const signedPayloadHash = await hashPVProofManifest(proofInput);
            const signature = isOnline ? await signPVProofManifest(canonicalPayload) : '';

            await savePVOffline({
                election_id: electionId,
                election_name: selectedElection.name,
                polling_station_id: stationId,
                polling_station_code: selectedStation.code,
                polling_station_name: selectedStation.name,
                registered_voters: registeredVoters,
                voters_count: votersCount,
                null_votes: nullVotes,
                blank_votes: blankVotes,
                disputed_votes: disputedVotes,
                pv_photo_data: pvPhotoData,
                pv_hash: pvHash,
                signed_payload_hash: signedPayloadHash,
                signature,
                proof_manifest_version: 1,
                client_recorded_at: clientRecordedAt,
                device_latitude: coordinates.latitude,
                device_longitude: coordinates.longitude,
                device_id: deviceId,
                notes,
                results,
            });

            let syncText = 'PV sauvegardé localement.';
            if (isOnline) {
                const result = await syncPendingPVs(API_URL);
                if (result.synced > 0) syncText = `${result.synced} PV synchronisé(s).`;
            }
            setMessage({ type: 'success', text: syncText });
            reset();
            await refreshPending();
            onPVSubmitted?.();
        } catch (err) {
            setMessage({ type: 'error', text: `Erreur PV: ${String(err)}` });
        } finally {
            setLoading(false);
        }
    };

    const syncNow = async () => {
        if (!isOnline) {
            setMessage({ type: 'error', text: 'Connexion requise pour synchroniser les PV.' });
            return;
        }
        setSyncing(true);
        try {
            const result = await syncPendingPVs(API_URL);
            setMessage({ type: 'success', text: `${result.synced} PV synchronisé(s), ${result.failed} échec(s).` });
            await refreshPending();
            onPVSubmitted?.();
        } catch {
            setMessage({ type: 'error', text: 'Erreur de synchronisation PV.' });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <section className="pv-form-shell">
            <div className="pv-form-toolbar">
                <div>
                    <h2>PV terrain</h2>
                    <p>{isOnline ? 'En ligne' : 'Hors ligne'} · {pendingPVs.length} PV en attente</p>
                </div>
                <button type="button" className="pv-secondary-btn" onClick={syncNow} disabled={syncing || !pendingPVs.length}>
                    {syncing ? 'Sync...' : 'Synchroniser'}
                </button>
            </div>

            {message && <div className={`pv-alert ${message.type}`}>{message.text}</div>}

            <div className="pv-form-grid">
                <label>
                    Scrutin
                    <select value={electionId} onChange={(e) => setElectionId(e.target.value)}>
                        <option value="">Sélectionner</option>
                        {elections.map((election) => (
                            <option key={election.id} value={election.id}>{election.name}</option>
                        ))}
                    </select>
                </label>

                <label>
                    Bureau de vote
                    <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
                        <option value="">Sélectionner</option>
                        {stations.map((station) => (
                            <option key={station.id} value={station.id}>{station.code} · {station.name}</option>
                        ))}
                    </select>
                </label>
                {electionId && stations.length === 0 && (
                    <p className="pv-empty-assignment">
                        Aucun bureau assigné pour ce scrutin. Un coordinateur doit affecter ce compte à un bureau.
                    </p>
                )}

                <label>
                    Inscrits
                    <input type="number" min="0" value={registeredVoters} onChange={(e) => setRegisteredVoters(Number(e.target.value))} />
                </label>

                <label>
                    Votants
                    <input type="number" min="0" value={votersCount} onChange={(e) => setVotersCount(Number(e.target.value))} />
                </label>

                <label>
                    Nuls
                    <input type="number" min="0" value={nullVotes} onChange={(e) => setNullVotes(Number(e.target.value))} />
                </label>

                <label>
                    Blancs
                    <input type="number" min="0" value={blankVotes} onChange={(e) => setBlankVotes(Number(e.target.value))} />
                </label>

                <label>
                    Contestés
                    <input type="number" min="0" value={disputedVotes} onChange={(e) => setDisputedVotes(Number(e.target.value))} />
                </label>

                <label>
                    Photo du PV
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhoto(e.target.files?.[0])} />
                </label>
            </div>

            <div className="pv-results-entry">
                <div className="pv-section-header">
                    <h3>Résultats candidats</h3>
                    <span className={isOverTotal ? 'pv-total danger' : 'pv-total'}>
                        Total bulletins: {ballotTotal} / {votersCount}
                    </span>
                </div>
                {candidates.map((candidate) => (
                    <label key={candidate.id} className="pv-candidate-row">
                        <span>
                            <strong>{candidate.name}</strong>
                            {candidate.party && <small>{candidate.party}</small>}
                        </span>
                        <input
                            type="number"
                            min="0"
                            value={votesByCandidate[candidate.id] || 0}
                            onChange={(e) => setVotesByCandidate((prev) => ({ ...prev, [candidate.id]: Number(e.target.value) }))}
                        />
                    </label>
                ))}
                {candidates.length === 0 && <p className="pv-muted">Configure d’abord les candidats dans l’administration.</p>}
            </div>

            <label className="pv-notes">
                Notes
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </label>

            {pvHash && <p className="pv-hash">Hash photo: {pvHash.slice(0, 18)}...</p>}

            <button type="button" className="pv-primary-btn" onClick={submit} disabled={loading || isOverTotal}>
                {loading ? 'Sauvegarde...' : 'Sauvegarder le PV'}
            </button>
        </section>
    );
}
