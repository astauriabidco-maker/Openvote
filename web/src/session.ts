/**
 * Openvote — gestion de la session de chiffrement
 *
 * La clé de chiffrement n'est JAMAIS persistée sur disque. Elle vit
 * dans une closure de module et est effacée :
 *   - Sur logout explicite.
 *   - Après 15 minutes d'inactivité (auto-wipe).
 *   - Si la page est déchargée (beforeunload).
 *
 * Le sel PBKDF2 par utilisateur est persisté en IndexedDB (non secret).
 * Le JWT est gardé uniquement en mémoire (closure) — pas de sessionStorage
 * ni de localStorage, conformément au brief instruction.md
 * ("Zero-Knowledge / RAM Only").
 */

import {
    deriveSessionKey,
    generateSalt,
    type EncryptedData,
    encryptString,
    decryptString,
    saltToBase64,
    base64ToSalt,
} from './crypto';

const DB_NAME = 'openvote-sessions';
const DB_VERSION = 1;
const STORE_SALTS = 'user-salts';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;

// ============================================================
// État de session (closure de module — non exporté)
// ============================================================

interface SessionState {
    key: CryptoKey;
    username: string;
    role: string;
    jwt: string;
}

let session: SessionState | null = null;
let inactivityTimer: number | null = null;

// ============================================================
// IndexedDB pour les sels (par utilisateur)
// ============================================================

function openSaltsDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_SALTS)) {
                db.createObjectStore(STORE_SALTS, { keyPath: 'username' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function loadOrCreateSalt(username: string): Promise<Uint8Array> {
    const db = await openSaltsDB();
    const existing = await new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(STORE_SALTS, 'readonly');
        const req = tx.objectStore(STORE_SALTS).get(username);
        req.onsuccess = () => resolve(req.result?.salt ?? null);
        req.onerror = () => reject(req.error);
    });
    if (existing) {
        return base64ToSalt(existing);
    }
    const newSalt = generateSalt();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SALTS, 'readwrite');
        tx.objectStore(STORE_SALTS).put({ username, salt: saltToBase64(newSalt) });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    return newSalt;
}

// ============================================================
// API publique
// ============================================================

export interface LoginParams {
    password: string;
    username: string;
    jwt: string;
    role: string;
}

/**
 * unlock dérive la clé de session depuis le mot de passe et la garde
 * en mémoire. Doit être appelé après chaque login (et après chaque
 * rechargement de page, puisque la clé ne survit pas).
 */
export async function unlock(params: LoginParams): Promise<void> {
    const salt = await loadOrCreateSalt(params.username);
    const key = await deriveSessionKey(params.password, salt);
    session = {
        key,
        username: params.username,
        role: params.role,
        jwt: params.jwt,
    };
    startInactivityWatcher();
    // Verrouille si la page est déchargée (fermeture d'onglet, navigation).
    // On tente aussi un wipe "best-effort" : la clé sera de toute façon
    // nettoyée par le GC quand la closure sera détruite.
    window.addEventListener('beforeunload', lock, { once: true });
}

/**
 * lock efface la clé de session et annule le timer d'inactivité.
 * Idempotent.
 */
export function lock(): void {
    if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
    if (session !== null) {
        // En JavaScript, on ne peut pas "zero out" une CryptoKey non-extractable,
        // mais on peut oublier la référence. Le GC s'occupe du reste.
        session = null;
    }
}

/**
 * isUnlocked indique si une clé de session est disponible.
 */
export function isUnlocked(): boolean {
    return session !== null;
}

/**
 * getKey retourne la clé de session courante. Lance une exception
 * si la session est verrouillée.
 */
export function getSessionKey(): CryptoKey {
    if (!session) {
        throw new Error('Session verrouillée — appelez unlock() après login');
    }
    return session.key;
}

/**
 * getJWT retourne le JWT courant (en mémoire). Lance une exception
 * si la session est verrouillée.
 */
export function getJWT(): string {
    if (!session) {
        throw new Error('Session verrouillée — appelez unlock() après login');
    }
    return session.jwt;
}

/**
 * getUsername retourne le username courant.
 */
export function getUsername(): string | null {
    return session?.username ?? null;
}

/**
 * getRole retourne le rôle courant.
 */
export function getRole(): string | null {
    return session?.role ?? null;
}

// ============================================================
// Chiffrement / Déchiffrement transparents
// ============================================================

/**
 * encryptForSession chiffre une chaîne avec la clé de session.
 * Lance une erreur si la session est verrouillée.
 */
export async function encryptForSession(plaintext: string): Promise<EncryptedData> {
    if (!session) throw new Error('Session verrouillée');
    return encryptString(plaintext, session.key);
}

/**
 * decryptForSession déchiffre une chaîne avec la clé de session.
 * Lance une erreur si la session est verrouillée OU si la clé est
 * incorrecte (mauvais mot de passe / données altérées).
 */
export async function decryptForSession(data: EncryptedData): Promise<string> {
    if (!session) throw new Error('Session verrouillée');
    return decryptString(data, session.key);
}

// ============================================================
// Auto-wipe inactivité
// ============================================================

function startInactivityWatcher(): void {
    if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
    }
    inactivityTimer = window.setTimeout(() => {
        if (session !== null) {
            console.warn('[SESSION] Auto-wipe après inactivité');
            lock();
            // Notifie l'UI pour qu'elle affiche le login screen.
            window.dispatchEvent(new CustomEvent('openvote:session-locked'));
        }
    }, INACTIVITY_TIMEOUT_MS);

    // Reset le timer sur activité utilisateur.
    ACTIVITY_EVENTS.forEach((event) => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
}

function resetInactivityTimer(): void {
    if (session === null || inactivityTimer === null) return;
    clearTimeout(inactivityTimer);
    inactivityTimer = window.setTimeout(() => {
        if (session !== null) {
            console.warn('[SESSION] Auto-wipe après inactivité');
            lock();
            window.dispatchEvent(new CustomEvent('openvote:session-locked'));
        }
    }, INACTIVITY_TIMEOUT_MS);
}