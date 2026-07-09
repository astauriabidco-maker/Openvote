/**
 * Openvote Offline Manager
 *
 * Gère le stockage des signalements hors-ligne dans IndexedDB
 * et leur synchronisation automatique au retour de la connexion.
 *
 * Sécurité (cf. H4 audit) :
 *   - description, location_name, photo_data sont chiffrés AES-GCM-256
 *     via la clé de session (PBKDF2 dérivée du mot de passe utilisateur).
 *   - Le JWT n'est PLUS stocké ici — il vit en RAM dans session.ts.
 *   - Les métadonnées (incident_type, GPS, status, timestamps) restent
 *     en clairtext car elles ne sont pas sensibles individuellement
 *     (un attaquant avec accès au filesystem verrait ces données même
 *     sans IndexedDB).
 *
 * Migration v1 → v2 : le schéma v1 stockait les champs sensibles en
 * clair. À l'ouverture de la v2, on DROP l'ancien store pour éviter
 * toute fuite résiduelle. L'utilisateur doit re-saisir ses signalements
 * en attente (en dev uniquement — impact négligeable).
 */

import type { EncryptedData } from './crypto';
import { encryptForSession, decryptForSession } from './session';

const DB_NAME = 'openvote-offline';
const DB_VERSION = 2;  // bumpé en H4 (chiffrement)
const STORE_REPORTS = 'pending-reports';
const STORE_CACHE = 'data-cache';

// ============================================================
// IndexedDB Setup
// ============================================================

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            // Migration v1 → v2 : on supprime l'ancien store si présent.
            // (On ne peut pas migrer le contenu car le format est incompatible :
            //  les anciens champs sensibles étaient en clair.)
            if (event.oldVersion < 2) {
                if (db.objectStoreNames.contains(STORE_REPORTS)) {
                    db.deleteObjectStore(STORE_REPORTS);
                }
            }
            if (!db.objectStoreNames.contains(STORE_REPORTS)) {
                const store = db.createObjectStore(STORE_REPORTS, { keyPath: 'id', autoIncrement: true });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('created_at', 'created_at', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_CACHE)) {
                db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ============================================================
// Types
// ============================================================

export type ReportStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface PendingReport {
    id?: number;
    incident_type: string;        // metadata, OK en clair
    /** Description chiffrée. Décryptée à la lecture. */
    description?: EncryptedData;
    latitude: number;             // metadata
    longitude: number;            // metadata
    /** Lieu textuel chiffré (peut révéler où se trouvait l'observateur). */
    location_name?: EncryptedData;
    /** Photo chiffrée (base64 du ciphertext — gros volume possible). */
    photo_data?: EncryptedData;
    status: ReportStatus;
    created_at: string;
    retry_count: number;
    last_error?: string;
}

/** Formulaire d'entrée (avant chiffrement). */
export interface ReportInput {
    incident_type: string;
    description: string;
    latitude: number;
    longitude: number;
    location_name: string;
    photo_data?: string;  // base64 de la photo originale
}

// ============================================================
// Save / Read
// ============================================================

/**
 * saveReportOffline chiffre les champs sensibles puis persiste dans IndexedDB.
 * Le JWT n'est PAS stocké ici — récupéré via session.getJWT() au moment du sync.
 */
export async function saveReportOffline(input: ReportInput): Promise<number> {
    const encrypted: PendingReport = {
        incident_type: input.incident_type,
        description: await encryptForSession(input.description),
        latitude: input.latitude,
        longitude: input.longitude,
        location_name: input.location_name
            ? await encryptForSession(input.location_name)
            : undefined,
        photo_data: input.photo_data
            ? await encryptForSession(input.photo_data)
            : undefined,
        status: 'pending',
        created_at: new Date().toISOString(),
        retry_count: 0,
    };

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_REPORTS, 'readwrite');
        const request = tx.objectStore(STORE_REPORTS).add(encrypted);
        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
    });
}

/**
 * getPendingReports retourne les signalements avec champs sensibles
 * DÉCHIFFRÉS. Utilisé par l'UI pour afficher les rapports en attente.
 */
export async function getPendingReports(): Promise<DecryptedReport[]> {
    const db = await openDB();
    const raw = await new Promise<PendingReport[]>((resolve, reject) => {
        const tx = db.transaction(STORE_REPORTS, 'readonly');
        const request = tx.objectStore(STORE_REPORTS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });

    return Promise.all(raw.map(async (r) => {
        let description = '';
        let location_name = '';
        let photo_data: string | undefined;
        try {
            if (r.description) description = await decryptForSession(r.description);
            if (r.location_name) location_name = await decryptForSession(r.location_name);
            if (r.photo_data) photo_data = await decryptForSession(r.photo_data);
        } catch {
            // Données corrompues ou mauvaise clé — on marque pour debug.
            console.warn('[Offline] Échec déchiffrement report id=%s', r.id);
        }
        return {
            id: r.id,
            incident_type: r.incident_type,
            description,
            latitude: r.latitude,
            longitude: r.longitude,
            location_name,
            photo_data,
            status: r.status,
            created_at: r.created_at,
            retry_count: r.retry_count,
            last_error: r.last_error,
        };
    }));
}

export interface DecryptedReport {
    id?: number;
    incident_type: string;
    description: string;
    latitude: number;
    longitude: number;
    location_name: string;
    photo_data?: string;
    status: ReportStatus;
    created_at: string;
    retry_count: number;
    last_error?: string;
}

/**
 * getPendingCount compte les rapports non synchronisés.
 * Pas de déchiffrement nécessaire — lit uniquement l'index status.
 */
export async function getPendingCount(): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_REPORTS, 'readonly');
        const index = tx.objectStore(STORE_REPORTS).index('status');
        const request = index.count(IDBKeyRange.only('pending'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * deleteReport supprime un rapport synchronisé.
 */
export async function deleteReport(id: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_REPORTS, 'readwrite');
        const request = tx.objectStore(STORE_REPORTS).delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * wipeAllReports supprime TOUS les rapports locaux.
 * Appelé au logout pour effacer les données sensibles restantes.
 */
export async function wipeAllReports(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_REPORTS, 'readwrite');
        const request = tx.objectStore(STORE_REPORTS).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function updateReportStatus(
    id: number,
    status: ReportStatus,
    error?: string,
): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_REPORTS, 'readwrite');
        const store = tx.objectStore(STORE_REPORTS);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const report = getReq.result as PendingReport | undefined;
            if (report) {
                report.status = status;
                if (error) report.last_error = error;
                if (status === 'failed') report.retry_count++;
                store.put(report);
            }
            resolve();
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

// ============================================================
// Sync
// ============================================================

import { getJWT } from './session';

/**
 * syncPendingReports synchronise les rapports en attente avec le backend.
 * Le JWT est récupéré depuis la session en RAM (jamais persisté).
 */
export async function syncPendingReports(apiUrl: string): Promise<{ synced: number; failed: number }> {
    if (!isUnlockedSafe()) {
        console.warn('[Offline] Sync ignoré : session verrouillée');
        return { synced: 0, failed: 0 };
    }

    const reports = await getPendingReports();
    const pending = reports.filter((r) => r.status === 'pending' || r.status === 'failed');

    let synced = 0;
    let failed = 0;
    let jwt: string;
    try {
        jwt = getJWT();
    } catch {
        return { synced: 0, failed: 0 };
    }

    for (const report of pending) {
        if (!report.id) continue;

        try {
            await updateReportStatus(report.id, 'syncing');

            const formData = new FormData();
            formData.append('incident_type', report.incident_type);
            formData.append('description', report.description);
            formData.append('latitude', String(report.latitude));
            formData.append('longitude', String(report.longitude));
            formData.append('location_name', report.location_name);

            if (report.photo_data) {
                // photo_data est la version base64 du ciphertext déchiffré.
                // On le reconvertit en Blob pour l'upload.
                const res = await fetch(report.photo_data);
                const blob = await res.blob();
                formData.append('photo', blob, 'photo.jpg');
            }

            const response = await fetch(`${apiUrl}/reports`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}` },
                body: formData,
            });

            if (response.ok) {
                await deleteReport(report.id);
                synced++;
            } else {
                const errText = await response.text();
                await updateReportStatus(report.id, 'failed', `HTTP ${response.status}: ${errText}`);
                failed++;
            }
        } catch (err) {
            if (report.id) {
                await updateReportStatus(report.id, 'failed', String(err));
            }
            failed++;
        }
    }

    localStorage.setItem('openvote_last_sync', new Date().toISOString());
    return { synced, failed };
}

function isUnlockedSafe(): boolean {
    try {
        getJWT();
        return true;
    } catch {
        return false;
    }
}

// ============================================================
// Cache (non chiffré — données publiques)
// ============================================================

/**
 * cacheData stocke des données de cache non sensibles (régions, départements).
 * Pas de chiffrement — ces données sont déjà publiques côté backend.
 */
export async function cacheData(key: string, data: unknown): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        tx.objectStore(STORE_CACHE).put({ key, data, updated_at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getCachedData<T>(key: string): Promise<T | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readonly');
        const request = tx.objectStore(STORE_CACHE).get(key);
        request.onsuccess = () => resolve(request.result?.data ?? null);
        request.onerror = () => reject(request.error);
    });
}

// ============================================================
// Auto-sync
// ============================================================

/**
 * setupAutoSync déclenche syncPendingReports à chaque retour réseau.
 * Si la session est verrouillée, le sync est silencieusement ignoré
 * (les rapports restent en attente jusqu'au prochain login).
 */
export function setupAutoSync(apiUrl: string): void {
    window.addEventListener('online', async () => {
        console.log('[Offline] Connection restored, syncing...');
        const result = await syncPendingReports(apiUrl);
        if (result.synced > 0) {
            document.dispatchEvent(new CustomEvent('openvote:sync-complete', { detail: result }));
        }
    });

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then((registration) => {
                (registration as unknown as { sync: { register: (tag: string) => void } }).sync.register('sync-reports');
            })
            .catch(() => {
                console.log('[Offline] Background sync not available');
            });
    }
}