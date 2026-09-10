/**
 * Openvote — écran de connexion.
 *
 * Écran d'accueil / landing page avec hero, stats et formulaire de login.
 * Extrait de l'ancien god-component App.tsx (cf. M2 audit).
 *
 * Sécurité (cf. H4) : le mot de passe est passé via onLogin() mais n'est
 * JAMAIS stocké dans le state React après l'appel — il sert uniquement
 * à dériver la clé de chiffrement (cf. session.unlock).
 */

import { useState } from 'react';
import axios from 'axios';
import type { AuthState } from '../types';
import { API_URL } from '../constants';

interface LoginScreenProps {
    onLogin: (auth: AuthState, password: string) => void;
    onOpenPublicVerifier?: () => void;
}

export default function LoginScreen({ onLogin, onOpenPublicVerifier }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // MFA (H3) : après login password OK, le serveur peut demander un code TOTP.
    // On stocke le challenge token + le username pour la 2e étape.
    const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isRegistering) {
                await axios.post(`${API_URL}/auth/register`, { username, password });
            }

            const res = await axios.post(`${API_URL}/auth/login`, { username, password });

            // Étape 1 : le serveur demande un code MFA → on l'affiche, on attend la saisie.
            if (res.data?.mfa_required) {
                setMfaChallenge(res.data.challenge_token);
                setMfaCode('');
                setIsLoading(false);
                return;
            }

            // Étape 2 directe (pas de MFA) : on a déjà le token d'accès.
            finalizeLogin(res.data.token, username, password);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const data = err.response?.data;
                if (err.response?.status === 429) {
                    setError('Compte temporairement verrouillé suite à de nombreux essais. Réessayez plus tard.');
                } else {
                    setError(data?.error || 'Erreur de connexion au serveur');
                }
            } else {
                setError('Erreur inconnue');
            }
            setIsLoading(false);
        }
    };

    // Soumission du code TOTP après une réponse { mfa_required: true }.
    const handleMFASubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mfaChallenge) return;
        setError('');
        setIsLoading(true);

        try {
            const res = await axios.post(`${API_URL}/auth/mfa/verify`, {
                challenge_token: mfaChallenge,
                code: mfaCode,
            });
            finalizeLogin(res.data.token, username, password);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.error || 'Code MFA invalide');
            } else {
                setError('Erreur inconnue');
            }
            // Réinitialise le code pour forcer une re-saisie propre.
            setMfaCode('');
        } finally {
            setIsLoading(false);
        }
    };

    // Helper : décode le JWT et appelle onLogin. Centralise la logique.
    const finalizeLogin = (token: string, user: string, pwd: string) => {
        const payload = JSON.parse(atob(token.split('.')[1]));
        onLogin({
            token,
            role: payload.role || 'observer',
            username: user,
        }, pwd);
    };

    // Annule le flow MFA et revient à l'écran login normal.
    const cancelMFA = () => {
        setMfaChallenge(null);
        setMfaCode('');
        setError('');
    };

    const PROOF_STEPS = [
        { label: 'PV terrain', detail: 'Photo et chiffres du bureau collectés même hors ligne.' },
        { label: 'Hash local', detail: 'Le contenu PV et la photo sont scellés avant envoi.' },
        { label: 'Signature', detail: 'L’appareil observateur lie la preuve à son origine.' },
        { label: 'Audit', detail: 'Le backend trace les statuts, anomalies et changements.' },
        { label: 'Export signé', detail: 'Le paquet public devient vérifiable sans accès admin.' },
    ];

    const PUBLIC_CHECKS = [
        'hash global de l’export',
        'signature serveur et clé publique',
        'hash photo et statut d’intégrité',
        'anomalies PV et score régional',
        'bureau, région et source de la preuve',
    ];

    const HISTORICAL_ELECTIONS = [
        { year: '2011 / 2018', label: 'Présidentielles', detail: 'participation et résultats officiels' },
        { year: '2013 / 2020', label: 'Législatives', detail: 'comparaison par territoire' },
        { year: '2013 / 2018 / 2023', label: 'Sénatoriales', detail: 'mémoire institutionnelle ELECAM' },
    ];

    const LEGAL_ITEMS = [
        'rôle du procès-verbal',
        'dépouillement au bureau',
        'missions des observateurs',
        'délais et voies de recours',
    ];

    const NEWS_ITEMS = [
        { status: 'Officiel', title: 'Calendrier électoral', source: 'Sources institutionnelles' },
        { status: 'Vérifié', title: 'Communiqués ELECAM', source: 'Veille datée et sourcée' },
        { status: 'À confirmer', title: 'Alertes terrain', source: 'Signal faible avant recoupement' },
    ];

    const TRUST_METRICS = [
        { value: '7.7M', label: 'Inscrits ELECAM' },
        { value: '360', label: 'Arrondissements' },
        { value: '10', label: 'Régions' },
        { value: '5', label: 'Types de preuves' },
    ];

    return (
        <div className="landing-container">
            {/* Animated background */}
            <div className="landing-bg">
                <div className="landing-bg-orb landing-bg-orb-1" />
                <div className="landing-bg-orb landing-bg-orb-2" />
                <div className="landing-bg-orb landing-bg-orb-3" />
                <div className="landing-bg-grid" />
            </div>

            <div className="landing-left">
                <div className="landing-topbar">
                    <div className="landing-brand">
                        <img src="/icon-192.png" alt="Openvote" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                        <span>Openvote</span>
                    </div>
                    <div className="landing-badge">
                        <span className="landing-badge-dot" />
                        Preuve publique vérifiable
                    </div>
                    {onOpenPublicVerifier && (
                        <button type="button" className="landing-public-link" onClick={onOpenPublicVerifier}>
                            Vérifier un export public
                        </button>
                    )}
                </div>

                <div className="landing-hero">
                    <div className="landing-hero-tag">Cameroun · PV électoraux · Audit citoyen</div>
                    <h1 className="landing-hero-title">
                        Chaque PV doit pouvoir être <span className="landing-gradient-text">vérifié</span>
                    </h1>
                    <p className="landing-hero-desc">
                        Openvote collecte les procès-verbaux terrain, scelle les preuves par hash et signature,
                        audite les changements, puis publie un paquet vérifiable par les citoyens, journalistes,
                        observateurs et organisations indépendantes.
                    </p>
                    <div className="landing-hero-actions">
                        {onOpenPublicVerifier && (
                            <button type="button" className="landing-primary-cta" onClick={onOpenPublicVerifier}>
                                Vérifier un paquet signé
                            </button>
                        )}
                        <a className="landing-secondary-cta" href="#observer-login">
                            Accès observateur / admin
                        </a>
                    </div>
                </div>

                <div className="landing-stats">
                    {TRUST_METRICS.map((stat, i) => (
                        <div key={i} className="landing-stat-card" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
                            <div className="landing-stat-value">{stat.value}</div>
                            <div className="landing-stat-label">{stat.label}</div>
                        </div>
                    ))}
                </div>

                <section className="landing-proof-panel" aria-labelledby="proof-flow-title">
                    <div className="landing-section-kicker">Preuve électorale</div>
                    <h2 id="proof-flow-title">Comment la preuve fonctionne</h2>
                    <div className="landing-proof-flow">
                        {PROOF_STEPS.map((step, index) => (
                            <div key={step.label} className="landing-proof-step">
                                <span>{index + 1}</span>
                                <strong>{step.label}</strong>
                                <small>{step.detail}</small>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="landing-public-proof">
                    <div>
                        <div className="landing-section-kicker">Vérification citoyenne</div>
                        <h2>Ce que le public peut contrôler</h2>
                        <p>
                            La preuve publiée reste lisible localement: aucune confiance aveugle dans l’interface admin,
                            chaque modification du paquet doit casser le hash ou la signature.
                        </p>
                    </div>
                    <ul>
                        {PUBLIC_CHECKS.map((check) => (
                            <li key={check}>{check}</li>
                        ))}
                    </ul>
                </section>

                <section className="landing-memory">
                    <div className="landing-section-kicker">Mémoire électorale officielle</div>
                    <h2>Comparer 2025 aux scrutins passés</h2>
                    <div className="landing-memory-list">
                        {HISTORICAL_ELECTIONS.map((election) => (
                            <article key={election.label}>
                                <span>{election.year}</span>
                                <strong>{election.label}</strong>
                                <small>{election.detail}</small>
                            </article>
                        ))}
                    </div>
                </section>

                <div className="landing-civic-grid">
                    <section className="landing-civic-panel">
                        <div className="landing-section-kicker">Cadre législatif</div>
                        <h2>Comprendre les règles du scrutin</h2>
                        <ul>
                            {LEGAL_ITEMS.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </section>

                    <section className="landing-civic-panel">
                        <div className="landing-section-kicker">Actualité électorale</div>
                        <h2>Suivre les faits vérifiés</h2>
                        <div className="landing-news-list">
                            {NEWS_ITEMS.map((item) => (
                                <article key={item.title}>
                                    <span>{item.status}</span>
                                    <strong>{item.title}</strong>
                                    <small>{item.source}</small>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="landing-left-footer">
                    <span>Open source · Données souveraines · Audit public</span>
                    <span>© 2025 Openvote · Preuve, droit, mémoire</span>
                </div>
            </div>

            {/* RIGHT SIDE — Login Form */}
            <div className="landing-right" id="observer-login">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-logo">🗳️</div>
                        <h1>
                            {isRegistering ? 'Rejoignez le réseau' : 'Connexion Observateur'}
                        </h1>
                        <p className="login-subtitle">
                            {isRegistering
                                ? 'Créez votre compte pour commencer à surveiller les élections'
                                : 'Accédez au tableau de bord tactique et aux données terrain'}
                        </p>
                    </div>

                    {mfaChallenge ? (
                        // ===== Étape 2 : saisie du code TOTP =====
                        <form onSubmit={handleMFASubmit} className="login-form">
                            {error && (
                                <div className="login-error">
                                    <span>⚠️</span> {error}
                                </div>
                            )}

                            <div className="login-mfa-info">
                                <div className="login-mfa-icon">🔐</div>
                                <h2>Vérification en deux étapes</h2>
                                <p>
                                    Ouvrez votre application d'authentification (Google Authenticator,
                                    Authy, 1Password…) et saisissez le code à 6 chiffres associé à
                                    <strong> Openvote</strong>.
                                </p>
                            </div>

                            <div className="input-group">
                                <label htmlFor="mfa-code">
                                    <span>🔢</span> Code à 6 chiffres
                                </label>
                                <input
                                    id="mfa-code"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    autoFocus
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="123456"
                                    required
                                    autoComplete="one-time-code"
                                    style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: '1.4rem', fontFamily: 'monospace' }}
                                />
                            </div>

                            <button type="submit" className="login-btn" disabled={isLoading || mfaCode.length !== 6}>
                                {isLoading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <span className="login-spinner" /> Vérification...
                                    </span>
                                ) : (
                                    '✓ Vérifier'
                                )}
                            </button>

                            <button
                                type="button"
                                className="login-toggle"
                                onClick={cancelMFA}
                            >
                                ← Annuler et revenir à la saisie du mot de passe
                            </button>

                            <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '0.85rem', color: '#8b949e' }}>
                                Vous avez perdu votre application ? Contactez un super_admin pour réinitialiser votre MFA.
                            </div>
                        </form>
                    ) : (
                        // ===== Étape 1 : login classique =====
                        <form onSubmit={handleSubmit} className="login-form">
                            {error && (
                                <div className="login-error">
                                    <span>⚠️</span> {error}
                                </div>
                            )}

                            <div className="input-group">
                                <label htmlFor="username">
                                    <span>👤</span> Identifiant
                                </label>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Votre nom d'utilisateur"
                                    required
                                    autoComplete="username"
                                />
                            </div>

                            <div className="input-group">
                                <label htmlFor="password">
                                    <span>🔑</span> Mot de passe
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        autoComplete="current-password"
                                        style={{ paddingRight: '44px' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                            background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1rem',
                                        }}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>

                            <button type="submit" className="login-btn" disabled={isLoading}>
                                {isLoading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <span className="login-spinner" /> Connexion en cours...
                                    </span>
                                ) : (
                                    isRegistering ? '🚀 Créer mon compte' : '🔓 Se connecter'
                                )}
                            </button>

                            <button
                                type="button"
                                className="login-toggle"
                                onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                            >
                                {isRegistering ? '← Déjà inscrit ? Connectez-vous' : 'Nouvel observateur ? Créez un compte →'}
                            </button>
                        </form>
                    )}

                    {/* Roles info */}
                    <div className="login-roles">
                        <div className="login-roles-title">Qui peut s'inscrire ?</div>
                        <div className="login-roles-grid">
                            <div className="login-role-item">
                                <span>👁️</span>
                                <div>
                                    <strong>Observateur</strong>
                                    <small>Terrain & signalements</small>
                                </div>
                            </div>
                            <div className="login-role-item">
                                <span>📋</span>
                                <div>
                                    <strong>Coordonnateur</strong>
                                    <small>Supervision locale</small>
                                </div>
                            </div>
                            <div className="login-role-item">
                                <span>✅</span>
                                <div>
                                    <strong>Citoyen vérifié</strong>
                                    <small>Accès données</small>
                                </div>
                            </div>
                            <div className="login-role-item">
                                <span>🏠</span>
                                <div>
                                    <strong>Citoyen</strong>
                                    <small>Consultation</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="login-footer">
                        <small>🔒 Connexion chiffrée · JWT sécurisé · Aucune donnée partagée</small>
                    </div>
                </div>
            </div>
        </div>
    );
}
