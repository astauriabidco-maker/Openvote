/**
 * Onglet RBAC — matrice des permissions par rôle.
 *
 * Pas de state propre ni de fetch : tout vient du constant RBAC_MATRIX.
 * Affichage purement présentationnel.
 *
 * TabHeader (refonte 2026-07) : utilise le composant partagé.
 */

import { RBAC_MATRIX, ROLE_LABELS } from '../constants';
import TabHeader from '../components/TabHeader';

export default function RbacTab() {
    return (
        <div className="admin-section">
            <TabHeader
                title="🔐 RBAC"
                subtitle="Matrice des permissions par rôle — source de vérité pour la sécurité de l'app."
            />
            <div className="admin-table-wrapper">
                <table className="admin-table rbac-table">
                    <thead>
                        <tr>
                            <th>Action</th>
                            {Object.values(ROLE_LABELS).map((label) => (
                                <th key={label}>{label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {RBAC_MATRIX.map((row) => (
                            <tr key={row.action}>
                                <td style={{ fontWeight: 600 }}>{row.action}</td>
                                <td style={{ textAlign: 'center' }}>{row.super_admin ? '✅' : '❌'}</td>
                                <td style={{ textAlign: 'center' }}>{row.region_admin ? '✅' : '❌'}</td>
                                <td style={{ textAlign: 'center' }}>{row.local_coord ? '✅' : '❌'}</td>
                                <td style={{ textAlign: 'center' }}>{row.observer ? '✅' : '❌'}</td>
                                <td style={{ textAlign: 'center' }}>{row.verified_citizen ? '✅' : '❌'}</td>
                                <td style={{ textAlign: 'center' }}>{row.citizen ? '✅' : '❌'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}