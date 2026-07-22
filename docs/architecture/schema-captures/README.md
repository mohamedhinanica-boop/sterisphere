# Schema capture evidence

This directory documents the review boundary for database schema captures. It intentionally contains no Production dump or generated Production manifest.

Raw schema evidence and its first generated manifest belong under the gitignored local path:

```text
.tmp/schema-captures/<UTC capture id>/
```

Do not copy a raw capture into this directory. Before any normalized manifest or baseline is proposed for a later commit, complete the automated validation and manual review in `../production-schema-capture.md`, then reconcile it using `../production-schema-reconciliation.md`.

A later reviewed manifest may contain object names and counts only. It must not contain rows, comments copied from raw DDL, credentials, URLs, owner identities, tenant identifiers, or environment secrets.
