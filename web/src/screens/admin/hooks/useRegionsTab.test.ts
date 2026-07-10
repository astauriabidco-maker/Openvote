/**
 * Tests unitaires pour useRegionsTab — focus sur les 2 nouveaux handlers
 * d'import CSV démographique (ajoutés à l'étape "mini-UI CSV dans RegionsTab").
 *
 * Le reste des handlers (CRUD régions/départements) est déjà couvert
 * indirectement par les tests d'intégration (ils sont exercés via
 * l'UI réelle + axios). On ne mock que les handlers spécifiquement
 * nouveaux pour cette feature.
 *
 * Notes d'implémentation :
 * - renderHook de @testing-library/react v16+ pour invoquer le hook
 *   hors d'un composant React standard.
 * - apiClient mocké via vi.fn() (pas de fetch réseau).
 * - notify mocké pour vérifier les messages d'erreur/succès/info.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AxiosError, type AxiosInstance } from 'axios';
import { useRegionsTab } from './useRegionsTab';
import type { RegionWithDepts } from '../../../types';
import type { NotifyFn } from './useUsersTab';

// Helpers : mock typé de l'apiClient
const makeMockApi = () => {
    const mock = {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    };
    return mock as unknown as AxiosInstance & {
        get: ReturnType<typeof vi.fn>;
        post: ReturnType<typeof vi.fn>;
    };
};

// Helper : génère un faux File pour les tests d'upload
function makeCsvFile(name = 'demo.csv', content = 'code,population\nCE-MF,100000\n'): File {
    return new File([content], name, { type: 'text/csv' });
}

describe('useRegionsTab — Import CSV démographie', () => {
    let api: ReturnType<typeof makeMockApi>;
    let notify: NotifyFn;

    beforeEach(() => {
        api = makeMockApi();
        notify = vi.fn() as unknown as NotifyFn;
    });

    describe('handleDownloadTemplate', () => {
        it('appelle GET /admin/regions/import-csv/template en blob et déclenche le download', async () => {
            // Mock : api.get renvoie un Blob
            const csvBlob = new Blob(['code,name\nCE-MF,Mfoundi\n'], { type: 'text/csv' });
            api.get.mockResolvedValueOnce({ data: csvBlob });

            // Mock URL.createObjectURL + click pour vérifier le download
            const createUrl = vi.fn(() => 'blob:http://localhost/openvote-template');
            const revokeUrl = vi.fn();
            const origCreate = URL.createObjectURL;
            const origRevoke = URL.revokeObjectURL;
            URL.createObjectURL = createUrl;
            URL.revokeObjectURL = revokeUrl;

            // Spy sur createElement('a') + click()
            const origCreateElement = document.createElement.bind(document);
            const clickSpy = vi.fn();
            const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
                const el = origCreateElement(tag);
                if (tag === 'a') {
                    el.click = clickSpy;
                }
                return el;
            });

            const { result } = renderHook(() => useRegionsTab(api, notify));

            await act(async () => {
                await result.current.handleDownloadTemplate();
            });

            expect(api.get).toHaveBeenCalledTimes(1);
            expect(api.get).toHaveBeenCalledWith(
                '/admin/regions/import-csv/template',
                expect.objectContaining({ responseType: 'blob' }),
            );
            expect(createUrl).toHaveBeenCalled();
            expect(clickSpy).toHaveBeenCalledTimes(1);
            expect(notify).toHaveBeenCalledWith(
                'info',
                expect.stringContaining('Modèle CSV téléchargé'),
            );

            // Cleanup mocks
            URL.createObjectURL = origCreate;
            URL.revokeObjectURL = origRevoke;
            createElementSpy.mockRestore();
        });

        it('notifie une erreur si l\'appel échoue', async () => {
            api.get.mockRejectedValueOnce(new Error('Network error'));
            const { result } = renderHook(() => useRegionsTab(api, notify));

            await act(async () => {
                await result.current.handleDownloadTemplate();
            });

            expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('Erreur'));
        });
    });

    describe('handleImportCSV', () => {
        it('notifie une erreur si aucun fichier sélectionné', async () => {
            const { result } = renderHook(() => useRegionsTab(api, notify));
            const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

            await act(async () => {
                await result.current.handleImportCSV(fakeEvent);
            });

            expect(fakeEvent.preventDefault).toHaveBeenCalled();
            expect(api.post).not.toHaveBeenCalled();
            expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('Aucun fichier'));
        });

        it('upload multipart avec FormData (file, data_year, source_name) sur succès 0 failed', async () => {
            api.post.mockResolvedValueOnce({
                data: { message: '5 départements mis à jour', updated: 5, failed: 0, errors: [], filename: 'demo.csv' },
            });

            const { result } = renderHook(() => useRegionsTab(api, notify));
            const file = makeCsvFile();

            // Set file + year + source via les setters du hook
            act(() => result.current.setImportCSVFile(file));
            act(() => result.current.setImportCSVYear(2024));
            act(() => result.current.setImportCSVSource('BUCREP 2024'));

            const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
            await act(async () => {
                await result.current.handleImportCSV(fakeEvent);
            });

            expect(api.post).toHaveBeenCalledTimes(1);
            const [url, formData, config] = api.post.mock.calls[0];
            expect(url).toBe('/admin/regions/import-csv');
            expect(formData).toBeInstanceOf(FormData);
            expect((formData as FormData).get('file')).toBe(file);
            expect((formData as FormData).get('data_year')).toBe('2024');
            expect((formData as FormData).get('source_name')).toBe('BUCREP 2024');
            expect((config as { headers: Record<string, string> }).headers['Content-Type']).toBe('multipart/form-data');
            expect(notify).toHaveBeenCalledWith('success', expect.stringContaining('5 départements mis à jour'));
            // Le modal doit être fermé
            expect(result.current.importCSVMopen).toBe(false);
            // Le fichier doit être reset
            expect(result.current.importCSVFile).toBeNull();
        });

        it('notifie en "info" (warning) quand certaines lignes échouent', async () => {
            api.post.mockResolvedValueOnce({
                data: { message: '3 maj, 2 échoués', updated: 3, failed: 2, errors: ['Ligne 4: code introuvable'], filename: 'demo.csv' },
            });

            const { result } = renderHook(() => useRegionsTab(api, notify));
            act(() => result.current.setImportCSVFile(makeCsvFile()));
            const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
            await act(async () => {
                await result.current.handleImportCSV(fakeEvent);
            });

            expect(notify).toHaveBeenCalledWith('info', expect.stringMatching(/3 maj.*2 échoués/));
        });

        it('notifie une erreur avec format attendu quand le header CSV est invalide', async () => {
            // Le backend renvoie 400 avec { error, colonnes_trouvees, format_attendu }
            const axiosError = new AxiosError('Bad Request');
            axiosError.response = {
                status: 400,
                data: {
                    error: 'Colonnes requises : code, population ou registered_voters (inscrits)',
                    colonnes_trouvees: ['nom', 'effectif'],
                    format_attendu: 'code,population,registered_voters,data_source',
                },
            } as never;
            api.post.mockRejectedValueOnce(axiosError);

            const { result } = renderHook(() => useRegionsTab(api, notify));
            act(() => result.current.setImportCSVFile(makeCsvFile()));
            const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
            await act(async () => {
                await result.current.handleImportCSV(fakeEvent);
            });

            expect(notify).toHaveBeenCalledWith(
                'error',
                expect.stringMatching(/Format attendu.*code,population,registered_voters,data_source/),
            );
        });

        it('notifie une erreur générique si l\'erreur axios n\'a pas de format_attendu', async () => {
            const axiosError = new AxiosError('Internal Server Error');
            axiosError.response = { status: 500, data: { error: 'Boom' } } as never;
            api.post.mockRejectedValueOnce(axiosError);

            const { result } = renderHook(() => useRegionsTab(api, notify));
            act(() => result.current.setImportCSVFile(makeCsvFile()));
            const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
            await act(async () => {
                await result.current.handleImportCSV(fakeEvent);
            });

            expect(notify).toHaveBeenCalledWith('error', 'Boom');
        });

        it('reset importingCSV à false même en cas d\'erreur (finally)', async () => {
            api.post.mockRejectedValueOnce(new Error('Network'));
            const { result } = renderHook(() => useRegionsTab(api, notify));
            act(() => result.current.setImportCSVFile(makeCsvFile()));
            const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
            await act(async () => {
                await result.current.handleImportCSV(fakeEvent);
            });
            expect(result.current.importingCSV).toBe(false);
        });
    });

    // Smoke test : le hook expose bien les nouveaux champs/handlers attendus
    it('expose tous les champs du formulaire CSV dans RegionsTabState', () => {
        const { result } = renderHook(() => useRegionsTab(api, notify));
        expect(typeof result.current.setImportCSVMopen).toBe('function');
        expect(typeof result.current.setImportCSVFile).toBe('function');
        expect(typeof result.current.setImportCSVYear).toBe('function');
        expect(typeof result.current.setImportCSVSource).toBe('function');
        expect(typeof result.current.handleImportCSV).toBe('function');
        expect(typeof result.current.handleDownloadTemplate).toBe('function');
        expect(result.current.importCSVYear).toBe(2025); // default
        expect(result.current.importCSVSource).toBe('BUCREP'); // default
        expect(result.current.importingCSV).toBe(false);
        expect(result.current.importCSVFile).toBeNull();
    });

    // Smoke test : on ne casse pas les handlers existants (régression refactor)
    it('expose toujours les 4 handlers CRUD + les 4 confirm handlers', () => {
        const { result } = renderHook(() => useRegionsTab(api, notify));
        expect(typeof result.current.handleAddRegion).toBe('function');
        expect(typeof result.current.handleDeleteRegion).toBe('function');
        expect(typeof result.current.handleAddDepartment).toBe('function');
        expect(typeof result.current.handleDeleteDepartment).toBe('function');
        expect(typeof result.current.confirmDeleteRegion).toBe('function');
        expect(typeof result.current.cancelDeleteRegion).toBe('function');
        expect(typeof result.current.confirmDeleteDepartment).toBe('function');
        expect(typeof result.current.cancelDeleteDepartment).toBe('function');
    });

    // Smoke test : regions est bien initialisé à []
    it('initialise regions à un tableau vide', () => {
        const { result } = renderHook(() => useRegionsTab(api, notify));
        expect(result.current.regions).toEqual<RegionWithDepts[]>([]);
    });
});
