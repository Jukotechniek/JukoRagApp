# Next.js Validator.ts Path Bug

## Problem

Next.js generates `validator.ts` with incorrect paths when both `app/` and `src/` directories exist in the project root. It generates paths like `../../src/app/page.js` instead of `../../app/page.js`.

## Bug Reference

- GitHub Issue: https://github.com/vercel/next.js/issues/82877
- Affects: Next.js 15.x (tested on 15.5.9)

## Current Workaround

We use `ignoreBuildErrors: true` in `next.config.js` as a temporary workaround. This is documented in the config file.

## Why No Better Solution Exists

1. Next.js generates `validator.ts` **during** the build process
2. TypeScript type checking happens **immediately after** generation
3. We cannot intercept between these two steps with scripts or plugins
4. TypeScript path mapping doesn't work for relative imports like `../../src/app/`

## Possible Solutions (when needed)

1. **Wait for Next.js fix** (recommended) - Track the GitHub issue
2. **Move app/ to src/app/** - Requires significant refactoring
3. **Keep ignoreBuildErrors: true** - Current workaround (acceptable for now)

## Monitoring

Check the GitHub issue periodically for updates. When a fix is released, update Next.js and remove `ignoreBuildErrors: true` from `next.config.js`.

