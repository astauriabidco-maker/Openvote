/**
 * Openvote — génération d'un rapport admin imprimable (PDF via print browser).
 *
 * Ouvre une nouvelle fenêtre avec un rapport HTML synthétique : KPIs
 * nationaux + tables users/elections/regions. L'utilisateur peut
 * imprimer en PDF via la dialog native du navigateur.
 *
 * Pourquoi une fonction utilitaire stateless et pas un hook :
 *   - Pas de state React, juste une transformation de données → string
 *   - Réutilisable depuis n'importe quel composant (DashboardTab,
 *     futur menu utilisateur, future API, etc.)
 *   - Testable en isolation (on vérifie le HTML généré)
 *
 * Pourquoi pas jsPDF/pdf-lib :
 *   - Bundle +200 KB
 *   - Le navigateur a déjà un export PDF natif via window.print()
 *   - L'utilisateur peut customiser (marges, headers, A4 vs Letter)
 *   - Pour un rapport simple, c'est suffisant
 */

export interface AdminReportData {
    kpis: {
        users: { total: number; by_role: Record<string, number> };
        reports: { total: number };
        elections: { total: number };
    } | null;
    users: Array<{ username: string; role: string; region_id: string; created_at: string }>;
    elections: Array<{ name: string; type: string; status: string; date: string }>;
    regions: Array<{ code: string; name: string; dept_count: number }>;
}

const REPORT_CSS = `
  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
  h1 { color: #1a73e8; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; }
  h2 { margin-top: 30px; color: #555; }
  .stat { display: inline-block; margin: 10px 20px; text-align: center; }
  .stat-value { font-size: 2rem; font-weight: bold; }
  .stat-label { font-size: 0.9rem; color: #666; }
`;

/**
 * Ouvre une nouvelle fenêtre avec le rapport imprimable. Si window.open
 * est bloqué (popup blocker), no-op silencieux. Le caller peut vérifier
 * le retour s'il a besoin de feedback.
 */
export function exportAdminReport(data: AdminReportData): boolean {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;

    const content = `<!doctype html>
      <html><head><title>Openvote — Rapport Admin</title>
      <style>${REPORT_CSS}</style></head><body>
      <h1>🇨🇲 Openvote — Rapport Administratif</h1>
      <p>Généré le ${new Date().toLocaleString('fr-FR')}</p>
      ${data.kpis ? `<div>
        <div class="stat"><div class="stat-value">${data.kpis.users.total}</div><div class="stat-label">Utilisateurs</div></div>
        <div class="stat"><div class="stat-value">${data.kpis.reports.total}</div><div class="stat-label">Signalements</div></div>
        <div class="stat"><div class="stat-value">${data.kpis.elections.total}</div><div class="stat-label">Scrutins</div></div>
      </div>` : ''}
      <h2>Utilisateurs (${data.users.length})</h2>
      <table><tr><th>Nom</th><th>Rôle</th><th>Région</th><th>Créé</th></tr>
      ${data.users.map((u) => `<tr><td>${u.username}</td><td>${u.role}</td><td>${u.region_id || '—'}</td><td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td></tr>`).join('')}
      </table>
      <h2>Scrutins (${data.elections.length})</h2>
      <table><tr><th>Nom</th><th>Type</th><th>Statut</th><th>Date</th></tr>
      ${data.elections.map((e) => `<tr><td>${e.name}</td><td>${e.type}</td><td>${e.status}</td><td>${new Date(e.date).toLocaleDateString('fr-FR')}</td></tr>`).join('')}
      </table>
      <h2>Régions (${data.regions.length})</h2>
      <table><tr><th>Code</th><th>Région</th><th>Départements</th></tr>
      ${data.regions.map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${r.dept_count}</td></tr>`).join('')}
      </table>
      </body></html>`;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
    return true;
}
