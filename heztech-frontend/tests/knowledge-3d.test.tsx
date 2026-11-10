import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {KnowledgeGraph3D} from '../src/components/knowledge/KnowledgeGraph3D';

const mock = vi.hoisted(() => {
  const graph = Object.fromEntries(['backgroundColor','showNavInfo','nodeColor','nodeVal','nodeOpacity','nodeLabel','linkColor','linkOpacity','linkWidth','cooldownTicks','onNodeClick','onEngineStop','graphData','width','height','cameraPosition','zoomToFit','pauseAnimation','resumeAnimation','_destructor'].map(name => [name, vi.fn()]));
  Object.values(graph).forEach(fn => fn.mockReturnValue(graph));
  return {graph, construct: vi.fn(function() { return graph; })};
});
vi.mock('3d-force-graph', () => ({default: mock.construct}));
afterEach(() => {cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals();});
function resizeStub() {
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect = disconnect;});
  return disconnect;
}
it('renders real cloned data, treats imported labels as text, and cleans up its simulation', async () => {
  const disconnect = resizeStub(), select = vi.fn();
  const nodes = [{id:'memory:1',label:'<img src=x onerror=alert(1)>',kind:'memory' as const,content:'Recorded fact'}];
  const {unmount} = render(<KnowledgeGraph3D nodes={nodes} edges={[]} rotation={0} fitVersion={0} fa={false} onSelect={select}/>);
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('data-graph-state', 'ready'));
  const data = mock.graph.graphData.mock.calls.at(-1)![0];
  expect(data.nodes).toEqual(nodes);
  expect(data.nodes[0]).not.toBe(nodes[0]);
  const tooltip = mock.graph.nodeLabel.mock.calls[0][0]({id:'memory:1'});
  expect(tooltip.textContent).toBe(nodes[0].label);
  expect(tooltip.querySelector('img')).toBeNull();
  mock.graph.onNodeClick.mock.calls[0][0]({id:'memory:1',x:0,y:0,z:0});
  expect(select).toHaveBeenCalledWith(nodes[0]);
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(mock.graph._destructor).toHaveBeenCalledOnce();
});
it('reports unavailable WebGL honestly instead of inventing a rendered graph', async () => {
  resizeStub();
  mock.construct.mockImplementationOnce(() => { throw Error('WebGL unavailable'); });
  render(<KnowledgeGraph3D nodes={[]} edges={[]} rotation={0} fitVersion={0} fa={false} onSelect={() => {}}/>);
  expect(await screen.findByText('3D unavailable. Use the node list.')).toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAttribute('data-graph-state', 'unavailable');
});
