# Style guide

This project uses automated formatting and linting to keep TypeScript,
JavaScript, and documentation consistent. The goal is predictable code that is
easy to review, not formatting for its own sake.

## Tools and commands

- `npm run format` formats supported files with Prettier.
- `npm run format:check` verifies formatting without changing files.
- `npm run lint` runs ESLint on `src/` and `test/`.
- `npm run lint:fix` applies safe ESLint fixes.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm test` builds the package and runs the complete test suite.

Run formatting before linting. Keep generated files under `dist/` out of code
reviews; they are release artifacts and are ignored by both tools.

## Formatting

Prettier is authoritative for whitespace and layout:

- Use two spaces, never tabs.
- Use double quotes in JavaScript and TypeScript.
- End statements with semicolons.
- Do not use trailing commas in lists, objects, or parameters.
- Wrap lines at 100 columns where practical.
- Use parentheses around arrow-function parameters.
- Keep line endings as LF.

Do not hand-format a neighboring file while making an unrelated change. Run
Prettier on the files you changed, or use the repository-wide command when
performing a formatting-only change.

## TypeScript and JavaScript

- Prefer `const`; use `let` only when reassignment is required.
- Use explicit `type` imports for type-only dependencies.
- Keep public functions and types documented with TSDoc comments.
- Prefer narrow public types over `any`; use `unknown` at untrusted boundaries.
- Preserve existing public API names and compatibility aliases unless a change
  is intentional and documented in `changelog.md`.
- Keep browser-only code separate from dependency-free utility modules.
- Use descriptive errors with the `asymptote-web:` prefix for public runtime
  failures.

ESLint reports indentation, braces, quotes, semicolons, spacing, and type-only
import conventions as warnings, so style drift does not block a build. Unused
variables remain errors because they can indicate broken or incomplete code. A
leading underscore is allowed for an intentionally unused parameter or local
variable.

## Tests

- Add behavior tests for every new public function or changed edge case.
- Add a public-import test when adding or changing a package export.
- Use Node's built-in test runner and strict assertions.
- Keep test names behavioral: describe the observable result, not the
  implementation detail.
- Avoid network access and real WASM initialization in unit tests; use the
  existing test doubles where appropriate.

## Documentation

- Keep `docs/api.md` as the stable API index.
- Put detailed API guidance in the relevant page under `docs/api/`.
- Put exact interfaces and type aliases in `docs/types.md`.
- Use runnable TypeScript examples where an API has non-obvious setup.
- Document defaults, browser limitations, safety concerns, and version-sensitive
  behavior near the relevant option or function.
- Update `README.md` links when adding a new documentation area.

## Pull request checklist

Before submitting a change:

1. Run `npm run format:check`.
2. Run `npm run lint` and `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run verify:package` after the WASM assets have been built.
5. Update API/type documentation and `changelog.md` for public API changes.
