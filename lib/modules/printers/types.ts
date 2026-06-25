export type CertifiedPrinterModel =
  | "brother_ql_820nwb"
  | "brother_td_4550dnwb"
  | "zywell_zy_series"
  | "custom";

export type PrinterConnectionType = "wifi" | "ethernet" | "usb";

export type PrinterCertificationTier = "Premium" | "Professional" | "Value";

export type PrinterModelOption = {
  value: CertifiedPrinterModel;
  label: string;
  certificationTier?: PrinterCertificationTier;
};

export const CERTIFIED_PRINTER_MODELS: PrinterModelOption[] = [
  {
    value: "brother_ql_820nwb",
    label: "Brother QL-820NWB",
    certificationTier: "Premium",
  },
  {
    value: "brother_td_4550dnwb",
    label: "Brother TD-4550DNWB",
    certificationTier: "Professional",
  },
  {
    value: "zywell_zy_series",
    label: "Zywell ZY Series",
    certificationTier: "Value",
  },
  {
    value: "custom",
    label: "Custom Printer",
  },
];

export const PRINTER_CONNECTION_TYPES: Array<{
  value: PrinterConnectionType;
  label: string;
}> = [
  { value: "wifi", label: "Wi-Fi" },
  { value: "ethernet", label: "Ethernet" },
  { value: "usb", label: "USB" },
];

export const DEFAULT_PRINTER_PORT = 9100;
export const DEFAULT_LABEL_WIDTH_MM = 50;
export const DEFAULT_LABEL_HEIGHT_MM = 30;
