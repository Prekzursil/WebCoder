// Partial-code template model — mobile port of the client twin of
// backend/code_template.py (src/components/code/PartialCodeEditor.tsx on
// the web). Locked regions are rendered read-only; enforcement is
// SERVER-side (submit 400 + judge-time re-check) — the read-only state is
// UX, not the security boundary, exactly as on the web.

export interface TemplateSegment {
  locked: boolean;
  text: string;
}

export const EDIT_START = 'WC_EDIT_START';
export const EDIT_END = 'WC_EDIT_END';

const SENTINEL_RE = /^\s*(?:\/\/|#|--|;)?\s*(WC_EDIT_START|WC_EDIT_END)\s*$/;

/** Parse a template into locked/editable segments (same sentinel contract). */
export function parseTemplate(
  template: string | null | undefined
): TemplateSegment[] {
  if (!template) return [];
  const segments: TemplateSegment[] = [];
  let lockedBuf: string[] = [];
  let editableBuf: string[] | null = null;
  for (const line of template.split('\n')) {
    const match = line.match(SENTINEL_RE);
    if (match) {
      if (match[1] === EDIT_START) {
        if (lockedBuf.length) {
          segments.push({ locked: true, text: lockedBuf.join('\n') });
          lockedBuf = [];
        }
        editableBuf = [];
      } else if (editableBuf !== null) {
        segments.push({ locked: false, text: editableBuf.join('\n') });
        editableBuf = null;
      }
      continue;
    }
    (editableBuf ?? lockedBuf).push(line);
  }
  if (lockedBuf.length)
    segments.push({ locked: true, text: lockedBuf.join('\n') });
  return segments;
}

/** The editable segments' default contents as the editor's state slots. */
export function initialSlots(segments: TemplateSegment[]): string[] {
  return segments.filter((s) => !s.locked).map((s) => s.text);
}

/**
 * Assemble the full submission document: locked scaffolding verbatim,
 * editable segments from the current slot values. What the judge receives.
 */
export function composeSubmission(
  segments: TemplateSegment[],
  slots: string[]
): string {
  let slotIndex = 0;
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.locked) {
      parts.push(segment.text);
    } else {
      parts.push(slots[slotIndex] ?? '');
      slotIndex += 1;
    }
  }
  return parts.join('\n');
}

/** True when the problem requires the locked-region editor. */
export function isPartialCodeProblem(
  problem: { code_template?: string | null }
): boolean {
  return Boolean(problem.code_template);
}
