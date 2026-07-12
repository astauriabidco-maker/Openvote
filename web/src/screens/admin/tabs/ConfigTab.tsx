/**
 * Onglet Config — édition runtime de la configuration système.
 *
 * Affiche la config en mode lecture (JSON pretty-printé par section)
 * ou en mode édition (textarea avec JSON brut). Sauvegarde via PATCH.
 *
 * TabHeader (refonte 2026-07) : utilise le composant partagé.
 * KPIBand (refonte 2026-07) : 3 tuiles synthétisant la volumétrie de
 * la config (sections, clés totales, mode édition/lecture).
 */

import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand } from '../components/TabHeader';

export default function ConfigTab({ state }: { state: AdminPanelState }) {
    const {
        config, editingConfig, setEditingConfig,
        configDraft, setConfigDraft, handleSaveConfig, t,
    } = state;

    // Volumétrie de la config : nombre de sections et total des clés.
    // Calculé à la volée (pas de state dérivé nécessaire) pour rester
    // robuste aux modifs runtime côté backend.
    const sections = config ? Object.keys(config).length : 0;
    const totalKeys = config
        ? Object.values(config).reduce<number>((acc, v) => {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                return acc + Object.keys(v as Record<string, unknown>).length;
            }
            return acc + 1;
        }, 0)
        : 0;

    return (
        <div className="admin-section">
            <TabHeader
                title="⚙️ Configuration runtime"
                subtitle="Édition du JSON de config système. ⚠️ changes are immediate, no rollback."
                actions={
                    !editingConfig ? (
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
                    )
                }
            >
                <KPIBand items={[
                    { label: 'Sections', value: sections, valueColor: '#58a6ff' },
                    { label: 'Clés totales', value: totalKeys, valueColor: '#a371f7' },
                    {
                        label: 'Mode',
                        value: editingConfig ? 'Édition' : 'Lecture',
                        delta: editingConfig ? 'Brouillon en mémoire' : 'Sauvegardé sur disque',
                        trend: editingConfig ? 'neutral' : 'up',
                    },
                ]} />
            </TabHeader>

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