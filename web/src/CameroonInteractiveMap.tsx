import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface RegionData {
    name: string;
    population: number;
    registered_voters: number;
    departments?: any[];
}

interface Props {
    regions: RegionData[];
    onRegionClick?: (regionName: string) => void;
}

// Mapping code → region name
const CODE_TO_NAME: Record<string, string> = {
    AD: 'Adamaoua', CE: 'Centre', ES: 'Est', EN: 'Extrême-Nord',
    LT: 'Littoral', NO: 'Nord', NW: 'Nord-Ouest', OU: 'Ouest',
    SU: 'Sud', SW: 'Sud-Ouest',
};

// Régions principales villes
const CITIES: { name: string; lat: number; lng: number; isCapital?: boolean }[] = [
    { name: 'Yaoundé', lat: 3.87, lng: 11.52, isCapital: true },
    { name: 'Douala', lat: 4.05, lng: 9.70 },
    { name: 'Garoua', lat: 9.30, lng: 13.39 },
    { name: 'Maroua', lat: 10.59, lng: 14.32 },
    { name: 'Bamenda', lat: 5.96, lng: 10.15 },
    { name: 'Bafoussam', lat: 5.48, lng: 10.42 },
    { name: 'Ngaoundéré', lat: 7.32, lng: 13.58 },
    { name: 'Bertoua', lat: 4.58, lng: 13.68 },
    { name: 'Ebolowa', lat: 2.90, lng: 11.15 },
    { name: 'Buea', lat: 4.16, lng: 9.24 },
    { name: 'Kribi', lat: 2.95, lng: 9.91 },
    { name: 'Kumba', lat: 4.64, lng: 9.45 },
    { name: 'Nkongsamba', lat: 4.95, lng: 9.94 },
    { name: 'Limbé', lat: 4.02, lng: 9.20 },
];

function getColor(rate: number): string {
    if (rate >= 33) return '#2ea043';
    if (rate >= 30) return '#3fb950';
    if (rate >= 27) return '#d29922';
    if (rate >= 24) return '#db6d28';
    return '#f85149';
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
    const map = useMap();
    useEffect(() => {
        map.fitBounds(bounds, { padding: [20, 20] });
    }, [map, bounds]);
    return null;
}

export default function CameroonInteractiveMap({ regions, onRegionClick }: Props) {
    const [geojson, setGeojson] = useState<any>(null);
    const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
    const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
    const geoJsonRef = useRef<any>(null);

    useEffect(() => {
        fetch('/cameroon-regions.geojson')
            .then(r => r.json())
            .then(data => setGeojson(data))
            .catch(() => console.error('Failed to load GeoJSON'));
    }, []);

    const getRegionData = (code: string): RegionData | undefined => {
        const name = CODE_TO_NAME[code];
        return regions.find(r => r.name === name);
    };

    const style = (feature: any) => {
        const code = feature.properties.code;
        const region = getRegionData(code);
        const rate = region && region.population > 0
            ? (region.registered_voters / region.population) * 100
            : 0;
        const isSelected = selectedRegion === code;
        const isHovered = hoveredRegion === code;

        return {
            fillColor: getColor(rate),
            weight: isSelected ? 3 : isHovered ? 2.5 : 1.5,
            opacity: 1,
            color: isSelected ? '#ffffff' : isHovered ? '#e6edf3' : '#30363d',
            fillOpacity: isSelected ? 0.85 : isHovered ? 0.75 : 0.6,
            dashArray: isSelected ? '' : '',
        };
    };

    const onEachFeature = (feature: any, layer: any) => {
        const code = feature.properties.code;
        const region = getRegionData(code);
        const rate = region && region.population > 0
            ? ((region.registered_voters / region.population) * 100).toFixed(1)
            : '0';

        const popFormatted = region ? (region.population / 1e6).toFixed(2) + 'M' : 'N/A';
        const votersFormatted = region ? (region.registered_voters / 1e3).toFixed(0) + 'K' : 'N/A';

        layer.bindTooltip(
            `<div style="font-family:Inter,system-ui,sans-serif;min-width:160px">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#e6edf3">${feature.properties.name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:11px">
          <span style="color:#8b949e">Population:</span><span style="color:#e6edf3;font-weight:600">${popFormatted}</span>
          <span style="color:#8b949e">Inscrits:</span><span style="color:#e6edf3;font-weight:600">${votersFormatted}</span>
          <span style="color:#8b949e">Taux:</span><span style="color:${getColor(Number(rate))};font-weight:700">${rate}%</span>
        </div>
      </div>`,
            {
                className: 'leaflet-tooltip-custom',
                direction: 'top',
                sticky: true,
            }
        );

        layer.on({
            mouseover: (e: any) => {
                setHoveredRegion(code);
                e.target.bringToFront();
            },
            mouseout: () => {
                setHoveredRegion(null);
            },
            click: () => {
                setSelectedRegion(prev => prev === code ? null : code);
                if (onRegionClick) {
                    onRegionClick(feature.properties.name);
                }
            },
        });
    };

    if (!geojson) {
        return (
            <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <span>Chargement de la carte...</span>
            </div>
        );
    }

    const sortedRegions = [...regions]
        .filter(r => r.population > 0)
        .sort((a, b) => (b.registered_voters / b.population) - (a.registered_voters / a.population));

    const selectedData = selectedRegion ? getRegionData(selectedRegion) : null;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
            {/* Carte */}
            <div style={{ position: 'relative' }}>
                <MapContainer
                    center={[6.5, 12.5]}
                    zoom={5}
                    style={{
                        height: '560px',
                        borderRadius: '12px',
                        background: '#0d1117',
                        border: '1px solid var(--border-color)',
                    }}
                    zoomControl={true}
                    attributionControl={false}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                        attribution=""
                    />
                    <GeoJSON
                        ref={geoJsonRef}
                        data={geojson}
                        style={style}
                        onEachFeature={onEachFeature}
                        key={(selectedRegion || '') + (hoveredRegion || '')}
                    />
                    {CITIES.map(city => (
                        <CircleMarkerCity key={city.name} city={city} />
                    ))}
                    <FitBounds bounds={[[1.5, 8.0], [13.5, 16.5]]} />

                    {/* Légende */}
                    <div style={{
                        position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000,
                        background: 'rgba(13,17,23,0.92)', borderRadius: '8px', padding: '10px 14px',
                        border: '1px solid var(--border-color)', backdropFilter: 'blur(8px)',
                    }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, marginBottom: '6px', color: '#e6edf3' }}>
                            Taux d'enrôlement ELECAM
                        </div>
                        {[
                            { label: '≥ 33%', color: '#2ea043' },
                            { label: '30-33%', color: '#3fb950' },
                            { label: '27-30%', color: '#d29922' },
                            { label: '24-27%', color: '#db6d28' },
                            { label: '< 24%', color: '#f85149' },
                        ].map(item => (
                            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                <div style={{ width: '14px', height: '10px', borderRadius: '2px', background: item.color }} />
                                <span style={{ fontSize: '0.65rem', color: '#8b949e' }}>{item.label}</span>
                            </div>
                        ))}
                    </div>
                </MapContainer>
            </div>

            {/* Panel latéral */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Détail région sélectionnée */}
                {selectedData && (
                    <div style={{
                        background: 'rgba(56,139,253,0.08)', border: '1px solid rgba(56,139,253,0.3)',
                        borderRadius: '10px', padding: '14px',
                    }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px', color: '#58a6ff' }}>
                            📍 {selectedData.name}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem' }}>
                            <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>Population</div>
                                <div style={{ fontWeight: 700, color: '#e6edf3' }}>{(selectedData.population / 1e6).toFixed(2)}M</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>Inscrits</div>
                                <div style={{ fontWeight: 700, color: '#e6edf3' }}>{(selectedData.registered_voters / 1e3).toFixed(0)}K</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>Taux</div>
                                <div style={{ fontWeight: 700, color: getColor((selectedData.registered_voters / selectedData.population) * 100) }}>
                                    {((selectedData.registered_voters / selectedData.population) * 100).toFixed(1)}%
                                </div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>Départements</div>
                                <div style={{ fontWeight: 700, color: '#e6edf3' }}>{selectedData.departments?.length || '—'}</div>
                            </div>
                        </div>
                        {selectedData.departments && selectedData.departments.length > 0 && (
                            <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Départements :</div>
                                {selectedData.departments.map((d: any) => (
                                    <div key={d.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.72rem' }}>
                                        <span style={{ color: '#e6edf3' }}>{d.name}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{d.population > 0 ? ((d.registered_voters / d.population) * 100).toFixed(1) + '%' : '—'}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Classement */}
                <div style={{
                    background: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px',
                    border: '1px solid var(--border-color)', flex: 1, overflowY: 'auto',
                }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '10px', color: '#e6edf3' }}>
                        🏆 Classement par Taux d'Enrôlement
                    </div>
                    {sortedRegions.map((region, idx) => {
                        const rate = (region.registered_voters / region.population) * 100;
                        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
                        return (
                            <div
                                key={region.name}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 8px', borderRadius: '6px', marginBottom: '4px',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                    background: selectedRegion && CODE_TO_NAME[selectedRegion] === region.name ? 'rgba(56,139,253,0.12)' : 'transparent',
                                }}
                                onClick={() => {
                                    const code = Object.entries(CODE_TO_NAME).find(([, v]) => v === region.name)?.[0];
                                    if (code) setSelectedRegion(prev => prev === code ? null : code);
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(56,139,253,0.08)')}
                                onMouseLeave={(e) => {
                                    const code = Object.entries(CODE_TO_NAME).find(([, v]) => v === region.name)?.[0];
                                    e.currentTarget.style.background = selectedRegion === code ? 'rgba(56,139,253,0.12)' : 'transparent';
                                }}
                            >
                                <span style={{ width: '24px', textAlign: 'center', fontSize: '0.75rem' }}>{medal}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#e6edf3' }}>{region.name}</div>
                                    <div style={{
                                        height: '3px', borderRadius: '2px', marginTop: '2px',
                                        background: 'rgba(255,255,255,0.06)',
                                    }}>
                                        <div style={{
                                            height: '100%', borderRadius: '2px',
                                            width: `${Math.min(rate * 2.5, 100)}%`,
                                            background: `linear-gradient(90deg, ${getColor(rate)}, ${getColor(rate)}aa)`,
                                        }} />
                                    </div>
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '0.78rem', color: getColor(rate), minWidth: '42px', textAlign: 'right' }}>
                                    {rate.toFixed(1)}%
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// City markers component
function CircleMarkerCity({ city }: { city: { name: string; lat: number; lng: number; isCapital?: boolean } }) {
    const map = useMap();

    useEffect(() => {
        const marker = L.circleMarker([city.lat, city.lng], {
            radius: city.isCapital ? 5 : 3,
            fillColor: city.isCapital ? '#f0883e' : '#e6edf3',
            color: '#0d1117',
            weight: 1,
            fillOpacity: 0.9,
        }).addTo(map);

        marker.bindTooltip(city.name, {
            permanent: true,
            direction: 'right',
            className: 'city-label',
            offset: [6, 0],
        });

        return () => { map.removeLayer(marker); };
    }, [map, city]);

    return null;
}
