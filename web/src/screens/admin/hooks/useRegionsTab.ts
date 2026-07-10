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
    handleDeleteRegion: (id: string, name: string) => Promise<void>;
    handleAddDepartment: () => Promise<void>;
    handleDeleteDepartment: (id: string, name: string) => Promise<void>;
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

    const handleDeleteRegion = useCallback(async (id: string, name: string) => {
        if (!confirm(`Supprimer la région "${name}" et TOUS ses départements ?`)) return;
        try {
            await apiClient.delete(`/admin/regions/${id}`);
            notify('success', `Région "${name}" supprimée`);
            await fetchRegions();
        } catch {
            notify('error', 'Erreur suppression région');
        }
    }, [apiClient, notify, fetchRegions]);

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

    const handleDeleteDepartment = useCallback(async (id: string, name: string) => {
        if (!confirm(`Supprimer le département "${name}" ?`)) return;
        try {
            await apiClient.delete(`/admin/departments/${id}`);
            notify('success', `Département "${name}" supprimé`);
            await fetchRegions();
        } catch {
            notify('error', 'Erreur suppression département');
        }
    }, [apiClient, notify, fetchRegions]);

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
    };
}