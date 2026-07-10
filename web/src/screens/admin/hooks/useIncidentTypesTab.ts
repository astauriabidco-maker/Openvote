/**
 * Openvote — hook du tab Types d'incidents (CRUD simple).
 *
 * Pattern identique aux autres hooks du refactor admin.
 * State + handlers extraits du god-hook useAdminPanelState.
 *
 * Note : le endpoint /incident-types est public (pas de /admin/), mais
 * les mutations sont sous /admin/incident-types (réservées aux admins).
 */

import { useCallback, useState } from 'react';
import { type AxiosInstance } from 'axios';
import type { IncidentTypeData } from '../../../types';
import type { NotifyFn } from './useUsersTab';

// Form state pour création d'un nouveau type d'incident.
export interface NewIncidentForm {
    name: string;
    code: string;
    description: string;
    severity: number;
    color: string;
}

export interface IncidentTypesTabState {
    // Données
    incidentTypes: IncidentTypeData[];

    // Form state
    newIncident: NewIncidentForm;
    setNewIncident: (i: NewIncidentForm) => void;

    // Actions
    fetchIncidentTypes: () => Promise<void>;
    handleCreateIncidentType: () => Promise<void>;
    handleDeleteIncidentType: (id: string, name: string) => Promise<void>;
}

export function useIncidentTypesTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): IncidentTypesTabState {
    const [incidentTypes, setIncidentTypes] = useState<IncidentTypeData[]>([]);
    const [newIncident, setNewIncident] = useState<NewIncidentForm>({
        name: '', code: '', description: '', severity: 3, color: '#f0883e',
    });

    const fetchIncidentTypes = useCallback(async () => {
        try {
            const res = await apiClient.get('/incident-types');
            setIncidentTypes(res.data.incident_types || []);
        } catch {
            notify('error', 'Erreur chargement types incidents');
        }
    }, [apiClient, notify]);

    const handleCreateIncidentType = useCallback(async () => {
        if (!newIncident.name || !newIncident.code) {
            notify('error', 'Nom et code requis');
            return;
        }
        try {
            await apiClient.post('/admin/incident-types', newIncident);
            notify('success', `Type "${newIncident.name}" créé`);
            setNewIncident({ name: '', code: '', description: '', severity: 3, color: '#f0883e' });
            await fetchIncidentTypes();
        } catch {
            notify('error', 'Erreur création type');
        }
    }, [apiClient, notify, newIncident, fetchIncidentTypes]);

    const handleDeleteIncidentType = useCallback(async (id: string, name: string) => {
        if (!confirm(`Supprimer le type "${name}" ?`)) return;
        try {
            await apiClient.delete(`/admin/incident-types/${id}`);
            notify('success', `Type supprimé`);
            await fetchIncidentTypes();
        } catch {
            notify('error', 'Erreur suppression type');
        }
    }, [apiClient, notify, fetchIncidentTypes]);

    return {
        incidentTypes,
        newIncident,
        setNewIncident,
        fetchIncidentTypes,
        handleCreateIncidentType,
        handleDeleteIncidentType,
    };
}