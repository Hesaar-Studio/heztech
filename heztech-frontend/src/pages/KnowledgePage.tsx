import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useLocale} from '@/hooks/useLocale';
import {buildKnowledgeGraph, type GraphNode} from '@/data/knowledge-graph';
import {KnowledgeGraph3D} from '@/components/knowledge/KnowledgeGraph3D';
import './KnowledgePage.css';
export function KnowledgePage(){
 const {locale}=useLocale(),fa=locale==='fa',navigate=useNavigate();
 const [graph,setGraph]=useState<ReturnType<typeof buildKnowledgeGraph>>({nodes:[],edges:[]});
 const [selected,setSelected]=useState<GraphNode|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[rotation,setRotation]=useState(0);
 const [fitVersion,setFitVersion]=useState(0);
 async function load(){setBusy(true);setError('');try{
  const api=window.heztech||window.hesatech;if(!api)throw Error(fa?'برنامه به سرویس متصل نیست.':'Desktop connection unavailable.');
  const [memory,sessions]=await Promise.all([api.searchMemory('','all'),api.listConversations()]);
  if(!memory.success||!sessions.success)throw Error(memory.error||sessions.error||'Data unavailable');
  setGraph(buildKnowledgeGraph(memory.knowledge||[],sessions.conversations||[]));setSelected(null);
 }catch(e){setError(String(e));}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 const visible=useMemo(()=>graph.nodes.filter(n=>n.label.toLowerCase().includes(query.toLowerCase())),[graph,query]);
 const visibleEdges=useMemo(()=>{const ids=new Set(visible.map(n=>n.id));return graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target));},[visible,graph.edges]);
 return <section className="ht-knowledge"><header><div><h1>{fa?'نقشهٔ دانش':'Knowledge map'}</h1><p>{fa?'حافظه و گفتگوهای واقعی؛ خطوط فقط برچسب‌های ثبت‌شده را نشان می‌دهند.':'Actual memory and conversations. Lines represent recorded tags only.'}</p></div><button onClick={()=>void load()} disabled={busy}>{busy?'…':fa?'بازخوانی':'Refresh'}</button></header>
 <div className="ht-knowledge__toolbar"><input aria-label={fa?'جستجوی گره':'Find a node'} placeholder={fa?'جستجو…':'Find a node…'} value={query} onChange={e=>setQuery(e.target.value)}/><label>{fa?'چرخش':'Rotate'}<input type="range" min="0" max="6.28" step="0.02" value={rotation} onChange={e=>setRotation(Number(e.target.value))}/></label><span>{visible.length} / {graph.nodes.length}</span></div>
 {error&&<p role="alert">{error}</p>}
 <div className="ht-knowledge__view-controls"><button onClick={()=>setFitVersion(v=>v+1)}>{fa?'نمایش همه':'Fit view'}</button><span><i className="memory"/>{fa?'حافظه':'Memory'} <i className="session"/>{fa?'گفتگو':'Conversation'} <i className="tag"/>{fa?'برچسب':'Tag'}</span></div>
 <div className="ht-knowledge__body"><KnowledgeGraph3D nodes={visible} edges={visibleEdges} rotation={rotation} fitVersion={fitVersion} fa={fa} onSelect={setSelected}/>
 <aside>{selected?<><h2>{selected.label}</h2><small>{selected.kind}</small><p>{selected.content|| (fa?'این گره محتوای متنی ندارد.':'No text content on this node.')}</p>{selected.kind==='session'&&<button onClick={()=>navigate('/assistant',{state:{conversationId:selected.id.slice(8)}})}>{fa?'بازکردن گفتگو':'Open conversation'}</button>}</>:<p>{fa?'برای مشاهدهٔ جزئیات، یک گره را انتخاب کنید.':'Select a node to inspect its details.'}</p>}</aside></div>
 {!busy&&!error&&!graph.nodes.length&&<p>{fa?'هنوز حافظه یا گفتگویی ثبت نشده است.':'No memory or conversations recorded yet.'}</p>}
 {!busy&&!error&&graph.nodes.length>0&&!visible.length&&<p role="status">{fa?'گره مطابق جستجو یافت نشد.':'No matching nodes.'}</p>}
 <details className="ht-knowledge__node-list"><summary>{fa?'فهرست گره‌ها؛ انتخاب با صفحه‌کلید':'Node list · keyboard selection'} ({visible.length})</summary><div>{visible.map(n=><button key={n.id} aria-pressed={selected?.id===n.id} onClick={()=>setSelected(n)}>{n.label}</button>)}</div></details>
 </section>;
}

