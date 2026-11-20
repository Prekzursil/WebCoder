# WebCoder documentation builder — regenerates every output format from the
# .md sources (owner directive: .md canonical + .pdf (tectonic) + .docx +
# .tex source, artifacts committed under docs/dist/).
#
# Usage:  pwsh docs/build-docs.ps1          (or powershell -File docs/build-docs.ps1)
# Requires: pandoc (3.x) and tectonic on PATH or at the locations below.

$ErrorActionPreference = "Stop"

$Pandoc = "C:/Users/Prekzursil/AppData/Local/Pandoc/pandoc"
if (-not (Test-Path $Pandoc)) { $Pandoc = "pandoc" }
$Tectonic = "C:/Users/Prekzursil/scoop/shims/tectonic.exe"
if (-not (Test-Path $Tectonic)) { $Tectonic = "tectonic" }

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $PSScriptRoot "dist"

# guide id -> @{ en = <source>; ro = <source> }
$Guides = [ordered]@{
    'ARCHITECTURE'    = @{ en = "guide-en/ARCHITECTURE.md";     ro = "guide-ro/ARHITECTURA.md" }
    'CONTRIBUTING'    = @{ en = "guide-en/CONTRIBUTING.md";     ro = "guide-ro/CONTRIBUIE.md" }
    'USER-GUIDE'      = @{ en = "guide-en/USER-GUIDE.md";       ro = "guide-ro/GHID-UTILIZATOR.md" }
    'TEACHER-GUIDE'   = @{ en = "guide-en/TEACHER-GUIDE.md";    ro = "guide-ro/GHID-PROFESOR.md" }
    'ADMIN-GUIDE'     = @{ en = "guide-en/ADMIN-GUIDE.md";      ro = "guide-ro/GHID-ADMIN.md" }
    SECURITY        = @{ en = "guide-en/SECURITY.md";         ro = "guide-ro/SECURITATE.md" }
    'BLOCK-PROGRAMMING' = @{ en = "guide-en/BLOCK-PROGRAMMING.md"; ro = "guide-ro/PROGRAMARE-PE-BLOC.md" }
}

# Common pandoc options: GFM input, resolve diagram/screenshot links
# relative to docs/ so images embed into pdf/docx, and a sane TOC.
function Invoke-Pandoc {
    param($Source, $OutFile, $Format, $ExtraArgs)
    & $Pandoc $Source `
        --from gfm `
        --resource-path "$PSScriptRoot;$PSScriptRoot\guide-en;$PSScriptRoot\guide-ro" `
        --toc --toc-depth=2 `
        -o $OutFile @ExtraArgs
    if ($LASTEXITCODE -ne 0) { throw "pandoc failed: $Source -> $OutFile" }
}

New-Item -ItemType Directory -Force -Path $Dist | Out-Null

foreach ($guide in $Guides.Keys) {
    foreach ($lang in @("en", "ro")) {
        $src = Join-Path $PSScriptRoot $Guides[$guide][$lang]
        if (-not (Test-Path $src)) { throw "missing source: $src" }
        $outDir = Join-Path $Dist "$guide\$lang"
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null

        # DOCX (pandoc native)
        Invoke-Pandoc $src (Join-Path $outDir "$guide.docx") docx @("--standalone")

        # TEX source (pandoc -> latex; --extract-media copies diagrams/
        # screenshots next to the output so tectonic can find them)
        $tex = Join-Path $outDir "$guide.tex"
        Invoke-Pandoc $src $tex latex @("--standalone", "--extract-media=$outDir")

        # PDF via tectonic on the pandoc-generated TeX (XeTeX engine;
        # handles the Unicode RO diacritics reliably). Plain `tectonic
        # file.tex` writes file.pdf next to the source.
        # tectonic writes harmless notes to stderr (fontconfig lookup);
        # with EAP=Stop PowerShell turns those into terminating errors.
        Push-Location $outDir
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $Tectonic "$guide.tex" 2>&1 | Out-Null
        $ErrorActionPreference = $prevEap
        Pop-Location
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $outDir "$guide.pdf"))) {
            throw "tectonic failed: $guide ($lang)"
        }
        Write-Host "built $guide/$lang"
    }
}

Write-Host "done -> $Dist"
