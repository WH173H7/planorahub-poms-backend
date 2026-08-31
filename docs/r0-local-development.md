# R0 local development

The rebuild and legacy applications are separate workspace packages. Run `pnpm install` at the repository root before starting either set.

## New rebuild applications

Configure `planorabackend/.env` locally with `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Configure `planorafrontend/.env.local` locally with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api`. These files are ignored and must not be committed.

In separate terminals:

```sh
pnpm dev:backend
pnpm dev:frontend
```

The backend listens on port 4000 and the frontend on port 3000 by default.

## Legacy applications

The legacy/reference applications remain available through the existing commands:

```sh
pnpm dev:api
pnpm dev:admin
pnpm dev:staff
```

Legacy admin uses port 3000 and legacy staff uses port 3001. Do not run the new frontend and legacy admin concurrently without assigning one of them a different port.
