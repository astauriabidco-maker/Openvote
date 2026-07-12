/**
 * Sidebar — navigation principale du BO refondu.
 *
 * Remplace la barre horizontale de 13 onglets par une sidebar verticale
 * organisée en 5 sections collapsibles (cf. NAV_GROUPS dans constants.ts).
 *
 * Comportement :
 *   - Sections collapsibles : clic sur le titre d'une section → toggle
 *     son état ouvert/fermé. État géré par useAdminUI (openSections).
 *   - Auto-open : la section contenant l'onglet actif est TOUJOURS ouverte
 *     (géré par useAdminUI, pas besoin de le refaire ici).
 *   - Item actif : barre verticale 3px bleue à gauche + background tinté
 *     + texte en gras.
 *   - Badges inline : compteurs (tokens, scrutins en cours) ou alertes.
 *   - Footer : version + liens utiles.
 *
 * Pourquoi ce composant est dumb :
 *   - L'item actif (activeTab) et le setter viennent des props.
 *   - L'état des sections vient des props.
 *   - Le composant NE fait PAS d'effet de bord : il dispatch juste les
 *     clics via callbacks. Toute la logique métier est dans useAdminUI.
 *
 * Tests : voir Sidebar.test.tsx.
 */

import type { TabKey } from '../constants';
import { NAV_GROUPS, type NavItem, type NavGroup } from '../constants';

export interface SidebarProps {
    activeTab: TabKey;
    openSections: string[];
    onSelectTab: (tab: TabKey) => void;
    onToggleSection: (key: string) => void;
    /** Compteurs dynamiques (ex: tokens en cours, scrutins actifs). */
    badges?: Partial<Record<TabKey, string>>;
}

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
                flexShrink: 0,
                transition: 'transform 180ms ease',
                transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

function NavItemButton({
    item,
    active,
    badge,
    onClick,
}: {
    item: NavItem;
    active: boolean;
    badge?: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={`admin-nav-item${active ? ' active' : ''}`}
            onClick={onClick}
            data-testid={`nav-item-${item.id}`}
            data-active={active ? 'true' : 'false'}
        >
            <span className="admin-nav-item-icon" aria-hidden>{item.icon}</span>
            <span className="admin-nav-item-label">{item.label}</span>
            {badge && (
                <span
                    className={`admin-nav-item-badge${
                        // Variants simples basés sur la valeur du badge :
                        // les nombres > 0 sont "red" (alerte), '0' est muted.
                        // On laisse le caller pré-formater via la prop badges.
                        badge === '0' ? ' muted' : ''
                    }`}
                >
                    {badge}
                </span>
            )}
        </button>
    );
}

function NavSectionGroup({
    group,
    open,
    activeTab,
    onSelectTab,
    onToggleSection,
    badges,
}: {
    group: NavGroup;
    open: boolean;
    activeTab: TabKey;
    onSelectTab: (tab: TabKey) => void;
    onToggleSection: (key: string) => void;
    badges?: Partial<Record<TabKey, string>>;
}) {
    return (
        <div
            className={`admin-nav-section${open ? '' : ' collapsed'}`}
            data-testid={`nav-section-${group.key}`}
            data-open={open ? 'true' : 'false'}
        >
            <button
                type="button"
                className="admin-nav-section-title"
                onClick={() => onToggleSection(group.key)}
                aria-expanded={open}
            >
                <ChevronIcon open={open} />
                <span>{group.title}</span>
            </button>
            {open && (
                <div className="admin-nav-items">
                    {group.items.map((item) => (
                        <NavItemButton
                            key={item.id}
                            item={item}
                            active={activeTab === item.id}
                            badge={badges?.[item.id]}
                            onClick={() => onSelectTab(item.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Sidebar({
    activeTab,
    openSections,
    onSelectTab,
    onToggleSection,
    badges,
}: SidebarProps) {
    return (
        <aside className="admin-sidebar" data-testid="admin-sidebar">
            <nav className="admin-sidebar-nav">
                {NAV_GROUPS.map((group) => (
                    <NavSectionGroup
                        key={group.key}
                        group={group}
                        open={openSections.includes(group.key)}
                        activeTab={activeTab}
                        onSelectTab={onSelectTab}
                        onToggleSection={onToggleSection}
                        badges={badges}
                    />
                ))}
            </nav>
            <div className="admin-sidebar-footer">
                v1.0 · <a href="#">Documentation</a> · <a href="#">Raccourcis</a>
            </div>
        </aside>
    );
}
