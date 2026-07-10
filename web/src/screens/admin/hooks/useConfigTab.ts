/**
 * Openvote — hook du tab Config runtime (lecture + édition JSON de la config).
 *
 * Le backend expose GET /admin/config (lit la config) et PATCH /admin/config
 * (met à jour avec un payload JSON arbitraire). L'UI affiche le JSON dans
 * un textarea éditable, l'admin peut modifier et sauvegarder.
 *
 * Pattern identique aux autres hooks du refactor admin.
 */

import { useCallback, useState } from 'react';
import { type AxiosInstance } from 'axios';
import type { NotifyFn } from './useUsersTab';

export interface ConfigTabState {
    // Données
    config: Record<string, unknown> | null;

    // Edit state
    editingConfig: boolean;
    setEditingConfig: (b: boolean) => void;
    configDraft: string;
    setConfigDraft: (s: string) => void;

    // Actions
    fetchConfig: () => Promise<void>;
    handleSaveConfig: () => Promise<void>;
}

export function useConfigTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): ConfigTabState {
    const [config, setConfig] = useState<Record<string, unknown> | null>(null);
    const [editingConfig, setEditingConfig] = useState(false);
    const [configDraft, setConfigDraft] = useState('');

    const fetchConfig = useCallback(async () => {
        try {
            const res = await apiClient.get('/admin/config');
            setConfig(res.data);
        } catch {
            notify('error', 'Erreur chargement config');
        }
    }, [apiClient, notify]);

    const handleSaveConfig = useCallback(async () => {
        try {
            const parsed = JSON.parse(configDraft);
            await apiClient.patch('/admin/config', parsed);
            notify('success', 'Configuration sauvegardée');
            setEditingConfig(false);
            await fetchConfig();
        } catch {
            notify('error', 'JSON invalide ou erreur serveur');
        }
    }, [apiClient, notify, configDraft, fetchConfig]);

    return {
        config,
        editingConfig, setEditingConfig,
        configDraft, setConfigDraft,
        fetchConfig,
        handleSaveConfig,
    };
}