# Clinic Agent Registration Security Blueprint

Phase 7.5B defines the security model for enrolling and authenticating
SteriSphere Clinic Agents. It is planning only: no API routes, database
changes, Supabase operations, heartbeat, pairing, device discovery, or local
agent behavior are implemented here.

## Security Goal

A Clinic Agent is trusted local infrastructure that can eventually report
hardware state and submit clinical events. Installation on a clinic computer is
not sufficient proof of identity. Every agent must be explicitly enrolled by a
Super Admin and authenticate every cloud request.

The enrollment flow is:

```text
One-time registration token
  -> verified enrollment request
  -> permanent agent credential
  -> authenticated agent requests
```

The public agent identity and authentication secrets must remain separate.

## Identity Concepts

| Concept | Purpose | Sensitivity |
| --- | --- | --- |
| `agent_id` | UUID database identity for the `clinical_agents` record. | Public within authorized cloud workflows. |
| `agent_key` | Stable, unique identifier used in requests, logs, and support workflows. | Not secret. |
| `registration_token` | High-entropy, short-lived, one-time enrollment secret. | Secret; shown and returned once. |
| `agent_credential` | High-entropy, long-lived credential issued after successful enrollment. | Secret; returned once and stored by the agent. |
| `credential_hash` | One-way representation used by the cloud to verify an agent credential. | Sensitive server-side data, but not usable as the credential. |
| `credential_last_rotated_at` | Timestamp of the latest credential replacement. | Audit metadata. |
| `revoked_at` | Timestamp after which the credential and agent must be rejected. | Security state. |

`agent_key` must never be treated as a password, API token, or pairing secret.
It may safely identify which stored credential hash should be checked.

## Registration Flow

1. A Super Admin creates or selects a planned Clinic Agent record.
2. SteriSphere Cloud generates a cryptographically secure, high-entropy
   registration token.
3. Cloud stores only the token hash, issuance time, and expiration time.
4. The plaintext token is shown to the Super Admin once.
5. The token is transferred to the intended Clinic Agent through a deliberate
   setup step.
6. The Clinic Agent sends the token and its public agent identity to
   `POST /api/clinic-agents/complete-registration` over HTTPS.
7. Cloud verifies the token hash, expiration, unused state, agent record,
   revocation state, and request rate limits.
8. Cloud generates a separate high-entropy permanent agent credential.
9. Cloud stores only the permanent credential hash and registration metadata.
10. The permanent credential is returned once to the Clinic Agent.
11. The Clinic Agent stores it in protected local configuration.
12. Cloud invalidates the registration token atomically before reporting
    enrollment success.

Token invalidation and credential creation must be one transaction or one
equivalent atomic server-side operation. A retry must not issue multiple active
credentials from the same token. A failed response after successful enrollment
requires a controlled reset or re-enrollment path rather than replaying the
consumed token.

## Token Requirements

- Generate tokens with a cryptographically secure random generator.
- Use enough entropy to make online and offline guessing impractical.
- Store only a hash or keyed hash, never the plaintext token.
- Use a short expiration window, initially 10 to 15 minutes.
- Display the plaintext token once and do not return it from later reads.
- Scope the token to one `agent_id`, clinic, and intended enrollment action.
- Mark it consumed or remove its hash immediately after successful use.
- Reissuing a token invalidates any previous unused token for that agent.
- Rate-limit issuance and completion attempts.
- Never place tokens in URLs, query strings, analytics, browser storage, audit
  descriptions, or application logs.

## Registration Lifecycle

The conceptual lifecycle is:

```text
planned
  -> token_issued
  -> registered
  -> online
  -> offline
  -> needs_attention
  -> retired
  -> revoked
```

Some transitions are not strictly linear. An online agent may become offline,
recover online, or move to `needs_attention`. Retirement is an operational
decision; revocation is a security action and must be enforceable immediately.

The current `clinical_agents.status` values describe operational state and do
not yet include `token_issued` or `revoked`. A future implementation should
either extend that constraint or, preferably, derive enrollment and revocation
state from dedicated timestamps while keeping operational status focused.
Regardless of display status, a non-null `revoked_at` is authoritative and must
block every authenticated agent call.

## Recommended V1 Authentication

Use an opaque Bearer credential over HTTPS for v1:

```http
Authorization: Bearer <agent_credential>
X-SteriSphere-Agent-Key: <agent_key>
```

Recommended credential properties:

- At least 256 bits of cryptographically secure random entropy.
- Encoded in a transport-safe form such as base64url.
- Returned once at registration or rotation.
- Stored only as a keyed hash in cloud persistence.
- Compared using constant-time verification.
- Scoped to one agent and clinic.

A keyed SHA-256 hash using a server-held pepper is appropriate for a uniformly
random machine credential. The pepper must remain in protected server
configuration, separate from Supabase data. Credential verification must occur
in trusted server code, never in the browser.

Bearer authentication is recommended for v1 because it is well-supported,
simple for a Windows service or local process, straightforward to rotate, and
less likely to suffer implementation errors than custom request signing. TLS
protects the credential in transit, so all agent-to-cloud requests must use
HTTPS.

### Future HMAC Request Signing

HMAC signing can later add request-body integrity and replay resistance by
signing the method, path, body digest, timestamp, and nonce. It also introduces
canonicalization rules, clock-skew handling, nonce storage, and more difficult
diagnostics. It should be introduced only with a versioned signing contract and
conformance tests.

Credential rotation can remain compatible with either approach. Cloud may
briefly accept current and next credential hashes during a controlled rotation,
then revoke the old credential after the agent confirms the new one.

## Authentication Enforcement

Every heartbeat, device, and event request must:

1. Resolve the agent from the public `agent_key`.
2. Reject missing, retired, or revoked agents.
3. Verify the presented credential against the stored hash.
4. Confirm clinic and endpoint scope.
5. Apply rate limits and request-size limits.
6. Record an auditable result without logging the credential.

Authentication failure responses should remain generic. Logs may include
`agent_id`, `agent_key`, request id, endpoint, and failure category, but never
tokens, credentials, hashes, authorization headers, or unnecessary clinical
payloads.

Revocation checks must not rely on a long-lived cache. If caching is introduced,
its invalidation model must make revocation effectively immediate.

## Planned API Shape

### `POST /api/clinic-agents/register-token`

Super-Admin-authenticated cloud operation. Issues a new one-time token for a
specific planned agent and invalidates any prior unused token.

### `POST /api/clinic-agents/complete-registration`

Unauthenticated only in the narrow sense that no permanent credential exists
yet. Requires the valid one-time token and agent identity. Returns the permanent
credential exactly once.

### `POST /api/clinic-agents/heartbeat`

Requires permanent agent authentication. Reports agent version and minimal
health metadata. Heartbeat behavior is not part of Phase 7.5B.

### `POST /api/clinic-agents/devices`

Requires permanent agent authentication. Reports discovered or registered
device inventory in a future phase.

### `POST /api/clinic-agents/events`

Requires permanent agent authentication. Accepts normalized, idempotent
clinical hardware events in a future phase.

All routes should use server-only credentials and authorization logic. Browser
sessions must not receive permanent agent credentials or call agent-authenticated
routes on behalf of an agent.

## Local Credential Storage

The Clinic Agent must treat its permanent credential as sensitive:

- Prefer the operating system credential store or platform encryption, such as
  Windows Credential Manager or DPAPI for a Windows-first agent.
- Bind protected storage to the intended service account or machine where
  practical.
- If a configuration file is unavoidable, restrict filesystem permissions to
  the agent service identity and local administrators.
- Keep credential files outside the source tree.
- Add credential/config patterns to ignore rules before implementation.
- Never commit, print, export, or include credentials in diagnostics.
- Avoid passing credentials through command-line arguments or process listings.
- Support an explicit reset that deletes local credentials and returns the
  agent to an unenrolled state.
- Support re-enrollment with a newly issued one-time token.

Backups and machine images containing credentials require the same protection
as the live installation. Copying a credential file to another computer must
not be the supported replacement workflow.

## Credential Rotation And Revocation

Future rotation should:

1. Authenticate with the current credential.
2. Create a new high-entropy credential.
3. Store the new hash and rotation timestamp.
4. Return the new credential once.
5. Confirm the agent has persisted it.
6. Remove acceptance of the previous credential.
7. Audit success or failure.

Super Admin revocation must set `revoked_at` and immediately reject current and
future credentials. Re-enrollment after revocation requires an explicit admin
decision and a new registration token; clearing local files alone cannot
restore cloud trust.

## Computer Replacement Workflow

When an agent computer is lost or fails:

1. Super Admin identifies the old `clinical_agents` record.
2. Super Admin revokes the old credential.
3. Cloud immediately rejects further requests from that credential.
4. Super Admin creates a replacement agent record or resets the approved
   identity according to the eventual retention policy.
5. Super Admin issues a new one-time registration token.
6. The replacement machine completes enrollment and stores its new credential.
7. The existing workstation assignment is preserved or deliberately reassigned.
8. Audit history continues to reference the old agent identity for historical
   events and the new identity for future events.

Reusing an `agent_key` should be avoided unless the product explicitly models
the replacement as the same logical agent. Physical replacement history must
remain visible either way.

## Audit Requirements

Security and assignment activity must create structured audit events:

- Registration token issued, reissued, expired, and consumed.
- Registration completed.
- Registration failed, including a safe failure category.
- Credential rotated or rotation failed.
- Agent revoked.
- Agent retired or restored.
- Agent assigned or reassigned to a workstation.
- Online-to-offline and offline-to-online transitions.

Audit records should include actor user id when admin initiated, `agent_id`,
`agent_key`, clinic id, workstation id when relevant, timestamp, request id,
outcome, and a safe reason. They must not contain plaintext tokens,
credentials, credential hashes, authorization headers, or sensitive local
configuration.

## Database Planning Notes

`clinical_agents` may eventually add:

| Column | Purpose |
| --- | --- |
| `registration_token_hash` | Verification value for the current one-time token. |
| `registration_token_expires_at` | Hard expiration time for token use. |
| `registration_token_issued_at` | Token issuance audit timestamp. |
| `registered_at` | Successful enrollment timestamp. |
| `credential_hash` | Verification value for the permanent credential. |
| `credential_last_rotated_at` | Latest successful rotation timestamp. |
| `revoked_at` | Authoritative credential revocation timestamp. |
| `revoked_by` | Admin user responsible for revocation. |
| `revoked_reason` | Structured or constrained revocation explanation. |

Additional implementation decisions:

- Token consumption and credential issuance require an atomic server-side
  transaction or database function.
- Hash columns should never be returned through ordinary Settings reads.
- Security mutations should run through trusted server routes, not direct
  browser Supabase writes.
- `revoked_by` may reference `auth.users(id)` with `on delete set null`.
- Consider a separate credential-history table if overlapping rotation,
  multiple credentials, or detailed revocation history becomes necessary.
- Add role-aware RLS only with the server authentication design; an anon-key
  browser policy must never expose secret hashes.

No columns in this section are added by Phase 7.5B.

## Security Boundaries

- Super Admin initiates enrollment, rotation, replacement, and revocation.
- Clinic Agent makes outbound HTTPS requests to SteriSphere Cloud.
- SteriSphere Cloud does not directly reach private clinic LAN hardware.
- Local device protocols remain behind the Clinic Agent.
- A registered agent is authorized only for its clinic and intended endpoints.
- Agent authentication does not grant browser or human-user permissions.

## Non-Goals For Phase 7.5B

- No API route implementation.
- No database migration or schema change.
- No Supabase read or write.
- No heartbeat, pairing, or device discovery.
- No Settings UI change.
- No scanner, patient traceability, pack, cycle, or print behavior change.
- No local Clinic Agent runtime change.

## Temporary Development Heartbeat Bridge

Phase 7.7A later introduced a controlled development heartbeat using a shared
server-side `CLINIC_AGENT_HEARTBEAT_SECRET` and matching local
`STERISPHERE_AGENT_HEARTBEAT_SECRET`. This bridge does not change the production
security decision in this document:

- `agent_key` remains a public identifier, not a secret.
- The temporary secret must come from environment configuration and must never
  be committed or exposed to browser code.
- Heartbeat authentication must migrate to unique permanent agent credentials
  after one-time registration and credential exchange are implemented.
- The temporary shared secret should be removed when that migration is
  complete.
