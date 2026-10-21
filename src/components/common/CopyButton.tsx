'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Copy-to-clipboard button [SPEC-GAPS A7/A18/F20]: used by sample I/O blocks,
// the source-code viewer, and the problem share link. Uses the global .btn
// idiom; swaps its label to "Copied!" for 1.5s after a successful copy.
//
// Note: `text` must stay a STRING prop — CopyButton is a client component
// rendered from server components, and functions cannot cross the RSC
// boundary. For share links use `shareLink`, which resolves
// window.location.href at click time on the client.
interface CopyButtonProps {
  text?: string;
  /** Copy the current page URL instead of `text`. */
  shareLink?: boolean;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

export default function CopyButton({ text, shareLink = false, label, copiedLabel, ariaLabel, style }: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const value = shareLink
        ? window.location.href
        : text ?? '';
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // jsdom / older browsers: execCommand fallback.
        const area = document.createElement('textarea');
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — leave the button in its idle state.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="btn"
      aria-label={ariaLabel ?? (copied
        ? t('copied_label', 'Copied!')
        : label ?? t('copy_button', 'Copy'))}
      style={{ padding: '3px 10px', fontSize: '0.7rem', minHeight: '28px', ...style }}
    >
      {copied
        ? (copiedLabel ?? t('copied_label', 'Copied!'))
        : (label ?? t('copy_button', 'Copy'))}
    </button>
  );
}
