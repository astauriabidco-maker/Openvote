/**
 * Openvote — primitives cryptographiques côté client
 *
 * Toute donnée sensible persistée dans IndexedDB (photos, descriptions,
 * localisations) est chiffrée via AES-GCM-256 avec une clé dérivée du
 * mot de passe utilisateur via PBKDF2-SHA256 (250k itérations).
 *
 * Modèle de menace :
 *   - Appareil saisi physiquement → extraction IndexedDB doit être inutile.
 *   - XSS en cours de session → la clé n'est jamais persistée, donc
 *     le voleur de session a une fenêtre limitée (cf. session.ts).
 *
 * Non couvert par ce module :
 *   - Transport (HTTPS obligatoire, géré par l'infra).
 *   - Backend at-rest (chiffrement disque PostgreSQL).
 */

const PBKDF2_ITERATIONS = 250_000;  // 250k ≈ 250ms sur un laptop moderne
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;        // standard AES-GCM

export interface EncryptedData {
    /** IV en base64 (12 octets). */
    iv: string;
    /** Ciphertext + tag d'authentification en base64. */
    ciphertext: string;
}

// ============================================================
// Encodages
// ============================================================

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    // Retourne ArrayBuffer brut (pas Uint8Array) pour satisfaire
    // la signature BufferSource de Web Crypto sous TS 5.9 strict.
    return bytes.buffer;
}

// ============================================================
// Sel & IV aléatoires
// ============================================================

/**
 * generateSalt produit un sel cryptographique de 16 octets.
 * Le sel n'est PAS secret — il peut être stocké en clair (IndexedDB,
 * localStorage) et réutilisé entre sessions du même utilisateur.
 */
export function generateSalt(): Uint8Array {
    const salt = new Uint8Array(SALT_LENGTH_BYTES);
    crypto.getRandomValues(salt);
    return salt;
}

function generateIV(): Uint8Array {
    const iv = new Uint8Array(IV_LENGTH_BYTES);
    crypto.getRandomValues(iv);
    return iv;
}

// ============================================================
// Dérivation de clé
// ============================================================

/**
 * deriveSessionKey dérive une clé AES-GCM 256 bits à partir du mot
 * de passe et d'un sel via PBKDF2-SHA256. La clé retournée est
 * NON-extractable : impossible à exporter en JavaScript.
 *
 * Coût : ~250ms sur un laptop 2020. Ajuster PBKDF2_ITERATIONS si
 * trop lent sur les mobiles d'observateurs (cibles : Android low-end).
 */
export async function deriveSessionKey(
    password: string,
    salt: Uint8Array,
): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey'],
    );
    // Copie le sel dans un ArrayBuffer dédié (TS 5.9 strict : Web Crypto
    // exige un ArrayBuffer<ArrayBuffer>, pas Uint8Array<ArrayBufferLike>).
    const saltBuffer = new ArrayBuffer(salt.byteLength);
    new Uint8Array(saltBuffer).set(salt);
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,                    // non-extractable
        ['encrypt', 'decrypt'],
    );
}

// ============================================================
// Chiffrement / Déchiffrement de strings
// ============================================================

/**
 * encryptString chiffre une chaîne avec AES-GCM. Un IV frais est tiré
 * pour chaque appel — NE JAMAIS réutiliser un IV avec la même clé.
 */
export async function encryptString(plaintext: string, key: CryptoKey): Promise<EncryptedData> {
    const ivBytes = generateIV();
    const ivBuffer = new ArrayBuffer(ivBytes.byteLength);
    new Uint8Array(ivBuffer).set(ivBytes);

    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        encoder.encode(plaintext),
    );
    return {
        iv: arrayBufferToBase64(ivBuffer),
        ciphertext: arrayBufferToBase64(ciphertext),
    };
}

/**
 * decryptString déchiffre une chaîne. Lance une exception si :
 *   - la clé est incorrecte (mauvais mot de passe),
 *   - les données ont été altérées (tag GCM invalide),
 *   - l'IV a été modifié.
 * L'appelant doit traiter ces erreurs comme "session expirée → re-login".
 */
export async function decryptString(data: EncryptedData, key: CryptoKey): Promise<string> {
    const iv = base64ToArrayBuffer(data.iv);
    const ciphertext = base64ToArrayBuffer(data.ciphertext);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
    );
    return new TextDecoder().decode(plaintext);
}

// ============================================================
// Chiffrement / Déchiffrement de bytes (photos)
// ============================================================

/**
 * encryptBytes chiffre des bytes bruts (Blob, ArrayBuffer).
 * Utilisé pour les photos — taille d'entrée potentiellement > 5 MB.
 */
export async function encryptBytes(data: ArrayBuffer | Uint8Array, key: CryptoKey): Promise<EncryptedData> {
    const ivBytes = generateIV();
    const ivBuffer = new ArrayBuffer(ivBytes.byteLength);
    new Uint8Array(ivBuffer).set(ivBytes);

    // Normalise en ArrayBuffer dédié.
    const dataBuffer = data instanceof ArrayBuffer
        ? data
        : (() => { const b = new ArrayBuffer(data.byteLength); new Uint8Array(b).set(data); return b; })();

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        dataBuffer,
    );
    return {
        iv: arrayBufferToBase64(ivBuffer),
        ciphertext: arrayBufferToBase64(ciphertext),
    };
}

/**
 * decryptBytes déchiffre vers un ArrayBuffer (à convertir en Blob ensuite).
 */
export async function decryptBytes(data: EncryptedData, key: CryptoKey): Promise<ArrayBuffer> {
    const iv = base64ToArrayBuffer(data.iv);
    const ciphertext = base64ToArrayBuffer(data.ciphertext);
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
    );
}

// ============================================================
// Utilitaires de conversion
// ============================================================

export function bytesToBase64(bytes: Uint8Array): string {
    return arrayBufferToBase64(bytes);
}

export function base64ToBytes(base64: string): Uint8Array {
    return new Uint8Array(base64ToArrayBuffer(base64));
}

export function saltToBase64(salt: Uint8Array): string {
    return arrayBufferToBase64(salt);
}

export function base64ToSalt(base64: string): Uint8Array {
    const buf = base64ToArrayBuffer(base64);
    return new Uint8Array(buf);
}