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

/**
 * Type d'item de la palette de recherche. Permet de mixer dans
 * un même résultat :
 *  - `tab`     : navigation vers un onglet (13 onglets)
 *  - `action`  : action rapide globale (exporter PDF, actualiser KPIs)
 *
 * Le discriminateur `kind` permet à l'UI d'afficher un badge
 * (Tab / Action) et au consommateur (`<AdminPanel>`) de router
 * vers setActiveTab OU d'invoquer le callback.
 */
export type SearchResult =
    | {
          kind: 'tab';
          id: string;
          label: string;
          group: string;
          icon: string;
          tabKey: TabKey;
          score: number;
      }
    | {
          kind: 'action';
          id: string;
          label: string;
          group: string;
          icon: string;
          /** Sous-titre optionnel (description). */
          description?: string;
          /** Tag court pour l'UI ('Action', 'Export', 'Thème'...). */
          tag: string;
          score: number;
      };

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
 * Escape les caractères spéciaux regex dans une string. Évite
 * qu'une query comme "carte." plante le matcher word-boundary.
 */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Teste si `q` est une sous-séquence de `s` : les caractères de q
 * apparaissent dans s, dans le même ordre, mais pas nécessairement
 * contigus. Coût O(|q| × |s|), acceptable pour nos ~13 items + 100
 * résultats potentiels (users, etc.).
 *
 * Exemples :
 *   isSubsequence("scrp", "scrutins")    → true (s-c-r-p dans l'ordre)
 *   isSubsequence("scrp", "scruptin")   → true
 *   isSubsequence("xyz", "scrutins")     → false
 *   isSubsequence("", "anything")       → true (vide matche tout)
 */
function isSubsequence(q: string, s: string): boolean {
    if (!q) return true;
    let i = 0;
    for (let j = 0; j < s.length && i < q.length; j++) {
        if (s[j] === q[i]) i++;
    }
    return i === q.length;
}

/**
 * Définition d'une action rapide exposable dans la palette. Le
 * `run` est un callback qui sera invoqué quand l'utilisateur
 * sélectionne le résultat. Permet d'ajouter à la search des
 * raccourcis vers des actions globales (export PDF, toggle
 * thème, refresh KPIs...) qui ne correspondent pas à un onglet.
 */
export interface QuickAction {
    id: string;
    label: string;
    group: string;
    icon: string;
    /** Sous-titre optionnel (description courte). */
    description?: string;
    /** Tag court affiché en badge (ex: 'Export', 'Thème', 'API'). */
    tag: string;
    /** Callback invoqué à la sélection. */
    run: () => void;
}

/**
 * Construit l'index complet des résultats : tabs (NAV_GROUPS) +
 * actions rapides fournies par le consommateur. NAV_GROUPS est la
 * source unique de vérité pour les onglets ; les actions sont
 * extensibles à chaud via la prop `actions` du hook.
 */
function buildIndex(actions: QuickAction[]): SearchResult[] {
    const tabResults: SearchResult[] = NAV_GROUPS.flatMap((group) =>
        group.items.map((item) => ({
            kind: 'tab' as const,
            id: `tab-${item.id}`,
            label: item.label,
            group: group.title,
            icon: item.icon,
            tabKey: item.id,
            score: 0,
        })),
    );
    const actionResults: SearchResult[] = actions.map((a) => ({
        kind: 'action' as const,
        id: `action-${a.id}`,
        label: a.label,
        group: a.group,
        icon: a.icon,
        description: a.description,
        tag: a.tag,
        score: 0,
    }));
    return [...tabResults, ...actionResults];
}

export interface UseCommandPaletteOptions {
    /**
     * Callback quand l'utilisateur sélectionne un résultat (Enter ou clic).
     * Pour un tab : le caller dispatch vers setActiveTab(result.tabKey).
     * Pour une action : le caller peut appeler result.run() ou laisser
     * le hook l'invoquer automatiquement (cf. prop `autoRunActions`).
     */
    onSelect?: (result: SearchResult) => void;
    /**
     * Liste d'actions rapides exposées dans la palette. Si vide
     * (ou non fournie), seules les tabs sont cherchables.
     */
    actions?: QuickAction[];
    /**
     * Si true (défaut), le hook invoque automatiquement
     * `actions[i].run()` quand une action est sélectionnée, AVANT
     * d'appeler `onSelect`. Le caller n'a donc rien à faire pour
     * les actions ; il reçoit `onSelect` en notification (ex:
     * fermer la palette, logger l'événement).
     */
    autoRunActions?: boolean;
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
    const { onSelect, actions = [], autoRunActions = true } = options;

    // Index complet (tabs + actions rapides), reconstruit si la
    // liste d'actions change.
    const fullIndex = useMemo<SearchResult[]>(() => buildIndex(actions), [actions]);

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

    // Filtrage des résultats basé sur la query (V2 : fuzzy match évolué).
    // Stratégie : on combine 4 signaux pondérés.
    //   - Match EXACT (label === q)               → 1000 (le plus fort)
    //   - Match PREFIX (label commence par q)     → 100
    //   - Match WORD BOUNDARY (q est au début
    //     d'un mot du label)                       → 80
    //   - Match SUBSTRING (q apparaît dans label)  → 40
    //   - Match SUBSEQUENCE (q est sous-séquence
    //     des caractères du label, ex: "scrp" match
    //     "scrutins")                              → 20
    //   - Match GROUP (q dans le group title)      → 5
    //
    // Bonus de mot entier : si tous les mots de q matchent
    // (chacun par au moins un des mécanismes ci-dessus), on
    // ajoute +30. Permet de gérer "carte obs" → "Carte
    // observateurs".
    const results = useMemo<SearchResult[]>(() => {
        const q = normalize(query);
        if (!q) {
            return fullIndex.map((r) => ({ ...r, score: 0 }));
        }
        const qWords = q.split(/\s+/).filter(Boolean);

        function scoreFor(label: string, group: string): number {
            const lbl = normalize(label);
            const grp = normalize(group);
            if (!lbl) return 0;

            let best = 0;
            // 1. Exact match sur le label complet
            if (lbl === q) best = Math.max(best, 1000);
            // 2. Prefix
            if (lbl.startsWith(q)) best = Math.max(best, 100);
            // 3. Word boundary (q au début d'un mot)
            if (new RegExp(`\\b${escapeRegex(q)}`).test(lbl)) {
                best = Math.max(best, 80);
            }
            // 4. Substring
            if (lbl.includes(q)) best = Math.max(best, 40);
            // 5. Subsequence (caractères dans l'ordre mais pas contigus)
            if (isSubsequence(q, lbl)) best = Math.max(best, 20);
            // 6. Group match (toujours faible, fallback)
            if (grp.includes(q)) best = Math.max(best, 5);

            // Bonus mot-entier : si chaque mot de q matche au moins
            // une fois dans le label (substring/prefix/word-boundary)
            if (qWords.length > 1) {
                const allWordsMatch = qWords.every((w) =>
                    lbl.includes(w) || new RegExp(`\\b${escapeRegex(w)}`).test(lbl),
                );
                if (allWordsMatch) best += 30;
            }
            return best;
        }

        const scored = fullIndex
            .map((r) => ({ ...r, score: scoreFor(r.label, r.group) }))
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score);
        return scored;
    }, [query, fullIndex]);

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
        // Pour une action, on l'invoque d'abord (si autoRun) puis on
        // notifie onSelect (qui peut fermer la palette, logger...).
        // Pour un tab, on ne fait que notifier — le caller dispatch
        // vers setActiveTab.
        if (r.kind === 'action' && autoRunActions) {
            const action = actions.find((a) => `action-${a.id}` === r.id);
            if (action) {
                try {
                    action.run();
                } catch (err) {
                    // Une action qui throw ne doit pas planter la palette ;
                    // on logge et on continue (la palette se ferme quand même).
                    // eslint-disable-next-line no-console
                    console.error('[command-palette] action run failed:', err);
                }
            }
        }
        if (onSelect) onSelect(r);
        closePalette();
    }, [results, selectedIndex, onSelect, closePalette, actions, autoRunActions]);

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
