# Modularity Standards

- Keep UI rendering in src/components.
- Keep data access in src/services.
- Keep configuration in src/env.js and build in scripts/build-env.js.
- Avoid framework-specific code.

## Service Layer Rules

- Shared data-fetch behaviors (pagination, retries, normalization) must live in reusable helper functions inside `src/services`.
- Avoid duplicating pagination loops across multiple functions; use one helper and call it from feature-specific fetchers.
- Any global fetch policy change (for all sports) must be implemented in one helper-first location, then documented.

## Anti-Regression Rule

- Do not add hidden hard caps (`page < N`, `rows < N`) in core fetch loops.
- If performance tuning is needed, use explicit UX patterns (load more, caching, server-side aggregation), not silent truncation.
