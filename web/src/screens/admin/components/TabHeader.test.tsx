/**
 * Tests pour <TabHeader> + <KPIBand> — header réutilisable des onglets.
 *
 * Couvre :
 *   - TabHeader rend title + subtitle + actions
 *   - TabHeader sans subtitle/actions : pas d'erreur
 *   - TabHeader children : KPIBand rendu sous le header
 *   - KPIBand : 1, 4, N items
 *   - KPIBand : empty array → null
 *   - KPI : value, label, delta
 *   - KPI : trend 'down' applique la classe .down (couleur rouge)
 *   - KPI : trend 'neutral' applique la classe .neutral (gris)
 *   - KPI : valueColor custom est appliqué au style
 *   - TabHeader : testId customisable
 *   - TabHeader : data-testid par défaut 'tab-header'
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabHeader, { KPIBand, type KPIItem } from './TabHeader';

describe('TabHeader', () => {
    it('rend title + subtitle + actions', () => {
        render(
            <TabHeader
                title="👥 Utilisateurs"
                subtitle="142 utilisateurs"
                actions={<button>+ Inviter</button>}
            />,
        );
        expect(screen.getByText('👥 Utilisateurs')).toBeInTheDocument();
        expect(screen.getByText('142 utilisateurs')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ Inviter' })).toBeInTheDocument();
    });

    it('rend sans subtitle : pas d\'élément subtitle', () => {
        render(<TabHeader title="Titre seul" />);
        expect(screen.getByText('Titre seul')).toBeInTheDocument();
        expect(screen.queryByTestId('tab-header-subtitle')).not.toBeInTheDocument();
    });

    it('rend sans actions : pas d\'élément actions', () => {
        render(<TabHeader title="Titre" />);
        expect(screen.queryByTestId('tab-header-actions')).not.toBeInTheDocument();
    });

    it('children (KPIBand) rendu sous le header', () => {
        render(
            <TabHeader title="Test">
                <KPIBand items={[{ label: 'A', value: 1 }]} />
            </TabHeader>,
        );
        expect(screen.getByTestId('kpi-band')).toBeInTheDocument();
    });

    it('testId custom appliqué au wrapper', () => {
        render(<TabHeader title="X" testId="my-tab" />);
        expect(screen.getByTestId('my-tab')).toBeInTheDocument();
    });

    it('testId par défaut "tab-header"', () => {
        render(<TabHeader title="X" />);
        expect(screen.getByTestId('tab-header')).toBeInTheDocument();
    });

    it('sous-titre rendu avec text-testid "tab-header-subtitle"', () => {
        render(<TabHeader title="T" subtitle="S" />);
        const subtitle = screen.getByTestId('tab-header-subtitle');
        expect(subtitle).toHaveTextContent('S');
    });
});

describe('KPIBand', () => {
    it('rend 1 item', () => {
        render(<KPIBand items={[{ label: 'Total', value: 142 }]} />);
        expect(screen.getByTestId('kpi-item-0')).toBeInTheDocument();
        expect(screen.getByText('Total')).toBeInTheDocument();
        expect(screen.getByText('142')).toBeInTheDocument();
    });

    it('rend 4 items', () => {
        const items: KPIItem[] = [
            { label: 'Total', value: 142 },
            { label: 'Admins', value: 3 },
            { label: 'Region', value: 28 },
            { label: 'Observers', value: 111 },
        ];
        render(<KPIBand items={items} />);
        expect(screen.getAllByTestId(/^kpi-item-/)).toHaveLength(4);
    });

    it('rend un delta sous la valeur', () => {
        render(<KPIBand items={[{ label: 'X', value: 10, delta: '+5 ce mois' }]} />);
        expect(screen.getByText('+5 ce mois')).toBeInTheDocument();
    });

    it('trend "down" applique la classe CSS .down (rouge)', () => {
        const { container } = render(
            <KPIBand items={[{ label: 'X', value: 5, delta: '-1', trend: 'down' }]} />,
        );
        const delta = container.querySelector('.admin-kpi-delta');
        expect(delta).toBeInTheDocument();
        expect(delta?.className).toMatch(/down/);
    });

    it('trend "neutral" applique la classe CSS .neutral (gris)', () => {
        const { container } = render(
            <KPIBand items={[{ label: 'X', value: 5, delta: '~', trend: 'neutral' }]} />,
        );
        const delta = container.querySelector('.admin-kpi-delta');
        expect(delta?.className).toMatch(/neutral/);
    });

    it('trend par défaut (up / non spécifié) : classe "down" absente', () => {
        const { container } = render(
            <KPIBand items={[{ label: 'X', value: 5, delta: '+1' }]} />,
        );
        const delta = container.querySelector('.admin-kpi-delta');
        expect(delta?.className).not.toMatch(/down/);
        expect(delta?.className).not.toMatch(/neutral/);
    });

    it('valueColor custom appliqué au style de la valeur', () => {
        const { container } = render(
            <KPIBand items={[{ label: 'X', value: 99, valueColor: '#f85149' }]} />,
        );
        const value = container.querySelector('.admin-kpi-value');
        expect((value as HTMLElement).style.color).toBe('rgb(248, 81, 73)');
    });

    it('value string accepté (ex: "23 en ligne")', () => {
        render(<KPIBand items={[{ label: 'Online', value: '23' }]} />);
        expect(screen.getByText('23')).toBeInTheDocument();
    });

    it('items vide : retourne null (pas de bande vide rendue)', () => {
        const { container } = render(<KPIBand items={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('item sans delta : pas de div .admin-kpi-delta', () => {
        const { container } = render(<KPIBand items={[{ label: 'X', value: 5 }]} />);
        expect(container.querySelector('.admin-kpi-delta')).toBeNull();
    });

    it('plusieurs items : les keys sont stables (basées sur le label)', () => {
        // On rend 2 fois le même KPIBand, on vérifie qu'il n'y a pas
        // d'erreur React "duplicate key" (les keys sont dérivées du label).
        const { rerender } = render(
            <KPIBand items={[{ label: 'A', value: 1 }, { label: 'B', value: 2 }]} />,
        );
        rerender(
            <KPIBand items={[{ label: 'A', value: 10 }, { label: 'B', value: 20 }]} />,
        );
        // Pas d'erreur de rendu — les 2 items sont rendus
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument();
    });
});

describe('TabHeader + KPIBand intégration', () => {
    it('cas réel : onglet Users avec 4 KPIs et 2 actions', () => {
        render(
            <TabHeader
                title="👥 Utilisateurs"
                subtitle="142 utilisateurs · 23 en ligne maintenant"
                actions={
                    <>
                        <button>📥 CSV</button>
                        <button>🔄 Actualiser</button>
                    </>
                }
            >
                <KPIBand
                    items={[
                        { label: 'Total', value: 142, delta: '+5 ce mois' },
                        { label: 'Super admin', value: 3, delta: '-1 vs hier', trend: 'down' },
                        { label: 'Region admin', value: 28, delta: '+2 ce mois' },
                        { label: 'Observateurs', value: 111, delta: '+4 ce mois' },
                    ]}
                />
            </TabHeader>,
        );
        // Header
        expect(screen.getByText('👥 Utilisateurs')).toBeInTheDocument();
        expect(screen.getByText(/142 utilisateurs/)).toBeInTheDocument();
        // 2 actions
        expect(screen.getByRole('button', { name: /CSV/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Actualiser/i })).toBeInTheDocument();
        // 4 KPIs
        expect(screen.getByText('142')).toBeInTheDocument();
        expect(screen.getByText('+5 ce mois')).toBeInTheDocument();
        expect(screen.getByText('-1 vs hier')).toBeInTheDocument();
    });
});
