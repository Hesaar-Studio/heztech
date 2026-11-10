import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import '@/styles/global.css';

const HomePage = lazy(() => import('@/pages/HomePage').then(module => ({ default: module.HomePage })));
const AssistantPage = lazy(() => import('@/pages/AssistantPage').then(module => ({ default: module.AssistantPage })));
const AgentsPage = lazy(() => import('@/pages/AgentsPage').then(module => ({ default: module.AgentsPage })));
const ShellPage = lazy(() => import('@/pages/ShellPage').then(module => ({ default: module.ShellPage })));
const MediaStudioPage = lazy(() => import('@/pages/MediaStudioPage').then(module => ({ default: module.MediaStudioPage })));
const SocialSatellitePage = lazy(() => import('@/pages/SocialSatellitePage').then(module => ({ default: module.SocialSatellitePage })));
const MarketingPage = lazy(() => import('@/pages/MarketingPage').then(module => ({ default: module.MarketingPage })));
const KnowledgePage = lazy(() => import('@/pages/KnowledgePage').then(module => ({ default: module.KnowledgePage })));

/** Use HashRouter when embedded in Electron file:// or custom protocol */
const Router = typeof window !== 'undefined' && window.location.protocol === 'file:'
  ? HashRouter
  : BrowserRouter;

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Suspense fallback={<div role="status" aria-busy="true">Loading ARTA…</div>}><AgentsPage /></Suspense>} />
          <Route path="assistant" element={<Suspense fallback={<div role="status" aria-busy="true">Loading ARTA…</div>}><AssistantPage /></Suspense>} />
          <Route path="agents" element={<Suspense fallback={<div role="status" aria-busy="true">Loading ARTA…</div>}><AgentsPage /></Suspense>} />
          <Route path="home" element={<Suspense fallback={<div role="status" aria-busy="true">Loading ARTA…</div>}><HomePage /></Suspense>} />
          <Route path="web-research" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><ShellPage titleKey="webResearch" /></Suspense>} />
          <Route path="social-satellite" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><SocialSatellitePage /></Suspense>} />
          <Route path="marketing" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><MarketingPage /></Suspense>} />
          <Route path="media-studio" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><MediaStudioPage /></Suspense>} />
          <Route path="missions" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><ShellPage titleKey="missions" /></Suspense>} />
          <Route path="knowledge" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><KnowledgePage /></Suspense>} />
          <Route path="connections" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><ShellPage titleKey="connections" /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<div role="status" aria-busy="true">Loading…</div>}><ShellPage titleKey="settings" /></Suspense>} />
        </Route>
      </Routes>
    </Router>
  );
}
