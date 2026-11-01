import { NextRequest, NextResponse } from "next/server";
import { API_V1_URL } from "@/lib/api-config";

/**
 * EDU-6 gradebook CSV download — same-origin proxy (CodeQL fix).
 *
 * The anchor on the temă page used to point straight at the Django export
 * URL built from NEXT_PUBLIC_API_BASE; CodeQL correctly flagged the env-
 * derived href (js/xss + unvalidated redirection). The anchor now targets
 * THIS relative route (no taint source), and the proxy forwards the
 * browser's auth cookies to the backend export endpoint server-side.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await context.params;
  if (!/^\d+$/.test(assignmentId)) {
    return NextResponse.json({ detail: "Bad assignment id." }, { status: 400 });
  }
  const cookie = request.headers.get("cookie") ?? "";
  try {
    // assignmentId is /^\d+$/ validated AND encodeURIComponent-encoded
    // before the upstream proxy hop (owner triage: alert #140, mitigated).
    // codeql[js/request-forgery]
    const upstream = await fetch(
      `${API_V1_URL}/classroom/assignments/${encodeURIComponent(assignmentId)}/export/`,
      {
        headers: cookie ? { cookie } : {},
        cache: "no-store",
      },
    );
    if (upstream.status === 401 || upstream.status === 403) {
      return NextResponse.json(
        { detail: "Only the teacher can export grades." },
        { status: upstream.status },
      );
    }
    if (!upstream.ok) {
      return NextResponse.json({ detail: "Export failed." }, { status: upstream.status });
    }
    const csv = await upstream.text();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="assignment-${assignmentId}-grades.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ detail: "Export failed." }, { status: 502 });
  }
}
