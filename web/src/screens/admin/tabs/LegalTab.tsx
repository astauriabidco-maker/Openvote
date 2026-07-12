/**
 * Onglet Legal — CMS juridique + recherche sémantique (RAG).
 *
 * Sections :
 *   - Sidebar : liste des documents + suppression + bouton "nouveau"
 *   - Sidebar bas : panneau de recherche IA + indexation embeddings
 *   - Main : articles du document sélectionné, ajout d'article,
 *     assistant d'importation (PDF + parsing texte)
 *
 * C'est l'onglet le plus complexe : ~500 LOC, beaucoup de state local
 * (sidebar, articles, import assistant, semantic search).
 */

import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader from '../components/TabHeader';

export default function LegalTab({ state }: { state: AdminPanelState }) {
    const {
        legalDocuments, legalArticles, selectedDocId, setSelectedDocId,
        loadingArticles, legalSearch, setLegalSearch,
        newDoc, setNewDoc, newArticle, setNewArticle,
        showImportAssistant, setShowImportAssistant,
        confirmDeleteDocId, setConfirmDeleteDocId,
        pendingDeleteArticleId, setPendingDeleteArticleId,
        rawTextToParse, setRawTextToParse, extractedArticles, setExtractedArticles,
        semanticQuery, setSemanticQuery, semanticResults, semanticLoading,
        embeddingStatus,
        handleCreateLegalDoc, handleCreateLegalArticle,         handleDeleteLegalDocument,
        handleDeleteLegalArticles, handleDeleteLegalArticle,
        handleBatchImportArticles, handleParseRawText,
        handleFileUpload, handleSemanticSearch, handleGenerateEmbeddings,
    } = state;

    const selectedDoc = legalDocuments.find((d) => d.id === selectedDocId);

    return (
        <div className="admin-section" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '20px' }}>
            {/* SIDEBAR — Documents */}
            <div className="legal-sidebar" style={{ borderRight: '1px solid var(--border-color)', paddingRight: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                    📚 Documents
                    <button className="admin-btn" title="Nouveau Document" onClick={() => setSelectedDocId(null)}>+</button>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {legalDocuments.map((doc) => (
                        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                onClick={() => setSelectedDocId(doc.id)}
                                style={{
                                    textAlign: 'left', padding: '10px', borderRadius: '6px', border: 'none',
                                    background: selectedDocId === doc.id ? 'var(--accent-blue-transparent)' : 'transparent',
                                    color: selectedDocId === doc.id ? 'var(--accent-blue)' : 'var(--text-primary)',
                                    cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s', flex: 1,
                                }}
                            >
                                {doc.doc_type === 'constitution' ? '🏛️' : '📜'} {doc.title}
                            </button>
                            {confirmDeleteDocId === doc.id ? (
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            setConfirmDeleteDocId(null);
                                            await handleDeleteLegalDocument(doc.id);
                                        }}
                                        style={{ background: '#e74c3c', border: 'none', cursor: 'pointer', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', color: 'white' }}
                                    >Oui</button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteDocId(null); }}
                                        style={{ background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-primary)' }}
                                    >Non</button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteDocId(doc.id); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', opacity: 0.5, padding: '4px' }}
                                    title="Supprimer ce document"
                                >🗑️</button>
                            )}
                        </div>
                    ))}
                    {selectedDocId && (
                        <button
                            type="button"
                            className="admin-delete-btn"
                            style={{ fontSize: '0.7rem', marginTop: '8px', width: '100%' }}
                            onClick={async (e) => {
                                e.stopPropagation();
                                await handleDeleteLegalArticles(selectedDocId);
                            }}
                        >🗑️ Vider les articles</button>
                    )}
                </div>

                {/* RECHERCHE IA (RAG) */}
                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>🧠 Recherche IA</h4>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                        <input
                            className="admin-input"
                            placeholder="Ex: fermeture bureau de vote..."
                            value={semanticQuery}
                            onChange={(e) => setSemanticQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
                            style={{ fontSize: '0.8rem', flex: 1 }}
                        />
                        <button className="admin-primary-btn" onClick={handleSemanticSearch} disabled={semanticLoading} style={{ fontSize: '0.75rem', padding: '6px 10px' }}>
                            {semanticLoading ? '⏳' : '🔍'}
                        </button>
                    </div>
                    <button className="admin-btn" onClick={handleGenerateEmbeddings} style={{ width: '100%', fontSize: '0.7rem', marginBottom: '6px' }}>
                        ⚡ Indexer articles (IA)
                    </button>
                    {embeddingStatus && <small style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{embeddingStatus}</small>}

                    {semanticResults.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                            <small style={{ color: 'var(--text-secondary)' }}>📊 {semanticResults.length} résultats</small>
                            <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '8px' }}>
                                {semanticResults.map((r, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            background: 'rgba(168,85,247,0.08)',
                                            border: '1px solid rgba(168,85,247,0.2)',
                                            borderRadius: '8px', padding: '8px', marginBottom: '6px',
                                            cursor: 'pointer', transition: '0.2s',
                                        }}
                                        onClick={() => setSelectedDocId(r.article.document_id)}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <strong style={{ color: '#a855f7', fontSize: '0.8rem' }}>{r.article.article_number}</strong>
                                            <span style={{
                                                background: r.similarity > 0.7 ? '#f85149' : r.similarity > 0.5 ? '#d29922' : '#3fb950',
                                                color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '0.65rem',
                                            }}>
                                                {(r.similarity * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{r.article.title?.substring(0, 50)}</div>
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '3px 0 0', lineHeight: '1.3' }}>
                                            {r.article.content?.substring(0, 80)}...
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* NOUVEAU DOCUMENT */}
                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <h4>➕ Nouveau Document</h4>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                        <input className="admin-input" placeholder="Titre"
                            value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                            style={{ fontSize: '0.8rem' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                        <select className="admin-select" value={newDoc.doc_type}
                            onChange={(e) => setNewDoc({ ...newDoc, doc_type: e.target.value })}
                            style={{ fontSize: '0.8rem' }}>
                            <option value="law">Loi</option>
                            <option value="constitution">Constitution</option>
                            <option value="decree">Décret</option>
                        </select>
                    </div>
                    <button className="admin-primary-btn" onClick={handleCreateLegalDoc} style={{ width: '100%', fontSize: '0.8rem' }}>Créer</button>
                </div>
            </div>

            {/* MAIN — Articles du document sélectionné */}
            <div className="legal-content">
                {selectedDocId ? (
                    <>
                        <TabHeader
                            title={selectedDoc?.title || '⚖️ Cadre légal'}
                            subtitle={`Version : ${selectedDoc?.version || 'N/A'}`}
                            actions={
                                <>
                                    <button className="admin-btn" onClick={() => setShowImportAssistant(!showImportAssistant)}>
                                        {showImportAssistant ? "❌ Fermer l'Assistant" : "✨ Assistant d'Importation"}
                                    </button>
                                    <input
                                        className="admin-input"
                                        placeholder="🔍 Rechercher un article..."
                                        style={{ maxWidth: '250px' }}
                                        value={legalSearch}
                                        onChange={(e) => setLegalSearch(e.target.value)}
                                    />
                                </>
                            }
                        />

                        {/* Assistant d'importation (PDF + parsing texte) */}
                        {showImportAssistant && (
                            <div className="import-assistant-box" style={{
                                background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px',
                                marginBottom: '24px', border: '2px solid var(--accent-blue)',
                            }}>
                                <h3>🪄 Assistant d'Importation Intelligente</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                    <div style={{ border: '2px dashed var(--border-color)', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                                        <p style={{ fontSize: '0.8rem', marginBottom: '10px' }}>📄 Importer un PDF (Extraction auto)</p>
                                        <input type="file" accept=".pdf" onChange={handleFileUpload}
                                            style={{ fontSize: '0.8rem', width: '100%' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <p style={{ fontSize: '0.8rem', marginBottom: '10px' }}>✍️ Ou coller directement le texte :</p>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button className="admin-primary-btn" onClick={handleParseRawText} style={{ flex: 1 }}>🔍 Analyser</button>
                                            <button className="admin-btn" onClick={() => { setRawTextToParse(''); setExtractedArticles([]); }}>🧹 Vider</button>
                                        </div>
                                    </div>
                                </div>

                                <textarea
                                    className="admin-input"
                                    placeholder="Texte extrait ou collé ici..."
                                    style={{ width: '100%', height: '150px', marginBottom: '15px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                    value={rawTextToParse}
                                    onChange={(e) => setRawTextToParse(e.target.value)}
                                />

                                {extractedArticles.length > 0 && (
                                    <div className="extracted-preview">
                                        <h4>📋 Articles détectés ({extractedArticles.length})</h4>
                                        <div style={{
                                            maxHeight: '200px', overflowY: 'auto',
                                            background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginBottom: '15px',
                                        }}>
                                            <table className="admin-table" style={{ fontSize: '0.8rem' }}>
                                                <thead>
                                                    <tr><th>N°</th><th>Titre</th><th>Aperçu</th></tr>
                                                </thead>
                                                <tbody>
                                                    {extractedArticles.map((art, idx) => (
                                                        <tr key={idx}>
                                                            <td><strong>{art.article_number}</strong></td>
                                                            <td>{art.title}</td>
                                                            <td style={{ color: 'var(--text-secondary)' }}>{art.content?.substring(0, 50)}...</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <button className="admin-primary-btn" onClick={handleBatchImportArticles} style={{ background: 'var(--accent-green)' }}>
                                            📥 Importer ces {extractedArticles.length} articles vers "{selectedDoc?.title}"
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Formulaire d'ajout d'article (visible si assistant fermé) */}
                        {!showImportAssistant && (
                            <div className="cms-article-forms" style={{
                                background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px',
                                marginBottom: '24px', border: '1px dashed var(--border-color)',
                            }}>
                                <h4>➕ Ajouter un Article</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 150px', gap: '10px', marginBottom: '10px' }}>
                                    <input className="admin-input" placeholder="N°"
                                        value={newArticle.article_number}
                                        onChange={(e) => setNewArticle({ ...newArticle, article_number: e.target.value })} />
                                    <input className="admin-input" placeholder="Titre de l'article"
                                        value={newArticle.title}
                                        onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })} />
                                    <input className="admin-input" placeholder="Catégorie"
                                        value={newArticle.category}
                                        onChange={(e) => setNewArticle({ ...newArticle, category: e.target.value })} />
                                </div>
                                <textarea
                                    className="admin-input"
                                    placeholder="Contenu de l'article..."
                                    style={{ width: '100%', height: '80px', marginBottom: '10px' }}
                                    value={newArticle.content}
                                    onChange={(e) => setNewArticle({ ...newArticle, content: e.target.value })}
                                />
                                <button className="admin-primary-btn" onClick={handleCreateLegalArticle}>Ajouter l'Article</button>
                            </div>
                        )}

                        {/* Grille des articles */}
                        <div className="legal-grid" style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                            gap: '20px', opacity: loadingArticles ? 0.5 : 1, transition: 'opacity 0.2s',
                        }}>
                            {loadingArticles && legalArticles.length === 0 && (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                    ⏳ Chargement des articles...
                                </div>
                            )}
                            {legalArticles
                                .filter((art) =>
                                    art.title.toLowerCase().includes(legalSearch.toLowerCase()) ||
                                    art.content.toLowerCase().includes(legalSearch.toLowerCase()) ||
                                    art.article_number.toLowerCase().includes(legalSearch.toLowerCase()),
                                )
                                .map((art) => (
                                    <div key={art.id} className="config-card" style={{
                                        display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="election-status" style={{ background: 'var(--accent-blue)', opacity: 0.8 }}>{art.category}</span>
                                            <strong style={{ color: 'var(--accent-blue)', fontSize: '1.1rem' }}>{art.article_number}</strong>
                                        </div>
                                        <h3 style={{ margin: '5px 0', fontSize: '1rem' }}>{art.title}</h3>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.4', flex: 1 }}>{art.content}</p>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                            {pendingDeleteArticleId === art.id ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            setPendingDeleteArticleId(null);
                                                            await handleDeleteLegalArticle(art.id);
                                                        }}
                                                        style={{
                                                            background: '#e74c3c', border: 'none', cursor: 'pointer',
                                                            fontSize: '0.65rem', padding: '4px 10px', borderRadius: '4px',
                                                            color: 'white', fontWeight: 600,
                                                        }}
                                                    >Oui</button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setPendingDeleteArticleId(null); }}
                                                        style={{
                                                            background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer',
                                                            fontSize: '0.65rem', padding: '4px 10px', borderRadius: '4px',
                                                            color: 'var(--text-primary)', fontWeight: 600,
                                                        }}
                                                    >Non</button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="admin-delete-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingDeleteArticleId(art.id);
                                                    }}
                                                    style={{ fontSize: '0.7rem', opacity: loadingArticles ? 0.3 : 1 }}
                                                >
                                                    🗑️ Supprimer
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </>
                ) : (
                    <div className="admin-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📚</div>
                        <h3>Gestionnaire de Ressources Juridiques</h3>
                        <p>Sélectionnez un document dans la barre latérale pour consulter ou modifier ses articles.</p>
                        <p>Vous pouvez ajouter le <strong>Code Électoral</strong>, la <strong>Constitution</strong>, ou tout autre texte réglementaire.</p>
                    </div>
                )}
            </div>
        </div>
    );
}