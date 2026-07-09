#!/usr/bin/env bash
# ============================================================
# Openvote — pre-commit hook : gitleaks
# ============================================================
# Bloque le commit si gitleaks détecte un secret dans les fichiers
# staged (modifiés ou ajoutés). Bypass possible avec --no-verify,
# mais le CI rattrapera de toute façon (cf. .github/workflows/gitleaks.yml).
#
# Ce hook est un miroir de la CI : même config, mêmes règles.
# ============================================================

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

# Couleurs (désactivées si pas TTY)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

echo -e "${YELLOW}[gitleaks] Scan des fichiers staged...${NC}"

# Récupère la liste des fichiers staged (Added/Modified/Copied)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
    echo -e "${GREEN}[gitleaks] Aucun fichier à scanner, on laisse passer.${NC}"
    exit 0
fi

# Lance gitleaks sur les fichiers staged uniquement (plus rapide).
# --staged : scan ciblé sur l'index
# --config : utilise la config Openvote
# --no-banner : silence le logo
# Exit code 1 = au moins un secret détecté
if gitleaks protect \
    --staged \
    --config="$REPO_ROOT/.gitleaks.toml" \
    --no-banner \
    --redact \
    --verbose 2>&1; then
    echo -e "${GREEN}[gitleaks] OK — aucun secret détecté.${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  COMMIT BLOQUÉ — secret(s) détecté(s) par gitleaks         ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Corrigez les secrets ci-dessus avant de committer."
    echo "Si c'est un faux positif documenté, ajoutez le chemin à .gitleaks.toml"
    echo "OU (en dernier recours) utilisez : git commit --no-verify"
    echo ""
    exit 1
fi