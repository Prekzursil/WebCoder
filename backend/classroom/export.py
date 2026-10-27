"""Gradebook CSV export (EDU-6).

Serializes the EDU-5 grid — per-student best score per problem + total —
into the CSV Romanian schools paste into "catalog electronic".
"""

import csv
import io


def grid_csv(assignment) -> str:
    """Return the assignment grid as a CSV document (str).

    One header row (username, one column per problem label, total), one row
    per student, scores in assignment-problem points.
    """
    from .grid import assignment_grid

    grid = assignment_grid(assignment)
    problems = grid["problems"]
    students = grid["students"]
    cells = grid["cells"]

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["username"]
        + [f"{ap.label} ({ap.points}p)" for ap in problems]
        + ["total"]
    )
    for student in students:
        row = [student.username]
        total = 0.0
        for ap in problems:
            cell = cells.get((student.id, ap.problem_id))
            if cell is None:
                row.append("")
                continue
            score = cell["best_score"]
            total += score
            row.append(f"{score:g}" + (" (late)" if cell["late"] else ""))
        row.append(f"{total:g}")
        writer.writerow(row)
    return buffer.getvalue()
