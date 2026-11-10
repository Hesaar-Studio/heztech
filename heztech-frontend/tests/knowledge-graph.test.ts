import {describe,it,expect} from 'vitest';
import {buildKnowledgeGraph} from '../src/data/knowledge-graph';
describe('knowledge graph provenance',()=>{
 it('keeps namespaces distinct and links only recorded tags',()=>{
  const graph=buildKnowledgeGraph([{id:'same',title:'Research',tags:['AI']}],[{id:'same',title:'Conversation'}]);
  expect(new Set(graph.nodes.map(n=>n.id)).size).toBe(graph.nodes.length);
  expect(graph.edges).toContainEqual({source:'memory:same',target:'tag:AI'});
  expect(graph.edges.some(e=>e.source==='memory:same'&&e.target==='session:same')).toBe(false);
 });
 it('does not invent records when no data exists',()=>{
  expect(buildKnowledgeGraph([],[])).toEqual({nodes:[],edges:[]});
 });
});
