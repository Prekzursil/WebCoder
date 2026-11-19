"""Item 136 — autoscaling recommendation logic (pure, testable).

The stack is self-hosted docker compose: "autoscaling" is the operator
(or a cron wrapper) running ``docker compose up -d --scale
celery-worker=N``. What the platform itself contributes is the *decision
function*: given live queue depth, recent judge throughput and a sizing
policy, how many workers should be running right now? The same function
backs the admin recommendation card and ``scripts/judge-autoscale.sh``
(--dry-run prints the number, default applies it).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AutoscalePolicy:
    """Sizing policy — defaults documented in RUNBOOK §autoscaling."""

    min_workers: int = 1
    max_workers: int = 6
    # Queue entries each worker is expected to drain per minute (measured
    # ~6-10 for the local docker judge; conservative default).
    drain_per_worker_per_minute: float = 5.0
    # Beyond this backlog a worker is added even when throughput is fine
    # (contest start burst).
    burst_threshold: int = 15


def recommended_workers(
    queue_depth: int,
    arrivals_per_minute: float = 0.0,
    policy: AutoscalePolicy | None = None,
) -> int:
    """Workers needed to drain ``queue_depth`` within ~a minute while
    absorbing ``arrivals_per_minute``. Clamped to [min_workers,
    max_workers]; never NaN/negative for degenerate inputs."""
    policy = policy or AutoscalePolicy()
    depth = max(0, int(queue_depth))
    arrivals = max(0.0, float(arrivals_per_minute))

    load = depth + arrivals
    if load == 0:
        return policy.min_workers
    needed = load / policy.drain_per_worker_per_minute
    import math

    workers = max(1, math.ceil(needed))
    if depth >= policy.burst_threshold:
        # Contest-start burst: one worker over the steady-state math.
        workers += 1
    return max(policy.min_workers, min(policy.max_workers, workers))


def scale_direction(current_workers: int, recommended: int) -> str:
    """One of up/down/hold — the dashboard badge and the script's log."""
    if recommended > current_workers:
        return "up"
    if recommended < current_workers:
        return "down"
    return "hold"
