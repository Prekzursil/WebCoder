// Pure (client-safe) i18n dictionary for the PUBLIC page group.
//
// Split out of public-i18n.ts (which also resolves the locale cookie via
// next/headers and is therefore server-only): Next.js App Router forbids
// passing functions from Server Components to Client Components, so client
// islands like ProblemsListClient receive only the serializable `locale`
// string and build their own translator with createTranslator() from this
// module.
//
// MESSAGES mirrors the shared client resources (src/i18n.ts) for every key
// the public server pages render, in both locales, so SSR output is
// locale-consistent with the hydrated client app. The catalog's
// `difficulty_${...}` / `status_${...}` badges are DELIBERATELY absent —
// they render the raw backend enum via the defaultValue fallback (pinned by
// page tests and e2e/problems.spec.ts).

export type PublicLocale = 'en' | 'ro';

// Exported for the i18n parity test ([Q1]) — pure serializable data, safe
// for any client/server import.
export const MESSAGES: Record<PublicLocale, Record<string, string>> = {
  en: {
    // Parity with the shared resources (src/i18n.ts en block) for every key
    // the public server pages render.
    welcome_message: 'Welcome to WebCoder',
    problem_list_header: 'Problems',
    homepage_subtitle: 'The ultimate platform for competitive programming.',
    homepage_description:
      'Sharpen your skills, solve challenging problems, and compete with a community of developers from around the world. Whether you are a beginner or an expert, WebCoder has something for you.',
    view_problems_button: 'View Problems',
    sign_up_button: 'Sign Up',
    problems_page_description:
      'Browse the public competitive programming problem catalog on WebCoder.',
    no_problems_available: 'No problems available at the moment.',
    not_found_default_header: '404 - Page Not Found',
    not_found_default_message:
      'The page you are looking for does not exist or you may not have permission to view it.',
    difficulty_label: 'Difficulty',
    time_limit_label: 'Time Limit',
    memory_limit_label: 'Memory Limit',
    problem_id_label: 'Problem ID',
    problem_not_found: 'Problem not found.',
    problem_statement_header: 'Problem Statement',
    sample_test_cases_header: 'Sample Test Cases',
    sample_input_label: 'Sample Input',
    sample_output_label: 'Sample Output',
    solve_problem_description: 'Solve this problem on WebCoder.',
    submit_solution_header: 'Submit Solution',
    // Catalog filter chrome [Q3 / F3]
    problems_load_error: 'Could not load problems: ',
    hide_solved_toggle: 'Hide solved',
    curriculum_label: 'Curriculum',
    tags_label: 'Tags',
    solved_column_th: 'Solved',
    solved_aria: 'Solved',
    attempted_aria: 'Attempted',
    not_attempted_aria: 'Not attempted',
    start_here_banner: 'New here? Start with three classic problems →',
    start_page_title: 'Start here — your first submission in 3 steps',
    start_page_description: 'A guided first hour on WebCoder: pick a classic starter, write code in the editor, and get judged instantly.',
    start_hero_title: 'New here? Solve your first problem in 10 minutes.',
    start_hero_subtitle: 'Three classic starters — one per idea. Write code, run it on your own input, submit, and read the hints if you get stuck.',
    start_step_pick_label: 'STEP 1',
    start_step_pick_title: 'Pick a starter',
    start_step_pick_body: 'One easy classic per paradigm — no prerequisites.',
    start_step_code_label: 'STEP 2',
    start_step_code_title: 'Write and test',
    start_step_code_body: 'Real editor with syntax highlighting; run custom input before submitting.',
    start_step_judged_label: 'STEP 3',
    start_step_judged_title: 'Get judged, learn',
    start_step_judged_body: 'Instant verdict with hints and an editorial once you solve it.',
    start_starter_badge: 'STARTER {{n}}',
    start_solve_now: 'Solve it now →',
    start_browse_all: 'Browse the full catalog',
    start_load_error: 'Could not load the starter problems: ',
    start_empty: 'No starters yet — the starter pack lands with the seed content.',
    terms_title: 'Terms of Service',
    support_title: 'Support WebCoder',
    support_intro:
      'The platform is free for students and teachers, and it stays that way. If it helps your class, your club or your olympiad preparation, here is how you can keep it running.',
    support_donate_title: 'Donate',
    support_donate_body:
      'WebCoder is free for students and teachers. Donations cover hosting, the judge infrastructure and the bilingual content work. Write to us and we will send the current donation channel — we publish a donor wall on request.',
    support_donate_cta: 'Email us about donating',
    support_sponsor_title: 'Sponsor a contest',
    support_sponsor_body:
      'Companies and organizations can sponsor a rated round or a school olympiad: your name and logo appear on the contest page and standings (attribution only — the contest stays free for everyone). Codeforces-style sponsor rounds are the sustainable model for a community judge.',
    support_sponsor_cta: 'Become a sponsor',
    support_school_title: 'Hosted school contests',
    support_school_body:
      'Schools and county olympiads can run private contests on WebCoder (windowed, personal timers, gradebook export). This is currently free while the platform is in its community phase; a paid hosting tier with an SLA is planned only after the legal and fiscal groundwork (invoicing, registration) exists.',
    support_school_cta: 'Talk to us about hosting',
    support_no_payments_note:
      'Note: this page processes no payments. Donation channels and any future paid hosting tier will launch with proper invoicing and legal terms — until then, everything on WebCoder is free.',
    terms_updated: 'Version 1.0 — updated October 2026',
    terms_accounts_title: 'Accounts',
    terms_accounts_body: 'You are responsible for your account and its activity. One account per person; sharing accounts or submitting on behalf of someone else is not allowed. Accounts of users under 16 require parental consent or school-mediated enrollment.',
    terms_conduct_title: 'Conduct',
    terms_conduct_body: 'No abuse: attacking the platform, attempting to read other users\' data, or circumventing judge limits. During rated contests, solutions must be your own work — see the contest rules published with each contest.',
    terms_content_title: 'Your content',
    terms_schools_title: 'Schools and data processing',
    terms_schools_body: "Schools using classes and teme can request our data-processing agreement template (docs/DPA-TEMPLATE.md) — classroom data is processed on the school's documented instructions, minors' profiles stay non-public by default.",
    terms_content_body: 'Code you submit stays yours; you grant the platform the non-exclusive right to display your submissions (e.g. post-solve solution browsing) and verify them for plagiarism. Editorial and forum text you write is licensed CC BY-SA 4.0 so the community can reuse and translate it with attribution.',
    terms_availability_title: 'Availability',
    terms_availability_body: 'The service is provided as-is. We run daily backups and test restores, but we do not guarantee uninterrupted availability; judge results may be re-evaluated if a defect is found.',
    privacy_title: 'Privacy Policy',
    privacy_updated: 'Version 1.0 — updated October 2026',
    privacy_what_title: 'What we store',
    privacy_what_body: 'Your account data (username, email, role), your submissions and their judge results, forum posts and votes, problem ratings and scratch runs. Everything is stored on our own infrastructure; we run no third-party analytics or advertising trackers.',
    privacy_cookies_title: 'Cookies',
    privacy_cookies_body: 'One session cookie pair (httpOnly access + refresh tokens) keeps you signed in — it is not readable by page scripts and expires with your session. There is no tracking cookie, ad cookie or social pixel.',
    privacy_rights_title: 'Your rights',
    privacy_rights_body: 'From your profile you can export all of your data as a downloadable JSON file, or delete your account: deletion deactivates it immediately, anonymizes your identity, and purges personal side content within 30 days. Judge history (verdicts and standings) is retained in anonymized form for the integrity of the public record.',
    privacy_minors_title: 'Minors',
    privacy_minors_body: 'Self-serve accounts require the information-society consent age (16 in Romania). Younger students join through school-mediated classroom enrollment under the school\'s lawful basis, with profiles non-public by default.',
    daily_problem_label: 'Problem of the day',
    editorial_header: 'Editorial',
    scratch_header: 'Custom Test',
    problems_search_placeholder: 'Search problems…',
    status_label: 'Status',
    all_option: 'All',
    clear_filters_button: '✕ Clear',
    showing_problems_info: 'Showing {{shown}} of {{total}} problem(s)',
    no_problems_match_filters: 'No problems match your filters.',
    sort_ascending: 'Sort ascending',
    sort_descending: 'Sort descending',
    // Problem detail polish [A1/A11/A18]
    problem_author_label: 'Author',
    tags_header: 'Tags',
    quick_links_header: 'Quick Links',
    quick_link_my_submissions: 'My Submissions',
    quick_link_submission_history: 'Submission History',
    quick_link_leaderboard: 'Leaderboard',
    quick_link_forum: 'Community Forum',
    example_label: 'Example {{n}}',
    empty_statement: 'No statement available.',
    copy_button: 'Copy',
    copied_label: 'Copied!',
    copy_link_button: 'Copy link',
    problem_type_interactive_badge: 'Interactive',
    problem_interactive_flush_notice: 'This problem is judged live by an interactive program: it reads your stdout and writes to your stdin — flush your output after every line.',
    previous_problem: 'Previous problem',
    next_problem: 'Next problem',
    error_loading_problem: 'Failed to load problem.',
    back_to_problems: 'Back to Problems',
    discuss_problem_title: 'Discuss this problem',
    discuss_problem_body: 'Ask for hints or share your approach in the community forum.',
    go_to_forum_button: 'Go to Forum →',
    // 404 [A14]
    not_found_code: '404',
    not_found_browse_problems: 'Browse Problems',
    not_found_go_home: 'Go Home',
    // Problem detail metadata line (parity with src/i18n.ts) [Q1]
    problem_form_allowed_languages: 'Allowed Languages',
    // Catalog pager (ProblemsListClient's translator reads MESSAGES) [Q1]
    loading_more: 'Loading…',
    load_more_problems: 'Load more problems',
    // Home page literals [Q4] — badge, stat labels and the FAQ (heading +
    // Q&A pairs). The FAQ <details> UI and the JSON-LD FAQPage schema are
    // both derived from these entries so visible copy and structured data
    // stay identical per locale.
    home_badge: '✦ Competitive Programming Platform',
    home_stat_problems: 'Problems',
    home_stat_languages: 'Languages',
    home_stat_judge: 'Judge',
    faq_heading: 'Frequently Asked Questions',
    faq_q1: 'What programming languages does WebCoder support?',
    faq_a1: 'WebCoder supports Python 3, C++17, and Java 11 for solution submissions.',
    faq_q2: 'Is WebCoder free to use?',
    faq_a2: 'Yes, WebCoder is completely free. Register an account and start solving problems immediately.',
    faq_q3: 'How does the online judge work?',
    faq_a3: 'You submit your solution code, and our judge compiles and runs it against hidden test cases. You receive a verdict (Accepted, Wrong Answer, Time Limit Exceeded, etc.) within seconds.',
    faq_q4: 'Can I create my own problems on WebCoder?',
    faq_a4: 'Yes. Users with the Problem Creator role can author problems, add test cases, and submit them for review by our verification team.',
  },
  ro: {
    // Parity with the shared resources (src/i18n.ts ro block).
    welcome_message: 'Bun venit la WebCoder',
    problem_list_header: 'Probleme',
    homepage_subtitle: 'Platforma definitivă pentru programare competitivă.',
    homepage_description:
      'Perfecționează-ți abilitățile, rezolvă probleme provocatoare și concurează alături de o comunitate de programatori din toată lumea. Fie că ești la început de drum sau expert, WebCoder are ceva pentru tine.',
    view_problems_button: 'Vezi Problemele',
    sign_up_button: 'Înscrie-te',
    problems_page_description:
      'Răsfoiește catalogul public de probleme de programare competitivă de pe WebCoder.',
    no_problems_available: 'Momentan nu sunt probleme disponibile.',
    not_found_default_header: '404 - Pagină Negăsită',
    not_found_default_message:
      'Pagina pe care o cauți nu există sau este posibil să nu ai permisiunea să o vezi.',
    difficulty_label: 'Dificultate',
    time_limit_label: 'Limită de timp',
    memory_limit_label: 'Limită de memorie',
    problem_id_label: 'ID-ul problemei',
    problem_not_found: 'Problema nu a fost găsită.',
    problem_statement_header: 'Enunțul Problemei',
    sample_test_cases_header: 'Exemple',
    sample_input_label: 'Intrare exemplu',
    sample_output_label: 'Ieșire exemplu',
    solve_problem_description: 'Rezolvă această problemă pe WebCoder.',
    submit_solution_header: 'Trimite o Soluție',
    // Catalog filter chrome [Q3 / F3]
    problems_load_error: 'Nu s-au putut încărca problemele: ',
    hide_solved_toggle: 'Ascunde rezolvatele',
    curriculum_label: 'Programă',
    tags_label: 'Etichete',
    solved_column_th: 'Rezolvat',
    solved_aria: 'Rezolvată',
    attempted_aria: 'Încercată',
    not_attempted_aria: 'Neîncercată',
    start_here_banner: 'Nou aici? Începe cu trei probleme clasice →',
    start_page_title: 'Începe aici — prima ta trimitere în 3 pași',
    start_page_description: 'O primă oră ghidată pe WebCoder: alege o problemă clasică, scrie cod în editor și primește verdictul instant.',
    start_hero_title: 'Nou aici? Rezolvă prima problemă în 10 minute.',
    start_hero_subtitle: 'Trei probleme clasice — una pentru fiecare idee. Scrie cod, rulează-l pe propriile date, trimite și citește indiciile dacă te blochezi.',
    start_step_pick_label: 'PASUL 1',
    start_step_pick_title: 'Alege o problemă',
    start_step_pick_body: 'O problemă clasică ușoară pentru fiecare paradigmă — fără cerințe prealabile.',
    start_step_code_label: 'PASUL 2',
    start_step_code_title: 'Scrie și testează',
    start_step_code_body: 'Editor real cu evidențierea sintaxei; rulează date personalizate înainte de trimitere.',
    start_step_judged_label: 'PASUL 3',
    start_step_judged_title: 'Primește verdictul, învață',
    start_step_judged_body: 'Verdict instant cu indicii și un editorial după ce o rezolvi.',
    start_starter_badge: 'STARTER {{n}}',
    start_solve_now: 'Rezolv-o acum →',
    start_browse_all: 'Explorează tot catalogul',
    start_load_error: 'Nu s-au putut încărca problemele de start: ',
    start_empty: 'Încă nu există probleme de start — pachetul de start vine odată cu conținutul introductiv.',
    terms_title: 'Termeni și condiții',
    support_title: 'Susține WebCoder',
    support_intro:
      'Platforma este gratuită pentru elevi și profesori și așa rămâne. Dacă te ajută la clasă, la cerc sau la pregătirea pentru olimpiadă, iată cum o poți ține în funcțiune.',
    support_donate_title: 'Donează',
    support_donate_body:
      'WebCoder este gratuit pentru elevi și profesori. Donațiile acoperă hostingul, infrastructura de evaluare și munca la conținutul bilingv. Scrie-ne și îți trimitem canalul de donații curent — publicăm un perete al donatorilor la cerere.',
    support_donate_cta: 'Scrie-ne despre o donație',
    support_sponsor_title: 'Sponsorizează un concurs',
    support_sponsor_body:
      'Companiile și organizațiile pot sponsoriza o rundă de concurs sau o olimpiadă școlară: numele și logo-ul tău apar pe pagina concursului și în clasament (doar atribuire — concursul rămâne gratuit pentru toți). Rundele sponsorizate, în stilul Codeforces, sunt modelul sustenabil pentru un evaluator comunitar.',
    support_sponsor_cta: 'Devino sponsor',
    support_school_title: 'Concursuri școlare găzduite',
    support_school_body:
      'Școlile și olimpiadele județene pot rula concursuri private pe WebCoder (cu fereastră, timere personale, export în catalog). Momentan este gratuit, cât timp platforma e în faza comunitară; un pachet de găzduire plătit cu SLA apare doar după ce există temeiul legal și fiscal (facturare, înregistrare).',
    support_school_cta: 'Vorbește cu noi despre găzduire',
    support_no_payments_note:
      'Notă: această pagină nu procesează plăți. Canalele de donații și orice viitor pachet plătit vor lansa cu facturare și termeni legali corecți — până atunci, totul pe WebCoder este gratuit.',
    terms_updated: 'Versiunea 1.0 — actualizată octombrie 2026',
    terms_accounts_title: 'Conturi',
    terms_accounts_body: 'Ești responsabil pentru contul și activitatea ta. Un cont pe persoană; partajarea conturilor sau trimiterea în numele altcuiva nu este permisă. Conturile utilizatorilor sub 16 ani necesită consimțământul părinților sau înscrierea mediată de școală.',
    terms_conduct_title: 'Conduită',
    terms_conduct_body: 'Fără abuz: atacarea platformei, încercarea de a citi datele altor utilizatori sau ocolirea limitelor judge-ului. În concursurile notate, soluțiile trebuie să fie munca ta — vezi regulile publicate pentru fiecare concurs.',
    terms_content_title: 'Conținutul tău',
    terms_schools_title: 'Școli și prelucrarea datelor',
    terms_schools_body: 'Școlile care folosesc clasele și temele pot solicita șablonul acordului de prelucrare a datelor (docs/DPA-TEMPLATE.md) — datele claselor sunt prelucrate pe instrucțiunile documentate ale școlii, iar profilurile minorilor rămân nepublice implicit.',
    terms_content_body: 'Codul trimis rămâne al tău; acorzi platformei dreptul neexclusiv de a afișa trimiterile (de ex. navigarea soluțiilor după rezolvare) și de a le verifica pentru plagiat. Editorialele și mesajele de forum sunt licențiate CC BY-SA 4.0 pentru reutilizare și traducere cu atribuire.',
    terms_availability_title: 'Disponibilitate',
    terms_availability_body: 'Serviciul este furnizat ca atare. Rulăm backup-uri zilnice și testăm restaurările, dar nu garantăm disponibilitate neîntreruptă; verdicturile pot fi re-evaluate dacă se descoperă un defect.',
    privacy_title: 'Politica de confidențialitate',
    privacy_updated: 'Versiunea 1.0 — actualizată octombrie 2026',
    privacy_what_title: 'Ce stocăm',
    privacy_what_body: 'Datele contului (nume, email, rol), trimiterile și verdicturile, mesajele și voturile de forum, evaluările de probleme și rulările scratch. Totul stă pe infrastructura noastră; nu folosim statistici terțe sau trackeri publicitari.',
    privacy_cookies_title: 'Cookie-uri',
    privacy_cookies_body: 'O pereche de cookie-uri de sesiune (tokenuri httpOnly) te mențin autentificat — nu sunt accesibile scripturilor de pagină și expiră odată cu sesiunea. Nu există cookie de urmărire, publicitar sau pixel social.',
    privacy_rights_title: 'Drepturile tale',
    privacy_rights_body: 'Din profil poți exporta toate datele într-un fișier JSON sau îți poți șterge contul: ștergerea îl dezactivează imediat, anonimizează identitatea și elimină conținutul personal în 30 de zile. Istoricul judge-ului (verdicturi și clasamente) se păstrează anonimizat pentru integritatea recordului public.',
    privacy_minors_title: 'Minorii',
    privacy_minors_body: 'Conturile self-service necesită vârsta de consimțământ pentru societatea informațională (16 ani în România). Elevii mai mici se alătură prin înscrierea mediată de școală, cu profiluri nepublice implicit.',
    daily_problem_label: 'Problema zilei',
    editorial_header: 'Editorial',
    scratch_header: 'Test personalizat',
    problems_search_placeholder: 'Caută probleme…',
    status_label: 'Status',
    all_option: 'Toate',
    clear_filters_button: '✕ Șterge',
    showing_problems_info: 'Se afișează {{shown}} din {{total}} probleme',
    no_problems_match_filters: 'Nicio problemă nu corespunde filtrelor.',
    sort_ascending: 'Sortează crescător',
    sort_descending: 'Sortează descrescător',
    // Problem detail polish [A1/A11/A18]
    problem_author_label: 'Autor',
    tags_header: 'Etichete',
    quick_links_header: 'Linkuri Rapide',
    quick_link_my_submissions: 'Submisiile Mele',
    quick_link_submission_history: 'Istoric Submisii',
    quick_link_leaderboard: 'Clasament',
    quick_link_forum: 'Forumul Comunității',
    example_label: 'Exemplul {{n}}',
    empty_statement: 'Nu există enunț disponibil.',
    copy_button: 'Copiază',
    copied_label: 'Copiat!',
    copy_link_button: 'Copiază linkul',
    problem_type_interactive_badge: 'Interactivă',
    problem_interactive_flush_notice: 'Această problemă este evaluată în timp real de un program interactiv: citește stdout-ul tău și scrie în stdin-ul tău — dați flush ieșirii după fiecare linie.',
    previous_problem: 'Problema anterioară',
    next_problem: 'Problema următoare',
    error_loading_problem: 'Încărcarea problemei a eșuat.',
    back_to_problems: 'Înapoi la Probleme',
    discuss_problem_title: 'Discută această problemă',
    discuss_problem_body: 'Cere indicii sau împărtășește-ți abordarea în forumul comunității.',
    go_to_forum_button: 'Mergi la Forum →',
    // 404 [A14]
    not_found_code: '404',
    not_found_browse_problems: 'Vezi Problemele',
    not_found_go_home: 'Mergi la Pagina Principală',
    // Problem detail metadata line (parity with src/i18n.ts) [Q1]
    problem_form_allowed_languages: 'Limbaje permise',
    // Catalog pager (ProblemsListClient's translator reads MESSAGES) [Q1]
    loading_more: 'Se încarcă…',
    load_more_problems: 'Încarcă mai multe probleme',
    // Home page literals [Q4] — see the en block note: FAQ UI + JSON-LD
    // schema both render from these entries.
    home_badge: '✦ Platformă de Programare Competitivă',
    home_stat_problems: 'Probleme',
    home_stat_languages: 'Limbaje',
    home_stat_judge: 'Evaluator',
    faq_heading: 'Întrebări Frecvente',
    faq_q1: 'Ce limbaje de programare susține WebCoder?',
    faq_a1: 'WebCoder suportă Python 3, C++17 și Java 11 pentru trimiterea soluțiilor.',
    faq_q2: 'WebCoder este gratuit?',
    faq_a2: 'Da, WebCoder este complet gratuit. Creează un cont și începe să rezolvi probleme imediat.',
    faq_q3: 'Cum funcționează evaluatorul online?',
    faq_a3: 'Trimiți codul soluției, iar evaluatorul nostru îl compilează și îl rulează pe teste ascunse. Primești un verdict (Acceptată, Răspuns Greșit, Limită de Timp Depășită etc.) în câteva secunde.',
    faq_q4: 'Pot să îmi creez propriile probleme pe WebCoder?',
    faq_a4: 'Da. Utilizatorii cu rolul de Creator de Probleme pot crea probleme, adăuga teste și le pot trimite spre verificare echipei noastre.',
  },
};

/** Reduce a raw cookie value like "ro-RO" / "en-US" to the supported set. */
export function normalizeLocale(raw: string | undefined): PublicLocale {
  const base = raw?.split('-')[0]?.toLowerCase();
  return base === 'ro' ? 'ro' : 'en';
}

export interface TranslateVars {
  [key: string]: string | number;
}

/** Replace `{{name}}` placeholders, i18next-style. Missing vars become ''. */
export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : ''
  );
}

export type PublicTranslator = (
  key: string,
  defaultValue?: string,
  vars?: TranslateVars
) => string;

/** Build a `t()` with the same (key, defaultValue, vars) contract as i18next. */
export function createTranslator(locale: PublicLocale): PublicTranslator {
  return (key, defaultValue = key, vars) =>
    interpolate(MESSAGES[locale][key] ?? defaultValue, vars);
}
