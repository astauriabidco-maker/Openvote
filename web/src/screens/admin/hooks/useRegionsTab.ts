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
import { type AxiosInstance } from 'axios';
import type { RegionWithDepts } from '../../../types';
import type { NotifyFn } from './useUsersTab';

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
    };
}