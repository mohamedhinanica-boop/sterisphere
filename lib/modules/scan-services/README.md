# Unified Scan Services

Unified Scan Services is the single interpretation boundary for scan data in
SteriSphere.

> Hardware produces scan data.  
> Unified Scan Services produces clinical intent.

## Responsibilities

- Record the source of a scan.
- Normalize the raw scanned value.
- Classify the value into a structured clinical intent.
- Return data only. The service does not navigate, show UI, query or write to
  the database.

Feature modules remain responsible for domain validation and user actions. For
example, Patient Traceability decides whether a `PACK_TRACE` candidate is a
currently usable pack.

## Future scan sources

The source model includes USB HID, tablet camera, mobile camera, Bluetooth
scanner, system-generated and unknown sources. Adding a source adapter should
not change the service contract.

## Future scan intents

The initial intents are `PACK_TRACE` and `UNKNOWN`. The model is intended to
grow with intents such as `INSTRUMENT`, `STERILIZER`, `PACK_LABEL`, `INVENTORY`
and `DOCUMENT` without moving feature behavior into this service.
