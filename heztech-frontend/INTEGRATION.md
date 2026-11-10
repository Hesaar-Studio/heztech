# Integration Guide — Antigravity / Electron

## Goal

Wire this frontend into the **existing** Windows Electron app without replacing:

- `main.js`
- `preload.js`
- `bridge-server.mjs`
- Root application `index.html` identity
- Backend services / data directories

## Recommended approaches

### A. Built assets as secondary renderer (safest)

1. `npm run build` → `dist/`
2. Serve or load `dist/index.html` from a dedicated BrowserWindow or webview, **or**
3. Inject the built JS/CSS into a container div inside the current renderer.

### B. Dev server during integration

```bash
npm run dev -- --host
```

Point Electron `loadURL` at `http://localhost:5173` only for development.

### C. Mount React into existing DOM

```ts
import { createRoot } from 'react-dom/client';
import App from 'heztech-frontend/src/App';

createRoot(document.getElementById('heztech-root')!).render(<App />);
```

Ensure a host element exists; do not wipe the entire document if other Electron UI coexists.

## Adapter injection

Implement the interfaces in `src/adapters/types.ts` and expose:

```js
// preload or bridge
window.__HEZTECH_ADAPTERS__ = {
  chat: { /* ChatAdapter */ },
  agents: { /* AgentAdapter */ },
  system: { /* SystemAdapter */ },
  missions: { /* MissionAdapter */ },
};
```

### ChatAdapter essentials

- `sendMessage` must return a real `AsyncIterable<StreamChunk>` from the existing AI pipeline.
- **Never** return canned assistant text from the frontend.
- Honor `AbortSignal` for cancel.
- On missing adapter: UI shows **Not Connected** and disables Send.

### AgentAdapter

- `getDomains()` may enrich `DEFAULT_DOMAINS` with live status.
- Tasks / tools / outputs must come from backend; empty arrays are valid.
- Status indicators stay `not_configured` / `unknown` until real data arrives.

### SystemAdapter

- `getHealth()` drives sidebar status dot.
- Do not hardcode “All Systems Operational”.

## Routing

- Standalone / http: `BrowserRouter`
- `file://` or custom protocol: automatic `HashRouter`

Map routes if the host app already uses a router:

| Path                 | Page              |
|----------------------|-------------------|
| `/`                  | Home              |
| `/assistant`         | Assistant         |
| `/agents`            | Agent Command Center |
| `/web-research`      | Shell             |
| `/social-satellite`  | Shell             |
| `/marketing`         | Shell             |
| `/media-studio`      | Shell             |
| `/missions`          | Shell             |
| `/knowledge`         | Shell             |
| `/connections`       | Shell             |
| `/settings`          | Shell             |

## Fonts

Google Fonts links are in package `index.html`. For offline Electron, bundle Inter + Vazirmatn under `public/fonts` and update CSS `@font-face`.

## IPC mapping sketch

| UI action              | Suggested IPC / bridge          |
|------------------------|---------------------------------|
| sendMessage            | existing AI stream channel      |
| listConversations      | conversation store              |
| getDomains / getTasks  | agent registry                  |
| getHealth              | system guardian / heartbeat     |

Exact channel names remain owned by the existing project.
