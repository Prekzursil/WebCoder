// @webcoder/ui — flush-notice (first open-source component, item 149).
//
// The interactive-problem flush notice pattern: an accessible banner
// telling contestants when interactive judges expect their output to be
// flushed. Extracted verbatim from the platform's problem page; zero
// dependencies, no platform imports — usable by any judge frontend.

export interface FlushNoticeProps {
  /** i18n-ready headline (the platform passes its translated string). */
  title: string;
  /** Optional explainer body. */
  body?: string;
  /** Called when the contestant acknowledges the notice. */
  onAcknowledge?: () => void;
}

export function FlushNotice({ title, body, onAcknowledge }: FlushNoticeProps) {
  return (
    <aside
      role="note"
      aria-label={title}
      data-testid="flush-notice"
      style={{
        border: '1px solid currentColor',
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span>
        <strong>{title}</strong>
        {body ? <span> — {body}</span> : null}
      </span>
      {onAcknowledge ? (
        <button type="button" onClick={onAcknowledge} data-testid="flush-notice-ack">
          ×
        </button>
      ) : null}
    </aside>
  );
}

export default FlushNotice;
