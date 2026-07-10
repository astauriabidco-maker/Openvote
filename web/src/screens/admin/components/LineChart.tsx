/**
 * LineChart — graphique linéaire SVG minimaliste, sans dépendance externe.
 *
 * Pourquoi un composant custom (vs recharts/chart.js) :
 *   - Bundle : recharts = ~95 KB, chart.js = ~75 KB + react-chart-js-2.
 *     Pour 2 lignes (population + électeurs), un SVG inline fait le job
 *     en ~2 KB.
 *   - Contrôle : on contrôle 100% du rendu, des couleurs, du responsive.
 *   - Pas de données privées qui quittent le navigateur.
 *
 * Le composant :
 *   - Calcule les min/max dynamiques sur les valeurs fournies.
 *   - Trace 1 à N séries (couleur par série, légende sous le graphe).
 *   - Affiche les points clés (X = 1er / dernier, Y = min / max).
 *   - Gère le rendu vide (pas de points) avec un message discret.
 *
 * Props minimales :
 *   - data : tableau de snapshots, chacun { recorded_at, population, registered_voters, ... }
 *   - series : déclaration des séries à tracer (clé + label + couleur)
 *   - height : hauteur du SVG (défaut 220)
 *   - yFormat : format des labels Y (ex: 1.2M, 850k, ou juste le nombre)
 *
 * Pas d'animation : les données démographiques changent lentement,
 * une animation serait du bruit visuel.
 */

export interface LineChartPoint {
    /** Timestamp ISO (utilisé pour l'axe X). */
    recorded_at: string;
    /** Valeur numérique pour cette série (population ou voters). */
    [key: string]: string | number;
}

export interface LineChartSeries {
    /** Clé utilisée pour lire la valeur dans chaque point. */
    key: string;
    /** Libellé affiché dans la légende sous le graphe. */
    label: string;
    /** Couleur de la ligne et des points (CSS color, ex: '#58a6ff'). */
    color: string;
}

export interface LineChartProps {
    data: LineChartPoint[];
    series: LineChartSeries[];
    height?: number;
    /** Format des valeurs Y. Défaut : nombre entier avec séparateur de milliers. */
    yFormat?: (n: number) => string;
    /** Format des labels X (défaut : 'jour mois' en fr-FR). */
    xFormat?: (iso: string) => string;
}

// Marges intérieures (pour ne pas coller les axes au bord du SVG)
const MARGIN = { top: 16, right: 16, bottom: 32, left: 56 };

export default function LineChart({
    data,
    series,
    height = 220,
    yFormat = (n) => n.toLocaleString('fr-FR'),
    xFormat = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    },
}: LineChartProps) {
    // Cas vide : message discret
    if (!data || data.length === 0) {
        return (
            <div
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 8,
                    border: '1px dashed rgba(255,255,255,0.1)',
                }}
            >
                Aucune donnée pour afficher le graphique.
            </div>
        );
    }

    // 1 seul point : on ne peut pas tracer de ligne, on affiche juste le point
    if (data.length === 1) {
        return (
            <div
                style={{
                    height,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.06)',
                    gap: 8,
                }}
            >
                <strong style={{ color: 'var(--text-primary)' }}>
                    {yFormat(Number(data[0][series[0]?.key] ?? 0))}
                </strong>
                <span>{xFormat(data[0].recorded_at)}</span>
                <small>Un seul point — importez plus de données pour voir l'évolution.</small>
            </div>
        );
    }

    // Calcule les bornes globales (min/max sur toutes les séries)
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const point of data) {
        for (const s of series) {
            const v = Number(point[s.key] ?? 0);
            if (v < globalMin) globalMin = v;
            if (v > globalMax) globalMax = v;
        }
    }
    // Padding de 5% pour ne pas coller au bord
    const range = globalMax - globalMin || 1;
    globalMin = Math.max(0, globalMin - range * 0.05);
    globalMax = globalMax + range * 0.05;

    // viewBox : on rend responsive via preserveAspectRatio="none" + 100% width
    const width = 600;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    // Helpers de projection
    const xFor = (i: number) => MARGIN.left + (i / (data.length - 1)) * innerW;
    const yFor = (v: number) => MARGIN.top + (1 - (v - globalMin) / (globalMax - globalMin)) * innerH;

    // Calcule le path SVG pour une série
    const pathFor = (s: LineChartSeries): string => {
        return data
            .map((point, i) => {
                const v = Number(point[s.key] ?? 0);
                const x = xFor(i).toFixed(1);
                const y = yFor(v).toFixed(1);
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ');
    };

    // 4 ticks Y : min, 1/3, 2/3, max
    const yTicks = [globalMin, globalMin + (globalMax - globalMin) / 3,
                    globalMin + 2 * (globalMax - globalMin) / 3, globalMax];

    return (
        <div style={{ width: '100%' }}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height, display: 'block' }}
                role="img"
                aria-label="Graphique d'évolution démographique"
            >
                {/* Grille horizontale (4 lignes) */}
                {yTicks.map((tick, i) => {
                    const y = yFor(tick).toFixed(1);
                    return (
                        <g key={`grid-${i}`}>
                            <line
                                x1={MARGIN.left} x2={width - MARGIN.right}
                                y1={y} y2={y}
                                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                            />
                            <text
                                x={MARGIN.left - 8} y={y}
                                fill="var(--text-secondary)" fontSize={10}
                                textAnchor="end" dominantBaseline="middle"
                            >
                                {yFormat(Math.round(tick))}
                            </text>
                        </g>
                    );
                })}

                {/* Labels X (premier / milieu / dernier) */}
                {[0, Math.floor(data.length / 2), data.length - 1].map((i) => {
                    if (i < 0 || i >= data.length) return null;
                    const x = xFor(i).toFixed(1);
                    return (
                        <text
                            key={`x-${i}`}
                            x={x} y={height - 10}
                            fill="var(--text-secondary)" fontSize={10}
                            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                        >
                            {xFormat(data[i].recorded_at)}
                        </text>
                    );
                })}

                {/* Paths des séries */}
                {series.map((s) => (
                    <path
                        key={s.key}
                        d={pathFor(s)}
                        stroke={s.color}
                        strokeWidth={2}
                        fill="none"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                ))}

                {/* Points clés (1er / dernier) pour chaque série */}
                {series.map((s) => {
                    const indices = data.length > 1 ? [0, data.length - 1] : [0];
                    return indices.map((i) => {
                        const v = Number(data[i][s.key] ?? 0);
                        return (
                            <circle
                                key={`${s.key}-${i}`}
                                cx={xFor(i).toFixed(1)}
                                cy={yFor(v).toFixed(1)}
                                r={3}
                                fill={s.color}
                            >
                                <title>{`${s.label} : ${yFormat(v)} (${xFormat(data[i].recorded_at)})`}</title>
                            </circle>
                        );
                    });
                })}
            </svg>

            {/* Légende */}
            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    justifyContent: 'center',
                    marginTop: 8,
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                }}
            >
                {series.map((s) => (
                    <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span
                            style={{
                                width: 12, height: 3, borderRadius: 2,
                                background: s.color, display: 'inline-block',
                            }}
                        />
                        {s.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
