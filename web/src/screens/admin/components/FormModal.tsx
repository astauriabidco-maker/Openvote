/**
 * FormModal — modal générique contenant un <form>. Gère le backdrop, les
 * raccourcis clavier (Escape = onClose ; Cmd+Enter / Ctrl+Enter = submit)
 * et l'état "submitting" (spinner + disable). Le form ne se ferme PAS
 * automatiquement : c'est à l'appelant de décider (souvent après un
 * await onSubmit réussi).
 *
 * Utilisation typique :
 *
 *   <FormModal
 *       open={createOpen}
 *       title="Nouveau scrutin"
 *       onClose={() => setCreateOpen(false)}
 *       onSubmit={handleCreateElection}
 *       submitLabel="Créer"
 *       submitting={creating}
 *   >
 *       <div className="form-group">
 *           <label>Nom du scrutin</label>
 *           <input className="admin-input" ... />
 *       </div>
 *   </FormModal>
 *
 * Note d'impl : les children sont rendus tels quels (children-as-field),
 * pas de magic — l'appelant garde la pleine maîtrise du DOM. Le composant
 * ne fait que fournir le chrome (overlay, titre, footer avec bouton submit).
 *
 * Note d'impl sur le clavier : le raccourci Cmd+Enter est branché sur
 * `window` (pour fonctionner même si le focus est dans un input), donc
 * on ne peut PAS utiliser `e.currentTarget` pour remonter au DOM — ce
 * serait `window`, qui n'a pas de méthode `closest()`. On utilise un
 * `useRef<HTMLDivElement>` sur la div de contenu pour localiser le form.
 */

import { useEffect, useRef } from 'react';

export interface FormModalProps {
    open: boolean;
    title: string;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void | Promise<void>;
    submitLabel?: string;
    cancelLabel?: string;
    submitDisabled?: boolean;
    submitting?: boolean;
    children: React.ReactNode;
}

export default function FormModal({
    open,
    title,
    onClose,
    onSubmit,
    submitLabel = 'Enregistrer',
    cancelLabel = 'Annuler',
    submitDisabled = false,
    submitting = false,
    children,
}: FormModalProps) {
    // Ref sur la div de contenu du dialog, pour retrouver le <form> depuis
    // le keydown handler attaché à `window` (où `e.currentTarget === window`
    // et n'a pas de méthode `closest()`).
    const dialogRef = useRef<HTMLDivElement | null>(null);

    // Cmd+Enter (Mac) / Ctrl+Enter (Win/Linux) = submit programmatique.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                // On remonte au <form> via le ref attaché à la div du dialog.
                // Pas via `e.currentTarget` : ce serait `window`, et
                // `window.closest(...)` lève une TypeError.
                const form = dialogRef.current?.querySelector('form');
                if (form instanceof HTMLFormElement) {
                    form.requestSubmit();
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const isDisabled = submitDisabled || submitting;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-modal-title"
            onClick={onClose}
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
                ref={dialogRef}
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(135deg, #161b22, #0d1117)',
                    border: '1px solid rgba(48,54,61,0.8)',
                    borderRadius: 14,
                    padding: '24px 28px',
                    maxWidth: 540,
                    width: '100%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 18,
                    }}
                >
                    <h2
                        id="form-modal-title"
                        style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        aria-label="Fermer"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            padding: '2px 8px',
                            borderRadius: 6,
                        }}
                    >
                        ✕
                    </button>
                </div>
                <form
                    onSubmit={onSubmit}
                    style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                >
                    {children}
                    <div
                        style={{
                            display: 'flex',
                            gap: 10,
                            justifyContent: 'flex-end',
                            marginTop: 8,
                            paddingTop: 14,
                            borderTop: '1px solid rgba(48,54,61,0.5)',
                        }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-primary)',
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                opacity: submitting ? 0.6 : 1,
                                fontSize: '0.85rem',
                                fontWeight: 600,
                            }}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            type="submit"
                            disabled={isDisabled}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: '1px solid rgba(88,166,255,0.6)',
                                background: isDisabled
                                    ? 'rgba(88,166,255,0.25)'
                                    : 'linear-gradient(135deg, #1f6feb, #58a6ff)',
                                color: '#fff',
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            {submitting && (
                                <span
                                    style={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        border: '2px solid rgba(255,255,255,0.4)',
                                        borderTopColor: '#fff',
                                        animation: 'confirm-spin 800ms linear infinite',
                                    }}
                                />
                            )}
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
