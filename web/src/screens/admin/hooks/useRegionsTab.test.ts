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

// Helper : génère un gros fichier (> 1 MiB) pour tester le seuil de
// confirmation. On n'écrit pas 1 MiB de données en mémoire : on stub
// directement la propriété .size du File.
function makeLargeCsvFile(): File {
    const file = makeCsvFile('big.csv', 'code,population\nCE-MF,1\n');
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024, writable: false });
    return file;
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

        // ---- Confirmation fichier volumineux (> 1 MiB) ----
        describe('seuil 1 MiB', () => {
            it('upload direct sans confirmation si fichier < 1 MiB', async () => {
                api.post.mockResolvedValueOnce({
                    data: { message: '5 départements mis à jour', updated: 5, failed: 0, errors: [], filename: 'small.csv' },
                });
                const { result } = renderHook(() => useRegionsTab(api, notify));
                act(() => result.current.setImportCSVFile(makeCsvFile())); // < 1 MiB
                const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
                await act(async () => {
                    await result.current.handleImportCSV(fakeEvent);
                });
                expect(api.post).toHaveBeenCalledTimes(1);
                expect(result.current.pendingLargeImport).toBe(false);
            });

            it('NE POSTE PAS si fichier > 1 MiB, ouvre la confirmation', async () => {
                const { result } = renderHook(() => useRegionsTab(api, notify));
                act(() => result.current.setImportCSVFile(makeLargeCsvFile())); // 2 MiB
                const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
                await act(async () => {
                    await result.current.handleImportCSV(fakeEvent);
                });
                expect(api.post).not.toHaveBeenCalled();
                expect(result.current.pendingLargeImport).toBe(true);
            });

            it('confirmLargeImport déclenche l\'upload après validation', async () => {
                api.post.mockResolvedValueOnce({
                    data: { message: '5 départements mis à jour', updated: 5, failed: 0, errors: [], filename: 'big.csv' },
                });
                const { result } = renderHook(() => useRegionsTab(api, notify));
                const big = makeLargeCsvFile();
                act(() => result.current.setImportCSVFile(big));
                // 1) Demande initiale → ouvre la modale
                const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
                await act(async () => {
                    await result.current.handleImportCSV(fakeEvent);
                });
                expect(result.current.pendingLargeImport).toBe(true);
                expect(api.post).not.toHaveBeenCalled();
                // 2) Confirmation → upload
                await act(async () => {
                    await result.current.confirmLargeImport();
                });
                expect(api.post).toHaveBeenCalledTimes(1);
                expect(result.current.pendingLargeImport).toBe(false);
            });

            it('cancelLargeImport ferme la modale sans uploader', async () => {
                const { result } = renderHook(() => useRegionsTab(api, notify));
                act(() => result.current.setImportCSVFile(makeLargeCsvFile()));
                const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
                await act(async () => {
                    await result.current.handleImportCSV(fakeEvent);
                });
                expect(result.current.pendingLargeImport).toBe(true);
                act(() => result.current.cancelLargeImport());
                expect(result.current.pendingLargeImport).toBe(false);
                expect(api.post).not.toHaveBeenCalled();
            });

            it('smoke : expose pendingLargeImport/confirm/cancel dans RegionsTabState', () => {
                const { result } = renderHook(() => useRegionsTab(api, notify));
                expect(result.current.pendingLargeImport).toBe(false);
                expect(typeof result.current.confirmLargeImport).toBe('function');
                expect(typeof result.current.cancelLargeImport).toBe('function');
            });
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

    // ---- Historique des imports CSV ----
    describe('handleFetchImportHistory', () => {
        it('appelle GET /admin/regions/import-csv/history et stocke les imports', async () => {
            const sampleImports = [
                {
                    id: 'i1',
                    import_type: 'demographics',
                    source_name: 'BUCREP 2023',
                    file_name: 'demo.csv',
                    records_updated: 12,
                    records_failed: 2,
                    imported_by: 'admin',
                    notes: '12 maj, 2 échoués',
                    created_at: '2026-07-10T14:00:00Z',
                },
                {
                    id: 'i2',
                    import_type: 'demographics',
                    source_name: 'BUCREP 2024',
                    file_name: 'demo2.csv',
                    records_updated: 50,
                    records_failed: 0,
                    imported_by: 'admin',
                    notes: '50 départements mis à jour',
                    created_at: '2026-07-09T10:30:00Z',
                },
            ];
            api.get.mockResolvedValueOnce({
                data: { imports: sampleImports, total: 2, page: 1, limit: 25, total_pages: 1 },
            });

            const { result } = renderHook(() => useRegionsTab(api, notify));
            expect(result.current.importHistory).toEqual([]);

            await act(async () => {
                await result.current.handleFetchImportHistory();
            });

            expect(api.get).toHaveBeenCalledTimes(1);
            expect(api.get).toHaveBeenCalledWith('/admin/regions/import-csv/history?page=1&limit=25');
            expect(result.current.importHistory).toHaveLength(2);
            expect(result.current.importHistory[0].source_name).toBe('BUCREP 2023');
            expect(result.current.importHistory[0].records_updated).toBe(12);
            expect(result.current.importHistoryLoading).toBe(false);
        });

        it('notifie une erreur et reset la liste si l\'appel échoue', async () => {
            api.get.mockRejectedValueOnce(new Error('Network'));

            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchImportHistory();
            });

            expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('historique'));
            expect(result.current.importHistory).toEqual([]);
            expect(result.current.importHistoryLoading).toBe(false);
        });

        it('gère une réponse sans champ `imports` (defensive)', async () => {
            api.get.mockResolvedValueOnce({ data: { total: 0 } });

            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchImportHistory();
            });

            expect(result.current.importHistory).toEqual([]);
        });

        it('toggle le flag importHistoryLoading pendant le fetch', async () => {
            // Mock qui résout seulement après qu'on ait lu loading=true
            let resolveFn!: (v: unknown) => void;
            api.get.mockReturnValueOnce(new Promise((resolve) => { resolveFn = resolve; }));

            const { result } = renderHook(() => useRegionsTab(api, notify));

            // Lance le fetch sans await pour observer l'état intermédiaire
            act(() => {
                void result.current.handleFetchImportHistory();
            });
            // Synchronously, le flag doit être passé à true
            expect(result.current.importHistoryLoading).toBe(true);

            // Résout le mock → finally → loading doit revenir à false
            await act(async () => {
                resolveFn({ data: { imports: [] } });
            });
            expect(result.current.importHistoryLoading).toBe(false);
        });

        it('expose importHistoryOpen et son setter (modale)', () => {
            const { result } = renderHook(() => useRegionsTab(api, notify));
            expect(result.current.importHistoryOpen).toBe(false);
            expect(typeof result.current.setImportHistoryOpen).toBe('function');

            act(() => result.current.setImportHistoryOpen(true));
            expect(result.current.importHistoryOpen).toBe(true);
        });

        // ---- Pagination server-side (M5 audit) ----
        it('appelle GET avec ?page=1&limit=25 par défaut', async () => {
            api.get.mockResolvedValueOnce({
                data: { imports: [], total: 0, page: 1, limit: 25, total_pages: 0 },
            });
            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchImportHistory();
            });
            expect(api.get).toHaveBeenCalledWith(
                '/admin/regions/import-csv/history?page=1&limit=25',
            );
            expect(result.current.historyPage).toBe(1);
        });

        it('appelle GET avec la page demandée (pagination)', async () => {
            api.get.mockResolvedValueOnce({
                data: {
                    imports: [{ id: 'p3', import_type: 'demographics', source_name: 'X', file_name: 'f',
                                records_updated: 1, records_failed: 0, imported_by: 'admin',
                                notes: '', created_at: '2026-07-10T00:00:00Z' }],
                    total: 75, page: 3, limit: 25, total_pages: 3,
                },
            });
            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchImportHistory(3);
            });
            expect(api.get).toHaveBeenCalledWith(
                '/admin/regions/import-csv/history?page=3&limit=25',
            );
            expect(result.current.historyPage).toBe(3);
            expect(result.current.historyPagination).toEqual({
                page: 3, limit: 25, total: 75, total_pages: 3,
            });
        });

        it('stocke correctement la pagination même si la réponse omet total_pages', async () => {
            api.get.mockResolvedValueOnce({
                data: { imports: [], total: 0, page: 1, limit: 25 }, // pas de total_pages
            });
            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchImportHistory();
            });
            expect(result.current.historyPagination.total_pages).toBe(0);
        });
    });

    // ---- Graphique d'évolution démographique ----
    describe('handleFetchEvolutionChart', () => {
        it('appelle GET /admin/departments/:id/demographics-history et stocke les snapshots', async () => {
            api.get.mockResolvedValueOnce({
                data: {
                    snapshots: [
                        { id: 's1', department_id: 'd1', year: 2025, population: 1_000_000,
                          registered_voters: 200_000, data_source: 'X', data_confidence: 'official',
                          recorded_at: '2026-01-01T00:00:00Z' },
                        { id: 's2', department_id: 'd1', year: 2025, population: 1_200_000,
                          registered_voters: 250_000, data_source: 'X', data_confidence: 'official',
                          recorded_at: '2026-07-01T00:00:00Z' },
                    ],
                    total: 2, dept_id: 'd1',
                },
            });

            const { result } = renderHook(() => useRegionsTab(api, notify));
            expect(result.current.evolutionChartDept).toBeNull();
            expect(result.current.evolutionChartData).toEqual([]);

            await act(async () => {
                await result.current.handleFetchEvolutionChart('d1', 'Mfoundi');
            });

            expect(api.get).toHaveBeenCalledWith(
                '/admin/departments/d1/demographics-history?limit=100',
            );
            expect(result.current.evolutionChartDept).toEqual({ deptId: 'd1', deptName: 'Mfoundi' });
            expect(result.current.evolutionChartData).toHaveLength(2);
            expect(result.current.evolutionChartData[0].population).toBe(1_000_000);
            expect(result.current.evolutionChartLoading).toBe(false);
        });

        it('notifie une erreur et reset les snapshots si l\'appel échoue', async () => {
            api.get.mockRejectedValueOnce(new Error('Network'));

            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchEvolutionChart('d1', 'Mfoundi');
            });

            expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('évolution'));
            expect(result.current.evolutionChartData).toEqual([]);
        });

        it('gère une réponse sans champ snapshots (defensive)', async () => {
            api.get.mockResolvedValueOnce({ data: { total: 0, dept_id: 'd1' } });

            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchEvolutionChart('d1', 'Mfoundi');
            });

            expect(result.current.evolutionChartData).toEqual([]);
        });

        it('closeEvolutionChart reset le state', async () => {
            api.get.mockResolvedValueOnce({
                data: { snapshots: [{ id: 's1', department_id: 'd1', year: 2025, population: 1_000_000,
                                     registered_voters: 200_000, data_source: '', data_confidence: '',
                                     recorded_at: '2026-01-01T00:00:00Z' }], total: 1, dept_id: 'd1' },
            });
            const { result } = renderHook(() => useRegionsTab(api, notify));
            await act(async () => {
                await result.current.handleFetchEvolutionChart('d1', 'Mfoundi');
            });
            expect(result.current.evolutionChartDept).not.toBeNull();
            act(() => result.current.closeEvolutionChart());
            expect(result.current.evolutionChartDept).toBeNull();
            expect(result.current.evolutionChartData).toEqual([]);
        });
    });
});
