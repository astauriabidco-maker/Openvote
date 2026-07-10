/**
 * Openvote — hook du tab Élections (CRUD + changement de statut).
 *
 * Pattern identique aux autres hooks du refactor admin.
 * CRUD : 1 fetch (list), 1 create, 1 update status, 1 delete.
 */

import { useCallback, useState } from 'react';
import { type AxiosInstance } from 'axios';
import type { ElectionData } from '../../../types';
import type { NotifyFn } from './useUsersTab';

// Form state pour création d'un nouveau scrutin.
export interface NewElectionForm {
    name: string;
    type: string;
    date: string;
    description: string;
    region_ids: string;
}

export interface ElectionsTabState {
    // Données
    elections: ElectionData[];

    // Form state
    newElection: NewElectionForm;
    setNewElection: (e: NewElectionForm) => void;

    // Actions
    fetchElections: () => Promise<void>;
    handleCreateElection: () => Promise<void>;
    handleElectionStatus: (id: string, status: string) => Promise<void>;
    /**
     * Demande de suppression. N'exécute plus rien de destructif : on stocke
     * la cible dans `pendingDeleteElection` et l'UI ouvre un <ConfirmDialog>.
     */
    handleDeleteElection: (id: string, name: string) => void;

    // Confirmation de suppression (ConfirmDialog — voir ElectionsTab)
    pendingDeleteElection: { id: string; name: string } | null;
    confirmDeleteElection: () => Promise<void>;
    cancelDeleteElection: () => void;
    deletingElection: boolean;
}

export function useElectionsTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): ElectionsTabState {
    const [elections, setElections] = useState<ElectionData[]>([]);
    const [newElection, setNewElection] = useState<NewElectionForm>({
        name: '', type: 'general', date: '', description: '', region_ids: 'all',
    });

    // Confirmation de suppression (ConfirmDialog — voir ElectionsTab)
    const [pendingDeleteElection, setPendingDeleteElection] = useState<{ id: string; name: string } | null>(null);
    const [deletingElection, setDeletingElection] = useState(false);

    const fetchElections = useCallback(async () => {
        try {
            const res = await apiClient.get('/admin/elections');
            setElections(res.data.elections || []);
        } catch {
            notify('error', 'Erreur chargement scrutins');
        }
    }, [apiClient, notify]);

    const handleCreateElection = useCallback(async () => {
        if (!newElection.name || !newElection.date) {
            notify('error', 'Nom et date requis');
            return;
        }
        try {
            await apiClient.post('/admin/elections', newElection);
            notify('success', `Scrutin "${newElection.name}" créé`);
            setNewElection({ name: '', type: 'general', date: '', description: '', region_ids: 'all' });
            await fetchElections();
        } catch {
            notify('error', 'Erreur création scrutin');
        }
    }, [apiClient, notify, newElection, fetchElections]);

    const handleElectionStatus = useCallback(async (id: string, status: string) => {
        try {
            await apiClient.patch(`/admin/elections/${id}/status`, { status });
            notify('success', `Statut mis à jour`);
            await fetchElections();
        } catch {
            notify('error', 'Erreur mise à jour statut');
        }
    }, [apiClient, notify, fetchElections]);

    /**
     * Demande de suppression. Remplace l'ancien `window.confirm()` : on
     * stocke la cible dans `pendingDeleteElection` et l'UI ouvre un <ConfirmDialog>.
     */
    const handleDeleteElection = useCallback((id: string, name: string) => {
        setPendingDeleteElection({ id, name });
    }, []);

    const confirmDeleteElection = useCallback(async () => {
        if (!pendingDeleteElection) return;
        const { id, name } = pendingDeleteElection;
        setDeletingElection(true);
        try {
            await apiClient.delete(`/admin/elections/${id}`);
            notify('success', `Scrutin "${name}" supprimé`);
            setPendingDeleteElection(null);
            await fetchElections();
        } catch {
            notify('error', 'Erreur suppression scrutin');
        } finally {
            setDeletingElection(false);
        }
    }, [pendingDeleteElection, apiClient, notify, fetchElections]);

    const cancelDeleteElection = useCallback(() => {
        if (deletingElection) return; // ignore pendant un delete en cours
        setPendingDeleteElection(null);
    }, [deletingElection]);

    return {
        elections,
        newElection, setNewElection,
        fetchElections,
        handleCreateElection,
        handleElectionStatus,
        handleDeleteElection,
        // Confirmation de suppression (ConfirmDialog)
        pendingDeleteElection,
        confirmDeleteElection,
        cancelDeleteElection,
        deletingElection,
    };
}