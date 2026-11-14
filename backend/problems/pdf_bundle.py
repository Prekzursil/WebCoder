"""Offline study-bundle PDFs (competitive roadmap RO-6).

A dependency-free PDF writer: the archive's "PDF bundle downloads for
offline study" is statement + sample tests in one printable file, and the
backend deps stay pinned (no reportlab — a minimal Type1-Helvetica PDF is
~80 lines and fully testable).

Only latin-1 encodable text is written (Helvetica WinAnsi); characters
outside it are replaced with '?' so any statement degrades visibly rather
than crashing the download.
"""

PAGE_WIDTH = 595.28  # A4, points
PAGE_HEIGHT = 841.89
MARGIN = 56.0
BODY_SIZE = 10.0
HEADING_SIZE = 14.0
LEADING = 14.0
MAX_CHARS_PER_LINE = 88  # Helvetica 10pt on a ~483pt text column


def _escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .encode("latin-1", errors="replace")
        .decode("latin-1")
    )


def _wrap(text: str, width: int = MAX_CHARS_PER_LINE) -> list[str]:
    """Character-wrap preserving existing line breaks (statements carry
    their own layout; the bundle is for offline reading, not typesetting)."""
    lines: list[str] = []
    for raw_line in text.splitlines() or [""]:
        if len(raw_line) <= width:
            lines.append(raw_line)
            continue
        words = raw_line.split(" ")
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if len(candidate) > width and current:
                lines.append(current)
                current = word
            else:
                current = candidate
        lines.append(current)
    return lines or [""]


def build_pdf(sections: list[tuple[str, str]]) -> bytes:
    """Render (heading, body) sections into a valid single-font PDF.

    Returns raw PDF bytes with one page per ~52 lines; the caller streams
    them as ``application/pdf``.
    """
    lines_per_page = int((PAGE_HEIGHT - 2 * MARGIN) // LEADING) - 1
    pages: list[list[str]] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            pages.append(current)

    for heading, body in sections:
        if current and len(current) + 2 > lines_per_page:
            flush()
            current = []
        current.append(("heading", heading))
        for line in _wrap(body):
            if len(current) >= lines_per_page:
                flush()
                current = []
            current.append(("body", line))
    flush()
    if not pages:
        pages = [[("body", "")]]

    content_streams: list[bytes] = []
    for page_lines in pages:
        ops: list[str] = ["BT"]
        y = PAGE_HEIGHT - MARGIN
        for kind, line in page_lines:
            size = HEADING_SIZE if kind == "heading" else BODY_SIZE
            font = "/F2" if kind == "heading" else "/F1"
            ops.append(f"{font} {size:.1f} Tf")
            ops.append(f"1 0 0 1 {MARGIN:.2f} {y:.2f} Tm")
            ops.append(f"({_escape(line)}) Tj")
            y -= LEADING
        ops.append("ET")
        content_streams.append("\n".join(ops).encode("latin-1", errors="replace"))

    objects: list[bytes] = []
    n_content = len(content_streams)
    # Object numbering: 1 catalog, 2 pages, 3 F1, 4 F2, then page pairs.
    first_page_obj = 5
    page_ids = [first_page_obj + 2 * i for i in range(n_content)]
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_content} >>".encode())
    objects.append(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
    objects.append(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )
    for index, stream in enumerate(content_streams):
        page_id = page_ids[index]
        content_id = page_id + 1
        objects.append(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "
                f"{PAGE_WIDTH:.2f} {PAGE_HEIGHT:.2f}] /Resources << /Font "
                f"<< /F1 3 0 R /F2 4 0 R >> >> /Contents {content_id} 0 R >>"
            ).encode()
        )
        objects.append(
            b"<< /Length "
            + str(len(stream)).encode()
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        )

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


def problem_bundle_pdf(problem, samples) -> bytes:
    """The offline study bundle for one problem: title, statements (EN then
    RO when present), limits, provenance and every sample test."""
    title = (
        problem.title_i18n.get("en") or next(iter(problem.title_i18n.values()), "")
        if isinstance(problem.title_i18n, dict)
        else ""
    )
    sections: list[tuple[str, str]] = [(title or f"Problem {problem.id}", "")]
    for lang in ("en", "ro"):
        statement = (
            problem.statement_i18n.get(lang, "")
            if isinstance(problem.statement_i18n, dict)
            else ""
        )
        if statement:
            sections.append((f"Statement ({lang.upper()})", statement))
    sections.append(
        (
            "Limits",
            f"Time: {problem.default_time_limit_ms} ms\n"
            f"Memory: {problem.default_memory_limit_kb} KB",
        )
    )
    if problem.source_contest or problem.source_year or problem.grade_group:
        sections.append(
            (
                "Provenance",
                " ".join(
                    part
                    for part in (
                        problem.source_contest,
                        str(problem.source_year or ""),
                        problem.grade_group,
                    )
                    if part
                ),
            )
        )
    for index, test in enumerate(samples, start=1):
        sections.append(
            (
                f"Sample {index}",
                f"Input:\n{test.input_data}\nExpected output:\n{test.expected_output_data}",
            )
        )
    return build_pdf(sections)
