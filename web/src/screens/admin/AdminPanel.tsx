/**
 * Openvote — shell du backoffice admin.
 *
 * Responsabilités :
 *   1. Initialiser le state partagé via useAdminPanelState().
 *   2. Afficher le chrome global : toast notifications, bandeau PWA offline,
 *      bandeau install PWA, sidebar de navigation, header d'actions.
 *   3. Dispatcher vers le bon composant d'onglet selon activeTab.
 *
 * Le contenu de chaque onglet est dans `tabs/<Name>Tab.tsx` — chaque tab
 * reçoit `state` (le retour du hook) en props.
 *
 * Avant le refactor (cf. M2 + sprint onglets) : ce fichier faisait
 * 2073 LOC avec 12 onglets inlinés. Maintenant : shell + sidebar refondue.
 *
 * Note : à partir de 2026-07-12, la nav horizontale de 13 onglets est
 * remplacée par une <Sidebar> latérale organisée en 5 sections collapsibles
 * (cf. NAV_GROUPS). Voir Sidebar.tsx.
 */

import { memo } from 'react';
import type { AxiosInstance } from 'axios';
import type { AuthState } from '../../types';
import { useAdminPanelState, type AdminPanelState } from './useAdminPanelState';
import { type TabKey } from './constants';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import CommandPalette from './components/CommandPalette';
import { useCommandPalette } from './hooks/useCommandPalette';

import DashboardTab from './tabs/DashboardTab';
import UsersTab from './tabs/UsersTab';
import ElectionsTab from './tabs/ElectionsTab';
import TokensTab from './tabs/TokensTab';
import RegionsTab from './tabs/RegionsTab';
import IncidentsTab from './tabs/IncidentsTab';
import LogsTab from './tabs/LogsTab';
import ConfigTab from './tabs/ConfigTab';
import RbacTab from './tabs/RbacTab';
import MFATab from './tabs/MFATab';
import MapTab from './tabs/MapTab';
import IntelligenceTab from './tabs/IntelligenceTab';
import LegalTab from './tabs/LegalTab';

interface AdminPanelProps {
    auth: AuthState;
    apiClient: AxiosInstance;
}

function AdminPanel({ auth, apiClient }: AdminPanelProps) {
    const state = useAdminPanelState(apiClient, auth);
    const {
        activeTab, setActiveTab,
        openSections, toggleSection,
        theme, toggleTheme, lang, toggleLang, t,
        notification,
        alertCount, isOnline, showInstallBanner, setShowInstallBanner,
        pendingReportsCount,
        kpis, users, elections, regions,
    } = state;

    /**
     * exportPDF ouvre une nouvelle fenêtre avec un rapport HTML imprimable
     * (synthèse KPIs + tables users/elections/regions). Conservé dans le shell
     * car il agrège des données de plusieurs onglets. Sera migré dans le
     * futur <TopBar> pour l'accessibilité.
     */
    const exportPDF = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const content = `
          <html><head><title>OpenVote - Rapport Admin</title>
          <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}h1{color:#1a73e8}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}h2{margin-top:30px;color:#555}.stat{display:inline-block;margin:10px 20px;text-align:center}.stat-value{font-size:2rem;font-weight:bold}.stat-label{font-size:0.9rem;color:#666}</style></head><body>
          <h1>🇨🇲 OpenVote - Rapport Administratif</h1>
          <p>Généré le ${new Date().toLocaleString('fr-FR')}</p>
          ${kpis ? `<div>
            <div class="stat"><div class="stat-value">${kpis.users.total}</div><div class="stat-label">Utilisateurs</div></div>
            <div class="stat"><div class="stat-value">${kpis.reports.total}</div><div class="stat-label">Signalements</div></div>
            <div class="stat"><div class="stat-value">${kpis.elections.total}</div><div class="stat-label">Scrutins</div></div>
          </div>` : ''}
          <h2>Utilisateurs (${users.length})</h2>
          <table><tr><th>Nom</th><th>Rôle</th><th>Région</th><th>Créé</th></tr>
          ${users.map((u) => `<tr><td>${u.username}</td><td>${u.role}</td><td>${u.region_id || '—'}</td><td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td></tr>`).join('')}
          </table>
          <h2>Scrutins (${elections.length})</h2>
          <table><tr><th>Nom</th><th>Type</th><th>Statut</th><th>Date</th></tr>
          ${elections.map((e) => `<tr><td>${e.name}</td><td>${e.type}</td><td>${e.status}</td><td>${new Date(e.date).toLocaleDateString('fr-FR')}</td></tr>`).join('')}
          </table>
          <h2>Régions (${regions.length})</h2>
          <table><tr><th>Code</th><th>Région</th><th>Départements</th></tr>
          ${regions.map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${r.dept_count}</td></tr>`).join('')}
          </table>
          </body></html>`;
        printWindow.document.write(content);
        printWindow.document.close();
        printWindow.print();
    };

    // ---- Command palette (search ⌘K) ----
    // Le hook gère state + raccourci global. Le composant CommandPalette
    // est dumb : il reçoit tout en props et dispatch via les callbacks.
    // Le hook ferme automatiquement la palette après un onSelect (Enter),
    // mais pour le clic souris on doit fermer nous-mêmes.
    const palette = useCommandPalette({
        onSelect: (result) => setActiveTab(result.tabKey),
    });
    const handleResultClick = (tabKey: TabKey) => {
        setActiveTab(tabKey);
        palette.closePalette();
    };

    return (
        <div className="admin-panel">
            {/* Toast notifications */}
            {notification && (
                <div className={`admin-toast ${notification.type}`}>
                    {notification.type === 'success' ? '✅' : notification.type === 'info' ? 'ℹ️' : '❌'} {notification.text}
                </div>
            )}

            {/* PWA offline indicator */}
            {!isOnline && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10001,
                    background: 'linear-gradient(90deg, #da3633, #f85149)', color: '#fff',
                    padding: '8px 16px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
                    📡 Mode Hors Ligne — Les données affichées sont celles de votre dernière connexion
                    {pendingReportsCount > 0 && (
                        <span style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '2px 8px', marginLeft: '8px' }}>
                            {pendingReportsCount} signalement{pendingReportsCount > 1 ? 's' : ''} en attente
                        </span>
                    )}
                </div>
            )}

            {/* Command palette ⌘K (doit être en dehors de admin-shell-layout
                pour avoir un z-index au-dessus de tout, y compris la sidebar). */}
            <CommandPalette
                open={palette.open}
                query={palette.query}
                onQueryChange={palette.setQuery}
                results={palette.results}
                selectedIndex={palette.selectedIndex}
                onSelect={(r) => handleResultClick(r.tabKey)}
                onHighlightPrev={palette.highlightPrev}
                onHighlightNext={palette.highlightNext}
                onSelectHighlighted={palette.selectHighlighted}
                onClose={palette.closePalette}
                shortcutHint={palette.shortcutHint}
            />

            {/* PWA install banner */}
            {showInstallBanner && (
                <div style={{
                    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000,
                    background: 'linear-gradient(135deg, #161b22, #21262d)', border: '1px solid rgba(56,139,253,0.4)',
                    borderRadius: '14px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.5)', maxWidth: '440px', width: '90%',
                    fontFamily: 'Inter,system-ui,sans-serif',
                }}>
                    <img src="/icon-192.png" alt="" style={{ width: '42px', height: '42px', borderRadius: '10px' }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e6edf3' }}>📲 Installer Openvote</div>
                        <div style={{ fontSize: '0.72rem', color: '#8b949e', marginTop: '2px' }}>Accédez même hors-ligne à vos données terrain</div>
                    </div>
                    <button
                        style={{
                            background: 'linear-gradient(135deg, #238636, #2ea043)', color: '#fff', border: 'none',
                            padding: '8px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                        }}
                        onClick={async () => {
                            const prompt = (window as unknown as { __pwaInstallPrompt?: { prompt: () => void; userChoice: Promise<{ outcome: string }> } }).__pwaInstallPrompt;
                            if (prompt) {
                                prompt.prompt();
                                const result = await prompt.userChoice;
                                if (result.outcome === 'accepted') setShowInstallBanner(false);
                            }
                        }}
                    >
                        Installer
                    </button>
                    <button
                        onClick={() => setShowInstallBanner(false)}
                        style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.1rem', padding: '4px' }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Layout principal : topbar + sidebar gauche + contenu à droite */}
            <div className="admin-shell-layout">
                {/* TopBar unifiée (refonte 2026-07) : brand, breadcrumb,
                    search ⌘K, actions (thème, lang, alertes, avatar). */}
                <TopBar
                    activeTab={activeTab}
                    userName={auth.username}
                    alertCount={alertCount}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    lang={lang}
                    onToggleLang={toggleLang}
                    isOnline={isOnline}
                    onSearchClick={palette.openPalette}
                />

                {/* Body : sidebar à gauche, contenu scrollable à droite */}
                <div className="admin-shell-body">
                    <Sidebar
                        activeTab={activeTab}
                        openSections={openSections}
                        onSelectTab={setActiveTab}
                        onToggleSection={toggleSection}
                    />

                    <div className="admin-shell-main">
                        {/* Boutons legacy (Observers map, Export PDF) conservés
                            pour l'instant en haut du contenu — seront migrés
                            en <TabHeader> par onglet dans une prochaine étape. */}
                        <div className="admin-header-actions" style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="admin-primary-btn" onClick={() => setActiveTab('map')}>🗺️ {t('observers_map')}</button>
                            <button className="admin-primary-btn" onClick={exportPDF}>📄 {t('export_pdf')}</button>
                        </div>

                        {/* Active tab dispatch */}
                        <ActiveTabContent activeTab={activeTab} state={state} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * ActiveTabContent dispatche vers le bon composant d'onglet.
 * Mémoïsé : évite les re-renders inutiles des onglets inactifs.
 */
const ActiveTabContent = memo(function ActiveTabContent({
    activeTab,
    state,
}: {
    activeTab: TabKey;
    state: AdminPanelState;
}) {
    switch (activeTab) {
        case 'dashboard': return <DashboardTab state={state} />;
        case 'users': return <UsersTab state={state} />;
        case 'elections': return <ElectionsTab state={state} />;
        case 'tokens': return <TokensTab state={state} />;
        case 'regions': return <RegionsTab state={state} />;
        case 'incidents': return <IncidentsTab state={state} />;
        case 'logs': return <LogsTab state={state} />;
        case 'config': return <ConfigTab state={state} />;
        case 'rbac': return <RbacTab />;
        case 'mfa': return <MFATab state={state} />;
        case 'map': return <MapTab state={state} />;
        case 'intelligence': return <IntelligenceTab state={state} />;
        case 'legal': return <LegalTab state={state} />;
        default: return null;
    }
});

const StableAdminPanel = memo(AdminPanel);
export default StableAdminPanel;