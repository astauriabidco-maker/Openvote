/**
 * Openvote — hook du tab Tokens d'enrôlement (génération de tokens d'activation).
 *
 * Pattern identique aux autres hooks du refactor admin. Génère un token
 * JWT signé côté backend, puis le rend visuel (QR code) pour l'utilisateur
 * à scanner avec l'app d'enrôlement.
 */

import { useCallback, useState } from 'react';
import { type AxiosInstance } from 'axios';
import QRCode from 'qrcode';
import type { NotifyFn } from './useUsersTab';

export interface TokensTabState {
    // Form state
    tokenRole: string;
    setTokenRole: (r: string) => void;
    tokenRegion: string;
    setTokenRegion: (r: string) => void;

    // Output
    generatedToken: string;
    qrDataUrl: string;

    // Actions
    handleGenerateToken: () => Promise<void>;
}

export function useTokensTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): TokensTabState {
    const [tokenRole, setTokenRole] = useState('observer');
    const [tokenRegion, setTokenRegion] = useState('');
    const [generatedToken, setGeneratedToken] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState('');

    const handleGenerateToken = useCallback(async () => {
        if (!tokenRegion.trim()) {
            notify('error', 'Région requise');
            return;
        }
        try {
            const res = await apiClient.post('/admin/generate-token', {
                role: tokenRole, region_id: tokenRegion,
            });
            const token = res.data.activation_token;
            setGeneratedToken(token);
            try {
                // QR code généré côté client (la lib qrcode est déjà dans le projet,
                // cf. MFATab pour le même pattern).
                const url = await QRCode.toDataURL(token, {
                    width: 256, margin: 2,
                    color: { dark: '#e6edf3', light: '#0d1117' },
                });
                setQrDataUrl(url);
            } catch {
                // Si la génération du QR échoue, on garde le token en clair
                // (l'utilisateur peut toujours le copier-coller).
                setQrDataUrl('');
            }
            notify('success', 'Token généré avec succès');
        } catch {
            notify('error', 'Erreur génération token');
        }
    }, [apiClient, notify, tokenRole, tokenRegion]);

    return {
        tokenRole, setTokenRole,
        tokenRegion, setTokenRegion,
        generatedToken, qrDataUrl,
        handleGenerateToken,
    };
}