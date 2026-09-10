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

        expect(screen.getByRole('heading', { name: /Chaque PV doit pouvoir être vérifié/i })).toBeInTheDocument();
        expect(screen.getByText('Preuve publique vérifiable')).toBeInTheDocument();
        expect(screen.getByText('Comment la preuve fonctionne')).toBeInTheDocument();
        expect(screen.getByText('Ce que le public peut contrôler')).toBeInTheDocument();
        expect(screen.getByText('Mémoire électorale officielle')).toBeInTheDocument();
        expect(screen.getByText('Cadre législatif')).toBeInTheDocument();
        expect(screen.getByText('Actualité électorale')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Vérifier un paquet signé' }));

        expect(onOpenPublicVerifier).toHaveBeenCalledTimes(1);
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
