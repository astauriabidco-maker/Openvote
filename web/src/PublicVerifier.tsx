import { useMemo, useState } from 'react';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { PublicPVExportProof, PublicPVProof, PublicPVProofExport } from './types';

interface PublicVerifierProps {
    onBack?: () => void;
}

interface PublicExportPackage {
    export?: PublicPVProofExport;
    export_proof?: PublicPVExportProof;
    pv_proofs?: PublicPVProof[];
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

export default function PublicVerifier({ onBack }: PublicVerifierProps) {
    const [raw, setRaw] = useState('');
    const [result, setResult] = useState<VerificationResult | null>(null);
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);

    const proofs = useMemo(() => extractProofs(raw), [raw]);
    const trusted = proofs.filter((proof) => proof.integrity_status === 'trusted').length;
    const anomalous = proofs.filter((proof) => (proof.anomalies || []).length > 0).length;

    const loadFile = async (file?: File) => {
        if (!file) return;
        setRaw(await file.text());
        setResult(null);
        setError('');
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
                    <label>
                        Fichier JSON signé
                        <input type="file" accept="application/json,.json" onChange={(event) => loadFile(event.target.files?.[0])} />
                    </label>
                    <label>
                        Contenu JSON
                        <textarea value={raw} onChange={(event) => setRaw(event.target.value)} rows={10} spellCheck={false} />
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
                </div>

                <div className="public-verify-table">
                    <div className="public-verify-row head">
                        <span>Bureau</span>
                        <span>Statut</span>
                        <span>Intégrité</span>
                        <span>Hash photo</span>
                        <span>Hash serveur</span>
                        <span>Anom.</span>
                    </div>
                    {proofs.slice(0, 120).map((proof) => (
                        <div key={proof.id} className="public-verify-row">
                            <span>
                                <strong>{proof.polling_station_code || proof.polling_station_id}</strong>
                                <small>{proof.polling_station_name || proof.polling_station_region || 'Bureau publié'}</small>
                            </span>
                            <span>{proof.status}</span>
                            <span>{proof.integrity_status || '-'}</span>
                            <code>{proof.pv_hash ? `${proof.pv_hash.slice(0, 16)}...` : '-'}</code>
                            <code>{proof.server_payload_hash ? `${proof.server_payload_hash.slice(0, 16)}...` : '-'}</code>
                            <span className={(proof.anomalies || []).length > 0 ? 'public-verify-danger' : ''}>{(proof.anomalies || []).length}</span>
                        </div>
                    ))}
                    {raw && proofs.length === 0 && (
                        <p>Aucun PV public lisible dans ce fichier.</p>
                    )}
                </div>
            </section>
        </main>
    );
}
