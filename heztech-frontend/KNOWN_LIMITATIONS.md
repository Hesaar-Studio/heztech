# Known Limitations

## NOT TESTED in this environment

- Full `npm install` + `npm run build` may not have been executed on the delivery host.
- Vitest runs require `npm install` first.
- Electron IPC / real AI streaming is **out of scope**; adapters are contracts only.
- Visual parity with reference screenshots is approximate (CSS layout, not pixel-identical assets).

## Intentionally omitted

- No replacement of Electron `main.js` / `preload.js` / root `index.html`
- No backend services, no AI provider configuration
- No fabricated token counts, online agent numbers, success rates, or canned replies
- No Tailwind / large UI frameworks
- No second Electron application
- Attachment upload pipeline is UI shell only (button present; no file transport without adapter)
- Tool activity drawer and approval flows are structural hooks; data must come from backend
- Social / Marketing / Media Studio are **shell pages** (capabilities via Master Agent tools, not permanent duplicate processes)

## Accessibility

- Focus-visible styles present
- Keyboard: tab order follows DOM; full screen-reader audit not performed
- Reduced-motion respected via CSS variables

## Browser / Electron

- Target Chromium (Electron). Not tested on Safari/Firefox.
- HashRouter used automatically under `file:` protocol.

## Status indicators

All agent statuses default to `not_configured` until `AgentAdapter.getDomains()` returns live data.
Sidebar system status is `disconnected` until `SystemAdapter.getHealth()` succeeds.
