# Scanner Selection — SteriSphere

## Purpose

This document records the scanner selection strategy for SteriSphere hardware validation and future clinic deployment.

The goal is to support safe, efficient, hands-free patient traceability workflows while preserving hardware flexibility for clinics of different sizes and budgets.

---

## Product Principle

SteriSphere should encourage the safest and most efficient scanning workflow without forcing clinics to purchase unnecessary hardware.

Hardware improves efficiency, automation, and user experience, but core traceability must remain achievable with accessible devices.

---

## Preferred Clinical Workflow

The preferred workflow is hands-free scanning at or near the room of use.

Example:

1. Assistant opens the patient traceability workflow.
2. Sterile pouch is brought to the operatory.
3. Assistant presents the pouch QR code to a standing scanner.
4. Scanner reads automatically.
5. SteriSphere assigns the pack to the active patient context.
6. Audit log records user, workstation, device, and timestamp.

This minimizes unnecessary contact with shared hardware and supports better infection-prevention workflow.

---

## Scanner Requirements

### Required

- USB wired connection
- USB HID keyboard mode
- Plug and play, no driver required
- QR code support
- 1D barcode support
- Data Matrix support
- Ability to append Enter or equivalent suffix after scan
- Works with Windows browser workflows
- Works with SteriSphere QR labels

### Strongly Preferred

- Hands-free presentation mode
- Automatic detection mode
- Continuous scanning mode
- Stable stand included
- Good scan speed
- Reads labels from thermal printer output
- Reads QR codes from screens
- Affordable enough for small clinics

### Not Required for V1

- Bluetooth
- Wi-Fi
- Vendor SDK
- RFID
- NFC
- Proprietary drivers

---

## Development Scanner Selected

### Eyoyo 2D USB Wired Barcode Scanner with Gooseneck Stand

Status: Ordered for validation

Reason for selection:

- Low cost
- Fast Amazon Canada delivery
- USB plug-and-play
- Supports QR, 1D, Data Matrix, PDF417
- Includes flexible gooseneck stand
- Supports trigger mode, automatic detection mode, and continuous scanning mode
- Enables hands-free presentation workflow
- Suitable for early SteriSphere scanner integration testing

This device is selected as the first development scanner, not yet as the official enterprise-certified scanner.

---

## Enterprise Reference Scanner

### Zebra DS2208 USB Kit with Presentation Stand

Status: Planned for future certification

Reason for future validation:

- Enterprise-grade brand
- Widely used and recognized
- Strong documentation
- USB HID support
- 1D and 2D scanning
- Suitable for professional clinic deployment packages
- Better fit for future SteriSphere Certified Hardware Kit

The Zebra DS2208 remains the preferred long-term scanner for official SteriSphere clinic packaging and demonstrations.

---

## Hardware Strategy

SteriSphere separates:

### Development Hardware

Used internally to build and validate workflows quickly.

Example:

- Eyoyo USB 2D scanner

### Certified Hardware

Recommended to clinics for professional deployment.

Example:

- Zebra DS2208 USB Kit with presentation stand

Both categories are important.

Development hardware helps us move quickly. Certified hardware supports professional deployment confidence.

---

## Scanner Validation Checklist

When the Eyoyo scanner arrives, validate:

- USB HID recognition on Windows
- Scan into Notepad
- Scan into browser input
- Scan into SteriSphere QR fields
- Confirm Enter suffix after scan
- Trigger mode
- Automatic detection mode
- Continuous mode
- Hands-free scanning from stand
- SteriSphere QR labels
- Thermal printed labels
- Phone screen QR codes
- Data Matrix code
- PDF417 code
- Scan distance
- Scan angle
- Repeated scans
- Duplicate scan behavior
- Tablet/browser behavior if applicable

---

## Future Certification Matrix

| Device | Category | Status |
|---|---|---|
| Eyoyo 2D USB Scanner with Gooseneck Stand | Development scanner | Ordered / Pending validation |
| Zebra DS2208 USB Kit with Stand | Enterprise scanner | Planned |
| Honeywell Voyager 1470g | Enterprise scanner | Candidate |
| NETUM 2D USB Scanner | Budget scanner | Candidate |
| Datalogic QuickScan 2500 | Enterprise scanner | Candidate |

---

## Final Decision

The Eyoyo scanner is the correct first scanner for SteriSphere development because it enables immediate validation of the hands-free QR scanning workflow at low cost and with fast delivery.

The Zebra DS2208 remains the preferred future enterprise reference scanner for the official SteriSphere Certified Hardware Kit.