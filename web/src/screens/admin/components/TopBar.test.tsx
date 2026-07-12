/**
 * Tests pour <TopBar> — la barre supérieure unifiée du BO refondu.
 *
 * Couvre :
 *   - Rendu du brand + breadcrumb + search + 4 actions
 *   - Breadcrumb reflète l'onglet actif (label + group)
 *   - User initials dans l'avatar
 *   - Compteur d'alertes dans l'indicateur
 *   - Dot offline si isOnline=false
 *   - Clics sur les boutons appellent les bons callbacks
 *   - Theme/lang reflètent les props
 *   - rightSlot est rendu à sa place
 *   - Accessibilité : aria-label, aria-current, title
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar';
import type { TabKey } from '../constants';

describe('TopBar', () => {
    let onToggleTheme: () => void;
    let onToggleLang: () => void;
    let onSearchClick: () => void;
    let onAvatarClick: () => void;
    let onAlertsClick: () => void;

    beforeEach(() => {
        onToggleTheme = vi.fn();
        onToggleLang = vi.fn();
        onSearchClick = vi.fn();
        onAvatarClick = vi.fn();
        onAlertsClick = vi.fn();
    });

    function renderTopBar(overrides: Partial<React.ComponentProps<typeof TopBar>> = {}) {
        return render(
            <TopBar
                activeTab="users"
                userName="marie kombi"
                alertCount={0}
                theme="dark"
                onToggleTheme={onToggleTheme}
                lang="fr"
                onToggleLang={onToggleLang}
                isOnline
                onSearchClick={onSearchClick}
                onAvatarClick={onAvatarClick}
                onAlertsClick={onAlertsClick}
                {...overrides}
            />,
        );
    }

    it('rend brand + breadcrumb + search + 4 actions', () => {
        renderTopBar();
        expect(screen.getByTestId('topbar-brand')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: /fil d.ariane/i })).toBeInTheDocument();
        expect(screen.getByTestId('topbar-search')).toBeInTheDocument();
        expect(screen.getByTestId('topbar-theme')).toBeInTheDocument();
        expect(screen.getByTestId('topbar-lang')).toBeInTheDocument();
        expect(screen.getByTestId('topbar-alerts')).toBeInTheDocument();
        expect(screen.getByTestId('topbar-avatar')).toBeInTheDocument();
    });

    it('brand pointe vers / (retour accueil)', () => {
        renderTopBar();
        const brand = screen.getByTestId('topbar-brand');
        expect(brand.getAttribute('href')).toBe('/');
        expect(brand.textContent).toMatch(/Openvote/);
    });

    it('breadcrumb reflète l\'onglet actif : group title + tab label', () => {
        renderTopBar({ activeTab: 'users' as TabKey });
        const breadcrumb = screen.getByRole('navigation', { name: /fil d.ariane/i });
        // Group "Opérations terrain" + "Utilisateurs"
        expect(within(breadcrumb).getByText('Opérations terrain')).toBeInTheDocument();
        expect(within(breadcrumb).getByText('Utilisateurs')).toBeInTheDocument();
    });

    it('breadcrumb : "Configuration" / "RBAC" pour onglet rbac', () => {
        renderTopBar({ activeTab: 'rbac' });
        const breadcrumb = screen.getByRole('navigation', { name: /fil d.ariane/i });
        expect(within(breadcrumb).getByText('Configuration')).toBeInTheDocument();
        expect(within(breadcrumb).getByText('RBAC')).toBeInTheDocument();
    });

    it('breadcrumb : "Accueil" / "Tableau de bord" pour onglet dashboard', () => {
        renderTopBar({ activeTab: 'dashboard' });
        const breadcrumb = screen.getByRole('navigation', { name: /fil d.ariane/i });
        expect(within(breadcrumb).getByText('Accueil')).toBeInTheDocument();
        expect(within(breadcrumb).getByText('Tableau de bord')).toBeInTheDocument();
    });

    it('breadcrumb.current a aria-current="page"', () => {
        renderTopBar({ activeTab: 'users' });
        const current = screen.getByText('Utilisateurs');
        expect(current.getAttribute('aria-current')).toBe('page');
    });

    it('search trigger a un kbd visible ⌘K', () => {
        renderTopBar();
        const search = screen.getByTestId('topbar-search');
        expect(within(search).getByText('⌘K')).toBeInTheDocument();
    });

    it('click sur le search trigger → onSearchClick', async () => {
        const user = userEvent.setup();
        renderTopBar();
        await user.click(screen.getByTestId('topbar-search'));
        expect(onSearchClick).toHaveBeenCalledTimes(1);
    });

    it('click sur le theme → onToggleTheme', async () => {
        const user = userEvent.setup();
        renderTopBar();
        await user.click(screen.getByTestId('topbar-theme'));
        expect(onToggleTheme).toHaveBeenCalledTimes(1);
    });

    it('click sur le lang → onToggleLang', async () => {
        const user = userEvent.setup();
        renderTopBar();
        await user.click(screen.getByTestId('topbar-lang'));
        expect(onToggleLang).toHaveBeenCalledTimes(1);
    });

    it('click sur alertes → onAlertsClick', async () => {
        const user = userEvent.setup();
        renderTopBar({ alertCount: 3 });
        await user.click(screen.getByTestId('topbar-alerts'));
        expect(onAlertsClick).toHaveBeenCalledTimes(1);
    });

    it('click sur avatar → onAvatarClick', async () => {
        const user = userEvent.setup();
        renderTopBar();
        await user.click(screen.getByTestId('topbar-avatar'));
        expect(onAvatarClick).toHaveBeenCalledTimes(1);
    });

    it('avatar : initiales "MK" pour "marie kombi"', () => {
        renderTopBar({ userName: 'marie kombi' });
        expect(screen.getByTestId('topbar-avatar').textContent).toBe('MK');
    });

    it('avatar : initiales 2 premières lettres pour username mono-mot', () => {
        renderTopBar({ userName: 'admin' });
        expect(screen.getByTestId('topbar-avatar').textContent).toBe('AD');
    });

    it('avatar : fallback "?" si username vide', () => {
        renderTopBar({ userName: '' });
        expect(screen.getByTestId('topbar-avatar').textContent).toBe('?');
    });

    it('alertes : indicateur rouge affiché si alertCount > 0', () => {
        renderTopBar({ alertCount: 5 });
        const alerts = screen.getByTestId('topbar-alerts');
        // L'indicateur a le chiffre
        expect(within(alerts).getByText('5')).toBeInTheDocument();
    });

    it('alertes : pas d\'indicateur si alertCount = 0', () => {
        renderTopBar({ alertCount: 0 });
        const alerts = screen.getByTestId('topbar-alerts');
        // Aucun enfant numérique
        expect(alerts.textContent).toBe('⚠️');
    });

    it('offline dot affichée si isOnline = false', () => {
        renderTopBar({ isOnline: false });
        expect(screen.getByTestId('topbar-offline')).toBeInTheDocument();
    });

    it('offline dot PAS affichée si isOnline = true', () => {
        renderTopBar({ isOnline: true });
        expect(screen.queryByTestId('topbar-offline')).not.toBeInTheDocument();
    });

    it('thème dark : icône ☀️ (invite à passer en clair)', () => {
        renderTopBar({ theme: 'dark' });
        expect(screen.getByTestId('topbar-theme').textContent).toBe('☀️');
    });

    it('thème light : icône 🌙 (invite à passer en sombre)', () => {
        renderTopBar({ theme: 'light' });
        expect(screen.getByTestId('topbar-theme').textContent).toBe('🌙');
    });

    it('lang : "FR" pour fr, "EN" pour en', () => {
        const { rerender } = renderTopBar({ lang: 'fr' });
        expect(screen.getByTestId('topbar-lang').textContent).toBe('FR');
        rerender(
            <TopBar
                activeTab="users"
                theme="dark"
                onToggleTheme={() => {}}
                lang="en"
                onToggleLang={() => {}}
            />,
        );
        expect(screen.getByTestId('topbar-lang').textContent).toBe('EN');
    });

    it('rightSlot est rendu entre search et actions', () => {
        renderTopBar({
            rightSlot: <button data-testid="custom-slot-btn">+ Inviter</button>,
        });
        const topbar = screen.getByTestId('admin-topbar');
        const slot = within(topbar).getByTestId('custom-slot-btn');
        expect(slot).toBeInTheDocument();
        // Le slot doit être APRÈS le search (et AVANT les actions)
        const children = Array.from(topbar.children);
        const searchIdx = children.indexOf(screen.getByTestId('topbar-search'));
        const slotIdx = children.indexOf(slot);
        expect(searchIdx).toBeLessThan(slotIdx);
    });

    it('search label a un placeholder explicite (pas vide)', () => {
        renderTopBar();
        const search = screen.getByTestId('topbar-search');
        const label = within(search).getByText(/Rechercher/i);
        expect(label.textContent).toMatch(/onglet|utilisateur|scrutin/i);
    });

    it('accessibilité : tous les icon-btns ont un aria-label', () => {
        renderTopBar();
        expect(screen.getByTestId('topbar-theme')).toHaveAttribute('aria-label');
        expect(screen.getByTestId('topbar-lang')).toHaveAttribute('aria-label');
        expect(screen.getByTestId('topbar-alerts')).toHaveAttribute('aria-label');
        expect(screen.getByTestId('topbar-avatar')).toHaveAttribute('aria-label');
    });
});
