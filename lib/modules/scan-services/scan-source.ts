export const ScanSource = {
  USB_HID: "USB_HID",
  TABLET_CAMERA: "TABLET_CAMERA",
  MOBILE_CAMERA: "MOBILE_CAMERA",
  BLUETOOTH_SCANNER: "BLUETOOTH_SCANNER",
  SYSTEM: "SYSTEM",
  UNKNOWN: "UNKNOWN",
} as const;

export type ScanSource = (typeof ScanSource)[keyof typeof ScanSource];
