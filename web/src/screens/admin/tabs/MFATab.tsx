/**
 * Onglet MFA — gestion de l'authentification à deux facteurs (H3).
 *
 * Réservé super_admin (par design du brief) : les autres rôles voient un
 * message d'avertissement mais pas le formulaire d'activation.
 *
 * Flow d'activation (3 étapes, dans une modale) :
 *   1. Saisie du mot de passe (re-auth, anti-rogue device)
 *      → POST /auth/mfa/setup → {secret, otpauth_url, backup_codes}
 *   2. Affichage du QR code + secret en clair + 10 backup codes
 *      → l'utilisateur scanne avec son app d'authentification
 *   3. Saisie d'un code TOTP pour confirmer la possession du secret
 *      → POST /auth/mfa/confirm-setup → {ok}
 *
 * Flow de désactivation :
 *   - Saisie du mot de passe → POST /auth/mfa/disable
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { AdminPanelState } from '../useAdminPanelState';

// ============================================================
// Types de réponse backend
// ============================================================

interface MFAStatus {
    enabled: boolean;
    backup_codes_total: number;
    backup_codes_unused: number;
    is_super_admin: boolean;
}

interface MFASetupResponse {
    secret: string;
    otpauth_url: string;
    backup_codes: string[];
    message: string;
}

// ============================================================
// Composant
// ============================================================

export default function MFATab({ state }: { state: AdminPanelState }) {
    const { auth, apiClient } = state;

    const [status, setStatus] = useState<MFAStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state : 'closed' | 'setup-password' | 'setup-qr' | 'setup-confirm' | 'disable'
    const [modalStep, setModalStep] = useState<'closed' | 'setup-password' | 'setup-qr' | 'setup-confirm' | 'disable'>('closed');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [qrImage, setQrImage] = useState<string>('');
    const [setupData, setSetupData] = useState<MFASetupResponse | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.get<MFAStatus>('/auth/mfa/status');
            setStatus(res.data);
        } catch (err) {
            console.error('[MFA] loadStatus failed:', err);
            setError('Impossible de charger le statut MFA');
        } finally {
            setLoading(false);
        }
    };

    // ===== Étape 1 : appel /auth/mfa/setup =====
    const handleSetup = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await apiClient.post<MFASetupResponse>('/auth/mfa/setup', { password });
            setSetupData(res.data);
            // Génère le QR code côté client (QRCode.toDataURL = canvas → data URL base64).
            const dataUrl = await QRCode.toDataURL(res.data.otpauth_url, {
                width: 256,
                margin: 2,
                color: { dark: '#0d1117', light: '#ffffff' },
            });
            setQrImage(dataUrl);
            setModalStep('setup-qr');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
            if (axiosErr?.response?.status === 401) {
                setError('Mot de passe incorrect');
            } else if (axiosErr?.response?.data?.error?.includes('réservé')) {
                setError('MFA réservée aux super_administrateurs');
            } else {
                setError(axiosErr?.response?.data?.error || 'Erreur lors de l\'activation');
            }
        } finally {
            setSubmitting(false);
        }
    };

    // ===== Étape 3 : confirmation TOTP =====
    const handleConfirmSetup = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await apiClient.post('/auth/mfa/confirm-setup', { code: totpCode });
            setSuccessMessage('MFA confirmée avec succès ! Tes codes de secours sont désormais valides.');
            setModalStep('closed');
            setPassword('');
            setTotpCode('');
            await loadStatus();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            setError(axiosErr?.response?.data?.error || 'Code invalide, réessaie');
            setTotpCode('');
        } finally {
            setSubmitting(false);
        }
    };

    // ===== Désactivation =====
    const handleDisable = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await apiClient.post('/auth/mfa/disable', { password });
            setSuccessMessage('MFA désactivée. Tes codes de secours ne sont plus valides.');
            setModalStep('closed');
            setPassword('');
            await loadStatus();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
            if (axiosErr?.response?.status === 401) {
                setError('Mot de passe incorrect');
            } else {
                setError(axiosErr?.response?.data?.error || 'Erreur lors de la désactivation');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const closeModal = () => {
        setModalStep('closed');
        setPassword('');
        setTotpCode('');
        setSetupData(null);
        setQrImage('');
        setError(null);
    };

    // ============================================================
    // Rendu
    // ============================================================

    if (loading) {
        return (
            <div className="admin-section">
                <h2>🔐 Authentification à deux facteurs (MFA)</h2>
                <div style={{ padding: 20, color: '#8b949e' }}>⏳ Chargement…</div>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="admin-section">
                <h2>🔐 Authentification à deux facteurs (MFA)</h2>
                <div style={{ padding: 20, color: '#f85149' }}>{error || 'Erreur de chargement'}</div>
                <button className="admin-refresh-btn" onClick={loadStatus}>🔄 Réessayer</button>
            </div>
        );
    }

    // Non-super_admin : message d'info, pas d'action possible.
    if (!status.is_super_admin) {
        return (
            <div className="admin-section">
                <h2>🔐 Authentification à deux facteurs (MFA)</h2>
                <div className="mfa-info-card">
                    <div className="mfa-info-icon">ℹ️</div>
                    <h3>Réservé aux super_administrateurs</h3>
                    <p>
                        Pour des raisons de sécurité, l'authentification à deux facteurs (MFA)
                        est activable uniquement par les <strong>super_administrateurs</strong>
                        du système (cf. design brief H3).
                    </p>
                    <p>
                        Ton rôle actuel : <code>{auth.role}</code>.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-section">
            <h2>🔐 Authentification à deux facteurs (MFA)</h2>

            {successMessage && (
                <div className="mfa-success-banner">
                    <span>✅</span> {successMessage}
                    <button onClick={() => setSuccessMessage(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3fb950', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                </div>
            )}

            {/* Statut courant */}
            <div className={`mfa-status-card ${status.enabled ? 'enabled' : 'disabled'}`}>
                <div className="mfa-status-header">
                    <div className="mfa-status-icon">
                        {status.enabled ? '🛡️' : '⚠️'}
                    </div>
                    <div className="mfa-status-info">
                        <h3>{status.enabled ? 'MFA activée' : 'MFA désactivée'}</h3>
                        <p>
                            {status.enabled
                                ? `Ton compte est protégé par l'authentification à deux facteurs. ${status.backup_codes_unused}/${status.backup_codes_total} codes de secours restants.`
                                : 'Ton compte n\'est protégé que par ton mot de passe. Active la MFA pour ajouter une seconde couche de sécurité.'}
                        </p>
                    </div>
                    <div className="mfa-status-action">
                        {status.enabled ? (
                            <button className="admin-refresh-btn" onClick={() => setModalStep('disable')} style={{ background: 'rgba(248, 81, 73, 0.15)', color: '#f85149', border: '1px solid rgba(248, 81, 73, 0.3)' }}>
                                🔓 Désactiver
                            </button>
                        ) : (
                            <button className="admin-primary-btn" onClick={() => setModalStep('setup-password')}>
                                🔐 Activer MFA
                            </button>
                        )}
                    </div>
                </div>

                {/* Info sécurité */}
                <div className="mfa-info-grid">
                    <div className="mfa-info-item">
                        <div className="mfa-info-item-icon">🔢</div>
                        <div>
                            <strong>Code TOTP</strong>
                            <small>6 chiffres toutes les 30s via Google Authenticator / Authy / 1Password</small>
                        </div>
                    </div>
                    <div className="mfa-info-item">
                        <div className="mfa-info-item-icon">🆘</div>
                        <div>
                            <strong>10 codes de secours</strong>
                            <small>Usage unique. Stocke-les dans un gestionnaire de mots de passe.</small>
                        </div>
                    </div>
                    <div className="mfa-info-item">
                        <div className="mfa-info-item-icon">🔒</div>
                        <div>
                            <strong>Verrouillage auto</strong>
                            <small>5 tentatives échouées → compte bloqué 15 minutes</small>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* Modal */}
            {/* ============================================================ */}
            {modalStep !== 'closed' && (
                <div className="mfa-modal-overlay" onClick={closeModal}>
                    <div className="mfa-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="mfa-modal-close" onClick={closeModal}>✕</button>

                        {error && (
                            <div className="mfa-modal-error">
                                <span>⚠️</span> {error}
                            </div>
                        )}

                        {/* === Étape 1 : password pour setup === */}
                        {modalStep === 'setup-password' && (
                            <>
                                <h2>🔐 Activer l'authentification à deux facteurs</h2>
                                <p className="mfa-modal-subtitle">
                                    Confirme ton mot de passe pour générer un secret TOTP. Tu auras ensuite besoin
                                    d'une application d'authentification (Google Authenticator, Authy, 1Password…).
                                </p>
                                <label className="mfa-modal-label">
                                    <span>🔑</span> Mot de passe
                                </label>
                                <input
                                    type="password"
                                    autoFocus
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mfa-modal-input"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                />
                                <div className="mfa-modal-actions">
                                    <button className="admin-refresh-btn" onClick={closeModal}>Annuler</button>
                                    <button
                                        className="admin-primary-btn"
                                        disabled={!password || submitting}
                                        onClick={handleSetup}
                                    >
                                        {submitting ? '⏳ Génération…' : '✓ Générer le secret'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* === Étape 2 : QR code + secret + backup codes === */}
                        {modalStep === 'setup-qr' && setupData && (
                            <>
                                <h2>📱 Scanne ce QR code</h2>
                                <p className="mfa-modal-subtitle">
                                    Ouvre ton application d'authentification et scanne ce QR code pour ajouter
                                    le compte <strong>Openvote</strong>.
                                </p>

                                {qrImage && (
                                    <div className="mfa-qr-wrapper">
                                        <img src={qrImage} alt="QR Code TOTP Openvote" className="mfa-qr-image" />
                                    </div>
                                )}

                                <details className="mfa-secret-details">
                                    <summary>📋 Impossible de scanner ? Saisir le secret manuellement</summary>
                                    <div className="mfa-secret-box">
                                        <code>{setupData.secret}</code>
                                        <button
                                            className="mfa-copy-btn"
                                            onClick={() => navigator.clipboard.writeText(setupData.secret)}
                                            title="Copier le secret"
                                        >
                                            📋
                                        </button>
                                    </div>
                                </details>

                                <h3 style={{ marginTop: 20 }}>🆘 Codes de secours</h3>
                                <p className="mfa-modal-subtitle">
                                    Ces 10 codes te permettront de te connecter si tu perds accès à ton application.
                                    <strong> Copie-les maintenant</strong> — ils ne seront plus jamais affichés.
                                </p>
                                <div className="mfa-backup-grid">
                                    {setupData.backup_codes.map((code, i) => (
                                        <div key={i} className="mfa-backup-code">
                                            <code>{code}</code>
                                            <button
                                                className="mfa-copy-btn"
                                                onClick={() => navigator.clipboard.writeText(code)}
                                                title="Copier ce code"
                                            >
                                                📋
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="mfa-modal-actions">
                                    <button className="admin-refresh-btn" onClick={closeModal}>Annuler</button>
                                    <button
                                        className="admin-primary-btn"
                                        onClick={() => { setModalStep('setup-confirm'); setError(null); setTotpCode(''); }}
                                    >
                                        J'ai scanné et sauvegardé → Continuer
                                    </button>
                                </div>
                            </>
                        )}

                        {/* === Étape 3 : confirmer avec un code TOTP === */}
                        {modalStep === 'setup-confirm' && (
                            <>
                                <h2>✅ Confirmer l'activation</h2>
                                <p className="mfa-modal-subtitle">
                                    Saisis un code à 6 chiffres généré par ton application d'authentification
                                    pour confirmer que le scan a bien fonctionné.
                                </p>
                                <label className="mfa-modal-label">
                                    <span>🔢</span> Code TOTP
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    autoFocus
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                                    className="mfa-modal-input mfa-totp-input"
                                    placeholder="123456"
                                    autoComplete="one-time-code"
                                />
                                <div className="mfa-modal-actions">
                                    <button className="admin-refresh-btn" onClick={() => setModalStep('setup-qr')}>← Retour</button>
                                    <button
                                        className="admin-primary-btn"
                                        disabled={totpCode.length !== 6 || submitting}
                                        onClick={handleConfirmSetup}
                                    >
                                        {submitting ? '⏳ Vérification…' : '✓ Confirmer'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* === Désactivation === */}
                        {modalStep === 'disable' && (
                            <>
                                <h2>🔓 Désactiver la MFA</h2>
                                <p className="mfa-modal-subtitle">
                                    ⚠️ Tu vas perdre la protection à deux facteurs. Confirme ton mot de passe
                                    pour continuer. Tes codes de secours ne fonctionneront plus.
                                </p>
                                <label className="mfa-modal-label">
                                    <span>🔑</span> Mot de passe
                                </label>
                                <input
                                    type="password"
                                    autoFocus
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mfa-modal-input"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                />
                                <div className="mfa-modal-actions">
                                    <button className="admin-refresh-btn" onClick={closeModal}>Annuler</button>
                                    <button
                                        className="admin-refresh-btn"
                                        style={{ background: 'rgba(248, 81, 73, 0.15)', color: '#f85149', border: '1px solid rgba(248, 81, 73, 0.3)' }}
                                        disabled={!password || submitting}
                                        onClick={handleDisable}
                                    >
                                        {submitting ? '⏳ Désactivation…' : '🔓 Désactiver définitivement'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}