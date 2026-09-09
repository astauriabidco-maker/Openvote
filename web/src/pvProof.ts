import type { PVResultInput } from './offlineManager';

export interface PVProofInput {
    election_id: string;
    polling_station_id: string;
    registered_voters: number;
    voters_count: number;
    null_votes: number;
    blank_votes: number;
    disputed_votes: number;
    pv_hash: string;
    client_recorded_at: string;
    device_latitude: number;
    device_longitude: number;
    device_id: string;
    results: PVResultInput[];
}

export interface PVProofManifest extends PVProofInput {
    proof_manifest_version: 1;
    results: Array<{ candidate_id: string; votes: number }>;
}

export interface DeviceCoordinates {
    latitude: number;
    longitude: number;
}

export async function sha256Hex(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input);
    return sha256HexBytes(bytes);
}

export async function sha256HexBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
    const source = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer;
    const digest = await crypto.subtle.digest('SHA-256', source);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export function buildPVProofManifest(input: PVProofInput): PVProofManifest {
    return {
        proof_manifest_version: 1,
        election_id: input.election_id,
        polling_station_id: input.polling_station_id,
        registered_voters: input.registered_voters,
        voters_count: input.voters_count,
        null_votes: input.null_votes,
        blank_votes: input.blank_votes,
        disputed_votes: input.disputed_votes,
        pv_hash: input.pv_hash,
        client_recorded_at: input.client_recorded_at,
    device_latitude: input.device_latitude,
    device_longitude: input.device_longitude,
    device_id: input.device_id,
    results: input.results
            .map((result) => ({ candidate_id: result.candidate_id, votes: result.votes }))
            .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)),
    };
}

const DEVICE_ID_KEY = 'openvote_pv_device_id';
const DEVICE_KEY_PAIR_KEY = 'openvote_pv_device_keypair_v1';

interface StoredDeviceKeyPair {
    publicKeyJwk: JsonWebKey;
    privateKeyJwk: JsonWebKey;
}

function base64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function getOrCreateDeviceId(): string {
    const current = localStorage.getItem(DEVICE_ID_KEY);
    if (current) return current;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = `web-${base64Url(bytes)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
    );
}

async function ensureDeviceKeyPair(): Promise<{ publicKeyJwk: JsonWebKey; privateKey: CryptoKey }> {
    const stored = localStorage.getItem(DEVICE_KEY_PAIR_KEY);
    if (stored) {
        const parsed = JSON.parse(stored) as StoredDeviceKeyPair;
        return {
            publicKeyJwk: parsed.publicKeyJwk,
            privateKey: await importPrivateKey(parsed.privateKeyJwk),
        };
    }

    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    );
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    localStorage.setItem(DEVICE_KEY_PAIR_KEY, JSON.stringify({ publicKeyJwk, privateKeyJwk }));
    return { publicKeyJwk, privateKey: pair.privateKey };
}

export async function ensureDeviceKeyRegistered(apiClient: { post: (url: string, body: unknown) => Promise<unknown> }): Promise<string> {
    const deviceId = getOrCreateDeviceId();
    const { publicKeyJwk } = await ensureDeviceKeyPair();
    await apiClient.post('/device-keys', {
        device_id: deviceId,
        algorithm: 'ECDSA_P256_SHA256',
        public_key_jwk: publicKeyJwk,
    });
    return deviceId;
}

export async function signPVProofManifest(canonicalPayload: string): Promise<string> {
    const { privateKey } = await ensureDeviceKeyPair();
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(canonicalPayload),
    );
    return base64Url(new Uint8Array(signature));
}

export async function hashPVProofManifest(input: PVProofInput): Promise<string> {
    return sha256Hex(JSON.stringify(buildPVProofManifest(input)));
}

export async function readDeviceCoordinates(): Promise<DeviceCoordinates> {
    if (!('geolocation' in navigator)) {
        return { latitude: 0, longitude: 0 };
    }
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                latitude: Number(position.coords.latitude.toFixed(6)),
                longitude: Number(position.coords.longitude.toFixed(6)),
            }),
            () => resolve({ latitude: 0, longitude: 0 }),
            { enableHighAccuracy: true, maximumAge: 60_000, timeout: 5_000 },
        );
    });
}
