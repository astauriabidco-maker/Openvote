import { render, screen } from '@testing-library/react';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PublicVerifier, { verifyExportPackage } from './PublicVerifier';

function base64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('PublicVerifier', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('affiche la vérification citoyenne sans authentification', () => {
        render(<PublicVerifier />);

        expect(screen.getByText('Vérification citoyenne des PV')).toBeInTheDocument();
        expect(screen.getByText('Fichier JSON signé')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Vérifier localement' })).toBeDisabled();
    });

    it('vérifie la signature avec le fallback JS si WebCrypto Ed25519 échoue', async () => {
        const privateKey = ed25519.utils.randomSecretKey();
        const publicKey = ed25519.getPublicKey(privateKey);
        const canonicalExport = JSON.stringify({
            proof_manifest_version: 1,
            election_id: 'election-001',
            generated_at: '2026-09-10T00:00:00Z',
            total: 0,
            pv_proofs: [],
        });
        const digest = sha256(new TextEncoder().encode(canonicalExport));
        const signature = ed25519.sign(digest, privateKey);
        vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(new Error('unsupported'));

        const result = await verifyExportPackage(JSON.stringify({
            export_proof: {
                algorithm: 'ED25519_SHA256_EXPORT_V1',
                export_hash: Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
                signature: base64Url(signature),
                public_key: base64Url(publicKey),
                canonical_export: canonicalExport,
            },
        }));

        expect(result.ok).toBe(true);
        expect(result.verificationMethod).toBe('Fallback JS Ed25519');
    });
});
