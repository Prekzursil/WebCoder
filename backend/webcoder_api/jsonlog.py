"""JSON log formatter (round-2 X3d), isolated from model imports.

Lives in its own module because Django configures LOGGING during
``django.setup()`` — before app registries are ready — so the formatter's
module must import nothing but the stdlib.
"""

from __future__ import annotations

import json
import logging


class JsonFormatter(logging.Formatter):
    """One JSON object per log line: ts, level, logger, message (+exc_info).

    Enabled by ``LOG_JSON=1`` (the compose stack sets it) so
    ``docker compose logs`` output is machine-parseable; the default
    remains the plain console formatter for dev.
    """

    def format(self, record):
        entry = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)
