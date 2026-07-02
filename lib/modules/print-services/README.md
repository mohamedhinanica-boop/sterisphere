# Unified Print Services

Unified Print Services is the interpretation boundary for future SteriSphere
printing workflows.

> Workflows request printing. Unified Print Services creates print intent.
> Clinic Agent/printer executes output.

## Responsibilities

- Normalize a workflow print request.
- Classify its source and intent.
- Validate the minimum payload required by that intent.
- Return a structured `planned` or `failed` result.

The service does not send jobs, call the Clinic Agent, open browser printing,
write to the database, or render labels. Routing and execution remain separate
concerns.

## Initial model

Sources are `BROWSER`, `CLINIC_AGENT`, `SYSTEM`, and `UNKNOWN`.

Intents are `PACK_LABEL`, `TEST_LABEL`, `REPORT`, and `UNKNOWN`.

Job statuses are `planned`, `queued`, `sent`, `printed`, `failed`, and
`cancelled`. The resolver only produces `planned` or `failed`; execution layers
may own later status transitions.

This foundation intentionally does not replace the current browser fallback,
pack-label Local Print Agent request, Settings test-label diagnostic, label
generation, or audit behavior.
