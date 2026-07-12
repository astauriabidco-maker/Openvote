/**
 * Onglet RBAC — matrice des permissions par rôle.
 *
 * Pas de state propre ni de fetch : tout vient du constant RBAC_MATRIX.
 * Affichage purement présentationnel.
 *
 * TabHeader (refonte 2026-07) : utilise le composant partagé.
 * KPIBand (refonte 2026-07) : 3 tuiles synthétisant la matrice
 * (rôles × actions × privilèges cumulés). Lecture statique.
 */

import { RBAC_MATRIX, ROLES, ROLE_LABELS } from '../constants';
import TabHeader, { KPIBand } from '../components/TabHeader';

export default function RbacTab() {
    // Privilèges cumulés : nombre de ✅ dans la matrice. Lecture seule,
    // sert juste à donner un chiffre "vivant" dans la KPI band.
    const totalGrants = RBAC_MATRIX.reduce<number>((acc, row) => {
        return acc + ROLES.filter((r) => row[r as keyof typeof row] === true).length;
    }, 0);
    const totalCells = RBAC_MATRIX.length * ROLES.length;

    return (
        <div className="admin-section">
            <TabHeader
                title="🔐 RBAC"
                subtitle="Matrice des permissions par rôle — source de vérité pour la sécurité de l'app."
            >
                <KPIBand items={[
                    { label: 'Rôles', value: ROLES.length, valueColor: '#58a6ff' },
                    { label: 'Actions', value: RBAC_MATRIX.length, valueColor: '#a371f7' },
                    {
                        label: 'Privilèges cumulés',
                        value: `${totalGrants} / ${totalCells}`,
                        delta: `${Math.round((totalGrants / totalCells) * 100)}% des cellules actives`,
                        trend: 'neutral',
                    },
                ]} />
            </TabHeader>
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