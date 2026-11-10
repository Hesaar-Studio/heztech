# HezTech Frontend — Antigravity Handoff Package

Production-oriented React + TypeScript frontend for **HezTech AI Executive Workspace**.

Designed for controlled integration into the **existing** Electron application  
(`C:\Users\Green\openclaw\jarvis-command-center`) by Google Antigravity.

**This package does not replace** `main.js`, `preload.js`, `bridge-server.mjs`, root `index.html`, or backend services.

## Features

- Persistent sidebar navigation across **11 pages**
- **Assistant** — full conversation UI (history, composer, streaming-ready, cancel, model indicator, empty/disconnected states)
- **Agents** — single page with two views:
  - **Operations**: Master Agent + 6 domain nodes + collapsible Inspector
  - **Architecture**: zoom/pan canvas, sub-roles, shared domain model
- Bilingual **English / Persian** with true RTL/LTR
- Typography: Inter + Vazirmatn (body ≥ 16px)
- Explicit **backend adapter contracts** — no fabricated online agents, tokens, or AI replies
- Honest empty / Not Connected / Not Configured states

## Quick start (standalone preview)

```bash
cd heztech-frontend
npm install
npm run dev
```

Open http://localhost:5173

```bash
npm run build    # output → dist/
npm run test     # vitest
npm run lint     # tsc --noEmit
```

## Integration path (Electron)

1. Build this package (`npm run build`).
2. Antigravity maps `dist/` assets into the existing renderer **without** overwriting the app entry identity.
3. Inject adapters on `window.__HEZTECH_ADAPTERS__` from preload / bridge (see `INTEGRATION.md`).
4. Optionally mount React root into an existing container instead of replacing root `index.html`.

## Stack

| Layer        | Choice                          |
|--------------|---------------------------------|
| UI           | React 18 + TypeScript           |
| Bundler      | Vite 5                          |
| Routing      | react-router-dom 6 (HashRouter for file://) |
| Icons        | lucide-react                    |
| Styling      | Plain CSS + design tokens       |
| Tests        | Vitest + Testing Library        |

No Tailwind, no Zustand, no large UI kit — keep dependencies light for Electron embedding.

## Directory overview

```
heztech-frontend/
├── package.json
├── vite.config.ts
├── index.html
├── README.md
├── INTEGRATION.md
├── HANDOFF_MANIFEST.md
├── KNOWN_LIMITATIONS.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── adapters/          # Chat / Agent / System contracts
│   ├── components/
│   │   ├── layout/        # AppShell, Sidebar
│   │   ├── chat/          # MessageList, ChatComposer
│   │   ├── agents/        # Operations, Architecture, Inspector
│   │   └── ui/            # Button, Icon
│   ├── pages/             # Home, Assistant, Agents, shells
│   ├── data/agents.ts
│   ├── hooks/
│   ├── i18n/labels.ts
│   ├── styles/            # tokens + global
│   └── types/
└── tests/
```

## Design tokens

Deep navy base (`#060a14` … `#141c30`), restrained electric blue accent (`#3b82f6`), readable contrast. See `src/styles/tokens.css`.

## License / ownership

Frontend handoff for the existing HezTech / jarvis-command-center project. Internal identity of the Electron app is preserved.
