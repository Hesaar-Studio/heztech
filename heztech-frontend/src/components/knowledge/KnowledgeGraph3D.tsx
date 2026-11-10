import {useEffect, useRef, useState} from 'react';
import type {ForceGraph3DInstance} from '3d-force-graph';
import type {GraphNode, GraphEdge} from '@/data/knowledge-graph';

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rotation: number;
  fitVersion: number;
  fa: boolean;
  onSelect: (node: GraphNode) => void;
}

export function KnowledgeGraph3D({nodes, edges, rotation, fitVersion, fa, onSelect}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraph3DInstance | null>(null);
  const latest = useRef({nodes, edges, onSelect, byId: new Map(nodes.map(n => [n.id, n]))});
  latest.current = {nodes, edges, onSelect, byId: new Map(nodes.map(n => [n.id, n]))};
  const fitPending = useRef(true);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    const visibility = () => {
      if (document.hidden) graph.current?.pauseAnimation();
      else graph.current?.resumeAnimation();
    };
    // Load locally bundled WebGL only while this page is mounted.
    void import('3d-force-graph').then(({default: ForceGraph3D}) => {
      if (disposed || !host.current) return;
      const instance = new ForceGraph3D(host.current, {controlType: 'orbit'});
      graph.current = instance;
      instance.backgroundColor('#050914').showNavInfo(false)
        .nodeColor(n => latest.current.byId.get(String(n.id))?.kind === 'memory' ? '#a78bfa' : latest.current.byId.get(String(n.id))?.kind === 'session' ? '#22d3ee' : '#fbbf24')
        .nodeVal(n => latest.current.byId.get(String(n.id))?.kind === 'tag' ? 3 : 1.5).nodeOpacity(.95)
        .nodeLabel(n => {
          // Labels may contain imported text; never let the library treat it as HTML.
          const label = document.createElement('div');
          label.textContent = latest.current.byId.get(String(n.id))?.label || '';
          label.dir = 'auto';
          return label;
        })
        .linkColor(() => '#64748b').linkOpacity(.45).linkWidth(.8)
        .cooldownTicks(80)
        .onNodeClick(n => {
          const record = latest.current.byId.get(String(n.id));
          if (!record) return;
          latest.current.onSelect(record);
          const x = n.x || 0, y = n.y || 0, z = n.z || 0;
          const distance = Math.hypot(x, y, z);
          const ratio = distance > 0 ? 1 + 90 / distance : 1;
          instance.cameraPosition({x: x * ratio, y: y * ratio, z: distance ? z * ratio : 90}, {x, y, z}, 450);
        })
        .onEngineStop(() => {
          if (fitPending.current) { fitPending.current = false; instance.zoomToFit(350, 50); }
        });
      // The simulation mutates its input; retain the data owner's immutable graph.
      instance.graphData({nodes: latest.current.nodes.map(n => ({...n})), links: latest.current.edges.map(e => ({...e}))});
      const resize = () => {
        if (!host.current) return;
        const bounds = host.current.getBoundingClientRect();
        instance.width(Math.max(1, bounds.width)).height(Math.max(1, bounds.height));
      };
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(host.current);
      document.addEventListener('visibilitychange', visibility);
      visibility();
      setState('ready');
    }).catch(() => {
      graph.current?._destructor();
      graph.current = null;
      if (!disposed) setState('unavailable');
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      graph.current?._destructor();
      graph.current = null;
    };
  }, []);

  useEffect(() => {
    fitPending.current = true;
    graph.current?.graphData({nodes: nodes.map(n => ({...n})), links: edges.map(e => ({...e}))});
  }, [nodes, edges]);
  useEffect(() => {
    const instance = graph.current;
    if (!instance) return;
    const p = instance.cameraPosition(), radius = Math.hypot(p.x, p.y, p.z) || 300;
    instance.cameraPosition({x: Math.sin(rotation) * radius, y: p.y, z: Math.cos(rotation) * radius});
  }, [rotation]);
  useEffect(() => { graph.current?.zoomToFit(350, 50); }, [fitVersion]);

  return <div className="ht-knowledge__scene">
    <div ref={host} className="ht-knowledge__canvas" role="img" aria-label={fa ? 'گراف سه‌بعدی دانش' : '3D knowledge graph'} data-graph-state={state}/>
    {state !== 'ready' && <p className="ht-knowledge__scene-status" role="status">{state === 'loading'
      ? (fa ? 'در حال آماده‌سازی گراف سه‌بعدی…' : 'Preparing 3D graph…')
      : (fa ? 'نمایش سه‌بعدی در دسترس نیست؛ از فهرست گره‌ها استفاده کنید.' : '3D unavailable. Use the node list.')}</p>}
    <p className="ht-knowledge__hint">{fa ? 'کشیدن: چرخش · چرخ ماوس: بزرگ‌نمایی · کلیک: جزئیات' : 'Drag to orbit · Scroll to zoom · Click for details'}</p>
  </div>;
}
