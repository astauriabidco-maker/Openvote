#!/usr/bin/env bash
# ============================================================
# Openvote — installation des hooks git locaux
# ============================================================
# Installe le hook pre-commit qui lance gitleaks sur les fichiers
# modifiés. Idempotent : peut être ré-exécuté sans risque.
#
# Usage :
#   ./scripts/install-hooks.sh
#
# Pré-requis :
#   - gitleaks installé (brew install gitleaks)
# ============================================================

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_SRC="$REPO_ROOT/scripts/pre-commit-gitleaks.sh"
HOOK_DST="$REPO_ROOT/.git/hooks/pre-commit"

# Garde-fou : refuse de s'exécuter hors d'un repo git
if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "ERREUR : pas de repo git détecté dans $REPO_ROOT" >&2
    exit 1
fi

# Vérifie que gitleaks est disponible
if ! command -v gitleaks >/dev/null 2>&1; then
    echo "ERREUR : gitleaks introuvable." >&2
    echo "        Installez-le avec : brew install gitleaks" >&2
    exit 1
fi

# Crée le dossier .git/hooks si manquant (en principe déjà présent)
mkdir -p "$REPO_ROOT/.git/hooks"

# Copie le hook
cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"

echo "✅ Hook pre-commit installé : $HOOK_DST"
echo "   gitleaks version : $(gitleaks version 2>&1 | head -1 || echo 'inconnue')"
echo ""
echo "Test : essayez de commit un fichier contenant un token factice,"
echo "       le commit doit être bloqué."