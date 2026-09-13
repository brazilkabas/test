# Deployment

## Local

Copy `.env.example` to `.env`, create a 15-character
`BOOTSTRAP_ACCESS_CODE`, and set the remaining required values. Then:

```bash
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

The bootstrap code works only while the database has no users. After first login,
create ordinary temporary codes and remove the bootstrap code from the environment.

## Private production deployment

Build with `npm run build`, apply schema changes with `npm run db:deploy`, and start
with `npm start`. Terminate TLS at a trusted reverse proxy, set `APP_BASE_URL` to the
exact HTTPS origin, and use managed PostgreSQL and a secrets manager.

Run the service as an unprivileged account. Restrict inbound access, configure health
checks, cap request bodies, retain audit logs, monitor Graph 401/403/429 responses, and
back up PostgreSQL. Do not use development credentials or expose PostgreSQL publicly.

The setup wizard requested in the overall roadmap should write through a server-only
secrets provider. It must never place database, encryption, Microsoft, or Cloudflare
secrets in browser localStorage.
