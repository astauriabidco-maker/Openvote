/**
 * Openvote — types partagés pour les réponses API paginées.
 *
 * Le backend (cf. M5 audit) renvoie systématiquement :
 * {
 *     "items": [...],
 *     "pagination": { "page": 1, "limit": 50, "total": 250, "total_pages": 5 }
 * }
 *
 * Ce module expose le type + un helper pour construire des query strings.
 */

export interface ApiPagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

export interface PaginatedResponse<T> {
    items: T[];
    pagination: ApiPagination;
}

/**
 * Construit la query string de pagination : "?page=N&limit=M".
 * Utilisé par les hooks qui fetchent des listes paginées.
 */
export function paginationQuery(page: number, limit: number): string {
    return `?page=${page}&limit=${limit}`;
}