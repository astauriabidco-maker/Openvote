import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Fix pour les icones Leaflet par défaut
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

interface Report {
  id: string;
  incident_type: string;
  description: string;
  gps_location: string; // "POINT(lon lat)"
  status: string;
  created_at: string;
  h3_index: string;
}

// Composant pour recentrer la carte
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<string>(''); // '' (all), 'pending', 'verified'
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([4.05, 9.7]); // Douala par défaut
  const [zoom, setZoom] = useState(13);

  const fetchReports = async () => {
    try {
      const url = filter
        ? `http://localhost:8095/api/v1/reports?status=${filter}`
        : 'http://localhost:8095/api/v1/reports';
      const response = await axios.get(url);
      setReports(response.data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des signalements:", error);
    }
  };

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 15000);
    return () => clearInterval(interval);
  }, [filter]);

  const parseLocation = (wkt: string): [number, number] | null => {
    try {
      if (!wkt) return null;
      const content = wkt.replace('POINT(', '').replace(')', '');
      const parts = content.split(' ');
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      return [lat, lon];
    } catch (e) {
      return null;
    }
  };

  const handleReportClick = (report: Report) => {
    const pos = parseLocation(report.gps_location);
    if (pos) {
      setSelectedReportId(report.id);
      setMapCenter(pos);
      setZoom(16);
    }
  };

  const getMarkerIcon = (status: string) => {
    const className = status === 'verified' ? 'marker-verified' : 'marker-pending';
    return L.icon({
      iconUrl: icon,
      shadowUrl: iconShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      className: className
    });
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>Openvote | Tactical Dashboard</h1>
        <div className="stats">
          <span style={{ color: '#3fb950' }}>{reports.filter(r => r.status === 'verified').length} Vérifiés</span>
          <span style={{ color: '#f85149', marginLeft: '15px' }}>{reports.filter(r => r.status === 'pending').length} Suspects</span>
        </div>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="filter-bar">
            <button
              className={`filter-btn ${filter === '' ? 'active' : ''}`}
              onClick={() => setFilter('')}
            >
              Tous
            </button>
            <button
              className={`filter-btn ${filter === 'verified' ? 'active' : ''}`}
              onClick={() => setFilter('verified')}
            >
              Vérifiés
            </button>
            <button
              className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              Suspects
            </button>
          </div>

          <div className="report-list">
            {reports.map((report) => (
              <div
                key={report.id}
                className={`report-item ${selectedReportId === report.id ? 'active' : ''}`}
                onClick={() => handleReportClick(report)}
              >
                <h3>{report.incident_type}</h3>
                <p>{report.description || "Aucune description"}</p>
                <div className={`status-badge ${report.status}`}>
                  {report.status}
                </div>
              </div>
            ))}
            {reports.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e' }}>Aucun signalement trouvé.</div>}
          </div>
        </aside>

        <main className="map-wrapper">
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
                <Marker
                  key={report.id}
                  position={position}
                  icon={getMarkerIcon(report.status)}
                >
                  <Popup>
                    <div className="popup-content">
                      <strong>{report.incident_type}</strong>
                      <p>{report.description}</p>
                      <hr />
                      <small>Statut: {report.status}</small><br />
                      <small>ID: {report.id}</small>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </main>
      </div>
    </div>
  );
}

export default App;
