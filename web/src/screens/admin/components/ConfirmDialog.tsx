/**
 * ConfirmDialog — remplace `window.confirm()` avec un design sobre aligné
 * sur le dark theme de l'admin (#0d1117, #161b22, #e6edf3, accents
 * #58a6ff / #3fb950 / #f85149).
 *
 * Comportement :
 *   - Escape = onCancel ; Enter = onConfirm
 *   - Backdrop cliquable = onCancel
 *   - Focus initial sur le bouton Annuler (sécurité : l'utilisateur ne doit
 *     pas pouvoir confirmer une suppression destructrice par accident)
 *   - Animation fade-in 200ms (keyframes inline, pas de dépendance CSS)
 *   - variant="danger" → bouton confirm en rouge (#f85149)
 *
 * Utilisation typique dans un hook (POC appliqué à useUsersTab) :
 *
 *   const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
 *
 *   const handleDeleteUser = async (id, name) => {
 *       setPendingDelete({ id, name });
 *   };
 *
 *   <ConfirmDialog
 *       open={!!pendingDelete}
 *       title="Supprimer l'utilisateur ?"
 *       message={`Cette action est irréversible. Supprimer "${pendingDelete?.name}" ?`}
 *       confirmLabel="Supprimer"
 *       variant="danger"
 *       onConfirm={async () => {
 *           if (!pendingDelete) return;
 *           try { await apiClient.delete(`/admin/users/${pendingDelete.id}`); ... }
 *           finally { setPendingDelete(null); }
 *       }}
 *       onCancel={() => setPendingDelete(null)}
 *   />
 */

import { useEffect, useRef } from 'react';

type Variant = 'primary' | 'danger';

export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: Variant;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    variant = 'primary',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const cancelRef = useRef<HTMLButtonElement | null>(null);

    // Auto-focus sur Annuler à l'ouverture + bind clavier Escape/Enter.
    useEffect(() => {
        if (!open) return;
        // Defer au prochain tick pour laisser le backdrop se monter.
        const t = window.setTimeout(() => cancelRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel, onConfirm]);

    if (!open) return null;

    const confirmStyle: React.CSSProperties =
        variant === 'danger'
            ? {
                  background: 'linear-gradient(135deg, #da3633, #f85149)',
                  color: '#fff',
                  border: '1px solid rgba(248,81,73,0.6)',
              }
            : {
                  background: 'linear-gradient(135deg, #1f6feb, #58a6ff)',
                  color: '#fff',
                  border: '1px solid rgba(88,166,255,0.6)',
              };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onClick={onCancel}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)',
                animation: 'confirm-fade-in 200ms ease',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(135deg, #161b22, #0d1117)',
                    border: '1px solid rgba(48,54,61,0.8)',
                    borderRadius: 14,
                    padding: '24px 28px',
                    maxWidth: 440,
                    width: '100%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                }}
            >
                <h2
                    id="confirm-dialog-title"
                    style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: '1.05rem' }}
                >
                    {title}
                </h2>
                <p
                    style={{
                        margin: '0 0 20px',
                        color: 'var(--text-secondary)',
                        fontSize: '0.88rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-line',
                    }}
                >
                    {message}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.04)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            ...confirmStyle,
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
