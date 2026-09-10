import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand, type KPIItem } from '../components/TabHeader';
import type { SourceDocument } from '../../../types';
import '../../../styles/sources.css';

const STATUS_LABELS: Record<string, string> = {
    planned: 'Planifié',
    downloaded: 'Téléchargé',
    extracted: 'Extrait',
    ocr_extracted: 'OCR extrait',
    catalog_tracked: 'Catalogue suivi',
    verified: 'Vérifié',
    rejected: 'Rejeté',
};

const CONFIDENCE_LABELS: Record<string, string> = {
    official: 'Officiel',
    official_estimate: 'Estimation officielle',
    secondary_check: 'Contrôle secondaire',
    unverified: 'Non vérifié',
};

function shortHash(value: string): string {
    if (!value) return '—';
    return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatBytes(bytes: number): string {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString('fr-FR')} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

function statusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
}

function confidenceLabel(confidence: string): string {
    return CONFIDENCE_LABELS[confidence] || confidence;
}

export default function SourcesTab({ state }: { state: AdminPanelState }) {
    const { apiClient, notify } = state;
    const [documents, setDocuments] = useState<SourceDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [confidenceFilter, setConfidenceFilter] = useState('');

    const fetchSources = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/admin/source-documents');
            setDocuments(res.data.source_documents || []);
        } catch {
            notify('error', 'Impossible de charger les sources officielles.');
        } finally {
            setLoading(false);
        }
    }, [apiClient, notify]);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    const statuses = useMemo(() => Array.from(new Set(documents.map((doc) => doc.status))).sort(), [documents]);
    const types = useMemo(() => Array.from(new Set(documents.map((doc) => doc.document_type))).sort(), [documents]);
    const confidences = useMemo(() => Array.from(new Set(documents.map((doc) => doc.confidence))).sort(), [documents]);

    const filteredDocuments = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return documents.filter((doc) => {
            const matchesStatus = !statusFilter || doc.status === statusFilter;
            const matchesType = !typeFilter || doc.document_type === typeFilter;
            const matchesConfidence = !confidenceFilter || doc.confidence === confidenceFilter;
            const searchable = `${doc.title} ${doc.publisher} ${doc.slug} ${doc.source_url} ${doc.local_path} ${doc.notes}`.toLowerCase();
            const matchesQuery = !needle || searchable.includes(needle);
            return matchesStatus && matchesType && matchesConfidence && matchesQuery;
        });
    }, [confidenceFilter, documents, query, statusFilter, typeFilter]);

    const kpis: KPIItem[] = [
        { label: 'Sources', value: documents.length },
        { label: 'Hashées', value: documents.filter((doc) => !!doc.sha256_checksum).length, valueColor: 'var(--color-success)' },
        { label: 'Extraites', value: documents.filter((doc) => ['extracted', 'ocr_extracted', 'verified'].includes(doc.status)).length, valueColor: 'var(--color-accent)' },
        { label: 'OCR', value: documents.filter((doc) => doc.status === 'ocr_extracted').length, valueColor: 'var(--color-warning)' },
        { label: 'Catalogues', value: documents.filter((doc) => doc.status === 'catalog_tracked').length },
        { label: 'Officielles', value: documents.filter((doc) => doc.confidence === 'official').length },
    ];

    return (
        <div className="admin-section sources-tab">
            <TabHeader
                title="📚 Sources officielles"
                subtitle={`${filteredDocuments.length} source${filteredDocuments.length > 1 ? 's' : ''} affichée${filteredDocuments.length > 1 ? 's' : ''} · traçabilité documents, checksums et extractions`}
                actions={<button className="admin-refresh-btn" onClick={fetchSources} disabled={loading}>{loading ? 'Chargement...' : '🔄 Actualiser'}</button>}
            >
                <KPIBand items={kpis} />
            </TabHeader>

            <section className="sources-controls">
                <div className="form-group">
                    <label htmlFor="sources-search">Recherche</label>
                    <input
                        id="sources-search"
                        className="admin-input"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Titre, éditeur, slug, URL..."
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="sources-status">Statut</label>
                    <select id="sources-status" className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">Tous</option>
                        {statuses.map((status) => (
                            <option key={status} value={status}>{statusLabel(status)}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="sources-type">Type</label>
                    <select id="sources-type" className="admin-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="">Tous</option>
                        {types.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="sources-confidence">Confiance</label>
                    <select id="sources-confidence" className="admin-select" value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)}>
                        <option value="">Toutes</option>
                        {confidences.map((confidence) => (
                            <option key={confidence} value={confidence}>{confidenceLabel(confidence)}</option>
                        ))}
                    </select>
                </div>
            </section>

            <section className="sources-table">
                <div className="sources-table-head">
                    <span>Document</span>
                    <span>Statut</span>
                    <span>Confiance</span>
                    <span>SHA-256</span>
                    <span>Fichier</span>
                </div>
                {filteredDocuments.map((doc) => (
                    <article key={doc.id} className="sources-row">
                        <div className="sources-title-cell">
                            <strong>{doc.title}</strong>
                            <small>{doc.publisher} · {doc.document_type}{doc.reference_year ? ` · ${doc.reference_year}` : ''}</small>
                            <a href={doc.source_url} target="_blank" rel="noreferrer">{doc.source_url}</a>
                        </div>
                        <span className={`sources-pill status-${doc.status}`}>{statusLabel(doc.status)}</span>
                        <span className={`sources-pill confidence-${doc.confidence}`}>{confidenceLabel(doc.confidence)}</span>
                        <code title={doc.sha256_checksum || undefined}>{shortHash(doc.sha256_checksum)}</code>
                        <div className="sources-file-cell">
                            <span>{doc.local_path || '—'}</span>
                            <small>{formatBytes(doc.file_size_bytes)} · extraction: {doc.extracted_text_path || '—'}</small>
                        </div>
                    </article>
                ))}
                {filteredDocuments.length === 0 && !loading && (
                    <div className="admin-empty">Aucune source ne correspond aux filtres.</div>
                )}
            </section>
        </div>
    );
}
