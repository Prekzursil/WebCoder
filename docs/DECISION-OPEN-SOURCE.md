# Decision: open-source / self-host posture

Status: **DECIDED (2026-11-14, Wave D)** — recorded per the roadmap's Wave D
line "open-source/self-host decision (DMOJ/infoarena precedent vs
maintenance cost)". This document is the decision record; the roadmap and
backlog cite it rather than restating it.

## The question

Should WebCoder (a) open-source the platform, DMOJ-style, accepting
community self-hosting and contributions; (b) stay closed-source like
infoarena, a single-maintainer system; or (c) something in between?

## Evidence from the two precedents the roadmap names

- **DMOJ** (https://github.com/DMOJ/online-judge, AGPL-3.0): a thriving
  open-source judge — dozens of independent installations (dmoj.ca is just
  one), a public problem archive format other sites adopted, and years of
  outside contributions. The costs are equally real: a public
  vulnerability surface (security reports must be triaged against every
  deployed instance), contribution-review overhead, a stable
  plugin/migration contract for strangers' instances, and docs/support
  obligations that consume maintainer hours the core site never sees.
- **infoarena** (https://www.infoarena.ro, closed): a personal project
  serving Romania since ~2014 (roadmap §2.9) on a legacy stack. Zero
  upstream maintenance burden, but also zero outside contributions, zero
  institutional redundancy, and a bus-factor-of-one core that the roadmap
  itself cites for its "dated UI / legacy toolchains" failure mode.

## Constraints specific to us

1. **Solo maintainer, pre-production** (roadmap: production deployment is
   owner-deferred, LAST). Maintenance capacity is the binding resource.
2. **The competitive moat is content and community, not code** (roadmap §6
   big-bets table: the defensible assets are the bilingual archive, the
   classroom workflows and the rated ladder — none of which live in the
   repo).
3. **Trust story**: LEG-1/X5 (GDPR, DPA for schools) and SAF-1/SAF-2
   (moderation, contest integrity) are in-flight commitments. Publishing
   the exact abuse-detection and anti-cheat heuristics would degrade them.
4. **Backlog K-149** already scopes the honest middle path:
   "Open-source client components".

## Decision

**Stay closed-source as a platform; open-source well-scoped client
components on a rolling basis (K-149 begins the moment a component
stabilizes). No self-hosting support before production traction.**

Concretely:

1. **The Django backend and judge stay closed** until the platform has
   production traction AND more than one maintainer. Reviewing outside
   PRs against the 100%-coverage + zero-warnings gates costs more than
   the contributions are worth at current scale, and publishing judge
   internals before the security-audit series (docs/SECURITY-AUDIT-*.md)
   has fully landed would hand attackers the sandbox design.
2. **Client components are the open-source surface.** The Blockly/Scratch
   editors (#252/#258), the problem-statement renderer, the print/PDF
   stylesheet and the certificates verification page are self-contained,
   carry no trust heuristics, and are exactly the artifacts a teacher or
   another judge would reuse. Extract under permissive licensing (MIT for
   code we authored end-to-end) with a CONTRIBUTING note pinned to the
   quality gates. First candidates, in order: the Scratch→Python
   transpiler playground, the interactive-problem flush notice pattern,
   the atestat verification page.
3. **No self-host docs, no installation support, no plugin contract**
   while closed. If traction reverses this decision later, the reopen
   path is: finish SECURITY-AUDIT-judge → AGPL-3.0 (DMOJ's license —
   forced contribution-back fits a community judge) → a documented
   docker-compose deployment profile → an explicit security-report
   policy. That path is deliberately NOT started now.
4. **Institutional redundancy is solved operationally, not by
   open-sourcing**: the backup/restore drills (OPR-1/SP6) plus the
   archive import pipeline (CNT-2, RO-6) already give the community an
   exit hatch — the problems and editorial corpus stay portable even
   though the platform code is closed. Portability of CONTENT, not of
   CODE, is the promise we can keep today.

## Review trigger

Revisit when any of: (a) a second recurring maintainer joins, (b) a
school/institution asks to self-host with an offer to maintain, (c) the
platform has been in production for two quarters. Until then this
decision is final and the repo's LICENSE (project code) stands.
