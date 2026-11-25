# Programarea pe blocuri în WebCoder — Blockly ȘI Scratch

> Directivă owner (2026-10-30): platforma livrează **ambele** motoare de blocuri — Blockly *și* Scratch — nu unul sau altul. Blockly e puntea structurată spre codul tipizat; Scratch e stratul de familiaritate (pisica Scratch, scena, say/answer) pentru cei mai mici învățăcei. Acest document este ghidul complet al amândurora: arhitectură, integrarea cu evaluatorul, authoring, învățare, predare, testare, securitate, troubleshooting și exemple lucrate. E scris astfel încât un contributor nou să poată extinde sistemul fără să citească mai întâi codul. Acesta este rezumatul executiv al ghidului; ghidul tehnic complet, în engleză, este [`docs/guide-en/BLOCK-PROGRAMMING.md`](../guide-en/BLOCK-PROGRAMMING.md).

---

## 1. Ce s-a livrat, pe scurt

O problemă poate fi o **problemă cu blocuri**. Creatorul alege un *motor* de blocuri per problemă:

- **Blockly** (`block_config.engine: 'blockly'`, implicit) — editor Blockly cu un toolbox curat de WebCoder (input/control/logic/math/text/lists/variables), care **generează cod** (implicit Python) trimis evaluatorului exact ca o submissions obișnuită — verdict real, AC/WA, tot pipeline-ul;
- **Scratch** (`block_config.engine: 'scratch'`) — proiect Scratch (SB3) încărcat de elev; un **transpiler** îl transformă în Python înainte de evaluare (transpile doar pentru evaluare — proiectul rămâne sursa de adevăr).

Ambele motoare folosesc aceeași structură `block_config` pe problemă, același editor parțial cu regiuni blocate (PartialCodeEditor) și aceleași limite ale evaluatorului.

## 2. De ce ambele

- **Blockly** pregătește structura tipizată: variabile, condiții, bucle — pasul natural spre Python/C++.
- **Scratch** aduce familiaritatea: elevii de gimnaziu știu deja scena și pisica; teama dispare.
- Profesorul alege per problemă; curriculumul Scratch→Python (cursul-punte din `/courses`) folosește ambele.

## 3. Fluxul elevului

1. Deschide o problemă cu blocuri → editorul de blocuri înlocuiește editorul de text (picker-ul de limbaj dispare).
2. Construiește programul prin tragere de blocuri; toolbox-ul e curat per problemă (creatorul poate restriciona categoriile).
3. **Trimite** — codul generat (Blockly) sau transpilat (Scratch) merge prin pipeline-ul normal de evaluare; UI-ul face polling până la verdictul final (specificația real-stack e2e acoperă integral acest flux).
4. Vederea verdictului arată același tabel per test ca la problemele obișnuite.

## 4. Fluxul profesorului/creatorului

- La authoring, tabul de blocuri din wizard setează motorul, generatorul (limbajul-țintă pentru Blockly) și toolbox-ul;
- problemele cu cod parțial (regiuni blocate + regiuni de completat) funcționează în ambele motoare — "completează bucla lipsă";
- suita de teste se definește identic (input/expected per test).

## 5. Detalii tehnice (rezumat)

- `Problem.block_config` (JSON): `engine`, `generator`, `toolbox` (lista de categorii), opțional `starter` (programul de start) și `locked_regions` pentru cod parțial;
- generarea Blockly: blocuri → cod sursă pe client, trimis ca `code` obișnuit (limbajul = generatorul);
- transpilarea Scratch: `problems/scratch_transpiler.py` (server-side, deterministic);
- securitate: nimic din config nu execută cod pe server; tot ce rulează trece prin sandbox-ul normal al evaluatorului.

Verificați ghidul EN pentru arhitectura completă, exemplele lucrate, matricea de testare și troubleshooting-ul (571 de linii de detail).

## 6. Testare

- unit: vitest pe generatoare și pe transpiler;
- e2e mock: payload-ul submission-ului generat din blocuri;
- e2e real-stack (`E2E_API_BASE`): round-trip complet cu verdicte evaluate prin polling — problema demo „E2E Blockly Real Last Digit".

## 7. Probleme frecvente

| Simptom | Cauză probabilă |
|---|---|
| Editorul de blocuri nu apare | problema nu are `block_config`; verifică tabul de blocuri din wizard |
| Codul generat nu compilează | generatorul nu corespunde limbajului problemei (setează `generator`) |
| Proiectul Scratch e respins | SB3 invalid sau blocuri netranspilabile; vezi lista de susținere din ghidul EN |
