# @webcoder/ui — open client components

The open-source surface of WebCoder per `docs/DECISION-OPEN-SOURCE.md`:
**well-scoped client components, MIT, on a rolling basis; the platform
itself stays closed pre-traction, with no self-host support.**

## Components

- `flush-notice` — the interactive-problem flush notice pattern: an
  accessible, self-contained banner telling contestants when to flush
  their output for interactive judges. Zero dependencies, framework
  adapters for React.

## Versioning

Components release independently of the platform; each carries its own
CHANGELOG. Breaking changes bump the major.

## Scope guarantees

Everything in this package:

- is free of platform trust heuristics (no anti-cheat, no moderation
  logic),
- talks to no WebCoder API by default,
- and is tested at the same bar as the platform (see CONTRIBUTING).
