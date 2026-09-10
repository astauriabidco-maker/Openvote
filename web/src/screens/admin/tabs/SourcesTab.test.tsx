import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminPanelState } from '../useAdminPanelState';
import SourcesTab from './SourcesTab';

function makeState() {
    const apiClient = {
        get: vi.fn().mockResolvedValue({
            data: {
                source_documents: [
                    {
                        id: 'src-1',
                        slug: 'elecam-bv-2025-diaspora',
                        title: 'Liste des bureaux de vote Diaspora - Presidentielle 2025',
                        publisher: 'ELECAM',
                        source_url: 'https://portail.elecam.cm/download/k-liste-bv-diaspora-presidentielle-2025/?wpdmdl=3210',
                        document_type: 'polling_station_list',
                        language: 'fr',
                        local_path: 'data/sources/official/pdfs/elecam-bv-2025-diaspora.pdf',
                        extracted_text_path: 'data/sources/official/extracted/elecam-bv-2025-diaspora.txt',
                        sha256_checksum: 'c239884a103d816fd9d3d58962d7a04053659cac8cb5164ff6d2c4127c398eff',
                        mime_type: 'application/pdf',
                        file_size_bytes: 947859,
                        granularity: 'diaspora,polling_station',
                        reference_year: 2025,
                        confidence: 'official',
                        status: 'ocr_extracted',
                        notes: 'OCR texte généré localement.',
                        created_at: '2026-09-10T00:00:00Z',
                        updated_at: '2026-09-10T00:00:00Z',
                    },
                    {
                        id: 'src-2',
                        slug: 'prc-decret-2025-305-convocation-presidentielle',
                        title: 'Decret no 2025/305 du 11 juillet 2025',
                        publisher: 'Presidence de la Republique du Cameroun',
                        source_url: 'https://prc.cm/fr/actualites/actes/decrets/7865-decret-n-2025-305',
                        document_type: 'decree',
                        language: 'fr',
                        local_path: 'data/sources/official/html/prc-decret-2025-305-convocation-presidentielle.html',
                        extracted_text_path: 'data/sources/official/extracted/prc-decret-2025-305-convocation-presidentielle.txt',
                        sha256_checksum: '73e7fef2fca060dfab0347fc7c0a95350370ecaf9c4cf6fe8d3bfafc19313820',
                        mime_type: 'text/html',
                        file_size_bytes: 28156,
                        granularity: 'election',
                        reference_year: 2025,
                        confidence: 'official',
                        status: 'extracted',
                        notes: 'Source primaire PRC archivée en HTML officiel.',
                        created_at: '2026-09-10T00:00:00Z',
                        updated_at: '2026-09-10T00:00:00Z',
                    },
                ],
            },
        }),
    };
    return {
        apiClient,
        notify: vi.fn(),
    } as unknown as AdminPanelState;
}

describe('SourcesTab', () => {
    it('affiche les sources officielles et filtre par statut OCR', async () => {
        const user = userEvent.setup();
        render(<SourcesTab state={makeState()} />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Sources officielles/ })).toBeInTheDocument();
            expect(screen.getByText('Liste des bureaux de vote Diaspora - Presidentielle 2025')).toBeInTheDocument();
            expect(screen.getByText('Decret no 2025/305 du 11 juillet 2025')).toBeInTheDocument();
        });

        expect(screen.getByText(/c239884a10/)).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Statut'), 'ocr_extracted');

        expect(screen.getByText('Liste des bureaux de vote Diaspora - Presidentielle 2025')).toBeInTheDocument();
        expect(screen.queryByText('Decret no 2025/305 du 11 juillet 2025')).not.toBeInTheDocument();
    });
});
