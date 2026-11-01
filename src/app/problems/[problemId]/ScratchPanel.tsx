"use client";

// [roadmap JDG-6/X7/QW-6] Custom Test: run code on your own input without
// burning a submission (SP4 caps those at 20/hour). Shares the CodeMirror
// editor and the problem's language list; the endpoint carries its own
// stricter scratch throttle.

import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScratchService } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import { palette, hexAlpha } from "@/theme/tokens";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import CodeEditor from "./CodeEditor";

export default function ScratchPanel({
  allowedLanguages,
}: {
  allowedLanguages: string[];
}): ReactNode {
  const { t } = useTranslation();
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState(allowedLanguages[0] ?? "python3");
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth.isAuthenticated) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await ScratchService.run({ language, code, input: stdin });
      setStatus(result.status);
      const parts = [
        result.output && `${t("scratch_output_label", "Output")}:\n${result.output}`,
        result.error && `${t("scratch_stderr_label", "Errors")}:\n${result.error}`,
      ].filter(Boolean);
      setOutput(parts.join("\n\n") || t("scratch_no_output", "(no output)"));
    } catch (err) {
      setOutput(null);
      setStatus(null);
      setError(err instanceof Error ? err.message : t("scratch_failed", "Custom test failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <select
          aria-label={t("scratch_language_label", "Custom test language")}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{ padding: "6px 10px", flex: "0 0 auto" }}
        >
          {(allowedLanguages.length ? allowedLanguages : ["python3"]).map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--primary"
          onClick={run}
          disabled={busy || !code.trim()}
          style={{ padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <PlayArrowOutlinedIcon fontSize="small" />
          {busy ? t("scratch_running", "Running…") : t("scratch_run_button", "Run custom test")}
        </button>
      </div>
      <CodeEditor
        value={code}
        onChange={setCode}
        language={language}
        ariaLabel={t("scratch_editor_label", "Custom test code")}
        height="220px"
      />
      <div style={{ marginTop: "0.5rem" }}>
        <label
          htmlFor="scratch-input"
          className="micro-label"
          style={{
            fontSize: "0.7rem",
            color: "var(--text-tertiary)",
            display: "block",
            marginBottom: "4px",
          }}
        >
          {t("scratch_input_label", "Custom input (stdin)")}
        </label>
        <textarea
          id="scratch-input"
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          rows={3}
          spellCheck={false}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--foreground)",
          }}
        />
      </div>
      {(output != null || error) && (
        <div
          role="status"
          style={{
            marginTop: "0.75rem",
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            background: hexAlpha(palette.accent, 0.05),
            border: `1px solid ${hexAlpha(palette.accent, 0.2)}`,
            fontSize: "0.8rem",
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-mono)",
          }}
        >
          {error ? (
            <span style={{ color: "var(--danger)" }}>{error}</span>
          ) : (
            <>
              <span
                className="micro-label"
                style={{
                  fontSize: "0.65rem",
                  color: status === "OK" ? palette.success : palette.warn,
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                {status}
              </span>
              {output}
            </>
          )}
        </div>
      )}
    </div>
  );
}
