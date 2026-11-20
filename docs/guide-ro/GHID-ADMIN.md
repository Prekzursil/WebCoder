# WebCoder — Ghidul administratorului

> Rezumat într-un paragraf: Administratorii rulează motorul de conținut (cozi de curare, aprobări, rejudging, importuri) și motorul de siguranță (moderare, raportări cu SLA, apeluri, scanări de integritate), plus operațiunile platformei (status, backupuri, throttle-uri, curatorul-AI opțional). Ghidul acoperă fiecare suprafață de admin și comenzile de management din spatele ei.

**Cui se adresează:** administratorii de platformă și VERIFIER-i. Perechea în engleză: [`docs/guide-en/ADMIN-GUIDE.md`](../guide-en/ADMIN-GUIDE.md).

---

## 1. Dashboard-ul de admin

`/admin/dashboard` — contoare, plus tab-urile operaționale: browser-ul de submissions (filtru pe verdict, buton **Rejudge**), monitorul de submissions blocate (PENDING/COMPILING/RUNNING mai vechi de N minute), managementul utilizatorilor (schimbările de rol — singurul loc unde se mișcă rolurile) și snapshot-ul de metrici (`/api/v1/admin/metrics/`: adâncimea cozii, distribuția verdicturilor, statisticile de 24 h ale duratelor de evaluare).

## 2. Curarea conținutului

### Coada de aprobare

`/admin/problem-queue` listează problemele `status=PENDING` cu tot contextul de care are nevoie o evaluare:

- randarea enunțului + raportul linter-ului + scorul de lizibilitate + panoul de gap-uri de traducere;
- **rândul Tests** — perechile input/expected ale fiecărui test, fanionul demo, punctele, subtask-ul, bara per test, rata de prindere;
- **puterea suitei de teste** (`/problems/{id}/test-strength/`) — rata de prindere per test peste soluții cunoscut-ca-greșite, puterea suitei (excluzând exemplele), fanionul de necalibrare;
- aprobare/respingere cu feedback (notifică autorul; respingerile păstrează problema editabilă).

### Rejudge și integritate

- **Rejudge** (admin pe toată platforma; VERIFIER pe problemele proprii): resetează la PENDING și re-dispatch-ează prin lane-ul real al evaluatorului; rezultatele per test de la prima execuție se persistă, deci swap-urile rapide de scor sunt posibile.
- **Scanările de plagiat/boilerplate** — badge-uri consultative pentru review uman, niciodată pedeapsă automată; vederea diff side-by-side; euristicile de multi-cont pe IP-uri alimentează aceeași coadă.
- **Etichetarea soluțiilor-AI** — review post-concurs al declarațiilor + anomaliilor de tipar de rezolvare (vezi coada valului de integritate).

### Importuri și operații de catalog

Comenzi de management (rulate în containerul backend):

```bash
python manage.py seed_problems            # pachetul de start + curriculum + taguri
python manage.py boost_hidden_tests       # regenerează suite ascunse din specificațiile comise
python manage.py catalog_polish           # payload-ul de traduceri/igienă (idempotent)
python manage.py catalog_cleanup [--apply]  # resturi de fixture e2e/ad-hoc
python manage.py export_catalog           # snapshot determinist de fixture
python manage.py import_catalog           # rebuild (sau --from-release <tag>)
python manage.py calibrate_difficulty     # dificultate din ratele de AC (CNT-3)
```

Proveniența importurilor: ledger-ul CNT-2 `ImportSource` (sursă, contact, termeni, URL de dovadă) trebuie să aibă un rând înainte ca un import de corpus să fie legitim.

## 3. Moderarea

- **Coada de raportări**: fiecare buton de raportare (postări, mesaje, probleme, submissions) aterizează aici cu tracking de SLA; acțiuni: rezolvare/respingere cu notă.
- **Apeluri**: deciziile de moderare sunt apelabile; audit trail-ul înregistrează operatorul, acțiunea și nota.
- **Contact de abuz + pagina de bounty**: `/security` documentează fluxul de raportare; pagina de bug-bounty îl formalizează.
- **Filtrul de conținut** (mesagerie): filtru RO+EN de tip marcare-nu-blocare — mesajele marcate intră în coada de review, nu dispar silențios.
- Ascunderea-la-prag + votul ponderat cu încredere rulează automat (negativele mici randează 0; auto-hide cu comutator de afișare).

## 4. Curatorul-AI (opțional, IMPLICIT OPRIT)

Evaluează propunerile de traducere ale comunității (`/api/v1/translations/proposals/`). Configurare prin env (`AI_CURATOR_URL` = orice endpoint compatibil OpenAI; `AI_CURATOR_MODEL`; `AI_CURATOR_TIMEOUT_S` ≤ 30; `AI_CURATOR_AUTO_APPROVE=false` implicit). Politica: trecerile cu încredere ridicată intră în coada de confirmare umană; cea scăzută e marcată; timeout-urile/erorile marchează `ai_verdict=error` și cad în coada umană — fail-open, oamenii confirmă fiecare aprobare dacă auto-aprobarea nu e explicit pornită. Oricare server compatibil OpenAI funcționează (OpenAI, Azure, vLLM, Ollama…). Vezi RUNBOOK §ai-curator.

## 5. Operațiunile platformei

- **Pagina de status** (`/status`): adâncimea live a cozii, sănătatea evaluatorului; valul de ops a adăugat transparența cozii, scripturile de autoscale (`scripts/judge-autoscale.sh`) și harness-ul de load-test (`scripts/load_smoke.py --judge`, `e2e/loadtest/replay.mjs`).
- **Backupurile rulează implicit** (sidecar db-backup; RUNBOOK §Backups): declanșare manuală, listarea artefactelor, restore + verificare prin contoarele de rânduri din `/api/v1/users/admin/stats/`; script de exercițiu de restore trimestrial (`scripts/restore-drill.sh`).
- **Throttle-urile** sunt reglabile prin env (`THROTTLE_*`); pe redis.
- **Deploy blue-green** + poarta de capacitate pentru concursuri (`manage.py contest_replay --contest <id> --users 50`) preced orice prim concurs cu rating.
- **Email**: backend console implicit; setează `EMAIL_HOST` + SPF/DKIM/DMARC înainte de trimiteri reale (RUNBOOK §email).

## 6. Administrarea utilizatorilor

- Roluri: BASIC / CREATOR / TEACHER / VERIFIER / ADMIN — se schimbă doar din vederea de admin a utilizatorilor (înregistrarea nu poate auto-atribui roluri).
- 2FA: enforce-ment progresiv pentru rolurile privilegiată (`TWO_FACTOR_ENFORCE` trece de la avertizare la obligație).
- GDPR: export de date (`POST /users/me/export/`), soft-delete + purgare programată; profilurile minorilor ne-publice; datele de consimțământ parental.
- Certificate: `manage.py issue_certificates` (derivare idempotentă; `--notify` opțional); ledger de revocare pentru cazurile de integritate.

## 7. Rețete de incident

| Simptom | Primele mișcări |
|---|---|
| Submissions blocate în PENDING | monitorul de blocări → logurile worker-ului (`docker compose logs celery-worker`) → rejudge după fix |
| Verdict suspectat greșit | rejudge la submission; compară rândurile per test; vezi `problems/{id}/test-strength/` |
| Poluare de catalog după rulări e2e | `catalog_cleanup --apply --allow-submissions` (gardată pe conturi de probă) |
| Beat nu programează | `docker compose logs celery-beat` — flagul e `--schedule` (celery 5.x) |
| Backend blocat | `/healthz` vs `/readyz` disting liveness-ul de dependențe; restart-ul unless-stopped se auto-vindecă |
