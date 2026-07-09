import { useState, useEffect, useRef } from 'react';
import { saveReportOffline, getPendingReports, syncPendingReports, deleteReport, setupAutoSync, type DecryptedReport } from './offlineManager';

const API_URL = 'http://localhost:8095/api/v1';

const INCIDENT_TYPES = [
    { value: 'fraud', label: '🔴 Fraude électorale', color: '#f85149' },
    { value: 'violence', label: '🟠 Violence / Intimidation', color: '#db6d28' },
    { value: 'irregularity', label: '🟡 Irrégularité procédurale', color: '#d29922' },
    { value: 'vote_buying', label: '💰 Achat de votes', color: '#f0883e' },
    { value: 'obstruction', label: '🚫 Obstruction d\'observateurs', color: '#da3633' },
    { value: 'equipment', label: '🛠️ Problème matériel', color: '#8b949e' },
    { value: 'delay', label: '⏰ Retard d\'ouverture / fermeture', color: '#58a6ff' },
    { value: 'counting', label: '📊 Anomalie au décompte', color: '#bc8cff' },
    { value: 'other', label: '📝 Autre', color: '#8b949e' },
];

interface Props {
    token: string;
    isOnline: boolean;
    onReportSubmitted?: () => void;
}

export default function OfflineReportForm({ token, isOnline, onReportSubmitted }: Props) {
    const [type, setType] = useState('');
    const [description, setDescription] = useState('');
    const [locationName, setLocationName] = useState('');
    const [latitude, setLatitude] = useState(0);
    const [longitude, setLongitude] = useState(0);
    const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [photoData, setPhotoData] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [pendingReports, setPendingReports] = useState<DecryptedReport[]>([]);
    const [syncing, setSyncing] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [showPending, setShowPending] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [cameraActive, setCameraActive] = useState(false);

    // Setup auto-sync
    useEffect(() => {
        setupAutoSync(API_URL);
        loadPending();

        const handleSyncComplete = (e: any) => {
            const { synced, failed } = e.detail;
            showToast('success', `✅ ${synced} signalement(s) synchronisé(s)${failed > 0 ? `, ${failed} échoué(s)` : ''}`);
            loadPending();
        };
        document.addEventListener('openvote:sync-complete', handleSyncComplete);
        return () => document.removeEventListener('openvote:sync-complete', handleSyncComplete);
    }, []);

    const loadPending = async () => {
        try {
            const reports = await getPendingReports();
            setPendingReports(reports.filter(r => r.status !== 'synced'));
        } catch { /* IndexedDB not ready ou session verrouillée */ }
    };

    const showToast = (type: 'success' | 'error' | 'info', text: string) => {
        setToast({ type, text });
        setTimeout(() => setToast(null), 4000);
    };

    // Géolocalisation
    const getPosition = () => {
        if (!navigator.geolocation) {
            showToast('error', 'Géolocalisation non supportée');
            return;
        }
        setGpsStatus('loading');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLatitude(pos.coords.latitude);
                setLongitude(pos.coords.longitude);
                setGpsStatus('success');
                showToast('success', `📍 Position: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
            },
            (err) => {
                setGpsStatus('error');
                showToast('error', `GPS: ${err.message}`);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // Camera / Photo
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setCameraActive(true);
            }
        } catch {
            showToast('error', 'Impossible d\'accéder à la caméra');
        }
    };

    const takePhoto = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        const data = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoData(data);
        stopCamera();
    };

    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setPhotoData(reader.result as string);
        reader.readAsDataURL(file);
    };

    // Submit
    const handleSubmit = async () => {
        if (!type || !description) {
            showToast('error', 'Veuillez remplir le type et la description');
            return;
        }
        setSubmitting(true);

        if (isOnline) {
            // Try online first
            try {
                const formData = new FormData();
                formData.append('incident_type', type);
                formData.append('description', description);
                formData.append('latitude', String(latitude));
                formData.append('longitude', String(longitude));
                formData.append('location_name', locationName);
                if (photoData) {
                    const res = await fetch(photoData);
                    const blob = await res.blob();
                    formData.append('photo', blob, 'photo.jpg');
                }
                const response = await fetch(`${API_URL}/reports`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
                if (response.ok) {
                    showToast('success', '✅ Signalement envoyé avec succès !');
                    resetForm();
                    onReportSubmitted?.();
                    setSubmitting(false);
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            } catch {
                // Fall through to offline save
                showToast('info', '📡 Échec d\'envoi en ligne, sauvegarde locale...');
            }
        }

        // Save offline
        try {
            await saveReportOffline({
                incident_type: type,
                description,
                latitude,
                longitude,
                location_name: locationName,
                photo_data: photoData || undefined,
            });
            showToast('success', '💾 Signalement sauvegardé localement — sera synchronisé au retour en ligne');
            resetForm();
            loadPending();

            // Try background sync
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                const registration = await navigator.serviceWorker.ready;
                (registration as any).sync.register('sync-reports');
            }
        } catch (err) {
            showToast('error', 'Erreur de sauvegarde locale');
            console.error(err);
        }
        setSubmitting(false);
    };

    const resetForm = () => {
        setType('');
        setDescription('');
        setLocationName('');
        setPhotoData(null);
    };

    const handleSync = async () => {
        if (!isOnline) {
            showToast('error', 'Connexion requise pour la synchronisation');
            return;
        }
        setSyncing(true);
        try {
            const result = await syncPendingReports(API_URL);
            showToast('success', `✅ ${result.synced} synchronisé(s), ${result.failed} échoué(s)`);
            loadPending();
            if (result.synced > 0) onReportSubmitted?.();
        } catch {
            showToast('error', 'Erreur de synchronisation');
        }
        setSyncing(false);
    };

    const pendingCount = pendingReports.filter(r => r.status === 'pending' || r.status === 'failed').length;

    return (
        <div style={{ fontFamily: 'Inter,system-ui,sans-serif' }}>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 10002,
                    background: toast.type === 'success' ? '#238636' : toast.type === 'error' ? '#da3633' : '#388bfd',
                    color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '0.85rem',
                    fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: '360px',
                    animation: 'slideIn 0.3s ease',
                }}>
                    {toast.text}
                </div>
            )}

            {/* Form Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px',
            }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#e6edf3' }}>
                    📋 Nouveau Signalement
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: isOnline ? '#2ea043' : '#f85149',
                        boxShadow: isOnline ? '0 0 6px #2ea043' : '0 0 6px #f85149',
                    }} />
                    <span style={{ fontSize: '0.72rem', color: '#8b949e' }}>
                        {isOnline ? 'En ligne' : 'Hors ligne'}
                    </span>
                </div>
            </div>

            {/* Incident Type Grid */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: '#8b949e', marginBottom: '8px', display: 'block' }}>
                    Type d'incident *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {INCIDENT_TYPES.map(it => (
                        <button
                            key={it.value}
                            onClick={() => setType(it.value)}
                            style={{
                                padding: '10px 8px', borderRadius: '8px', border: '1px solid',
                                borderColor: type === it.value ? it.color : 'rgba(255,255,255,0.08)',
                                background: type === it.value ? `${it.color}18` : 'rgba(255,255,255,0.03)',
                                color: type === it.value ? it.color : '#8b949e',
                                cursor: 'pointer', fontSize: '0.72rem', fontWeight: type === it.value ? 700 : 500,
                                transition: 'all 0.15s', textAlign: 'center',
                            }}
                        >
                            {it.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: '#8b949e', marginBottom: '4px', display: 'block' }}>
                    Description détaillée *
                </label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez l'incident observé avec le maximum de détails (personnes impliquées, heure, circonstances)..."
                    rows={4}
                    style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)', color: '#e6edf3', fontSize: '0.85rem', resize: 'vertical',
                        fontFamily: 'Inter,system-ui,sans-serif',
                    }}
                />
            </div>

            {/* Location */}
            <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                <div>
                    <label style={{ fontSize: '0.78rem', color: '#8b949e', marginBottom: '4px', display: 'block' }}>
                        📍 Lieu (bureau de vote, localité)
                    </label>
                    <input
                        type="text"
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        placeholder="Ex: Bureau de vote n°15, École publique de Bonanjo"
                        style={{
                            width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.04)', color: '#e6edf3', fontSize: '0.82rem',
                        }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <button
                        onClick={getPosition}
                        disabled={gpsStatus === 'loading'}
                        style={{
                            padding: '8px 14px', borderRadius: '8px', border: 'none',
                            background: gpsStatus === 'success' ? '#238636' : gpsStatus === 'error' ? '#da3633' : '#388bfd',
                            color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                            opacity: gpsStatus === 'loading' ? 0.7 : 1, whiteSpace: 'nowrap',
                        }}
                    >
                        {gpsStatus === 'loading' ? '⏳ GPS...' :
                            gpsStatus === 'success' ? '✅ GPS OK' :
                                gpsStatus === 'error' ? '❌ Réessayer' : '📍 GPS'}
                    </button>
                </div>
            </div>

            {/* GPS Coordinates display */}
            {gpsStatus === 'success' && (
                <div style={{
                    marginBottom: '16px', padding: '8px 12px', borderRadius: '6px',
                    background: 'rgba(35,134,54,0.1)', border: '1px solid rgba(35,134,54,0.3)',
                    fontSize: '0.72rem', color: '#8b949e',
                }}>
                    📍 Lat: {latitude.toFixed(6)} | Lng: {longitude.toFixed(6)}
                </div>
            )}

            {/* Photo Section */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: '#8b949e', marginBottom: '8px', display: 'block' }}>
                    📷 Photo / Preuve (optionnel)
                </label>

                {!photoData && !cameraActive && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={startCamera} style={{
                            flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.03)', color: '#8b949e', cursor: 'pointer', fontSize: '0.82rem',
                        }}>
                            📸 Prendre une photo
                        </button>
                        <button onClick={() => fileInput.current?.click()} style={{
                            flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.03)', color: '#8b949e', cursor: 'pointer', fontSize: '0.82rem',
                        }}>
                            📁 Choisir un fichier
                        </button>
                        <input ref={fileInput} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                    </div>
                )}

                {cameraActive && (
                    <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
                        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '8px' }} />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button onClick={takePhoto} style={{
                                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                background: '#238636', color: '#fff', cursor: 'pointer', fontWeight: 600,
                            }}>📸 Capturer</button>
                            <button onClick={stopCamera} style={{
                                padding: '10px 16px', borderRadius: '8px', border: 'none',
                                background: '#da3633', color: '#fff', cursor: 'pointer', fontWeight: 600,
                            }}>✕</button>
                        </div>
                    </div>
                )}

                {photoData && (
                    <div style={{ position: 'relative' }}>
                        <img src={photoData} alt="Preuve" style={{
                            width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px',
                        }} />
                        <button
                            onClick={() => setPhotoData(null)}
                            style={{
                                position: 'absolute', top: '8px', right: '8px',
                                background: 'rgba(218,54,51,0.9)', color: '#fff', border: 'none',
                                borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 700,
                            }}
                        >✕</button>
                    </div>
                )}
            </div>

            {/* Submit Button */}
            <button
                onClick={handleSubmit}
                disabled={submitting || !type || !description}
                style={{
                    width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                    background: (!type || !description) ? '#21262d' :
                        isOnline ? 'linear-gradient(135deg, #238636, #2ea043)' : 'linear-gradient(135deg, #d29922, #f0883e)',
                    color: (!type || !description) ? '#484f58' : '#fff',
                    cursor: (!type || !description || submitting) ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem', fontWeight: 700, transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
            >
                {submitting ? '⏳ Envoi en cours...' :
                    isOnline ? '📡 Envoyer le Signalement' : '💾 Sauvegarder Hors-Ligne'}
            </button>

            {/* Pending Reports Section */}
            {pendingCount > 0 && (
                <div style={{ marginTop: '20px' }}>
                    <div
                        onClick={() => setShowPending(!showPending)}
                        style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '12px', borderRadius: '8px', cursor: 'pointer',
                            background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.3)',
                        }}
                    >
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#d29922' }}>
                            📋 {pendingCount} signalement{pendingCount > 1 ? 's' : ''} en attente de synchronisation
                        </span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isOnline && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleSync(); }}
                                    disabled={syncing}
                                    style={{
                                        padding: '6px 12px', borderRadius: '6px', border: 'none',
                                        background: '#238636', color: '#fff', cursor: 'pointer',
                                        fontSize: '0.75rem', fontWeight: 600, opacity: syncing ? 0.7 : 1,
                                    }}
                                >
                                    {syncing ? '⏳ Sync...' : '🔄 Synchroniser'}
                                </button>
                            )}
                            <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>{showPending ? '▲' : '▼'}</span>
                        </div>
                    </div>

                    {showPending && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {pendingReports.filter(r => r.status !== 'synced').map((report) => (
                                <div key={report.id} style={{
                                    padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)',
                                    background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: '10px',
                                }}>
                                    <span style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: report.status === 'pending' ? '#d29922' : report.status === 'syncing' ? '#388bfd' : '#da3633',
                                    }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e6edf3' }}>
                                            {INCIDENT_TYPES.find(t => t.value === report.incident_type)?.label || report.incident_type}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#8b949e', marginTop: '2px' }}>
                                            {new Date(report.created_at).toLocaleString('fr-FR')}
                                            {report.last_error && <span style={{ color: '#f85149' }}> — {report.last_error}</span>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { if (report.id) deleteReport(report.id).then(loadPending); }}
                                        style={{
                                            background: 'none', border: 'none', color: '#f85149',
                                            cursor: 'pointer', fontSize: '0.85rem', padding: '4px',
                                        }}
                                        title="Supprimer"
                                    >🗑️</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Offline Tips */}
            {!isOnline && (
                <div style={{
                    marginTop: '16px', padding: '12px', borderRadius: '8px',
                    background: 'rgba(56,139,253,0.06)', border: '1px solid rgba(56,139,253,0.2)',
                    fontSize: '0.72rem', color: '#8b949e', lineHeight: 1.5,
                }}>
                    💡 <strong>Mode hors-ligne :</strong> Votre signalement sera enregistré localement sur votre appareil et
                    <strong> automatiquement envoyé</strong> dès que vous retrouverez une connexion Internet.
                    Le GPS et la caméra restent disponibles même sans réseau.
                </div>
            )}
        </div>
    );
}
