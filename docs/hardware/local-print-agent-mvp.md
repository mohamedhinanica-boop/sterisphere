# Local Print Agent MVP

## Goal

The Local Print Agent will allow cloud-hosted SteriSphere on Vercel to print to
LAN printers that are only reachable from inside the clinic network.

Vercel cannot directly reach private printer addresses such as `192.168.2.34`.
Local testing confirmed that TCP printer connection checks work when the server
is running on the same LAN as the printer.

## Intended Flow

```text
SteriSphere Cloud
→ Local Print Agent running inside clinic network
→ LAN printer at configured IP/port
→ Label output
```

The Local Print Agent acts as the network bridge. SteriSphere Cloud coordinates
the workflow and audit trail; the agent performs the local printer operation.

## MVP Responsibilities

The first MVP should support:

- Health check endpoint
- Test printer connection
- Print test label
- Print pack label
- Use the configured printer IP and port
- Open a fresh TCP socket for every print job
- Close the socket after sending each job

The MVP should not keep long-lived printer sockets open. Each connection test or
print job should be isolated so failed printer state does not leak into later
jobs.

## MVP Platform

First target:

- Windows local agent installed on a clinic workstation or Windows tablet on the
  same LAN as the printer

Future targets:

- Android/tablet agent if direct network socket support and deployment are
  feasible
- PWA companion if browser platform constraints allow a safe local bridge

## Security Considerations

The Local Print Agent must not become an unauthenticated LAN print relay.

Required controls:

- Clinic-specific pairing token
- Only accept print jobs initiated from an authenticated SteriSphere session
- No open unauthenticated LAN printing
- No PHI in local agent logs
- Audit print events in SteriSphere

The agent should log operational status only, such as connection success,
connection failure, printer model, and job type. Patient details, pack contents,
and other PHI should remain out of local logs.

## Future Driver Abstraction

The agent should keep printer-specific command generation behind a small driver
interface. Initial driver families:

- Zywell TSPL
- Brother QL
- Brother TD
- Custom printer

The driver layer should accept normalized SteriSphere label data and return the
printer command payload for the selected model. This keeps the agent transport
logic separate from printer command formats.

## Current Behavior

No production printing behavior changes in this phase.

Existing browser/manual printing remains the active fallback. The current
Settings Test Connection path remains useful for local/server-on-LAN validation,
but production direct printing should route through the Local Print Agent once
implemented.
