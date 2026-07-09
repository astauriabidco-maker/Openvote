/**
 * Composant Pagination réutilisable
 *
 * Affiche : ‹ Page X / Y (N items) ›
 * Avec boutons précédent/suivant désactivés aux bornes.
 *
 * Utilisé par les onglets admin qui paginent côté serveur (users, audit logs).
 */

interface PaginationProps {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    onPageChange: (newPage: number) => void;
    isLoading?: boolean;
}

export default function Pagination({
    page,
    limit,
    total,
    totalPages,
    onPageChange,
    isLoading = false,
}: PaginationProps) {
    if (totalPages <= 1) {
        // Pas de pagination à afficher si tout tient sur une page.
        // On affiche quand même le compteur d'items pour transparence.
        return (
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '12px',
                    color: '#8b949e',
                    fontSize: '0.78rem',
                }}
            >
                {total} élément{total > 1 ? 's' : ''}
            </div>
        );
    }

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
                fontSize: '0.78rem',
                color: '#8b949e',
                gap: '12px',
                flexWrap: 'wrap',
            }}
        >
            <span>
                {start}–{end} sur <strong style={{ color: '#e6edf3' }}>{total}</strong>
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                    type="button"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1 || isLoading}
                    style={paginationButtonStyle(page > 1 && !isLoading)}
                >
                    ◀ Précédent
                </button>

                <span style={{ color: '#e6edf3', fontWeight: 600, minWidth: 70, textAlign: 'center' }}>
                    Page {page} / {totalPages}
                </span>

                <button
                    type="button"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages || isLoading}
                    style={paginationButtonStyle(page < totalPages && !isLoading)}
                >
                    Suivant ▶
                </button>
            </div>
        </div>
    );
}

function paginationButtonStyle(enabled: boolean): React.CSSProperties {
    return {
        padding: '6px 12px',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: enabled ? 'rgba(56,139,253,0.15)' : 'rgba(255,255,255,0.03)',
        color: enabled ? '#58a6ff' : '#484f58',
        cursor: enabled ? 'pointer' : 'not-allowed',
        fontSize: '0.75rem',
        fontWeight: 600,
        transition: 'all 0.15s',
    };
}