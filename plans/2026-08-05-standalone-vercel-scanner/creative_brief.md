# Standalone Vercel Scanner Creative Brief

- **User:** A warehouse operator using a keyboard-emulating barcode scanner.
- **Outcome:** Open the deployed station, authenticate once, then repeat `scan → decision → next` without CoWork, mouse dependence, or browser-only operational state.
- **Primary action:** Scan an Enter-terminated tracking code after the station shows READY.
- **Safety rule:** No package is counted unless the local app has a complete shipment snapshot and a fresh bol cancellation check passes.
- **New state:** A focused access gate appears only while the station is unauthenticated or its session expired. Shared state restores after sign-in so another station sees completed and blocked packages.
- **Visual direction:** Preserve the existing compact operational hierarchy and decisive GO/STOP zone. Authentication is a quiet prerequisite, not a dashboard redesign.
- **Responsive rule:** Login and scanner controls fit 390px without page overflow; the active decision remains above aggregate tables.
- **Exclusions:** No customer data in the login screen, no API/configuration jargon in user-visible errors, no third-party auth UI, no deploy/account branding.
- **Acceptance:** The browser reaches the scanner through the app’s own session endpoint, the authenticated scanner retains immediate focus and FIFO behavior, and current desktop/mobile screenshots show clean login and ready states.
