export interface KnowledgeRecord {id:string;title?:string;content?:string;tags?:string[]}
export interface GraphNode {id:string;label:string;kind:'memory'|'session'|'tag';content?:string}
export interface GraphEdge {source:string;target:string}
export function buildKnowledgeGraph(memory:KnowledgeRecord[],sessions:KnowledgeRecord[]):{nodes:GraphNode[];edges:GraphEdge[]}{
 const nodes=new Map<string,GraphNode>();const edges=new Map<string,GraphEdge>();
 for(const [kind,records] of [['memory',memory],['session',sessions]] as const){
  for(const record of records){
   const id=kind+':'+record.id;
   nodes.set(id,{id,label:record.title||record.id,kind,content:record.content});
   for(const tag of record.tags||[]){
    if(!tag.trim())continue;
    const target='tag:'+tag;nodes.set(target,{id:target,label:tag,kind:'tag'});
    edges.set(id+'\u0000'+target,{source:id,target});
   }
  }
 }
 return {nodes:[...nodes.values()],edges:[...edges.values()]};
}
