/**
 * Openvote — hook du tab Cadre Légal (CMS + RAG + import PDF).
 *
 * Le plus gros des hooks extraits du god-hook useAdminPanelState. Couvre :
 *   - CMS des documents légaux (CRUD docs + articles)
 *   - Parser regex pour découper un texte brut en articles
 *   - Upload PDF → extraction texte via backend
 *   - Recherche sémantique (RAG) + génération d'embeddings
 *   - Batch import des articles extraits vers le backend
 *
 * Pattern identique aux autres hooks du refactor admin.
 */

import { useCallback, useState } from 'react';
import { type ChangeEvent } from 'react';
import { type AxiosInstance } from 'axios';
import type { LegalDocument, LegalArticle, SemanticSearchResult } from '../../../types';
import type { NotifyFn } from './useUsersTab';

// ============================================================
// Types
// ============================================================

export interface NewDocForm {
    title: string;
    description: string;
    doc_type: string;
    version: string;
    full_text: string;
    file_path: string;
}

export interface NewArticleForm {
    article_number: string;
    title: string;
    content: string;
    category: string;
}

export interface LegalTabState {
    // Données
    legalDocuments: LegalDocument[];
    legalArticles: LegalArticle[];
    selectedDocId: string | null;
    setSelectedDocId: (id: string | null) => void;
    loadingArticles: boolean;

    // Search state
    legalSearch: string;
    setLegalSearch: (s: string) => void;

    // Form state — nouveau document
    newDoc: NewDocForm;
    setNewDoc: (d: NewDocForm) => void;

    // Form state — nouvel article
    newArticle: NewArticleForm;
    setNewArticle: (a: NewArticleForm) => void;

    // Import assistant (PDF → articles)
    showImportAssistant: boolean;
    setShowImportAssistant: (b: boolean) => void;
    rawTextToParse: string;
    setRawTextToParse: (s: string) => void;
    extractedArticles: Partial<LegalArticle>[];
    setExtractedArticles: (a: Partial<LegalArticle>[]) => void;

    // Confirmation de suppression doc (inline pattern — pas ConfirmDialog)
    confirmDeleteDocId: string | null;
    setConfirmDeleteDocId: (id: string | null) => void;

    // Confirmation de suppression article (idem doc, inline Oui/Non pattern
    // pour rester cohérent avec le delete doc dans la même UI).
    pendingDeleteArticleId: string | null;
    setPendingDeleteArticleId: (id: string | null) => void;

    // RAG (sémantique)
    semanticQuery: string;
    setSemanticQuery: (s: string) => void;
    semanticResults: SemanticSearchResult[];
    semanticLoading: boolean;
    embeddingStatus: string | null;

    // Actions
    fetchLegalDocuments: () => Promise<void>;
    fetchLegalArticles: () => Promise<void>;
    handleCreateLegalDoc: () => Promise<void>;
    handleCreateLegalArticle: () => Promise<void>;
    handleDeleteLegalDocument: (id: string) => Promise<void>;
    handleDeleteLegalArticles: (docId: string) => Promise<void>;
    handleDeleteLegalArticle: (articleId: string) => Promise<void>;
    handleBatchImportArticles: () => Promise<void>;
    handleParseRawText: () => void;
    handleFileUpload: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
    handleSemanticSearch: () => Promise<void>;
    handleGenerateEmbeddings: () => Promise<void>;
}

// ============================================================
// Hook
// ============================================================

export function useLegalTab(
    apiClient: AxiosInstance,
    notify: NotifyFn,
): LegalTabState {
    const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
    const [legalArticles, setLegalArticles] = useState<LegalArticle[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [loadingArticles, setLoadingArticles] = useState(false);
    const [legalSearch, setLegalSearch] = useState('');
    const [newDoc, setNewDoc] = useState<NewDocForm>({
        title: '', description: '', doc_type: 'law', version: '', full_text: '', file_path: '',
    });
    const [newArticle, setNewArticle] = useState<NewArticleForm>({
        article_number: '', title: '', content: '', category: 'General',
    });
    const [showImportAssistant, setShowImportAssistant] = useState(false);
    const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
    const [pendingDeleteArticleId, setPendingDeleteArticleId] = useState<string | null>(null);
    const [rawTextToParse, setRawTextToParse] = useState('');
    const [extractedArticles, setExtractedArticles] = useState<Partial<LegalArticle>[]>([]);
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
    const [semanticLoading, setSemanticLoading] = useState(false);
    const [embeddingStatus, setEmbeddingStatus] = useState<string | null>(null);

    // -------- Fetch documents + articles --------
    const fetchLegalDocuments = useCallback(async () => {
        try {
            const res = await apiClient.get('/admin/legal-documents');
            const docs = Array.isArray(res.data) ? res.data : [];
            setLegalDocuments(docs);
            if (!selectedDocId && docs.length > 0) setSelectedDocId(docs[0].id);
        } catch {
            notify('error', 'Erreur chargement documents légaux');
        }
    }, [apiClient, notify, selectedDocId]);

    const fetchLegalArticles = useCallback(async () => {
        if (!selectedDocId) return;
        setLoadingArticles(true);
        try {
            const url = `/admin/legal?document_id=${selectedDocId}`;
            const res = await apiClient.get(url);
            setLegalArticles(res.data || []);
        } catch {
            notify('error', 'Erreur chargement articles');
        } finally {
            setLoadingArticles(false);
        }
    }, [apiClient, notify, selectedDocId]);

    // -------- CRUD documents --------
    const handleCreateLegalDoc = useCallback(async () => {
        if (!newDoc.title) {
            notify('error', 'Titre requis');
            return;
        }
        try {
            await apiClient.post('/admin/legal-documents', newDoc);
            notify('success', `Document "${newDoc.title}" créé`);
            setNewDoc({ title: '', description: '', doc_type: 'law', version: '', full_text: '', file_path: '' });
            await fetchLegalDocuments();
        } catch {
            notify('error', 'Erreur création document');
        }
    }, [apiClient, notify, newDoc, fetchLegalDocuments]);

    const handleDeleteLegalDocument = useCallback(async (id: string) => {
        const oldDocs = [...legalDocuments];
        const updatedDocs = legalDocuments.filter((d) => d.id !== id);
        setLegalDocuments(updatedDocs);
        if (selectedDocId === id) {
            setSelectedDocId(updatedDocs.length > 0 ? updatedDocs[0].id : null);
        }
        try {
            await apiClient.delete(`/admin/legal-documents/${id}`);
            notify('success', 'Document supprimé');
        } catch {
            notify('error', 'Erreur suppression document');
            setLegalDocuments(oldDocs); // rollback optimiste
        }
    }, [apiClient, notify, legalDocuments, selectedDocId]);

    // -------- CRUD articles --------
    const handleCreateLegalArticle = useCallback(async () => {
        if (!newArticle.article_number || !newArticle.title || !selectedDocId) {
            notify('error', 'Champs requis manquants');
            return;
        }
        try {
            await apiClient.post('/admin/legal', { ...newArticle, document_id: selectedDocId });
            notify('success', `Article ${newArticle.article_number} ajouté`);
            setNewArticle({ article_number: '', title: '', content: '', category: 'General' });
            await fetchLegalArticles();
        } catch {
            notify('error', 'Erreur ajout article');
        }
    }, [apiClient, notify, newArticle, selectedDocId, fetchLegalArticles]);

    const handleDeleteLegalArticles = useCallback(async (docId: string) => {
        try {
            const res = await apiClient.delete(`/admin/legal-documents/${docId}/articles`);
            notify('success', `${res.data.deleted || 0} articles supprimés`);
            setLegalArticles([]);
        } catch {
            notify('error', 'Erreur suppression articles');
        }
    }, [apiClient, notify]);

    const handleDeleteLegalArticle = useCallback(async (articleId: string) => {
        // Mise à jour optimiste
        setLegalArticles((prev) => prev.filter((a) => a.id !== articleId));
        try {
            await apiClient.delete(`/admin/legal/${articleId}`);
            notify('success', 'Article supprimé');
        } catch {
            notify('error', 'Erreur suppression article');
            await fetchLegalArticles(); // rollback
        }
    }, [apiClient, notify, fetchLegalArticles]);

    // -------- Import PDF → texte → articles --------
    const handleFileUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('pdf', file);
        try {
            notify('success', 'Extraction du texte en cours...');
            const res = await apiClient.post('/admin/legal/extract-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setRawTextToParse(res.data.text);
            notify('success', 'Texte extrait avec succès');
        } catch {
            notify('error', "Erreur lors de l'extraction du PDF");
        }
    }, [apiClient, notify]);

    // -------- Parser regex : texte brut → articles structurés --------
    // Note : c'est de la logique pure (pas d'effet de bord externe), elle
    // pourrait être extraite dans un module utilitaire `legalParser.ts`
    // pour être testée unitairement. Pour l'instant, on la garde inline
    // dans le hook (sa portée est petite et ne sert qu'à ce flux).
    const handleParseRawText = useCallback(() => {
        if (!rawTextToParse || rawTextToParse.trim().length < 5) {
            notify('error', 'Le texte est trop court pour être analysé.');
            return;
        }
        const cleanText = rawTextToParse
            .replace(/\r\n/g, '\n')
            .replace(/\u00A0/g, ' ')
            .replace(/[ \t]+/g, ' ');

        const indices: { pos: number; num: string }[] = [];
        const lines = cleanText.split('\n');
        let currentPos = 0;

        for (const line of lines) {
            const trimmedLine = line.trimStart();
            const lineMatch = trimmedLine.match(/^(Article|Art\.?|ARTICLE|ART\.?)\s*[\.:-]?\s*(\d+[a-zA-Z0-9\-\.]*|1er|premier|PREMIER)/i);
            if (lineMatch) {
                const offset = line.length - trimmedLine.length;
                indices.push({ pos: currentPos + offset, num: lineMatch[2] });
            }
            currentPos += line.length + 1;
        }

        if (indices.length === 0) {
            // Fallback : regex globale avec filtre des faux positifs
            // (évite les "à l'article X" en milieu de phrase).
            const globalRegex = /(?:Article|Art\.?|ARTICLE|ART\.?)\s*[\.:-]?\s*(\d+[a-zA-Z0-9\-\.]*|1er|premier|PREMIER)/gi;
            let m;
            while ((m = globalRegex.exec(cleanText)) !== null) {
                const before = cleanText.substring(Math.max(0, m.index - 20), m.index).toLowerCase();
                if (before.match(/(à l'|de l'|par l'|dans l'|selon l'|sous l'|l'|visé|prévu|mentionné)\s*$/)) continue;
                indices.push({ pos: m.index, num: m[1] });
            }
        }

        if (indices.length === 0) {
            notify('error', 'Aucun article détecté.');
            return;
        }

        const parsed: { article_number: string; title: string; content: string; category: string }[] = [];
        indices.forEach((entry, i) => {
            const startIndex = entry.pos;
            const nextIndex = indices[i + 1] ? indices[i + 1].pos : cleanText.length;
            const fullChunk = cleanText.substring(startIndex, nextIndex).trim();
            const articleNum = entry.num.replace(/[\.:-]$/, '');
            const chunkLines = fullChunk.split('\n').filter((l) => l.trim().length > 0);
            let title = chunkLines[0] || `Article ${articleNum}`;
            if (title.length > 120) title = title.substring(0, 117) + '...';
            if (title.length < 30 && chunkLines.length > 1) {
                const preview = chunkLines[1].trim().substring(0, 70);
                if (preview) title += ' — ' + preview;
            }
            parsed.push({
                article_number: articleNum, title, content: fullChunk, category: 'Auto-Import',
            });
        });

        setExtractedArticles(parsed);
        notify('success', `${parsed.length} articles détectés avec succès !`);
    }, [rawTextToParse, notify]);

    // -------- Batch import : envoie les articles parsés au backend --------
    const handleBatchImportArticles = useCallback(async () => {
        if (extractedArticles.length === 0 || !selectedDocId) return;
        try {
            await apiClient.post('/admin/legal/batch', {
                document_id: selectedDocId,
                articles: extractedArticles,
            });
            notify('success', 'Importation réussie');
            setExtractedArticles([]);
            setRawTextToParse('');
            setShowImportAssistant(false);
            await fetchLegalArticles();
        } catch {
            notify('error', "Échec de l'importation");
        }
    }, [apiClient, notify, extractedArticles, selectedDocId, fetchLegalArticles]);

    // -------- RAG (recherche sémantique + génération embeddings) --------
    const handleSemanticSearch = useCallback(async () => {
        if (!semanticQuery.trim()) return;
        setSemanticLoading(true);
        try {
            const res = await apiClient.post('/admin/legal/search', { query: semanticQuery, limit: 8 });
            setSemanticResults(res.data.results || []);
            if ((res.data.results || []).length === 0) {
                notify('error', 'Aucun résultat. Vérifiez que les embeddings sont générés.');
            }
        } catch {
            notify('error', 'Erreur recherche sémantique');
        }
        setSemanticLoading(false);
    }, [apiClient, notify, semanticQuery]);

    const handleGenerateEmbeddings = useCallback(async () => {
        setEmbeddingStatus('⏳ Indexation en cours...');
        try {
            const res = await apiClient.post('/admin/legal/embeddings');
            setEmbeddingStatus(`✅ ${res.data.processed} articles indexés (${res.data.errors} erreurs)`);
            notify('success', `${res.data.processed} articles indexés par IA`);
        } catch {
            setEmbeddingStatus('❌ Erreur');
            notify('error', 'Erreur génération embeddings');
        }
    }, [apiClient, notify]);

    return {
        // Données
        legalDocuments, legalArticles,
        selectedDocId, setSelectedDocId, loadingArticles,
        // Search state
        legalSearch, setLegalSearch,
        // Form state — doc
        newDoc, setNewDoc,
        // Form state — article
        newArticle, setNewArticle,
        // Import assistant
        showImportAssistant, setShowImportAssistant,
        rawTextToParse, setRawTextToParse,
        extractedArticles, setExtractedArticles,
        // Confirm delete
        confirmDeleteDocId, setConfirmDeleteDocId,
        pendingDeleteArticleId, setPendingDeleteArticleId,
        // RAG
        semanticQuery, setSemanticQuery,
        semanticResults, semanticLoading,
        embeddingStatus,
        // Actions
        fetchLegalDocuments, fetchLegalArticles,
        handleCreateLegalDoc, handleCreateLegalArticle,
        handleDeleteLegalDocument, handleDeleteLegalArticles, handleDeleteLegalArticle,
        handleBatchImportArticles, handleParseRawText, handleFileUpload,
        handleSemanticSearch, handleGenerateEmbeddings,
    };
}