/**
 * Openvote — composant racine.
 *
 * Responsable uniquement du routing auth :
 *   - Pas d'auth → LoginScreen
 *   - Auth → Dashboard (qui gère lui-même ses sous-vues map / analytics / admin)
 *
 * Le state partagé (auth, session chiffrement, listeners) reste ici
 * parce que c'est le seul endroit qui survit aux transitions entre écrans.
 *
 * Avant (cf. M2 audit) : ce fichier faisait 3200+ LOC et contenait :
 *   - Tous les types (AuthState, AdminUser, AuditLog, etc.)
 *   - Les constantes (API_URL, REGION_COORDS)
 *   - Les helpers (formatDate, getRoleBadge)
 *   - 3 composants monolithiques (LoginScreen, Dashboard, AdminPanel)
 *   - L'orchestration
 *
 * Après : chacun a son fichier dédié, App.tsx est ~60 lignes.
 */

import { useCallback, useEffect, useState } from 'react';
import './styles/index.css';
import { unlock, lock } from './session';
import { wipeAllReports } from './offlineManager';
import LoginScreen from './screens/LoginScreen';
import Dashboard from './screens/Dashboard';
import type { AuthState } from './types';

function App() {
    // Auth et clé de chiffrement sont en RAM uniquement (cf. H4 audit) :
    //   - Pas de sessionStorage / localStorage pour le token (avant : faible).
    //   - Recharger la page = re-login (clé de chiffrement perdue avec la closure).
    // C'est volontaire : un appareil saisi + extrait du navigateur ne doit
    // pas pouvoir être ré-utilisé sans le mot de passe de l'utilisateur.
    const [auth, setAuth] = useState<AuthState | null>(null);

    const handleLogin = async (authState: AuthState, password: string) => {
        // Dérive la clé de chiffrement (PBKDF2) avant de set l'auth state.
        // Si le sel ou la dérivation échoue, on reste sur le login screen.
        try {
            await unlock({
                password,
                username: authState.username,
                jwt: authState.token,
                role: authState.role,
            });
        } catch (err) {
            console.error('[App] unlock() a échoué :', err);
            // On continue quand même — l'utilisateur peut naviguer, mais les
            // opérations chiffrées échoueront jusqu'à ce qu'il se reconnecte.
        }
        setAuth(authState);
    };

    const handleLogout = useCallback(async () => {
        // Ordre important :
        //   1. Verrouiller la session (efface la clé en RAM).
        //   2. Wiper les rapports locaux chiffrés (devient inutile).
        //   3. Clear l'auth state.
        lock();
        try {
            await wipeAllReports();
        } catch (err) {
            console.warn('[App] wipeAllReports() a échoué :', err);
        }
        setAuth(null);
    }, []);

    // Auto-logout si la session est verrouillée par inactivité
    // (déclenché par session.ts après 15 min).
    useEffect(() => {
        const onLocked = () => {
            console.warn('[App] Session verrouillée par inactivité');
            setAuth(null);
        };
        window.addEventListener('openvote:session-locked', onLocked);
        return () => window.removeEventListener('openvote:session-locked', onLocked);
    }, []);

    if (!auth) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return <Dashboard auth={auth} onLogout={handleLogout} />;
}

export default App;