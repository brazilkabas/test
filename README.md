# Company Control

Secure internal Microsoft 365 administration platform. The first milestone provides a
Microsoft device-code connection flow, encrypted MSAL token cache, Graph-backed mail
operations, mailbox settings and Inbox rules, an internal dashboard, and audit logging.

## Quick start

1. Copy `.env.example` to `.env` and provide the required values.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Install and prepare the database:
   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   ```
4. Start the application: `npm run dev`.
5. Open `http://localhost:3000`.

The first local administrator is bootstrapped from `BOOTSTRAP_ADMIN_EMAIL`. Device
authorization always takes place on Microsoft's official verification site.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For a live tenant smoke test, see `MICROSOFT_SETUP.md` and run:

```bash
npm run microsoft:smoke
```

The smoke test reports PASS/FAIL for authorization, identity, Inbox, message,
attachment, send, mailbox settings, and Inbox rules. Sending requires explicit
confirmation and a recipient argument.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Microsoft setup](MICROSOFT_SETUP.md)
- [Security](SECURITY.md)
- [Deployment](DEPLOYMENT.md)
- [Cloudflare setup](CLOUDFLARE_SETUP.md)
- [Desktop companion](DESKTOP_COMPANION.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Current implementation status](docs/IMPLEMENTATION_STATUS.md)

Advanced directory, shared mailbox, Exchange administration, Cloudflare publishing,
desktop companion, and third-party integration modules are intentionally deferred
until the first Microsoft mail milestone has been validated against a real tenant.
