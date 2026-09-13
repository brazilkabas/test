# Desktop companion

The Windows companion is an intentionally deferred optional module.

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
