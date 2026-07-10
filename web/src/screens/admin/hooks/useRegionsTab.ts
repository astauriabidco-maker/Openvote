/**
 * Openvote — hook du tab Régions & Départements (CRUD sur les deux niveaux).
 *
 * Pattern identique aux autres hooks du refactor admin. État de la liste
 * (régions + leur expansion UI) + form states (création région / département)
 * + 4 handlers (2 create + 2 delete).
 *
 * Note : le fetch liste les régions et imbrique les départements via le
 * endpoint /regions (qui renvoie `regions[].departments[]`).
 */

import { useCallback, useState } from 'react';
import { type AxiosInstance, isAxiosError } from 'axios';
import type { RegionWithDepts } from '../../../types';
import type { ApiPagination } from '../../../apiTypes';
import type { NotifyFn } from './useUsersTab';

// Taille de page pour l'historique des imports. Cohérent avec
// USERS_PAGE_SIZE=25 (cf. admin/constants.ts) — petit dataset, ça reste
// lisible sans scroller ; > 50 imports justifie la pagination.
const HISTORY_PAGE_SIZE = 25;

// Seuil de taille (en octets) au-dessus duquel on demande une
// confirmation explicite avant d'uploader. 1 MiB = 1 048 576 octets.
// Au-delà, le fichier commence à prendre du temps à parser côté
// serveur et l'admin mérite un rappel que c'est un upload lourd.
const LARGE_IMPORT_THRESHOLD_BYTES = 1_048_576;

export interface RegionsTabState {
    // Données
    regions: RegionWithDepts[];
    expandedRegion: string | null;
    setExpandedRegion: (id: string | null) => void;

    // Form state — création région
    newRegionName: string;
    setNewRegionName: (s: string) => void;
    newRegionCode: string;
    setNewRegionCode: (s: string) => void;

    // Form state — création département
    newDeptName: string;
    setNewDeptName: (s: string) => void;
    newDeptCode: string;
    setNewDeptCode: (s: string) => void;
    newDeptRegionId: string;
    setNewDeptRegionId: (s: string) => void;

    // Actions
    fetchRegions: () => Promise<void>;
    handleAddRegion: () => Promise<void>;
    /**
     * Demande de suppression d'une région. Ouvre la <ConfirmDialog> :
     * l'appelant doit aussi rendre le dialogue et brancher confirm/cancel
     * sur `pendingDeleteRegion` exposé ci-dessous.
     */
    handleDeleteRegion: (id: string, name: string) => void;
    handleAddDepartment: () => Promise<void>;
    /**
     * Demande de suppression d'un département. Idem région : ouvre la
     * <ConfirmDialog> via `pendingDeleteDepartment`.
     */
    handleDeleteDepartment: (id: string, name: string) => void;

    // Confirmation de suppression (ConfirmDialog — voir RegionsTab)
    pendingDeleteRegion: { id: string; name: string } | null;
    confirmDeleteRegion: () => Promise<void>;
    cancelDeleteRegion: () => void;
    deletingRegion: boolean;
    pendingDeleteDepartment: { id: string; name: string } | null;
    confirmDeleteDepartment: () => Promise<void>;
    cancelDeleteDepartment: () => void;
    deletingDepartment: boolean;

    // Import CSV démographie (endpoint /admin/regions/import-csv)
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
    // Confirmation de fichier volumineux (> 1 MiB) avant import
    pendingLargeImport: boolean;
    confirmLargeImport: () => Promise<void>;
    cancelLargeImport: () => void;

    // Historique des imports (endpoint /admin/regions/import-csv/history)
    importHistoryOpen: boolean;
    setImportHistoryOpen: (b: boolean) => void;
    importHistory: DataImportRow[];
    importHistoryLoading: boolean;
    /** Page courante (1-indexed) pour la pagination de l'historique. */
    historyPage: number;
    historyPagination: ApiPagination;
    /**
     * Récupère une page d'historique. Sans argument, recharge la page
     * courante. Avec un `page`, navigue vers cette page. Le backend
     * clamp défensivement page/limit (cf. memory entry "Next.js pagination
     * → 500 silencieux").
     */
    handleFetchImportHistory: (page?: number) => Promise<void>;

    // Graphique d'évolution démographique d'un département
    // (endpoint /admin/departments/:id/demographics-history)
    /** État du graphique : null si fermé, {deptId, deptName} si ouvert. */
    evolutionChartDept: { deptId: string; deptName: string } | null;
    setEvolutionChartDept: (d: { deptId: string; deptName: string } | null) => void;
    evolutionChartData: DepartmentDemographicsSnapshot[];
    evolutionChartLoading: boolean;
    handleFetchEvolutionChart: (deptId: string, deptName: string) => Promise<void>;
    closeEvolutionChart: () => void;
}

/** Shape d'une ligne d'historique (cf. entity.DataImport côté Go). */
export interface DataImportRow {
    id: string;
    import_type: string;
    source_name: string;
    file_name: string;
    records_updated: number;
    records_failed: number;
    imported_by: string;
    notes: string;
    created_at: string;
}

/** Snapshot démographique d'un département (cf. entity.DepartmentDemographicsSnapshot). */
export interface DepartmentDemographicsSnapshot {
    id: string;
    department_id: string;
    year: number;
    population: number;
    registered_voters: number;
    data_source: string;
    data_confidence: string;
    recorded_at: string;
}

export function useRegionsTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): RegionsTabState {
    const [regions, setRegions] = useState<RegionWithDepts[]>([]);
    const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
    const [newRegionName, setNewRegionName] = useState('');
    const [newRegionCode, setNewRegionCode] = useState('');
    const [newDeptName, setNewDeptName] = useState('');
    const [newDeptCode, setNewDeptCode] = useState('');
    const [newDeptRegionId, setNewDeptRegionId] = useState('');

    // Confirmation de suppression (ConfirmDialog — voir RegionsTab)
    // Deux états distincts car les messages et labels diffèrent entre
    // région (cascade départements) et département seul.
    const [pendingDeleteRegion, setPendingDeleteRegion] = useState<{ id: string; name: string } | null>(null);
    const [deletingRegion, setDeletingRegion] = useState(false);
    const [pendingDeleteDepartment, setPendingDeleteDepartment] = useState<{ id: string; name: string } | null>(null);
    const [deletingDepartment, setDeletingDepartment] = useState(false);

    // State de la modale Import CSV démographie (voir RegionsTab)
    const [importCSVMopen, setImportCSVMopen] = useState(false);
    const [importCSVFile, setImportCSVFile] = useState<File | null>(null);
    const [importCSVYear, setImportCSVYear] = useState(2025);
    const [importCSVSource, setImportCSVSource] = useState('BUCREP');
    const [importingCSV, setImportingCSV] = useState(false);

    const fetchRegions = useCallback(async () => {
        try {
            const res = await apiClient.get('/regions');
            setRegions(res.data.regions || []);
        } catch {
            notify('error', 'Erreur chargement régions');
        }
    }, [apiClient, notify]);

    const handleAddRegion = useCallback(async () => {
        if (!newRegionName.trim() || !newRegionCode.trim()) {
            notify('error', 'Nom et code requis');
            return;
        }
        try {
            await apiClient.post('/admin/regions', { name: newRegionName, code: newRegionCode });
            notify('success', `Région "${newRegionName}" créée`);
            setNewRegionName(''); setNewRegionCode('');
            await fetchRegions();
        } catch {
            notify('error', 'Erreur création région');
        }
    }, [apiClient, notify, newRegionName, newRegionCode, fetchRegions]);

    /**
     * Demande de suppression d'une région. Remplace `window.confirm()` :
     * on stocke la cible dans `pendingDeleteRegion` et l'UI ouvre
     * un <ConfirmDialog> avec un message d'avertissement sur la cascade.
     */
    const handleDeleteRegion = useCallback((id: string, name: string) => {
        setPendingDeleteRegion({ id, name });
    }, []);

    const confirmDeleteRegion = useCallback(async () => {
        if (!pendingDeleteRegion) return;
        const { id, name } = pendingDeleteRegion;
        setDeletingRegion(true);
        try {
            await apiClient.delete(`/admin/regions/${id}`);
            notify('success', `Région "${name}" supprimée`);
            setPendingDeleteRegion(null);
            await fetchRegions();
        } catch {
            notify('error', 'Erreur suppression région');
        } finally {
            setDeletingRegion(false);
        }
    }, [pendingDeleteRegion, apiClient, notify, fetchRegions]);

    const cancelDeleteRegion = useCallback(() => {
        if (deletingRegion) return; // ignore pendant un delete en cours
        setPendingDeleteRegion(null);
    }, [deletingRegion]);

    const handleAddDepartment = useCallback(async () => {
        if (!newDeptName.trim() || !newDeptCode.trim() || !newDeptRegionId) {
            notify('error', 'Tous les champs requis');
            return;
        }
        try {
            await apiClient.post('/admin/departments', {
                name: newDeptName, code: newDeptCode, region_id: newDeptRegionId,
            });
            notify('success', `Département "${newDeptName}" créé`);
            setNewDeptName(''); setNewDeptCode(''); setNewDeptRegionId('');
            await fetchRegions();
        } catch {
            notify('error', 'Erreur création département');
        }
    }, [apiClient, notify, newDeptName, newDeptCode, newDeptRegionId, fetchRegions]);

    /**
     * Demande de suppression d'un département. Remplace `window.confirm()` :
     * on stocke la cible dans `pendingDeleteDepartment` et l'UI ouvre
     * un <ConfirmDialog>.
     */
    const handleDeleteDepartment = useCallback((id: string, name: string) => {
        setPendingDeleteDepartment({ id, name });
    }, []);

    const confirmDeleteDepartment = useCallback(async () => {
        if (!pendingDeleteDepartment) return;
        const { id, name } = pendingDeleteDepartment;
        setDeletingDepartment(true);
        try {
            await apiClient.delete(`/admin/departments/${id}`);
            notify('success', `Département "${name}" supprimé`);
            setPendingDeleteDepartment(null);
            await fetchRegions();
        } catch {
            notify('error', 'Erreur suppression département');
        } finally {
            setDeletingDepartment(false);
        }
    }, [pendingDeleteDepartment, apiClient, notify, fetchRegions]);

    const cancelDeleteDepartment = useCallback(() => {
        if (deletingDepartment) return;
        setPendingDeleteDepartment(null);
    }, [deletingDepartment]);

    // -------- Import CSV démographie --------
    // Upload multipart du fichier CSV + champs data_year et source_name.
    // Le backend (region_handler.ImportCSV) parse, met à jour les
    // départements par code et renvoie { updated, failed, errors, filename }.
    // On notifie le résultat avec un récapitulatif.
    //
    // Si le fichier dépasse LARGE_IMPORT_THRESHOLD_BYTES (1 MiB), on
    // demande confirmation explicite via `pendingLargeImport` (rendue
    // par <ConfirmDialog> dans RegionsTab). On évite ainsi qu'un clic
    // maladroit déclenche un upload long sur des centaines de lignes.
    const [pendingLargeImport, setPendingLargeImport] = useState(false);

    /**
     * Logique métier réelle d'upload (après confirmation éventuelle).
     * Extraite pour pouvoir être appelée soit depuis handleImportCSV
     * (chemin court, fichier < 1 MiB), soit depuis confirmLargeImport
     * (chemin long, après validation de l'utilisateur).
     */
    const performImport = useCallback(async (file: File, year: number, source: string) => {
        setImportingCSV(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('data_year', String(year));
        formData.append('source_name', source || 'Import CSV');
        try {
            const res = await apiClient.post('/admin/regions/import-csv', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const updated: number = res.data?.updated ?? 0;
            const failed: number = res.data?.failed ?? 0;
            if (failed === 0) {
                notify('success', `✅ ${updated} départements mis à jour depuis "${res.data?.filename || file.name}"`);
            } else {
                notify('info', `⚠️ ${updated} maj, ${failed} échoués (codes introuvables). Voir logs serveur.`);
            }
            setImportCSVMopen(false);
            setImportCSVFile(null);
            await fetchRegions();
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (err.response?.data?.error as string) || 'Format CSV invalide'
                : 'Erreur lors de l\'import';
            // Le backend renvoie les colonnes trouvées + le format attendu
            // quand le header est invalide. On l'affiche à l'utilisateur.
            if (isAxiosError(err) && err.response?.data?.format_attendu) {
                notify('error', `${msg} — Format attendu : ${err.response.data.format_attendu}`);
            } else {
                notify('error', msg);
            }
        } finally {
            setImportingCSV(false);
        }
    }, [apiClient, notify, fetchRegions]);

    const handleImportCSV = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importCSVFile) {
            notify('error', 'Aucun fichier sélectionné');
            return;
        }
        // Si le fichier est volumineux, on demande confirmation AVANT
        // de poster — évite un upload long sur un clic accidentel.
        if (importCSVFile.size > LARGE_IMPORT_THRESHOLD_BYTES) {
            setPendingLargeImport(true);
            return;
        }
        await performImport(importCSVFile, importCSVYear, importCSVSource);
    }, [importCSVFile, importCSVYear, importCSVSource, notify, performImport]);

    const confirmLargeImport = useCallback(async () => {
        if (!importCSVFile) return;
        setPendingLargeImport(false);
        await performImport(importCSVFile, importCSVYear, importCSVSource);
    }, [importCSVFile, importCSVYear, importCSVSource, performImport]);

    const cancelLargeImport = useCallback(() => {
        if (importingCSV) return; // ignore pendant un upload en cours
        setPendingLargeImport(false);
    }, [importingCSV]);

    // Télécharge le CSV modèle (avec tous les codes départements pré-remplis).
    // Le backend renvoie text/csv avec Content-Disposition: attachment.
    // On fetch en blob et on déclenche un download via createObjectURL.
    const handleDownloadTemplate = useCallback(async () => {
        try {
            const res = await apiClient.get('/admin/regions/import-csv/template', {
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'openvote_departments_template.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            notify('info', 'Modèle CSV téléchargé — remplis les colonnes population et registered_voters');
        } catch {
            notify('error', 'Erreur téléchargement du modèle');
        }
    }, [apiClient, notify]);

    // -------- Historique des imports CSV --------
    // GET /admin/regions/import-csv/history?page=N&limit=M →
    // { imports: DataImportRow[], total, page, limit, total_pages }.
    // Le state importHistory est exposé pour que la modale <DataTable>
    // affiche les lignes. L'appel est paresseux (à l'ouverture de la
    // modale) pour éviter un fetch inutile au mount du tab.
    // Pagination server-side (M5 audit) via le composant <Pagination>
    // intégré au <DataTable>.
    const [importHistoryOpen, setImportHistoryOpen] = useState(false);
    const [importHistory, setImportHistory] = useState<DataImportRow[]>([]);
    const [importHistoryLoading, setImportHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyPagination, setHistoryPagination] = useState<ApiPagination>({
        page: 1, limit: HISTORY_PAGE_SIZE, total: 0, total_pages: 0,
    });

    const handleFetchImportHistory = useCallback(async (page?: number) => {
        const target = page ?? historyPage;
        setImportHistoryLoading(true);
        try {
            const res = await apiClient.get(
                `/admin/regions/import-csv/history?page=${target}&limit=${HISTORY_PAGE_SIZE}`,
            );
            const rows: DataImportRow[] = res.data?.imports ?? [];
            setImportHistory(rows);
            setHistoryPage(res.data?.page ?? target);
            setHistoryPagination({
                page: res.data?.page ?? target,
                limit: res.data?.limit ?? HISTORY_PAGE_SIZE,
                total: res.data?.total ?? 0,
                total_pages: res.data?.total_pages ?? 0,
            });
        } catch {
            notify('error', 'Erreur chargement de l\'historique');
            setImportHistory([]);
        } finally {
            setImportHistoryLoading(false);
        }
    }, [apiClient, notify, historyPage]);

    // -------- Graphique d'évolution démographique --------
    // GET /admin/departments/:id/demographics-history?limit=100 →
    //   { snapshots: DepartmentDemographicsSnapshot[], total, dept_id }
    // Les snapshots sont ordonnés ASC (du plus ancien au plus récent)
    // par le backend, prêts à être tracés par <LineChart>.
    const [evolutionChartDept, setEvolutionChartDept] = useState<{ deptId: string; deptName: string } | null>(null);
    const [evolutionChartData, setEvolutionChartData] = useState<DepartmentDemographicsSnapshot[]>([]);
    const [evolutionChartLoading, setEvolutionChartLoading] = useState(false);

    const handleFetchEvolutionChart = useCallback(async (deptId: string, deptName: string) => {
        setEvolutionChartDept({ deptId, deptName });
        setEvolutionChartLoading(true);
        try {
            const res = await apiClient.get(
                `/admin/departments/${deptId}/demographics-history?limit=100`,
            );
            const snapshots: DepartmentDemographicsSnapshot[] = res.data?.snapshots ?? [];
            setEvolutionChartData(snapshots);
        } catch {
            notify('error', 'Erreur chargement de l\'évolution démographique');
            setEvolutionChartData([]);
        } finally {
            setEvolutionChartLoading(false);
        }
    }, [apiClient, notify]);

    const closeEvolutionChart = useCallback(() => {
        setEvolutionChartDept(null);
        setEvolutionChartData([]);
    }, []);

    return {
        regions,
        expandedRegion, setExpandedRegion,
        newRegionName, setNewRegionName,
        newRegionCode, setNewRegionCode,
        newDeptName, setNewDeptName,
        newDeptCode, setNewDeptCode,
        newDeptRegionId, setNewDeptRegionId,
        fetchRegions,
        handleAddRegion,
        handleDeleteRegion,
        handleAddDepartment,
        handleDeleteDepartment,
        // Confirmation de suppression (ConfirmDialog)
        pendingDeleteRegion,
        confirmDeleteRegion,
        cancelDeleteRegion,
        deletingRegion,
        pendingDeleteDepartment,
        confirmDeleteDepartment,
        cancelDeleteDepartment,
        deletingDepartment,
        // Import CSV démographie
        importCSVMopen, setImportCSVMopen,
        importCSVFile, setImportCSVFile,
        importCSVYear, setImportCSVYear,
        importCSVSource, setImportCSVSource,
        importingCSV,
        handleImportCSV,
        handleDownloadTemplate,
        pendingLargeImport,
        confirmLargeImport,
        cancelLargeImport,
        // Historique des imports
        importHistoryOpen, setImportHistoryOpen,
        importHistory,
        importHistoryLoading,
        historyPage, historyPagination,
        handleFetchImportHistory,
        // Graphique d'évolution démographique
        evolutionChartDept, setEvolutionChartDept,
        evolutionChartData,
        evolutionChartLoading,
        handleFetchEvolutionChart,
        closeEvolutionChart,
    };
}