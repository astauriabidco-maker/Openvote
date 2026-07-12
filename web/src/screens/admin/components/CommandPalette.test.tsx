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

    it('scoring : "Configuration" matche via le group (score 10)', async () => {
        const { result } = renderHook(() => useCommandPalette());
        await act(async () => { result.current.setQuery('Configuration'); });
        const config = result.current.results.filter((r) => r.group === 'Configuration');
        expect(config.length).toBeGreaterThan(0);
        expect(config.every((r) => r.score === 10)).toBe(true);
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
});

// ====================== <CommandPalette> ======================

describe('CommandPalette (composant)', () => {
    function baseProps() {
        return {
            open: true,
            query: '',
            onQueryChange: vi.fn() as unknown as (q: string) => void,
            results: [
                { id: 'tab-users', label: 'Utilisateurs', group: 'Opérations terrain', icon: '👥', tabKey: 'users' as const, score: 0 },
                { id: 'tab-tokens', label: "Tokens d'enrôlement", group: 'Opérations terrain', icon: '🎫', tabKey: 'tokens' as const, score: 0 },
                { id: 'tab-elections', label: 'Scrutins', group: 'Scrutins & Analyses', icon: '🗳️', tabKey: 'elections' as const, score: 0 },
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
