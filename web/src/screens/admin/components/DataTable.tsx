/**
 * DataTable — table générique typée avec tri client-side par colonne
 * (clic sur le header) et pagination optionnelle (intègre le composant
 * <Pagination> existant). Affiche un overlay sombre pendant `loading`,
 * et un message centré si `rows` est vide.
 *
 * Pourquoi un composant générique : les 12 onglets admin dupliquent tous
 * le même squelette <table class="admin-table"> + <thead> + <tbody> + map.
 * On garde la flexibilité via le `render` (cellule custom) et le `sortable`
 * par colonne. Le tri est client-side : si la pagination est server-side,
 * l'appelant n'a qu'à NE PAS activer le tri sur les colonnes paginées
 * (ou alors le tri devient cosmétique sur la page courante).
 *
 * Utilisation typique :
 *
 *   <DataTable
 *       columns={[
 *           { key: 'username', label: 'Utilisateur', sortable: true },
 *           { key: 'role', label: 'Rôle', render: (u) => <RoleBadge role={u.role} /> },
 *           { key: 'actions', label: '', render: (u) => <ActionButtons user={u} /> },
 *       ]}
 *       rows={users}
 *       keyExtractor={(u) => u.id}
 *       pagination={usersPagination}
 *       onPageChange={fetchUsers}
 *       loading={usersLoading}
 *       emptyMessage="Aucun utilisateur"
 *   />
 */

import { useMemo, useState } from 'react';
import Pagination from '../../../components/Pagination';
import type { ApiPagination } from '../../../apiTypes';

export interface DataTableColumn<T> {
    /** Clé d'accès au champ sur la ligne (utilisée pour le tri et le rendu par défaut). */
    key: string;
    /** Libellé affiché dans le header. */
    label: string;
    /** Active le tri client-side au clic sur le header. */
    sortable?: boolean;
    /** Rendu custom de la cellule. Si absent, affiche `row[key]`. */
    render?: (row: T) => React.ReactNode;
    /** Largeur optionnelle (CSS). */
    width?: string;
    /** Alignement horizontal du header et des cellules. */
    align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    /** Extrait la clé unique d'une ligne (utilisée pour `key={...}` et le tri stable). */
    keyExtractor: (row: T) => string;
    /** Pagination server-side optionnelle. Si fourni + onPageChange, intègre <Pagination>. */
    pagination?: ApiPagination;
    onPageChange?: (newPage: number) => void;
    /** Affiche un overlay sombre semi-transparent par-dessus la table. */
    loading?: boolean;
    /** Message centré quand `rows` est vide. */
    emptyMessage?: string;
    /** Libellé optionnel du compteur custom (sinon "X éléments"). */
    rowLabel?: string;
}

type SortDir = 'asc' | 'desc';

export default function DataTable<T>({
    columns,
    rows,
    keyExtractor,
    pagination,
    onPageChange,
    loading = false,
    emptyMessage = 'Aucune donnée',
    rowLabel = 'élément',
}: DataTableProps<T>) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const sortedRows = useMemo(() => {
        if (!sortKey) return rows;
        // Tri stable : on copie avant de sort pour ne pas muter la prop.
        const copy = [...rows];
        copy.sort((a, b) => {
            const av = (a as Record<string, unknown>)[sortKey];
            const bv = (b as Record<string, unknown>)[sortKey];
            // Comparaison robuste : null/undefined en queue.
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') {
                return sortDir === 'asc' ? av - bv : bv - av;
            }
            const aStr = String(av);
            const bStr = String(bv);
            return sortDir === 'asc'
                ? aStr.localeCompare(bStr, 'fr')
                : bStr.localeCompare(aStr, 'fr');
        });
        return copy;
    }, [rows, sortKey, sortDir]);

    const handleSort = (col: DataTableColumn<T>) => {
        if (!col.sortable) return;
        if (sortKey === col.key) {
            // Toggle direction ou reset si on reclique une 2e fois.
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(col.key);
            setSortDir('asc');
        }
    };

    const showPagination =
        pagination !== undefined && onPageChange !== undefined && pagination.total_pages > 0;

    return (
        <div
            style={{
                position: 'relative',
                background: 'var(--bg-secondary)',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
            }}
        >
            <div style={{ overflowX: 'auto' }}>
                <table
                    style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.82rem',
                    }}
                >
                    <thead>
                        <tr>
                            {columns.map((col) => {
                                const isSorted = sortKey === col.key;
                                const arrow = !col.sortable
                                    ? ''
                                    : isSorted
                                      ? sortDir === 'asc' ? ' ▲' : ' ▼'
                                      : ' ↕';
                                return (
                                    <th
                                        key={col.key}
                                        onClick={() => handleSort(col)}
                                        style={{
                                            padding: '10px 12px',
                                            textAlign: col.align ?? 'left',
                                            color: 'var(--text-primary)',
                                            fontWeight: 600,
                                            borderBottom: '1px solid var(--border-color)',
                                            background: 'rgba(255,255,255,0.02)',
                                            cursor: col.sortable ? 'pointer' : 'default',
                                            userSelect: 'none',
                                            width: col.width,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {col.label}
                                        {arrow && (
                                            <span style={{ color: 'var(--accent-color)', fontSize: '0.7rem' }}>
                                                {arrow}
                                            </span>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    style={{
                                        padding: '40px 16px',
                                        textAlign: 'center',
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            sortedRows.map((row) => (
                                <tr
                                    key={keyExtractor(row)}
                                    style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    }}
                                >
                                    {columns.map((col) => {
                                        const cell = col.render
                                            ? col.render(row)
                                            : ((row as Record<string, unknown>)[col.key] as React.ReactNode);
                                        return (
                                            <td
                                                key={col.key}
                                                style={{
                                                    padding: '10px 12px',
                                                    textAlign: col.align ?? 'left',
                                                    color: 'var(--text-primary)',
                                                }}
                                            >
                                                {cell ?? <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Compteur discret quand pas de pagination */}
            {!showPagination && sortedRows.length > 0 && (
                <div
                    style={{
                        padding: '10px 14px',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        textAlign: 'center',
                    }}
                >
                    {sortedRows.length} {rowLabel}{sortedRows.length > 1 ? 's' : ''}
                </div>
            )}

            {/* Pagination server-side (composant <Pagination> partagé) */}
            {showPagination && pagination && onPageChange && (
                <Pagination
                    page={pagination.page}
                    limit={pagination.limit}
                    total={pagination.total}
                    totalPages={pagination.total_pages}
                    onPageChange={onPageChange}
                    isLoading={loading}
                />
            )}

            {/* Overlay sombre pendant loading */}
            {loading && (
                <div
                    aria-busy="true"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(13,17,23,0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        gap: 10,
                        pointerEvents: 'none',
                    }}
                >
                    <span
                        style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            border: '2px solid rgba(88,166,255,0.3)',
                            borderTopColor: 'var(--accent-color)',
                            animation: 'confirm-spin 800ms linear infinite',
                        }}
                    />
                    Chargement…
                </div>
            )}
        </div>
    );
}
