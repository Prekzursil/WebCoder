import io

# --- public dictionary (server pages) ---
p = 'src/app/_lib/public-messages.ts'
s = io.open(p, encoding='utf-8').read()
anchor = "    support_donate_title: 'Donate',\n"
first = s.index(anchor)
ro_anchor = "    support_donate_title: 'Donează',\n"
second = s.index('Donează', first)

en = {
  "contribute_title": "Contribute: the authoring program",
  "contribute_intro": "WebCoder is bilingual because contributors make it bilingual. Teachers: writing problems here is professional development — you get a spec, a review and structured feedback, and your class gets problems in both languages.",
  "contribute_step_spec": "Write to the published spec: a bilingual statement (RO canonical, EN mirror), the input/output format, limits, subtasks when the problem is written with them, and the reference solution. The problem form and its validation enforce the spec mechanically.",
  "contribute_step_tests": "Provide tests that match the statement (samples are public, the rest hidden), a custom checker when the answer is not exact text (the testlib-compatible exit-code protocol), and — for interactive problems — the interactor. The stress runner lets you cross-check your solution against a brute force before submitting.",
  "contribute_step_review": "Submissions go through the DRAFT → PENDING → APPROVED queue. A verifier reads the statement, runs the tests and returns structured feedback; you iterate until it is approved. That feedback loop is the training: it is how the campion teacher-authors got good.",
  "contribute_step_reward": "Approved problems, community editorials and articles earn contributor honor — the separate ladder that recognizes the people who build the bank, not just the people who solve it.",
  "contribute_cta_problem": "Submit a problem",
  "contribute_cta_judge": "The judge & limits",
  "contribute_cta_policy": "Contest rules",
}
ro = {
  "contribute_title": "Contribuie: programul de autorie",
  "contribute_intro": "WebCoder este bilingv pentru că contributorii îl fac bilingv. Profesori: scrierea de probleme aici este dezvoltare profesională — ai o specificație, o recenzie și feedback structurat, iar clasa ta primește probleme în ambele limbi.",
  "contribute_step_spec": "Scrie conform specificației publicate: enunț bilingv (RO canonic, EN oglindit), formatul de intrare/ieșire, limitele, subtask-uri când problema se scrie cu ele și soluția de referință. Formularul de probleme și validarea lui aplică specificația mecanic.",
  "contribute_step_tests": "Oferă teste care respectă enunțul (exemplele sunt publice, restul ascunse), un checker personalizat când răspunsul nu este text exact (protocolul de coduri de ieșire compatibil testlib) și — pentru probleme interactive — interactorul. Stress runner-ul îți permite să compari soluția cu una forta brută înainte de trimitere.",
  "contribute_step_review": "Trimiterile trec prin coada DRAFT → PENDING → APPROVED. Un verificator citește enunțul, rulează testele și returnează feedback structurat; iterezi până la aprobare. Bucla aceea de feedback este trainingul: așa s-au perfecționat profesorii-autori de la campion.",
  "contribute_step_reward": "Problemele aprobate, editorialele comunitare și articolele aduc honor de contributor — scara separată care recunoaște oamenii care construiesc banca de probleme, nu doar pe cei care o rezolvă.",
  "contribute_cta_problem": "Trimite o problemă",
  "contribute_cta_judge": "Evaluatorul și limitele",
  "contribute_cta_policy": "Regulile concursurilor",
}

def esc(v):
    return v.replace('\\', '\\\\').replace("'", "\\'")

def block(keys):
    return ''.join("    %s: '%s',\n" % (k, esc(v)) for k, v in keys.items())

s = s[:first] + block(en) + s[first:second - len('    support_donate_title: ')] + block(ro) + s[second - len('    support_donate_title: '):]
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print("public dictionary extended")

# --- client i18n (percentile keys) ---
p2 = 'src/i18n.ts'
s2 = io.open(p2, encoding='utf-8').read()
anchor2 = '      "footer_judge_docs": "The judge",\n'
i1 = s2.index(anchor2)
i2 = s2.index(anchor2, i1 + 1)
en2 = '      "runtime_percentile_label": "Runtime percentile",\n      "runtime_beats": "faster than {{pct}}% of accepted solutions",\n'
ro2 = '      "runtime_percentile_label": "Percentilă de timp",\n      "runtime_beats": "mai rapid decât {{pct}}% din soluțiile acceptate",\n'
s2 = s2[:i1 + len(anchor2)] + en2 + s2[i1 + len(anchor2):i2 + len(anchor2)] + ro2 + s2[i2 + len(anchor2):]
io.open(p2, 'w', encoding='utf-8', newline='\n').write(s2)
print("client i18n keys added")

# --- footer link for /contribute ---
p3 = 'src/components/layout/Footer.tsx'
s3 = io.open(p3, encoding='utf-8').read()
anchor3 = "    { href: '/help/judge', label: t('footer_judge_docs', 'The judge') },"
assert anchor3 in s3
s3 = s3.replace(anchor3, anchor3 + "\n    { href: '/contribute', label: t('footer_contribute', 'Contribute') },", 1)
io.open(p3, 'w', encoding='utf-8', newline='\n').write(s3)
print("footer link added")

# footer_contribute key in i18n.ts both blocks
s2b = io.open(p2, encoding='utf-8').read()
s2b = s2b.replace(en2, en2 + '      "footer_contribute": "Contribute",\n', 1)
s2b = s2b.replace(ro2, ro2 + '      "footer_contribute": "Contribuie",\n', 1)
io.open(p2, 'w', encoding='utf-8', newline='\n').write(s2b)
print("footer_contribute keys added")
