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

import { useCallback, useEffect, useState } from 'react';
import { type AxiosInstance } from 'axios';
import type {
    AdminUser, AuditLog, DepartmentData, ElectionData, AuthState,
    IncidentTypeData, KPIData, LegalDocument, LegalArticle, RegionWithDepts,
    SemanticSearchResult,
} from '../../types';
import type { ApiPagination } from '../../apiTypes';
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
import { useAdminUI } from './hooks/useAdminUI';
import { useObserversMap } from './hooks/useObserversMap';

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
    handleDeleteUser: (userId: string, username: string) => void;
    handleRegionChange: (userId: string, newRegionId: string) => Promise<void>;
    exportUsersCSV: () => void;
    // POC ConfirmDialog : state partagé pour la confirmation de suppression
    pendingDelete: { id: string; name: string } | null;
    confirmDeleteUser: () => Promise<void>;
    cancelDeleteUser: () => void;
    deletingUser: boolean;

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
    handleDeleteRegion: (id: string, name: string) => void;
    handleAddDepartment: () => Promise<void>;
    handleDeleteDepartment: (id: string, name: string) => void;
    // ConfirmDialog : state partagé pour la confirmation de suppression région/département
    pendingDeleteRegion: { id: string; name: string } | null;
    confirmDeleteRegion: () => Promise<void>;
    cancelDeleteRegion: () => void;
    deletingRegion: boolean;
    pendingDeleteDepartment: { id: string; name: string } | null;
    confirmDeleteDepartment: () => Promise<void>;
    cancelDeleteDepartment: () => void;
    deletingDepartment: boolean;
    // Import CSV démographie (UI : FormModal dans RegionsTab)
    importCSVMopen: boolean;
    setImportCSVMopen: (b: boolean) => void;
    importCSVFile: File | null;
    setImportCSVFile: (f: File | null) => void;
    importCSVYear: number;
    setImportCSVYear: (n: number) => void;
    importCSVSource: string;
    setImportCSVSource: (s: string) => void;
    importingCSV: boolean;
    handleImportCSV: (e: React.FormEvent) => Promise<void>;
    handleDownloadTemplate: () => Promise<void>;
    // Historique des imports CSV (modale avec DataTable)
    importHistoryOpen: boolean;
    setImportHistoryOpen: (b: boolean) => void;
    importHistory: import('./hooks/useRegionsTab').DataImportRow[];
    importHistoryLoading: boolean;
    /** Page courante (1-indexed) de l'historique. */
    historyPage: number;
    historyPagination: ApiPagination;
    /**
     * Récupère une page d'historique. Sans argument recharge la page
     * courante, avec un `page` navigue vers cette page.
     */
    handleFetchImportHistory: (page?: number) => Promise<void>;

    // ---- Élections ----
    elections: ElectionData[];
    fetchElections: () => Promise<void>;
    newElection: NewElectionForm;
    setNewElection: (e: NewElectionForm) => void;
    handleCreateElection: () => Promise<void>;
    handleElectionStatus: (id: string, status: string) => Promise<void>;
    handleDeleteElection: (id: string, name: string) => void;
    // ConfirmDialog : state partagé pour la confirmation de suppression scrutin
    pendingDeleteElection: { id: string; name: string } | null;
    confirmDeleteElection: () => Promise<void>;
    cancelDeleteElection: () => void;
    deletingElection: boolean;

    // ---- Types d'incidents ----
    incidentTypes: IncidentTypeData[];
    fetchIncidentTypes: () => Promise<void>;
    newIncident: NewIncidentForm;
    setNewIncident: (i: NewIncidentForm) => void;
    handleCreateIncidentType: () => Promise<void>;
    handleDeleteIncidentType: (id: string, name: string) => void;
    // ConfirmDialog : state partagé pour la confirmation de suppression type d'incident
    pendingDeleteIncidentType: { id: string; name: string } | null;
    confirmDeleteIncidentType: () => Promise<void>;
    cancelDeleteIncidentType: () => void;
    deletingIncidentType: boolean;

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
    pendingDeleteArticleId: string | null;
    setPendingDeleteArticleId: (id: string | null) => void;
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
// i18n : les traductions sont dans constants.ts (TRANSLATIONS), importées
// par useAdminUI. Le god-hook ne les connaît plus directement.
// ============================================================

// ============================================================
// Hook
// ============================================================

export function useAdminPanelState(
    apiClient: AxiosInstance,
    auth: AuthState,
): AdminPanelState {
    // ---- Chrome UI (refactor admin) ----
    // Navigation, thème, i18n, notifications, PWA : tout est extrait.
    // `notify` est passé aux hooks de domaine qui en ont besoin.
    const {
        activeTab, setActiveTab,
        theme, toggleTheme,
        lang, toggleLang, t,
        notification, notify,
        isOnline, showInstallBanner, setShowInstallBanner,
        pendingReportsCount,
    } = useAdminUI();

    // ---- Users (M5 + M6) — délégué à useUsersTab (refactor admin) ----
    // La logique (state + handlers) est extraite dans hooks/useUsersTab.ts.
    // On récupère le résultat et on l'expose tel quel pour ne pas casser
    // les autres consommateurs (UsersTab, AdminPanel PDF, observersByRegion).
    const {
        users, usersPage, usersPagination, usersLoading,
        fetchUsers, handleRoleChange, handleDeleteUser, handleRegionChange, exportUsersCSV,
        pendingDelete, confirmDeleteUser, cancelDeleteUser, deletingUser,
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
        pendingDeleteRegion, confirmDeleteRegion, cancelDeleteRegion, deletingRegion,
        pendingDeleteDepartment, confirmDeleteDepartment, cancelDeleteDepartment, deletingDepartment,
        importCSVMopen, setImportCSVMopen,
        importCSVFile, setImportCSVFile,
        importCSVYear, setImportCSVYear,
        importCSVSource, setImportCSVSource,
        importingCSV, handleImportCSV, handleDownloadTemplate,
        importHistoryOpen, setImportHistoryOpen,
        importHistory, importHistoryLoading,
        historyPage, historyPagination, handleFetchImportHistory,
    } = useRegionsTab(apiClient, notify);

    // ---- Élections — délégué à useElectionsTab (refactor admin) ----
    const {
        elections, newElection, setNewElection,
        fetchElections, handleCreateElection, handleElectionStatus, handleDeleteElection,
        pendingDeleteElection, confirmDeleteElection, cancelDeleteElection, deletingElection,
    } = useElectionsTab(apiClient, notify);

    // ---- Types d'incidents — délégué à useIncidentTypesTab (refactor admin) ----
    const {
        incidentTypes, newIncident, setNewIncident,
        fetchIncidentTypes, handleCreateIncidentType, handleDeleteIncidentType,
        pendingDeleteIncidentType, confirmDeleteIncidentType, cancelDeleteIncidentType, deletingIncidentType,
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
        pendingDeleteArticleId, setPendingDeleteArticleId,
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

    // NOTE : le useEffect IndexedDB pour pendingReportsCount est dans useAdminUI.

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
    // Délégué à useObserversMap (refactor admin) — pure compute, testable
    // en isolation sans mock axios.
    const observersByRegion = useObserversMap(regions, users);

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
        pendingDelete, confirmDeleteUser, cancelDeleteUser, deletingUser,
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
        pendingDeleteRegion, confirmDeleteRegion, cancelDeleteRegion, deletingRegion,
        pendingDeleteDepartment, confirmDeleteDepartment, cancelDeleteDepartment, deletingDepartment,
        importCSVMopen, setImportCSVMopen,
        importCSVFile, setImportCSVFile,
        importCSVYear, setImportCSVYear,
        importCSVSource, setImportCSVSource,
        importingCSV, handleImportCSV, handleDownloadTemplate,
        importHistoryOpen, setImportHistoryOpen,
        importHistory, importHistoryLoading,
        historyPage, historyPagination, handleFetchImportHistory,
        // Élections
        elections, fetchElections,
        newElection, setNewElection,
        handleCreateElection, handleElectionStatus, handleDeleteElection,
        pendingDeleteElection, confirmDeleteElection, cancelDeleteElection, deletingElection,
        // Incidents
        incidentTypes, fetchIncidentTypes,
        newIncident, setNewIncident,
        handleCreateIncidentType, handleDeleteIncidentType,
        pendingDeleteIncidentType, confirmDeleteIncidentType, cancelDeleteIncidentType, deletingIncidentType,
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
        pendingDeleteArticleId, setPendingDeleteArticleId,
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