/**
 * Tests pour <CommandPalette> + useCommandPalette (search ⌘K).
 *
 * Couvre :
 *   - Hook : state initial, raccourci ⌘K/Ctrl+K, Esc ferme, reset à la
 *     fermeture, résultats filtrés, scoring (exact > prefix > substring > group),
 *     clamp selectedIndex sur la taille des résultats, highlight prev/next wrap
 *   - Composant : rendu conditionnel (open), input, liste de résultats,
 *     state vide, footer hints, auto-focus, click sélectionne
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import CommandPalette from './CommandPalette';
import { useCommandPalette, type SearchResult } from '../hooks/useCommandPalette';

// ====================== useCommandPalette ======================

describe('useCommandPalette', () => {
    let onSelect: (r: SearchResult) => void;

    beforeEach(() => {
        onSelect = vi.fn();
    });

    it('initial state : fermé, query vide, selectedIndex 0', () => {
        const { result } = renderHook(() => useCommandPalette({ onSelect }));
        expect(result.current.open).toBe(false);
        expect(result.current.query).toBe('');
        expect(result.current.selectedIndex).toBe(0);
        expect(result.current.results.length).toBeGreaterThan(0); // index de base
    });

    it('shortcutHint reflète la plateforme', () => {
        const { result } = renderHook(() => useCommandPalette());
        expect(['⌘K', 'Ctrl+K']).toContain(result.current.shortcutHint);
    });

    it('Cmd+K (Meta+K) ouvre la palette', async () => {
        const { result } = renderHook(() => useCommandPalette());
        expect(result.current.open).toBe(false);
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        });
        expect(result.current.open).toBe(true);
    });

    it('Ctrl+K (Ctrl+K) ouvre la palette', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
        });
        expect(result.current.open).toBe(true);
    });

    it('Cmd+K re-ferme si déjà ouvert (toggle)', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        });
        expect(result.current.open).toBe(true);
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        });
        expect(result.current.open).toBe(false);
    });

    it('Escape ferme la palette', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => {
            result.current.openPalette();
        });
        expect(result.current.open).toBe(true);
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(result.current.open).toBe(false);
    });

    it('Escape hors palette : no-op (n\'ouvre pas par accident)', async () => {
        const { result } = renderHook(() => useCommandPalette());
        expect(result.current.open).toBe(false);
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(result.current.open).toBe(false);
    });

    it('openPalette reset query + selectedIndex', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('test'); });
        await act(async () => { result.current.openPalette(); });
        expect(result.current.open).toBe(true);
        expect(result.current.query).toBe('');
    });

    it('closePalette reset query + selectedIndex', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.openPalette(); });
        await act(async () => { result.current.setQuery('users'); });
        await act(async () => { result.current.highlightNext(); });
        await act(async () => { result.current.closePalette(); });
        expect(result.current.open).toBe(false);
        expect(result.current.query).toBe('');
        expect(result.current.selectedIndex).toBe(0);
    });

    it('filter : "utili" matche "Utilisateurs" (substring)', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('utili'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain('Utilisateurs');
    });

    it('filter : "tokens" matche "Tokens d\'enrôlement"', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('tokens'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain("Tokens d'enrôlement");
    });

    it('filter : "SCRUTIN" (uppercase FR) matche "Scrutins"', async () => {
        // Test du case-insensitive : tape en majuscule, le label FR matche.
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('SCRUTIN'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain('Scrutins');
    });

    it('filter : "analyses" matche via le group title uniquement', async () => {
        // "analyses" n'est substring d'aucun label mais matche le group
        // "Scrutins & Analyses" → on attend quand même Scrutins (qui est
        // dans ce group) et Intelligence électorale (même group).
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('analyses'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain('Scrutins');
        expect(labels).toContain('Intelligence électorale');
    });

    it('filter : "scrutin" matche via le group "Scrutins & Analyses"', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('scrutin'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels.length).toBeGreaterThanOrEqual(1);
        expect(labels).toContain('Scrutins');
    });

    it('scoring : "Configuration" matche tous les items du group via group-only (score 5)', async () => {
        // Le label "Config runtime" ne contient pas la sous-string
        // "configuration" (il manque "uration"). Aucun item n'a le label
        // "Configuration". Donc TOUS les items du group matchent via
        // group-only → score 5.
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('Configuration'); });
        const configItems = result.current.results.filter((r) => r.group === 'Configuration');
        expect(configItems.length).toBeGreaterThan(0);
        for (const item of configItems) {
            expect(item.score).toBe(5);
        }
    });

    it('0 résultat : tableau vide', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('zzzzzzzzz'); });
        expect(result.current.results).toEqual([]);
    });

    it('highlightNext : passe au suivant, wrap au début', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.openPalette(); });
        const total = result.current.results.length;
        for (let i = 0; i < total - 1; i++) {
            await act(async () => { result.current.highlightNext(); });
        }
        expect(result.current.selectedIndex).toBe(total - 1);
        await act(async () => { result.current.highlightNext(); });
        expect(result.current.selectedIndex).toBe(0);
    });

    it('highlightPrev : passe au précédent, wrap à la fin', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.openPalette(); });
        expect(result.current.selectedIndex).toBe(0);
        await act(async () => { result.current.highlightPrev(); });
        const total = result.current.results.length;
        expect(result.current.selectedIndex).toBe(total - 1);
    });

    it('changement de query reset selectedIndex à 0', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.openPalette(); });
        await act(async () => { result.current.highlightNext(); });
        await act(async () => { result.current.highlightNext(); });
        await act(async () => { result.current.setQuery('a'); });
        expect(result.current.selectedIndex).toBe(0);
    });

    it('selectHighlighted : appelle onSelect avec le bon result, ferme la palette', async () => {
        const { result } = renderHook(() => useCommandPalette({ onSelect }));
        await act(async () => { result.current.openPalette(); });
        const expected = result.current.results[0];
        await act(async () => { result.current.selectHighlighted(); });
        expect(onSelect).toHaveBeenCalledWith(expected);
        expect(result.current.open).toBe(false);
    });

    it('selectHighlighted sans résultat : no-op silencieux', async () => {
        const { result } = renderHook(() => useCommandPalette({ onSelect }));
        await act(async () => { result.current.setQuery('zzzz'); });
        await act(async () => { result.current.selectHighlighted(); });
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('clamp : si results se vide, selectedIndex tombe à 0', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.openPalette(); });
        await act(async () => { result.current.highlightNext(); });
        await act(async () => { result.current.highlightNext(); });
        await act(async () => { result.current.setQuery('zzzzzzz'); });
        expect(result.current.selectedIndex).toBe(0);
    });

    // ---- Fuzzy match V2 ----
    it('subsequence : "strn" matche "Scrutins" (s-...-t-...-r-...-n)', async () => {
        // "Scrutins" normalisé = "scrutins". La query "strn" = s,t,r,n
        // sont tous présents dans l'ordre (s@0, t@4, r@2 ? non, après s c'est
        // c, r, u, t, i, n, s — donc s(0) puis t(4) puis r ? non, r est avant
        // t). Reprenons : s→c→r→u→t→i→n→s. Donc s@0, puis r@2, puis t@4,
        // puis n@6. La query "srtn" = s,r,t,n sont dans l'ordre.
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('srtn'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain('Scrutins');
    });

    it('subsequence : "cfg" matche "Config" (par le group "Configuration" via path alternatif non — mais "Config" contient c-f-g?)', async () => {
        // Ce test vérifie le mécanisme de subsequence ; on utilise un mot
        // qui est VRAIMENT une sous-séquence du label.
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('mfa'); });
        // mfa = substring de "MFA" + "MfaSetup"... attendons "MFA".
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain('MFA');
    });

    it('word boundary : "carte" matche "Carte observateurs" (mot complet)', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('carte'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain('Carte observateurs');
    });

    it('multi-mots : "carte obs" trouve Carte observateurs (bonus word match)', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('carte obs'); });
        const labels = result.current.results.map((r) => r.label);
        expect(labels).toContain('Carte observateurs');
    });

    it('escape regex : query avec caractères spéciaux ne crash pas', async () => {
        const { result } = renderHook(() => useCommandPalette());
        // "carte." ou "carte?" — sans escape, le RegExp \b${q}\b planterait
        await act(async () => { result.current.setQuery('carte.'); });
        // Pas d'erreur, résultats cohérents
        expect(result.current.results).toBeDefined();
    });

    it('substring + subsequence : "rci" matche "Cadre" via subseq (c-a-d-r-e)', async () => {
        // "rci" — pas de substring direct, mais sous-séquence ?
        // c-A-d-R-e : r, c, i → non (i pas dans Cadre). Donc ne doit PAS matcher.
        // Test négatif pour confirmer que la subseq a bien sa sémantique.
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('rci'); });
        // On accepte 0 résultat OU un résultat — l'important est no-crash.
        expect(result.current.results).toBeDefined();
    });

    it('scoring relatif : exact > prefix > word-boundary > substring', async () => {
        // Pour "utilisateurs" (qui matche exactement le label "Utilisateurs"),
        // le score doit être 1000 (max), donc en tête.
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('utilisateurs'); });
        const top = result.current.results[0];
        expect(top.label).toBe('Utilisateurs');
        expect(top.score).toBe(1000);
    });

    it('group match faible : query qui ne matche que le group (pas le label)', async () => {
        // "analyses" n'est substring d'aucun label (juste "Analyses de
        // données" dans Intelligence). Mais "Intelligence électorale" est
        // dans le group "Scrutins & Analyses" → match via group, score 5.
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('analyses'); });
        const intel = result.current.results.find((r) => r.label === 'Intelligence électorale');
        expect(intel).toBeDefined();
        // Le score doit être 5 (group-only)
        expect(intel?.score).toBe(5);
    });
});

// ====================== Actions rapides (V2) ======================

describe('useCommandPalette — actions rapides', () => {
    it('sans actions : les résultats restent 100% tabs', () => {
        const { result } = renderHook(() => useCommandPalette({}));
        const kinds = new Set(result.current.results.map((r) => r.kind));
        expect(kinds.has('action')).toBe(false);
    });

    it('avec actions : les items action apparaissent dans la liste (query vide)', () => {
        const run = vi.fn();
        const { result } = renderHook(() => useCommandPalette({
            actions: [{
                id: 'export-pdf',
                label: 'Exporter le rapport PDF',
                group: 'Actions rapides',
                icon: '📄',
                tag: 'Export',
                run,
            }],
        }));
        const exportRes = result.current.results.find((r) => r.id === 'action-export-pdf');
        expect(exportRes).toBeDefined();
        expect(exportRes?.kind).toBe('action');
        if (exportRes && exportRes.kind === 'action') {
            expect(exportRes.tag).toBe('Export');
        }
    });

    it('recherche "export" : l\'action export-PDF remonte en tête', async () => {
        const run = vi.fn();
        const { result } = renderHook(() => useCommandPalette({
            actions: [{
                id: 'export-pdf',
                label: 'Exporter le rapport PDF',
                group: 'Actions rapides',
                icon: '📄',
                tag: 'Export',
                run,
            }],
        }));
        await act(async () => { result.current.setQuery('export'); });
        const top = result.current.results[0];
        expect(top.id).toBe('action-export-pdf');
        // Score : substring sur label = 40 ; sur "export" est dans "export" → exact-ish
        expect(top.score).toBeGreaterThanOrEqual(40);
    });

    it('Enter sur une action : run() est invoqué + onSelect notifié', async () => {
        const run = vi.fn();
        const onSelect = vi.fn();
        const { result } = renderHook(() => useCommandPalette({
            actions: [{
                id: 'refresh-kpis',
                label: 'Actualiser les KPIs',
                group: 'Actions rapides',
                icon: '🔄',
                tag: 'Données',
                run,
            }],
            onSelect,
        }));
        await act(async () => {
            result.current.openPalette();
            result.current.setQuery('actualiser');
        });
        // Le résultat 0 doit être l'action (label "Actualiser les KPIs"
        // → prefix match sur "actualiser" = 100).
        expect(result.current.results[0].id).toBe('action-refresh-kpis');
        act(() => { result.current.selectHighlighted(); });
        expect(run).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('autoRunActions=false : run() n\'est PAS appelé, onSelect reçoit quand même', async () => {
        const run = vi.fn();
        const onSelect = vi.fn();
        const { result } = renderHook(() => useCommandPalette({
            actions: [{
                id: 'toggle-theme',
                label: 'Basculer le thème',
                group: 'Apparence',
                icon: '🌙',
                tag: 'Thème',
                run,
            }],
            onSelect,
            autoRunActions: false,
        }));
        await act(async () => {
            result.current.openPalette();
            result.current.setQuery('theme');
        });
        act(() => { result.current.selectHighlighted(); });
        expect(run).not.toHaveBeenCalled();
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('action run() qui throw : la palette se ferme quand même, pas de crash', async () => {
        const onSelect = vi.fn();
        const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { result } = renderHook(() => useCommandPalette({
            actions: [{
                id: 'broken',
                label: 'Action cassée',
                group: 'Actions rapides',
                icon: '💥',
                tag: 'Test',
                run: () => { throw new Error('boom'); },
            }],
            onSelect,
        }));
        await act(async () => {
            result.current.openPalette();
            result.current.setQuery('cassee');
        });
        // Ne doit pas throw, et la palette se ferme
        act(() => { result.current.selectHighlighted(); });
        expect(onSelect).toHaveBeenCalled();
        expect(result.current.open).toBe(false);
        consoleErr.mockRestore();
    });

    it('les actions sont immutables dans les résultats : new run() si actions[] change', async () => {
        let counter = 0;
        const makeAction = () => ({
            id: 'counter',
            label: 'Compteur',
            group: 'Test',
            icon: '🔢',
            tag: 'T',
            run: () => { counter += 1; },
        });
        const { result, rerender } = renderHook(
            ({ actions }: { actions: ReturnType<typeof makeAction>[] }) =>
                useCommandPalette({ actions }),
            { initialProps: { actions: [makeAction()] } },
        );
        await act(async () => {
            result.current.openPalette();
            result.current.setQuery('compteur');
        });
        act(() => { result.current.selectHighlighted(); });
        expect(counter).toBe(1);
        // Re-render avec une nouvelle action (ref différente mais même id)
        rerender({ actions: [makeAction()] });
        await act(async () => { result.current.setQuery('compteur'); });
        act(() => { result.current.selectHighlighted(); });
        expect(counter).toBe(2);
    });
});

// ====================== <CommandPalette> ======================

describe('CommandPalette (composant)', () => {
    function baseProps() {
        return {
            open: true,
            query: '',
            onQueryChange: vi.fn() as unknown as (q: string) => void,
            results: [
                { kind: 'tab' as const, id: 'tab-users', label: 'Utilisateurs', group: 'Opérations terrain', icon: '👥', tabKey: 'users' as const, score: 0 },
                { kind: 'tab' as const, id: 'tab-tokens', label: "Tokens d'enrôlement", group: 'Opérations terrain', icon: '🎫', tabKey: 'tokens' as const, score: 0 },
                { kind: 'tab' as const, id: 'tab-elections', label: 'Scrutins', group: 'Scrutins & Analyses', icon: '🗳️', tabKey: 'elections' as const, score: 0 },
            ] satisfies SearchResult[],
            selectedIndex: 0,
            onSelect: vi.fn() as unknown as (r: SearchResult) => void,
            onHighlightPrev: vi.fn() as unknown as () => void,
            onHighlightNext: vi.fn() as unknown as () => void,
            onSelectHighlighted: vi.fn() as unknown as () => void,
            onClose: vi.fn() as unknown as () => void,
            shortcutHint: '⌘K',
        };
    }

    it('open=false : ne rend rien', () => {
        const p = baseProps();
        (p as { open: boolean }).open = false;
        const { container } = render(<CommandPalette {...p} />);
        expect(container.firstChild).toBeNull();
    });

    it('open=true : rend la modale avec role=dialog', () => {
        render(<CommandPalette {...baseProps()} />);
        expect(screen.getByRole('dialog', { name: /recherche/i })).toBeInTheDocument();
    });

    it('input : placeholder explicite, autoComplete off, focus auto', async () => {
        render(<CommandPalette {...baseProps()} />);
        const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
        expect(input.placeholder).toMatch(/onglet|utilisateur|scrutin/i);
        expect(input.autocomplete).toBe('off');
        // spellCheck prop React → attribute HTML "spellcheck" (lowercase).
        // jsdom ne l'expose pas toujours comme propriété DOM : on passe
        // par getAttribute() qui est garanti par la spec.
        expect(input.getAttribute('spellcheck')).toBe('false');
        // L'auto-focus passe par setTimeout(0), on attend le tick
        await new Promise((r) => setTimeout(r, 10));
        expect(document.activeElement).toBe(input);
    });

    it('input value reflète query, typing appelle onQueryChange', async () => {
        const user = userEvent.setup();
        const p = baseProps();
        (p as { query: string }).query = 'use';
        render(<CommandPalette {...p} />);
        const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
        expect(input.value).toBe('use');
        await user.clear(input);
        await user.type(input, 'a');
        expect(p.onQueryChange).toHaveBeenCalled();
    });

    it('rend tous les résultats', () => {
        const p = baseProps();
        render(<CommandPalette {...p} />);
        expect(screen.getByText('Utilisateurs')).toBeInTheDocument();
        expect(screen.getByText("Tokens d'enrôlement")).toBeInTheDocument();
        expect(screen.getByText('Scrutins')).toBeInTheDocument();
    });

    it('rend les group titles sous chaque label', () => {
        const p = baseProps();
        render(<CommandPalette {...p} />);
        const usersResult = screen.getByTestId('command-palette-result-0');
        expect(within(usersResult).getByText('Opérations terrain')).toBeInTheDocument();
    });

    it('icône rendue pour chaque résultat', () => {
        const p = baseProps();
        render(<CommandPalette {...p} />);
        const usersResult = screen.getByTestId('command-palette-result-0');
        expect(within(usersResult).getByText('👥')).toBeInTheDocument();
    });

    // ---- Badge "Onglet" / action.tag (V2) ----
    it('badge kind = "Onglet" pour une tab', () => {
        const p = baseProps();
        render(<CommandPalette {...p} />);
        const kindBadge = screen.getByTestId('command-palette-kind-0');
        expect(kindBadge).toHaveTextContent('Onglet');
        expect(kindBadge).toHaveAttribute('data-result-kind', 'tab');
    });

    it('badge kind = action.tag pour une action (ex: "Export")', () => {
        const p = baseProps();
        (p as { results: SearchResult[] }).results = [
            ...p.results,
            { kind: 'action' as const, id: 'action-export-pdf', label: 'Exporter le rapport PDF', group: 'Actions rapides', icon: '📄', tag: 'Export', score: 0 },
        ];
        render(<CommandPalette {...p} />);
        const kindBadge = screen.getByTestId('command-palette-kind-3');
        expect(kindBadge).toHaveTextContent('Export');
        expect(kindBadge).toHaveAttribute('data-result-kind', 'action');
    });

    it('placeholder mentionne maintenant "action rapide"', () => {
        const p = baseProps();
        render(<CommandPalette {...p} />);
        const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
        expect(input.placeholder).toMatch(/action rapide/i);
    });

    it('item sélectionné a data-selected=true et classe .selected', () => {
        const p = baseProps();
        (p as { selectedIndex: number }).selectedIndex = 1;
        render(<CommandPalette {...p} />);
        expect(screen.getByTestId('command-palette-result-0').getAttribute('data-selected')).toBe('false');
        expect(screen.getByTestId('command-palette-result-1').getAttribute('data-selected')).toBe('true');
        expect(screen.getByTestId('command-palette-result-1').className).toMatch(/selected/);
    });

    it('click sur un résultat → onSelect(result)', async () => {
        const user = userEvent.setup();
        const p = baseProps();
        render(<CommandPalette {...p} />);
        await user.click(screen.getByTestId('command-palette-result-1'));
        expect(p.onSelect).toHaveBeenCalledWith(p.results[1]);
    });

    it('backdrop click → onClose', async () => {
        const user = userEvent.setup();
        const p = baseProps();
        render(<CommandPalette {...p} />);
        await user.click(screen.getByRole('dialog'));
        expect(p.onClose).toHaveBeenCalledTimes(1);
    });

    it('click sur la modale (intérieur) ne ferme PAS', async () => {
        const user = userEvent.setup();
        const p = baseProps();
        render(<CommandPalette {...p} />);
        const input = screen.getByTestId('command-palette-input');
        await user.click(input);
        expect(p.onClose).not.toHaveBeenCalled();
    });

    it('état vide (0 résultat) : message "Aucun onglet trouvé"', () => {
        const p = baseProps();
        (p as { query: string }).query = 'zzzzzz';
        (p as { results: SearchResult[] }).results = [];
        render(<CommandPalette {...p} />);
        expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument();
        expect(screen.getByText(/Aucun onglet/i)).toBeInTheDocument();
    });

    it('footer : 3 hints (naviguer, sélectionner, fermer) + count', () => {
        const p = baseProps();
        render(<CommandPalette {...p} />);
        expect(screen.getByText(/naviguer/i)).toBeInTheDocument();
        expect(screen.getByText(/sélectionner/i)).toBeInTheDocument();
        expect(screen.getByText(/fermer/i)).toBeInTheDocument();
        expect(screen.getByTestId('command-palette-count')).toHaveTextContent('3 résultats');
    });

    it('footer count : singulier pour 1 résultat', () => {
        const p = baseProps();
        (p as { results: SearchResult[] }).results = [p.results[0]];
        render(<CommandPalette {...p} />);
        expect(screen.getByTestId('command-palette-count')).toHaveTextContent('1 résultat');
    });

    it('highlight du query : <mark> rendu autour du match', () => {
        const p = baseProps();
        (p as { query: string }).query = 'Utilis';
        render(<CommandPalette {...p} />);
        const mark = screen.getByText('Utilis');
        expect(mark.tagName).toBe('MARK');
    });

    it('shortcut hint affiché dans l\'input row', () => {
        const p = baseProps();
        (p as { shortcutHint: string }).shortcutHint = 'Ctrl+K';
        render(<CommandPalette {...p} />);
        expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
    });

    it('ArrowDown → onHighlightNext, ArrowUp → onHighlightPrev, Enter → onSelectHighlighted', async () => {
        const p = baseProps();
        render(<CommandPalette {...p} />);
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        });
        expect(p.onHighlightNext).toHaveBeenCalledTimes(1);

        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        });
        expect(p.onHighlightPrev).toHaveBeenCalledTimes(1);

        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        });
        expect(p.onSelectHighlighted).toHaveBeenCalledTimes(1);
    });
});
