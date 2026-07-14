# KG Tactical Video: repository instructions

Read and follow `docs/AI_WORKFLOW.md`. It defines the shared Claude Code/Codex
branch, worktree, review, handoff, and model-routing workflow.
Read `docs/ENVIRONMENTS.md` for the non-secret GitHub, Vercel, Supabase, and MCP targets.

## Project overview

- Next.js 15 App Router application written in TypeScript and styled with Tailwind CSS.
- Supabase provides PostgreSQL, authentication, and row-level security.
- AI reports support Anthropic or OpenAI through `src/lib/ai/provider.ts`.
- Vercel hosts the production application.

## Local commands

Use the package manager represented by the committed lockfile (`package-lock.json`).

```bash
npm install
npm run dev
npm test
npm run build
```

Integration tests that require PostgreSQL run only when `DATABASE_URL` is set. Browser E2E support lives in `scripts/e2e.mjs`.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit `.env`, `.env.local`, tokens, database passwords, service-role keys, or AI API keys.

Required for the application:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional AI configuration:

- `AI_PROVIDER` (`anthropic` or `openai`)
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

`NEXT_PUBLIC_*` values are exposed to the browser. Do not place privileged credentials in those variables.

## Supabase workflow

- Treat `supabase/migrations/` as the source of truth for database schema changes.
- Add a new migration for schema or RLS changes; do not rewrite an already-applied migration without a specific compatibility reason.
- Test database changes locally before applying them to a linked cloud project.
- Never run `supabase/seed.sql` against production.
- Do not run `supabase db push`, reset a remote database, or change production Auth settings without explicit user approval.
- The configured production Supabase MCP is read-only and project-scoped. Do not weaken that configuration.
- Preserve and test row-level security whenever changing data access.

## Vercel and Git workflow

- Codex works on `codex/<topic>` branches. Claude Code works on `claude/<topic>` branches.
- When both agents work concurrently, each must use its own Git worktree.
- Do not edit the same branch or worktree concurrently and do not commit directly on `main`.
- By default, cross-agent review is read-only. Return findings to the authoring agent for fixes.
- Run unit tests and a production build before requesting review when the environment permits.
- Use a Vercel Preview Deployment for validation before production.
- Use the project-scoped Vercel MCP for inspection and logs; treat management actions as external writes requiring confirmation.
- Do not run a production deployment or change production environment variables without explicit user approval.

## Delegation

- Keep architecture, security/RLS, unfamiliar debugging, product tradeoffs, and final decisions in the capable parent agent.
- Delegate only bounded, independent work such as targeted exploration, test execution, log summarization, or mechanical edits.
- Use project-defined subagents under `.codex/agents/` or `.claude/agents/` when their role fits.
- Avoid delegation when coordination and context-loading cost is larger than the task.

## Change guidelines

- Keep changes focused and preserve existing behavior unless the task requests a behavior change.
- Follow existing server action, validation, session, permissions, and Supabase client patterns.
- For authorization changes, inspect both application checks in `src/lib/permissions.ts` and database RLS policies.
- Add or update tests for business rules, permissions, validation, statistics, and AI output handling.
- Do not weaken authentication, authorization, input validation, or RLS to make a test pass.
