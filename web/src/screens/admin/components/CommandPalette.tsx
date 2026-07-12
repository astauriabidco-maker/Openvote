/**
 * CommandPalette — la modale de recherche ⌘K (refonte 2026-07).
 *
 * Affiche un input centré en haut de l'écran + une liste de résultats
 * filtrés. Navigation clavier (↑↓, Enter, Esc). Clic pour sélectionner.
 *
 * Pourquoi ce composant est "presentationnel" :
 *   - Il NE gère PAS son propre state (open/query/results/highlight).
 *   - Tout vient de `useCommandPalette` (le hook centralisé). Avantage :
 *     l'AdminPanel peut ouvrir la palette depuis plusieurs endroits
 *     (TopBar search, ⌘K global futur) sans dupliquer le state.
 *   - Le composant n'a AUCUNE logique métier : si on veut ajouter
 *     une recherche users/elections, on étend le hook + l'index, pas
 *     ce composant.
 *
 * UX :
 *   - Backdrop cliquable = ferme
 *   - Backdrop flou (4px) pour focus sur la modale
 *   - Highlight du résultat sélectionné : bg bleu transparent + barre gauche
 *   - Compteur discret "X résultats" en bas
 *   - État vide (0 résultat) : message "Aucun onglet trouvé pour X"
 *
 * Limites V1 :
 *   - Pas de fuzzy match évolué (le hook fait un substring simple)
 *   - Pas d'aperçu détaillé du résultat (juste icône + label + group)
 *   - Pas de raccourci par résultat (ex: tape 1-9 pour jump direct)
 */

import { useEffect, useRef } from 'react';
import type { SearchResult } from '../hooks/useCommandPalette';

export interface CommandPaletteProps {
    open: boolean;
    query: string;
    onQueryChange: (q: string) => void;
    results: SearchResult[];
    selectedIndex: number;
    onSelect: (result: SearchResult) => void;
    onHighlightPrev: () => void;
    onHighlightNext: () => void;
    onSelectHighlighted: () => void;
    onClose: () => void;
    /** Texte du raccourci affiché en bas de l'input (⌘K ou Ctrl+K). */
    shortcutHint: string;
}

function ChevronIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

function HighlightedLabel({ label, query }: { label: string; query: string }) {
    if (!query) return <>{label}</>;
    const q = query.trim();
    if (q.length === 0) return <>{label}</>;
    // Recherche case-insensitive du premier match pour highlight.
    const lowerLabel = label.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerLabel.indexOf(lowerQ);
    if (idx === -1) return <>{label}</>;
    return (
        <>
            {label.slice(0, idx)}
            <mark style={{
                background: 'rgba(88,166,255,0.3)',
                color: 'var(--color-text-primary, #e6edf3)',
                padding: '0 2px',
                borderRadius: 2,
            }}>
                {label.slice(idx, idx + q.length)}
            </mark>
            {label.slice(idx + q.length)}
        </>
    );
}

export default function CommandPalette({
    open,
    query,
    onQueryChange,
    results,
    selectedIndex,
    onSelect,
    onHighlightPrev,
    onHighlightNext,
    onSelectHighlighted,
    onClose,
    shortcutHint,
}: CommandPaletteProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    // Auto-focus l'input à l'ouverture
    useEffect(() => {
        if (open) {
            // Defer au tick suivant pour laisser le DOM monter
            const t = window.setTimeout(() => inputRef.current?.focus(), 0);
            return () => window.clearTimeout(t);
        }
        return undefined;
    }, [open]);

    // Scroll automatique vers le résultat highlighted s'il sort de la vue.
    // Note jsdom : scrollIntoView existe sur Element mais throw "not a
    // function" au runtime (jsdom ne l'implémente pas). On guarde via
    // typeof pour éviter de crasher en test.
    useEffect(() => {
        if (!open) return;
        const el = listRef.current?.querySelector<HTMLElement>(
            `[data-result-index="${selectedIndex}"]`,
        );
        if (el && typeof el.scrollIntoView === 'function') {
            try { el.scrollIntoView({ block: 'nearest' }); } catch { /* jsdom no-op */ }
        }
    }, [selectedIndex, open]);

    // Bind clavier local (en plus du global du hook) pour ↑↓ + Enter
    // quand le focus est dans la modale. Le hook bind le raccourci global
    // ⌘K et Escape, mais on bind ici les flèches/Enter car l'input
    // a déjà le focus et on veut intercepter avant le comportement
    // natif (ex: ↑/↓ dans un input peut faire autre chose).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                onHighlightNext();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                onHighlightPrev();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onSelectHighlighted();
            }
        };
        // window plutôt que input pour intercepter même si focus ailleurs
        // dans la modale (mais peu probable vu que l'input prend le focus).
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onHighlightNext, onHighlightPrev, onSelectHighlighted]);

    if (!open) return null;

    return (
        <div
            className="command-palette-backdrop"
            onClick={onClose}
            data-testid="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Recherche rapide"
        >
            <div
                className="command-palette-modal"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Input row */}
                <div className="command-palette-input-row">
                    <svg
                        width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden
                        style={{ color: 'var(--color-text-muted, #545d68)' }}
                    >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                        ref={inputRef}
                        className="command-palette-input"
                        type="text"
                        placeholder="Rechercher un onglet, une action rapide, un utilisateur…"
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        data-testid="command-palette-input"
                    />
                    <kbd className="command-palette-kbd" aria-hidden>{shortcutHint}</kbd>
                </div>

                {/* Results list */}
                <div className="command-palette-results" ref={listRef} role="listbox">
                    {results.length === 0 ? (
                        <div className="command-palette-empty" data-testid="command-palette-empty">
                            <span>Aucun onglet ni action trouvé pour </span>
                            <strong>"{query}"</strong>
                        </div>
                    ) : (
                        results.map((r, i) => {
                            const isSelected = i === selectedIndex;
                            // Badge selon le type d'item.
                            // - tab → "Onglet"
                            // - action → action.tag (ex: "Export", "Thème")
                            const kindBadge = r.kind === 'tab' ? 'Onglet' : r.tag;
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    data-result-index={i}
                                    data-selected={isSelected ? 'true' : 'false'}
                                    data-result-kind={r.kind}
                                    className={`command-palette-result${isSelected ? ' selected' : ''}`}
                                    onClick={() => onSelect(r)}
                                    role="option"
                                    aria-selected={isSelected}
                                    data-testid={`command-palette-result-${i}`}
                                >
                                    <span className="command-palette-result-icon" aria-hidden>
                                        {r.icon}
                                    </span>
                                    <span className="command-palette-result-text">
                                        <span className="command-palette-result-label">
                                            <HighlightedLabel label={r.label} query={query} />
                                        </span>
                                        <span className="command-palette-result-group">{r.group}</span>
                                    </span>
                                    <span
                                        className={`command-palette-result-kind kind-${r.kind}`}
                                        data-result-kind={r.kind}
                                        data-testid={`command-palette-kind-${i}`}
                                    >
                                        {kindBadge}
                                    </span>
                                    {isSelected && <ChevronIcon />}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer hints */}
                <div className="command-palette-footer">
                    <span>
                        <kbd className="command-palette-kbd">↑</kbd>
                        <kbd className="command-palette-kbd">↓</kbd>
                        naviguer
                    </span>
                    <span>
                        <kbd className="command-palette-kbd">↵</kbd>
                        sélectionner
                    </span>
                    <span>
                        <kbd className="command-palette-kbd">Esc</kbd>
                        fermer
                    </span>
                    <span className="command-palette-count" data-testid="command-palette-count">
                        {results.length} résultat{results.length > 1 ? 's' : ''}
                    </span>
                </div>
            </div>
        </div>
    );
}
