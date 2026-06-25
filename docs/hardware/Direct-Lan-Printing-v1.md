# Direct LAN Printing v1.0

Status:
Production Validated

Date:
2026-06-25

Validated Printer:
- Zywell ZY Series
- TSPL
- Wi-Fi
- TCP Port 9100

Architecture

Browser (Vercel)
        │
        ▼
Local Print Agent (localhost:8787)
        │
        ▼
TCP Socket
        │
        ▼
Printer (192.168.2.34:9100)

Capabilities validated

✓ Local Print Agent reachable
✓ Printer diagnostics
✓ Test connection
✓ Test label
✓ Pack label printing
✓ Automatic browser fallback
✓ Works from Vercel deployment
✓ QR printing
✓ Custom TSPL generation

Current limitations

- Windows Local Print Agent
- Zywell TSPL only
- One workstation at a time
- No authentication yet
- No print queue yet

Future

- Brother support
- Android Agent
- Auto printing
- Multiple printers
- Queue management