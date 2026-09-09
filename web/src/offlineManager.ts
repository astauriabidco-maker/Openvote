/**
 * Openvote Offline Manager
 *
 * Gère le stockage des signalements hors-ligne dans IndexedDB
 * et des PV terrain, puis leur synchronisation automatique au retour réseau.
 *
 * Sécurité (cf. H4 audit) :
 *   - description, location_name, photo_data, notes et preuves PV sont chiffrés AES-GCM-256
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
const DB_VERSION = 3;  // v3 ajoute les PV offline.
const STORE_REPORTS = 'pending-reports';
const STORE_PV = 'pending-pv';
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
            if (!db.objectStoreNames.contains(STORE_PV)) {
                const store = db.createObjectStore(STORE_PV, { keyPath: 'id', autoIncrement: true });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('election_id', 'election_id', { unique: false });
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
export type OfflineSyncStatus = ReportStatus;

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

export interface PVResultInput {
    candidate_id: string;
    candidate_name?: string;
    party?: string;
    votes: number;
}

export interface PVInput {
    election_id: string;
    election_name: string;
    polling_station_id: string;
    polling_station_code: string;
    polling_station_name: string;
    registered_voters: number;
    voters_count: number;
    null_votes: number;
    blank_votes: number;
    disputed_votes: number;
    pv_photo_data?: string;
    pv_hash: string;
    signed_payload_hash: string;
    signature: string;
    proof_manifest_version: number;
    client_recorded_at: string;
    device_latitude: number;
    device_longitude: number;
    device_id: string;
    notes: string;
    results: PVResultInput[];
}

export interface PendingPV {
    id?: number;
    election_id: string;
    election_name: string;
    polling_station_id: string;
    polling_station_code: string;
    polling_station_name: string;
    registered_voters: number;
    voters_count: number;
    null_votes: number;
    blank_votes: number;
    disputed_votes: number;
    pv_photo_data?: EncryptedData;
    pv_hash?: EncryptedData;
    signed_payload_hash?: EncryptedData;
    signature?: EncryptedData;
    proof_manifest_version: number;
    client_recorded_at: string;
    device_latitude: number;
    device_longitude: number;
    device_id: string;
    notes?: EncryptedData;
    results: PVResultInput[];
    status: OfflineSyncStatus;
    created_at: string;
    retry_count: number;
    last_error?: string;
}

export interface DecryptedPV extends Omit<PendingPV, 'pv_photo_data' | 'pv_hash' | 'signed_payload_hash' | 'signature' | 'notes'> {
    pv_photo_data?: string;
    pv_hash: string;
    signed_payload_hash: string;
    signature: string;
    notes: string;
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

export async function savePVOffline(input: PVInput): Promise<number> {
    const encrypted: PendingPV = {
        election_id: input.election_id,
        election_name: input.election_name,
        polling_station_id: input.polling_station_id,
        polling_station_code: input.polling_station_code,
        polling_station_name: input.polling_station_name,
        registered_voters: input.registered_voters,
        voters_count: input.voters_count,
        null_votes: input.null_votes,
        blank_votes: input.blank_votes,
        disputed_votes: input.disputed_votes,
        pv_photo_data: input.pv_photo_data ? await encryptForSession(input.pv_photo_data) : undefined,
        pv_hash: input.pv_hash ? await encryptForSession(input.pv_hash) : undefined,
        signed_payload_hash: input.signed_payload_hash ? await encryptForSession(input.signed_payload_hash) : undefined,
        signature: input.signature ? await encryptForSession(input.signature) : undefined,
        proof_manifest_version: input.proof_manifest_version || 1,
        client_recorded_at: input.client_recorded_at,
        device_latitude: input.device_latitude,
        device_longitude: input.device_longitude,
        device_id: input.device_id,
        notes: input.notes ? await encryptForSession(input.notes) : undefined,
        results: input.results,
        status: 'pending',
        created_at: new Date().toISOString(),
        retry_count: 0,
    };

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PV, 'readwrite');
        const request = tx.objectStore(STORE_PV).add(encrypted);
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

export async function getPendingPVs(): Promise<DecryptedPV[]> {
    const db = await openDB();
    const raw = await new Promise<PendingPV[]>((resolve, reject) => {
        const tx = db.transaction(STORE_PV, 'readonly');
        const request = tx.objectStore(STORE_PV).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });

    return Promise.all(raw.map(async (pv) => {
        let pv_photo_data: string | undefined;
        let pv_hash = '';
        let signed_payload_hash = '';
        let signature = '';
        let notes = '';
        try {
            if (pv.pv_photo_data) pv_photo_data = await decryptForSession(pv.pv_photo_data);
            if (pv.pv_hash) pv_hash = await decryptForSession(pv.pv_hash);
            if (pv.signed_payload_hash) signed_payload_hash = await decryptForSession(pv.signed_payload_hash);
            if (pv.signature) signature = await decryptForSession(pv.signature);
            if (pv.notes) notes = await decryptForSession(pv.notes);
        } catch {
            console.warn('[Offline] Échec déchiffrement PV id=%s', pv.id);
        }
        return { ...pv, pv_photo_data, pv_hash, signed_payload_hash, signature, notes };
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

export async function getPendingPVCount(): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PV, 'readonly');
        const index = tx.objectStore(STORE_PV).index('status');
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

export async function deletePV(id: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PV, 'readwrite');
        const request = tx.objectStore(STORE_PV).delete(id);
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
        const stores = db.objectStoreNames.contains(STORE_PV)
            ? [STORE_REPORTS, STORE_PV]
            : [STORE_REPORTS];
        const tx = db.transaction(stores, 'readwrite');
        tx.objectStore(STORE_REPORTS).clear();
        if (db.objectStoreNames.contains(STORE_PV)) {
            tx.objectStore(STORE_PV).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
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

async function updatePVStatus(
    id: number,
    status: OfflineSyncStatus,
    error?: string,
): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PV, 'readwrite');
        const store = tx.objectStore(STORE_PV);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const pv = getReq.result as PendingPV | undefined;
            if (pv) {
                pv.status = status;
                if (error) pv.last_error = error;
                if (status === 'failed') pv.retry_count++;
                store.put(pv);
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

export async function syncPendingPVs(apiUrl: string): Promise<{ synced: number; failed: number }> {
    if (!isUnlockedSafe()) {
        console.warn('[Offline] Sync PV ignoré : session verrouillée');
        return { synced: 0, failed: 0 };
    }

    const pvs = await getPendingPVs();
    const pending = pvs.filter((pv) => pv.status === 'pending' || pv.status === 'failed');

    let synced = 0;
    let failed = 0;
    let jwt: string;
    try {
        jwt = getJWT();
    } catch {
        return { synced: 0, failed: 0 };
    }

    for (const pv of pending) {
        if (!pv.id) continue;
        try {
            await updatePVStatus(pv.id, 'syncing');
            const pvPhotoUrl = pv.pv_photo_data
                ? await uploadPVPhoto(apiUrl, jwt, pv.id, pv.pv_photo_data, pv.pv_hash)
                : '';
            const response = await fetch(`${apiUrl}/pv`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    election_id: pv.election_id,
                    polling_station_id: pv.polling_station_id,
                    registered_voters: pv.registered_voters,
                    voters_count: pv.voters_count,
                    null_votes: pv.null_votes,
                    blank_votes: pv.blank_votes,
                    disputed_votes: pv.disputed_votes,
                    pv_photo_url: pvPhotoUrl,
                    pv_hash: pv.pv_hash,
                    signed_payload_hash: pv.signed_payload_hash,
                    signature: pv.signature,
                    proof_manifest_version: pv.proof_manifest_version || 1,
                    client_recorded_at: pv.client_recorded_at,
                    device_latitude: pv.device_latitude,
                    device_longitude: pv.device_longitude,
                    device_id: pv.device_id,
                    notes: pv.notes,
                    results: pv.results.map((r) => ({ candidate_id: r.candidate_id, votes: r.votes })),
                }),
            });

            if (response.ok) {
                await deletePV(pv.id);
                synced++;
            } else {
                const errText = await response.text();
                await updatePVStatus(pv.id, 'failed', `HTTP ${response.status}: ${errText}`);
                failed++;
            }
        } catch (err) {
            await updatePVStatus(pv.id, 'failed', String(err));
            failed++;
        }
    }

    localStorage.setItem('openvote_last_pv_sync', new Date().toISOString());
    return { synced, failed };
}

async function uploadPVPhoto(apiUrl: string, jwt: string, pvLocalId: number, dataURL: string, pvHash: string): Promise<string> {
    const blob = await fetch(dataURL).then((res) => res.blob());
    const extension = extensionFromMime(blob.type);
    const fileName = `pv-${pvLocalId}-${pvHash.slice(0, 16)}.${extension}`;
    const presigned = await fetch(`${apiUrl}/pv-photos/upload-url?file_name=${encodeURIComponent(fileName)}`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!presigned.ok) {
        throw new Error(`PV photo upload URL HTTP ${presigned.status}`);
    }
    const payload = await presigned.json() as { upload_url?: string; pv_photo_url?: string };
    if (!payload.upload_url) {
        throw new Error('PV photo upload URL absente');
    }
    const upload = await fetch(payload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob,
    });
    if (!upload.ok) {
        throw new Error(`PV photo upload HTTP ${upload.status}`);
    }
    return payload.pv_photo_url || `pv/${fileName}`;
}

function extensionFromMime(mime: string): string {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/heic') return 'heic';
    return 'jpg';
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
        const pvResult = await syncPendingPVs(apiUrl);
        if (result.synced > 0 || pvResult.synced > 0) {
            document.dispatchEvent(new CustomEvent('openvote:sync-complete', {
                detail: {
                    ...result,
                    pv_synced: pvResult.synced,
                    pv_failed: pvResult.failed,
                },
            }));
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
