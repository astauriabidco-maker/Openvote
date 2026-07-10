/**
 * Openvote — compute des observateurs par région (pour la carte Leaflet).
 *
 * Ce hook est un useMemo pur : il prend les régions et les utilisateurs
 * en entrée et renvoie la liste enrichie (coordonnées GPS + counts).
 *
 * Avantages de l'extraction :
 *   - Logique pure et testable en isolation (no apiClient, no notify)
 *   - Réutilisable ailleurs (DashboardTab, KPIs, future carte électorale)
 *   - Le god-hook n'a plus à connaître REGION_COORDS ni la logique de comptage
 *
 * Note d'impl : `RegionWithCoords` est le type de retour. Il combine
 * RegionWithDepts (du backend) avec les champs calculés lat/lon/observers
 * (de REGION_COORDS et du filter sur users).
 */

import { useMemo } from 'react';
import type { AdminUser, RegionWithDepts } from '../../../types';
import { REGION_COORDS } from '../../../constants';

export type RegionWithCoords = RegionWithDepts & {
    lat?: number;
    lon?: number;
    observers: number;     // count de users avec role observer ou local_coord dans cette région
    totalUsers: number;    // count total de users dans cette région
};

export function useObserversMap(
    regions: RegionWithDepts[],
    users: AdminUser[],
): RegionWithCoords[] {
    return useMemo(() => regions.map((r) => ({
        ...r,
        lat: REGION_COORDS[r.code]?.lat,
        lon: REGION_COORDS[r.code]?.lon,
        observers: users.filter(
            (u) => u.region_id === r.id && (u.role === 'observer' || u.role === 'local_coord'),
        ).length,
        totalUsers: users.filter((u) => u.region_id === r.id).length,
    })), [regions, users]);
}