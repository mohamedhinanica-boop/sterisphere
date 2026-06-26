# Clinical Hardware Inventory Architecture

Phase 7.3A defines the planning architecture for clinical hardware inventory.
This is documentation only. It does not add Supabase reads or writes, migrations,
scanner behavior, Clinic Agent runtime changes, or UI behavior.

## Inventory Hierarchy

```text
Clinic
  -> Workstations / Rooms
    -> Hardware Devices
      -> Capabilities
```

Definitions:

- Clinic: the tenant and operational boundary for settings, users, audit logs,
  and clinical workflow.
- Workstation / Room: a physical clinical location such as Reception,
  Sterilization Room, Operatory 1, or Operatory 2.
- Hardware Device: a physical device connected to or associated with a
  workstation, such as a printer, USB scanner, camera, speaker, sterilizer,
  environment sensor, RFID reader, NFC reader, or future custom device.
- Capability: the actions a device can perform, such as printing labels,
  scanning QR codes, capturing images, playing sounds, or reading sterilizer
  cycle data.

## Why Devices Belong To Workstations

Devices should belong to workstations rather than directly to clinics because
clinical meaning is location-dependent. A scanner in Operatory 1 is not
equivalent to a scanner at Reception, even when both are attached to the same
clinic. The room identity affects workflow, audit context, user expectations,
and recovery when hardware fails.

Workstation ownership preserves:

- Room-level audit context for scans, prints, alerts, and future sterilizer
  readings.
- Clear operational readiness by location before the clinic day starts.
- Predictable user experience for assistants who work in fixed rooms.
- Safer replacement flows where a physical device can change without changing
  the room or workflow identity.
- Future support for local Clinic Agent discovery while allowing SteriSphere
  Cloud to decide which workstation owns each discovered device.

Clinic-level hardware can still exist conceptually for shared assets, but the
clinical workflow should resolve hardware through workstation assignment when a
device can affect patient care or audit history.

## Planning HardwareDevice Model

Future hardware records should use a stable model:

| Field | Purpose |
| --- | --- |
| `device_id` | Stable registered hardware identifier. |
| `device_name` | Human-readable name, such as Operatory 1 USB Scanner. |
| `device_type` | Device category such as `printer` or `usb_scanner`. |
| `manufacturer` | Vendor/manufacturer name when known. |
| `model` | Device model when known. |
| `serial_number` | Physical serial number when available. |
| `firmware_version` | Device or agent-reported firmware version when available. |
| `connection_type` | Connection path such as USB, LAN, Wi-Fi, Bluetooth, serial, virtual, or unknown. |
| `agent_id` | Clinic Agent responsible for local communication when applicable. |
| `workstation_id` | Assigned workstation or room identity. |
| `status` | Lifecycle/operational state. |
| `last_seen` | Last heartbeat or discovery timestamp. |
| `health` | Diagnostics summary such as online state, error state, and last successful operation. |
| `capabilities` | Capabilities exposed by the device. |
| `created_at` | Creation timestamp. |
| `updated_at` | Last update timestamp. |

This model is planning-only until hardware persistence is added.

## Device Categories

Initial device categories:

- `printer`
- `usb_scanner`
- `camera`
- `speaker`
- `sterilizer`
- `environment_sensor`
- `rfid_reader`
- `nfc_reader`
- `future_custom`

The category describes the physical device. Capabilities describe what the
device can do. For example, a future custom device might expose
`read_temperature` and `read_humidity`, while a camera might expose `scan_qr`
and `capture_image`.

## Capability Examples

Initial capability examples:

- `print_labels`
- `scan_qr`
- `scan_barcode`
- `capture_image`
- `play_sound`
- `read_cycle`
- `read_temperature`
- `read_humidity`

Capabilities should be additive. A device may expose more than one capability,
and future phases can add capabilities without changing the workstation
hierarchy.

## Hardware Lifecycle

```text
Discovered
  -> Registered
  -> Assigned to workstation
  -> Active
  -> Maintenance
  -> Retired
```

Lifecycle meaning:

- Discovered: Clinic Agent sees local hardware, but SteriSphere has not
  registered it.
- Registered: SteriSphere knows the device identity and basic metadata.
- Assigned to workstation: Super admin maps the device to a clinical room.
- Active: Device is available for clinical workflows or diagnostics.
- Maintenance: Device is known but should not be used for normal workflows.
- Retired: Device is no longer part of the active clinic inventory.

## Future Clinic Agent Discovery Flow

The Clinic Agent should eventually expose a local discovery endpoint:

```http
GET /devices
```

The response should list locally discovered hardware with minimal diagnostic
metadata. Example shape:

```json
{
  "agent_id": "agent-op1-001",
  "devices": [
    {
      "local_device_id": "usb-scanner-001",
      "device_name": "Honeywell USB Scanner",
      "device_type": "usb_scanner",
      "manufacturer": "Honeywell",
      "model": "Example Scanner",
      "serial_number": null,
      "firmware_version": null,
      "connection_type": "usb",
      "capabilities": ["scan_barcode", "scan_qr"],
      "health": {
        "online": true,
        "connection_state": "connected",
        "last_successful_operation_at": null,
        "error_code": null,
        "error_message": null
      }
    }
  ]
}
```

The Clinic Agent discovers what is physically available. SteriSphere Cloud later
decides which workstation owns each device and whether that device is allowed
to participate in clinical workflows.

## Diagnostics Philosophy

Diagnostics should make the hardware state visible without exposing low-level
device internals unnecessarily.

Minimum diagnostic concepts:

- Online/offline state.
- Last heartbeat.
- Firmware version.
- Connection health.
- Error state.
- Last successful operation.

Diagnostics should support plain operational questions:

- Is this room ready?
- Which hardware is offline?
- Which device needs attention?
- When did this device last successfully scan, print, play audio, capture an
  image, or read a cycle?
- Is a failure due to cloud connectivity, Clinic Agent connectivity, local
  hardware, or workflow validation?

## Replacement Philosophy

Replacing hardware should preserve room identity, workflow, and audit history.
Only the physical device identity changes.

Example: if Operatory 1 replaces a USB scanner, the workstation remains
Operatory 1, patient trace workflows remain associated with Operatory 1, and
historical audit logs still point to the original scanner for past events. New
events should reference the replacement device after it is registered and
assigned.

This separation allows:

- Room-level continuity during hardware refresh.
- Clean audit history across device replacement.
- Reduced reconfiguration for clinical users.
- Safer rollback if replacement hardware fails.

## Future Implementation Phases

- 7.3A Documentation.
- 7.3B Workstation persistence.
- 7.3C Hardware persistence.
- 7.4 Agent registration.
- 7.5 Device registration.
- 7.6 Diagnostics.
- 7.7 Scanner integration.
- 7.8 Sterilizer integration.

## Non-Goals For 7.3A

- No Supabase reads or writes.
- No migrations.
- No scanner implementation.
- No Clinic Agent runtime changes.
- No UI changes.
- No patient tracing, packs, cycles, or print workflow changes.
