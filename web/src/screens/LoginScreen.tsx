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

    const FEATURES = [
        { icon: '🗺️', title: 'Carte Interactive', desc: 'Visualisez les 10 régions, 58 départements et 360 arrondissements en temps réel' },
        { icon: '📡', title: 'Signalements Terrain', desc: 'Rapportez fraudes, violences et irrégularités géolocalisées avec photos' },
        { icon: '📱', title: 'Mode Hors-Ligne', desc: 'Fonctionne sans Internet — synchronisation automatique au retour du réseau' },
        { icon: '📜', title: 'Cadre Juridique', desc: 'Accès aux textes de loi électoraux avec recherche sémantique intelligente' },
        { icon: '🔐', title: 'Sécurité Renforcée', desc: 'Chiffrement bout-en-bout, aucun tracking, données souveraines' },
        { icon: '📊', title: 'Intelligence Électorale', desc: 'Données démographiques BUCREP et taux d\'enrôlement ELECAM consolidés' },
    ];

    const STATS = [
        { value: '29M', label: 'Population', icon: '👥' },
        { value: '7.7M', label: 'Inscrits ELECAM', icon: '🗳️' },
        { value: '360', label: 'Arrondissements', icon: '📍' },
        { value: '10', label: 'Régions', icon: '🌍' },
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

            {/* LEFT SIDE — Hero & Info */}
            <div className="landing-left">
                {/* Top bar */}
                <div className="landing-topbar">
                    <div className="landing-brand">
                        <img src="/icon-192.png" alt="Openvote" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                        <span>Openvote</span>
                    </div>
                <div className="landing-badge">
                    <span className="landing-badge-dot" />
                    Système opérationnel
                </div>
                    {onOpenPublicVerifier && (
                        <button type="button" className="landing-public-link" onClick={onOpenPublicVerifier}>
                            Vérifier un export
                        </button>
                    )}
                </div>

                {/* Hero */}
                <div className="landing-hero">
                    <div className="landing-hero-tag">🇨🇲 Cameroun · Surveillance Électorale Citoyenne</div>
                    <h1 className="landing-hero-title">
                        Protégeons la <span className="landing-gradient-text">transparence</span> de nos élections
                    </h1>
                    <p className="landing-hero-desc">
                        Openvote est une plateforme citoyenne indépendante permettant aux observateurs,
                        coordonnateurs et citoyens de surveiller le processus électoral camerounais en temps réel.
                        Signalez les incidents, consultez les données, défendez la démocratie.
                    </p>
                </div>

                {/* Stats */}
                <div className="landing-stats">
                    {STATS.map((stat, i) => (
                        <div key={i} className="landing-stat-card" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
                            <div className="landing-stat-icon">{stat.icon}</div>
                            <div className="landing-stat-value">{stat.value}</div>
                            <div className="landing-stat-label">{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* Features */}
                <div className="landing-features">
                    {FEATURES.map((feat, i) => (
                        <div key={i} className="landing-feature-card" style={{ animationDelay: `${0.6 + i * 0.08}s` }}>
                            <div className="landing-feature-icon">{feat.icon}</div>
                            <div>
                                <div className="landing-feature-title">{feat.title}</div>
                                <div className="landing-feature-desc">{feat.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="landing-left-footer">
                    <span>🔒 Open Source · Données souveraines · Aucun tracking</span>
                    <span>© 2025 Openvote · Par des citoyens, pour des citoyens</span>
                </div>
            </div>

            {/* RIGHT SIDE — Login Form */}
            <div className="landing-right">
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
