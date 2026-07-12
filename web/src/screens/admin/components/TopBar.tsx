/**
 * TopBar — barre supérieure du BO refondu (refonte 2026-07).
 *
 * Remplace l'ancien 'admin-header-actions' qui était un mélange de
 * boutons (Observers Map, Export PDF, theme, lang, alertes) alignés
 * au-dessus du contenu. Le TopBar est unifié en 4 zones :
 *
 *   1. Brand (gauche, fixe) : logo + nom de l'app
 *   2. Breadcrumb (centre-gauche) : "Section / Onglet courant"
 *   3. Search trigger (centre-droite) : ⌘K placeholder (non fonctionnel
 *      pour l'instant, ouvre une modale d'information)
 *   4. Actions (droite) : indicateurs, thème, alertes, avatar
 *
 * Pourquoi un search trigger sans impl :
 *   - Coût d'impl : indexation des items + résultats dynamiques ~2-3h
 *   - Bénéfice UX : déjà visible = invitation à l'usage, peut être
 *     branché plus tard sans changer l'API du composant
 *   - Évite de promettre une feature à moitié livrée
 *
 * Note d'accessibilité :
 *   - Brand est un <a> vers '/' (retour à l'accueil)
 *   - Breadcrumb utilise <nav aria-label="Fil d'Ariane">
 *   - Le search trigger est un <button> avec raccourci visible
 *   - Les icon-btns ont des aria-label via title
 *
 * Le composant NE récupère PAS le user / thème / lang lui-même :
 * tout vient des props. C'est l'AdminPanel qui passe ce qu'il faut.
 */

import { type ReactNode } from 'react';
import type { TabKey } from '../constants';
import { NAV_GROUPS, TAB_TO_GROUP } from '../constants';

export interface TopBarProps {
    activeTab: TabKey;
    /** Libellé de l'utilisateur (2 premières lettres affichées dans l'avatar). */
    userName?: string;
    /** Nombre d'alertes actives (badge rouge sur l'icône cloche). */
    alertCount?: number;
    /** Toggle du thème. */
    theme: 'dark' | 'light';
    onToggleTheme: () => void;
    /** Toggle de la langue. */
    lang: 'fr' | 'en';
    onToggleLang: () => void;
    /** Indicateur online/offline (true = problème). */
    isOnline?: boolean;
    /** Clic sur le search trigger (placeholder, ouvre future ⌘K modal). */
    onSearchClick?: () => void;
    /** Clic sur l'avatar (ouvre future menu utilisateur). */
    onAvatarClick?: () => void;
    /** Clic sur l'icône alertes. */
    onAlertsClick?: () => void;
    /** Slot optionnel à droite des actions (ex: bouton "Invite user"). */
    rightSlot?: ReactNode;
}

/**
 * Retrouve le libellé humain d'un onglet via NAV_GROUPS.
 * Retourne l'ID brut si l'onglet n'est pas trouvé (fallback défensif).
 */
function getTabLabel(id: TabKey): string {
    for (const group of NAV_GROUPS) {
        const item = group.items.find((i) => i.id === id);
        if (item) return item.label;
    }
    return id;
}

function getGroupTitle(id: TabKey): string {
    const groupKey = TAB_TO_GROUP[id];
    if (!groupKey) return 'Openvote';
    const group = NAV_GROUPS.find((g) => g.key === groupKey);
    return group?.title ?? 'Openvote';
}

function initialsOf(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TopBar({
    activeTab,
    userName = 'admin',
    alertCount = 0,
    theme,
    onToggleTheme,
    lang,
    onToggleLang,
    isOnline = true,
    onSearchClick,
    onAvatarClick,
    onAlertsClick,
    rightSlot,
}: TopBarProps) {
    const tabLabel = getTabLabel(activeTab);
    const groupTitle = getGroupTitle(activeTab);

    return (
        <header className="admin-topbar" data-testid="admin-topbar">
            {/* Zone 1 : Brand */}
            <a
                className="admin-topbar-brand"
                href="/"
                title="Retour à l'accueil"
                data-testid="topbar-brand"
            >
                <span className="admin-topbar-brand-mark" aria-hidden>🗳️</span>
                <span className="admin-topbar-brand-text">Openvote</span>
            </a>

            {/* Zone 2 : Breadcrumb */}
            <nav className="admin-topbar-breadcrumb" aria-label="Fil d'Ariane">
                <a href="#" onClick={(e) => e.preventDefault()}>{groupTitle}</a>
                <span className="admin-topbar-breadcrumb-sep" aria-hidden>/</span>
                <span className="admin-topbar-breadcrumb-current" aria-current="page">
                    {tabLabel}
                </span>
            </nav>

            {/* Zone 3 : Search trigger (placeholder ⌘K) */}
            <button
                type="button"
                className="admin-topbar-search"
                onClick={onSearchClick}
                title="Recherche rapide (⌘K)"
                data-testid="topbar-search"
            >
                <svg
                    width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden
                >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                </svg>
                <span className="admin-topbar-search-label">
                    Rechercher onglet, utilisateur, scrutin…
                </span>
                <span className="admin-topbar-search-kbd" aria-hidden>⌘K</span>
            </button>

            {/* Slot optionnel (bouton d'action rapide, ex: "Invite user") */}
            {rightSlot}

            {/* Zone 4 : Actions */}
            <div className="admin-topbar-actions">
                {!isOnline && (
                    <span
                        className="admin-topbar-offline-dot"
                        title="Hors ligne"
                        aria-label="Hors ligne"
                        data-testid="topbar-offline"
                    />
                )}
                <button
                    type="button"
                    className="admin-topbar-icon-btn"
                    onClick={onAlertsClick}
                    title={`${alertCount} alerte${alertCount > 1 ? 's' : ''}`}
                    aria-label={`Alertes (${alertCount})`}
                    data-testid="topbar-alerts"
                >
                    ⚠️
                    {alertCount > 0 && (
                        <span className="admin-topbar-icon-indicator" aria-hidden>
                            {alertCount}
                        </span>
                    )}
                </button>
                <button
                    type="button"
                    className="admin-topbar-icon-btn"
                    onClick={onToggleTheme}
                    title={`Thème ${theme === 'dark' ? 'clair' : 'sombre'}`}
                    aria-label="Changer de thème"
                    data-testid="topbar-theme"
                >
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <button
                    type="button"
                    className="admin-topbar-icon-btn"
                    onClick={onToggleLang}
                    title="Changer de langue"
                    aria-label="Changer de langue"
                    data-testid="topbar-lang"
                >
                    {lang.toUpperCase()}
                </button>
                <button
                    type="button"
                    className="admin-topbar-avatar"
                    onClick={onAvatarClick}
                    title={userName}
                    aria-label={`Compte de ${userName}`}
                    data-testid="topbar-avatar"
                >
                    {initialsOf(userName)}
                </button>
            </div>
        </header>
    );
}
