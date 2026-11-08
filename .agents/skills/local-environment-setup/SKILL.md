---
name: local-environment-setup
description: Use when bootstrapping or repairing the local Next.js monorepo development environment.
---

# Set up the local environment

## Scope

Use for installation, local PostgreSQL, optional SeaweedFS, generated Prisma artifacts, and app startup. Do not add real credentials to tracked files or provision remote infrastructure.

## Procedure

1. Verify Node.js 22 or newer and the repository-pinned pnpm:
    ```bash
    node --version
    pnpm --version
    ```
2. Create the untracked local environment from `.env.local.example`:
    ```bash
    cp .env.local.example .env.local
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supastarter"
    ```
    Put the same `DATABASE_URL` in `.env.local`, along with a strong local `BETTER_AUTH_SECRET`, SaaS `3000`, marketing `3001`, and docs `3002`. Database scripts use `dotenv -c` against the repo-root env file, the same cascade as the root scripts, and skip files that are not there. Correct the example's stale `NEXT_PUBLIC_DOCS_URL` value, which currently points to `3001`.
3. Start PostgreSQL 16 and verify its health:
    ```bash
    docker compose up -d postgres
    docker compose ps postgres
    ```
4. Install workspaces and generate the Prisma client/Zod output. The custom client directory is Git-ignored, so a clean checkout needs generation before direct database consumers:
    ```bash
    pnpm install
    pnpm --filter @repo/database generate
    pnpm --filter @repo/database push
    ```
5. Start development tasks:
    ```bash
    pnpm dev
    ```
    SaaS, marketing, docs, and mail preview use ports 3000, 3001, 3002, and 3003.
6. If storage is needed, start `seaweedfs`, then set `S3_*` to the compose credentials (`seaweedadmin` / `http://localhost:9000`):
    ```bash
    docker compose up -d seaweedfs
    ```
7. Smoke-check `http://localhost:3000/api/health` and run `pnpm type-check`.

## Canonical reference

`docker-compose.yml` defines PostgreSQL `5432`, SeaweedFS S3 API `9000`, admin UI `9001`, and the `avatars` bucket. Database scripts call `dotenv -c -e ../../.env`, so they follow the dotenv-cli cascade and still run when those files are absent.

## Done

From a clean checkout, dependencies install, Prisma generation/push succeeds, required containers are healthy, SaaS `/api/health` returns `OK`, and every requested app resolves on its configured port.

## Common mistakes

- Editing or committing `.env.local`.
- Requiring a root `.env` file for Prisma scripts. Hosted builds inject variables and do not create that file.
- Starting SeaweedFS for work that only needs PostgreSQL.
- Skipping Prisma generation after install or schema changes.
- Replacing local app URLs with one shared port.
- Keeping the example docs URL on marketing port `3001` and linking to the wrong app.
