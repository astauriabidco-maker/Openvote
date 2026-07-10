/**
 * Tests pour le composant <LineChart> (SVG custom, sans dépendance externe).
 *
 * Vérifie :
 *   - Rendu vide quand pas de données (message discret)
 *   - Rendu "1 seul point" quand un seul snapshot (cas dégénéré)
 *   - Rendu normal : 2 paths SVG pour 2 séries
 *   - Les points clés (1er et dernier) sont présents (cercles avec <title>)
 *   - Le path est cohérent (nombre de points L = data.length - 1 commandes)
 *   - Les ticks Y (4 valeurs) sont rendus
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LineChart, { type LineChartPoint, type LineChartSeries } from './LineChart';

const SERIES: LineChartSeries[] = [
    { key: 'population', label: 'Population', color: '#58a6ff' },
    { key: 'voters', label: 'Électeurs', color: '#3fb950' },
];

const SAMPLE_DATA: LineChartPoint[] = [
    { recorded_at: '2026-01-01T00:00:00Z', population: 1000000, voters: 200000 },
    { recorded_at: '2026-04-01T00:00:00Z', population: 1200000, voters: 250000 },
    { recorded_at: '2026-07-01T00:00:00Z', population: 1500000, voters: 300000 },
];

describe('LineChart', () => {
    it('affiche un message discret quand data est vide', () => {
        render(<LineChart data={[]} series={SERIES} />);
        expect(screen.getByText(/Aucune donnée/i)).toBeInTheDocument();
    });

    it('affiche un seul point quand data.length = 1 (cas dégénéré)', () => {
        const onePoint: LineChartPoint[] = [
            { recorded_at: '2026-01-01T00:00:00Z', population: 1000000, voters: 200000 },
        ];
        const { container } = render(<LineChart data={onePoint} series={SERIES} />);
        // Pas de <svg> dans ce mode, juste un <div> avec un message
        expect(container.querySelector('svg')).toBeNull();
        expect(screen.getByText(/1 000 000/)).toBeInTheDocument();
        expect(screen.getByText(/un seul point/i)).toBeInTheDocument();
    });

    it('rend 1 path SVG par série', () => {
        const { container } = render(<LineChart data={SAMPLE_DATA} series={SERIES} />);
        const paths = container.querySelectorAll('svg path');
        expect(paths).toHaveLength(2); // 1 path par série
    });

    it('chaque path a un attribut stroke de la couleur de sa série', () => {
        const { container } = render(<LineChart data={SAMPLE_DATA} series={SERIES} />);
        const paths = container.querySelectorAll('svg path');
        expect(paths[0].getAttribute('stroke')).toBe('#58a6ff'); // population
        expect(paths[1].getAttribute('stroke')).toBe('#3fb950'); // voters
    });

    it('le path d\'une série commence par M et a (n-1) commandes L', () => {
        const { container } = render(<LineChart data={SAMPLE_DATA} series={SERIES} />);
        const firstPath = container.querySelector('svg path');
        const d = firstPath?.getAttribute('d') ?? '';
        // data.length = 3 → 1 M + 2 L
        const mCount = (d.match(/M/g) ?? []).length;
        const lCount = (d.match(/L/g) ?? []).length;
        expect(mCount).toBe(1);
        expect(lCount).toBe(SAMPLE_DATA.length - 1);
    });

    it('rend 2 points clés (cercles) par série (1er et dernier)', () => {
        const { container } = render(<LineChart data={SAMPLE_DATA} series={SERIES} />);
        const circles = container.querySelectorAll('svg circle');
        // 2 séries × 2 points = 4
        expect(circles).toHaveLength(4);
        // Chaque cercle a un <title> pour le tooltip
        circles.forEach((c) => {
            expect(c.querySelector('title')).toBeTruthy();
        });
    });

    it('rend 4 ticks Y (graduations horizontales)', () => {
        const { container } = render(<LineChart data={SAMPLE_DATA} series={SERIES} />);
        // 4 lignes de grille + 4 labels Y
        const gridLines = container.querySelectorAll('svg line[stroke="rgba(255,255,255,0.06)"]');
        expect(gridLines).toHaveLength(4);
    });

    it('rend la légende sous le SVG', () => {
        render(<LineChart data={SAMPLE_DATA} series={SERIES} />);
        expect(screen.getByText('Population')).toBeInTheDocument();
        expect(screen.getByText('Électeurs')).toBeInTheDocument();
    });

    it('formate les valeurs Y en M/k selon l\'ordre de grandeur', () => {
        render(
            <LineChart
                data={SAMPLE_DATA}
                series={SERIES}
                yFormat={(n) => {
                    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
                    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
                    return n.toString();
                }}
            />,
        );
        // Les ticks Y doivent contenir au moins un "M" et un "k"
        const { container } = render(
            <LineChart
                data={SAMPLE_DATA}
                series={SERIES}
                yFormat={(n) => {
                    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
                    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
                    return n.toString();
                }}
            />,
        );
        const text = container.textContent ?? '';
        expect(text).toMatch(/M/);
        expect(text).toMatch(/k/);
    });

    it('a un role img et un aria-label accessible', () => {
        const { container } = render(<LineChart data={SAMPLE_DATA} series={SERIES} />);
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('role')).toBe('img');
        expect(svg?.getAttribute('aria-label')).toBeTruthy();
    });
});
