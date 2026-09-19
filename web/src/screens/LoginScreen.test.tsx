import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginScreen from './LoginScreen';

vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        isAxiosError: vi.fn(() => false),
    },
}));

function tokenWithRole(role: string): string {
    return `header.${btoa(JSON.stringify({ role }))}.signature`;
}

describe('LoginScreen', () => {
    beforeEach(() => {
        vi.mocked(axios.get).mockResolvedValue({ data: { results: [] } });
        vi.mocked(axios.post).mockReset();
        vi.mocked(axios.isAxiosError).mockReturnValue(false);
    });

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
        await userEvent.click(screen.getByRole('tab', { name: /2025 Présidentielle/i }));
        expect(screen.getByText('Présidentielle Cameroun 2025')).toBeInTheDocument();
        expect(screen.getByText('conseil-constitutionnel-presidentielle-2025-resultats', { exact: false })).toBeInTheDocument();

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

    it('alimente la mémoire électorale depuis l’API publique quand elle répond', async () => {
        vi.mocked(axios.get).mockResolvedValueOnce({
            data: {
                results: [
                    {
                        id: 'summary-2026',
                        election_id: 'election-2026',
                        election_name: 'Présidentielle Test 2026',
                        election_type: 'presidential',
                        election_date: '2026-10-12T00:00:00Z',
                        source_document_slug: 'elecam-test-2026',
                        election_year: 2026,
                        contest_type: 'presidential',
                        result_level: 'national',
                        region_name: '',
                        department_name: '',
                        commune_name: '',
                        actor_type: 'election',
                        actor_name: '',
                        party: '',
                        metric_type: 'summary',
                        registered_voters: 1000000,
                        actual_voters: 620000,
                        valid_votes: 600000,
                        blank_or_invalid_votes: 20000,
                        percentage: 62,
                        confidence: 'official_report',
                        status: 'verified',
                        notes: 'Résumé public chargé depuis le backend.',
                    },
                    {
                        id: 'leader-2026',
                        election_id: 'election-2026',
                        election_name: 'Présidentielle Test 2026',
                        election_type: 'presidential',
                        election_date: '2026-10-12T00:00:00Z',
                        source_document_slug: 'elecam-test-2026',
                        election_year: 2026,
                        contest_type: 'presidential',
                        result_level: 'national',
                        region_name: '',
                        department_name: '',
                        commune_name: '',
                        actor_type: 'candidate',
                        actor_name: 'Amina Demo',
                        party: 'OVT',
                        metric_type: 'result',
                        votes: 420000,
                        percentage: 70,
                        confidence: 'official_report',
                        status: 'verified',
                        notes: '',
                    },
                ],
            },
        });

        render(<LoginScreen onLogin={vi.fn()} onOpenPublicVerifier={vi.fn()} />);

        expect(await screen.findByText('Données chargées depuis l’API publique')).toBeInTheDocument();
        expect(screen.getByText('Présidentielle Test 2026')).toBeInTheDocument();
        expect(screen.getByText('OVT / Amina Demo')).toBeInTheDocument();
        expect(screen.getByText('elecam-test-2026', { exact: false })).toBeInTheDocument();
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
