/**
 * Onglet Config — édition runtime de la configuration système.
 *
 * Affiche la config en mode lecture (JSON pretty-printé par section)
 * ou en mode édition (textarea avec JSON brut). Sauvegarde via PATCH.
 */

import type { AdminPanelState } from '../useAdminPanelState';

export default function ConfigTab({ state }: { state: AdminPanelState }) {
    const {
        config, editingConfig, setEditingConfig,
        configDraft, setConfigDraft, handleSaveConfig, t,
    } = state;

    return (
        <div className="admin-section">
            <div className="admin-section-header">
                <h2>{t('config')}</h2>
                {!editingConfig ? (
                    <button
                        className="admin-primary-btn"
                        onClick={() => {
                            setConfigDraft(JSON.stringify(config, null, 2));
                            setEditingConfig(true);
                        }}
                    >
                        {t('edit_config')}
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="admin-refresh-btn" onClick={() => setEditingConfig(false)}>
                            {t('cancel')}
                        </button>
                        <button className="admin-primary-btn" onClick={handleSaveConfig}>
                            {t('save_config')}
                        </button>
                    </div>
                )}
            </div>

            {editingConfig ? (
                <textarea
                    value={configDraft}
                    onChange={(e) => setConfigDraft(e.target.value)}
                    style={{
                        width: '100%', height: '400px',
                        background: 'var(--panel-bg)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)', padding: '12px',
                        fontFamily: 'monospace', borderRadius: '8px',
                    }}
                />
            ) : config ? (
                <div className="config-grid">
                    {Object.entries(config).map(([section, values]) => (
                        <div key={section} className="config-card">
                            <h3>{section.replace(/_/g, ' ').toUpperCase()}</h3>
                            {typeof values === 'object' && values !== null ? (
                                <div className="config-values">
                                    {Object.entries(values as Record<string, unknown>).map(([k, v]) => (
                                        <div key={k} className="config-row">
                                            <span className="config-key">{k.replace(/_/g, ' ')}</span>
                                            <span className="config-value">
                                                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span>{String(values)}</span>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="admin-empty">Chargement...</div>
            )}
        </div>
    );
}