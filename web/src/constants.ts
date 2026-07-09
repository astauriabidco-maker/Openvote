/**
 * Openvote — constantes globales (URLs, coordonnées géographiques).
 *
 * Extrait de l'ancien god-component App.tsx (cf. M2 audit).
 */

// URL de l'API backend. En prod, doit pointer vers le serveur déployé.
// TODO : externaliser via variable d'environnement Vite au build.
export const API_URL = 'http://localhost:8095/api/v1';

/**
 * Coordonnées approximatives des chefs-lieux des 10 régions du Cameroun.
 * Utilisées pour centrer la carte Leaflet quand une région est sélectionnée.
 * Source : approximations manuelles (précision ≈ 50 km).
 */
export const REGION_COORDS: Record<string, { lat: number; lon: number }> = {
    AD: { lat: 6.8797, lon: 13.9056 },  // Adamaoua (Ngaoundéré)
    CE: { lat: 4.4093, lon: 11.6961 },  // Centre (Yaoundé)
    EN: { lat: 10.5982, lon: 14.3259 }, // Extrême-Nord (Maroua)
    ES: { lat: 4.1485, lon: 14.2818 },  // Est (Bertoua)
    LT: { lat: 4.0988, lon: 9.9404 },   // Littoral (Douala)
    NO: { lat: 8.6186, lon: 13.7844 },  // Nord (Garoua)
    NW: { lat: 6.1685, lon: 10.1696 },  // Nord-Ouest (Bamenda)
    OU: { lat: 5.4852, lon: 10.4285 },  // Ouest (Bafoussam)
    SU: { lat: 2.7667, lon: 11.4503 },  // Sud (Ebolowa)
    SW: { lat: 5.1687, lon: 9.3517 },   // Sud-Ouest (Buéa)
};