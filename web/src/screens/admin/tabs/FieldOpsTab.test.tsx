import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminPanelState } from '../useAdminPanelState';
import type { FieldCoverageSummary, PollingStation } from '../../../types';
import FieldOpsTab from './FieldOpsTab';

const ELECTION_ID = '00002025-0000-4000-8000-000000000001';

function station(overrides: Partial<PollingStation>): PollingStation {
    return {
        id: 'station-1',
        election_id: ELECTION_ID,
        code: 'ELECAM-2025-AD-DJEREM-NGAOUNDAL-0001',
        name: 'ECOLE PUBLIQUE ALI - AFFAIRE / A',
        region_id: 'region-ad',
        department_id: 'department-djerem',
        arrondissement_id: 'arrondissement-ngaoundal',
        registered_voters: 200,
        location_name: 'ADAMAOUA / DJEREM / NGAOUNDAL / ALI - AFFAIRE',
        gps_location: '',
        h3_index: '',
        source_name: 'ELECAM 2025 official polling station lists',
        source_document_id: 'source-ad',
        source_document_slug: 'elecam-bv-2025-adamaoua',
        source_sha256: 'e3fdf74fdb0cd9e470e3a5bec48167e2cbdae32b5e8b5ddd28ad0ae1c657ee2f',
        source_position: 1,
        source_confidence: 'official',
        created_at: '2026-09-10T00:00:00Z',
        updated_at: '2026-09-10T00:00:00Z',
        ...overrides,
    };
}

function coverage(): FieldCoverageSummary {
    return {
        election_id: ELECTION_ID,
        total_stations: 28170,
        assigned_stations: 0,
        unassigned_stations: 28170,
        submitted_pv: 0,
        observer_count: 0,
        coverage_rate: 0,
        regions: [
            {
                region_id: 'region-ad',
                region_name: 'ADAMAOUA',
                total_stations: 120,
                assigned_stations: 0,
                submitted_pv: 0,
                observer_count: 0,
                coverage_rate: 0,
            },
            {
                region_id: 'region-ce',
                region_name: 'CENTRE',
                total_stations: 1,
                assigned_stations: 0,
                submitted_pv: 0,
                observer_count: 0,
                coverage_rate: 0,
            },
            {
                region_id: 'region-ou',
                region_name: 'OUEST',
                total_stations: 40,
                assigned_stations: 20,
                submitted_pv: 2,
                observer_count: 3,
                coverage_rate: 0.05,
            },
        ],
        observers: [],
        silent_zones: [
            {
                zone_type: 'department',
                region_id: 'region-ce',
                region_name: 'CENTRE',
                department_id: 'department-mfoundi',
                department_name: 'MFOUNDI',
                arrondissement_id: '',
                arrondissement_name: '',
                total_stations: 212,
                assigned_stations: 17,
                submitted_pv: 0,
                observer_count: 3,
                coverage_rate: 0,
                priority_score: 309.5,
                priority_label: 'critique',
            },
        ],
    };
}

function makeState() {
    const stations = [
        station({ id: 'station-1', code: 'ELECAM-2025-AD-0001', location_name: 'ADAMAOUA / DJEREM / NGAOUNDAL / ALI - AFFAIRE' }),
        station({ id: 'station-2', code: 'ELECAM-2025-AD-0002', location_name: 'ADAMAOUA / VINA / NGAOUNDERE I / BALADJI', registered_voters: 353 }),
        station({
            id: 'station-3',
            code: 'ELECAM-2025-CE-0001',
            location_name: 'CENTRE / MFOUNDI / YAOUNDE I / BASTOS',
            registered_voters: 460,
            source_document_id: 'source-ce',
            source_document_slug: 'elecam-bv-2025-centre',
            source_sha256: 'e7f45f43af4f5287d99342df0b21853cb6ae923463331345126fc79a961816eb',
        }),
        station({
            id: 'station-4',
            code: 'ELECAM-2025-OU-0001',
            location_name: 'OUEST / MIFI / BAFOUSSAM I / TAMDJA',
            registered_voters: 411,
            source_document_id: 'source-ou',
            source_document_slug: 'elecam-bv-2025-ouest',
            source_sha256: '7ecac9b89ec45ef8f66d0c9fc28d4f55b129ea104af4579478fcaa4c32549640',
        }),
    ];
    const apiClient = {
        get: vi.fn((url: string) => {
            if (url.startsWith('/polling-stations')) return Promise.resolve({ data: { polling_stations: stations } });
            if (url.startsWith('/candidates')) return Promise.resolve({ data: { candidates: [] } });
            if (url.startsWith('/admin/field-coverage')) return Promise.resolve({ data: { coverage: coverage() } });
            return Promise.resolve({ data: {} });
        }),
        post: vi.fn(),
    };
    return {
        apiClient,
        elections: [{
            id: ELECTION_ID,
            name: 'Presidentielle Cameroun 2025',
            type: 'presidential',
            status: 'planned',
            date: '2025-10-12T00:00:00Z',
            description: '',
            region_ids: 'all',
            created_at: '2026-09-10T00:00:00Z',
        }],
        users: [],
        fetchElections: vi.fn(),
        fetchUsers: vi.fn(),
        notify: vi.fn(),
    } as unknown as AdminPanelState;
}

describe('FieldOpsTab', () => {
    it('affiche le référentiel ELECAM 2025 et filtre les bureaux par région lisible', async () => {
        const user = userEvent.setup();
        const { container } = render(<FieldOpsTab state={makeState()} />);

        await waitFor(() => {
            expect(screen.getByText('Référentiel ELECAM 2025')).toBeInTheDocument();
            expect(screen.getAllByText(/28\s?170/).length).toBeGreaterThan(0);
        });

        expect(screen.getByText('Zones silencieuses / priorité terrain')).toBeInTheDocument();
        expect(screen.getAllByText('CENTRE / MFOUNDI').length).toBeGreaterThan(0);
        expect(screen.getByText('Critique')).toBeInTheDocument();
        expect(screen.getAllByText('ADAMAOUA').length).toBeGreaterThan(0);
        expect(screen.getAllByText('DJEREM').length).toBeGreaterThan(0);
        expect(screen.getAllByText('NGAOUNDAL').length).toBeGreaterThan(0);
        expect(screen.getAllByText('CENTRE').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Critique').length).toBeGreaterThan(0);
        expect(screen.getAllByText('elecam-bv-2025-adamaoua').length).toBeGreaterThan(0);
        expect(screen.getAllByText('elecam-bv-2025-centre').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/e3fdf74f/).length).toBeGreaterThan(0);

        const regionFilter = Array.from(container.querySelectorAll('.fieldops-bulk-controls .form-group'))
            .find((group) => group.textContent?.includes('Région'))
            ?.querySelector('select');
        expect(regionFilter).toBeTruthy();

        await user.selectOptions(regionFilter as HTMLSelectElement, 'CENTRE');

        expect(screen.getByText('ELECAM-2025-CE-0001')).toBeInTheDocument();
        expect(screen.queryByText('ELECAM-2025-AD-0001')).not.toBeInTheDocument();

        await user.selectOptions(regionFilter as HTMLSelectElement, '');
        const sourceFilter = Array.from(container.querySelectorAll('.fieldops-bulk-controls .form-group'))
            .find((group) => group.textContent?.includes('Source'))
            ?.querySelector('select');
        expect(sourceFilter).toBeTruthy();

        await user.selectOptions(sourceFilter as HTMLSelectElement, 'elecam-bv-2025-centre');

        expect(screen.getByText('ELECAM-2025-CE-0001')).toBeInTheDocument();
        expect(screen.queryByText('ELECAM-2025-AD-0001')).not.toBeInTheDocument();
    });
});
