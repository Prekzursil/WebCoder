# Store listing package — Google Play + App Store (RO / EN)

Everything an owner needs to paste into Play Console / App Store Connect.
Store policy requires a public privacy-policy URL — the web app ships
`/privacy` (this wave extends it to cover the mobile apps explicitly).

## App identity (both stores)

| Field | Value |
|---|---|
| App name | WebCoder (both locales; ≤30 chars) |
| Android package / iOS bundle | `ro.webcoder.app` |
| Category | Education (secondary: Productivity) |
| Content rating | IARC questionnaire answers below → **Everyone / 4+** |
| Price | Free, no in-app purchases, no ads |

---

## Google Play listing — EN

- **Title (≤30):** WebCoder — Algorithms & Contests
- **Short description (≤80):** Solve programming problems, join contests, and climb the leaderboard — 14 languages, instant judging.
- **Full description (≤4000):**
  WebCoder is a competitive-programming platform for learners and contest
  athletes. Write real code in C, C++, Python, Java, C#, Go, and more —
  submitted to a secure sandbox judge with per-test feedback in seconds.

  PRACTICE
  • Hundreds of RO/EN problems with samples, limits, and editorials
  • Partial-code challenges: fill in the marked regions, the rest is locked
  • Per-language time and memory limits, shown before you submit
  • Custom invocation: run your code on your own input

  COMPETE
  • IOI-style contests with live scoreboards and freeze
  • Rated contests with a Codeforces-style rating ladder and handle colors
  • Virtual participation on finished contests

  COMMUNITY
  • Forum per problem with spoiler tags and voting
  • Community-written editorials and translations
  • Follow friends; friends-only leaderboards

  28 UI LANGUAGES
  • English, Română, and 26 more — the whole UI, not just menus
  • Problem statements in your language with English fallback
  • Help translate statements from inside the app

  FOR SCHOOLS
  • Classes with join codes, homework (teme), and gradebooks
  • Teachers see a live grid of every student's best score

- **Keywords are not a Play field** (Play uses the description) — keep the
  first line keyword-dense: "competitive programming, algorithms, contests,
  judge, olympiad, informatics, python, c++, learn to code".

## Google Play listing — RO

- **Titlu (≤30):** WebCoder — Algoritmi și Concursuri
- **Descriere scurtă (≤80):** Rezolvă probleme de programare, intră în concursuri și urcă în clasament — 14 limbaje, evaluare instant.
- **Descriere completă (≤4000):**
  WebCoder este o platformă de programare competitivă pentru elevi,
  studenți și pasionați. Scrii cod real în C, C++, Python, Java, C#, Go
  și altele — trimis către un evaluator securizat care îți arată
  rezultatul pe fiecare test, în câteva secunde.

  ANTRENAMENT
  • Sute de probleme RO/EN cu exemple, limite și editoriale
  • Probleme cu cod parțial: completezi doar zonele marcate
  • Limite de timp și memorie pe limbaj, afișate înainte de trimitere
  • Rulează codul pe propriile date de intrare

  CONCURSURI
  • Concursuri în stil IOI cu clasament live și înghețare
  • Concursuri rated, cu scară de rating și culori ca la Codeforces
  • Participare virtuală la concursurile terminate

  COMUNITATE
  • Forum pe probleme, cu spoiler-tag și votare
  • Editoriale și traduceri scrise de comunitate
  • Urmărești prietenii; clasament doar cu prietenii

  28 DE LIMBI PENTRU INTERFAȚA
  • Română, Engleză și încă 26 — toată interfața, nu doar meniurile
  • Enunțurile în limba ta, cu fallback pe engleză
  • Poți contribua la traduceri direct din aplicație

  PENTRU ȘCOLI
  • Clase cu cod de înscriere, teme și catalog
  • Profesorii văd live grila cu cel mai bun scor al fiecărui elev

## App Store listing — EN

- **Subtitle (≤30):** Judge · Contests · 28 languages
- **Description:** reuse the Play EN full description.
- **Keywords field (≤100 chars):**
  `algorithms,contest,programming,olympiad,informatics,python,cpp,judge,code,learn`
- **Promotional text (≤170):** Rated contests with a live scoreboard, a sandbox judge with per-test feedback, and a full UI in 28 languages.

## App Store listing — RO

- **Subtitlu (≤30):** Evaluator · Concursuri · 28 limbi
- **Descriere:** reutilizăm descrierea completă RO de pe Play.
- **Cuvinte-cheie (≤100):** `algoritmi,concurs,informatică,olimpiadă,piton,cpp,evaluator,cod,teme,programare`
- **Text promoțional (≤170):** Concursuri rated cu clasament live, evaluator în sandbox cu feedback pe fiecare test și interfață completă în 28 de limbi.

## Screenshots plan (both stores)

Required sets: 6–8 phone screenshots per locale listing (Play: EN + RO
mandatory; App Store: EN + RO localizations). Capture at 1080×2400 from
the Android emulator (`adb exec-out screencap -p > shot.png`) or the iOS
simulator (`xcrun simctl io booted screenshot shot.png`):

1. Home hub (signed in, unread badge visible)
2. Problem catalog with search + difficulty pills
3. Problem detail — statement in the store locale + limits card
4. Per-language effective-limits card (judge-fairness surface)
5. Submit screen — language picker + partial-code locked regions
6. Submission detail — verdict pill + per-test table
7. Leaderboard with rating colors
8. Settings — the grouped 28-language picker (key differentiator shot)

Feature graphic (Play, 1024×500): the `</>` brand mark on `#0f172a` with
the accent gradient (assets/icon.png is the source art).

## Content-rating answers (IARC / Play) — producing "Everyone"

| Question | Answer |
|---|---|
| Does the app share user-generated content? | Yes (forum posts, community editorials) — moderate: hide-at-threshold + report + mod queue shipped with the forum (roadmap SAF-1) |
| Does the app enable unrestricted online interaction? | Interaction is username-based; private messaging exists behind block/mute + moderation (COM-5 safety stack) |
| Violence / sexual content / gambling / drugs? | No to all |
| Does the app collect personal data? | Account data (username/email), submissions, and device language only — see `/privacy`; no ads SDKs, no third-party analytics |
| App Store age rating | 4+ (infrequent/mild: user-generated content in a moderated forum) |

## Data-safety form (Play) — quick answers

- Data collected: Email, User IDs, User content (submissions/posts) — account management + app functionality
- Data encrypted in transit: Yes (HTTPS to the API)
- Users can request deletion: Yes (in-app account deletion endpoint `POST /users/me/delete/` exists on the platform)
- No data shared with third parties; no ads; no analytics SDKs

## Store policy prerequisites (owner checklist)

- Privacy policy URL: `https://<web-domain>/privacy` (page exists; extended this wave for mobile)
- Support email: the owner address used for the stores
- App content: content-rating questionnaire answers above
- Play: app access credentials (demo login bob/… only on the demo stack — for the production listing create a demo account or record a video instead)
