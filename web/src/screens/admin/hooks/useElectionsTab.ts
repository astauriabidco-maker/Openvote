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
    handleDeleteElection: (id: string, name: string) => Promise<void>;
}

export function useElectionsTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): ElectionsTabState {
    const [elections, setElections] = useState<ElectionData[]>([]);
    const [newElection, setNewElection] = useState<NewElectionForm>({
        name: '', type: 'general', date: '', description: '', region_ids: 'all',
    });

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

    const handleDeleteElection = useCallback(async (id: string, name: string) => {
        if (!confirm(`Supprimer le scrutin "${name}" ?`)) return;
        try {
            await apiClient.delete(`/admin/elections/${id}`);
            notify('success', `Scrutin supprimé`);
            await fetchElections();
        } catch {
            notify('error', 'Erreur suppression scrutin');
        }
    }, [apiClient, notify, fetchElections]);

    return {
        elections,
        newElection, setNewElection,
        fetchElections,
        handleCreateElection,
        handleElectionStatus,
        handleDeleteElection,
    };
}