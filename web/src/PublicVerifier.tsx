import { useMemo, useState } from 'react';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { API_URL } from './constants';
import type { PublicPVExportProof, PublicPVProof, PublicPVProofExport, PublicRegionalRiskProof } from './types';

interface PublicVerifierProps {
    onBack?: () => void;
}

interface PublicExportPackage {
    export?: PublicPVProofExport;
    export_proof?: PublicPVExportProof;
    pv_proofs?: PublicPVProof[];
    regional_risks?: PublicRegionalRiskProof[];
}

interface VerificationResult {
    ok: boolean;
    hashOk: boolean;
    signatureOk: boolean;
    message: string;
    exportHash: string;
    verificationMethod: string;
}

function base64UrlToBytes(value: string): Uint8Array {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function hex(bytes: Uint8Array): string {
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyExportPackage(raw: string): Promise<VerificationResult> {
    const parsed = JSON.parse(raw) as PublicExportPackage;
    const exportProof = parsed.export_proof;
    const canonicalExport = exportProof?.canonical_export;
    if (!exportProof || !canonicalExport) {
        throw new Error('Le fichier ne contient pas export_proof.canonical_export.');
    }
    if (!exportProof.public_key || !exportProof.signature || !exportProof.export_hash) {
        throw new Error('Le fichier ne contient pas une preuve complète.');
    }

    const canonicalBytes = new TextEncoder().encode(canonicalExport);
    const digest = sha256(canonicalBytes);
    const exportHash = hex(digest);
    const hashOk = exportHash === exportProof.export_hash;
    const signature = base64UrlToBytes(exportProof.signature);
    const publicKeyBytes = base64UrlToBytes(exportProof.public_key);

    let signatureOk = false;
    let verificationMethod = 'WebCrypto Ed25519';
    try {
        const publicKey = await crypto.subtle.importKey(
            'raw',
            toArrayBuffer(publicKeyBytes),
            { name: 'Ed25519' } as AlgorithmIdentifier,
            false,
            ['verify'],
        );
        signatureOk = await crypto.subtle.verify(
            { name: 'Ed25519' } as AlgorithmIdentifier,
            publicKey,
            toArrayBuffer(signature),
            toArrayBuffer(digest),
        );
    } catch {
        verificationMethod = 'Fallback JS Ed25519';
        signatureOk = ed25519.verify(signature, digest, publicKeyBytes);
    }

    return {
        ok: hashOk && signatureOk,
        hashOk,
        signatureOk,
        message: hashOk && signatureOk
            ? 'Export authentique: hash global et signature serveur valides.'
            : 'Export non vérifiable: hash ou signature invalide.',
        exportHash,
        verificationMethod,
    };
}

function extractProofs(raw: string): PublicPVProof[] {
    try {
        const parsed = JSON.parse(raw) as PublicExportPackage;
        return parsed.export?.pv_proofs || parsed.pv_proofs || [];
    } catch {
        return [];
    }
}

function extractRegionalRisks(raw: string): PublicRegionalRiskProof[] {
    try {
        const parsed = JSON.parse(raw) as PublicExportPackage;
        return parsed.export?.regional_risks || parsed.regional_risks || [];
    } catch {
        return [];
    }
}

function formatRiskStatus(status: string): string {
    switch (status) {
        case 'signal_faible':
            return 'signal faible';
        case 'a_surveiller':
            return 'à surveiller';
        case 'prioritaire':
            return 'prioritaire';
        default:
            return status || '-';
    }
}

function normalizeSearchValue(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export default function PublicVerifier({ onBack }: PublicVerifierProps) {
    const [raw, setRaw] = useState('');
    const [result, setResult] = useState<VerificationResult | null>(null);
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);
    const [publicElectionId, setPublicElectionId] = useState('');
    const [loadingPublicExport, setLoadingPublicExport] = useState(false);
    const [proofSearch, setProofSearch] = useState('');
    const [regionFilter, setRegionFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [integrityFilter, setIntegrityFilter] = useState('');
    const [selectedProofId, setSelectedProofId] = useState('');

    const proofs = useMemo(() => extractProofs(raw), [raw]);
    const regionalRisks = useMemo(() => extractRegionalRisks(raw), [raw]);
    const trusted = proofs.filter((proof) => proof.integrity_status === 'trusted').length;
    const anomalous = proofs.filter((proof) => (proof.anomalies || []).length > 0).length;
    const priorityRegions = regionalRisks.filter((risk) => risk.risk_status === 'prioritaire').length;
    const riskByRegion = useMemo(() => new Map(regionalRisks.map((risk) => [
        normalizeSearchValue(risk.region_name || risk.normalized_region_name),
        risk,
    ])), [regionalRisks]);
    const regionOptions = useMemo(() => {
        const values = new Map<string, string>();
        proofs.forEach((proof) => {
            const label = proof.polling_station_region || '';
            if (label) values.set(normalizeSearchValue(label), label);
        });
        regionalRisks.forEach((risk) => {
            const label = risk.region_name || risk.normalized_region_name || '';
            if (label) values.set(normalizeSearchValue(label), label);
        });
        return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
    }, [proofs, regionalRisks]);
    const statusOptions = useMemo(() => Array.from(new Set(proofs.map((proof) => proof.status).filter(Boolean))).sort(), [proofs]);
    const integrityOptions = useMemo(() => Array.from(new Set(proofs.map((proof) => proof.integrity_status).filter(Boolean))).sort(), [proofs]);
    const filteredProofs = useMemo(() => {
        const query = normalizeSearchValue(proofSearch.trim());
        const normalizedRegionFilter = normalizeSearchValue(regionFilter);
        return proofs.filter((proof) => {
            const proofRegion = normalizeSearchValue(proof.polling_station_region || '');
            const matchesRegion = !regionFilter || proofRegion === normalizedRegionFilter;
            const matchesStatus = !statusFilter || proof.status === statusFilter;
            const matchesIntegrity = !integrityFilter || proof.integrity_status === integrityFilter;
            const anomalyText = (proof.anomalies || []).map((anomaly) => `${anomaly.code} ${anomaly.severity} ${anomaly.message}`).join(' ');
            const searchable = normalizeSearchValue([
                proof.id,
                proof.polling_station_id,
                proof.polling_station_code,
                proof.polling_station_name,
                proof.polling_station_region,
                proof.status,
                proof.integrity_status,
                proof.pv_hash,
                proof.server_payload_hash,
                anomalyText,
            ].filter(Boolean).join(' '));
            return matchesRegion && matchesStatus && matchesIntegrity && (!query || searchable.includes(query));
        });
    }, [integrityFilter, proofSearch, proofs, regionFilter, statusFilter]);
    const selectedProof = useMemo(() => {
        if (filteredProofs.length === 0) return null;
        return filteredProofs.find((proof) => proof.id === selectedProofId) || filteredProofs[0];
    }, [filteredProofs, selectedProofId]);
    const selectedRegionalRisk = selectedProof
        ? riskByRegion.get(normalizeSearchValue(selectedProof.polling_station_region || ''))
        : undefined;

    const loadFile = async (file?: File) => {
        if (!file) return;
        setRaw(await file.text());
        setResult(null);
        setError('');
    };

    const loadPublicExport = async () => {
        const electionId = publicElectionId.trim();
        if (!electionId) {
            setError('Saisissez un election_id.');
            setResult(null);
            return;
        }
        setLoadingPublicExport(true);
        setChecking(true);
        setError('');
        setResult(null);
        try {
            const response = await fetch(`${API_URL}/public/pv-proofs?election_id=${encodeURIComponent(electionId)}`);
            if (!response.ok) {
                throw new Error(`Export public indisponible (${response.status}).`);
            }
            const payload = await response.json();
            const serialized = JSON.stringify(payload, null, 2);
            setRaw(serialized);
            setResult(await verifyExportPackage(serialized));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setChecking(false);
            setLoadingPublicExport(false);
        }
    };

    const verify = async () => {
        setChecking(true);
        setError('');
        setResult(null);
        try {
            setResult(await verifyExportPackage(raw));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setChecking(false);
        }
    };

    return (
        <main className="public-verify-page">
            <section className="public-verify-panel">
                <div className="public-verify-head">
                    <div>
                        <span className="public-verify-kicker">Openvote</span>
                        <h1>Vérification citoyenne des PV</h1>
                        <p>Importez l’export public signé pour recalculer le hash global, vérifier la signature serveur et inspecter les PV publiés.</p>
                    </div>
                    {onBack && (
                        <button type="button" onClick={onBack}>Connexion</button>
                    )}
                </div>

                <div className="public-verify-inputs">
                    <div className="public-verify-api-row">
                        <label>
                            Election ID public
                            <input
                                value={publicElectionId}
                                onChange={(event) => setPublicElectionId(event.target.value)}
                                placeholder="ex: 00002025-0000-4000-8000-000000000001"
                            />
                        </label>
                        <button type="button" onClick={loadPublicExport} disabled={loadingPublicExport || publicElectionId.trim().length === 0}>
                            {loadingPublicExport ? 'Chargement...' : 'Charger depuis l’API publique'}
                        </button>
                    </div>
                    <label>
                        Fichier JSON signé
                        <input type="file" accept="application/json,.json" onChange={(event) => loadFile(event.target.files?.[0])} />
                    </label>
                    <label>
                        Contenu JSON
                        <textarea
                            value={raw}
                            onChange={(event) => {
                                setRaw(event.target.value);
                                setResult(null);
                                setError('');
                            }}
                            rows={10}
                            spellCheck={false}
                        />
                    </label>
                    <button type="button" onClick={verify} disabled={checking || raw.trim().length === 0}>
                        {checking ? 'Vérification...' : 'Vérifier localement'}
                    </button>
                </div>

                {error && <div className="public-verify-result error">{error}</div>}
                {result && (
                    <div className={`public-verify-result ${result.ok ? 'success' : 'error'}`}>
                        <strong>{result.message}</strong>
                        <span>Hash recalculé: {result.exportHash}</span>
                        <span>Hash global: {result.hashOk ? 'valide' : 'invalide'} · Signature: {result.signatureOk ? 'valide' : 'invalide'} · Méthode: {result.verificationMethod}</span>
                    </div>
                )}

                <div className="public-verify-kpis">
                    <div><strong>{proofs.length}</strong><span>PV publiés</span></div>
                    <div><strong>{trusted}</strong><span>Preuves OK</span></div>
                    <div><strong>{anomalous}</strong><span>Anomalies</span></div>
                    <div><strong>{regionalRisks.length}</strong><span>Régions scorées</span></div>
                    <div><strong>{priorityRegions}</strong><span>Prioritaires</span></div>
                </div>

                <div className="public-verify-consult">
                    <label>
                        Rechercher bureau
                        <input
                            value={proofSearch}
                            onChange={(event) => setProofSearch(event.target.value)}
                            placeholder="Code, nom, hash, anomalie..."
                        />
                    </label>
                    <label>
                        Région
                        <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                            <option value="">Toutes</option>
                            {regionOptions.map((region) => (
                                <option key={region} value={region}>{region}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Statut PV
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                            <option value="">Tous</option>
                            {statusOptions.map((status) => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Intégrité
                        <select value={integrityFilter} onChange={(event) => setIntegrityFilter(event.target.value)}>
                            <option value="">Toutes</option>
                            {integrityOptions.map((status) => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </label>
                    <div className="public-verify-consult-count">
                        <strong>{filteredProofs.length}</strong>
                        <span>PV affiché(s)</span>
                    </div>
                </div>

                {selectedProof && (
                    <section className="public-verify-detail">
                        <div className="public-verify-detail-head">
                            <div>
                                <span>PV sélectionné</span>
                                <h2>{selectedProof.polling_station_code || selectedProof.polling_station_id}</h2>
                                <p>{selectedProof.polling_station_name || selectedProof.polling_station_region || 'Bureau publié'}</p>
                            </div>
                            <mark>{selectedProof.status}</mark>
                        </div>
                        <div className="public-verify-detail-grid">
                            <div>
                                <span>Intégrité</span>
                                <strong>{selectedProof.integrity_status || '-'}</strong>
                            </div>
                            <div>
                                <span>Région</span>
                                <strong>{selectedProof.polling_station_region || '-'}</strong>
                            </div>
                            <div>
                                <span>Anomalies</span>
                                <strong>{(selectedProof.anomalies || []).length}</strong>
                            </div>
                            <div>
                                <span>Mis à jour</span>
                                <strong>{selectedProof.updated_at || '-'}</strong>
                            </div>
                        </div>
                        <div className="public-verify-proof-grid">
                            <div>
                                <span>ID PV</span>
                                <code>{selectedProof.id}</code>
                            </div>
                            <div>
                                <span>ID bureau</span>
                                <code>{selectedProof.polling_station_id}</code>
                            </div>
                            <div>
                                <span>Hash photo</span>
                                <code>{selectedProof.pv_hash || '-'}</code>
                            </div>
                            <div>
                                <span>Hash serveur</span>
                                <code>{selectedProof.server_payload_hash || '-'}</code>
                            </div>
                        </div>
                        {selectedRegionalRisk && (
                            <div className="public-verify-region-proof">
                                <div>
                                    <span>Preuve régionale</span>
                                    <strong>{selectedRegionalRisk.region_name} · {selectedRegionalRisk.risk_score}/100 · {formatRiskStatus(selectedRegionalRisk.risk_status)}</strong>
                                    <small>{Math.round(selectedRegionalRisk.coverage_rate * 100)}% couverture · {selectedRegionalRisk.submitted_pv}/{selectedRegionalRisk.total_stations} PV</small>
                                </div>
                                <code>{selectedRegionalRisk.snapshot_hash || 'hash snapshot absent'}</code>
                            </div>
                        )}
                        <div className="public-verify-anomaly-list">
                            {(selectedProof.anomalies || []).map((anomaly, index) => (
                                <div key={`${anomaly.code}-${index}`} className="public-verify-anomaly">
                                    <strong>{anomaly.code}</strong>
                                    <span>{anomaly.severity}</span>
                                    <p>{anomaly.message}</p>
                                </div>
                            ))}
                            {(selectedProof.anomalies || []).length === 0 && (
                                <p>Aucune anomalie publiée pour ce PV.</p>
                            )}
                        </div>
                    </section>
                )}

                <div className="public-verify-risk-table">
                    <div className="public-verify-risk-row head">
                        <span>Région</span>
                        <span>Statut</span>
                        <span>Score</span>
                        <span>Couverture</span>
                        <span>Écarts</span>
                        <span>Règles</span>
                    </div>
                    {regionalRisks.slice(0, 80).map((risk) => (
                        <div key={`${risk.normalized_region_name}-${risk.snapshot_hash}`} className="public-verify-risk-row">
                            <span>
                                <strong>{risk.region_name || risk.normalized_region_name}</strong>
                                <small>{risk.reference_source_document_slug || 'source historique non liée'}</small>
                            </span>
                            <span className={`public-risk-pill risk-${risk.risk_status}`}>{formatRiskStatus(risk.risk_status)}</span>
                            <strong>{risk.risk_score}/100</strong>
                            <span>{Math.round(risk.coverage_rate * 100)}% · {risk.submitted_pv}/{risk.total_stations} PV</span>
                            <span>
                                {typeof risk.turnout_gap_points === 'number' ? `${risk.turnout_gap_points.toFixed(1)} pts part.` : '-'}
                                {typeof risk.invalid_gap_points === 'number' ? ` · ${risk.invalid_gap_points.toFixed(1)} pts inv.` : ''}
                            </span>
                            <span>{(risk.rules || []).map((rule) => rule.code).join(', ') || '-'}</span>
                        </div>
                    ))}
                    {raw && regionalRisks.length === 0 && (
                        <p>Aucun score régional public lisible dans ce fichier.</p>
                    )}
                </div>

                <div className="public-verify-table">
                    <div className="public-verify-row head">
                        <span>Bureau</span>
                        <span>Statut</span>
                        <span>Intégrité</span>
                        <span>Risque régional</span>
                        <span>Hash photo</span>
                        <span>Hash serveur</span>
                        <span>Anom.</span>
                    </div>
                    {filteredProofs.slice(0, 120).map((proof) => {
                        const regionalRisk = riskByRegion.get(normalizeSearchValue(proof.polling_station_region || ''));
                        const selected = selectedProof?.id === proof.id;
                        return (
                            <button
                                key={proof.id}
                                type="button"
                                className={`public-verify-row ${selected ? 'active' : ''}`}
                                onClick={() => setSelectedProofId(proof.id)}
                            >
                                <span>
                                    <strong>{proof.polling_station_code || proof.polling_station_id}</strong>
                                    <small>{proof.polling_station_name || proof.polling_station_region || 'Bureau publié'}</small>
                                </span>
                                <span>{proof.status}</span>
                                <span>{proof.integrity_status || '-'}</span>
                                <span>
                                    {regionalRisk ? (
                                        <>
                                            <strong>{regionalRisk.risk_score}/100</strong>
                                            <small>{formatRiskStatus(regionalRisk.risk_status)}</small>
                                        </>
                                    ) : '-'}
                                </span>
                                <code>{proof.pv_hash ? `${proof.pv_hash.slice(0, 16)}...` : '-'}</code>
                                <code>{proof.server_payload_hash ? `${proof.server_payload_hash.slice(0, 16)}...` : '-'}</code>
                                <span className={(proof.anomalies || []).length > 0 ? 'public-verify-danger' : ''}>{(proof.anomalies || []).length}</span>
                            </button>
                        );
                    })}
                    {raw && proofs.length === 0 && (
                        <p>Aucun PV public lisible dans ce fichier.</p>
                    )}
                    {raw && proofs.length > 0 && filteredProofs.length === 0 && (
                        <p>Aucun PV ne correspond aux filtres de consultation.</p>
                    )}
                </div>
            </section>
        </main>
    );
}
