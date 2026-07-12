/**
 * useCommandPalette — hook pour la palette de recherche ⌘K.
 *
 * Responsabilités :
 *   - State : open/close, query, results, selectedIndex
 *   - Raccourci clavier global : ⌘K (Mac) / Ctrl+K (autres) ouvre, Esc ferme
 *   - Reset propre à la fermeture (query, selectedIndex)
 *
 * Le composant <CommandPalette> consomme ce hook via `open`, `query`,
 * `results`, `selectedIndex` et dispatch via les setters + helpers
 * (`onSelect`, `onHighlight`, `onQueryChange`, `close`).
 *
 * Pourquoi ce hook et pas un composant autonome :
 *   - Le raccourci ⌘K doit être GLOBAL (écouté sur window, pas sur un input).
 *   - Le state doit être partagé entre TopBar (bouton search) et la
 *     CommandPalette (modale). Un hook centralisé évite le prop drilling
 *     et la double source de vérité.
 *
 * Limites connues (V1) :
 *   - Pas de fuzzy match évolué : simple substring match (insensible
 *     à la casse + accents) sur label + group title.
 *   - Pas de mémoire des requêtes récentes.
 *   - Pas de navigation vers les résultats autres que les onglets.
 *     V2 ajoutera recherche users, elections, reports.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TabKey } from '../constants';
import { NAV_GROUPS } from '../constants';

export interface SearchResult {
    /** Identifiant unique (utilisé comme key React). */
    id: string;
    /** Libellé affiché. */
    label: string;
    /** Section parente (ex: 'Opérations terrain'). */
    group: string;
    /** Icône emoji. */
    icon: string;
    /** Tab key cible (pour setActiveTab). */
    tabKey: TabKey;
    /** Score : plus haut = plus pertinent. Non exposé dans l'UI. */
    score: number;
}

/**
 * Normalise une string pour la recherche : lowercase + retire les
 * accents + retire la ponctuation. Permet de matcher "elections"
 * sur "Élections" et "scrutins" sur "Scrutins & Analyses".
 */
function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // retire les accents
        .replace(/[^\w\s]/g, ' ')        // ponctuation → espace
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Construit l'index initial : 1 entrée par item de NAV_GROUPS. On
 * utilise NAV_GROUPS comme source unique de vérité (les onglets
 * ajoutés là apparaissent automatiquement dans la search).
 */
const BASE_INDEX: SearchResult[] = NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
        id: `tab-${item.id}`,
        label: item.label,
        group: group.title,
        icon: item.icon,
        tabKey: item.id,
        // Score initial : tout est équivalent. Sera recalculé au search.
        score: 0,
    })),
);

export interface UseCommandPaletteOptions {
    /**
     * Callback quand l'utilisateur sélectionne un résultat (Enter ou clic).
     * L'appelant dispatch typiquement vers setActiveTab(result.tabKey).
     */
    onSelect?: (result: SearchResult) => void;
}

export interface UseCommandPaletteReturn {
    open: boolean;
    query: string;
    setQuery: (q: string) => void;
    results: SearchResult[];
    selectedIndex: number;
    /** Highlight le résultat précédent (↑). */
    highlightPrev: () => void;
    /** Highlight le résultat suivant (↓). */
    highlightNext: () => void;
    /** Sélectionne le résultat highlighted (Enter). */
    selectHighlighted: () => void;
    /** Ouvre la palette. */
    openPalette: () => void;
    /** Ferme la palette + reset query/selection. */
    closePalette: () => void;
    /** Raccourci actif (info pour les tests / l'UI). */
    shortcutHint: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function useCommandPalette(
    options: UseCommandPaletteOptions = {},
): UseCommandPaletteReturn {
    const { onSelect } = options;

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset propre à la fermeture
    const closePalette = useCallback(() => {
        setOpen(false);
        setQuery('');
        setSelectedIndex(0);
    }, []);

    const openPalette = useCallback(() => {
        setOpen(true);
        setQuery('');
        setSelectedIndex(0);
    }, []);

    // Raccourci clavier global : ⌘K (Mac) / Ctrl+K (autres) ouvre.
    // Escape ferme la palette.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
            if (isCmdK) {
                e.preventDefault();
                if (open) {
                    closePalette();
                } else {
                    openPalette();
                }
            } else if (e.key === 'Escape' && open) {
                e.preventDefault();
                closePalette();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, openPalette, closePalette]);

    // Filtrage des résultats basé sur la query.
    // Stratégie : substring match (normalisé) sur label + group.
    // Score :
    //   - match exact (label === normalized query) → 1000
    //   - match au début du label → 100
    //   - match dans le label → 50
    //   - match dans le group → 10
    //   - pas de match → exclu
    const results = useMemo<SearchResult[]>(() => {
        const q = normalize(query);
        if (!q) {
            // Pas de query : on retourne les 13 onglets dans l'ordre
            // de NAV_GROUPS, score 0.
            return BASE_INDEX.map((r) => ({ ...r, score: 0 }));
        }
        const scored = BASE_INDEX
            .map((r) => {
                const lbl = normalize(r.label);
                const grp = normalize(r.group);
                let score = 0;
                if (lbl === q) score = 1000;
                else if (lbl.startsWith(q)) score = 100;
                else if (lbl.includes(q)) score = 50;
                else if (grp.includes(q)) score = 10;
                return { ...r, score };
            })
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score);
        return scored;
    }, [query]);

    // Clamp selectedIndex sur la taille des résultats (peut changer
    // à mesure que la query change, ex: on supprime tout).
    useEffect(() => {
        if (selectedIndex >= results.length) {
            setSelectedIndex(Math.max(0, results.length - 1));
        }
    }, [results.length, selectedIndex]);

    // Reset selectedIndex à 0 quand la query change (UX : commencer
    // par le top match quand on tape).
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const highlightPrev = useCallback(() => {
        setSelectedIndex((i) => (i <= 0 ? Math.max(0, results.length - 1) : i - 1));
    }, [results.length]);

    const highlightNext = useCallback(() => {
        setSelectedIndex((i) => (i >= results.length - 1 ? 0 : i + 1));
    }, [results.length]);

    const selectHighlighted = useCallback(() => {
        const r = results[selectedIndex];
        if (!r) return;
        if (onSelect) onSelect(r);
        closePalette();
    }, [results, selectedIndex, onSelect, closePalette]);

    return {
        open,
        query,
        setQuery,
        results,
        selectedIndex,
        highlightPrev,
        highlightNext,
        selectHighlighted,
        openPalette,
        closePalette,
        shortcutHint: isMac ? '⌘K' : 'Ctrl+K',
    };
}
