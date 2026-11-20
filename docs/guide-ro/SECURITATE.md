# WebCoder — Ghidul de securitate

> Rezumat într-un paragraf: Postura de securitate a WebCoder stă pe cinci piloni — un sandbox de evaluare izolat, atins doar printr-un proxy Docker de filtrare, autentificare pe cookie-uri httpOnly cu rotire și CSRF, limite de rate stratificate pe fiecare cale de scriere, un sistem de moderare/raportare cu audit trail și securitate operațională onestă (backupuri, exerciții de restore, throttle-uri publicate, chitanțe de sandbox). Ghidul documentează fiecare control, unde locuiește în cod și cum îl verifici.

**Cui se adresează:** operatori, reviewer-i de securitate, profesori/părinți care întreabă „cum rulează codul elevului meu?". Perechea în engleză: [`docs/guide-en/SECURITY.md`](../guide-en/SECURITY.md).

---

## 1. Sandbox-ul evaluatorului (cod neverificat)

Orice execuție judecată rulează în containerul `judge-runner` cu:

- `--network none` — fără rețea în timpul compilării sau execuției (verificat în CI);
- mount read-only al submissionului (scriibil doar prin calea orchestrată `/srv/judge`);
- toate capabilitățile Linux eliminate, `no-new-privileges`, uid 1000, limite de memorie/CPU/PID;
- limite de timp wall+CPU și max-RSS per test, persistate ca chitanțe pe fiecare rând de rezultat.

Worker-ul ajunge la daemon prin **socket-proxy** (tecnativa/docker-socket-proxy) care acordă doar containers/exec POST (+ping/version): `docker run hello-world` din backend răspunde 403; `docker exec webcoder-judge-runner id` reușește. Smoke-ul de acceptare e în RUNBOOK §socket-proxy.

**Biblioteci custom** (python3 `custom_libraries_allowed`): pip install-ul rulează într-un container one-shot pe o rețea internă al cărei unic egress e un proxy allowlist PyPI pre-populat; liniile de cerință trebuie să se potrivească cu `nume` / `nume==versiune` (git+/URL-uri/căi → 400 la submit). Postura implicită e fail-closed.

**Chitanțele de sandbox** — `/sandbox-receipts` (orientat spre utilizator): limitele și rezultatele fiecărei rulări scratch/stress, auditabile.

## 2. Autentificarea și sesiunile

- JWT access (5 min) + refresh (24 h) stau în **cookie-uri httpOnly** (`wc_access`, `wc_refresh`, SameSite=Lax în dev / None+Secure cross-site); rotirea blacklistează refresh-ul anterior; logout-ul blacklistează; nimic de forma token nu atinge `localStorage`.
- Metodele unsafe cer header-ul CSRF double-submit (`GET /api/v1/auth/csrf/` eliberează cookie-ul).
- Înregistrarea nu poate auto-atribui roluri (kill-ul B1); schimbările de rol sunt doar de admin.
- 2FA (TOTP) pentru rolurile privilegiată — enforce-ment progresiv prin `TWO_FACTOR_ENFORCE`.
- Token-uri API personale pentru API-ul public read-only (revocabile; tier de throttle mai ridicat).
- Resetarea parolei prin token-uri single-use, conștiente de email; providerii OAuth cu scope minim (GitHub `user,user:email` în profilul de produs).

## 3. Limitarea ratei ( suprafața de abuz și DoS)

Pe redis, partajată între procese (env-urile `THROTTLE_*`):

| Scope | Implicit |
|---|---|
| baza anonimă | 60/min |
| baza autentificată | 240/min |
| auth (login/înregistrare) | 10/min |
| creare submission | 20/oră |
| scratch / guest try-it / sample-run | capuri proprii (guest 5/h per IP) |
| API public | 60/min (240/min cu token) |
| propuneri de traducere | 10/h |

## 4. Siguranța conținutului și a comunității

- Butoane de raportare pe postări, mesaje, probleme; coadă de moderare cu tracking de SLA și audit trail; proces de apeluri.
- Mesageria: raportare per mesaj, filtru de conținut RO+EN de tip marcare-nu-blocare, blocări end-to-end, capace de trimitere (30/h, 10 thread-uri/h), politica de contact cu minorii, transcripturi vizibile doar la raportare.
- Enforce-ment spoiler server-side în thread-urile de problemă; ascundere-la-prag cu comutator; vot ponderat cu încredere.
- Minorii (GDPR Art. 8, România 16+): profiluri ne-publice implicit, județ/școală ascunse, înregistrarea consimțământului parental, înscriere mediată de școală.

## 5. Protecția datelor

- GDPR: endpoint de export de date, soft-delete + purgare programată, notificare de cookie-uri, paginile `/terms` + `/privacy`, șablon DPA pentru școli (`docs/DPA-TEMPLATE.md`).
- Outputurile per test: outputurile actual/expected ale testelor ascunse se strip-ează pentru privitorii neprivilegiați; datele demo sunt publice prin design; task-ul de retenție golește outputurile vechi după 90 de zile (verdictele/timpurile se păstrează mereu).
- Backupuri: sidecar `pg_dump -Fc` zilnic cu retenție 7z/4s/6l; copia în afara hostului e decizie de operator; procedura de restore + verificare cu accepțiune pe contoarele de rânduri.

## 6. Securitate operațională

- Secrete: compose-ul e fail-loud (`${SECRET_KEY?err}`); profilul de produs (`webcoder_api.settings_prod`) e deny-all până se setează `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS`; HSTS, cookie-uri secure, SSL redirect, referrer policy, nosniff.
- Postura de dependențe: Dependabot + CodeQL + configurare OSV scanner în repo.
- Observabilitate: `/healthz` (liveness) + `/readyz` (db/cache/broker), loguri JSON, metrici de admin.
- Contact de incident: `/security` documentează raportarea; pagina de bug-bounty formalizează scope-ul.

## 7. Cum verifici afirmațiile

```bash
# izolarea de rețea a sandbox-ului
docker exec webcoder-judge-runner python -c "import urllib.request;urllib.request.urlopen('http://p.org')"   # trebuie să eșueze

# socket-proxy refuză container-create
docker compose exec backend docker -H tcp://socket-proxy:2375 run --rm hello-world   # 403

# un submission judecat rămâne AC (load smoke cu round-trip real)
python scripts/load_smoke.py --base http://127.0.0.1:8010 --judge

# exercițiul de restore
scripts/restore-drill.sh
```

Context arhitectural complet: [`ARHITECTURA.md`](ARHITECTURA.md). Runbook operațional: `docs/RUNBOOK.md`.
