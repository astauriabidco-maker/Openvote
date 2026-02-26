import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import axios from 'axios';
import QRCode from 'qrcode';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Fix pour les icones Leaflet par défaut
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const API_URL = 'http://localhost:8095/api/v1';

interface Report {
  id: string;
  incident_type: string;
  description: string;
  gps_location: string; // "POINT(lon lat)"
  status: string;
  created_at: string;
  h3_index: string;
  observer_id: string;
}

interface AuthState {
  token: string;
  role: string;
  username: string;
}

interface ReportLegalMatch {
  id: string;
  report_id: string;
  article_id: string;
  similarity_score: number;
  match_type: string;
  notes: string;
  article_number?: string;
  article_title?: string;
  article_content?: string;
  created_at: string;
}

// Composant pour recentrer la carte
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// ========================================
// Composant Login
// ========================================
function LoginScreen({ onLogin }: { onLogin: (auth: AuthState) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isRegistering) {
        // Register puis Login
        await axios.post(`${API_URL}/auth/register`, { username, password });
      }

      const res = await axios.post(`${API_URL}/auth/login`, { username, password });
      const token = res.data.token;

      // Décoder le JWT pour extraire le rôle (payload base64)
      const payload = JSON.parse(atob(token.split('.')[1]));

      onLogin({
        token,
        role: payload.role || 'observer',
        username,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Erreur de connexion au serveur');
      } else {
        setError('Erreur inconnue');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🗳️</div>
          <h1>Openvote</h1>
          <p className="login-subtitle">Plateforme de Surveillance Électorale</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="input-group">
            <label htmlFor="username">Identifiant</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nom d'utilisateur"
              required
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? '⏳ Connexion...' : (isRegistering ? 'Créer le compte' : 'Se connecter')}
          </button>

          <button
            type="button"
            className="login-toggle"
            onClick={() => setIsRegistering(!isRegistering)}
          >
            {isRegistering ? 'Déjà inscrit ? Connectez-vous' : 'Nouvel observateur ? Inscrivez-vous'}
          </button>
        </form>

        <div className="login-footer">
          <small>🔒 Connexion chiffrée · Aucun tracking</small>
        </div>
      </div>
    </div>
  );
}

// ========================================
// Composant Dashboard Principal
// ========================================
function Dashboard({ auth, onLogout }: { auth: AuthState, onLogout: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([4.05, 9.7]); // Douala par défaut
  const [zoom, setZoom] = useState(13);
  const [refreshCountdown, setRefreshCountdown] = useState(15);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'map' | 'analytics' | 'admin'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportLegalMatches, setReportLegalMatches] = useState<ReportLegalMatch[]>([]);

  const isAdmin = auth.role === 'super_admin' || auth.role === 'region_admin';

  const apiClient = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  const fetchReports = useCallback(async () => {
    try {
      const url = filter ? `/reports?status=${filter}` : '/reports';
      const response = await apiClient.get(url);
      setReports(response.data || []);
      setRefreshCountdown(15);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        onLogout(); // Token expiré
      }
      console.error("Erreur lors du chargement des signalements:", error);
    }
  }, [filter]);

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 15000);
    return () => clearInterval(interval);
  }, [fetchReports]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshCountdown(prev => prev > 0 ? prev - 1 : 15);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const parseLocation = (wkt: string): [number, number] | null => {
    try {
      if (!wkt) return null;
      const content = wkt.replace('POINT(', '').replace(')', '');
      const parts = content.split(' ');
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      return [lat, lon];
    } catch {
      return null;
    }
  };

  const handleReportClick = (report: Report) => {
    setSelectedReport(report);
    const pos = parseLocation(report.gps_location);
    if (pos) {
      setMapCenter(pos);
      setZoom(16);
    }
  };

  const handleStatusChange = async (reportId: string, newStatus: string) => {
    setActionLoading(reportId);
    try {
      await apiClient.patch(`/reports/${reportId}`, { status: newStatus });
      await fetchReports();
      if (selectedReport?.id === reportId) {
        setSelectedReport(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour du statut:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const getMarkerIcon = (status: string) => {
    const className = status === 'verified' ? 'marker-verified' :
      status === 'rejected' ? 'marker-rejected' : 'marker-pending';
    return L.icon({
      iconUrl: icon,
      shadowUrl: iconShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      className: className,
    });
  };

  const stats = {
    total: reports.length,
    verified: reports.filter(r => r.status === 'verified').length,
    pending: reports.filter(r => r.status === 'pending').length,
    rejected: reports.filter(r => r.status === 'rejected').length,
  };

  // Statistiques avancées pour le panneau analytics
  const incidentBreakdown = reports.reduce((acc, r) => {
    acc[r.incident_type] = (acc[r.incident_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const hourlyActivity = reports.reduce((acc, r) => {
    try {
      const hour = new Date(r.created_at).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
    } catch { /* ignore */ }
    return acc;
  }, {} as Record<number, number>);

  const observerStats = reports.reduce((acc, r) => {
    const obsId = r.observer_id?.substring(0, 8) || 'unknown';
    acc[obsId] = (acc[obsId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topObservers = Object.entries(observerStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Filtrage par recherche
  const filteredReports = reports.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.incident_type?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.observer_id?.toLowerCase().includes(q) ||
      r.id?.toLowerCase().includes(q)
    );
  });

  // Export CSV
  const exportCSV = () => {
    const headers = ['ID', 'Type', 'Description', 'Status', 'Observer', 'GPS', 'H3', 'Date'];
    const rows = reports.map(r => [
      r.id,
      r.incident_type,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.status,
      r.observer_id,
      r.gps_location,
      r.h3_index,
      r.created_at,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openvote_reports_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getRoleBadge = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: '🛡️ Super Admin',
      region_admin: '🏛️ Admin Régional',
      local_coord: '📋 Coord. Local',
      observer: '👁️ Observateur',
      citizen: '🏠 Citoyen',
      verified_citizen: '✅ Citoyen Vérifié',
    };
    return labels[role] || role;
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <div className="header-left">
          <h1>🗳️ Openvote | Tactical Dashboard</h1>
        </div>
        <div className="header-center">
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-item stat-verified">
              <span className="stat-value">{stats.verified}</span>
              <span className="stat-label">Vérifiés</span>
            </div>
            <div className="stat-item stat-pending">
              <span className="stat-value">{stats.pending}</span>
              <span className="stat-label">Suspects</span>
            </div>
            <div className="stat-item stat-rejected">
              <span className="stat-value">{stats.rejected}</span>
              <span className="stat-label">Rejetés</span>
            </div>
            <div className="stat-item stat-refresh">
              <span className="stat-value">{refreshCountdown}s</span>
              <span className="stat-label">↻ Refresh</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${activeView === 'map' ? 'active' : ''}`}
              onClick={() => setActiveView('map')}
              title="Vue Carte"
            >🗺️</button>
            <button
              className={`toggle-btn ${activeView === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveView('analytics')}
              title="Vue Analytics"
            >📊</button>
            <button
              className="toggle-btn export-btn"
              onClick={exportCSV}
              title="Exporter CSV"
            >📥</button>
            {isAdmin && (
              <button
                className={`toggle-btn ${activeView === 'admin' ? 'active' : ''}`}
                onClick={() => setActiveView('admin')}
                title="Administration"
              >⚙️</button>
            )}
          </div>
          <div className="user-info">
            <span className="user-role">{getRoleBadge(auth.role)}</span>
            <span className="user-name">{auth.username}</span>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Déconnexion">⏻</button>
        </div>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="filter-bar">
            <button className={`filter-btn ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>
              Tous ({stats.total})
            </button>
            <button className={`filter-btn filter-verified ${filter === 'verified' ? 'active' : ''}`} onClick={() => setFilter('verified')}>
              ✓ Vérifiés
            </button>
            <button className={`filter-btn filter-pending ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
              ⚠ Suspects
            </button>
            <button className={`filter-btn filter-rejected ${filter === 'rejected' ? 'active' : ''}`} onClick={() => setFilter('rejected')}>
              ✕ Rejetés
            </button>
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="🔍 Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="report-list">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className={`report-item ${selectedReport?.id === report.id ? 'active' : ''}`}
                onClick={() => handleReportClick(report)}
              >
                <div className="report-item-header">
                  <h3>{report.incident_type}</h3>
                  <div className={`status-badge ${report.status}`}>
                    {report.status === 'verified' ? '✓' : report.status === 'rejected' ? '✕' : '⚠'}
                    {' '}{report.status}
                  </div>
                </div>
                <p>{report.description || "Aucune description"}</p>
                <div className="report-meta">
                  <small>📅 {formatDate(report.created_at)}</small>
                  {report.h3_index && <small>📍 H3: {report.h3_index.substring(0, 10)}...</small>}
                </div>
              </div>
            ))}
            {filteredReports.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📡</div>
                <p>Aucun signalement trouvé.</p>
                <small>Les rapports des observateurs apparaîtront ici en temps réel.</small>
              </div>
            )}
          </div>
        </aside>

        <main className="map-wrapper">
          {/* Panneau de détail du rapport sélectionné */}
          {selectedReport && (
            <div className="report-detail-panel">
              <div className="detail-header">
                <h2>{selectedReport.incident_type}</h2>
                <button className="close-detail" onClick={() => setSelectedReport(null)}>✕</button>
              </div>
              <div className="detail-body">
                <div className={`detail-status ${selectedReport.status}`}>
                  {selectedReport.status.toUpperCase()}
                </div>
                <p className="detail-description">{selectedReport.description || "Aucune description fournie."}</p>
                <div className="detail-info">
                  <div className="info-row">
                    <span className="info-label">ID</span>
                    <span className="info-value">{selectedReport.id.substring(0, 8)}...</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Observateur</span>
                    <span className="info-value">{selectedReport.observer_id.substring(0, 8)}...</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Date</span>
                    <span className="info-value">{formatDate(selectedReport.created_at)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">H3 Index</span>
                    <span className="info-value">{selectedReport.h3_index || "N/A"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Position</span>
                    <span className="info-value">{selectedReport.gps_location || "N/A"}</span>
                  </div>
                </div>

                {/* Actions admin */}
                {isAdmin && selectedReport.status === 'pending' && (
                  <div className="admin-actions">
                    <h4>Actions Administration</h4>
                    <div className="action-buttons">
                      <button
                        className="action-btn verify-btn"
                        onClick={() => handleStatusChange(selectedReport.id, 'verified')}
                        disabled={actionLoading === selectedReport.id}
                      >
                        {actionLoading === selectedReport.id ? '⏳' : '✓'} Valider
                      </button>
                      <button
                        className="action-btn reject-btn"
                        onClick={() => handleStatusChange(selectedReport.id, 'rejected')}
                        disabled={actionLoading === selectedReport.id}
                      >
                        {actionLoading === selectedReport.id ? '⏳' : '✕'} Rejeter
                      </button>
                    </div>
                  </div>
                )}

                {/* Qualification Juridique IA */}
                {isAdmin && (
                  <div className="admin-actions" style={{ marginTop: '15px' }}>
                    <h4>⚖️ Qualification Juridique</h4>
                    <button
                      className="action-btn"
                      style={{ background: 'linear-gradient(135deg, #6f42c1, #a855f7)', color: '#fff', border: 'none', width: '100%', marginBottom: '10px' }}
                      onClick={async () => {
                        setActionLoading(selectedReport.id);
                        try {
                          const res = await apiClient.post(`/admin/reports/${selectedReport.id}/qualify`);
                          const matches = res.data.matches || [];
                          setReportLegalMatches(matches);
                          if (matches.length === 0) {
                            alert('Aucune correspondance juridique trouvée.');
                          }
                        } catch { alert('Erreur lors de la qualification'); }
                        setActionLoading(null);
                      }}
                      disabled={actionLoading === selectedReport.id}
                    >
                      {actionLoading === selectedReport.id ? '⏳ Analyse IA...' : '🧠 Qualifier juridiquement'}
                    </button>
                    {reportLegalMatches.length > 0 && (
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {reportLegalMatches.map((m, idx) => (
                          <div key={idx} style={{
                            background: 'rgba(111,66,193,0.1)',
                            border: '1px solid rgba(111,66,193,0.3)',
                            borderRadius: '8px',
                            padding: '10px',
                            marginBottom: '8px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <strong style={{ color: '#a855f7' }}>{m.article_number}</strong>
                              <span style={{
                                background: m.similarity_score > 0.7 ? '#f85149' : m.similarity_score > 0.5 ? '#d29922' : '#3fb950',
                                color: '#fff',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.7rem',
                              }}>
                                {(m.similarity_score * 100).toFixed(0)}% match
                              </span>
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{m.article_title}</div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                              {m.article_content?.substring(0, 120)}...
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Vue Carte */}
          {activeView === 'map' && (
            <MapContainer center={mapCenter} zoom={zoom} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
              <ChangeView center={mapCenter} zoom={zoom} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {reports.map((report) => {
                const position = parseLocation(report.gps_location);
                if (!position) return null;
                return (
                  <Marker key={report.id} position={position} icon={getMarkerIcon(report.status)}>
                    <Popup>
                      <div className="popup-content">
                        <strong>{report.incident_type}</strong>
                        <p>{report.description}</p>
                        <hr />
                        <small>Statut: {report.status}</small><br />
                        <small>ID: {report.id.substring(0, 8)}...</small><br />
                        <small>📅 {formatDate(report.created_at)}</small>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}

          {/* Vue Analytics */}
          {activeView === 'analytics' && (
            <div className="analytics-panel">
              <div className="analytics-grid">
                {/* Répartition par type d'incident */}
                <div className="analytics-card">
                  <h3>📋 Répartition par type</h3>
                  <div className="chart-bars">
                    {Object.entries(incidentBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => {
                        const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                        return (
                          <div key={type} className="bar-row">
                            <span className="bar-label">{type}</span>
                            <div className="bar-track">
                              <div className="bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="bar-count">{count}</span>
                          </div>
                        );
                      })}
                    {Object.keys(incidentBreakdown).length === 0 && (
                      <p className="analytics-empty">Aucune donnée</p>
                    )}
                  </div>
                </div>

                {/* Activité par heure */}
                <div className="analytics-card">
                  <h3>⏰ Activité par heure</h3>
                  <div className="hourly-chart">
                    {Array.from({ length: 24 }, (_, h) => {
                      const count = hourlyActivity[h] || 0;
                      const maxCount = Math.max(...Object.values(hourlyActivity), 1);
                      const heightPct = (count / maxCount) * 100;
                      return (
                        <div key={h} className="hour-bar-wrapper" title={`${h}h: ${count} rapports`}>
                          <div className="hour-bar" style={{ height: `${heightPct}%` }} />
                          <span className="hour-label">{h % 6 === 0 ? `${h}h` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Statut Breakdown */}
                <div className="analytics-card">
                  <h3>📊 Statuts</h3>
                  <div className="status-chart">
                    {stats.total > 0 ? (
                      <>
                        <div className="donut-wrapper">
                          <div className="donut-center">
                            <span className="donut-number">{stats.total}</span>
                            <span className="donut-label">Total</span>
                          </div>
                          <svg viewBox="0 0 36 36" className="donut-svg">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border-color)" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--verified-color)" strokeWidth="3"
                              strokeDasharray={`${(stats.verified / stats.total) * 100} ${100 - (stats.verified / stats.total) * 100}`}
                              strokeDashoffset="25" />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--pending-color)" strokeWidth="3"
                              strokeDasharray={`${(stats.pending / stats.total) * 100} ${100 - (stats.pending / stats.total) * 100}`}
                              strokeDashoffset={`${25 - (stats.verified / stats.total) * 100}`} />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--rejected-color)" strokeWidth="3"
                              strokeDasharray={`${(stats.rejected / stats.total) * 100} ${100 - (stats.rejected / stats.total) * 100}`}
                              strokeDashoffset={`${25 - (stats.verified / stats.total) * 100 - (stats.pending / stats.total) * 100}`} />
                          </svg>
                        </div>
                        <div className="status-legend">
                          <div className="legend-item"><span className="legend-dot verified" />Vérifiés: {stats.verified}</div>
                          <div className="legend-item"><span className="legend-dot pending" />Suspects: {stats.pending}</div>
                          <div className="legend-item"><span className="legend-dot rejected" />Rejetés: {stats.rejected}</div>
                        </div>
                      </>
                    ) : (
                      <p className="analytics-empty">Aucune donnée</p>
                    )}
                  </div>
                </div>

                {/* Top Observateurs */}
                <div className="analytics-card">
                  <h3>🏆 Top Observateurs</h3>
                  <div className="leaderboard">
                    {topObservers.map(([obsId, count], i) => (
                      <div key={obsId} className="leaderboard-row">
                        <span className="leaderboard-rank">{['🥇', '🥈', '🥉', '4.', '5.'][i]}</span>
                        <span className="leaderboard-name">{obsId}...</span>
                        <span className="leaderboard-count">{count} rapports</span>
                      </div>
                    ))}
                    {topObservers.length === 0 && (
                      <p className="analytics-empty">Aucun observateur</p>
                    )}
                  </div>
                </div>

                {/* Timeline récente */}
                <div className="analytics-card analytics-card-wide">
                  <h3>🕐 Derniers signalements</h3>
                  <div className="timeline">
                    {reports.slice(0, 8).map((r) => (
                      <div key={r.id} className="timeline-item">
                        <div className={`timeline-dot ${r.status}`} />
                        <div className="timeline-content">
                          <strong>{r.incident_type}</strong>
                          <span className="timeline-time">{formatDate(r.created_at)}</span>
                        </div>
                        <div className={`status-badge ${r.status}`}>
                          {r.status === 'verified' ? '✓' : r.status === 'rejected' ? '✕' : '⚠'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Vue Admin Backoffice */}
          {activeView === 'admin' && isAdmin && (
            <AdminPanel auth={auth} apiClient={apiClient} />
          )}
        </main>
      </div>
    </div>
  );
}

// ========================================
// Composant Admin Backoffice
// ========================================
interface AdminUser {
  id: string;
  username: string;
  role: string;
  region_id: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

interface AuditLog {
  id: string;
  admin_id: string;
  admin_name: string;
  action: string;
  target_id: string;
  details: string;
  created_at: string;
}

interface DepartmentData {
  id: string;
  name: string;
  code: string;
  region_id: string;
  population: number;
  registered_voters: number;
  created_at: string;
}

interface LegalDocument {
  id: string;
  title: string;
  description: string;
  doc_type: string;
  version: string;
  full_text?: string;
  file_path?: string;
  created_at: string;
}

interface LegalArticle {
  id: string;
  document_id: string;
  article_number: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
}

interface SemanticSearchResult {
  article: LegalArticle;
  similarity: number;
}


interface RegionWithDepts {
  id: string;
  name: string;
  code: string;
  created_at: string;
  departments: DepartmentData[];
  dept_count: number;
}

interface ElectionData {
  id: string;
  name: string;
  type: string;
  status: string;
  date: string;
  description: string;
  region_ids: string;
  created_at: string;
}

interface IncidentTypeData {
  id: string;
  name: string;
  code: string;
  description: string;
  severity: number;
  color: string;
}

interface KPIData {
  users: { total: number; by_role: Record<string, number> };
  reports: { total: number; verified: number; pending: number; rejected: number };
  elections: { total: number; active: number };
}

function AdminPanel({ auth, apiClient }: { auth: AuthState, apiClient: ReturnType<typeof axios.create> }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'elections' | 'tokens' | 'regions' | 'incidents' | 'logs' | 'config' | 'rbac' | 'map' | 'intelligence' | 'legal'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(0);
  const USERS_PER_PAGE = 10;
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('openvote_theme') as 'dark' | 'light') || 'dark');

  // i18n
  const [lang, setLang] = useState<'fr' | 'en'>(() => (localStorage.getItem('openvote_lang') as 'fr' | 'en') || 'fr');

  // Config editor
  const [editingConfig, setEditingConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState('');

  // Alerts
  const [alertCount, setAlertCount] = useState(0);

  // Token generation
  const [tokenRole, setTokenRole] = useState('observer');
  const [tokenRegion, setTokenRegion] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');

  // Config
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  // Regions
  const [regions, setRegions] = useState<RegionWithDepts[]>([]);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionCode, setNewRegionCode] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptRegionId, setNewDeptRegionId] = useState('');

  // Elections
  const [elections, setElections] = useState<ElectionData[]>([]);
  const [newElection, setNewElection] = useState({ name: '', type: 'general', date: '', description: '', region_ids: 'all' });

  // Incident Types
  const [incidentTypes, setIncidentTypes] = useState<IncidentTypeData[]>([]);
  const [newIncident, setNewIncident] = useState({ name: '', code: '', description: '', severity: 3, color: '#f0883e' });

  // KPIs
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [legalArticles, setLegalArticles] = useState<LegalArticle[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [legalSearch, setLegalSearch] = useState('');

  // CMS creation states
  const [newDoc, setNewDoc] = useState({ title: '', description: '', doc_type: 'law', version: '', full_text: '', file_path: '' });
  const [newArticle, setNewArticle] = useState({ article_number: '', title: '', content: '', category: 'General' });

  // Smart Import Assistant
  const [showImportAssistant, setShowImportAssistant] = useState(false);
  const [rawTextToParse, setRawTextToParse] = useState('');
  const [extractedArticles, setExtractedArticles] = useState<Partial<LegalArticle>[]>([]);

  // RAG / Recherche Sémantique
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<string | null>(null);

  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [deptDraft, setDeptDraft] = useState({ population: 0, registered_voters: 0 });

  const ROLES = ['super_admin', 'region_admin', 'local_coord', 'observer', 'verified_citizen', 'citizen'];
  const ROLE_LABELS: Record<string, string> = {
    super_admin: '🛡️ Super Admin',
    region_admin: '🏛️ Admin Régional',
    local_coord: '📋 Coord. Local',
    observer: '👁️ Observateur',
    verified_citizen: '✅ Citoyen Vérifié',
    citizen: '🏠 Citoyen',
  };

  const ELECTION_TYPES = ['présidentielle', 'législative', 'municipale', 'référendum', 'générale'];
  const STATUS_LABELS: Record<string, string> = { planned: '📌 Planifié', active: '🟢 Actif', closed: '🛑 Clôturé', archived: '📦 Archivé' };
  const STATUS_COLORS: Record<string, string> = { planned: '#d29922', active: '#3fb950', closed: '#f85149', archived: '#8b949e' };

  // i18n translations
  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      dashboard: { fr: '📊 Tableau de Bord', en: '📊 Dashboard' },
      users: { fr: '👥 Utilisateurs', en: '👥 Users' },
      elections: { fr: '🗳️ Scrutins', en: '🗳️ Elections' },
      tokens: { fr: '🔑 Enrôlement', en: '🔑 Enrollment' },
      regions: { fr: '🗺️ Régions', en: '🗺️ Regions' },
      incidents: { fr: '⚠️ Incidents', en: '⚠️ Incidents' },
      logs: { fr: '📜 Audit', en: '📜 Audit' },
      config: { fr: '⚙️ Config', en: '⚙️ Config' },
      rbac: { fr: '🛡️ RBAC', en: '🛡️ RBAC' },
      intelligence: { fr: '📊 Veille Électorale', en: '📊 Election Intel' },
      legal: { fr: '📜 Cadre Légal', en: '📜 Legal Framework' },
      observers_map: { fr: '🗺️ Carte Observateurs', en: '🗺️ Observers Map' },
      search_placeholder: { fr: '🔍 Rechercher par nom, rôle, ID...', en: '🔍 Search by name, role, ID...' },
      export_csv: { fr: '📥 CSV', en: '📥 CSV' },
      export_pdf: { fr: '📄 PDF', en: '📄 PDF' },
      refresh: { fr: '🔄 Actualiser', en: '🔄 Refresh' },
      create: { fr: '➕ Créer', en: '➕ Create' },
      delete_confirm: { fr: 'Confirmer la suppression ?', en: 'Confirm deletion?' },
      never: { fr: 'Jamais', en: 'Never' },
      no_region: { fr: '— Aucune', en: '— None' },
      save_config: { fr: '💾 Sauvegarder', en: '💾 Save' },
      edit_config: { fr: '✏️ Modifier', en: '✏️ Edit' },
      cancel: { fr: 'Annuler', en: 'Cancel' },
      alerts: { fr: 'Alertes', en: 'Alerts' },
    };
    return translations[key]?.[lang] || key;
  };

  // RBAC Matrix
  const RBAC_MATRIX = [
    { action: 'Voir la carte', super_admin: true, region_admin: true, local_coord: true, observer: true, verified_citizen: true, citizen: true },
    { action: 'Soumettre un rapport', super_admin: true, region_admin: true, local_coord: true, observer: true, verified_citizen: true, citizen: false },
    { action: 'Vérifier un rapport', super_admin: true, region_admin: true, local_coord: true, observer: false, verified_citizen: false, citizen: false },
    { action: 'Gérer les utilisateurs', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Créer des scrutins', super_admin: true, region_admin: false, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Générer des tokens', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Voir les audit logs', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Modifier la config', super_admin: true, region_admin: false, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Supprimer des utilisateurs', super_admin: true, region_admin: false, local_coord: false, observer: false, verified_citizen: false, citizen: false },
    { action: 'Accéder au backoffice', super_admin: true, region_admin: true, local_coord: false, observer: false, verified_citizen: false, citizen: false },
  ];

  const notify = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/users');
      setUsers(res.data.users || []);
    } catch { notify('error', 'Erreur chargement utilisateurs'); }
    finally { setLoading(false); }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await apiClient.get('/admin/audit-logs');
      setAuditLogs(res.data.logs || []);
    } catch { notify('error', 'Erreur chargement logs'); }
  };

  const fetchConfig = async () => {
    try {
      const res = await apiClient.get('/admin/config');
      setConfig(res.data);
    } catch { notify('error', 'Erreur chargement config'); }
  };

  const fetchRegions = async () => {
    try {
      const res = await apiClient.get('/regions');
      setRegions(res.data.regions || []);
    } catch { notify('error', 'Erreur chargement régions'); }
  };

  const fetchElections = async () => {
    try {
      const res = await apiClient.get('/admin/elections');
      setElections(res.data.elections || []);
    } catch { notify('error', 'Erreur chargement scrutins'); }
  };

  const fetchIncidentTypes = async () => {
    try {
      const res = await apiClient.get('/incident-types');
      setIncidentTypes(res.data.incident_types || []);
    } catch { notify('error', 'Erreur chargement types incidents'); }
  };

  const fetchKPIs = async () => {
    try {
      const res = await apiClient.get('/admin/kpis');
      setKpis(res.data);
    } catch { notify('error', 'Erreur chargement KPIs'); }
  };

  const fetchLegalDocuments = async () => {
    try {
      const res = await apiClient.get('/admin/legal-documents');
      setLegalDocuments(res.data || []);
      if (!selectedDocId && res.data.length > 0) setSelectedDocId(res.data[0].id);
    } catch { notify('error', 'Erreur chargement documents légaux'); }
  };

  const fetchLegalArticles = async () => {
    try {
      const url = selectedDocId ? `/admin/legal?document_id=${selectedDocId}` : '/admin/legal';
      const res = await apiClient.get(url);
      setLegalArticles(res.data || []);
    } catch { notify('error', 'Erreur chargement articles'); }
  };

  useEffect(() => {
    if (activeTab === 'dashboard') fetchKPIs();
    else if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'logs') fetchAuditLogs();
    else if (activeTab === 'config') fetchConfig();
    else if (activeTab === 'regions') fetchRegions();
    else if (activeTab === 'elections') fetchElections();
    else if (activeTab === 'incidents') fetchIncidentTypes();
    else if (activeTab === 'legal') fetchLegalDocuments();
    else if (activeTab === 'intelligence') { fetchRegions(); fetchElections(); }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'legal' && selectedDocId) {
      fetchLegalArticles();
    }
  }, [selectedDocId, activeTab]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await apiClient.patch(`/admin/users/${userId}`, { role: newRole, region_id: '' });
      notify('success', `Rôle mis à jour: ${ROLE_LABELS[newRole]}`);
      fetchUsers();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Erreur';
      notify('error', msg || 'Erreur lors de la mise à jour');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Supprimer l'utilisateur "${username}" ?\nCette action est irréversible.`)) return;
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      notify('success', `Utilisateur "${username}" supprimé`);
      fetchUsers();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Erreur';
      notify('error', msg || 'Erreur lors de la suppression');
    }
  };

  const handleGenerateToken = async () => {
    if (!tokenRegion.trim()) { notify('error', 'Région requise'); return; }
    try {
      const res = await apiClient.post('/admin/generate-token', {
        role: tokenRole,
        region_id: tokenRegion,
      });
      const token = res.data.activation_token;
      setGeneratedToken(token);
      // Generate QR code
      try {
        const url = await QRCode.toDataURL(token, { width: 256, margin: 2, color: { dark: '#e6edf3', light: '#0d1117' } });
        setQrDataUrl(url);
      } catch { setQrDataUrl(''); }
      notify('success', 'Token généré avec succès');
    } catch { notify('error', 'Erreur génération token'); }
  };

  const handleAddRegion = async () => {
    if (!newRegionName.trim() || !newRegionCode.trim()) { notify('error', 'Nom et code requis'); return; }
    try {
      await apiClient.post('/admin/regions', { name: newRegionName, code: newRegionCode });
      notify('success', `Région "${newRegionName}" créée`);
      setNewRegionName(''); setNewRegionCode('');
      fetchRegions();
    } catch { notify('error', 'Erreur création région'); }
  };

  const handleDeleteRegion = async (id: string, name: string) => {
    if (!confirm(`Supprimer la région "${name}" et TOUS ses départements ?`)) return;
    try {
      await apiClient.delete(`/admin/regions/${id}`);
      notify('success', `Région "${name}" supprimée`);
      fetchRegions();
    } catch { notify('error', 'Erreur suppression région'); }
  };

  const handleAddDepartment = async () => {
    if (!newDeptName.trim() || !newDeptCode.trim() || !newDeptRegionId) { notify('error', 'Tous les champs requis'); return; }
    try {
      await apiClient.post('/admin/departments', { name: newDeptName, code: newDeptCode, region_id: newDeptRegionId });
      notify('success', `Département "${newDeptName}" créé`);
      setNewDeptName(''); setNewDeptCode(''); setNewDeptRegionId('');
      fetchRegions();
    } catch { notify('error', 'Erreur création département'); }
  };

  const handleDeleteDepartment = async (id: string, name: string) => {
    if (!confirm(`Supprimer le département "${name}" ?`)) return;
    try {
      await apiClient.delete(`/admin/departments/${id}`);
      notify('success', `Département "${name}" supprimé`);
      fetchRegions();
    } catch { notify('error', 'Erreur suppression département'); }
  };

  const handleUpdateDeptData = async (dept: DepartmentData) => {
    try {
      await apiClient.patch(`/admin/departments/${dept.id}`, {
        name: dept.name,
        code: dept.code,
        region_id: dept.region_id,
        population: Number(deptDraft.population),
        registered_voters: Number(deptDraft.registered_voters)
      });
      notify('success', `Données mises à jour pour ${dept.name}`);
      setEditingDeptId(null);
      fetchRegions();
    } catch { notify('error', 'Erreur lors de la mise à jour'); }
  };

  const handleCreateElection = async () => {
    if (!newElection.name || !newElection.date) { notify('error', 'Nom et date requis'); return; }
    try {
      await apiClient.post('/admin/elections', newElection);
      notify('success', `Scrutin "${newElection.name}" créé`);
      setNewElection({ name: '', type: 'general', date: '', description: '', region_ids: 'all' });
      fetchElections();
    } catch { notify('error', 'Erreur création scrutin'); }
  };

  const handleElectionStatus = async (id: string, status: string) => {
    try {
      await apiClient.patch(`/admin/elections/${id}/status`, { status });
      notify('success', `Statut mis à jour: ${STATUS_LABELS[status]}`);
      fetchElections();
    } catch { notify('error', 'Erreur mise à jour statut'); }
  };

  const handleDeleteElection = async (id: string, name: string) => {
    if (!confirm(`Supprimer le scrutin "${name}" ?`)) return;
    try {
      await apiClient.delete(`/admin/elections/${id}`);
      notify('success', `Scrutin supprimé`);
      fetchElections();
    } catch { notify('error', 'Erreur suppression scrutin'); }
  };

  const handleCreateLegalDoc = async () => {
    if (!newDoc.title) { notify('error', 'Titre requis'); return; }
    try {
      await apiClient.post('/admin/legal-documents', newDoc);
      notify('success', `Document "${newDoc.title}" créé`);
      setNewDoc({ title: '', description: '', doc_type: 'law', version: '', full_text: '', file_path: '' });
      fetchLegalDocuments();
    } catch { notify('error', 'Erreur création document'); }
  };

  const handleParseRawText = () => {
    if (!rawTextToParse) return;
    // Regex simple pour détecter "Art. X" ou "Article X"
    const articleRegex = /(?:Art\.?\s*|Article\s*)(\d+[^\n]*)\n?([\s\S]*?)(?=(?:Art\.?|Article)\s*\d+|$)/gi;
    const matches = [...rawTextToParse.matchAll(articleRegex)];

    const parsed = matches.map(m => ({
      article_number: m[1].trim(),
      title: m[2].split('\n')[0].trim().substring(0, 100), // Première ligne comme titre possible
      content: m[2].trim(),
      category: 'Auto-Import'
    }));

    setExtractedArticles(parsed);
    notify('success', `${parsed.length} articles détectés`);
  };

  const handleBatchImportArticles = async () => {
    if (extractedArticles.length === 0 || !selectedDocId) return;
    try {
      await apiClient.post('/admin/legal/batch', {
        document_id: selectedDocId,
        articles: extractedArticles
      });
      notify('success', 'Importation réussie');
      setExtractedArticles([]);
      setRawTextToParse('');
      setShowImportAssistant(false);
      fetchLegalArticles();
    } catch { notify('error', 'Échec de l\'importation'); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      notify('success', 'Extraction du texte en cours...');
      const res = await apiClient.post('/admin/legal/extract-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setRawTextToParse(res.data.text);
      notify('success', 'Texte extrait avec succès');
    } catch { notify('error', 'Erreur lors de l\'extraction du PDF'); }
  };

  const handleCreateLegalArticle = async () => {
    if (!newArticle.article_number || !newArticle.title || !selectedDocId) { notify('error', 'Champs requis manquants'); return; }
    try {
      await apiClient.post('/admin/legal', { ...newArticle, document_id: selectedDocId });
      notify('success', `Article ${newArticle.article_number} ajouté`);
      setNewArticle({ article_number: '', title: '', content: '', category: 'General' });
      fetchLegalArticles();
    } catch { notify('error', 'Erreur ajout article'); }
  };

  const handleSemanticSearch = async () => {
    if (!semanticQuery.trim()) return;
    setSemanticLoading(true);
    try {
      const res = await apiClient.post('/admin/legal/search', { query: semanticQuery, limit: 8 });
      setSemanticResults(res.data.results || []);
      if ((res.data.results || []).length === 0) notify('error', 'Aucun résultat. Vérifiez que les embeddings sont générés.');
    } catch { notify('error', 'Erreur recherche sémantique'); }
    setSemanticLoading(false);
  };

  const handleGenerateEmbeddings = async () => {
    setEmbeddingStatus('⏳ Indexation en cours...');
    try {
      const res = await apiClient.post('/admin/legal/embeddings');
      setEmbeddingStatus(`✅ ${res.data.processed} articles indexés (${res.data.errors} erreurs)`);
      notify('success', `${res.data.processed} articles indexés par IA`);
    } catch { setEmbeddingStatus('❌ Erreur'); notify('error', 'Erreur génération embeddings'); }
  };

  const handleCreateIncidentType = async () => {
    if (!newIncident.name || !newIncident.code) { notify('error', 'Nom et code requis'); return; }
    try {
      await apiClient.post('/admin/incident-types', newIncident);
      notify('success', `Type "${newIncident.name}" créé`);
      setNewIncident({ name: '', code: '', description: '', severity: 3, color: '#f0883e' });
      fetchIncidentTypes();
    } catch { notify('error', 'Erreur création type'); }
  };

  const handleDeleteIncidentType = async (id: string, name: string) => {
    if (!confirm(`Supprimer le type "${name}" ?`)) return;
    try {
      await apiClient.delete(`/admin/incident-types/${id}`);
      notify('success', `Type supprimé`);
      fetchIncidentTypes();
    } catch { notify('error', 'Erreur suppression type'); }
  };

  const exportUsersCSV = () => {
    const csv = 'Username,Role,Region,Created\n' + users.map(u => `${u.username},${u.role},${u.region_id},${u.created_at}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'openvote_users.csv'; a.click();
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role.includes(userSearch.toLowerCase()) ||
    u.id.includes(userSearch)
  );

  const paginatedUsers = filteredUsers.slice(userPage * USERS_PER_PAGE, (userPage + 1) * USERS_PER_PAGE);
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);

  const handleRegionChange = async (userId: string, newRegionId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    try {
      await apiClient.patch(`/admin/users/${userId}`, { role: user.role, region_id: newRegionId });
      notify('success', 'Région assignée');
      fetchUsers();
    } catch { notify('error', 'Erreur assignation région'); }
  };

  // Theme toggle
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('openvote_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  // Language toggle
  const toggleLang = () => {
    const next = lang === 'fr' ? 'en' : 'fr';
    setLang(next);
    localStorage.setItem('openvote_lang', next);
  };

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  // Export PDF
  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = `
      <html><head><title>OpenVote - Rapport Admin</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}h1{color:#1a73e8}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}h2{margin-top:30px;color:#555}.stat{display:inline-block;margin:10px 20px;text-align:center}.stat-value{font-size:2rem;font-weight:bold}.stat-label{font-size:0.9rem;color:#666}</style></head><body>
      <h1>🇨🇲 OpenVote - Rapport Administratif</h1>
      <p>Généré le ${new Date().toLocaleString('fr-FR')}</p>
      ${kpis ? `<div>
        <div class="stat"><div class="stat-value">${kpis.users.total}</div><div class="stat-label">Utilisateurs</div></div>
        <div class="stat"><div class="stat-value">${kpis.reports.total}</div><div class="stat-label">Signalements</div></div>
        <div class="stat"><div class="stat-value">${kpis.elections.total}</div><div class="stat-label">Scrutins</div></div>
      </div>` : ''}
      <h2>Utilisateurs (${users.length})</h2>
      <table><tr><th>Nom</th><th>Rôle</th><th>Région</th><th>Créé</th></tr>
      ${users.map(u => `<tr><td>${u.username}</td><td>${u.role}</td><td>${u.region_id || '—'}</td><td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td></tr>`).join('')}
      </table>
      <h2>Scrutins (${elections.length})</h2>
      <table><tr><th>Nom</th><th>Type</th><th>Statut</th><th>Date</th></tr>
      ${elections.map(e => `<tr><td>${e.name}</td><td>${e.type}</td><td>${e.status}</td><td>${new Date(e.date).toLocaleDateString('fr-FR')}</td></tr>`).join('')}
      </table>
      <h2>Régions (${regions.length})</h2>
      <table><tr><th>Code</th><th>Région</th><th>Départements</th></tr>
      ${regions.map(r => `<tr><td>${r.code}</td><td>${r.name}</td><td>${r.dept_count}</td></tr>`).join('')}
      </table>
      </body></html>`;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  // Save config
  const handleSaveConfig = async () => {
    try {
      const parsed = JSON.parse(configDraft);
      await apiClient.patch('/admin/config', parsed);
      notify('success', 'Configuration sauvegardée');
      setEditingConfig(false);
      fetchConfig();
    } catch { notify('error', 'JSON invalide ou erreur serveur'); }
  };

  // Fetch alert count (pending critical reports)
  useEffect(() => {
    if (kpis) setAlertCount(kpis.reports.pending);
  }, [kpis]);

  const REGION_COORDS: Record<string, { lat: number, lon: number }> = {
    'AD': { lat: 6.8797, lon: 13.9056 },
    'CE': { lat: 4.4093, lon: 11.6961 },
    'EN': { lat: 10.5982, lon: 14.3259 },
    'ES': { lat: 4.1485, lon: 14.2818 },
    'LT': { lat: 4.0988, lon: 9.9404 },
    'NO': { lat: 8.6186, lon: 13.7844 },
    'NW': { lat: 6.1685, lon: 10.1696 },
    'OU': { lat: 5.4852, lon: 10.4285 },
    'SU': { lat: 2.7667, lon: 11.4503 },
    'SW': { lat: 5.1687, lon: 9.3517 },
  };

  // Observer stats by region
  const observersByRegion = regions.map(r => ({
    ...r,
    lat: REGION_COORDS[r.code]?.lat,
    lon: REGION_COORDS[r.code]?.lon,
    observers: users.filter(u => u.region_id === r.id && (u.role === 'observer' || u.role === 'local_coord')).length,
    totalUsers: users.filter(u => u.region_id === r.id).length,
  }));

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString('fr-FR'); } catch { return d; }
  };

  return (
    <div className="admin-panel">
      {/* Notification toast */}
      {notification && (
        <div className={`admin-toast ${notification.type}`}>
          {notification.type === 'success' ? '✅' : '❌'} {notification.text}
        </div>
      )}

      {/* Action Header */}
      <div className="admin-header-actions" style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="admin-primary-btn" onClick={() => setActiveTab('map')}>🗺️ {t('observers_map')}</button>
        <button className="admin-primary-btn" onClick={exportPDF}>📄 {t('export_pdf')}</button>
        <button className="toggle-btn" onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        <button className="toggle-btn" onClick={toggleLang}>{lang.toUpperCase()}</button>
        {alertCount > 0 && (
          <div className="admin-toast error" style={{ position: 'static', margin: 0, padding: '6px 12px' }}>
            ⚠️ {alertCount} {t('alerts')}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="admin-tabs">
        <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
          {t('dashboard')}
        </button>
        <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
          {t('users')}
        </button>
        <button className={activeTab === 'elections' ? 'active' : ''} onClick={() => setActiveTab('elections')}>
          {t('elections')}
        </button>
        <button className={activeTab === 'tokens' ? 'active' : ''} onClick={() => setActiveTab('tokens')}>
          {t('tokens')}
        </button>
        <button className={activeTab === 'regions' ? 'active' : ''} onClick={() => setActiveTab('regions')}>
          {t('regions')}
        </button>
        <button className={activeTab === 'incidents' ? 'active' : ''} onClick={() => setActiveTab('incidents')}>
          {t('incidents')}
        </button>
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>
          {t('logs')}
        </button>
        <button className={activeTab === 'config' ? 'active' : ''} onClick={() => setActiveTab('config')}>
          {t('config')}
        </button>
        <button className={activeTab === 'rbac' ? 'active' : ''} onClick={() => setActiveTab('rbac')}>
          {t('rbac')}
        </button>
        <button className={activeTab === 'intelligence' ? 'active' : ''} onClick={() => setActiveTab('intelligence')}>
          {t('intelligence')}
        </button>
        <button className={activeTab === 'legal' ? 'active' : ''} onClick={() => setActiveTab('legal')}>
          {t('legal')}
        </button>
      </div>

      {/* ========== KPI DASHBOARD ========== */}
      {activeTab === 'dashboard' && kpis && (
        <div className="admin-section">
          <h2>📊 Tableau de Bord</h2>
          <div className="kpi-grid">
            <div className="kpi-card kpi-blue">
              <div className="kpi-value">{kpis.users.total}</div>
              <div className="kpi-label">Utilisateurs</div>
              <div className="kpi-detail">
                {Object.entries(kpis.users.by_role).map(([role, count]) => (
                  <span key={role}>{ROLE_LABELS[role]?.split(' ').pop() || role}: {count}</span>
                ))}
              </div>
            </div>
            <div className="kpi-card kpi-green">
              <div className="kpi-value">{kpis.reports.total}</div>
              <div className="kpi-label">Signalements</div>
              <div className="kpi-detail">
                <span>✅ {kpis.reports.verified} vérifiés</span>
                <span>⏳ {kpis.reports.pending} en attente</span>
                <span>❌ {kpis.reports.rejected} rejetés</span>
              </div>
            </div>
            <div className="kpi-card kpi-purple">
              <div className="kpi-value">{kpis.elections.total}</div>
              <div className="kpi-label">Scrutins</div>
              <div className="kpi-detail">
                <span>🟢 {kpis.elections.active} actif(s)</span>
              </div>
            </div>
            <div className="kpi-card kpi-orange">
              <div className="kpi-value">{regions.length || '—'}</div>
              <div className="kpi-label">Régions</div>
              <div className="kpi-detail">
                <span>10 régions officielles</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'dashboard' && !kpis && (
        <div className="admin-empty">Chargement des KPIs...</div>
      )}

      {/* ========== UTILISATEURS ========== */}
      {activeTab === 'users' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>👥 Gestion des Utilisateurs ({filteredUsers.length}/{users.length})</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="admin-refresh-btn" onClick={exportUsersCSV}>📥 CSV</button>
              <button className="admin-refresh-btn" onClick={fetchUsers} disabled={loading}>
                {loading ? '⏳' : '🔄'} Actualiser
              </button>
            </div>
          </div>
          <input
            className="admin-input"
            placeholder="🔍 Rechercher par nom, rôle, ID..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            style={{ marginBottom: 16, width: '100%' }}
          />
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Région</th>
                  <th>Dernier login</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map(user => (
                  <tr key={user.id} className={user.id === auth.username ? 'current-user' : ''}>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span>
                        <div>
                          <strong>{user.username}</strong>
                          <small>{user.id.substring(0, 8)}...</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className={`role-select role-${user.role}`}
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="admin-select"
                        value={user.region_id || ''}
                        onChange={(e) => handleRegionChange(user.id, e.target.value)}
                        style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                      >
                        <option value="">— Aucune</option>
                        {regions.map(r => <option key={r.id} value={r.id}>{r.code} - {r.name}</option>)}
                      </select>
                    </td>
                    <td>{user.last_login_at ? formatDate(user.last_login_at) : <span style={{ color: 'var(--text-secondary)' }}>Jamais</span>}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      <button
                        className="admin-delete-btn"
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        title="Supprimer"
                      >🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={userPage === 0} onClick={() => setUserPage(p => p - 1)}>◀ Préc.</button>
              <span>Page {userPage + 1} / {totalPages}</span>
              <button disabled={userPage >= totalPages - 1} onClick={() => setUserPage(p => p + 1)}>Suiv. ▶</button>
            </div>
          )}
        </div>
      )}

      {/* ========== TOKENS ENRÔLEMENT ========== */}
      {activeTab === 'tokens' && (
        <div className="admin-section">
          <h2>🔑 Génération de Token d'Enrôlement</h2>
          <p className="admin-desc">Générez un token d'activation pour permettre à un nouvel observateur de s'enrôler via l'app mobile.</p>
          <div className="token-form">
            <div className="form-group">
              <label>Rôle attribué</label>
              <select value={tokenRole} onChange={(e) => setTokenRole(e.target.value)} className="admin-select">
                {ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Région</label>
              <select value={tokenRegion} onChange={(e) => setTokenRegion(e.target.value)} className="admin-select">
                <option value="">— Sélectionner une région</option>
                {regions.map(r => <option key={r.id} value={r.code + ' - ' + r.name}>{r.code} - {r.name}</option>)}
              </select>
            </div>
            <button className="admin-primary-btn" onClick={async () => { await handleGenerateToken(); }}>
              🔑 Générer le Token
            </button>
          </div>

          {generatedToken && (
            <div className="generated-token">
              <h3>✅ Token Généré</h3>
              <div className="token-display">
                <code>{generatedToken}</code>
                <button
                  className="copy-btn"
                  onClick={() => { navigator.clipboard.writeText(generatedToken); notify('success', 'Copié !'); }}
                >📋 Copier</button>
              </div>
              <small>Ce token permettra à un utilisateur de s'enrôler avec le rôle <strong>{ROLE_LABELS[tokenRole]}</strong> dans la région <strong>{tokenRegion}</strong>.</small>
              {qrDataUrl && (
                <div className="qr-section">
                  <h4>📱 QR Code</h4>
                  <img src={qrDataUrl} alt="QR Code du token" className="qr-image" />
                  <small>Scannez ce QR code depuis l'app mobile pour s'enrôler automatiquement.</small>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== RÉGIONS & DÉPARTEMENTS ========== */}
      {activeTab === 'regions' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>🗺️ Régions & Départements ({regions.length} régions, {regions.reduce((a, r) => a + r.dept_count, 0)} départements)</h2>
            <button className="admin-refresh-btn" onClick={fetchRegions}>🔄 Actualiser</button>
          </div>

          {/* Ajouter une région */}
          <div className="region-add-form">
            <h3>➕ Ajouter une Région</h3>
            <div className="token-form">
              <div className="form-group">
                <label>Nom</label>
                <input className="admin-input" placeholder="Ex: Adamaoua" value={newRegionName} onChange={e => setNewRegionName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Code</label>
                <input className="admin-input" placeholder="Ex: AD" value={newRegionCode} onChange={e => setNewRegionCode(e.target.value)} style={{ maxWidth: 100 }} />
              </div>
              <button className="admin-primary-btn" onClick={handleAddRegion}>➕ Créer</button>
            </div>
          </div>

          {/* Ajouter un département */}
          <div className="region-add-form" style={{ marginTop: 16 }}>
            <h3>➕ Ajouter un Département</h3>
            <div className="token-form">
              <div className="form-group">
                <label>Nom</label>
                <input className="admin-input" placeholder="Ex: Mfoundi" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Code</label>
                <input className="admin-input" placeholder="Ex: CE-MF" value={newDeptCode} onChange={e => setNewDeptCode(e.target.value)} style={{ maxWidth: 120 }} />
              </div>
              <div className="form-group">
                <label>Région</label>
                <select className="admin-select" value={newDeptRegionId} onChange={e => setNewDeptRegionId(e.target.value)}>
                  <option value="">Sélectionner...</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                </select>
              </div>
              <button className="admin-primary-btn" onClick={handleAddDepartment}>➕ Créer</button>
            </div>
          </div>

          {/* Liste des régions */}
          <div className="region-list">
            {regions.map(region => (
              <div key={region.id} className="region-card">
                <div className="region-card-header" onClick={() => setExpandedRegion(expandedRegion === region.id ? null : region.id)}>
                  <div className="region-card-info">
                    <span className="region-code-badge">{region.code}</span>
                    <strong>{region.name}</strong>
                    <span className="region-dept-count">{region.dept_count} département{region.dept_count > 1 ? 's' : ''}</span>
                  </div>
                  <div className="region-card-actions">
                    <button className="admin-delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteRegion(region.id, region.name); }} title="Supprimer">🗑️</button>
                    <span className="expand-icon">{expandedRegion === region.id ? '▼' : '▶'}</span>
                  </div>
                </div>
                {expandedRegion === region.id && (
                  <div className="region-departments">
                    {region.departments && region.departments.length > 0 ? (
                      <div className="dept-grid">
                        {region.departments.map(dept => (
                          <div key={dept.id} className="dept-chip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px', minWidth: '150px' }}>
                            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="dept-code" style={{ marginRight: 8 }}>{dept.code}</span>
                              <button className="dept-delete" onClick={() => handleDeleteDepartment(dept.id, dept.name)}>×</button>
                            </div>
                            <span className="dept-name" style={{ fontWeight: 600, marginBottom: 4 }}>{dept.name}</span>
                            {dept.population > 0 && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                👥 {dept.population.toLocaleString()} habitants<br />
                                🗳️ {dept.registered_voters.toLocaleString()} inscrits
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="admin-empty">Aucun département dans cette région.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== SCRUTINS / ELECTIONS ========== */}
      {activeTab === 'elections' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>🗳️ Gestion des Scrutins ({elections.length})</h2>
            <button className="admin-refresh-btn" onClick={fetchElections}>🔄 Actualiser</button>
          </div>

          <div className="region-add-form">
            <h3>➕ Créer un Scrutin</h3>
            <div className="token-form">
              <div className="form-group">
                <label>Nom du scrutin</label>
                <input className="admin-input" placeholder="Ex: Présidentielle 2026" value={newElection.name} onChange={e => setNewElection({ ...newElection, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="admin-select" value={newElection.type} onChange={e => setNewElection({ ...newElection, type: e.target.value })}>
                  {ELECTION_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input className="admin-input" type="date" value={newElection.date} onChange={e => setNewElection({ ...newElection, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input className="admin-input" placeholder="Description optionnelle" value={newElection.description} onChange={e => setNewElection({ ...newElection, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Régions ciblées</label>
                <select className="admin-select" value={newElection.region_ids} onChange={e => setNewElection({ ...newElection, region_ids: e.target.value })}>
                  <option value="all">National (Toutes les régions)</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button className="admin-primary-btn" onClick={handleCreateElection}>➕ Créer</button>
            </div>
          </div>

          <div className="election-list">
            {elections.map(el => (
              <div key={el.id} className="election-card">
                <div className="election-header">
                  <div className="election-info">
                    <span className="election-status" style={{ background: STATUS_COLORS[el.status] || '#8b949e' }}>{STATUS_LABELS[el.status] || el.status}</span>
                    <strong>{el.name}</strong>
                    <span className="election-type">{el.type}</span>
                  </div>
                  <div className="election-date">📅 {new Date(el.date).toLocaleDateString('fr-FR')}</div>
                </div>
                {el.description && <p className="election-desc">{el.description}</p>}

                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>📍 Régions: {el.region_ids === 'all' ? 'Nationales' : regions.find(r => r.id === el.region_ids)?.name || 'Spécifique'}</span>
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
        </div>
      )}

      {/* ========== TYPES D'INCIDENTS ========== */}
      {activeTab === 'incidents' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>⚠️ Types d'Incidents ({incidentTypes.length})</h2>
            <button className="admin-refresh-btn" onClick={fetchIncidentTypes}>🔄 Actualiser</button>
          </div>

          <div className="region-add-form">
            <h3>➕ Ajouter un Type d'Incident</h3>
            <div className="token-form">
              <div className="form-group">
                <label>Nom</label>
                <input className="admin-input" placeholder="Ex: Bourrage d'urnes" value={newIncident.name} onChange={e => setNewIncident({ ...newIncident, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Code</label>
                <input className="admin-input" placeholder="Ex: STUFF" value={newIncident.code} onChange={e => setNewIncident({ ...newIncident, code: e.target.value })} style={{ maxWidth: 120 }} />
              </div>
              <div className="form-group">
                <label>Sévérité (1-5)</label>
                <select className="admin-select" value={newIncident.severity} onChange={e => setNewIncident({ ...newIncident, severity: parseInt(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map(s => <option key={s} value={s}>{s} - {['Faible', 'Modérée', 'Moyenne', 'Haute', 'Critique'][s - 1]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Couleur</label>
                <input className="admin-input" type="color" value={newIncident.color} onChange={e => setNewIncident({ ...newIncident, color: e.target.value })} style={{ maxWidth: 60, padding: 4, height: 42 }} />
              </div>
              <button className="admin-primary-btn" onClick={handleCreateIncidentType}>➕ Créer</button>
            </div>
          </div>

          <div className="incident-list">
            {incidentTypes.map(it => (
              <div key={it.id} className="incident-chip">
                <span className="incident-color-dot" style={{ background: it.color }}></span>
                <span className="incident-severity">{'⚠️'.repeat(it.severity)}</span>
                <strong>{it.code}</strong>
                <span>{it.name}</span>
                {it.description && <small>{it.description}</small>}
                <button className="dept-delete" onClick={() => handleDeleteIncidentType(it.id, it.name)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== AUDIT LOGS ========== */}
      {activeTab === 'logs' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>📜 Journal d'Audit ({auditLogs.length})</h2>
            <button className="admin-refresh-btn" onClick={fetchAuditLogs}>🔄 Actualiser</button>
          </div>
          {auditLogs.length === 0 ? (
            <div className="admin-empty">Aucune action enregistrée pour le moment.</div>
          ) : (
            <div className="audit-log-list">
              {auditLogs.map(log => (
                <div key={log.id} className="audit-log-entry">
                  <div className="audit-log-icon">
                    {log.action === 'UPDATE_ROLE' ? '🔄' : log.action === 'DELETE_USER' ? '🗑️' : log.action === 'GENERATE_TOKEN' ? '🔑' : '📋'}
                  </div>
                  <div className="audit-log-content">
                    <strong>{log.action}</strong>
                    <span className="audit-log-details">{log.details}</span>
                    <small>Par: {log.admin_name} | Cible: {log.target_id?.substring(0, 8)}...</small>
                  </div>
                  <div className="audit-log-time">{formatDate(log.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== CONFIGURATION ========== */}
      {activeTab === 'config' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>{t('config')}</h2>
            {!editingConfig ? (
              <button className="admin-primary-btn" onClick={() => { setConfigDraft(JSON.stringify(config, null, 2)); setEditingConfig(true); }}>
                {t('edit_config')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="admin-refresh-btn" onClick={() => setEditingConfig(false)}>{t('cancel')}</button>
                <button className="admin-primary-btn" onClick={handleSaveConfig}>{t('save_config')}</button>
              </div>
            )}
          </div>

          {editingConfig ? (
            <textarea
              value={configDraft}
              onChange={(e) => setConfigDraft(e.target.value)}
              style={{ width: '100%', height: '400px', background: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '12px', fontFamily: 'monospace', borderRadius: '8px' }}
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
      )}

      {/* ========== RBAC MATRIX ========== */}
      {activeTab === 'rbac' && (
        <div className="admin-section">
          <h2>🛡️ Matrice des permissions (RBAC)</h2>
          <div className="admin-table-wrapper">
            <table className="admin-table rbac-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Super Admin</th>
                  <th>Region Admin</th>
                  <th>Coord Local</th>
                  <th>Observer</th>
                  <th>Citoyen Vérifié</th>
                  <th>Citoyen</th>
                </tr>
              </thead>
              <tbody>
                {RBAC_MATRIX.map((row) => (
                  <tr key={row.action}>
                    <td style={{ fontWeight: 600 }}>{row.action}</td>
                    <td style={{ textAlign: 'center' }}>{row.super_admin ? '✅' : '❌'}</td>
                    <td style={{ textAlign: 'center' }}>{row.region_admin ? '✅' : '❌'}</td>
                    <td style={{ textAlign: 'center' }}>{row.local_coord ? '✅' : '❌'}</td>
                    <td style={{ textAlign: 'center' }}>{row.observer ? '✅' : '❌'}</td>
                    <td style={{ textAlign: 'center' }}>{row.verified_citizen ? '✅' : '❌'}</td>
                    <td style={{ textAlign: 'center' }}>{row.citizen ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== OBSERVERS MAP ========== */}
      {activeTab === 'map' && (
        <div className="admin-section">
          <h2>🗺️ Carte des Observateurs</h2>
          <div style={{ height: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <MapContainer center={[5.3697, 12.2343]} zoom={6} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
              {observersByRegion.map(reg => reg.lat ? (
                <Marker key={reg.id} position={[reg.lat, reg.lon]}>
                  <Popup>
                    <strong>{reg.name}</strong><br />
                    Observateurs : {reg.observers} / {reg.totalUsers}<br />
                    Départements : {reg.dept_count}
                  </Popup>
                </Marker>
              ) : null)}
            </MapContainer>
          </div>
        </div>
      )}

      {/* ========== ELECTORAL INTELLIGENCE & BI ========== */}
      {activeTab === 'intelligence' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>🌍 Intelligence Électorale & Analyse de Données</h2>
            <button className="admin-refresh-btn" onClick={() => { fetchRegions(); fetchElections(); }}>🔄 Recalculer les Ratios</button>
          </div>

          {/* Synthèse Nationale */}
          <div className="analytics-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px', marginTop: '20px' }}>
            <div className="config-card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
              <small>Population Totale (Est.)</small>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {(regions.reduce((acc, r) => acc + r.departments.reduce((s, d) => s + (d.population || 0), 0), 0) / 1000000).toFixed(1)}M
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Source : Recensement & Estimations</div>
            </div>
            <div className="config-card" style={{ borderLeft: '4px solid var(--accent-green)' }}>
              <small>Inscrits Totaux (BI)</small>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {(regions.reduce((acc, r) => acc + r.departments.reduce((s, d) => s + (d.registered_voters || 0), 0), 0) / 1000000).toFixed(2)}M
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Données consolidées ELECAM</div>
            </div>
            <div className="config-card" style={{ borderLeft: '4px solid var(--accent-yellow)' }}>
              <small>Taux d'Enrôlement National</small>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {((regions.reduce((acc, r) => acc + r.departments.reduce((s, d) => s + (d.registered_voters || 0), 0), 0) /
                  regions.reduce((acc, r) => acc + r.departments.reduce((s, d) => s + (d.population || 0), 0), 1)) * 100).toFixed(1)}%
              </div>
              <div className="progress-bg" style={{ height: '4px', background: '#30363d', borderRadius: '2px', marginTop: '8px' }}>
                <div className="progress-fill" style={{ height: '100%', width: `35%`, background: 'var(--accent-yellow)', borderRadius: '2px' }}></div>
              </div>
            </div>
            <div className="config-card" style={{ borderLeft: '4px solid var(--accent-red)' }}>
              <small>Indice de Tension Moyen</small>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>4.2 / 10</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-red)' }}>⚠️ 12 alertes critiques actives</div>
            </div>
          </div>

          {/* Analyse par Région (Consolidation) */}
          <div style={{ marginBottom: '40px' }}>
            <h3>📍 Consolidation par Région</h3>
            <div className="admin-table-wrapper" style={{ marginTop: '16px' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Région</th>
                    <th>Départements</th>
                    <th>Population</th>
                    <th>Inscrits</th>
                    <th>Taux d'Enrôlement</th>
                    <th>Poids Électoral</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map(region => {
                    const pop = region.departments.reduce((s, d) => s + (d.population || 0), 0);
                    const voters = region.departments.reduce((s, d) => s + (d.registered_voters || 0), 0);
                    const totalVoters = regions.reduce((acc, r) => acc + r.departments.reduce((s, d) => s + (d.registered_voters || 0), 0), 1);
                    const rate = (voters / (pop || 1)) * 100;

                    if (pop === 0) return null;

                    return (
                      <tr key={region.id}>
                        <td style={{ fontWeight: 'bold' }}>{region.name}</td>
                        <td>{region.dept_count}</td>
                        <td>{pop.toLocaleString()}</td>
                        <td>{voters.toLocaleString()}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem' }}>{rate.toFixed(1)}%</span>
                            <div className="progress-bg" style={{ height: '6px', flex: 1, background: '#30363d', borderRadius: '3px' }}>
                              <div className="progress-fill" style={{ height: '100%', width: `${rate}%`, background: rate > 40 ? 'var(--accent-green)' : 'var(--accent-yellow)', borderRadius: '3px' }}></div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{((voters / totalVoters) * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table Détaillée des Départements */}
          <div className="intelligence-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
            <div className="config-card" style={{ padding: '0' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>📋 Focus Départements (Zones d'Analyse)</h3>
                <small>Cliquez sur ✏️ pour mettre à jour les statistiques ELECAM</small>
              </div>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Département</th>
                      <th>Code</th>
                      <th>Population</th>
                      <th>Inscrits</th>
                      <th>Taux (%)</th>
                      <th>Indice Risque</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regions.flatMap(r => r.departments).filter(d => d.population > 0).sort((a, b) => b.population - a.population).map(dept => {
                      const isEditing = editingDeptId === dept.id;
                      const enrolmentRate = (dept.registered_voters / dept.population) * 100;
                      const riskIndex = enrolmentRate < 30 ? 7.5 : (enrolmentRate > 60 ? 2.1 : 4.8);

                      return (
                        <tr key={dept.id}>
                          <td>{dept.name}</td>
                          <td><code>{dept.code}</code></td>
                          <td>
                            {isEditing ? (
                              <input
                                className="admin-input"
                                type="number"
                                value={deptDraft.population}
                                onChange={e => setDeptDraft({ ...deptDraft, population: Number(e.target.value) })}
                                style={{ width: '100px', fontSize: '0.8rem' }}
                              />
                            ) : (
                              <>
                                <div style={{ fontSize: '0.85rem' }}>{dept.population.toLocaleString()}</div>
                                <div className="progress-bg" style={{ height: '4px', width: '100px', background: '#30363d', borderRadius: '2px', marginTop: '4px' }}>
                                  <div className="progress-fill" style={{ height: '100%', width: `${Math.min(100, (dept.population / 4200000) * 100)}%`, background: 'var(--accent-blue)', borderRadius: '2px' }}></div>
                                </div>
                              </>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                className="admin-input"
                                type="number"
                                value={deptDraft.registered_voters}
                                onChange={e => setDeptDraft({ ...deptDraft, registered_voters: Number(e.target.value) })}
                                style={{ width: '100px', fontSize: '0.8rem' }}
                              />
                            ) : (
                              <>
                                <div style={{ fontSize: '0.85rem' }}>{dept.registered_voters.toLocaleString()} ({enrolmentRate.toFixed(1)}%)</div>
                                <div className="progress-bg" style={{ height: '4px', width: '100px', background: '#30363d', borderRadius: '2px', marginTop: '4px' }}>
                                  <div className="progress-fill" style={{ height: '100%', width: `${enrolmentRate}%`, background: enrolmentRate < 40 ? 'var(--accent-red)' : 'var(--accent-green)', borderRadius: '2px' }}></div>
                                </div>
                              </>
                            )}
                          </td>
                          <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>{enrolmentRate.toFixed(1)}%</td>
                          <td style={{ fontWeight: 600, color: riskIndex > 7 ? 'var(--accent-red)' : (riskIndex > 4 ? 'var(--accent-yellow)' : 'var(--accent-green)') }}>
                            {riskIndex} / 10
                          </td>
                          <td>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button className="admin-primary-btn" onClick={() => handleUpdateDeptData(dept)} title="Enregistrer">💾</button>
                                <button className="admin-cancel-btn" onClick={() => setEditingDeptId(null)} title="Annuler">❌</button>
                              </div>
                            ) : (
                              <button className="admin-btn" onClick={() => {
                                setEditingDeptId(dept.id);
                                setDeptDraft({ population: dept.population, registered_voters: dept.registered_voters });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }} title="Modifier les données">✏️</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== LEGAL CMS (Constitution, Code Électoral, etc.) ========== */}
      {activeTab === 'legal' && (
        <div className="admin-section" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '20px' }}>
          {/* Sidebar Documents */}
          <div className="legal-sidebar" style={{ borderRight: '1px solid var(--border-color)', paddingRight: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
              📚 Documents
              <button className="admin-btn" title="Nouveau Document" onClick={() => setSelectedDocId(null)}>+</button>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {legalDocuments.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: selectedDocId === doc.id ? 'var(--accent-blue-transparent)' : 'transparent',
                    color: selectedDocId === doc.id ? 'var(--accent-blue)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    transition: '0.2s'
                  }}
                >
                  {doc.doc_type === 'constitution' ? '🏛️' : '📜'} {doc.title}
                </button>
              ))}
            </div>

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>🧠 Recherche IA</h4>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input
                  className="admin-input"
                  placeholder="Ex: fermeture bureau de vote..."
                  value={semanticQuery}
                  onChange={e => setSemanticQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSemanticSearch()}
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
                      <div key={idx} style={{
                        background: 'rgba(168,85,247,0.08)',
                        border: '1px solid rgba(168,85,247,0.2)',
                        borderRadius: '8px',
                        padding: '8px',
                        marginBottom: '6px',
                        cursor: 'pointer',
                        transition: '0.2s',
                      }}
                        onClick={() => setSelectedDocId(r.article.document_id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ color: '#a855f7', fontSize: '0.8rem' }}>{r.article.article_number}</strong>
                          <span style={{
                            background: r.similarity > 0.7 ? '#f85149' : r.similarity > 0.5 ? '#d29922' : '#3fb950',
                            color: '#fff',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            fontSize: '0.65rem',
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

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <h4>➕ Nouveau Document</h4>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <input className="admin-input" placeholder="Titre" value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} style={{ fontSize: '0.8rem' }} />
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <select className="admin-select" value={newDoc.doc_type} onChange={e => setNewDoc({ ...newDoc, doc_type: e.target.value })} style={{ fontSize: '0.8rem' }}>
                  <option value="law">Loi</option>
                  <option value="constitution">Constitution</option>
                  <option value="decree">Décret</option>
                </select>
              </div>
              <button className="admin-primary-btn" onClick={handleCreateLegalDoc} style={{ width: '100%', fontSize: '0.8rem' }}>Créer</button>
            </div>
          </div>

          {/* Main Content Areas */}
          <div className="legal-content">
            {selectedDocId ? (
              <>
                <div className="admin-section-header" style={{ marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ marginBottom: '4px' }}>{legalDocuments.find(d => d.id === selectedDocId)?.title}</h2>
                    <small style={{ color: 'var(--text-secondary)' }}>Version : {legalDocuments.find(d => d.id === selectedDocId)?.version || 'N/A'}</small>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
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
                  </div>
                </div>

                {showImportAssistant && (
                  <div className="import-assistant-box" style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '2px solid var(--accent-blue)' }}>
                    <h3>🪄 Assistant d'Importation Intelligente</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                      <div style={{ border: '2px dashed var(--border-color)', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.8rem', marginBottom: '10px' }}>📄 Importer un PDF (Extraction auto)</p>
                        <input type="file" accept=".pdf" onChange={handleFileUpload} style={{ fontSize: '0.8rem', width: '100%' }} />
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
                      onChange={e => setRawTextToParse(e.target.value)}
                    />

                    {extractedArticles.length > 0 && (
                      <div className="extracted-preview">
                        <h4>📋 Articles détectés ({extractedArticles.length})</h4>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
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
                          📥 Importer ces {extractedArticles.length} articles vers "{legalDocuments.find(d => d.id === selectedDocId)?.title}"
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!showImportAssistant && (
                  <div className="cms-article-forms" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px dashed var(--border-color)' }}>
                    <h4>➕ Ajouter un Article</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 150px', gap: '10px', marginBottom: '10px' }}>
                      <input className="admin-input" placeholder="N°" value={newArticle.article_number} onChange={e => setNewArticle({ ...newArticle, article_number: e.target.value })} />
                      <input className="admin-input" placeholder="Titre de l'article" value={newArticle.title} onChange={e => setNewArticle({ ...newArticle, title: e.target.value })} />
                      <input className="admin-input" placeholder="Catégorie" value={newArticle.category} onChange={e => setNewArticle({ ...newArticle, category: e.target.value })} />
                    </div>
                    <textarea
                      className="admin-input"
                      placeholder="Contenu de l'article..."
                      style={{ width: '100%', height: '80px', marginBottom: '10px' }}
                      value={newArticle.content}
                      onChange={e => setNewArticle({ ...newArticle, content: e.target.value })}
                    />
                    <button className="admin-primary-btn" onClick={handleCreateLegalArticle}>Ajouter l'Article</button>
                  </div>
                )}

                <div className="legal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                  {legalArticles
                    .filter(art =>
                      art.title.toLowerCase().includes(legalSearch.toLowerCase()) ||
                      art.content.toLowerCase().includes(legalSearch.toLowerCase()) ||
                      art.article_number.toLowerCase().includes(legalSearch.toLowerCase())
                    )
                    .map(art => (
                      <div key={art.id} className="config-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="election-status" style={{ background: 'var(--accent-blue)', opacity: 0.8 }}>{art.category}</span>
                          <strong style={{ color: 'var(--accent-blue)', fontSize: '1.1rem' }}>{art.article_number}</strong>
                        </div>
                        <h3 style={{ margin: '5px 0', fontSize: '1rem' }}>{art.title}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.4', flex: 1 }}>{art.content}</p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                          <button className="admin-delete-btn" onClick={() => {
                            if (confirm('Supprimer cet article ?')) {
                              apiClient.delete(`/admin/legal/${art.id}`).then(() => fetchLegalArticles());
                            }
                          }} style={{ fontSize: '0.7rem' }}>🗑️ Supprimer</button>
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
      )}
    </div>
  );
}

// ========================================
// Composant Principal (Routeur)
// ========================================
function App() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    // Restaurer la session depuis sessionStorage (RAM uniquement, pas localStorage)
    const stored = sessionStorage.getItem('openvote_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Vérifier l'expiration du token
        const payload = JSON.parse(atob(parsed.token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          return parsed;
        }
      } catch {
        sessionStorage.removeItem('openvote_auth');
      }
    }
    return null;
  });

  const handleLogin = (authState: AuthState) => {
    setAuth(authState);
    // Session storage uniquement (fermé avec l'onglet, pas persisté)
    sessionStorage.setItem('openvote_auth', JSON.stringify(authState));
  };

  const handleLogout = () => {
    setAuth(null);
    sessionStorage.removeItem('openvote_auth');
  };

  if (!auth) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <Dashboard auth={auth} onLogout={handleLogout} />;
}

export default App;
