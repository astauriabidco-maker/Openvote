/**
 * Openvote — Dashboard principal (carte + signalements + mode admin).
 *
 * Extrait de l'ancien god-component App.tsx (cf. M2 audit).
 * Quatre vues : map (Leaflet + signalements), analytics, PV/comptage,
 * admin (délègue à AdminPanel).
 *
 * Note : la fonction ChangeView (helper Leaflet) est définie localement
 * car elle n'est utilisée qu'ici.
 */

import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import axios from 'axios';
import type { AuthState, ElectionData, HistoricalElectionResult, RegionalRiskSnapshot, RegionPVSummary, Report, ReportLegalMatch } from '../types';
import { API_URL } from '../constants';
import { formatDate, getRoleBadge } from '../utils/format';
import StableAdminPanel from './admin/AdminPanel';
const OfflineReportForm = lazy(() => import('../OfflineReportForm'));
const PVOfflineForm = lazy(() => import('../PVOfflineForm'));
const ParallelCountDashboard = lazy(() => import('../ParallelCountDashboard'));

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

// Composant pour recentrer la carte (helper Leaflet local)
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

// ========================================
// Composant Principal (Routeur)
function Dashboard({ auth, onLogout }: { auth: AuthState, onLogout: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([4.05, 9.7]); // Douala par défaut
  const [zoom, setZoom] = useState(13);
  const [refreshCountdown, setRefreshCountdown] = useState(15);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'map' | 'analytics' | 'pv' | 'admin'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportLegalMatches, setReportLegalMatches] = useState<ReportLegalMatch[]>([]);
  const [historicalResults, setHistoricalResults] = useState<HistoricalElectionResult[]>([]);
  const [pvRegionSummaries, setPVRegionSummaries] = useState<RegionPVSummary[]>([]);
  const [regionalRiskSnapshots, setRegionalRiskSnapshots] = useState<RegionalRiskSnapshot[]>([]);
  const [elections, setElections] = useState<ElectionData[]>([]);
  const [selectedComparisonElectionId, setSelectedComparisonElectionId] = useState('');
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [riskSnapshotLoading, setRiskSnapshotLoading] = useState(false);
  const [historicalYearFilter, setHistoricalYearFilter] = useState('all');
  const [historicalContestFilter, setHistoricalContestFilter] = useState('all');
  const [historicalRegionFilter, setHistoricalRegionFilter] = useState('all');
  const [llmAnalysis, setLlmAnalysis] = useState<{ summary: string; recommendation: string; severity_level: number; raw_response: string; violations: { article_number: string; description: string; severity: string }[] } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReportForm, setShowReportForm] = useState(false);
  const [pvRefreshKey, setPVRefreshKey] = useState(0);

  useEffect(() => {
    const h1 = () => setIsOnline(true);
    const h2 = () => setIsOnline(false);
    window.addEventListener('online', h1);
    window.addEventListener('offline', h2);
    return () => { window.removeEventListener('online', h1); window.removeEventListener('offline', h2); };
  }, []);

  const isAdmin = auth.role === 'super_admin' || auth.role === 'region_admin';

  const apiClient = useMemo(() => axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${auth.token}` },
  }), [auth.token]);

  /**
   * fetchReports charge la première page des signalements (cf. M5 audit).
   * Le format backend est désormais {items, pagination} — on lit items ici.
   * TODO : exposer un composant Pagination au niveau de la carte quand le
   * nombre de signalements dépasse la taille de page.
   */
  const fetchReports = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      params.set('page', '1');
      params.set('limit', '200');
      const url = `/reports?${params.toString()}`;
      const response = await apiClient.get(url);
      setReports(response.data.items || []);
      setRefreshCountdown(15);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        onLogout(); // Token expiré
      }
      console.error("Erreur lors du chargement des signalements:", error);
    }
  }, [filter, apiClient, onLogout]);

  useEffect(() => {
    if (activeView !== 'admin') {
      fetchReports();
      const interval = setInterval(fetchReports, 15000);
      return () => clearInterval(interval);
    }
  }, [fetchReports, activeView]);

  // Countdown timer - Only when not in admin to avoid jitter
  useEffect(() => {
    if (activeView !== 'admin') {
      const timer = setInterval(() => {
        setRefreshCountdown(prev => prev > 0 ? prev - 1 : 15);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeView]);

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

  const fetchHistoricalResults = useCallback(async () => {
    setHistoricalLoading(true);
    try {
      const response = await apiClient.get('/historical-election-results');
      setHistoricalResults(response.data.results || []);
    } catch (error) {
      console.error("Erreur lors du chargement des résultats historiques:", error);
    } finally {
      setHistoricalLoading(false);
    }
  }, [apiClient]);

  const fetchElections = useCallback(async () => {
    try {
      const response = await apiClient.get('/elections');
      const list = response.data.elections || [];
      setElections(list);
      if (!selectedComparisonElectionId) {
        const preferred = list.find((election: ElectionData) => election.status === 'active')
          || list.find((election: ElectionData) => election.status === 'planned')
          || list[0];
        if (preferred) {
          setSelectedComparisonElectionId(preferred.id);
        }
      }
    } catch (error) {
      console.error("Erreur lors du chargement des scrutins:", error);
    }
  }, [apiClient, selectedComparisonElectionId]);

  const fetchPVRegionSummaries = useCallback(async () => {
    if (!selectedComparisonElectionId) return;
    setComparisonLoading(true);
    try {
      const response = await apiClient.get(`/pv-region-summary?election_id=${selectedComparisonElectionId}`);
      setPVRegionSummaries(response.data.regions || []);
    } catch (error) {
      console.error("Erreur lors du chargement des agrégats PV régionaux:", error);
    } finally {
      setComparisonLoading(false);
    }
  }, [apiClient, selectedComparisonElectionId]);

  const fetchRegionalRiskSnapshots = useCallback(async () => {
    if (!selectedComparisonElectionId) return;
    try {
      const response = await apiClient.get(`/regional-risk-snapshots?election_id=${selectedComparisonElectionId}&limit=80`);
      setRegionalRiskSnapshots(response.data.snapshots || []);
    } catch (error) {
      console.error("Erreur lors du chargement des snapshots de risque:", error);
    }
  }, [apiClient, selectedComparisonElectionId]);

  const createRegionalRiskSnapshot = useCallback(async () => {
    if (!selectedComparisonElectionId) return;
    setRiskSnapshotLoading(true);
    try {
      await apiClient.post(`/regional-risk-snapshots?election_id=${selectedComparisonElectionId}`);
      await fetchRegionalRiskSnapshots();
    } catch (error) {
      console.error("Erreur lors de la création du snapshot de risque:", error);
    } finally {
      setRiskSnapshotLoading(false);
    }
  }, [apiClient, fetchRegionalRiskSnapshots, selectedComparisonElectionId]);

  useEffect(() => {
    if (activeView === 'analytics' && historicalResults.length === 0) {
      fetchHistoricalResults();
    }
  }, [activeView, fetchHistoricalResults, historicalResults.length]);

  useEffect(() => {
    if (activeView === 'analytics' && elections.length === 0) {
      fetchElections();
    }
  }, [activeView, elections.length, fetchElections]);

  useEffect(() => {
    if (activeView === 'analytics' && selectedComparisonElectionId) {
      fetchPVRegionSummaries();
    }
  }, [activeView, fetchPVRegionSummaries, selectedComparisonElectionId]);

  useEffect(() => {
    if (activeView === 'analytics' && selectedComparisonElectionId) {
      fetchRegionalRiskSnapshots();
    }
  }, [activeView, fetchRegionalRiskSnapshots, selectedComparisonElectionId]);

  const historicalYearOptions = Array.from(new Set(historicalResults.map((result) => result.election_year)))
    .sort((a, b) => b - a);

  const historicalContestOptions = Array.from(new Set(historicalResults.map((result) => result.contest_type)))
    .sort((a, b) => a.localeCompare(b));

  const historicalRegionOptions = Array.from(new Set(
    historicalResults
      .map((result) => result.region_name)
      .filter((region): region is string => Boolean(region))
  )).sort((a, b) => a.localeCompare(b));

  const matchesHistoricalFilters = (result: HistoricalElectionResult) => (
    (historicalYearFilter === 'all' || String(result.election_year) === historicalYearFilter) &&
    (historicalContestFilter === 'all' || result.contest_type === historicalContestFilter) &&
    (historicalRegionFilter === 'all' || result.region_name === historicalRegionFilter || result.result_level === 'national')
  );

  const historicalSummaries = historicalResults
    .filter((result) => result.actor_type === 'election' && result.metric_type === 'summary' && result.result_level === 'national')
    .filter(matchesHistoricalFilters)
    .sort((a, b) => b.election_year - a.election_year);

  const topHistoricalActors = historicalResults
    .filter((result) => result.actor_type !== 'election' && result.result_level === 'national')
    .reduce((acc, result) => {
      const existing = acc.get(result.election_id);
      const score = result.votes ?? result.seats ?? result.councils_controlled ?? 0;
      const existingScore = existing ? (existing.votes ?? existing.seats ?? existing.councils_controlled ?? 0) : -1;
      if (!existing || score > existingScore) {
        acc.set(result.election_id, result);
      }
      return acc;
    }, new Map<string, HistoricalElectionResult>());

  const territorialSummaries = historicalResults
    .filter((result) => result.result_level !== 'national' && result.actor_type === 'election' && result.metric_type === 'summary')
    .filter(matchesHistoricalFilters)
    .sort((a, b) => {
      if (b.election_year !== a.election_year) return b.election_year - a.election_year;
      return (a.region_name || '').localeCompare(b.region_name || '');
    })
    .slice(0, 24);

  const territorialActorKey = (result: HistoricalElectionResult) => [
    result.election_id,
    result.result_level,
    result.region_name,
    result.department_name,
    result.commune_name,
  ].join('|');

  const topTerritorialActors = historicalResults
    .filter((result) => result.actor_type !== 'election' && result.result_level !== 'national')
    .reduce((acc, result) => {
      const key = territorialActorKey(result);
      const existing = acc.get(key);
      const score = result.votes ?? result.seats ?? result.councils_controlled ?? 0;
      const existingScore = existing ? (existing.votes ?? existing.seats ?? existing.councils_controlled ?? 0) : -1;
      if (!existing || score > existingScore) {
        acc.set(key, result);
      }
      return acc;
    }, new Map<string, HistoricalElectionResult>());

  const formatNumber = (value?: number) => (
    typeof value === 'number' ? value.toLocaleString('fr-FR') : 'n.a.'
  );

  const getHistoricalSignals = (summary: HistoricalElectionResult) => {
    const invalidRate = summary.actual_voters && summary.blank_or_invalid_votes
      ? (summary.blank_or_invalid_votes / summary.actual_voters) * 100
      : undefined;
    const abstentionRate = summary.registered_voters && summary.abstentions
      ? (summary.abstentions / summary.registered_voters) * 100
      : undefined;

    const signals: { label: string; level: 'low' | 'medium' | 'high' }[] = [];
    if (typeof summary.percentage === 'number' && summary.percentage >= 99) {
      signals.push({ label: 'Participation extrême', level: 'high' });
    } else if (typeof summary.percentage === 'number' && summary.percentage >= 95) {
      signals.push({ label: 'Participation très haute', level: 'medium' });
    }
    if (typeof abstentionRate === 'number' && abstentionRate >= 10) {
      signals.push({ label: 'Abstention élevée', level: 'medium' });
    }
    if (typeof invalidRate === 'number' && invalidRate >= 2) {
      signals.push({ label: 'Invalides élevés', level: 'medium' });
    }
    if (signals.length === 0) {
      signals.push({ label: 'Profil stable', level: 'low' });
    }
    return signals;
  };

  const territorialAnomalyRows = territorialSummaries
    .map((summary) => ({ summary, signals: getHistoricalSignals(summary) }))
    .filter(({ signals }) => signals.some((signal) => signal.level !== 'low'));

  const normalizeRegionName = (regionName = '') => {
    const normalized = regionName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[-\s]+/g, ' ')
      .trim();
    const aliases: Record<string, string> = {
      ADAMAWA: 'ADAMAOUA',
      ADAMAOUA: 'ADAMAOUA',
      CENTRE: 'CENTRE',
      CENTER: 'CENTRE',
      EAST: 'EST',
      EST: 'EST',
      'FAR NORTH': 'EXTREME NORD',
      'EXTREME NORD': 'EXTREME NORD',
      LITTORAL: 'LITTORAL',
      NORTH: 'NORD',
      NORD: 'NORD',
      'NORTH WEST': 'NORD OUEST',
      'NORD OUEST': 'NORD OUEST',
      WEST: 'OUEST',
      OUEST: 'OUEST',
      SOUTH: 'SUD',
      SUD: 'SUD',
      'SOUTH WEST': 'SUD OUEST',
      'SUD OUEST': 'SUD OUEST',
    };
    return aliases[normalized] || normalized;
  };

  const latestHistoricalRegionByName = historicalResults
    .filter((result) => result.result_level === 'region' && result.actor_type === 'election' && result.metric_type === 'summary')
    .filter((result) => historicalRegionFilter === 'all' || normalizeRegionName(result.region_name) === normalizeRegionName(historicalRegionFilter))
    .reduce((acc, result) => {
      const key = normalizeRegionName(result.region_name);
      const existing = acc.get(key);
      if (!existing || result.election_year > existing.election_year) {
        acc.set(key, result);
      }
      return acc;
    }, new Map<string, HistoricalElectionResult>());

  const getRiskLevel = (score: number, coverageRate: number) => {
    if (coverageRate < 0.1) return 'signal faible';
    if (score >= 70) return 'élevé';
    if (score >= 40) return 'moyen';
    return 'bas';
  };

  const getRiskClass = (riskLevel: string) => {
    if (riskLevel === 'élevé') return 'high';
    if (riskLevel === 'moyen') return 'medium';
    if (riskLevel === 'signal faible') return 'weak';
    return 'low';
  };

  const getSnapshotRiskClass = (status: string) => {
    if (status === 'prioritaire') return 'high';
    if (status === 'a_surveiller') return 'medium';
    if (status === 'signal_faible') return 'weak';
    return 'low';
  };

  const formatRiskStatus = (status: string) => {
    const labels: Record<string, string> = {
      signal_faible: 'signal faible',
      a_surveiller: 'à surveiller',
      prioritaire: 'prioritaire',
      stable: 'stable',
    };
    return labels[status] || status;
  };

  const regionCoherenceRows = pvRegionSummaries
    .filter((region) => historicalRegionFilter === 'all' || normalizeRegionName(region.region_name) === normalizeRegionName(historicalRegionFilter))
    .map((region) => {
      const reference = latestHistoricalRegionByName.get(normalizeRegionName(region.region_name));
      const turnout = region.registered_voters > 0 ? (region.reported_voters / region.registered_voters) * 100 : undefined;
      const invalidRate = region.reported_voters > 0 ? (region.blank_or_invalid_votes / region.reported_voters) * 100 : undefined;
      const turnoutGap = typeof turnout === 'number' && typeof reference?.percentage === 'number'
        ? turnout - reference.percentage
        : undefined;
      const referenceInvalidRate = reference?.actual_voters && reference.blank_or_invalid_votes
        ? (reference.blank_or_invalid_votes / reference.actual_voters) * 100
        : undefined;
      const invalidGap = typeof invalidRate === 'number' && typeof referenceInvalidRate === 'number'
        ? invalidRate - referenceInvalidRate
        : undefined;
      let score = 0;
      if (typeof turnoutGap === 'number') score += Math.min(45, Math.abs(turnoutGap) * 3);
      if (typeof invalidGap === 'number') score += Math.min(25, Math.abs(invalidGap) * 8);
      if (region.coverage_rate < 0.1) score = Math.min(score, 25);
      if (region.submitted_pv === 0) score = 0;
      const evidence = [
        typeof turnoutGap === 'number' ? `Écart participation ${turnoutGap >= 0 ? '+' : ''}${turnoutGap.toFixed(1)} pts` : 'Référence participation absente',
        typeof invalidGap === 'number' ? `Écart invalides ${invalidGap >= 0 ? '+' : ''}${invalidGap.toFixed(1)} pts` : 'Référence invalides absente',
        `${region.submitted_pv}/${region.total_stations} PV reçus`,
      ];
      return {
        region,
        reference,
        turnout,
        invalidRate,
        score: Math.round(score),
        riskLevel: getRiskLevel(score, region.coverage_rate),
        evidence,
      };
    })
    .sort((a, b) => b.score - a.score || a.region.region_name.localeCompare(b.region.region_name));

  const latestRiskSnapshots = Array.from(regionalRiskSnapshots.reduce((acc, snapshot) => {
    const existing = acc.get(snapshot.normalized_region_name);
    if (!existing || new Date(snapshot.created_at).getTime() > new Date(existing.created_at).getTime()) {
      acc.set(snapshot.normalized_region_name, snapshot);
    }
    return acc;
  }, new Map<string, RegionalRiskSnapshot>()).values())
    .filter((snapshot) => historicalRegionFilter === 'all' || normalizeRegionName(snapshot.region_name) === normalizeRegionName(historicalRegionFilter))
    .sort((a, b) => b.risk_score - a.risk_score || a.region_name.localeCompare(b.region_name));

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

  // formatDate et getRoleBadge importés de utils/format.ts.

  return (
    <div className="dashboard-container">
      {/* Vue Admin Backoffice (refonte 2026-07) : on rend
          directement <StableAdminPanel> à la racine, sans le header
          observer ni le <main className="map-wrapper"> qui brisait
          la mise en page (sidebar/topbar empilés verticalement
          au lieu d'être un rail horizontal à gauche). */}
      {activeView === 'admin' && isAdmin ? (
        <StableAdminPanel auth={auth} apiClient={apiClient} />
      ) : (
      <>
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
              className={`toggle-btn ${activeView === 'pv' ? 'active' : ''}`}
              onClick={() => setActiveView('pv')}
              title="PV & Comptage"
            >🧾</button>
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
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isOnline ? '#2ea043' : '#f85149',
              display: 'inline-block', marginRight: '6px',
              boxShadow: isOnline ? '0 0 6px #2ea043' : '0 0 6px #f85149',
            }} title={isOnline ? 'En ligne' : 'Hors ligne'} />
            <span className="user-role">{getRoleBadge(auth.role)}</span>
            <span className="user-name">{auth.username}</span>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Déconnexion">⏻</button>
        </div>
      </header>

      <div className="main-content">
        {/* L'ancien sidebar observateur (filtres Tous/Vérifiés/etc.) n'a
            de sens qu'en mode "map" (vue observateur). En mode admin
            (activeView === 'admin'), on cache ce sidebar pour
            éviter le layout hybride observé (cf. capture 2026-07-12
            où sidebar et AdminPanel étaient superposés). */}
        {activeView === 'map' && (
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
          <div className="search-bar" style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="🔍 Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setShowReportForm(!showReportForm)}
              style={{
                padding: '8px 14px', borderRadius: '8px', border: 'none',
                background: showReportForm ? '#da3633' : 'linear-gradient(135deg, #238636, #2ea043)',
                color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}
            >
              {showReportForm ? '✕ Fermer' : '+ Signaler'}
            </button>
          </div>

          {showReportForm && (
            <div style={{
              padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)', maxHeight: '70vh', overflowY: 'auto',
            }}>
              <Suspense fallback={<div style={{ color: '#8b949e', padding: '20px', textAlign: 'center' }}>Chargement...</div>}>
                <OfflineReportForm
                  token={auth.token}
                  isOnline={isOnline}
                  onReportSubmitted={() => {
                    fetchReports();
                    setShowReportForm(false);
                  }}
                />
              </Suspense>
            </div>
          )}

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
        )}

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
                    <h4>⚖️ Analyse Juridique IA</h4>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                      <button
                        className="action-btn"
                        style={{ background: 'linear-gradient(135deg, #6f42c1, #a855f7)', color: '#fff', border: 'none', flex: 1 }}
                        onClick={async () => {
                          setActionLoading(selectedReport.id);
                          try {
                            const res = await apiClient.post(`/admin/reports/${selectedReport.id}/qualify`);
                            setReportLegalMatches(res.data.matches || []);
                          } catch { alert('Erreur qualification'); }
                          setActionLoading(null);
                        }}
                        disabled={actionLoading === selectedReport.id}
                      >
                        🔍 Recherche
                      </button>
                      <button
                        className="action-btn"
                        style={{ background: 'linear-gradient(135deg, #0d6efd, #6610f2)', color: '#fff', border: 'none', flex: 1 }}
                        onClick={async () => {
                          setActionLoading(selectedReport.id);
                          setLlmAnalysis(null);
                          try {
                            const res = await apiClient.post(`/admin/reports/${selectedReport.id}/analyze`);
                            if (res.data.analysis) {
                              setLlmAnalysis(res.data.analysis);
                            }
                            // Charger aussi les matches
                            const matchRes = await apiClient.get(`/admin/reports/${selectedReport.id}/legal-matches`);
                            setReportLegalMatches(matchRes.data || []);
                          } catch { alert('Erreur analyse LLM'); }
                          setActionLoading(null);
                        }}
                        disabled={actionLoading === selectedReport.id}
                      >
                        {actionLoading === selectedReport.id ? '⏳ Mistral...' : '🧠 Analyse LLM'}
                      </button>
                    </div>

                    {/* Résultat LLM */}
                    {llmAnalysis && (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(13,110,253,0.08), rgba(102,16,242,0.08))',
                        border: '1px solid rgba(102,16,242,0.3)',
                        borderRadius: '10px',
                        padding: '12px',
                        marginBottom: '10px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <strong style={{ color: '#6610f2' }}>📋 Avis Juridique</strong>
                          <span style={{
                            background: llmAnalysis.severity_level >= 4 ? '#f85149' : llmAnalysis.severity_level >= 3 ? '#d29922' : '#3fb950',
                            color: '#fff',
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                          }}>
                            Gravité: {llmAnalysis.severity_level}/5
                          </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', lineHeight: '1.5', marginBottom: '8px' }}>
                          {llmAnalysis.summary}
                        </p>
                        {llmAnalysis.recommendation && (
                          <div style={{ background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
                            <strong style={{ fontSize: '0.75rem', color: '#3fb950' }}>💡 Recommandation :</strong>
                            <p style={{ fontSize: '0.75rem', margin: '4px 0 0', lineHeight: '1.4' }}>{llmAnalysis.recommendation}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Articles trouvés */}
                    {reportLegalMatches.length > 0 && (
                      <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        <small style={{ color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>📚 {reportLegalMatches.length} articles identifiés :</small>
                        {reportLegalMatches.map((m, idx) => (
                          <div key={idx} style={{
                            background: 'rgba(111,66,193,0.1)',
                            border: '1px solid rgba(111,66,193,0.3)',
                            borderRadius: '8px',
                            padding: '8px',
                            marginBottom: '6px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                              <strong style={{ color: '#a855f7', fontSize: '0.8rem' }}>{m.article_number}</strong>
                              <span style={{
                                background: m.similarity_score > 0.7 ? '#f85149' : m.similarity_score > 0.5 ? '#d29922' : '#3fb950',
                                color: '#fff',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontSize: '0.65rem',
                              }}>
                                {(m.similarity_score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{m.article_title}</div>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                              {m.article_content?.substring(0, 100)}...
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

                <div className="analytics-card analytics-card-wide historical-filter-card">
                  <h3>Filtres historiques</h3>
                  <div className="historical-filter-grid">
                    <label>
                      <span>Année</span>
                      <select value={historicalYearFilter} onChange={(event) => setHistoricalYearFilter(event.target.value)}>
                        <option value="all">Toutes</option>
                        {historicalYearOptions.map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Scrutin</span>
                      <select value={historicalContestFilter} onChange={(event) => setHistoricalContestFilter(event.target.value)}>
                        <option value="all">Tous</option>
                        {historicalContestOptions.map((contest) => (
                          <option key={contest} value={contest}>{contest}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Région</span>
                      <select value={historicalRegionFilter} onChange={(event) => setHistoricalRegionFilter(event.target.value)}>
                        <option value="all">Toutes</option>
                        {historicalRegionOptions.map((region) => (
                          <option key={region} value={region}>{region}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Terrain</span>
                      <select value={selectedComparisonElectionId} onChange={(event) => setSelectedComparisonElectionId(event.target.value)}>
                        <option value="">Scrutin terrain</option>
                        {elections.map((election) => (
                          <option key={election.id} value={election.id}>{election.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="analytics-card analytics-card-wide">
                  <h3>📚 Comparaison historique officielle</h3>
                  {historicalLoading ? (
                    <p className="analytics-empty">Chargement des statistiques historiques...</p>
                  ) : historicalSummaries.length === 0 ? (
                    <p className="analytics-empty">Aucune statistique historique structurée.</p>
                  ) : (
                    <div className="historical-table-wrap">
                      <table className="historical-table">
                        <thead>
                          <tr>
                            <th>Scrutin</th>
                            <th>Inscrits</th>
                            <th>Votants</th>
                            <th>Participation</th>
                            <th>Vainqueur / premier</th>
                            <th>Sièges</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicalSummaries.map((summary) => {
                            const leader = topHistoricalActors.get(summary.election_id);
                            return (
                              <tr key={summary.id}>
                                <td>
                                  <strong>{summary.election_name}</strong>
                                  <span>{summary.contest_type}</span>
                                </td>
                                <td>{formatNumber(summary.registered_voters)}</td>
                                <td>{formatNumber(summary.actual_voters)}</td>
                                <td>{typeof summary.percentage === 'number' ? `${summary.percentage.toFixed(2)}%` : 'n.a.'}</td>
                                <td>
                                  {leader ? (
                                    <>
                                      <strong>{leader.party || leader.actor_name}</strong>
                                      <span>
                                        {leader.votes ? `${formatNumber(leader.votes)} voix` : ''}
                                        {leader.seats ? `${leader.votes ? ' · ' : ''}${formatNumber(leader.seats)} sièges` : ''}
                                      </span>
                                    </>
                                  ) : 'n.a.'}
                                </td>
                                <td>{formatNumber(summary.seats)}</td>
                                <td>
                                  <span className={`source-pill ${summary.status}`}>{summary.status}</span>
                                  <small>{summary.source_document_slug}</small>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="analytics-card analytics-card-wide">
                  <h3>🗺️ Lecture territoriale historique</h3>
                  {historicalLoading ? (
                    <p className="analytics-empty">Chargement des territoires historiques...</p>
                  ) : territorialSummaries.length === 0 ? (
                    <p className="analytics-empty">Aucune statistique territoriale structurée.</p>
                  ) : (
                    <div className="historical-table-wrap">
                      <table className="historical-table">
                        <thead>
                          <tr>
                            <th>Territoire</th>
                            <th>Scrutin</th>
                            <th>Inscrits</th>
                            <th>Votants</th>
                            <th>Participation</th>
                            <th>Premier acteur</th>
                            <th>Conseils</th>
                            <th>Signaux</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {territorialSummaries.map((summary) => {
                            const leader = topTerritorialActors.get(territorialActorKey(summary));
                            return (
                              <tr key={summary.id}>
                                <td>
                                  <strong>{summary.region_name || summary.department_name || summary.commune_name}</strong>
                                  <span>{summary.result_level}</span>
                                </td>
                                <td>
                                  <strong>{summary.election_name}</strong>
                                  <span>{summary.contest_type}</span>
                                </td>
                                <td>{formatNumber(summary.registered_voters)}</td>
                                <td>{formatNumber(summary.actual_voters)}</td>
                                <td>{typeof summary.percentage === 'number' ? `${summary.percentage.toFixed(2)}%` : 'n.a.'}</td>
                                <td>
                                  {leader ? (
                                    <>
                                      <strong>{leader.party || leader.actor_name}</strong>
                                      <span>
                                        {leader.votes ? `${formatNumber(leader.votes)} voix` : ''}
                                        {leader.councils_controlled ? `${leader.votes ? ' · ' : ''}${formatNumber(leader.councils_controlled)} conseils` : ''}
                                      </span>
                                    </>
                                  ) : 'n.a.'}
                                </td>
                                <td>{formatNumber(summary.councils)}</td>
                                <td>
                                  <div className="historical-signal-list">
                                    {getHistoricalSignals(summary).map((signal) => (
                                      <span key={signal.label} className={`historical-signal signal-${signal.level}`}>
                                        {signal.label}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  <span className={`source-pill ${summary.status}`}>{summary.status}</span>
                                  <small>{summary.source_document_slug}</small>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="analytics-card analytics-card-wide">
                  <h3>Cohérence historique vs terrain</h3>
                  {comparisonLoading ? (
                    <p className="analytics-empty">Agrégation des PV terrain par région...</p>
                  ) : regionCoherenceRows.length === 0 ? (
                    <p className="analytics-empty">Aucun PV régional disponible pour le scrutin terrain sélectionné.</p>
                  ) : (
                    <div className="historical-table-wrap">
                      <table className="historical-table coherence-table">
                        <thead>
                          <tr>
                            <th>Région</th>
                            <th>Couverture</th>
                            <th>Participation terrain</th>
                            <th>Référence</th>
                            <th>Leader terrain</th>
                            <th>Risque</th>
                            <th>Preuves</th>
                          </tr>
                        </thead>
                        <tbody>
                          {regionCoherenceRows.map(({ region, reference, turnout, invalidRate, score, riskLevel, evidence }) => (
                            <tr key={region.region_id || region.region_name}>
                              <td>
                                <strong>{region.region_name}</strong>
                                <span>{formatNumber(region.registered_voters)} inscrits couverts</span>
                              </td>
                              <td>
                                <strong>{Math.round(region.coverage_rate * 100)}%</strong>
                                <span>{region.submitted_pv}/{region.total_stations} PV</span>
                              </td>
                              <td>
                                <strong>{typeof turnout === 'number' ? `${turnout.toFixed(2)}%` : 'n.a.'}</strong>
                                <span>{formatNumber(region.reported_voters)} votants · {typeof invalidRate === 'number' ? `${invalidRate.toFixed(2)}% invalides` : 'n.a.'}</span>
                              </td>
                              <td>
                                <strong>{reference ? `${reference.election_year} ${reference.contest_type}` : 'n.a.'}</strong>
                                <span>{reference && typeof reference.percentage === 'number' ? `${reference.percentage.toFixed(2)}% participation` : 'Référence incomplète'}</span>
                              </td>
                              <td>
                                <strong>{region.leader_party || region.leader_name || 'n.a.'}</strong>
                                <span>{region.leader_votes ? `${formatNumber(region.leader_votes)} voix` : 'Aucune voix consolidée'}</span>
                              </td>
                              <td>
                                <span className={`risk-pill risk-${getRiskClass(riskLevel)}`}>{riskLevel}</span>
                                <small>Score {score}/100</small>
                              </td>
                              <td>
                                {evidence.map((item) => (
                                  <span key={item}>{item}</span>
                                ))}
                                {reference && <small>{reference.source_document_slug}</small>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="analytics-card analytics-card-wide">
                  <div className="historical-card-head">
                    <h3>Audit trail des scores régionaux</h3>
                    {isAdmin && (
                      <button type="button" onClick={createRegionalRiskSnapshot} disabled={!selectedComparisonElectionId || riskSnapshotLoading}>
                        {riskSnapshotLoading ? 'Snapshot...' : 'Créer snapshot'}
                      </button>
                    )}
                  </div>
                  {latestRiskSnapshots.length === 0 ? (
                    <p className="analytics-empty">Aucun snapshot régional enregistré pour ce scrutin.</p>
                  ) : (
                    <div className="historical-anomaly-grid">
                      {latestRiskSnapshots.map((snapshot) => (
                        <div key={snapshot.id} className="risk-snapshot-row">
                          <div>
                            <strong>{snapshot.region_name}</strong>
                            <span>{formatDate(snapshot.created_at)}</span>
                          </div>
                          <div>
                            <span className={`risk-pill risk-${getSnapshotRiskClass(snapshot.risk_status)}`}>
                              {formatRiskStatus(snapshot.risk_status)}
                            </span>
                            <small>Score {snapshot.risk_score}/100 · {Math.round(snapshot.coverage_rate * 100)}% couverture</small>
                          </div>
                          <div className="historical-signal-list">
                            {(snapshot.rules || []).slice(0, 3).map((rule) => (
                              <span key={rule.code} className={`historical-signal signal-${rule.severity === 'high' ? 'high' : rule.severity === 'medium' ? 'medium' : 'low'}`}>
                                {rule.code}
                              </span>
                            ))}
                          </div>
                          <div>
                            {(snapshot.evidence || []).slice(0, 3).map((item) => (
                              <span key={item}>{item}</span>
                            ))}
                            <small>{snapshot.snapshot_hash ? `${snapshot.snapshot_hash.slice(0, 18)}...` : 'hash absent'}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="analytics-card analytics-card-wide">
                  <h3>Indicateurs d’anomalies historiques</h3>
                  {historicalLoading ? (
                    <p className="analytics-empty">Calcul des indicateurs historiques...</p>
                  ) : territorialAnomalyRows.length === 0 ? (
                    <p className="analytics-empty">Aucun signal territorial dans les filtres actifs.</p>
                  ) : (
                    <div className="historical-anomaly-grid">
                      {territorialAnomalyRows.map(({ summary, signals }) => (
                        <div key={summary.id} className="historical-anomaly-row">
                          <div>
                            <strong>{summary.region_name}</strong>
                            <span>{summary.election_name}</span>
                          </div>
                          <div className="historical-anomaly-metrics">
                            <span>{typeof summary.percentage === 'number' ? `${summary.percentage.toFixed(2)}% participation` : `${formatNumber(summary.councils)} conseils`}</span>
                            {typeof summary.blank_or_invalid_votes === 'number' && (
                              <span>{formatNumber(summary.blank_or_invalid_votes)} invalides</span>
                            )}
                            {typeof summary.abstentions === 'number' && (
                              <span>{formatNumber(summary.abstentions)} abstentions</span>
                            )}
                          </div>
                          <div className="historical-signal-list">
                            {signals.map((signal) => (
                              <span key={signal.label} className={`historical-signal signal-${signal.level}`}>
                                {signal.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {activeView === 'pv' && (
            <div className="pv-workspace">
              <Suspense fallback={<div className="pv-loading">Chargement du module PV...</div>}>
                <PVOfflineForm
                  token={auth.token}
                  isOnline={isOnline}
                  onPVSubmitted={() => setPVRefreshKey((value) => value + 1)}
                />
                <ParallelCountDashboard token={auth.token} refreshKey={pvRefreshKey} />
              </Suspense>
            </div>
          )}
          {/* L'ancienne instance StableAdminPanel a été déplacée à la
              racine du composant (cf. commentaire ligne ~232) pour
              éviter le layout hybride observer/admin. */}
        </main>
      </div>
      </>
      )}
    </div>
  );
}


export default Dashboard;
