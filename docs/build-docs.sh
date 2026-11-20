#!/usr/bin/env bash
# POSIX twin of docs/build-docs.ps1 (same outputs; for non-Windows
# contributors — CI runs the .ps1 on the owner box, this script keeps the
# pipeline reproducible anywhere pandoc + tectonic exist).
set -euo pipefail

DOCS="$(cd "$(dirname "$0")" && pwd)"
PANDOC="${PANDOC:-pandoc}"
TECTONIC="${TECTONIC:-tectonic}"

build() { # $1 guide id, $2 lang, $3 source
    local guide="$1" lang="$2" src="$3"
    local out="$DOCS/dist/$guide/$lang"
    mkdir -p "$out"
    "$PANDOC" "$DOCS/$src" --from gfm \
        --resource-path "$DOCS:$DOCS/guide-en:$DOCS/guide-ro" \
        --toc --toc-depth=2 --standalone -o "$out/$guide.docx"
    "$PANDOC" "$DOCS/$src" --from gfm \
        --resource-path "$DOCS:$DOCS/guide-en:$DOCS/guide-ro" \
        --toc --toc-depth=2 --standalone -o "$out/$guide.tex"
    ( cd "$out" && "$TECTONIC" "$guide.tex" )
    echo "built $guide/$lang"
}

build ARCHITECTURE      en guide-en/ARCHITECTURE.md
build ARCHITECTURE      ro guide-ro/ARHITECTURA.md
build CONTRIBUTING      en guide-en/CONTRIBUTING.md
build CONTRIBUTING      ro guide-ro/CONTRIBUIE.md
build USER-GUIDE        en guide-en/USER-GUIDE.md
build USER-GUIDE        ro guide-ro/GHID-UTILIZATOR.md
build TEACHER-GUIDE     en guide-en/TEACHER-GUIDE.md
build TEACHER-GUIDE     ro guide-ro/GHID-PROFESOR.md
build ADMIN-GUIDE       en guide-en/ADMIN-GUIDE.md
build ADMIN-GUIDE       ro guide-ro/GHID-ADMIN.md
build SECURITY          en guide-en/SECURITY.md
build SECURITY          ro guide-ro/SECURITATE.md
build BLOCK-PROGRAMMING en guide-en/BLOCK-PROGRAMMING.md
build BLOCK-PROGRAMMING ro guide-ro/PROGRAMARE-PE-BLOC.md

echo "done -> $DOCS/dist"
