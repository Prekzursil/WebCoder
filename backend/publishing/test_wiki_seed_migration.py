"""The wiki seed must not run before the publishing models exist.

Nightly compose applies migrations for real (pytest uses --nomigrations,
so this never showed up there). ``RunPython`` receives the state from
*before* the current operation. Seeding as the first operation of the
initial migration asks for ``publishing.WikiPage`` while the app is not
in the project state yet, and boot dies with LookupError — /readyz never
answers.
"""

import importlib

from django.db import migrations

Migration = importlib.import_module("publishing.migrations.0001_initial").Migration


def test_wiki_seed_runs_after_its_models_exist():
    ops = Migration.operations

    def index(predicate):
        return next(i for i, op in enumerate(ops) if predicate(op))

    seed = index(lambda op: isinstance(op, migrations.RunPython))
    wiki = index(
        lambda op: isinstance(op, migrations.CreateModel) and op.name == "WikiPage"
    )
    revision = index(
        lambda op: isinstance(op, migrations.CreateModel) and op.name == "WikiRevision"
    )
    assert seed > wiki
    assert seed > revision
