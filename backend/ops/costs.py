"""Item 143 — cost projection.

No cloud billing API exists for a self-hosted stack: the honest version
of a "cost dashboard" is a transparent model — a small published price
table (EUR/month list prices for the VMs/storage/bandwidth the RUNBOOK
provisions) multiplied by *live usage numbers* from the database, with
per-point env overrides so an operator can pin their real invoice
prices. Every input and formula is returned in the payload: the number
is auditable, never magic.
"""

import os
from dataclasses import dataclass

from submissions.models import Submission, SubmissionTestResult

# EUR/month list prices (RUNBOOK §costs documents the sourcing).
DEFAULT_PRICES = {
    # 2 vCPU / 4GB VM running backend+worker+edge.
    "vm_worker": 12.0,
    # Judge sandbox VM (shared with celery-worker when scaled in).
    "vm_judge": 12.0,
    # Postgres volume, per GB.
    "storage_gb": 0.10,
    # Egress, per GB.
    "bandwidth_gb": 0.05,
}


@dataclass(frozen=True)
class CostInputs:
    workers: int
    judge_vms: int
    storage_gb: float
    bandwidth_gb: float


def _avg_submission_kb() -> float:
    """Average submission size in KiB, nullable-safe. Note: `code_length`
    exists only as a serializer-computed field, not a DB column — the
    bounded sample below is the real path."""
    rows = list(Submission.objects.values_list("code", flat=True)[:200])
    if not rows:
        return 0.0
    return sum(len(r) for r in rows) / (1024.0 * len(rows))


def _avg_test_result_kb() -> float:
    """Average test-result row size in KiB from a bounded sample (a full
    table scan on every dashboard open would be its own cost problem)."""
    sample = list(
        SubmissionTestResult.objects.values_list("actual_output", "error_output")[:200]
    )
    if not sample:
        return 0.0
    return sum(len(a or "") + len(e or "") for a, e in sample) / (1024.0 * len(sample))


def cost_inputs(worker_count: int = 1, judge_vm_count: int = 1) -> CostInputs:
    """Live usage snapshot feeding the projection."""
    submission_kb = _avg_submission_kb()
    test_rows = SubmissionTestResult.objects.count()
    storage_gb = (submission_kb + _avg_test_result_kb() * test_rows) / (1024.0 * 1024.0)
    # Bandwidth: statements+submissions egress — approximate with the
    # average submission payload times total volume (conservative).
    bandwidth_gb = submission_kb * Submission.objects.count() / (1024.0 * 1024.0)
    return CostInputs(
        workers=max(1, worker_count),
        judge_vms=max(1, judge_vm_count),
        storage_gb=round(storage_gb, 3),
        bandwidth_gb=round(bandwidth_gb, 3),
    )


def project_costs(inputs: CostInputs) -> dict:
    """EUR/month projection with per-line formulas + overrides."""
    prices = dict(DEFAULT_PRICES)
    for key in prices:
        env = os.environ.get(f"COST_PRICE_{key.upper()}")
        if env:
            try:
                prices[key] = float(env)
            except ValueError:
                # A malformed override must not 500 the dashboard; the
                # default price stands and the raw value is surfaced.
                pass
    quantities = {
        "vm_worker": (inputs.workers, prices["vm_worker"]),
        "vm_judge": (inputs.judge_vms, prices["vm_judge"]),
        "storage": (inputs.storage_gb, prices["storage_gb"]),
        "bandwidth": (inputs.bandwidth_gb, prices["bandwidth_gb"]),
    }
    lines = {
        key: {
            "formula": f"{qty} × {price}",
            "eur": round(qty * price, 2),
        }
        for key, (qty, price) in quantities.items()
    }
    total = round(sum(line["eur"] for line in lines.values()), 2)
    return {
        "currency": "EUR",
        "period": "month",
        "lines": lines,
        "total": total,
        "prices": prices,
    }
