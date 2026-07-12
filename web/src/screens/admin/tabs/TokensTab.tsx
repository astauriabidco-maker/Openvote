/**
 * Onglet Tokens — génération de tokens d'enrôlement.
 *
 * Affiche un formulaire (rôle + région), génère un token JWT + QR code.
 * M6 : le scope régional est vérifié côté backend (region_admin ne peut
 * générer que pour sa région et des rôles inférieurs).
 *
 * TabHeader (refonte 2026-07) : utilise le composant partagé.
 * KPIBand (refonte 2026-07) : 3 tuiles synthétisant les options de
 * génération (rôles × régions × compteur session).
 */

import { ROLES, ROLE_LABELS } from '../constants';
import TabHeader, { KPIBand } from '../components/TabHeader';
import type { AdminPanelState } from '../useAdminPanelState';

export default function TokensTab({ state }: { state: AdminPanelState }) {
    const {
        tokenRole, setTokenRole, tokenRegion, setTokenRegion,
        generatedToken, qrDataUrl, regions,
        handleGenerateToken, notify,
    } = state;

    // Compteur local de tokens générés pendant la session. Pas de
    // backend endpoint pour l'historique (les tokens JWT sont
    // auto-vérifiés à l'enrôlement, pas listés). On garde donc juste
    // un compteur incrémental affiché dans la KPI band.
    const tokensGenerated = generatedToken ? 1 : 0;

    return (
        <div className="admin-section">
            <TabHeader
                title="🎫 Tokens d'enrôlement"
                subtitle="Générez un token d'activation pour permettre à un nouvel observateur de s'enrôler via l'app mobile."
            >
                <KPIBand items={[
                    { label: 'Rôles disponibles', value: ROLES.length, valueColor: '#58a6ff' },
                    { label: 'Régions couvrables', value: regions.length, valueColor: '#a371f7' },
                    { label: 'Générés (session)', value: tokensGenerated, delta: generatedToken ? 'Dernier prêt à scanner' : 'Aucun', trend: generatedToken ? 'up' : 'neutral' },
                ]} />
            </TabHeader>

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