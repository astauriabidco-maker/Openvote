/**
 * useAdminPanelState — état partagé du backoffice admin.
 *
 * Centralise tous les useState + fetch* + handle* du shell AdminPanel.
 * Chaque onglet (fichier dans `tabs/`) reçoit ce state via props et
 * appelle les handlers sans avoir besoin de connaître les détails
 * d'implémentation (axios, repository, etc.).
 *
 * Avantages :
 *   - Pas de duplication de logique entre onglets.
 *   - Le code de chaque onglet est focalisé sur le rendu.
 *   - Le hook peut être testé indépendamment.
 *
 * Inconvénients assumés :
 *   - Le state object est gros (50+ champs). Les onglets n'utilisent
 *     souvent qu'un sous-ensemble. C'est volontaire : le découpage par
 *     sélecteur (useAdminUsersState, etc.) multiplierait les hooks sans
 *     bénéfice clair pour une UI de cette taille.
 *
 * Toutes les fonctions sont wrappées en useCallback pour éviter les
 * re-renders inutiles des onglets enfants.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AxiosInstance } from 'axios';
import type {
    AdminUser, AuditLog, DepartmentData, ElectionData, AuthState,
    IncidentTypeData, KPIData, LegalDocument, LegalArticle, RegionWithDepts,
    SemanticSearchResult,
} from '../../types';
import type { ApiPagination } from '../../apiTypes';
import { REGION_COORDS } from '../../constants';
import {
    type TabKey,
} from './constants';
import { useUsersTab } from './hooks/useUsersTab';
import { useAuditLogsTab } from './hooks/useAuditLogsTab';
import { useIncidentTypesTab, type NewIncidentForm } from './hooks/useIncidentTypesTab';
import { useTokensTab } from './hooks/useTokensTab';
import { useConfigTab } from './hooks/useConfigTab';
import { useElectionsTab, type NewElectionForm } from './hooks/useElectionsTab';
import { useRegionsTab } from './hooks/useRegionsTab';
import { useLegalTab, type NewDocForm, type NewArticleForm } from './hooks/useLegalTab';

// ============================================================
// Types de formulaires — les types des formulaires sont maintenant dans
// les hooks dédiés (useLegalTab, useElectionsTab, useIncidentTypesTab).
// Le god-hook n'expose plus que les interfaces qu'il compose.
// ============================================================

// ============================================================
// Type de retour du hook
// ============================================================

export interface AdminPanelState {
    // ---- Navigation & UI globale ----
    activeTab: TabKey;
    setActiveTab: (tab: TabKey) => void;
    theme: 'dark' | 'light';
    toggleTheme: () => void;
    lang: 'fr' | 'en';
    toggleLang: () => void;
    t: (key: string) => string;
    notification: { type: 'success' | 'error' | 'info', text: string } | null;
    notify: (type: 'success' | 'error' | 'info', text: string) => void;
    alertCount: number;
    apiClient: AxiosInstance;
    auth: AuthState;

    // ---- PWA ----
    isOnline: boolean;
    showInstallBanner: boolean;
    setShowInstallBanner: (b: boolean) => void;
    pendingReportsCount: number;

    // ---- Users (M5 + M6) ----
    users: AdminUser[];
    usersPage: number;
    usersPagination: ApiPagination;
    usersLoading: boolean;
    fetchUsers: (page?: number) => Promise<void>;
    handleRoleChange: (userId: string, newRole: string) => Promise<void>;
    handleDeleteUser: (userId: string, username: string) => Promise<void>;
    handleRegionChange: (userId: string, newRegionId: string) => Promise<void>;
    exportUsersCSV: () => void;

    // ---- Audit logs (M5) ----
    auditLogs: AuditLog[];
    auditPage: number;
    auditPagination: ApiPagination;
    auditLoading: boolean;
    fetchAuditLogs: (page?: number) => Promise<void>;

    // ---- Régions & départements ----
    regions: RegionWithDepts[];
    fetchRegions: () => Promise<void>;
    expandedRegion: string | null;
    setExpandedRegion: (id: string | null) => void;
    newRegionName: string; setNewRegionName: (s: string) => void;
    newRegionCode: string; setNewRegionCode: (s: string) => void;
    newDeptName: string; setNewDeptName: (s: string) => void;
    newDeptCode: string; setNewDeptCode: (s: string) => void;
    newDeptRegionId: string; setNewDeptRegionId: (s: string) => void;
    handleAddRegion: () => Promise<void>;
    handleDeleteRegion: (id: string, name: string) => Promise<void>;
    handleAddDepartment: () => Promise<void>;
    handleDeleteDepartment: (id: string, name: string) => Promise<void>;

    // ---- Élections ----
    elections: ElectionData[];
    fetchElections: () => Promise<void>;
    newElection: NewElectionForm;
    setNewElection: (e: NewElectionForm) => void;
    handleCreateElection: () => Promise<void>;
    handleElectionStatus: (id: string, status: string) => Promise<void>;
    handleDeleteElection: (id: string, name: string) => Promise<void>;

    // ---- Types d'incidents ----
    incidentTypes: IncidentTypeData[];
    fetchIncidentTypes: () => Promise<void>;
    newIncident: NewIncidentForm;
    setNewIncident: (i: NewIncidentForm) => void;
    handleCreateIncidentType: () => Promise<void>;
    handleDeleteIncidentType: (id: string, name: string) => Promise<void>;

    // ---- KPIs ----
    kpis: KPIData | null;
    fetchKPIs: () => Promise<void>;

    // ---- Configuration runtime ----
    config: Record<string, unknown> | null;
    fetchConfig: () => Promise<void>;
    editingConfig: boolean;
    setEditingConfig: (b: boolean) => void;
    configDraft: string;
    setConfigDraft: (s: string) => void;
    handleSaveConfig: () => Promise<void>;

    // ---- Tokens d'enrôlement ----
    tokenRole: string;
    setTokenRole: (r: string) => void;
    tokenRegion: string;
    setTokenRegion: (r: string) => void;
    generatedToken: string;
    qrDataUrl: string;
    handleGenerateToken: () => Promise<void>;

    // ---- Cadre légal (CMS + RAG) ----
    legalDocuments: LegalDocument[];
    legalArticles: LegalArticle[];
    selectedDocId: string | null;
    setSelectedDocId: (id: string | null) => void;
    loadingArticles: boolean;
    legalSearch: string;
    setLegalSearch: (s: string) => void;
    newDoc: NewDocForm;
    setNewDoc: (d: NewDocForm) => void;
    newArticle: NewArticleForm;
    setNewArticle: (a: NewArticleForm) => void;
    showImportAssistant: boolean;
    setShowImportAssistant: (b: boolean) => void;
    confirmDeleteDocId: string | null;
    setConfirmDeleteDocId: (id: string | null) => void;
    rawTextToParse: string;
    setRawTextToParse: (s: string) => void;
    extractedArticles: Partial<LegalArticle>[];
    setExtractedArticles: (a: Partial<LegalArticle>[]) => void;
    semanticQuery: string;
    setSemanticQuery: (s: string) => void;
    semanticResults: SemanticSearchResult[];
    semanticLoading: boolean;
    embeddingStatus: string | null;
    fetchLegalDocuments: () => Promise<void>;
    fetchLegalArticles: () => Promise<void>;
    handleCreateLegalDoc: () => Promise<void>;
    handleCreateLegalArticle: () => Promise<void>;
    handleDeleteLegalDocument: (id: string) => Promise<void>;
    handleDeleteLegalArticles: (docId: string) => Promise<void>;
    handleDeleteLegalArticle: (articleId: string) => Promise<void>;
    handleBatchImportArticles: () => Promise<void>;
    handleParseRawText: () => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    handleSemanticSearch: () => Promise<void>;
    handleGenerateEmbeddings: () => Promise<void>;

    // ---- Department data editing (intelligence) ----
    editingDeptId: string | null;
    setEditingDeptId: (id: string | null) => void;
    deptDraft: { population: number; registered_voters: number };
    setDeptDraft: (d: { population: number; registered_voters: number }) => void;
    handleUpdateDeptData: (dept: DepartmentData) => Promise<void>;

    // ---- Carte observateurs (computed) ----
    observersByRegion: (RegionWithDepts & { lat?: number; lon?: number; observers: number; totalUsers: number })[];
}

// ============================================================
// i18n (closure, pas dans le state — figé par `lang`)
// ============================================================

const TRANSLATIONS: Record<string, Record<string, string>> = {
    dashboard: { fr: '📊 Tableau de Bord', en: '📊 Dashboard' },
    users: { fr: '👥 Utilisateurs', en: '👥 Users' },
    elections: { fr: '🗳️ Scrutins', en: '🗳️ Elections' },
    tokens: { fr: '🔑 Enrôlement', en: '🔑 Enrollment' },
    regions: { fr: '🗺️ Régions', en: '🗺️ Regions' },
    incidents: { fr: '⚠️ Incidents', en: '⚠️ Incidents' },
    logs: { fr: '📜 Audit', en: '📜 Audit' },
    config: { fr: '⚙️ Config', en: '⚙️ Config' },
    rbac: { fr: '🛡️ RBAC', en: '🛡️ RBAC' },
    mfa: { fr: '🔐 MFA', en: '🔐 MFA' },
    intelligence: { fr: '📊 Veille Électorale', en: '📊 Election Intel' },
    legal: { fr: '📜 Cadre Légal', en: '📜 Legal Framework' },
    observers_map: { fr: '🗺️ Carte Observateurs', en: '🗺️ Observers Map' },
    search_placeholder: { fr: '🔍 Rechercher par nom, rôle, ID...', en: '🔍 Search by name, role, ID...' },
    export_csv: { fr: '📥 CSV', en: '📥 CSV' },
    export_pdf: { fr: '📄 PDF', en: '📄 PDF' },
    refresh: { fr: '🔄 Actualiser', en: '🔄 Refresh' },
    create: { fr: '➕ Créer', en: '➕ Create' },
    delete_confirm: { fr: 'Confirmer la suppression ?', en: 'Confirm deletion?' },
    never: { fr: 'Jamais', en: 'Never' },
    no_region: { fr: '— Aucune', en: '— None' },
    save_config: { fr: '💾 Sauvegarder', en: '💾 Save' },
    edit_config: { fr: '✏️ Modifier', en: '✏️ Edit' },
    cancel: { fr: 'Annuler', en: 'Cancel' },
    alerts: { fr: 'Alertes', en: 'Alerts' },
};

// ============================================================
// Hook
// ============================================================

export function useAdminPanelState(
    apiClient: AxiosInstance,
    auth: AuthState,
): AdminPanelState {
    // ---- Active tab ----
    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

    // ---- Theme + lang ----
    const [theme, setTheme] = useState<'dark' | 'light'>(() =>
        (localStorage.getItem('openvote_theme') as 'dark' | 'light') || 'dark',
    );
    const [lang, setLang] = useState<'fr' | 'en'>(() =>
        (localStorage.getItem('openvote_lang') as 'fr' | 'en') || 'fr',
    );

    const t = useCallback(
        (key: string) => TRANSLATIONS[key]?.[lang] || key,
        [lang],
    );

    const toggleTheme = useCallback(() => {
        setTheme((prev) => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('openvote_theme', next);
            document.documentElement.setAttribute('data-theme', next);
            return next;
        });
    }, []);

    const toggleLang = useCallback(() => {
        setLang((prev) => {
            const next = prev === 'fr' ? 'en' : 'fr';
            localStorage.setItem('openvote_lang', next);
            return next;
        });
    }, []);

    // Apply theme on mount + when it changes.
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // ---- Notifications ----
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
        setNotification({ type, text });
        setTimeout(() => setNotification(null), 4000);
    }, []);

    // ---- PWA ----
    const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const [pendingReportsCount, setPendingReportsCount] = useState(0);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        const handleInstallable = () => setShowInstallBanner(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        document.addEventListener('openvote:installable', handleInstallable);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            document.removeEventListener('openvote:installable', handleInstallable);
        };
    }, []);

    // ---- Users (M5 + M6) — délégué à useUsersTab (refactor admin) ----
    // La logique (state + handlers) est extraite dans hooks/useUsersTab.ts.
    // On récupère le résultat et on l'expose tel quel pour ne pas casser
    // les autres consommateurs (UsersTab, AdminPanel PDF, observersByRegion).
    const {
        users, usersPage, usersPagination, usersLoading,
        fetchUsers, handleRoleChange, handleDeleteUser, handleRegionChange, exportUsersCSV,
    } = useUsersTab(apiClient, notify);

    // ---- Audit logs (M5) — délégué à useAuditLogsTab (refactor admin) ----
    const {
        auditLogs, auditPage, auditPagination, auditLoading, fetchAuditLogs,
    } = useAuditLogsTab(apiClient, notify);

    // ---- Régions & Départements — délégué à useRegionsTab (refactor admin) ----
    const {
        regions, expandedRegion, setExpandedRegion,
        newRegionName, setNewRegionName, newRegionCode, setNewRegionCode,
        newDeptName, setNewDeptName, newDeptCode, setNewDeptCode, newDeptRegionId, setNewDeptRegionId,
        fetchRegions, handleAddRegion, handleDeleteRegion, handleAddDepartment, handleDeleteDepartment,
    } = useRegionsTab(apiClient, notify);

    // ---- Élections — délégué à useElectionsTab (refactor admin) ----
    const {
        elections, newElection, setNewElection,
        fetchElections, handleCreateElection, handleElectionStatus, handleDeleteElection,
    } = useElectionsTab(apiClient, notify);

    // ---- Types d'incidents — délégué à useIncidentTypesTab (refactor admin) ----
    const {
        incidentTypes, newIncident, setNewIncident,
        fetchIncidentTypes, handleCreateIncidentType, handleDeleteIncidentType,
    } = useIncidentTypesTab(apiClient, notify);

    // ---- KPIs ----
    const [kpis, setKpis] = useState<KPIData | null>(null);
    const fetchKPIs = useCallback(async () => {
        try {
            const res = await apiClient.get('/admin/kpis');
            setKpis(res.data);
        } catch { notify('error', 'Erreur chargement KPIs'); }
    }, [apiClient, notify]);

    // ---- Configuration runtime — délégué à useConfigTab (refactor admin) ----
    const {
        config,
        editingConfig, setEditingConfig,
        configDraft, setConfigDraft,
        fetchConfig, handleSaveConfig,
    } = useConfigTab(apiClient, notify);

    // ---- Cadre légal (CMS + RAG) — délégué à useLegalTab (refactor admin) ----
    const {
        legalDocuments, legalArticles,
        selectedDocId, setSelectedDocId, loadingArticles,
        legalSearch, setLegalSearch,
        newDoc, setNewDoc, newArticle, setNewArticle,
        showImportAssistant, setShowImportAssistant,
        confirmDeleteDocId, setConfirmDeleteDocId,
        rawTextToParse, setRawTextToParse,
        extractedArticles, setExtractedArticles,
        semanticQuery, setSemanticQuery,
        semanticResults, semanticLoading, embeddingStatus,
        fetchLegalDocuments, fetchLegalArticles,
        handleCreateLegalDoc, handleCreateLegalArticle,
        handleDeleteLegalDocument, handleDeleteLegalArticles, handleDeleteLegalArticle,
        handleBatchImportArticles, handleParseRawText, handleFileUpload,
        handleSemanticSearch, handleGenerateEmbeddings,
    } = useLegalTab(apiClient, notify);

    // ---- Tokens d'enrôlement — délégué à useTokensTab (refactor admin) ----
    const {
        tokenRole, setTokenRole,
        tokenRegion, setTokenRegion,
        generatedToken, qrDataUrl,
        handleGenerateToken,
    } = useTokensTab(apiClient, notify);

    // ---- Department data editing (intelligence tab) ----
    const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
    const [deptDraft, setDeptDraft] = useState({ population: 0, registered_voters: 0 });

    // ---- Auto-fetch on tab change ----
    useEffect(() => {
        switch (activeTab) {
            case 'dashboard': fetchKPIs(); break;
            case 'users': fetchUsers(); break;
            case 'logs': fetchAuditLogs(); break;
            case 'config': fetchConfig(); break;
            case 'regions': fetchRegions(); break;
            case 'elections': fetchElections(); break;
            case 'incidents': fetchIncidentTypes(); break;
            case 'legal': fetchLegalDocuments(); break;
            case 'intelligence': fetchRegions(); fetchElections(); break;
        }
    }, [activeTab, fetchKPIs, fetchUsers, fetchAuditLogs, fetchConfig, fetchRegions, fetchElections, fetchIncidentTypes, fetchLegalDocuments]);

    useEffect(() => {
        if (activeTab === 'legal' && selectedDocId) {
            fetchLegalArticles();
        }
    }, [selectedDocId, activeTab, fetchLegalArticles]);

    // ---- Alert count (pending reports from KPIs) ----
    const [alertCount, setAlertCount] = useState(0);
    useEffect(() => {
        if (kpis) setAlertCount(kpis.reports.pending);
    }, [kpis]);

    // ---- Pending reports count from IndexedDB (PWA offline) ----
    useEffect(() => {
        const checkPending = () => {
            try {
                const req = indexedDB.open('openvote-offline', 1);
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        if (!db.objectStoreNames.contains('pending-reports')) return;
                        const tx = db.transaction('pending-reports', 'readonly');
                        const count = tx.objectStore('pending-reports').count();
                        count.onsuccess = () => setPendingReportsCount(count.result);
                    } catch { /* store absent (v2 DB) */ }
                };
            } catch { /* IndexedDB not available */ }
        };
        checkPending();
        const interval = setInterval(checkPending, 30000);
        return () => clearInterval(interval);
    }, []);

    // ============================================================
    // Handlers (useCallback pour stabilité des refs)
    // ============================================================
    // NOTE : les handlers Users (handleRoleChange, handleDeleteUser, handleRegionChange,
    // exportUsersCSV) sont extraits dans useUsersTab. Voir le commentaire au-dessus
    // du déréférencement useUsersTab plus haut dans ce fichier.

    // NOTE : handleAddRegion/handleDeleteRegion/handleAddDepartment/handleDeleteDepartment sont dans useRegionsTab.

    // NOTE : handleCreateElection/handleElectionStatus/handleDeleteElection sont dans useElectionsTab.

    // NOTE : handleCreateIncidentType et handleDeleteIncidentType sont dans useIncidentTypesTab.
    // NOTE : handleSaveConfig est dans useConfigTab.

    // NOTE : handleGenerateToken est dans useTokensTab.

    // NOTE : tous les handlers Legal sont dans useLegalTab.

    // ---- Department data editing (intelligence tab) ----
    const handleUpdateDeptData = useCallback(async (dept: DepartmentData) => {
        try {
            await apiClient.patch(`/admin/departments/${dept.id}`, {
                name: dept.name, code: dept.code, region_id: dept.region_id,
                population: Number(deptDraft.population),
                registered_voters: Number(deptDraft.registered_voters),
            });
            notify('success', `Données mises à jour pour ${dept.name}`);
            setEditingDeptId(null);
            fetchRegions();
        } catch { notify('error', 'Erreur lors de la mise à jour'); }
    }, [apiClient, notify, deptDraft, fetchRegions]);

    // ---- Computed : observateurs par région (pour la carte) ----
    const observersByRegion = useMemo(() => regions.map((r) => ({
        ...r,
        lat: REGION_COORDS[r.code]?.lat,
        lon: REGION_COORDS[r.code]?.lon,
        observers: users.filter((u) => u.region_id === r.id && (u.role === 'observer' || u.role === 'local_coord')).length,
        totalUsers: users.filter((u) => u.region_id === r.id).length,
    })), [regions, users]);

    // ============================================================
    // Retour du hook — objet aplati pour faciliter la déstructuration
    // ============================================================

    return {
        // Navigation & UI
        activeTab, setActiveTab,
        theme, toggleTheme,
        lang, toggleLang,
        t,
        notification, notify,
        alertCount,
        apiClient, auth,
        // PWA
        isOnline, showInstallBanner, setShowInstallBanner, pendingReportsCount,
        // Users
        users, usersPage, usersPagination, usersLoading,
        fetchUsers, handleRoleChange, handleDeleteUser, handleRegionChange, exportUsersCSV,
        // Audit
        auditLogs, auditPage, auditPagination, auditLoading, fetchAuditLogs,
        // Régions
        regions, fetchRegions,
        expandedRegion, setExpandedRegion,
        newRegionName, setNewRegionName,
        newRegionCode, setNewRegionCode,
        newDeptName, setNewDeptName,
        newDeptCode, setNewDeptCode,
        newDeptRegionId, setNewDeptRegionId,
        handleAddRegion, handleDeleteRegion, handleAddDepartment, handleDeleteDepartment,
        // Élections
        elections, fetchElections,
        newElection, setNewElection,
        handleCreateElection, handleElectionStatus, handleDeleteElection,
        // Incidents
        incidentTypes, fetchIncidentTypes,
        newIncident, setNewIncident,
        handleCreateIncidentType, handleDeleteIncidentType,
        // KPIs
        kpis, fetchKPIs,
        // Config
        config, fetchConfig,
        editingConfig, setEditingConfig,
        configDraft, setConfigDraft,
        handleSaveConfig,
        // Tokens
        tokenRole, setTokenRole,
        tokenRegion, setTokenRegion,
        generatedToken, qrDataUrl,
        handleGenerateToken,
        // Légal
        legalDocuments, legalArticles,
        selectedDocId, setSelectedDocId,
        loadingArticles,
        legalSearch, setLegalSearch,
        newDoc, setNewDoc,
        newArticle, setNewArticle,
        showImportAssistant, setShowImportAssistant,
        confirmDeleteDocId, setConfirmDeleteDocId,
        rawTextToParse, setRawTextToParse,
        extractedArticles, setExtractedArticles,
        semanticQuery, setSemanticQuery,
        semanticResults, semanticLoading, embeddingStatus,
        fetchLegalDocuments, fetchLegalArticles,
        handleCreateLegalDoc, handleCreateLegalArticle,
        handleDeleteLegalDocument, handleDeleteLegalArticles, handleDeleteLegalArticle,
        handleBatchImportArticles, handleParseRawText, handleFileUpload,
        handleSemanticSearch, handleGenerateEmbeddings,
        // Department data editing
        editingDeptId, setEditingDeptId,
        deptDraft, setDeptDraft,
        handleUpdateDeptData,
        // Observers map
        observersByRegion,
    };
}