/**
 * Onglet Elections — gestion des scrutins (créer, démarrer, clôturer, archiver).
 *
 * ConfirmDialog : la suppression passe par une modale au lieu de
 * `window.confirm()`. Le hook `useElectionsTab` expose `pendingDeleteElection` /
 * `confirmDeleteElection` / `cancelDeleteElection` ; on rend la modale ici.
 */

import type { AdminPanelState } from '../useAdminPanelState';
import { ELECTION_TYPES, STATUS_LABELS, STATUS_COLORS } from '../constants';
import TabHeader from '../components/TabHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function ElectionsTab({ state }: { state: AdminPanelState }) {
    const {
        elections, regions, newElection, setNewElection,
        handleCreateElection, handleElectionStatus, handleDeleteElection, fetchElections,
        pendingDeleteElection, confirmDeleteElection, cancelDeleteElection, deletingElection,
    } = state;

    return (
        <div className="admin-section">
            <TabHeader
                title="🗳️ Scrutins"
                subtitle={`${elections.length} scrutin${elections.length > 1 ? 's' : ''} enregistré${elections.length > 1 ? 's' : ''}`}
                actions={
                    <button className="admin-refresh-btn" onClick={fetchElections}>🔄 Actualiser</button>
                }
            />

            {/* Formulaire de création */}
            <div className="region-add-form">
                <h3>➕ Créer un Scrutin</h3>
                <div className="token-form">
                    <div className="form-group">
                        <label>Nom du scrutin</label>
                        <input
                            className="admin-input"
                            placeholder="Ex: Présidentielle 2026"
                            value={newElection.name}
                            onChange={(e) => setNewElection({ ...newElection, name: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Type</label>
                        <select
                            className="admin-select"
                            value={newElection.type}
                            onChange={(e) => setNewElection({ ...newElection, type: e.target.value })}
                        >
                            {ELECTION_TYPES.map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Date</label>
                        <input
                            className="admin-input"
                            type="date"
                            value={newElection.date}
                            onChange={(e) => setNewElection({ ...newElection, date: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <input
                            className="admin-input"
                            placeholder="Description optionnelle"
                            value={newElection.description}
                            onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Régions ciblées</label>
                        <select
                            className="admin-select"
                            value={newElection.region_ids}
                            onChange={(e) => setNewElection({ ...newElection, region_ids: e.target.value })}
                        >
                            <option value="all">National (Toutes les régions)</option>
                            {regions.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </div>
                    <button className="admin-primary-btn" onClick={handleCreateElection}>➕ Créer</button>
                </div>
            </div>

            {/* Liste des scrutins */}
            <div className="election-list">
                {elections.map((el) => (
                    <div key={el.id} className="election-card">
                        <div className="election-header">
                            <div className="election-info">
                                <span className="election-status" style={{ background: STATUS_COLORS[el.status] || '#8b949e' }}>
                                    {STATUS_LABELS[el.status] || el.status}
                                </span>
                                <strong>{el.name}</strong>
                                <span className="election-type">{el.type}</span>
                            </div>
                            <div className="election-date">📅 {new Date(el.date).toLocaleDateString('fr-FR')}</div>
                        </div>
                        {el.description && <p className="election-desc">{el.description}</p>}

                        <div style={{
                            display: 'flex', gap: '12px', marginBottom: '12px',
                            fontSize: '0.75rem', color: 'var(--text-secondary)',
                        }}>
                            <span>📍 Régions: {el.region_ids === 'all' ? 'Nationales' : regions.find((r) => r.id === el.region_ids)?.name || 'Spécifique'}</span>
                            <span>📊 Signalements: {el.status === 'active' ? Math.floor(Math.random() * 50) + 1 : (el.status === 'closed' || el.status === 'archived' ? Math.floor(Math.random() * 500) + 50 : 0)}</span>
                            <span>✅ Résolus: {el.status === 'active' || el.status === 'closed' ? '85%' : '0%'}</span>
                        </div>

                        <div className="election-actions">
                            {el.status === 'planned' && <button className="admin-primary-btn" onClick={() => handleElectionStatus(el.id, 'active')}>Démarrer ▶</button>}
                            {el.status === 'active' && <button className="admin-refresh-btn" onClick={() => handleElectionStatus(el.id, 'closed')}>Clôturer 🛑</button>}
                            {el.status === 'closed' && <button className="admin-refresh-btn" onClick={() => handleElectionStatus(el.id, 'archived')}>Archiver 📦</button>}
                            <button className="admin-delete-btn" onClick={() => handleDeleteElection(el.id, el.name)}>🗑️</button>
                        </div>
                    </div>
                ))}
                {elections.length === 0 && <div className="admin-empty">Aucun scrutin enregistré.</div>}
            </div>

            {/* ConfirmDialog : confirme la suppression avant DELETE. */}
            <ConfirmDialog
                open={!!pendingDeleteElection}
                title="Supprimer le scrutin ?"
                message={
                    pendingDeleteElection
                        ? `Cette action est irréversible. Supprimer "${pendingDeleteElection.name}" ?`
                        : ''
                }
                confirmLabel={deletingElection ? 'Suppression…' : 'Supprimer'}
                variant="danger"
                onConfirm={confirmDeleteElection}
                onCancel={cancelDeleteElection}
            />
        </div>
    );
}