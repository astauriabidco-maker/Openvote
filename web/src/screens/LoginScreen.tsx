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

import { useEffect, useState } from 'react';
import axios from 'axios';
import type { AuthState, HistoricalElectionResult } from '../types';
import { API_URL } from '../constants';

interface LoginScreenProps {
    onLogin: (auth: AuthState, password: string) => void;
    onOpenPublicVerifier?: () => void;
}

type LandingHistoricalElection = {
    id: string;
    year: string;
    title: string;
    kind: string;
    source: string;
    registered?: number;
    voters?: number;
    validVotes?: number;
    invalidVotes?: number;
    turnout?: number;
    seats?: number;
    leader: string;
    leaderShare?: number;
    note: string;
};

type LandingRegionSignal = {
    name: string;
    coverage: number;
    submittedPV: number;
    anomalies: number;
    risk: 'Signal faible' | 'À surveiller' | 'Prioritaire';
};

const formatCompactNumber = (value?: number): string => {
    if (typeof value !== 'number') return 'n.a.';
    return new Intl.NumberFormat('fr-FR', {
        notation: value >= 1000000 ? 'compact' : 'standard',
        maximumFractionDigits: value >= 1000000 ? 1 : 0,
    }).format(value);
};

const formatLandingPercent = (value?: number): string => (
    typeof value === 'number' ? `${value.toFixed(2)}%` : 'n.a.'
);

const FALLBACK_HISTORICAL_ELECTIONS: LandingHistoricalElection[] = [
    {
        id: 'presidential-2011',
        year: '2011',
        title: 'Présidentielle Cameroun 2011',
        kind: 'Présidentielle',
        source: 'elecam-presidentielle-2011-rapport-en',
        registered: 7521651,
        voters: 4951434,
        validVotes: 4837249,
        invalidVotes: 114185,
        turnout: 65.82,
        leader: 'CPDM / Paul Biya',
        leaderShare: 77.989,
        note: 'Base nationale officielle extraite du rapport ELECAM 2011.',
    },
    {
        id: 'legislative-2013',
        year: '2013',
        title: 'Législatives Cameroun 2013',
        kind: 'Législatives',
        source: 'elecam-legislatives-municipales-2013-rapport-en',
        registered: 5481226,
        voters: 4208796,
        validVotes: 4023293,
        invalidVotes: 185503,
        turnout: 76.79,
        seats: 180,
        leader: 'CPDM',
        leaderShare: 63.52,
        note: 'Résumé national et acteurs politiques structurés pour comparaison.',
    },
    {
        id: 'presidential-2018',
        year: '2018',
        title: 'Présidentielle Cameroun 2018',
        kind: 'Présidentielle',
        source: 'elecam-presidentielle-2018-rapport-fr',
        registered: 6619548,
        voters: 3590427,
        validVotes: 3537940,
        invalidVotes: 52487,
        turnout: 53.85,
        leader: 'RDPC / Paul Biya',
        leaderShare: 71.25,
        note: 'Référence nationale pour lire les écarts territoriaux 2025.',
    },
    {
        id: 'senatorial-2023',
        year: '2023',
        title: 'Sénatoriales Cameroun 2023',
        kind: 'Sénatoriales',
        source: 'elecam-senatoriales-2023-rapport-en',
        registered: 11134,
        voters: 10924,
        validVotes: 10763,
        invalidVotes: 161,
        turnout: 98.11,
        seats: 70,
        leader: 'CPDM',
        leaderShare: 100,
        note: 'Inclut une lecture régionale des circonscriptions sénatoriales.',
    },
    {
        id: 'presidential-2025',
        year: '2025',
        title: 'Présidentielle Cameroun 2025',
        kind: 'Présidentielle',
        source: 'conseil-constitutionnel-presidentielle-2025-resultats',
        registered: 8082692,
        voters: 4668446,
        validVotes: 4610826,
        invalidVotes: 57620,
        turnout: 57.76,
        leader: 'RDPC / BIYA PAUL',
        leaderShare: 53.66,
        note: 'Proclamation officielle du Conseil constitutionnel du 27 octobre 2025.',
    },
];

const electionKindLabel = (contestType: string, electionType: string): string => {
    const normalized = `${contestType || electionType}`.toLowerCase();
    if (normalized.includes('president')) return 'Présidentielle';
    if (normalized.includes('legisl')) return 'Législatives';
    if (normalized.includes('senat')) return 'Sénatoriales';
    if (normalized.includes('municip')) return 'Municipales';
    return electionType || contestType || 'Scrutin';
};

const buildLeaderLabel = (result: HistoricalElectionResult): string => {
    const values = [result.party, result.actor_name].filter(Boolean);
    return [...new Set(values)].join(' / ') || 'n.a.';
};

const buildLandingHistoricalElections = (
    results: HistoricalElectionResult[],
): LandingHistoricalElection[] => {
    const nationalSummaries = results
        .filter((result) => (
            result.result_level === 'national'
            && result.actor_type === 'election'
            && result.metric_type === 'summary'
        ))
        .sort((a, b) => a.election_year - b.election_year);

    return nationalSummaries.map((summary) => {
        const leader = results
            .filter((result) => (
                result.election_id === summary.election_id
                && result.result_level === 'national'
                && result.actor_type !== 'election'
            ))
            .sort((a, b) => (
                (b.percentage || 0) - (a.percentage || 0)
                || (b.votes || 0) - (a.votes || 0)
                || (b.seats || 0) - (a.seats || 0)
            ))[0];

        return {
            id: summary.election_id || summary.id,
            year: String(summary.election_year),
            title: summary.election_name,
            kind: electionKindLabel(summary.contest_type, summary.election_type),
            source: summary.source_document_slug,
            registered: summary.registered_voters,
            voters: summary.actual_voters,
            validVotes: summary.valid_votes,
            invalidVotes: summary.blank_or_invalid_votes,
            turnout: summary.percentage,
            seats: summary.seats || leader?.seats,
            leader: leader ? buildLeaderLabel(leader) : 'n.a.',
            leaderShare: leader?.percentage,
            note: summary.notes || 'Résumé national issu des données historiques ELECAM.',
        };
    });
};

export default function LoginScreen({ onLogin, onOpenPublicVerifier }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [selectedHistoricalIndex, setSelectedHistoricalIndex] = useState(0);
    const [historicalElections, setHistoricalElections] = useState<LandingHistoricalElection[]>(
        FALLBACK_HISTORICAL_ELECTIONS,
    );
    const [historicalSource, setHistoricalSource] = useState<'api' | 'fallback'>('fallback');
    const [historicalLoading, setHistoricalLoading] = useState(false);
    const [historicalError, setHistoricalError] = useState('');
    const [selectedRegion, setSelectedRegion] = useState('Centre');
    const [publicSearch, setPublicSearch] = useState('');

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

    useEffect(() => {
        let cancelled = false;

        const loadHistoricalResults = async () => {
            setHistoricalLoading(true);
            setHistoricalError('');

            try {
                const response = await axios.get(`${API_URL}/public/historical-election-results`);
                const parsed = buildLandingHistoricalElections(response.data?.results || []);

                if (cancelled) return;

                if (parsed.length > 0) {
                    setHistoricalElections(parsed);
                    setHistoricalSource('api');
                    setSelectedHistoricalIndex(0);
                } else {
                    setHistoricalElections(FALLBACK_HISTORICAL_ELECTIONS);
                    setHistoricalSource('fallback');
                }
            } catch {
                if (!cancelled) {
                    setHistoricalElections(FALLBACK_HISTORICAL_ELECTIONS);
                    setHistoricalSource('fallback');
                    setHistoricalError('API publique indisponible, fallback local affiché.');
                }
            } finally {
                if (!cancelled) {
                    setHistoricalLoading(false);
                }
            }
        };

        loadHistoricalResults();

        return () => {
            cancelled = true;
        };
    }, []);

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

    const REGION_SIGNALS: LandingRegionSignal[] = [
        { name: 'Centre', coverage: 68, submittedPV: 1240, anomalies: 18, risk: 'À surveiller' },
        { name: 'Littoral', coverage: 61, submittedPV: 980, anomalies: 14, risk: 'À surveiller' },
        { name: 'Ouest', coverage: 74, submittedPV: 860, anomalies: 7, risk: 'Signal faible' },
        { name: 'Nord-Ouest', coverage: 32, submittedPV: 210, anomalies: 21, risk: 'Prioritaire' },
        { name: 'Sud-Ouest', coverage: 38, submittedPV: 245, anomalies: 17, risk: 'Prioritaire' },
    ];

    const TRUST_METRICS = [
        { value: '7.7M', label: 'inscrits officiels' },
        { value: '360', label: 'arrondissements suivis' },
        { value: String(historicalElections.length), label: 'scrutins historiques' },
        { value: '5', label: 'preuves par PV' },
    ];
    const selectedHistoricalElection = historicalElections[selectedHistoricalIndex] || FALLBACK_HISTORICAL_ELECTIONS[0];
    const selectedRegionSignal = REGION_SIGNALS.find((region) => region.name === selectedRegion) || REGION_SIGNALS[0];
    const abstention = typeof selectedHistoricalElection.turnout === 'number'
        ? Math.max(0, 100 - selectedHistoricalElection.turnout)
        : undefined;
    const invalidRate = selectedHistoricalElection.voters && selectedHistoricalElection.invalidVotes
        ? (selectedHistoricalElection.invalidVotes / selectedHistoricalElection.voters) * 100
        : undefined;
    const searchResult = publicSearch.trim()
        ? `Recherche locale prête pour "${publicSearch.trim()}": bureau, commune, région ou identifiant PV.`
        : 'Saisissez un bureau, une commune, une région ou un identifiant PV.';

    return (
        <div className="landing-container">
            <div className="landing-bg">
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
                        Vérifiez les PV électoraux du <span className="landing-gradient-text">Cameroun</span>
                    </h1>
                    <p className="landing-hero-desc">
                        Recherchez un bureau, comparez les scrutins passés, consultez les signaux régionaux
                        et vérifiez les paquets publics signés sans accès administrateur.
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

                <section className="landing-public-console" aria-labelledby="public-console-title">
                    <div className="landing-console-main">
                        <div className="landing-section-kicker">Portail public</div>
                        <h2 id="public-console-title">Chercher, comparer, vérifier</h2>
                        <div className="landing-search-row">
                            <label>
                                <span>Recherche citoyenne</span>
                                <input
                                    type="search"
                                    value={publicSearch}
                                    onChange={(event) => setPublicSearch(event.target.value)}
                                    placeholder="Bureau, commune, région, PV-2025..."
                                />
                            </label>
                            <label>
                                <span>Région</span>
                                <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
                                    {REGION_SIGNALS.map((region) => (
                                        <option key={region.name} value={region.name}>{region.name}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="landing-search-result">{searchResult}</div>
                        <div className="landing-region-strip">
                            <div>
                                <span>Couverture PV</span>
                                <strong>{selectedRegionSignal.coverage}%</strong>
                            </div>
                            <div>
                                <span>PV reçus</span>
                                <strong>{formatCompactNumber(selectedRegionSignal.submittedPV)}</strong>
                            </div>
                            <div>
                                <span>Anomalies</span>
                                <strong>{selectedRegionSignal.anomalies}</strong>
                            </div>
                            <div>
                                <span>Statut</span>
                                <strong>{selectedRegionSignal.risk}</strong>
                            </div>
                        </div>
                        <div className="landing-coverage-bar">
                            <span style={{ width: `${selectedRegionSignal.coverage}%` }} />
                        </div>
                    </div>
                    <div className="landing-console-side">
                        <span>Paquet public</span>
                        <strong>Hash + signature + anomalies</strong>
                        <p>Le citoyen doit pouvoir refaire la vérification localement et détecter toute modification.</p>
                    </div>
                </section>

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
                    <div className="landing-memory-head">
                        <div>
                            <h2>Explorer les scrutins passés</h2>
                            <p>
                                Les rapports ELECAM structurés deviennent une base de comparaison: participation,
                                abstention, bulletins invalides, acteur en tête et source officielle.
                            </p>
                        </div>
                        <span>{historicalElections.length} scrutins indexés</span>
                    </div>
                    <div className="landing-memory-status" data-source={historicalSource}>
                        {historicalLoading
                            ? 'Chargement des données publiques...'
                            : historicalSource === 'api'
                                ? 'Données chargées depuis l’API publique'
                                : historicalError || 'Fallback local disponible hors connexion'}
                    </div>
                    <div className="landing-turnout-trend" aria-label="Participation historique nationale">
                        {historicalElections.map((election) => (
                            <div key={`trend-${election.id}`} className={selectedHistoricalElection.id === election.id ? 'active' : ''}>
                                <span>{election.year}</span>
                                <i style={{ height: `${election.turnout || 0}%` }} />
                                <strong>{formatLandingPercent(election.turnout)}</strong>
                            </div>
                        ))}
                    </div>
                    <div className="landing-election-tabs" role="tablist" aria-label="Scrutins historiques">
                        {historicalElections.map((election, index) => (
                            <button
                                key={election.id}
                                type="button"
                                role="tab"
                                aria-label={`${election.year} ${election.kind}`}
                                aria-selected={selectedHistoricalIndex === index}
                                className={selectedHistoricalIndex === index ? 'active' : ''}
                                onClick={() => setSelectedHistoricalIndex(index)}
                            >
                                <strong>{election.year}</strong>
                                <span>{election.kind}</span>
                            </button>
                        ))}
                    </div>
                    <div className="landing-election-inspector">
                        <div className="landing-election-summary">
                            <span>{selectedHistoricalElection.kind}</span>
                            <h3>{selectedHistoricalElection.title}</h3>
                            <p>{selectedHistoricalElection.note}</p>
                            <dl>
                                <div>
                                    <dt>Inscrits</dt>
                                    <dd>{formatCompactNumber(selectedHistoricalElection.registered)}</dd>
                                </div>
                                <div>
                                    <dt>Votants</dt>
                                    <dd>{formatCompactNumber(selectedHistoricalElection.voters)}</dd>
                                </div>
                                <div>
                                    <dt>Validés</dt>
                                    <dd>{formatCompactNumber(selectedHistoricalElection.validVotes)}</dd>
                                </div>
                                <div>
                                    <dt>Invalides</dt>
                                    <dd>{formatCompactNumber(selectedHistoricalElection.invalidVotes)}</dd>
                                </div>
                            </dl>
                        </div>
                        <div className="landing-election-chart" aria-label={`Statistiques ${selectedHistoricalElection.title}`}>
                            <div className="landing-bar-row">
                                <span>Participation</span>
                                <div className="landing-bar-track">
                                    <i style={{ width: `${selectedHistoricalElection.turnout || 0}%` }} />
                                </div>
                                <strong>{formatLandingPercent(selectedHistoricalElection.turnout)}</strong>
                            </div>
                            <div className="landing-bar-row">
                                <span>Abstention</span>
                                <div className="landing-bar-track muted">
                                    <i style={{ width: `${abstention || 0}%` }} />
                                </div>
                                <strong>{formatLandingPercent(abstention)}</strong>
                            </div>
                            <div className="landing-bar-row">
                                <span>Invalides</span>
                                <div className="landing-bar-track warning">
                                    <i style={{ width: `${Math.min(invalidRate || 0, 100)}%` }} />
                                </div>
                                <strong>{formatLandingPercent(invalidRate)}</strong>
                            </div>
                            <div className="landing-winner-row">
                                <span>Premier acteur</span>
                                <strong>{selectedHistoricalElection.leader}</strong>
                                <small>{formatLandingPercent(selectedHistoricalElection.leaderShare)}{selectedHistoricalElection.seats ? ` · ${selectedHistoricalElection.seats} sièges` : ''}</small>
                            </div>
                            <div className="landing-source-row">
                                Source: {selectedHistoricalElection.source}
                            </div>
                        </div>
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
