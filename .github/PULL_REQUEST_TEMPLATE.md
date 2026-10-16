## What does this PR do?

<!-- One or two sentences. Reference the issue if one exists (`Closes #123`). -->

## Checklist

- [ ] `bun run lint`, `bun run typecheck`, `bun test`, and `bun run build` all pass locally
- [ ] New/changed behavior is covered by tests (or an explanation of why not)
- [ ] No secrets, credentials, or `.env` values in the diff
- [ ] Database changes applied to **both** `prisma/schema.prisma` and `prisma/schema.sqlite.prisma`
- [ ] Every new query is scoped by the session user (tenant isolation)
- [ ] Docs updated where relevant (CHANGELOG, docs/DECISIONS.md for architecture changes)

## How was this verified?

<!-- What you actually ran and observed — "not run" is acceptable, fabricated results are not. -->
