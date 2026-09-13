# Desktop companion

The Windows companion is implemented in `apps/desktop-companion` as an Electron
application with an NSIS packaging target.

Its approved design uses a signed custom protocol carrying only a short-lived,
single-use launch identifier. The companion authenticates to Company Control,
exchanges that identifier for an allow-listed Outlook `webLink`, and launches Chrome,
Edge, or a configured dedicated browser profile.

The companion may store local browser executable/profile preferences. It must not
receive or persist Graph tokens, extract browser cookies, inject sessions, convert
tokens to Outlook cookies, or bypass Microsoft authentication.

On managed Windows devices, the browser may use Microsoft-supported Entra/Windows SSO.
Whether a fresh profile signs in silently is decided by Microsoft, Windows, Conditional
Access, device compliance, MFA, and session policy. The companion simply opens the real
Microsoft URL and must handle an interactive Microsoft sign-in gracefully.

Build with `npm run desktop:build`. Installation registers the `companymail` protocol.
The web application obtains a 60-second, single-use token from the backend. The
companion exchanges it at `/api/v1/outlook-launch/exchange`; the backend atomically
consumes it and returns only the Graph-provided Outlook `webLink`.

The companion settings UI supports the default browser, Chrome, Edge, a custom
executable, profile directory, and isolated user-data directory. Browser arguments are
passed without a shell. Returned URLs are restricted to HTTPS Outlook hosts.
