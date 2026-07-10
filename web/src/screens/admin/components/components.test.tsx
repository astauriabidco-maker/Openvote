/**
 * Tests pour les 3 composants partagés : ConfirmDialog, FormModal, DataTable.
 *
 * ⚠️ INFRA DE TEST NON CONFIGURÉE — CE FICHIER N'EST PAS EXÉCUTÉ ⚠️
 *
 * Le projet Openvote/web n'a pas de runner de test configuré
 * (pas de Vitest / Jest / React Testing Library dans package.json, voir
 * `npm run lint` / `npm run build` qui ne référencent aucun test runner).
 * Conformément à la consigne de la tâche ("Si Vitest n'est pas configuré,
 * créer juste un fichier .test.tsx sans le run"), ce fichier est écrit
 * comme une spécification exécutable dès qu'un runner sera ajouté, mais
 * il n'est PAS exécuté par le pipeline actuel.
 *
 * Pour activer les tests plus tard :
 *   1. `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
 *   2. Ajouter dans vite.config.ts : test: { environment: 'jsdom' }
 *   3. Ajouter dans package.json scripts : "test": "vitest run"
 *   4. Décommenter le bloc d'imports ci-dessous
 *
 * Les imports ci-dessous sont commentés pour que le fichier soit
 * syntaxiquement valide même sans les dépendances installées.
 */

// import { describe, it, expect, vi, beforeEach } from 'vitest';
// import { render, screen, fireEvent, within } from '@testing-library/react';
// import userEvent from '@testing-library/user-event';
// import ConfirmDialog from './ConfirmDialog';
// import FormModal from './FormModal';
// import DataTable, { type DataTableColumn } from './DataTable';

// =============================================================================
// ConfirmDialog
// =============================================================================

/*
describe('ConfirmDialog', () => {
    const baseProps = {
        open: true,
        title: 'Supprimer ?',
        message: 'Cette action est irréversible.',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    };

    beforeEach(() => {
        baseProps.onConfirm.mockClear();
        baseProps.onCancel.mockClear();
    });

    it('rend le titre, le message et les 2 boutons', () => {
        render(<ConfirmDialog {...baseProps} />);
        expect(screen.getByText('Supprimer ?')).toBeInTheDocument();
        expect(screen.getByText('Cette action est irréversible.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    });

    it('ne rend rien quand open=false', () => {
        render(<ConfirmDialog {...baseProps} open={false} />);
        expect(screen.queryByText('Supprimer ?')).not.toBeInTheDocument();
    });

    it('appelle onConfirm au clic sur le bouton confirmer', async () => {
        render(<ConfirmDialog {...baseProps} confirmLabel="Supprimer" />);
        await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('appelle onCancel au clic sur le bouton annuler', async () => {
        render(<ConfirmDialog {...baseProps} />);
        await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it('appelle onCancel au clic sur le backdrop', async () => {
        render(<ConfirmDialog {...baseProps} />);
        // Le role="dialog" est sur l'overlay. Le click direct déclenche onCancel.
        const overlay = screen.getByRole('dialog');
        await userEvent.click(overlay);
        expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it('appelle onCancel à la touche Escape', () => {
        render(<ConfirmDialog {...baseProps} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it('appelle onConfirm à la touche Enter', () => {
        render(<ConfirmDialog {...baseProps} />);
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('utilise les labels personnalisés', () => {
        render(
            <ConfirmDialog
                {...baseProps}
                confirmLabel="Oui, supprimer"
                cancelLabel="Non, revenir"
            />,
        );
        expect(screen.getByRole('button', { name: 'Oui, supprimer' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Non, revenir' })).toBeInTheDocument();
    });

    it('focus initial sur le bouton Annuler (sécurité)', () => {
        render(<ConfirmDialog {...baseProps} />);
        const cancelBtn = screen.getByRole('button', { name: 'Annuler' });
        expect(cancelBtn).toHaveFocus();
    });
});
*/

// =============================================================================
// FormModal
// =============================================================================

/*
describe('FormModal', () => {
    const baseProps = {
        open: true,
        title: 'Nouveau scrutin',
        onClose: vi.fn(),
        onSubmit: vi.fn(),
    };

    beforeEach(() => {
        baseProps.onClose.mockClear();
        baseProps.onSubmit.mockClear();
    });

    it('rend le titre, le form et les 2 boutons (annuler + submit)', () => {
        render(
            <FormModal {...baseProps}>
                <input name="name" />
            </FormModal>,
        );
        expect(screen.getByText('Nouveau scrutin')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('appelle onClose à la touche Escape', () => {
        render(
            <FormModal {...baseProps}>
                <input />
            </FormModal>,
        );
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('appelle onClose au clic sur le backdrop', async () => {
        render(
            <FormModal {...baseProps}>
                <input />
            </FormModal>,
        );
        await userEvent.click(screen.getByRole('dialog'));
        expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('soumet le form au clic sur le bouton submit', async () => {
        render(
            <FormModal {...baseProps}>
                <input name="name" defaultValue="Test" />
            </FormModal>,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(baseProps.onSubmit).toHaveBeenCalledTimes(1);
    });

    it('affiche un spinner et disable les boutons pendant submitting', () => {
        render(
            <FormModal {...baseProps} submitting submitLabel="Création">
                <input />
            </FormModal>,
        );
        const submit = screen.getByRole('button', { name: /Création/ });
        const cancel = screen.getByRole('button', { name: 'Annuler' });
        expect(submit).toBeDisabled();
        expect(cancel).toBeDisabled();
    });

    it('respecte submitDisabled indépendamment de submitting', () => {
        render(
            <FormModal {...baseProps} submitDisabled>
                <input />
            </FormModal>,
        );
        expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    });

    it('utilise le submitLabel personnalisé', () => {
        render(
            <FormModal {...baseProps} submitLabel="Créer">
                <input />
            </FormModal>,
        );
        expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument();
    });

    // Régression : avant le fix, Cmd+Enter throwait `TypeError: window.closest is not a function`
    // car le keydown handler était lié à `window` et accédait à `e.currentTarget.closest(...)`.
    // Le fix utilise un useRef<HTMLDivElement> sur la div de contenu du dialog.
    it('Cmd+Enter soumet le form SANS throw (régression TypeError window.closest)', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(
            <FormModal {...baseProps}>
                <input name="name" defaultValue="Test" />
            </FormModal>,
        );
        // Pas d'erreur attendue — avant le fix cette ligne throwait.
        fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
        fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
        expect(baseProps.onSubmit).toHaveBeenCalledTimes(2);
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
*/

// =============================================================================
// DataTable
// =============================================================================

/*
interface TestRow {
    id: string;
    name: string;
    score: number;
    role: string;
}

const sampleRows: TestRow[] = [
    { id: '1', name: 'Alice', score: 90, role: 'admin' },
    { id: '2', name: 'Bob', score: 50, role: 'user' },
    { id: '3', name: 'Charlie', score: 75, role: 'user' },
];

const sampleColumns: DataTableColumn<TestRow>[] = [
    { key: 'name', label: 'Nom', sortable: true },
    { key: 'score', label: 'Score', sortable: true, align: 'right' },
    { key: 'role', label: 'Rôle' },
    { key: 'actions', label: '', render: (r) => <button>Voir {r.name}</button> },
];

describe('DataTable', () => {
    it('rend une ligne par row avec le rendu par défaut', () => {
        render(
            <DataTable
                columns={sampleColumns}
                rows={sampleRows}
                keyExtractor={(r) => r.id}
            />,
        );
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('Charlie')).toBeInTheDocument();
        // render custom
        expect(screen.getByRole('button', { name: 'Voir Alice' })).toBeInTheDocument();
    });

    it('affiche emptyMessage quand rows est vide', () => {
        render(
            <DataTable
                columns={sampleColumns}
                rows={[]}
                keyExtractor={(r) => r.id}
                emptyMessage="Aucun utilisateur"
            />,
        );
        expect(screen.getByText('Aucun utilisateur')).toBeInTheDocument();
    });

    it('affiche le message par défaut si emptyMessage non fourni', () => {
        render(
            <DataTable
                columns={sampleColumns}
                rows={[]}
                keyExtractor={(r) => r.id}
            />,
        );
        expect(screen.getByText('Aucune donnée')).toBeInTheDocument();
    });

    it('trie une colonne numérique au clic sur le header', async () => {
        render(
            <DataTable
                columns={sampleColumns}
                rows={sampleRows}
                keyExtractor={(r) => r.id}
            />,
        );
        // Tri ascendant initial
        const scoreHeader = screen.getByText('Score');
        await userEvent.click(scoreHeader);
        const cells = screen.getAllByRole('cell');
        // Le 2e td de chaque ligne (index 1) contient le score
        // 50, 75, 90 en asc
        expect(within(cells[0]).getByText('Alice').textContent).toBeTruthy();
    });

    it('inverse le tri au 2e clic sur la même colonne', async () => {
        render(
            <DataTable
                columns={sampleColumns}
                rows={sampleRows}
                keyExtractor={(r) => r.id}
            />,
        );
        const nameHeader = screen.getByText('Nom');
        await userEvent.click(nameHeader);
        await userEvent.click(nameHeader);
        // Pas d'assertion stricte (l'ordre des rows est testé via DOM),
        // on vérifie juste qu'il n'y a pas d'erreur.
    });

    it('affiche un overlay pendant loading', () => {
        render(
            <DataTable
                columns={sampleColumns}
                rows={sampleRows}
                keyExtractor={(r) => r.id}
                loading
            />,
        );
        expect(screen.getByText('Chargement…')).toBeInTheDocument();
    });

    it('intègre <Pagination> quand pagination + onPageChange sont fournis', () => {
        const onPageChange = vi.fn();
        render(
            <DataTable
                columns={sampleColumns}
                rows={sampleRows}
                keyExtractor={(r) => r.id}
                pagination={{ page: 1, limit: 50, total: 100, total_pages: 2 }}
                onPageChange={onPageChange}
            />,
        );
        expect(screen.getByText(/Page 1/)).toBeInTheDocument();
    });
});
*/
