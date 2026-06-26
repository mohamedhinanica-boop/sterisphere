# Smart Clinical Workstations

## Overview

Phase 7 expands the validated SteriSphere Clinic Agent from a print-only bridge
into the local hardware abstraction layer for each clinic workstation.

Every clinical workstation represents a physical room or location in the
clinic. Examples:

- Reception
- Sterilization Room
- Operatory 1
- Operatory 2
- Operatory 3
- Operatory 4

Each workstation may have:

- Computer
- SteriSphere Clinic Agent
- Barcode scanner
- Label printer
- Camera
- Speakers
- Future sterilizer connection

The long-term architecture is:

```text
SteriSphere Cloud -> Browser -> SteriSphere Clinic Agent -> Local hardware
```

The browser remains the clinical interface. The Clinic Agent owns safe local
hardware access inside the clinic network.

## Supported Workflows

### Tablet Workflow

The tablet workflow remains useful for mobile work, sterilization areas, or
rooms without a fixed workstation. Staff scan packs with the tablet camera,
review the traceability context, and continue the clinical workflow from the
tablet.

### USB Scanner Workflow

Each operatory computer can use a dedicated USB barcode scanner. This creates a
faster workflow for chairside traceability:

1. Assistant enters the room.
2. Patient is already open in SteriSphere.
3. Assistant scans the pouch barcode.
4. SteriSphere records traceability automatically.
5. Assistant opens the pouch.
6. Treatment begins.

No tablet handling is required during treatment setup.

### Hybrid Workflow

Clinics can use both tablets and workstation scanners. Tablets support mobile
tasks and flexible areas. USB scanners support fixed operatory workflows where
speed, ergonomics, and clean handling matter most.

### Multi-Room Workflow

Each room can have its own workstation identity, attached scanner, and assigned
printer. SteriSphere can eventually distinguish where each scan or print event
occurred, such as Reception, Sterilization Room, or Operatory 3.

## Why USB Scanners Improve Workflow

Dedicated USB scanners reduce handling friction in clinical rooms:

- The scanner is always in the same place.
- Staff do not need to find, unlock, or disinfect a tablet for routine scans.
- The patient chart can already be open on the room computer.
- Scanning a pouch can immediately attach pack traceability to the active
  patient context.
- Staff can open the pouch after the scan without switching devices.
- Fixed-room scanning creates better room-level audit context.

This is faster, more ergonomic, and safer than relying exclusively on mobile
tablet camera scanning.

## Clinic Agent Responsibilities

The SteriSphere Clinic Agent becomes the bridge between SteriSphere Cloud and
local clinic hardware.

Responsibilities include:

- Printing pack labels and test labels.
- Receiving scanner events from attached barcode scanners.
- Coordinating camera integration for scanning or documentation workflows.
- Playing local audio alerts through workstation speakers.
- Supporting future local hardware such as sterilizer connections.

The Clinic Agent should abstract local device details so SteriSphere Cloud can
work with consistent workstation capabilities instead of device-specific code.

## Workstation Identity

Each workstation should eventually have a registered identity:

- Room name
- Agent ID
- Hardware inventory
- Online status
- Assigned printers
- Assigned scanners

Example:

```text
Room Name: Operatory 3
Agent ID: agent-op3-001
Hardware: USB scanner, label printer, speakers
Online Status: Online
Assigned Printer: Zywell ZY Series
Assigned Scanner: Scanner S-003
```

## Future Workstation Management

Future management features should include:

- Workstation registration.
- Clinic Agent heartbeat.
- Online/offline health monitoring.
- Hardware diagnostics.
- Scanner test events.
- Printer test events.
- Camera availability checks.
- Speaker/audio alert checks.

This would allow an administrator to see whether each room is ready for
clinical work before the day starts.

## Audit Improvements

Workstation identity improves traceability and audit quality. Instead of only
recording that a pack was scanned, SteriSphere can record where and how it was
scanned.

Example audit event:

```text
Event: Pack scanned
Room: Operatory 3
User: Assistant Sarah
Time: 10:42:15
Scanner: Scanner S-003
```

This creates stronger clinical accountability and better operational insight.

## Future Compatibility

The workstation architecture should remain hardware-flexible.

Potential scanner inputs:

- Generic HID barcode scanners
- Honeywell scanners
- Zebra scanners
- Socket Mobile scanners
- Tablet camera
- Mobile phone camera

Potential future hardware:

- Label printers
- Room cameras
- Speakers
- Sterilizers
- Other local clinical devices

The Clinic Agent should support incremental hardware integrations without
requiring SteriSphere Cloud to directly access the local network.
