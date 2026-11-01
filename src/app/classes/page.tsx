"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ClassroomService } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import { ClassRoom, ClassroomAssignment, MyClassRow } from "@/types/api";
import { palette, hexAlpha } from "@/theme/tokens";
import EmptyState from "@/components/common/EmptyState";
import PageHeader from "@/components/common/PageHeader";

/**
 * EDU-1/EDU-2 surface: teachers manage classes + teme; students self-join
 * with a code and see their homework. The pbinfo lesson applies — minimal
 * roster loop, no LMS.
 */
export default function ClassesPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const lang = i18n.language === "ro" ? "ro" : "en";

  const [myClasses, setMyClasses] = useState<MyClassRow[] | null>(null);
  const [teaching, setTeaching] = useState<ClassRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassPassword, setNewClassPassword] = useState("");
  const [assignments, setAssignments] = useState<ClassroomAssignment[]>([]);

  const isTeacher =
    auth.isAuthenticated && auth.user && ["TEACHER", "ADMIN"].includes(auth.user.role);

  const load = useCallback(async () => {
    setError(null);
    try {
      const mine = await ClassroomService.getMyClasses();
      setMyClasses(mine.results);
      if (isTeacher) {
        const own = await ClassroomService.getClasses();
        setTeaching(own.results);
      }
      const homework = await ClassroomService.getMyAssignments();
      setAssignments(homework.results);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("classes_load_error", "Failed to load classes."),
      );
    }
  }, [isTeacher, t]);

  useEffect(() => {
    if (auth.isAuthenticated) load();
  }, [auth.isAuthenticated, load]);

  const join = async () => {
    setActionError(null);
    try {
      await ClassroomService.joinClass(joinCode.trim().toUpperCase(), joinPassword);
      setJoinCode("");
      setJoinPassword("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const createClass = async () => {
    setActionError(null);
    try {
      await ClassroomService.createClass({
        name: newClassName.trim(),
        ...(newClassPassword ? { join_password: newClassPassword } : {}),
      });
      setNewClassName("");
      setNewClassPassword("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const stateLabel = (state: ClassroomAssignment["state"]) =>
    state === "OPEN"
      ? t("assignment_state_open", "Open")
      : state === "SCHEDULED"
        ? t("assignment_state_scheduled", "Scheduled")
        : t("assignment_state_closed", "Closed");

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
      <PageHeader
        title={t("classes_title", "My classes")}
        subtitle={t("classes_subtitle", "Join with your teacher’s code, then solve your teme.")}
      />

      {error && (
        <div role="alert" style={{ color: palette.danger, marginBottom: 12 }}>
          {error}{" "}
          <button type="button" onClick={load}>
            {t("retry", "Retry")}
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" style={{ color: palette.danger, marginBottom: 12 }}>
          {actionError}
        </div>
      )}

      {!auth.isAuthenticated ? (
        <EmptyState
          title={t("classes_login_required", "Log in to see your classes")}
          description={t(
            "classes_login_hint",
            "Students join classes with a code from their teacher.",
          )}
          action={
            <Link href="/login" style={{ color: palette.accent, fontWeight: 600 }}>
              {t("nav_login", "Login")}
            </Link>
          }
        />
      ) : (
        <>
          {/* Student self-join (EDU-1). */}
          <section
            aria-label={t("classes_join_section", "Join a class")}
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 20,
              border: `1px solid ${palette.border}`,
              borderRadius: 12,
              padding: "12px 16px",
            }}
          >
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={t("classes_join_code", "Class code")}
              aria-label={t("classes_join_code", "Class code")}
              style={{ width: 160, padding: 8, textTransform: "uppercase" }}
            />
            <input
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              placeholder={t("classes_join_password", "Password (optional)")}
              aria-label={t("classes_join_password", "Password (optional)")}
              type="password"
              style={{ width: 200, padding: 8 }}
            />
            <button type="button" onClick={join} style={{ padding: "8px 18px" }}>
              {t("classes_join", "Join")}
            </button>
          </section>

          {isTeacher && (
            <section
              aria-label={t("classes_create_section", "Create a class")}
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 20,
                border: `1px solid ${hexAlpha(palette.accent, 0.3)}`,
                borderRadius: 12,
                padding: "12px 16px",
              }}
            >
              <input
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder={t("classes_new_name", "Class name (e.g. IX-A)")}
                aria-label={t("classes_new_name", "Class name (e.g. IX-A)")}
                style={{ width: 240, padding: 8 }}
              />
              <input
                value={newClassPassword}
                onChange={(e) => setNewClassPassword(e.target.value)}
                placeholder={t("classes_join_password", "Password (optional)")}
                aria-label={t("classes_join_password", "Password (optional)")}
                type="password"
                style={{ width: 200, padding: 8 }}
              />
              <button type="button" onClick={createClass} style={{ padding: "8px 18px" }}>
                {t("classes_create", "Create class")}
              </button>
            </section>
          )}

          {isTeacher && teaching && teaching.length > 0 && (
            <section
              aria-label={t("classes_teaching", "Classes I teach")}
              style={{ marginBottom: 20 }}
            >
              <h2 style={{ fontSize: "1.1rem" }}>{t("classes_teaching", "Classes I teach")}</h2>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                {teaching.map((cls) => (
                  <li
                    key={cls.id}
                    style={{
                      border: `1px solid ${palette.border}`,
                      borderRadius: 10,
                      padding: "10px 14px",
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "baseline",
                    }}
                  >
                    <strong>{cls.name}</strong>
                    {cls.school && <span style={{ color: palette.muted }}>{cls.school}</span>}
                    <span style={{ color: palette.muted }}>
                      {t("classes_members", "{{count}} members", { count: cls.member_count })}
                    </span>
                    {/* Only the owning teacher receives the code back. */}
                    {cls.join_code && (
                      <span
                        data-testid={`join-code-${cls.id}`}
                        style={{ color: palette.accent, fontWeight: 700 }}
                      >
                        {t("classes_code", "Code")}: {cls.join_code}
                      </span>
                    )}
                    <Link
                      href={`/classes/${cls.id}`}
                      style={{ marginLeft: "auto", color: palette.accent }}
                    >
                      {t("classes_manage", "Manage →")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label={t("classes_enrolled", "Enrolled classes")}>
            <h2 style={{ fontSize: "1.1rem" }}>{t("classes_enrolled", "Enrolled classes")}</h2>
            {myClasses === null ? (
              <p aria-busy="true">{t("classes_loading", "Loading classes…")}</p>
            ) : myClasses.length === 0 ? (
              <EmptyState
                title={t("classes_none", "Not in a class yet")}
                description={t("classes_none_hint", "Ask your teacher for the join code above.")}
              />
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                {myClasses.map(({ membership_id, classroom, open_assignments }) => (
                  <li
                    key={membership_id}
                    style={{
                      border: `1px solid ${palette.border}`,
                      borderRadius: 10,
                      padding: "10px 14px",
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "baseline",
                    }}
                  >
                    <strong>{classroom.name}</strong>
                    <span style={{ color: palette.muted }}>{classroom.teacher_username}</span>
                    {open_assignments > 0 && (
                      <span style={{ color: palette.warn, fontWeight: 700 }}>
                        {t("classes_open_assignments", "{{count}} open teme", {
                          count: open_assignments,
                        })}
                      </span>
                    )}
                    <Link
                      href={`/classes/${classroom.id}`}
                      style={{ marginLeft: "auto", color: palette.accent }}
                    >
                      {t("classes_open", "Open →")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t("classes_homework", "My homework")} style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: "1.1rem" }}>{t("classes_homework", "My homework")}</h2>
            {assignments.length === 0 ? (
              <EmptyState
                title={t("classes_no_homework", "No homework")}
                description={t(
                  "classes_no_homework_hint",
                  "Your teacher’s assignments will appear here.",
                )}
              />
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                {assignments.map((a) => (
                  <li
                    key={a.id}
                    style={{
                      border: `1px solid ${palette.border}`,
                      borderRadius: 10,
                      padding: "10px 14px",
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "baseline",
                    }}
                  >
                    <Link
                      href={`/classes/assignments/${a.id}`}
                      style={{ fontWeight: 700, color: palette.accent }}
                    >
                      {String(a.title_i18n[lang] ?? a.title_i18n.en ?? "")}
                    </Link>
                    <span style={{ color: palette.muted }}>{a.classroom_name}</span>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          a.state === "OPEN"
                            ? palette.success
                            : a.state === "SCHEDULED"
                              ? palette.accent
                              : palette.muted,
                      }}
                    >
                      {stateLabel(a.state)}
                    </span>
                    {typeof a.solved_count === "number" && (
                      <span style={{ color: palette.muted }}>
                        {t("assignment_solved", "{{count}} solved", {
                          count: a.solved_count,
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
