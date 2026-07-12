/**
 * TabHeader + KPIBand — header réutilisable pour les onglets admin (refonte 2026-07).
 *
 * Remplace le pattern dupliqué "admin-section-header" qu'on trouvait
 * dans chaque tab (Users, Regions, etc.) : un titre h2 + une rangée de
 * boutons d'action, sans contexte chiffré.
 *
 * Le nouveau pattern :
 *
 *   <TabHeader
 *     title="👥 Utilisateurs"
 *     subtitle="142 utilisateurs · 23 en ligne maintenant"
 *     actions={<>...boutons...</>}
 *   >
 *     <KPIBand items={[
 *       { label: 'Total', value: 142, delta: '+5 ce mois' },
 *       { label: 'Super admin', value: 3, delta: '-1 vs hier', trend: 'down' },
 *       ...
 *     ]} />
 *   </TabHeader>
 *
 * Décisions :
 *   - Header et KPIBand sont séparés (deux composants) : on peut les
 *     utiliser indépendamment. KPI peut être omis (tabs simples) ou
 *     composé de plusieurs items.
 *   - title/subtitle = strings (pas de ReactNode) : on garde un format
 *     textuel strict pour le search ⌘K à venir (pas de JSX dans la search).
 *   - Le trend 'down' (vs 'up') colorise le delta en rouge au lieu de vert.
 *   - Pas d'animation : les chiffres bougent lentement, on évite le bruit.
 *
 * C'est le PREMIER onglet (Users) qui l'adopte. Les autres onglets
 * migreront au fil de l'eau (cf. roadmap refonte BO).
 */

import { type ReactNode } from 'react';

export type Trend = 'up' | 'down' | 'neutral';

export interface KPIItem {
    label: string;
    value: number | string;
    /** Texte optionnel sous la valeur (ex: '+5 ce mois', '-1 vs hier'). */
    delta?: string;
    /** Tendance : colorise le delta (vert par défaut, rouge si 'down'). */
    trend?: Trend;
    /** Couleur de la valeur (override du défaut blanc). */
    valueColor?: string;
}

export interface KPIBandProps {
    items: KPIItem[];
}

export function KPIBand({ items }: KPIBandProps) {
    if (items.length === 0) return null;
    return (
        <div className="admin-kpi-band" data-testid="kpi-band">
            {items.map((item, i) => {
                const trendClass =
                    item.trend === 'down' ? 'down' :
                    item.trend === 'neutral' ? 'neutral' : '';
                const valueStyle = item.valueColor
                    ? { color: item.valueColor }
                    : undefined;
                return (
                    <div
                        key={typeof item.label === 'string' ? item.label : i}
                        className="admin-kpi"
                        data-testid={`kpi-item-${i}`}
                    >
                        <div className="admin-kpi-label">{item.label}</div>
                        <div className="admin-kpi-value" style={valueStyle}>
                            {item.value}
                        </div>
                        {item.delta && (
                            <div className={`admin-kpi-delta ${trendClass}`}>
                                {item.delta}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export interface TabHeaderProps {
    /** Titre (string, peut contenir des emojis). */
    title: string;
    /** Sous-titre optionnel (string). */
    subtitle?: string;
    /** Boutons d'action à droite (slot ReactNode). */
    actions?: ReactNode;
    /** Contenu optionnel sous le header (ex: <KPIBand>). */
    children?: ReactNode;
    /** data-testid pour les tests. */
    testId?: string;
}

export default function TabHeader({
    title,
    subtitle,
    actions,
    children,
    testId = 'tab-header',
}: TabHeaderProps) {
    return (
        <div className="admin-tab-header-wrapper" data-testid={testId}>
            <div className="admin-tab-header">
                <div className="admin-tab-header-text">
                    <h1 className="admin-tab-header-title" data-testid="tab-header-title">{title}</h1>
                    {subtitle && (
                        <p className="admin-tab-header-subtitle" data-testid="tab-header-subtitle">
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && (
                    <div className="admin-tab-header-actions" data-testid="tab-header-actions">
                        {actions}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}
