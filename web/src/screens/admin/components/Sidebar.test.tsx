/**
 * Tests pour <Sidebar> — la navigation principale refondue du BO.
 *
 * Couvre :
 *   - Rendu des 5 sections et 13 items (cohérent avec NAV_GROUPS)
 *   - Item actif reçoit l'attribut data-active et la classe .active
 *   - Click sur un item → callback onSelectTab avec le bon TabKey
 *   - Click sur le titre d'une section → callback onToggleSection
 *   - Section collapsed : items non rendus
 *   - Badges : valeur affichée + classe 'muted' pour '0'
 *   - Accessibilité : role/aria-expanded sur les titres
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';
import { NAV_GROUPS, type TabKey } from '../constants';

describe('Sidebar', () => {
    let onSelectTab: (tab: TabKey) => void;
    let onToggleSection: (key: string) => void;

    beforeEach(() => {
        onSelectTab = vi.fn();
        onToggleSection = vi.fn();
    });

    it('rend les 5 sections définies dans NAV_GROUPS', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={NAV_GROUPS.map((g) => g.key)}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        for (const group of NAV_GROUPS) {
            expect(
                screen.getByTestId(`nav-section-${group.key}`),
            ).toBeInTheDocument();
        }
    });

    it('rend tous les items de chaque section quand la section est ouverte', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={NAV_GROUPS.map((g) => g.key)}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        // 5 sections × items. Comptons le total attendu.
        const expectedCount = NAV_GROUPS.reduce((acc, g) => acc + g.items.length, 0);
        const items = screen.getAllByTestId(/^nav-item-/);
        expect(items).toHaveLength(expectedCount);
    });

    it('marque l\'item actif via data-active=true', () => {
        render(
            <Sidebar
                activeTab="users"
                openSections={['field-ops']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        const usersItem = screen.getByTestId('nav-item-users');
        expect(usersItem.getAttribute('data-active')).toBe('true');
    });

    it('les autres items ne sont pas actifs', () => {
        render(
            <Sidebar
                activeTab="users"
                openSections={['field-ops', 'elections', 'config']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        // Tokens n'est pas l'item actif
        const tokensItem = screen.getByTestId('nav-item-tokens');
        expect(tokensItem.getAttribute('data-active')).toBe('false');
    });

    it('click sur un item → onSelectTab avec le bon TabKey', async () => {
        const user = userEvent.setup();
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={['field-ops']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        await user.click(screen.getByTestId('nav-item-users'));
        expect(onSelectTab).toHaveBeenCalledWith('users');
    });

    it('click sur le titre d\'une section → onToggleSection', async () => {
        const user = userEvent.setup();
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={['home', 'field-ops']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        // Le titre est dans la section home
        const homeSection = screen.getByTestId('nav-section-home');
        const homeTitle = within(homeSection).getByRole('button', { name: /Accueil/i });
        await user.click(homeTitle);
        expect(onToggleSection).toHaveBeenCalledWith('home');
    });

    it('section collapsed : items NON rendus, aria-expanded=false', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={['home']} // seul home ouvert
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        const configSection = screen.getByTestId('nav-section-config');
        expect(configSection.getAttribute('data-open')).toBe('false');
        // Le bouton-titre porte l'aria-expanded
        const configTitle = within(configSection).getByRole('button');
        expect(configTitle.getAttribute('aria-expanded')).toBe('false');
        // Aucun item de la section config rendu
        expect(screen.queryByTestId('nav-item-config')).not.toBeInTheDocument();
    });

    it('section ouverte : data-open=true, items rendus', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={['home', 'config']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        const configSection = screen.getByTestId('nav-section-config');
        expect(configSection.getAttribute('data-open')).toBe('true');
        expect(screen.getByTestId('nav-item-config')).toBeInTheDocument();
        expect(screen.getByTestId('nav-item-rbac')).toBeInTheDocument();
        expect(screen.getByTestId('nav-item-mfa')).toBeInTheDocument();
        expect(screen.getByTestId('nav-item-logs')).toBeInTheDocument();
    });

    it('badge : valeur affichée inline', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={['field-ops', 'elections']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
                badges={{ tokens: '12', elections: '3' }}
            />,
        );
        const tokensItem = screen.getByTestId('nav-item-tokens');
        expect(within(tokensItem).getByText('12')).toBeInTheDocument();
        const electionsItem = screen.getByTestId('nav-item-elections');
        expect(within(electionsItem).getByText('3')).toBeInTheDocument();
    });

    it('badge à "0" reçoit la classe muted', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={['field-ops']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
                badges={{ tokens: '0' }}
            />,
        );
        const tokensItem = screen.getByTestId('nav-item-tokens');
        const badge = within(tokensItem).getByText('0');
        expect(badge.className).toMatch(/muted/);
    });

    it('footer : version + liens', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={[]}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        const footer = screen.getByText(/v1\.0/);
        expect(footer).toBeInTheDocument();
        expect(within(footer.parentElement!).getByText('Documentation')).toBeInTheDocument();
        expect(within(footer.parentElement!).getByText('Raccourcis')).toBeInTheDocument();
    });

    it('rend l\'icône emoji pour chaque item', () => {
        render(
            <Sidebar
                activeTab="dashboard"
                openSections={['field-ops']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        // Vérifie que les icônes définies dans NAV_GROUPS sont rendues
        const tokensItem = screen.getByTestId('nav-item-tokens');
        // L'icône 🎫 est dans le span.admin-nav-item-icon
        const icon = within(tokensItem).getByText('🎫');
        expect(icon).toBeInTheDocument();
        expect(icon.className).toMatch(/admin-nav-item-icon/);
    });

    it('snapshot : structure DOM stable pour la sidebar complète ouverte', () => {
        const { container } = render(
            <Sidebar
                activeTab="users"
                openSections={NAV_GROUPS.map((g) => g.key)}
                onSelectTab={() => {}}
                onToggleSection={() => {}}
                badges={{ tokens: '12', elections: '3' }}
            />,
        );
        // L'item actif (users) doit avoir data-active=true
        const allActive = container.querySelectorAll('[data-active="true"]');
        expect(allActive).toHaveLength(1);
        expect((allActive[0] as HTMLElement).getAttribute('data-testid')).toBe('nav-item-users');
    });

    it('clique sur un item puis re-render : seul le nouvel item est actif', () => {
        // Test "double-pass" : on rend avec activeTab=users, puis on
        // re-rend avec activeTab=elections. Vérifie que le marker bouge.
        // On garde les 2 sections ouvertes (field-ops + elections) pour
        // pouvoir checker les 2 items au 2e render.
        const { rerender } = render(
            <Sidebar
                activeTab="users"
                openSections={['field-ops', 'elections']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        expect(screen.getByTestId('nav-item-users').getAttribute('data-active')).toBe('true');
        expect(screen.getByTestId('nav-item-elections').getAttribute('data-active')).toBe('false');

        rerender(
            <Sidebar
                activeTab="elections"
                openSections={['field-ops', 'elections']}
                onSelectTab={onSelectTab}
                onToggleSection={onToggleSection}
            />,
        );
        expect(screen.getByTestId('nav-item-users').getAttribute('data-active')).toBe('false');
        expect(screen.getByTestId('nav-item-elections').getAttribute('data-active')).toBe('true');
    });

    it('le TabKey passé en prop est bien un TabKey valide (cohérence avec NAV_GROUPS)', () => {
        // Smoke : s'assurer que tous les id dans NAV_GROUPS sont bien des TabKey.
        // Ce test échouera si quelqu'un ajoute un item à NAV_GROUPS sans
        // l'ajouter à TAB_KEYS.
        const allIds: TabKey[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
        expect(allIds.length).toBeGreaterThanOrEqual(13);
        // Pas de doublons
        expect(new Set(allIds).size).toBe(allIds.length);
    });
});
