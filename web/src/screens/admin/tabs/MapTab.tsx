/**
 * Onglet Map — carte Leaflet des observateurs par région.
 *
 * Utilise observersByRegion (computed dans le hook) pour positionner
 * un marker par région. Le centrage et le zoom sont en dur sur le Cameroun.
 *
 * KPI Band : compte par agrégat (régions, observateurs, départements,
 * régions sans coordonnée GPS). Le "sans lat" est utile pour détecter
 * des trous dans le référentiel régions.
 */

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { AdminPanelState } from '../useAdminPanelState';
import TabHeader, { KPIBand, type KPIItem } from '../components/TabHeader';

export default function MapTab({ state }: { state: AdminPanelState }) {
    const { observersByRegion } = state;

    // KPI Band : on agrège depuis observersByRegion (déjà calculé
    // par le hook via /admin/kpis + /admin/regions). Pas d'appel
    // réseau supplémentaire.
    const regionsWithObs = observersByRegion.length;
    const totalObservers = observersByRegion.reduce(
        (sum, r) => sum + (r.observers ?? 0), 0,
    );
    const totalDepts = observersByRegion.reduce(
        (sum, r) => sum + (r.dept_count ?? 0), 0,
    );
    const missingGeoCount = observersByRegion.filter((r) => !r.lat).length;
    const mapKpiItems: KPIItem[] = [
        { label: 'Régions', value: regionsWithObs },
        {
            label: 'Observateurs',
            value: totalObservers,
            valueColor: 'var(--color-accent-blue, #58a6ff)',
        },
        {
            label: 'Départements',
            value: totalDepts,
            valueColor: 'var(--color-accent-green, #3fb950)',
        },
        {
            label: 'Sans GPS',
            value: missingGeoCount,
            valueColor: missingGeoCount > 0
                ? 'var(--color-accent-red, #f85149)'
                : 'var(--color-text-muted, #545d68)',
        },
    ];

    return (
        <div className="admin-section">
            <TabHeader
                title="🗺️ Carte des observateurs"
                subtitle={`${regionsWithObs} régions · ${totalObservers} observateur${totalObservers > 1 ? 's' : ''} déployé${totalObservers > 1 ? 's' : ''}`}
            >
                <KPIBand items={mapKpiItems} />
            </TabHeader>
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