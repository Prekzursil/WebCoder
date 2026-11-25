# WebCoder — Ghidul profesorului

> Rezumat într-un paragraf: WebCoder oferă profesorilor bucla de clasă în stil pbinfo — clase cu auto-înscriere a elevilor, teme cu ferestre de publicare și expirare flexibilă, mod examen cu lockdown, seturi de grile din banca Bac, grile de progres per elev, hărți de greșeli, tabele de efort, fișe de evaluare și exporturi CSV/PDF — peste un evaluator bilingv real. Ghidul parcurge întregul flux de clasă.

**Cui se adresează:** profesori, coordonatori de cercuri, antrenori de olimpiadă județeană. Perechea în engleză: [`docs/guide-en/TEACHER-GUIDE.md`](../guide-en/TEACHER-GUIDE.md).

---

## 1. Obține rolul de TEACHER

Cere unui administrator să-ți upgrade contul la **TEACHER** (verificare pe email de școală / programul de parteneriate; `docs/RUNBOOK.md` §Wave C). Rolul deblochează `/teach`, crearea de clase, authoring-ul de teme și suprafețele de analytics.

## 2. Creează o clasă

1. `/teach` → **Clasă nouă** → numește-o (ex. „IX-A Informatică").
2. Primești un **cod de înscriere + parolă de înscriere**. Elevii se înscriu singuri din profil (modelul anti-abuz pbinfo — tu nu creezi niciodată conturi de elevi):
   - distribuie codul, elevii îl introduc pe `/classroom`;
   - sau distribuie **codul QR** (înscriere prietenoasă pe mobil);
   - există și import în masă pe listă de utilizatori (cei inexistenți sunt raportați).
3. Lista membrilor leagă profilurile publice și vederile de submissions scope-uite pe clasă.

## 3. Temele

Creează o temă pe o clasă:

- **probleme** alese individual, din capitole de curriculum sau din orice track într-un click („transformă acest track în temă");
- **fereastra de disponibilitate** (`disponibilă de la` → `termen limită`, opțional `până la întârziere`);
- opțional **mod examen**: cât un elev e într-o temă de examen, restul site-ului (forum, alte probleme, indicii) e blocat pentru el, cu politica de conduită/AI publicată;
- **seturi de grile** din banca Bacalaureat (filtra pe disciplină/clasa/an Bac, opțiune de amestecare).

Expirarea flexibilă (semanticile pbinfo): după deadline elevii pot trimite în continuare — acele submissions pur și simplu nu se numără pentru temă. Evaluatorul nu pedepsește învățarea; upsolving-ul devine repetiție.

## 4. Urmărește clasa

Tab-urile paginii clasei:

- **Grila** — matrice elevi × probleme cu scorul maxim / verdictul / încercările, agregate peste submissions-urile din fereastră; sertar per elev cu istoricul complet în clasă.
- **Insight** — heatmap-ul de greșeli al clasei (ce probleme blochează pe cine), rate de nereușită per problemă.
- **Tabela de efort** — clasament pe încercări + zile active + rezolvări (tabla „grind").
- **Fișa de evaluare** — PDF per elev: scorurile per problemă din fiecare temă, totaluri, marcaje de întârziere. Printabilă pentru catalogul electronic.
- **PDF de examen** — temele se exportă ca broșură printabilă cu enunțuri + puncte.

## 5. Exporturi și note

- catalog CSV (scorul maxim per problemă per elev + totaluri) pentru orice catalog extern;
- fișe de evaluare PDF per clasă;
- „descarcă toate soluțiile" per temă (cerința #1 a profesorilor pe orice evaluator) pentru review offline de plagiat (plus badge-urile consultative de similaritate ale platformei).

## 6. Arborele de curriculum

Axa de curriculum din `/problems` mapează programa națională (clasele 5–12 → capitole → subiecte) cu contoare de probleme per nod. Construirea temelor = alegerea capitolelor: filtrezi catalogul pe capitolul tău, selectezi, atribui. Arborele e dată versionată (o nouă ediție de programă adaugă o versiune de taxonomie, nu o migrație).

## 7. Organizează un concurs de clasă

Concursurile cu fereastră se potrivesc orarului școlar: o fereastră de câteva zile, fiecare elev primește o sesiune cronometrată (countdown personal). Creează-l din `/contests` (TEACHER/CREATOR pot crea concursuri private), atașează problemele clasei, distribuie înscrierea. Cu sau fără rating — fără rating e implicitul pentru runde de antrenament. Pagina de replay arată timeline-ul oricărui elev minut cu minut pentru analiza post-mortem.

## 8. Creează-ți propriile probleme

Conturile CREATOR/TEAVOR pot author-a:

- **wizard-ul vizual** în 7 pași (baze → limite → exemple → teste → soluție de referință → traducere → review), cu linter-ul de enunț și scorul de lizibilitate;
- teste ascunse prin DSL-ul de generatoare sau prin tabla de bounties (contribuția comunității se recompensează);
- import de pachete Polygon/Kattis (poartă de ledger-ul de permisiuni).

Orice problemă trece prin DRAFT → PENDING → APPROVED cu feedback de la verificator; authoring-ul ÎNSEAMNĂ dezvoltare profesională (pagina programului de contributori documentează specificațiile și șabloanele de feedback).

## 9. Certificări și parteneriate

- Certificarea profesorilor (pagina programului explică cerințele și examenul);
- parteneriate cu școli (șablon DPA în `docs/DPA-TEMPLATE.md`);
- prelucrarea datelor: datele de clasă urmează secțiunea GDPR din paginile legale; consimțământul minorilor e mediat de școală (conturi create de profesor sub baza legală a școlii) sau parental.

## 10. Întrebări frecvente

**Un elev a uitat parola** — resetare self-service pe email; fără email, contul mediat de școală e modelul robust.
**Pot vedea codul elevilor?** Da — vederi de submissions scope-uite pe clasă, per elev (grila le leagă).
**Ratingurile de concurs afectează notele?** Nu — ratingurile și scorurile temelor sunt sisteme separate; exporti ce ai nevoie.
