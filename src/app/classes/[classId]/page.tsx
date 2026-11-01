"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ClassroomService } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import { ClassMembershipRow, ClassRoom, ClassroomAssignment } from "@/types/api";
import { palette } from "@/theme/tokens";
import EmptyState from "@/components/common/EmptyState";
import NewAssignmentForm from "./NewAssignmentForm";
import PageHeader from "@/components/common/PageHeader";

/** Class detail (EDU-1/EDU-2): roster for the teacher, teme list for all,
 * join code shown only to the owner. */
export default function ClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const classId = params?.classId;
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const lang = i18n.language === "ro" ? "ro" : "en";

  const [classroom, setClassroom] = useState<ClassRoom | null>(null);
  const [members, setMembers] = useState<ClassMembershipRow[] | null>(null);
  const [assignments, setAssignments] = useState<ClassroomAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    try {
      const cls = await ClassroomService.getClass(classId);
      setClassroom(cls);
      const [roster, teme] = await Promise.allSettled([
        ClassroomService.getMembers(classId),
        ClassroomService.getAssignments(classId),
      ]);
      if (roster.status === "fulfilled") setMembers(roster.value);
      if (teme.status === "fulfilled") setAssignments(teme.value.results);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("classes_load_error", "Failed to load classes."),
      );
    }
  }, [classId, t]);

  useEffect(() => {
    if (auth.isAuthenticated) load();
  }, [auth.isAuthenticated, load]);

  if (!auth.isAuthenticated) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <EmptyState
          title={t("classes_login_required", "Log in to see your classes")}
          action={
            <Link href="/login" style={{ color: palette.accent, fontWeight: 600 }}>
              {t("nav_login", "Login")}
            </Link>
          }
        />
      </main>
    );
  }

  if (error || !classroom) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <div role="alert" style={{ color: palette.danger }}>
          {error ?? t("class_not_found", "Class not found.")}
        </div>
        <Link href="/classes" style={{ color: palette.accent }}>
          ← {t("classes_back", "Back to classes")}
        </Link>
      </main>
    );
  }

  const isOwner = classroom.is_owner || classroom.join_code !== undefined;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <PageHeader
        title={classroom.name}
        subtitle={`${classroom.teacher_username}${
          classroom.school ? ` · ${classroom.school}` : ""
        } · ${t("classes_members", "{{count}} members", { count: classroom.member_count })}`}
      />

      {isOwner && classroom.join_code && (
        <p data-testid="class-join-code" style={{ color: palette.accent, fontWeight: 700 }}>
          {t("classes_code", "Code")}: {classroom.join_code}
        </p>
      )}

      {members && members.length > 0 && (
        <section aria-label={t("class_roster", "Roster")} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: "1.1rem" }}>{t("class_roster", "Roster")}</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {members.map((m) => (
              <li key={m.id} style={{ color: palette.body }}>
                {m.username}
                <span style={{ color: palette.muted, marginLeft: 8 }}>
                  {new Date(m.joined_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t("class_teme", "Assignments")}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "1.1rem" }}>{t("class_teme", "Assignments")}</h2>
          {/* EDU-2: tem authoring for the owning teacher (or admin). */}
          {(classroom.teacher_username === auth.user?.username || auth.user?.role === "ADMIN") &&
            classroom.id != null && (
              <NewAssignmentForm classroomId={classroom.id} onCreated={() => void load()} />
            )}
        </div>
        {assignments === null ? (
          <p aria-busy="true">{t("classes_loading", "Loading classes…")}</p>
        ) : assignments.length === 0 ? (
          <EmptyState
            title={t("class_no_teme", "No assignments yet")}
            description={t(
              "class_no_teme_hint",
              "Teachers publish teme with a schedule; they appear here.",
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
                }}
              >
                <Link
                  href={`/classes/assignments/${a.id}`}
                  style={{ fontWeight: 700, color: palette.accent }}
                >
                  {String(a.title_i18n[lang] ?? a.title_i18n.en ?? "")}
                </Link>
                <div style={{ color: palette.muted, fontSize: 13, marginTop: 4 }}>
                  {new Date(a.available_from).toLocaleString()} →{" "}
                  {new Date(a.due_at).toLocaleString()}
                  {a.late_until
                    ? ` (${t("assignment_late_until", "late until")} ${new Date(
                        a.late_until,
                      ).toLocaleString()})`
                    : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
