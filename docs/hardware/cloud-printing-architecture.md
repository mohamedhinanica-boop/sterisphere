# Cloud Printing Architecture

## Why Vercel Cannot Reach Local Printers

SteriSphere Cloud runs outside the clinic network. Private LAN printer
addresses such as `192.168.x.x`, `10.x.x.x`, and `172.16.x.x` are only routable
inside the clinic network, so a Vercel-hosted API route cannot open a TCP
connection to those printers.

This is expected network behavior and not a printer failure.

## What Was Validated Locally

The current Test Connection API can validate network reachability when the
SteriSphere server is running on the same LAN as the printer. In local
development, the server can attempt a short TCP connection to the configured
printer IP and port, such as port `9100`.

This proves the settings form, server-side TCP probe, and LAN printer endpoint
can work in local/server-on-LAN mode.

## Why a Local Print Agent Is Needed

Production direct printing needs a trusted process inside the clinic network.
That process can reach LAN printer addresses and can receive print/test
requests from SteriSphere Cloud over an outbound connection.

The future Local Print Agent should run on a clinic workstation or tablet on the
same network as the label printer. SteriSphere Cloud should send an authenticated
request to that agent, and the agent should perform the local TCP printer
operation.

## Future Flow

```text
SteriSphere Cloud → Local Print Agent → LAN Printer → Label
```

## Print Agent Registration Path

The MVP Local Agent URL remains available as a development override. Production
direct printing should move to a clinic-level registered Print Agent record so
each SteriSphere client can discover the same clinic agent without manually
entering a local URL.

The registration model is expected to track the agent `id`, `clinic_id`,
`display_name`, `version`, `last_seen`, `status`, `local_endpoint`, and
`default_printer`.

Future Test Connection should ask the Local Print Agent to probe the configured
printer. Future Print Test Label should also route through the Local Print Agent
instead of attempting to print directly from Vercel.

## Current Fallback

The existing browser/manual print flow remains active. Pack label preview and
manual browser printing are unchanged until the Local Print Agent and direct
printing workflow are implemented.
