/**
 * Openvote — hook du shell UI de l'admin (chrome).
 *
 * Centralise tout ce qui n'est PAS de la logique métier d'un domaine :
 *   - Navigation entre onglets
 *   - Thème (dark/light) + persistance localStorage
 *   - Langue (fr/en) + persistance localStorage
 *   - Helper de traduction `t(key)`
 *   - Système de notifications (toast éphémère 4s)
 *   - PWA (online/offline + install banner + pending reports IndexedDB)
 *
 * Les 8 hooks de domaine (Users, Audit, Regions, etc.) sont indépendants
 * de ce hook — useAdminUI ne connaît que l'UI globale, pas les APIs.
 *
 * Pattern de composition : useAdminPanelState appelle useAdminUI en premier
 * et passe `notify` aux hooks de domaine. Aucun breaking change.
 */

import { useCallback, useEffect, useState } from 'react';
import type { TabKey } from '../constants';
import { TRANSLATIONS } from '../constants';

// ============================================================
// Types
// ============================================================

export type Theme = 'dark' | 'light';
export type Lang = 'fr' | 'en';
export type NotifyType = 'success' | 'error' | 'info';
export type NotifyFn = (type: NotifyType, text: string) => void;

export interface AdminUIState {
    // Navigation
    activeTab: TabKey;
    setActiveTab: (tab: TabKey) => void;

    // Thème + i18n
    theme: Theme;
    toggleTheme: () => void;
    lang: Lang;
    toggleLang: () => void;
    t: (key: string) => string;

    // Notifications (toast)
    notification: { type: NotifyType; text: string } | null;
    notify: NotifyFn;

    // PWA
    isOnline: boolean;
    showInstallBanner: boolean;
    setShowInstallBanner: (b: boolean) => void;
    pendingReportsCount: number;
}

// ============================================================
// Hook
// ============================================================

const NOTIFICATION_TIMEOUT_MS = 4000;
const PENDING_REPORTS_POLL_MS = 30_000;

export function useAdminUI(): AdminUIState {
    // ---- Navigation ----
    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

    // ---- Theme (persisté en localStorage) ----
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'dark';
        return (localStorage.getItem('openvote_theme') as Theme) || 'dark';
    });

    // ---- Lang (persisté en localStorage) ----
    const [lang, setLang] = useState<Lang>(() => {
        if (typeof window === 'undefined') return 'fr';
        return (localStorage.getItem('openvote_lang') as Lang) || 'fr';
    });

    // ---- i18n helper ----
    const t = useCallback(
        (key: string) => TRANSLATIONS[key]?.[lang] || key,
        [lang],
    );

    // ---- Theme toggle : persiste + applique le data-attribute ----
    const toggleTheme = useCallback(() => {
        setTheme((prev) => {
            const next: Theme = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('openvote_theme', next);
            document.documentElement.setAttribute('data-theme', next);
            return next;
        });
    }, []);

    // ---- Lang toggle : persiste ----
    const toggleLang = useCallback(() => {
        setLang((prev) => {
            const next: Lang = prev === 'fr' ? 'en' : 'fr';
            localStorage.setItem('openvote_lang', next);
            return next;
        });
    }, []);

    // ---- Apply theme on mount + when it changes ----
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // ---- Toast notifications (4s auto-dismiss) ----
    const [notification, setNotification] = useState<{ type: NotifyType; text: string } | null>(null);
    const notify = useCallback<NotifyFn>((type, text) => {
        setNotification({ type, text });
        setTimeout(() => setNotification(null), NOTIFICATION_TIMEOUT_MS);
    }, []);

    // ---- PWA : online/offline + install banner ----
    const [isOnline, setIsOnline] = useState<boolean>(
        typeof navigator !== 'undefined' ? navigator.onLine : true,
    );
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const [pendingReportsCount, setPendingReportsCount] = useState(0);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        const handleInstallable = () => setShowInstallBanner(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        document.addEventListener('openvote:installable', handleInstallable);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            document.removeEventListener('openvote:installable', handleInstallable);
        };
    }, []);

    // ---- Pending reports count (IndexedDB poll) ----
    useEffect(() => {
        const checkPending = () => {
            try {
                const req = indexedDB.open('openvote-offline', 1);
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        if (!db.objectStoreNames.contains('pending-reports')) return;
                        const tx = db.transaction('pending-reports', 'readonly');
                        const count = tx.objectStore('pending-reports').count();
                        count.onsuccess = () => setPendingReportsCount(count.result);
                    } catch {
                        // store absent (v2 DB) — silent
                    }
                };
            } catch {
                // IndexedDB not available — silent
            }
        };
        checkPending();
        const interval = setInterval(checkPending, PENDING_REPORTS_POLL_MS);
        return () => clearInterval(interval);
    }, []);

    return {
        activeTab, setActiveTab,
        theme, toggleTheme,
        lang, toggleLang,
        t,
        notification, notify,
        isOnline, showInstallBanner, setShowInstallBanner,
        pendingReportsCount,
    };
}