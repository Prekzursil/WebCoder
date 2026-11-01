"use client";

import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

// Ported from frontend/webcoder_ui/src/components/common/ConfirmationModal.tsx (CRA reference).
//
// [SPEC-GAPS A4/Q9-partial] The CRA modal shipped a white card inside a dark
// app. It now uses the surface tokens and carries dialog semantics
// (role/aria-modal/aria-labelledby, Escape closes, focus returns to the
// opener). The full MUI <Dialog> migration stays with Q9.

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText,
  cancelButtonText,
}) => {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        style={{
          backgroundColor: "var(--surface)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          padding: "20px",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
          maxWidth: "400px",
          width: "90%",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="confirmation-modal-title"
          style={{ color: "var(--foreground)", marginBottom: "0.5rem" }}
        >
          {title}
        </h3>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>{message}</p>
        <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-around" }}>
          <button onClick={onClose} className="btn">
            {cancelButtonText || t("cancel_button", "Cancel")}
          </button>
          <button ref={confirmRef} onClick={onConfirm} className="btn btn--primary">
            {confirmButtonText || t("confirm_button", "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
