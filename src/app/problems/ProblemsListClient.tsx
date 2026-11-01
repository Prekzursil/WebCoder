"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ProblemType, TagType } from "@/types";
import { AuthService, ProblemService } from "@/services/ApiService";
import { createTranslator, type PublicLocale } from "../_lib/public-messages";
import type { CurriculumGrade } from "./_lib/problems-api";
import { palette, hexAlpha } from "@/theme/tokens";
import EmptyState from "@/components/common/EmptyState";
import PageHeader from "@/components/common/PageHeader";
import TableScroll from "@/components/common/TableScroll";

// Catalog client island [SPEC-GAPS F3/F7/Q3/A1/A11]:
//  - search / difficulty / status filters live in the URL (?q= &difficulty=
//    &status=) so they survive refresh and can be shared; ?q= also honors the
//    schema.org SearchAction target.
//  - Title / Difficulty / Status columns are sortable (aria-sort + buttons).
//  - the status facet/column shows the REAL backend choices and only for
//    creator/verifier/admin users — anonymous visitors only ever see APPROVED
//    problems, so the facet was noise (and 'rejected' never existed).
//  - filter chrome is localized (Q3), the table scrolls horizontally on small
//    screens (A1), and empty/error states use the shared EmptyState (A11).
//  - paged loading (frontend wiring wave): the server hands over catalog
//    page 1 (100 rows max — the backend paginates every list endpoint,
//    SPEC-GAPS B4); "Load more" appends the next pages through the
//    browser-side ApiService. Client-side filters/sort apply to the loaded
//    rows; totalCount comes from the envelope's `count`.

interface ProblemsListClientProps {
  problems: ProblemType[];
  /** Total catalog size from the pagination envelope (null on fetch error). */
  totalCount: number;
  /** True when the envelope's `next` link promises more pages. */
  hasMore: boolean;
  fetchError: string | null;
  locale: PublicLocale;
  /** [roadmap EDU-9] Curriculum tree for the second browse axis (null when
   * the endpoint is unavailable — the axis simply hides). */
  curriculum?: CurriculumGrade[] | null;
}

const difficultyColor: Record<string, string> = {
  // EDU-10: the gimnaziu beginner band gets the soft accent green.
  very_easy: palette.accent,
  easy: palette.success,
  medium: palette.warn,
  hard: palette.danger,
};

const DIFFICULTIES = ["very_easy", "easy", "medium", "hard"];
// Real ProblemStatus choices (backend problems/models.py) — 'rejected' never
// existed. [F7]
const STATUSES = ["draft", "pending_approval", "approved", "private"];

type SortKey = "title" | "difficulty" | "status";
type SortDir = "asc" | "desc";

const DIFFICULTY_ORDER: Record<string, number> = {
  very_easy: 0,
  easy: 1,
  medium: 2,
  hard: 3,
};

export default function ProblemsListClient({
  problems,
  totalCount,
  hasMore,
  fetchError,
  locale,
  curriculum,
}: ProblemsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();

  // Paged loading state (frontend wiring wave): rows accumulate page by page.
  const [rows, setRows] = useState<ProblemType[]>(problems);
  const [moreAvailable, setMoreAvailable] = useState(hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const nextPageRef = useRef(2);

  useEffect(() => {
    // New server render (filter change / revalidate) resets the accumulator.
    setRows(problems);
    setMoreAvailable(hasMore);
    setMoreError(null);
    nextPageRef.current = 2;
  }, [problems, hasMore]);

  // [F4] Tag facet data: all tags (bounded collect — the picker needs the
  // full vocabulary, tags are a small set by nature).
  const [allTags, setAllTags] = useState<TagType[]>([]);
  useEffect(() => {
    let cancelled = false;
    ProblemService.getTags({ pageSize: 100 })
      .then(async (first) => {
        const tags = [...first.results];
        // Follow up to 5 pages of tags (bounded like every collect).
        let next = first.next;
        for (let i = 0; next && i < 5; i += 1) {
          const response = await fetch(next);
          if (!response.ok) break;
          const data = (await response.json()) as typeof first;
          tags.push(...data.results);
          next = data.next;
        }
        if (!cancelled) setAllTags(tags);
      })
      .catch(() => {
        // No tag facet without tags — the rest of the catalog works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // [F5] Solved/attempted sets for the indicator column (authenticated only).
  const [solvedIds, setSolvedIds] = useState<Set<number> | null>(null);
  const [attemptedIds, setAttemptedIds] = useState<Set<number>>(new Set());
  const [hideSolved, setHideSolved] = useState(false);
  useEffect(() => {
    if (!auth.isAuthenticated) {
      setSolvedIds(null);
      return;
    }
    let cancelled = false;
    AuthService.getSolvedIds()
      .then((data) => {
        if (cancelled) return;
        setSolvedIds(new Set(data.solved));
        setAttemptedIds(new Set(data.attempted));
      })
      .catch(() => {
        if (!cancelled) setSolvedIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated]);

  const loadMore = async () => {
    if (!moreAvailable || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      // Status facet filters client-side (the backend list has no ?status=
      // query support), so pages are fetched unfiltered and appended here.
      const response = await ProblemService.getProblems(
        {},
        { page: nextPageRef.current, pageSize: 100 },
      );
      setRows((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...response.results.filter((p) => !seen.has(p.id))];
      });
      nextPageRef.current += 1;
      setMoreAvailable(Boolean(response.next));
    } catch (err) {
      setMoreAvailable(true); // retry stays possible
      setMoreError(
        err instanceof Error && err.message ? err.message : "Failed to load more problems.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  // URL is the source of truth for filters [F3]; local state mirrors it so
  // typing in the search box does not thrash the router per keystroke.
  const urlSearch = searchParams.get("q") ?? "";
  const urlDifficulty = searchParams.get("difficulty") ?? "";
  const urlStatus = searchParams.get("status") ?? "";
  const urlTags = searchParams.get("tags") ?? "";
  // [EDU-9] chapter drill-down runs through the server (?curriculum=),
  // so the client only needs the current value (not local state).
  const urlCurriculum = searchParams.get("curriculum") ?? "";

  const [search, setSearch] = useState(urlSearch);
  const [difficultyFilter, setDifficultyFilter] = useState(urlDifficulty);
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [tagFilter, setTagFilter] = useState<Set<number>>(
    () => new Set(urlTags.split(",").filter(Boolean).map(Number)),
  );
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Keep local state in sync when the URL changes underneath (navbar search,
  // back/forward). [F3]
  useEffect(() => {
    setSearch(urlSearch);
    setDifficultyFilter(urlDifficulty);
    setStatusFilter(urlStatus);
    setTagFilter(new Set(urlTags.split(",").filter(Boolean).map(Number)));
  }, [urlSearch, urlDifficulty, urlStatus, urlTags]);

  // Push filter changes into the URL (replace, no scroll jump). [F3]
  const syncUrl = (next: {
    q?: string;
    difficulty?: string;
    status?: string;
    tags?: string;
    curriculum?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (name: string, value: string | undefined) => {
      if (value) params.set(name, value);
      else params.delete(name);
    };
    setOrDelete("q", next.q !== undefined ? next.q : urlSearch || undefined);
    setOrDelete(
      "difficulty",
      next.difficulty !== undefined ? next.difficulty : urlDifficulty || undefined,
    );
    setOrDelete("status", next.status !== undefined ? next.status : urlStatus || undefined);
    setOrDelete("tags", next.tags !== undefined ? next.tags : urlTags || undefined);
    setOrDelete(
      "curriculum",
      next.curriculum !== undefined ? next.curriculum : urlCurriculum || undefined,
    );
    const qs = params.toString();
    router.replace(qs ? `/problems?${qs}` : "/problems", { scroll: false });
  };

  // Build the translator client-side: Server Components cannot pass functions
  // (the old `t` prop) across the server→client boundary, so the serializable
  // `locale` string crosses instead.
  const t = useMemo(() => createTranslator(locale), [locale]);

  // The status facet only makes sense for roles that can see non-approved
  // problems. [F7]
  const showStatusFacet = Boolean(
    auth.user && ["ADMIN", "PROBLEM_VERIFIER", "PROBLEM_CREATOR"].includes(auth.user.role),
  );

  const filtered = useMemo(() => {
    const rowsFiltered = rows.filter((p) => {
      const title = p.title_i18n[locale] || p.title_i18n.en || "";
      const matchesSearch = title.toLowerCase().includes(search.toLowerCase());
      const matchesDiff = difficultyFilter
        ? p.difficulty?.toLowerCase() === difficultyFilter
        : true;
      const matchesStatus = statusFilter ? p.status?.toLowerCase() === statusFilter : true;
      // [F4] multi-tag AND facet
      const matchesTags =
        tagFilter.size === 0
          ? true
          : Array.from(tagFilter).every((tagId) => p.tags?.some((tag) => tag.id === tagId));
      // [F5] optional "hide solved"
      const matchesHideSolved = hideSolved && solvedIds ? !solvedIds.has(p.id) : true;
      return matchesSearch && matchesDiff && matchesStatus && matchesTags && matchesHideSolved;
    });

    if (!sortKey) return rowsFiltered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rowsFiltered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") {
        const at = (a.title_i18n[locale] || a.title_i18n.en || "").toLowerCase();
        const bt = (b.title_i18n[locale] || b.title_i18n.en || "").toLowerCase();
        cmp = at.localeCompare(bt);
      } else if (sortKey === "difficulty") {
        cmp =
          (DIFFICULTY_ORDER[a.difficulty?.toLowerCase() ?? ""] ?? 3) -
          (DIFFICULTY_ORDER[b.difficulty?.toLowerCase() ?? ""] ?? 3);
      } else {
        cmp = (a.status ?? "").localeCompare(b.status ?? "");
      }
      if (cmp === 0) cmp = a.id - b.id;
      return cmp * dir;
    });
  }, [
    rows,
    search,
    difficultyFilter,
    statusFilter,
    tagFilter,
    hideSolved,
    solvedIds,
    locale,
    sortKey,
    sortDir,
  ]);

  const hasActiveFilters = search || difficultyFilter || statusFilter || tagFilter.size > 0;

  const clearFilters = () => {
    setSearch("");
    setDifficultyFilter("");
    setStatusFilter("");
    setTagFilter(new Set());
    router.replace("/problems", { scroll: false });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortAria = (key: SortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  const sortableTh = (key: SortKey, label: string) => (
    <th aria-sort={sortAria(key)}>
      <button
        type="button"
        className="th-sort"
        onClick={() => toggleSort(key)}
        // [Q7/Q12] axe label-content-name-mismatch (serious): the accessible
        // name must contain the button's visible text (the column label).
        aria-label={`${label} — ${sortDir === "asc" ? t("sort_descending", "Sort descending") : t("sort_ascending", "Sort ascending")}`}
      >
        {label}
        <span aria-hidden="true" style={{ fontSize: "0.6rem" }}>
          {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Page header */}
      <PageHeader
        title={t("problem_list_header", "Problems")}
        subtitle={t(
          "problems_page_description",
          "Browse the public competitive programming problem catalog.",
        )}
      />

      {/* [roadmap ONB-1] first-run path: the /start trio */}
      <Link
        href="/start"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.65rem 1rem",
          marginBottom: "1.25rem",
          borderRadius: "var(--radius-md)",
          background: hexAlpha(palette.accent, 0.06),
          border: `1px solid ${hexAlpha(palette.accent, 0.2)}`,
          color: "var(--accent)",
          fontSize: "0.85rem",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {t("start_here_banner", "New here? Start with three classic problems →")}
      </Link>

      {/* Filter bar */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "1rem 1.25rem",
          marginBottom: "1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: "160px" }}>
          <input
            type="search"
            placeholder={t("problems_search_placeholder", "Search problems…")}
            aria-label={t("problems_search_placeholder", "Search problems…")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              syncUrl({ q: e.target.value });
            }}
            style={{
              width: "100%",
              paddingLeft: "12px",
              paddingRight: "10px",
              paddingTop: "7px",
              paddingBottom: "7px",
              background: "rgba(255,255,255,0.04)",
            }}
          />
        </div>

        {/* Difficulty filter */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span className="micro-label" style={{ color: "var(--muted)" }}>
            {t("difficulty_label", "Difficulty")}:
          </span>
          <button
            onClick={() => {
              setDifficultyFilter("");
              syncUrl({ difficulty: "" });
            }}
            className="chip"
            aria-pressed={!difficultyFilter}
            style={
              difficultyFilter
                ? undefined
                : {
                    borderColor: "var(--accent)",
                    color: "var(--accent)",
                    background: hexAlpha(palette.accent, 0.12),
                  }
            }
          >
            {t("all_option", "All")}
          </button>
          {DIFFICULTIES.map((d) => {
            const color = difficultyColor[d] ?? palette.muted;
            const active = difficultyFilter === d;
            return (
              <button
                key={d}
                onClick={() => {
                  const next = active ? "" : d;
                  setDifficultyFilter(next);
                  syncUrl({ difficulty: next });
                }}
                className="chip"
                aria-pressed={active}
                style={
                  active
                    ? {
                        borderColor: color,
                        color,
                        background: hexAlpha(color, 0.09),
                      }
                    : undefined
                }
              >
                {t(`difficulty_${d}`, d)}
              </button>
            );
          })}
        </div>

        {/* Status filter — only for roles that can see non-approved problems [F7] */}
        {showStatusFacet && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <span className="micro-label" style={{ color: "var(--muted)" }}>
              {t("status_label", "Status")}:
            </span>
            <button
              onClick={() => {
                setStatusFilter("");
                syncUrl({ status: "" });
              }}
              className="chip"
              aria-pressed={!statusFilter}
              style={
                statusFilter
                  ? undefined
                  : {
                      borderColor: "var(--accent)",
                      color: "var(--accent)",
                      background: hexAlpha(palette.accent, 0.12),
                    }
              }
            >
              {t("all_option", "All")}
            </button>
            {STATUSES.map((s) => {
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => {
                    const next = active ? "" : s;
                    setStatusFilter(next);
                    syncUrl({ status: next });
                  }}
                  className="chip"
                  aria-pressed={active}
                  style={
                    active
                      ? {
                          borderColor: "rgba(148,163,184,0.5)",
                          color: "var(--muted)",
                          background: "rgba(148,163,184,0.12)",
                        }
                      : undefined
                  }
                >
                  {t(`status_${s}`, s)}
                </button>
              );
            })}
          </div>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="btn btn--danger" style={{ marginLeft: "auto" }}>
            {t("clear_filters_button", "✕ Clear")}
          </button>
        )}

        {/* [F5] hide-solved toggle for signed-in solvers */}
        {auth.isAuthenticated && solvedIds && solvedIds.size > 0 && (
          <button
            onClick={() => setHideSolved((v) => !v)}
            className="chip"
            aria-pressed={hideSolved}
            style={
              hideSolved
                ? {
                    borderColor: "var(--success)",
                    color: "var(--success)",
                    background: hexAlpha(palette.success, 0.1),
                  }
                : undefined
            }
          >
            {t("hide_solved_toggle", "Hide solved")}
          </button>
        )}
      </div>

      {/* [roadmap EDU-9] Curriculum browse axis: grade chips; chapter chips
          appear under the active grade. ?curriculum=<nodeId> refilters
          server-side (the backend supports ?curriculum_node= natively). */}
      {curriculum && curriculum.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "0.85rem 1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <span className="micro-label" style={{ color: "var(--muted)" }}>
              {t("curriculum_label", "Curriculum")}:
            </span>
            <button
              onClick={() => syncUrl({ curriculum: "" })}
              className="chip"
              aria-pressed={!urlCurriculum}
              style={
                !urlCurriculum
                  ? {
                      borderColor: "var(--accent)",
                      color: "var(--accent)",
                      background: hexAlpha(palette.accent, 0.12),
                    }
                  : undefined
              }
            >
              {t("all_option", "All")}
            </button>
            {curriculum.map((grade) => {
              const childrenActive = grade.children.some((c) => String(c.id) === urlCurriculum);
              const gradeActive = String(grade.id) === urlCurriculum || childrenActive;
              return (
                <span
                  key={grade.id}
                  style={{
                    display: "inline-flex",
                    gap: "6px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => syncUrl({ curriculum: String(grade.id) })}
                    className="chip"
                    aria-pressed={gradeActive}
                    style={
                      gradeActive
                        ? {
                            borderColor: "var(--violet)",
                            color: "var(--violet)",
                            background: hexAlpha(palette.violet, 0.1),
                          }
                        : undefined
                    }
                  >
                    {grade.name_i18n[locale] || grade.name_i18n.en || grade.slug}
                  </button>
                  {(childrenActive || String(grade.id) === urlCurriculum) &&
                    grade.children.map((chapter) => {
                      const active = String(chapter.id) === urlCurriculum;
                      return (
                        <button
                          key={chapter.id}
                          onClick={() =>
                            syncUrl({ curriculum: active ? String(grade.id) : String(chapter.id) })
                          }
                          className="chip"
                          aria-pressed={active}
                          style={
                            active
                              ? {
                                  borderColor: "var(--violet)",
                                  color: "var(--violet)",
                                  background: hexAlpha(palette.violet, 0.14),
                                }
                              : undefined
                          }
                        >
                          {chapter.name_i18n[locale] || chapter.name_i18n.en || chapter.slug}
                          <span aria-hidden="true" style={{ opacity: 0.6, marginLeft: "4px" }}>
                            {chapter.problem_count}
                          </span>
                        </button>
                      );
                    })}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* [F4] Tag facet */}
      {allTags.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "1.25rem",
          }}
        >
          <span className="micro-label" style={{ color: "var(--muted)" }}>
            {t("tags_label", "Tags")}:
          </span>
          <button
            onClick={() => {
              setTagFilter(new Set());
              syncUrl({ tags: "" });
            }}
            className="chip"
            aria-pressed={tagFilter.size === 0}
          >
            {t("all_option", "All")}
          </button>
          {allTags.slice(0, 12).map((tag) => {
            const active = tagFilter.has(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => {
                  const next = new Set(tagFilter);
                  if (active) next.delete(tag.id);
                  else next.add(tag.id);
                  setTagFilter(next);
                  syncUrl({ tags: Array.from(next).join(",") });
                }}
                className="chip"
                aria-pressed={active}
                style={
                  active
                    ? {
                        borderColor: "var(--violet)",
                        color: "var(--violet)",
                        background: hexAlpha(palette.violet, 0.1),
                      }
                    : undefined
                }
              >
                {tag.name_i18n[locale] || tag.name_i18n.en || tag.slug}
              </button>
            );
          })}
        </div>
      )}

      {/* Results count */}
      {!fetchError && rows.length > 0 && (
        <div style={{ marginBottom: "0.75rem", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
          {hasActiveFilters
            ? t("showing_problems_info", "Showing {{shown}} of {{total}} problem(s)", {
                shown: filtered.length,
                total: rows.length,
              })
            : `${filtered.length} ${filtered.length === 1 ? "problem" : "problems"}`}
          {totalCount > rows.length ? ` · ${totalCount.toLocaleString()} in the full catalog` : ""}
        </div>
      )}

      {/* Error state */}
      {fetchError ? (
        <div
          role="alert"
          style={{
            padding: "1.25rem 1.5rem",
            borderRadius: "var(--radius-md)",
            background: hexAlpha(palette.danger, 0.08),
            border: `1px solid ${hexAlpha(palette.danger, 0.2)}`,
            color: "var(--danger)",
            fontSize: "0.9rem",
          }}
        >
          {t("problems_load_error", "Could not load problems: ")}
          {fetchError}
        </div>
      ) : filtered.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title={t("no_problems_match_filters", "No problems match your filters.")}
            action={
              <button onClick={clearFilters} className="btn">
                {t("clear_filters_button", "✕ Clear")}
              </button>
            }
          />
        ) : (
          <EmptyState title={t("no_problems_available", "No problems available at the moment.")} />
        )
      ) : (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
          }}
        >
          <TableScroll>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {solvedIds && (
                    <th
                      scope="col"
                      style={{ padding: "12px 20px", width: "44px" }}
                      aria-label={t("solved_column_th", "Solved")}
                    >
                      <span aria-hidden="true">&#10003;</span>
                    </th>
                  )}
                  <th scope="col" style={{ padding: "12px 20px", width: "60px" }}>
                    #
                  </th>
                  {sortableTh("title", t("problem_title_th", "Title"))}
                  {sortableTh("difficulty", t("problem_difficulty_th", "Difficulty"))}
                  {showStatusFacet && sortableTh("status", t("problem_status_th", "Status"))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((problem) => {
                  const diff = problem.difficulty?.toLowerCase() ?? "";
                  const diffColor = difficultyColor[diff] ?? palette.muted;
                  return (
                    <tr
                      key={problem.id}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      {solvedIds && (
                        <td style={{ padding: "14px 20px" }}>
                          <span
                            aria-label={
                              solvedIds.has(problem.id)
                                ? t("solved_aria", "Solved")
                                : attemptedIds.has(problem.id)
                                  ? t("attempted_aria", "Attempted")
                                  : t("not_attempted_aria", "Not attempted")
                            }
                            style={{
                              color: solvedIds.has(problem.id)
                                ? palette.success
                                : attemptedIds.has(problem.id)
                                  ? palette.warn
                                  : "var(--text-tertiary)",
                              fontSize: "0.9rem",
                            }}
                          >
                            {solvedIds.has(problem.id)
                              ? "✓"
                              : attemptedIds.has(problem.id)
                                ? "•"
                                : ""}
                          </span>
                        </td>
                      )}
                      <td
                        style={{
                          padding: "14px 20px",
                          color: "var(--text-tertiary)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {problem.id}
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <Link
                          href={`/problems/${problem.id}`}
                          style={{
                            color: "var(--foreground)",
                            fontWeight: 500,
                            fontSize: "0.9rem",
                          }}
                        >
                          {problem.title_i18n[locale] ||
                            problem.title_i18n.en ||
                            `Problem #${problem.id}`}
                        </Link>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 10px",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: diffColor,
                            background: hexAlpha(diffColor, 0.09),
                            border: `1px solid ${hexAlpha(diffColor, 0.19)}`,
                          }}
                        >
                          {t(`difficulty_${diff}`, problem.difficulty)}
                        </span>
                      </td>
                      {showStatusFacet && (
                        <td style={{ padding: "14px 20px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "2px 10px",
                              borderRadius: "999px",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              color: "var(--muted)",
                              background: "rgba(148,163,184,0.08)",
                              border: "1px solid rgba(148,163,184,0.15)",
                            }}
                          >
                            {t(`status_${problem.status?.toLowerCase()}`, problem.status)}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}

      {/* Paged loading (frontend wiring wave) */}
      {!fetchError && rows.length > 0 && (moreAvailable || moreError) && (
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          {moreError && (
            <p
              role="alert"
              style={{ color: "var(--danger)", fontSize: "0.8rem", marginBottom: "0.5rem" }}
            >
              {moreError}
            </p>
          )}
          <button onClick={loadMore} disabled={loadingMore} className="btn">
            {loadingMore
              ? t("loading_more", "Loading…")
              : t("load_more_problems", "Load more problems")}
          </button>
        </div>
      )}
    </div>
  );
}
