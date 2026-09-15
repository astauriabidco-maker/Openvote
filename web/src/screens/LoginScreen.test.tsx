import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import LoginScreen from './LoginScreen';

vi.mock('axios', () => ({
    default: {
        post: vi.fn(),
        isAxiosError: vi.fn(() => false),
    },
}));

function tokenWithRole(role: string): string {
    return `header.${btoa(JSON.stringify({ role }))}.signature`;
}

describe('LoginScreen', () => {
    it('présente la landing comme une porte de preuve publique', async () => {
        const onOpenPublicVerifier = vi.fn();
        render(<LoginScreen onLogin={vi.fn()} onOpenPublicVerifier={onOpenPublicVerifier} />);

        expect(screen.getByRole('heading', { name: /Vérifiez les PV électoraux du Cameroun/i })).toBeInTheDocument();
        expect(screen.getByText('Preuve publique vérifiable')).toBeInTheDocument();
        expect(screen.getByText('Chercher, comparer, vérifier')).toBeInTheDocument();
        expect(screen.getByText('Comment la preuve fonctionne')).toBeInTheDocument();
        expect(screen.getByText('Ce que le public peut contrôler')).toBeInTheDocument();
        expect(screen.getByText('Mémoire électorale officielle')).toBeInTheDocument();
        expect(screen.getByText('Explorer les scrutins passés')).toBeInTheDocument();
        expect(screen.getByText('Cadre législatif')).toBeInTheDocument();
        expect(screen.getByText('Actualité électorale')).toBeInTheDocument();
        expect(screen.getByText('Présidentielle Cameroun 2011')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Vérifier un paquet signé' }));

        expect(onOpenPublicVerifier).toHaveBeenCalledTimes(1);
    });

    it('rend le portail public interactif par recherche et région', async () => {
        render(<LoginScreen onLogin={vi.fn()} onOpenPublicVerifier={vi.fn()} />);

        await userEvent.type(screen.getByLabelText(/Recherche citoyenne/i), 'Mfoundi 01');
        await userEvent.selectOptions(screen.getByLabelText(/Région/i), 'Nord-Ouest');

        expect(screen.getByText('Recherche locale prête pour "Mfoundi 01": bureau, commune, région ou identifiant PV.')).toBeInTheDocument();
        expect(screen.getByText('210')).toBeInTheDocument();
        expect(screen.getByText('Prioritaire')).toBeInTheDocument();
    });

    it('permet de consulter les statistiques des scrutins passés', async () => {
        render(<LoginScreen onLogin={vi.fn()} onOpenPublicVerifier={vi.fn()} />);

        await userEvent.click(screen.getByRole('tab', { name: /2018 Présidentielle/i }));

        expect(screen.getByText('Présidentielle Cameroun 2018')).toBeInTheDocument();
        expect(screen.getByText('RDPC / Paul Biya')).toBeInTheDocument();
        expect(screen.getAllByText('53.85%').length).toBeGreaterThan(0);
        expect(screen.getByText('elecam-presidentielle-2018-rapport-fr', { exact: false })).toBeInTheDocument();
    });

    it('conserve le formulaire de connexion observateur', async () => {
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { token: tokenWithRole('observer') } });
        const onLogin = vi.fn();
        render(<LoginScreen onLogin={onLogin} onOpenPublicVerifier={vi.fn()} />);

        await userEvent.type(screen.getByLabelText(/Identifiant/i), 'observateur-centre');
        await userEvent.type(screen.getByLabelText(/Mot de passe/i), 'secret123');
        await userEvent.click(screen.getByRole('button', { name: /Se connecter/i }));

        expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), {
            username: 'observateur-centre',
            password: 'secret123',
        });
        expect(onLogin).toHaveBeenCalledWith({
            token: tokenWithRole('observer'),
            role: 'observer',
            username: 'observateur-centre',
        }, 'secret123');
    });
});
