# Repository Guidelines

## Project Structure & Module Organization
- `electron/` — Main process (`electron/main.js`), `preload.js`, and Node services in `electron/services/` (`sshClient.js`, `fileSync.js`, `connectionStore.js`).
- `src/` — Vue 3 renderer. Entry `src/main.js`, root `src/App.vue`, UI in `src/components/`, state in `src/store/`.
- `index.html` — Vite entry. Build output in `dist/`.

## Build, Test, and Development Commands
- `npm install` — Install dependencies.
- `npm run dev` — Start Vite and Electron together for local development.
- `npm run build` — Build renderer then package app via `electron-builder`.
- `npm run preview` — Preview the built renderer only.
- `npm run lint` — Lint JS/Vue code with ESLint.

## Coding Style & Naming Conventions
- Use 2-space indentation; prefer single quotes in JS.
- Vue SFC filenames: PascalCase (e.g., `ServerList.vue`).
- Electron services under `electron/services`: lowerCamelCase (e.g., `sshClient.js`).
- Pinia stores: `useXxxStore` (e.g., `useMainStore`).
- ESLint config: `eslint:recommended` + `plugin:vue/vue3-recommended`; `vue/multi-word-component-names` is disabled.

## Testing Guidelines
- No test runner is configured yet. If adding tests, prefer Vitest + @vue/test-utils.
- Place unit tests in `src/**/__tests__/` or `tests/unit/` with `*.spec.js`.
- Prioritize coverage for store actions and Electron services (SSH, file sync) with mocked side effects.

## Commit & Pull Request Guidelines
- Write clear, present-tense messages; adopt Conventional Commits (`feat:`, `fix:`, `chore:`) for new work.
- PRs should include: purpose/summary, screenshots or terminal output for UX/CLI changes, and linked issues.
- Keep changes focused; update docs and types when APIs change.

## Security & Configuration Tips
- Do not commit credentials or private keys. Connection fields like `password`/`privateKey` are user-provided; `electron-store` is not encrypted by default.
- Prefer OS keychain/secure storage before persisting secrets; scrub logs that may include paths or tokens.
- Use sample values in examples; avoid real hostnames or usernames in commits.

Always answer my questions in Chinese