"use client";

// COM-5 chat view: one 1:1 thread. Message bodies render as TEXT ONLY
// (React text nodes — no dangerouslySetInnerHTML, no markdown pipeline),
// which is the XSS-safe-by-construction contract the backend mirrors by
// storing plain text. Send / report-per-message / block / mark-read all
// live here; history is newest-first cursor pagination.

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { MessagingService } from "@/services/ApiService";
import { ApiConversation, ApiPrivateMessage, cursorParamFromUrl } from "@/types/api";
import { useAuth } from "@/context/AuthContext";
import { palette } from "@/theme/tokens";
import ProtectedRoute from "@/components/common/ProtectedRoute";

const REPORT_REASONS = ["SPAM", "ABUSE", "GROOMING", "OTHER"] as const;

function timeLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function MessageThreadPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const params = useParams<{ threadId: string }>();
  const threadId = Number(params?.threadId);

  const [conversation, setConversation] = useState<ApiConversation | null>(null);
  const [messages, setMessages] = useState<ApiPrivateMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const listBottomRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    const response = await MessagingService.getMessages(threadId, { pageSize: 30 });
    // Newest-first page -> display oldest-first (chat order).
    setMessages([...response.results].reverse());
    setOlderCursor(cursorParamFromUrl(response.next));
  }, [threadId]);

  useEffect(() => {
    if (!Number.isFinite(threadId)) return;
    let cancelled = false;
    setError(null);
    MessagingService.getThread(threadId)
      .then((data) => {
        if (!cancelled) setConversation(data);
      })
      .catch(() => {
        if (!cancelled) setError(t("msgs_thread_missing", "Conversation not found."));
      });
    void loadMessages().catch(() => {
      if (!cancelled) setError(t("msgs_load_error", "Could not load messages."));
    });
    // Mark the other party's messages read on open.
    MessagingService.markRead(threadId).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [threadId, loadMessages, t]);

  useEffect(() => {
    listBottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const loadOlder = async () => {
    if (!olderCursor) return;
    const response = await MessagingService.getMessages(threadId, {
      cursor: olderCursor,
      pageSize: 30,
    });
    setMessages((current) => [...[...response.results].reverse(), ...current]);
    setOlderCursor(cursorParamFromUrl(response.next));
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await MessagingService.sendMessage(threadId, body);
      setDraft("");
      setMessages((current) => [...current, message]);
    } catch (err) {
      const detail = (err as Error)?.message ?? "";
      if (detail === "blocked") {
        setError(t("msgs_err_blocked_send", "You can no longer message this user."));
      } else if (detail === "minor_policy") {
        setError(
          t(
            "msgs_err_minor",
            "This account only accepts messages from followed users or classmates.",
          ),
        );
      } else {
        setError(t("msgs_send_error", "Could not send the message."));
      }
    } finally {
      setSending(false);
    }
  };

  const report = async (messageId: number, reason: string) => {
    setReportingId(null);
    try {
      await MessagingService.reportMessage(messageId, {
        reason: reason as (typeof REPORT_REASONS)[number],
      });
      setNotice(t("msgs_report_sent", "Reported. A moderator will review it."));
    } catch (err) {
      const message = (err as Error)?.message ?? "";
      setNotice(
        message.includes("already reported")
          ? t("msgs_report_dup", "You already reported this message.")
          : t("msgs_report_error", "Could not report this message."),
      );
    }
  };

  const toggleBlock = async () => {
    if (!conversation) return;
    try {
      if (blocked) {
        await MessagingService.unblockUser(conversation.other_user.id);
        setBlocked(false);
        setNotice(t("msgs_unblocked", "User unblocked."));
      } else {
        await MessagingService.blockUser({ userId: conversation.other_user.id });
        setBlocked(true);
        setNotice(t("msgs_blocked", "User blocked. They can no longer message you."));
      }
    } catch {
      setError(t("msgs_block_error", "Could not update the block."));
    }
  };

  const myId = auth.user?.id;

  return (
    <ProtectedRoute>
      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "24px 16px 64px",
          display: "flex",
          flexDirection: "column",
          minHeight: "80vh",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <Link
            href="/messages"
            aria-label={t("msgs_back", "Back to messages")}
            style={{ color: palette.accent, textDecoration: "none", fontWeight: 600 }}
          >
            ←
          </Link>
          <h1 style={{ fontSize: 20, margin: 0, flex: 1 }}>
            {conversation ? conversation.other_user.username : "…"}
          </h1>
          {conversation && (
            <button
              type="button"
              onClick={() => void toggleBlock()}
              data-testid="msg-block-toggle"
              aria-pressed={blocked}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${palette.borderStrong}`,
                background: "none",
                color: blocked ? palette.danger : palette.muted,
                cursor: "pointer",
              }}
            >
              {blocked ? t("msgs_unblock", "Unblock") : t("msgs_block", "Block")}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" style={{ color: palette.danger, margin: "0 0 8px" }}>
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            style={{ color: palette.success, margin: "0 0 8px" }}
            data-testid="msg-notice"
          >
            {notice}
          </p>
        )}

        <div
          style={{
            flex: 1,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 12,
            overflowY: "auto",
            maxHeight: "55vh",
          }}
          aria-live="polite"
        >
          {olderCursor && (
            <button
              type="button"
              onClick={() => void loadOlder()}
              style={{
                background: "none",
                border: "none",
                color: palette.accent,
                cursor: "pointer",
                display: "block",
                margin: "0 auto 10px",
              }}
            >
              {t("msgs_load_older", "Load older messages")}
            </button>
          )}
          {messages.length === 0 && (
            <p style={{ color: palette.muted, textAlign: "center" }}>
              {t("msgs_thread_empty", "No messages yet — say hello.")}
            </p>
          )}
          {messages.map((message) => {
            const mine = message.sender.id === myId;
            return (
              <div
                key={message.id}
                style={{
                  display: "flex",
                  justifyContent: mine ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  data-testid={`msg-bubble-${message.id}`}
                  style={{
                    maxWidth: "78%",
                    background: mine ? palette.accent : palette.surface2,
                    color: mine ? palette.bg : palette.foreground,
                    borderRadius: 12,
                    padding: "8px 12px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {/* body renders as a TEXT NODE — the XSS-safe contract */}
                  <span>{message.body}</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      marginTop: 4,
                      opacity: 0.75,
                      textAlign: "right",
                    }}
                  >
                    {timeLabel(message.created_at)}
                  </span>
                  {!mine && (
                    <button
                      type="button"
                      onClick={() =>
                        setReportingId((current) => (current === message.id ? null : message.id))
                      }
                      aria-label={t("msgs_report_aria", "Report this message")}
                      data-testid={`msg-report-btn-${message.id}`}
                      style={{
                        background: "none",
                        border: "none",
                        color: palette.danger,
                        cursor: "pointer",
                        fontSize: 11,
                        padding: 0,
                        marginTop: 4,
                      }}
                    >
                      ⚑ {t("msgs_report", "Report")}
                    </button>
                  )}
                  {reportingId === message.id && (
                    <div
                      data-testid={`msg-report-panel-${message.id}`}
                      role="dialog"
                      aria-label={t("msgs_report_title", "Report message")}
                    >
                      <p style={{ margin: "6px 0 4px", fontSize: 12 }}>
                        {t("msgs_report_pick", "Why are you reporting this?")}
                      </p>
                      {REPORT_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          data-testid={`msg-report-reason-${reason}`}
                          onClick={() => void report(message.id, reason)}
                          style={{
                            display: "block",
                            width: "100%",
                            marginBottom: 4,
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: `1px solid ${palette.borderStrong}`,
                            background: "none",
                            color: palette.foreground,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={listBottomRef} />
        </div>

        <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <textarea
            id="msg-draft"
            aria-label={t("msgs_compose_label", "Write a message")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("msgs_placeholder", "Write a message…")}
            rows={2}
            maxLength={4000}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 8,
              border: `1px solid ${palette.borderStrong}`,
              background: palette.surface,
              color: palette.foreground,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            data-testid="msg-send"
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: sending || !draft.trim() ? palette.surface2 : palette.accent,
              color: palette.bg,
              fontWeight: 700,
              cursor: sending ? "wait" : "pointer",
              alignSelf: "flex-end",
            }}
          >
            {t("msgs_send", "Send")}
          </button>
        </form>
      </main>
    </ProtectedRoute>
  );
}
