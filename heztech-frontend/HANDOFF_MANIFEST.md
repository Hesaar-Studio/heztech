# HANDOFF_MANIFEST — HezTech Frontend → Antigravity

| File | Purpose | Integration point |
|------|---------|-------------------|
| `package.json` | Dependencies & scripts | `npm install` / CI |
| `vite.config.ts` | Build, aliases, test | Build pipeline |
| `tsconfig.json` | TypeScript strict | Typecheck |
| `index.html` | Package entry (dev/build only) | Do **not** overwrite app root index unless intentional |
| `src/main.tsx` | React bootstrap | Renderer entry alternative |
| `src/App.tsx` | Routes (11 pages) | Host router or standalone |
| `src/adapters/types.ts` | **Chat / Agent / System / Mission contracts** | Preload implements & injects |
| `src/adapters/index.ts` | `getAdapters()` / `window.__HEZTECH_ADAPTERS__` | Bridge |
| `src/types/index.ts` | Shared domain types | Backend DTOs should align |
| `src/data/agents.ts` | Six domains (Research…Knowledge) | Shared Ops + Arch model |
| `src/i18n/labels.ts` | EN + FA strings | Extend as needed |
| `src/styles/tokens.css` | Design tokens (navy / blue) | Theme |
| `src/styles/global.css` | Base + a11y | Global |
| `src/components/layout/AppShell.tsx` | Shell + health | Layout host |
| `src/components/layout/Sidebar.tsx` | 11-item nav, collapse | Navigation |
| `src/components/chat/*` | Composer, MessageList | Assistant page |
| `src/components/agents/OperationsView.tsx` | Ops graph | Agents page |
| `src/components/agents/ArchitectureView.tsx` | Arch graph + zoom/pan | Agents page |
| `src/components/agents/AgentInspector.tsx` | Tasks/tools/outputs | Agents page |
| `src/components/ui/Button.tsx` | Accessible button | Shared |
| `src/components/ui/Icon.tsx` | Lucide map | Shared |
| `src/pages/AssistantPage.tsx` | Full chat UI | Priority page |
| `src/pages/AgentsPage.tsx` | Dual view + inspector | Priority page |
| `src/pages/HomePage.tsx` | Executive overview links | Home |
| `src/pages/ShellPage.tsx` | Honest empty shells | Other 8 pages |
| `tests/*.test.tsx` | Navigation, agents, chat, RTL | CI |
| `README.md` | Overview | Humans |
| `INTEGRATION.md` | Electron wiring | Antigravity |
| `KNOWN_LIMITATIONS.md` | Scope boundaries | Expectations |

## Priority for wiring

1. Inject `ChatAdapter` → Assistant Send works  
2. Inject `AgentAdapter` → Inspector tasks/tools/outputs  
3. Inject `SystemAdapter` → Sidebar status  
4. Remaining shells stay honest until backends exist  
