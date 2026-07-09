/**
 * Onglet Map — carte Leaflet des observateurs par région.
 *
 * Utilise observersByRegion (computed dans le hook) pour positionner
 * un marker par région. Le centrage et le zoom sont en dur sur le Cameroun.
 */

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { AdminPanelState } from '../useAdminPanelState';

export default function MapTab({ state }: { state: AdminPanelState }) {
    const { observersByRegion } = state;

    return (
        <div className="admin-section">
            <h2>🗺️ Carte des Observateurs</h2>
            <div style={{
                height: '500px', width: '100%',
                borderRadius: '12px', overflow: 'hidden',
                border: '1px solid var(--border-color)',
            }}>
                <MapContainer center={[5.3697, 12.2343]} zoom={6} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                    {observersByRegion.map((reg) =>
                        reg.lat ? (
                            <Marker key={reg.id} position={[reg.lat, reg.lon ?? 0]}>
                                <Popup>
                                    <strong>{reg.name}</strong><br />
                                    Observateurs : {reg.observers} / {reg.totalUsers}<br />
                                    Départements : {reg.dept_count}
                                </Popup>
                            </Marker>
                        ) : null,
                    )}
                </MapContainer>
            </div>
        </div>
    );
}