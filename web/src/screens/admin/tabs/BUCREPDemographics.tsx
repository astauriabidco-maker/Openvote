/**
 * BUCREPDemographics — Pyramide des âges + tableau de cohortes.
 *
 * Consomme /admin/geo/demographics du backend (BUCREP 2016-2025, 19
 * indicateurs × 3 sexes × 13 zones géographiques du Cameroun).
 *
 * Trois sélecteurs en haut :
 *   - Région (10 régions + Cameroun national)
 *   - Année (2016-2025)
 *   - Indicateur (19 disponibles — défaut "Population estimée")
 *
 * La pyramide SVG montre les 12 cohortes d'âge (0-14 → 50+) avec :
 *   - M (Masculin) à gauche en bleu
 *   - F (Féminin) à droite en purple
 *
 * Les cohortes n'ont souvent que la valeur "Total" dans le BUCREP.
 * On applique le ratio M/F de la "Population totale" de la même
 * région/année pour estimer M et F. Approximation documentée dans
 * la tooltip de la pyramide.
 *
 * Le tableau sous la pyramide affiche les valeurs brutes
 * (toujours celles de l'API, jamais calculées).
 *
 * Refonte 2026-07 : ajout des données BUCREP à l'IntelligenceTab.
 */

import { useEffect, useMemo, useState } from 'react';
import type { AdminPanelState } from '../useAdminPanelState';
import type { AxiosInstance } from 'axios';

interface RegionOpt { code: string; name: string; id: string; }
interface DemoRow {
    region_code: string;
    region_name: string;
    city_label: string;
    indicator: string;
    sex: string;
    year: number;
    value: number;
}

const COHORT_INDICATORS = [
    'Enfants de 0-11 mois',
    'Enfants de 0-2 ans',
    'Enfants de 0-14 ans',
    'Enfants de 0-15 ans',
    'Population 5-14 ans',
    'Adolescents 10-14 ans',
    'Adolescents 15-19 ans',
    'Population 20-24 ans',
    'Population 25-29 ans',
    'Population 30-34 ans',
    'Population 35-39 ans',
    'Population 40-44 ans',
    'Population 45-49 ans',
    'Population 50 ans et plus',
];

export default function BUCREPDemographics({ state }: { state: AdminPanelState }) {
    const apiClient: AxiosInstance = state.apiClient;

    const [regions, setRegions] = useState<RegionOpt[]>([]);
    const [indicators, setIndicators] = useState<string[]>([]);
    const [years, setYears] = useState<number[]>([]);

    const [region, setRegion] = useState<string>('AD');
    const [year, setYear] = useState<number>(2025);
    const [indicator, setIndicator] = useState<string>('Population estimée');

    const [rows, setRows] = useState<DemoRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Chargement initial des listes
    useEffect(() => {
        (async () => {
            try {
                const [r, i, y] = await Promise.all([
                    apiClient.get<{ regions: RegionOpt[] }>('/admin/geo/regions'),
                    apiClient.get<{ indicators: string[] }>('/admin/geo/indicators'),
                    apiClient.get<{ years: number[] }>('/admin/geo/years'),
                ]);
                setRegions(r.data.regions);
                setIndicators(i.data.indicators);
                setYears(y.data.years);
                if (y.data.years.length) setYear(y.data.years[y.data.years.length - 1]);
            } catch (e) {
                setError(`Chargement listes : ${(e as Error).message}`);
            }
        })();
    }, [apiClient]);

    // Chargement des données filtrées
    useEffect(() => {
        if (!region || !year || !indicator) return;
        setLoading(true);
        setError(null);
        const url = `/admin/geo/demographics?region=${region}&year=${year}&indicator=${encodeURIComponent(indicator)}`;
        apiClient.get<{ data: DemoRow[] }>(url)
            .then((d) => setRows(d.data.data))
            .catch((e) => setError(`Chargement données : ${(e as Error).message}`))
            .finally(() => setLoading(false));
    }, [region, year, indicator, apiClient]);

    // Pour la pyramide des âges : on a besoin de TOUS les indicateurs de cohorte
    // pour la même région+année. C'est plus simple de les demander en bulk.
    const [allCohortData, setAllCohortData] = useState<DemoRow[]>([]);
    useEffect(() => {
        if (!region || !year) return;
        const url = `/admin/geo/demographics?region=${region}&year=${year}`;
        apiClient.get<{ data: DemoRow[] }>(url)
            .then((d) => setAllCohortData(d.data.data))
            .catch(() => setAllCohortData([]));
    }, [region, year, apiClient]);

    // Calcul du ratio M/F pour cette région+année (depuis "Population estimée")
    const mfratio = useMemo(() => {
        const m = allCohortData.find(r => r.indicator === 'Population estimée' && r.sex === 'Masculin');
        const f = allCohortData.find(r => r.indicator === 'Population estimée' && r.sex === 'Féminin');
        if (!m || !f || (m.value + f.value) === 0) return { m: 0.5, f: 0.5 };
        const total = m.value + f.value;
        return { m: m.value / total, f: f.value / total };
    }, [allCohortData]);

    // Construction des données pyramide
    const pyramidData = useMemo(() => {
        const result: { cohort: string; m: number; f: number; total: number }[] = [];
        for (const cohort of COHORT_INDICATORS) {
            const total = allCohortData.find(r => r.indicator === cohort && r.sex === 'Total');
            if (!total) continue;
            result.push({
                cohort,
                m: Math.round(total.value * mfratio.m),
                f: Math.round(total.value * mfratio.f),
                total: total.value,
            });
        }
        return result;
    }, [allCohortData, mfratio]);

    const maxPyramid = useMemo(() => {
        return Math.max(1, ...pyramidData.map(p => Math.max(p.m, p.f)));
    }, [pyramidData]);

    return (
        <div className="admin-section" style={{ marginTop: '24px' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>
                📊 Démographie BUCREP par région
                <small style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 400, marginTop: '4px' }}>
                    Source : Données démographiques 2016-2025 (BUCREP) · 19 indicateurs · 13 zones géographiques
                </small>
            </h2>

            {/* Sélecteurs */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '180px' }}>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Région</span>
                    <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="admin-select"
                        style={{ width: '100%' }}
                    >
                        <option value="XX">Cameroun (national)</option>
                        {regions.map(r => (
                            <option key={r.code} value={r.code}>{r.code} — {r.name}</option>
                        ))}
                    </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 0, minWidth: '100px' }}>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Année</span>
                    <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="admin-select"
                        style={{ width: '100%' }}
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2, minWidth: '220px' }}>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Indicateur</span>
                    <select
                        value={indicator}
                        onChange={(e) => setIndicator(e.target.value)}
                        className="admin-select"
                        style={{ width: '100%' }}
                    >
                        {indicators.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                </label>
            </div>

            {error && <div className="admin-empty" style={{ color: 'var(--color-accent-red, #f85149)' }}>{error}</div>}

            {loading && <div className="admin-empty">⏳ Chargement…</div>}

            {/* Tableau des valeurs brutes */}
            {!loading && rows.length > 0 && (
                <div className="admin-table-wrapper" style={{ marginBottom: '32px' }}>
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Région</th>
                                <th>Ville / Étiquette</th>
                                <th>Indicateur</th>
                                <th>Sexe</th>
                                <th style={{ textAlign: 'right' }}>Valeur</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i}>
                                    <td>{r.region_name} {r.region_code !== 'XX' && <small style={{ color: 'var(--color-text-secondary)' }}>({r.region_code})</small>}</td>
                                    <td>{r.city_label || <em style={{ color: 'var(--color-text-muted)' }}>—</em>}</td>
                                    <td>{r.indicator}</td>
                                    <td>{r.sex}</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                        {r.value.toLocaleString('fr-FR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pyramide des âges */}
            {pyramidData.length > 0 && (
                <div>
                    <h3 style={{ margin: '24px 0 8px', fontSize: '0.95rem' }}>
                        🏛️ Pyramide des âges — {regions.find(r => r.code === region)?.name || 'Cameroun (national)'}, {year}
                    </h3>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                        Les cohortes ne sont disponibles qu'en "Total" dans BUCREP. M et F sont estimés via le ratio
                        M/F de la "Population estimée" de la même région/année
                        ({(mfratio.m * 100).toFixed(1)}% H / {(mfratio.f * 100).toFixed(1)}% F).
                    </p>
                    <div className="config-card" style={{ padding: '20px' }}>
                        <PyramidSVG data={pyramidData} maxValue={maxPyramid} />
                    </div>
                </div>
            )}
        </div>
    );
}

// =====================================================================
// PyramidSVG — pyramide horizontale M (gauche) / F (droite) en SVG pur
// =====================================================================

function PyramidSVG({ data, maxValue }: { data: { cohort: string; m: number; f: number; total: number }[]; maxValue: number }) {
    const rowH = 28;          // hauteur d'une ligne
    const labelW = 200;        // largeur colonne libellé gauche
    const sideW = 280;         // largeur côté (M ou F)
    const totalW = labelW + sideW * 2;
    const totalH = data.length * rowH + 40;

    // center = ligne axiale M|F, placée AU MILIEU de la zone sideW+sideW,
    // pas au milieu du viewBox (sinon les barres M débordent à gauche).
    const center = labelW + sideW;
    // Échelle commune : la plus grande valeur (M ou F) tient pile dans sideW
    const scale = sideW / maxValue;

    return (
        <svg width="100%" viewBox={`0 0 ${totalW} ${totalH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', maxWidth: '100%' }}>
            {/* Axe central (ligne verticale à 0) */}
            <line x1={center} y1={0} x2={center} y2={totalH - 20} stroke="var(--color-border, #30363d)" strokeWidth={1} />
            {/* Légende haut */}
            <text x={center - sideW / 2} y={14} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--color-accent-blue, #58a6ff)">♂ Hommes</text>
            <text x={center + sideW / 2} y={14} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--color-accent-purple, #a371f7)">♀ Femmes</text>

            {/* Barres */}
            {data.map((d, i) => {
                const y = 24 + i * rowH;
                const mW = d.m * scale;
                const fW = d.f * scale;
                return (
                    <g key={d.cohort}>
                        {/* Label cohorte (à gauche) */}
                        <text x={labelW - 12} y={y + (rowH - 6) / 2 + 4} textAnchor="end" fontSize="11" fontWeight={500} fill="var(--color-text-primary, #e6edf3)">
                            {d.cohort}
                        </text>
                        {/* Barre M (gauche, mirror autour de center) */}
                        <rect x={center - mW} y={y} width={mW} height={rowH - 6} fill="var(--color-accent-blue, #58a6ff)" opacity={0.85} />
                        {/* Label M à l'intérieur de la barre si elle est assez large, sinon à l'extérieur */}
                        {mW > 50 ? (
                            <text x={center - mW + 4} y={y + (rowH - 6) / 2 + 4} textAnchor="start" fontSize="9" fill="rgba(13,17,23,0.85)" fontWeight={600}>
                                {d.m.toLocaleString('fr-FR')}
                            </text>
                        ) : (
                            <text x={center - mW - 4} y={y + (rowH - 6) / 2 + 4} textAnchor="end" fontSize="9" fill="var(--color-text-secondary, #7d8590)">
                                {d.m.toLocaleString('fr-FR')}
                            </text>
                        )}
                        {/* Barre F (droite) */}
                        <rect x={center} y={y} width={fW} height={rowH - 6} fill="var(--color-accent-purple, #a371f7)" opacity={0.85} />
                        {/* Label F à l'intérieur si large, sinon à l'extérieur */}
                        {fW > 50 ? (
                            <text x={center + fW - 4} y={y + (rowH - 6) / 2 + 4} textAnchor="end" fontSize="9" fill="rgba(13,17,23,0.85)" fontWeight={600}>
                                {d.f.toLocaleString('fr-FR')}
                            </text>
                        ) : (
                            <text x={center + fW + 4} y={y + (rowH - 6) / 2 + 4} textAnchor="start" fontSize="9" fill="var(--color-text-secondary, #7d8590)">
                                {d.f.toLocaleString('fr-FR')}
                            </text>
                        )}
                    </g>
                );
            })}

            {/* Footer : légende du total */}
            <text x={center} y={totalH - 4} textAnchor="middle" fontSize="10" fill="var(--color-text-muted, #545d68)">
                Source : BUCREP · Échelle : M|F max = {maxValue.toLocaleString('fr-FR')}
            </text>
        </svg>
    );
}
