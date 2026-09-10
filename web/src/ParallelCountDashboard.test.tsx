import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ParallelCountDashboard from './ParallelCountDashboard';

const mocks = vi.hoisted(() => ({
    apiGet: vi.fn(),
    publicGet: vi.fn(),
    getPendingPVs: vi.fn(),
}));

vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => ({ get: mocks.apiGet })),
        get: mocks.publicGet,
        isAxiosError: vi.fn(() => false),
    },
}));

vi.mock('./offlineManager', () => ({
    getPendingPVs: mocks.getPendingPVs,
}));

describe('ParallelCountDashboard', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        mocks.apiGet.mockReset();
        mocks.publicGet.mockReset();
        mocks.getPendingPVs.mockReset();
    });

    it('télécharge le paquet public vérifiable depuis les preuves signées chargées', async () => {
        const user = userEvent.setup();
        let exportedBlob: Blob | null = null;
        let anchor: HTMLAnchorElement | null = null;
        const click = vi.fn();
        const originalCreateElement = document.createElement.bind(document);
        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
            exportedBlob = blob as Blob;
            return 'blob:openvote-proof';
        });
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
            const element = originalCreateElement(tagName, options);
            if (tagName === 'a') {
                anchor = element as HTMLAnchorElement;
                Object.defineProperty(element, 'click', { value: click });
            }
            return element;
        });

        mocks.apiGet.mockImplementation((url: string) => {
            if (url === '/elections') {
                return Promise.resolve({
                    data: {
                        elections: [{
                            id: 'election-001',
                            name: 'Présidentielle Cameroun 2025',
                            type: 'presidential',
                            status: 'active',
                            date: '2025-10-12T00:00:00Z',
                            description: '',
                            region_ids: 'all',
                            created_at: '2026-09-10T00:00:00Z',
                        }],
                    },
                });
            }
            if (url === '/pv-summary?election_id=election-001') {
                return Promise.resolve({
                    data: {
                        summary: {
                            election_id: 'election-001',
                            total_stations: 1,
                            submitted_pv: 1,
                            coverage_rate: 1,
                            total_voters: 120,
                            total_candidate_votes: 120,
                            results: [],
                        },
                    },
                });
            }
            return Promise.reject(new Error(`unexpected url: ${url}`));
        });
        mocks.publicGet.mockResolvedValue({
            data: {
                export: {
                    proof_manifest_version: 2,
                    election_id: 'election-001',
                    generated_at: '2026-09-10T00:00:00Z',
                    total: 1,
                    pv_proofs: [{
                        id: 'pv-001',
                        election_id: 'election-001',
                        polling_station_id: 'station-001',
                        polling_station_code: 'BV001',
                        polling_station_name: 'ECOLE PUBLIQUE',
                        status: 'verified',
                        pv_hash: 'photo-hash',
                        server_payload_hash: 'server-hash',
                        integrity_status: 'trusted',
                        anomalies: [],
                        submitted_at: '2026-09-10T00:00:00Z',
                        updated_at: '2026-09-10T00:00:00Z',
                    }],
                    regional_risks: [{
                        region_id: 'region-ce',
                        region_name: 'CENTRE',
                        normalized_region_name: 'CENTRE',
                        risk_score: 71,
                        risk_status: 'prioritaire',
                        rules: [],
                        coverage_rate: 0.08,
                        submitted_pv: 8,
                        total_stations: 100,
                        evidence: [],
                        snapshot_hash: 'risk-hash-centre',
                        created_at: '2026-09-10T00:00:00Z',
                    }],
                },
                export_proof: {
                    algorithm: 'ED25519_SHA256_EXPORT_V1',
                    export_hash: 'export-hash',
                    signature: 'server-signature',
                    public_key: 'server-public-key',
                    canonical_export: '{"proof_manifest_version":2}',
                },
            },
        });
        mocks.getPendingPVs.mockResolvedValue([]);

        render(<ParallelCountDashboard token="token" />);

        const exportButton = await screen.findByRole('button', { name: 'Télécharger le paquet vérifiable' });
        await waitFor(() => expect(exportButton).toBeEnabled());
        await user.click(exportButton);

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:openvote-proof');
        expect(exportedBlob).not.toBeNull();
        const payload = JSON.parse(await exportedBlob!.text());
        expect(payload.export.election_id).toBe('election-001');
        expect(payload.export.regional_risks[0].risk_score).toBe(71);
        expect(payload.export_proof.signature).toBe('server-signature');
        expect(payload.pv_proofs[0].polling_station_code).toBe('BV001');
        expect(payload.source_endpoint).toBe('/public/pv-proofs?election_id=election-001');

        expect((anchor as HTMLAnchorElement | null)?.download).toBe('openvote-public-proof-pr-sidentielle-cameroun-2025.json');
    });
});
