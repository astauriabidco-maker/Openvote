/**
 * Onglet Tokens — génération de tokens d'enrôlement.
 *
 * Affiche un formulaire (rôle + région), génère un token JWT + QR code.
 * M6 : le scope régional est vérifié côté backend (region_admin ne peut
 * générer que pour sa région et des rôles inférieurs).
 *
 * TabHeader (refonte 2026-07) : utilise le composant partagé.
 */

import { ROLES, ROLE_LABELS } from '../constants';
import TabHeader from '../components/TabHeader';
import type { AdminPanelState } from '../useAdminPanelState';

export default function TokensTab({ state }: { state: AdminPanelState }) {
    const {
        tokenRole, setTokenRole, tokenRegion, setTokenRegion,
        generatedToken, qrDataUrl, regions,
        handleGenerateToken, notify,
    } = state;

    return (
        <div className="admin-section">
            <TabHeader
                title="🎫 Tokens d'enrôlement"
                subtitle="Générez un token d'activation pour permettre à un nouvel observateur de s'enrôler via l'app mobile."
            />

            <div className="token-form">
                <div className="form-group">
                    <label>Rôle attribué</label>
                    <select value={tokenRole} onChange={(e) => setTokenRole(e.target.value)} className="admin-select">
                        {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>Région</label>
                    <select value={tokenRegion} onChange={(e) => setTokenRegion(e.target.value)} className="admin-select">
                        <option value="">— Sélectionner une région</option>
                        {regions.map((r) => (
                            <option key={r.id} value={r.code + ' - ' + r.name}>{r.code} - {r.name}</option>
                        ))}
                    </select>
                </div>
                <button className="admin-primary-btn" onClick={handleGenerateToken}>
                    🔑 Générer le Token
                </button>
            </div>

            {generatedToken && (
                <div className="generated-token">
                    <h3>✅ Token Généré</h3>
                    <div className="token-display">
                        <code>{generatedToken}</code>
                        <button
                            className="copy-btn"
                            onClick={() => { navigator.clipboard.writeText(generatedToken); notify('success', 'Copié !'); }}
                        >📋 Copier</button>
                    </div>
                    <small>Ce token permettra à un utilisateur de s'enrôler avec le rôle <strong>{ROLE_LABELS[tokenRole]}</strong> dans la région <strong>{tokenRegion}</strong>.</small>
                    {qrDataUrl && (
                        <div className="qr-section">
                            <h4>📱 QR Code</h4>
                            <img src={qrDataUrl} alt="QR Code du token" className="qr-image" />
                            <small>Scannez ce QR code depuis l'app mobile pour s'enrôler automatiquement.</small>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}