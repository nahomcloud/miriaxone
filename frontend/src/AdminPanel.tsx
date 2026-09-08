import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, mediaUrl } from './api';
import { SignOutButton } from './auth';
import { adminSections, AdminItem, AdminPage, columnLabels, Field } from './adminConfig';

function orderCart(value:unknown):Record<string,unknown>{try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{} }catch{return {}}}
function attachments(value:unknown):{name:string;storageKey:string}[]{if(!value||typeof value!=='object')return [];return Object.values(value).flatMap(items=>Array.isArray(items)?items.filter(item=>item&&typeof item.storageKey==='string').map(item=>({name:String(item.name||'Document'),storageKey:item.storageKey})):[])}

function Snapshot({value}:{value:unknown}) {
  if (typeof value === 'string') { try { const parsed=JSON.parse(value); if(typeof parsed==='object'&&parsed) return <Snapshot value={parsed}/>; } catch { /* Plain text. */ } }
  if (Array.isArray(value)) return <ol>{value.map((item,index)=><li key={index}><Snapshot value={item}/></li>)}</ol>;
  if (value && typeof value==='object') return <dl className="admin-details">{Object.entries(value).map(([key,item])=><div key={key}><dt>{key.replace(/([a-z])([A-Z])/g,'$1 $2')}</dt><dd><Snapshot value={item}/></dd></div>)}</dl>;
  return <span>{String(value ?? '—')}</span>;
}

export default function AdminPanel(){
  const [params,setParams]=useSearchParams();
  const section=adminSections.find(item=>item.resource===params.get('section'))||adminSections.find(item=>item.resource==='order')!;
  const [page,setPage]=useState(1), [query,setQuery]=useState(''), [search,setSearch]=useState('');
  const [status,setStatus]=useState(''), [countryFilter,setCountryFilter]=useState(''), [sort,setSort]=useState('-createdAt'), [archived,setArchived]=useState(false);
  const [result,setResult]=useState<AdminPage>({items:[],totalRecords:0,page:1,pageSize:25});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [editor,setEditor]=useState<AdminItem|null|undefined>(undefined),[draft,setDraft]=useState<Record<string,string>>({}),[detail,setDetail]=useState<AdminItem|null>(null);
  const [countries,setCountries]=useState<AdminItem[]>([]),[states,setStates]=useState<AdminItem[]>([]),[methods,setMethods]=useState<AdminItem[]>([]);
  const [lookupError,setLookupError]=useState('');
  const [trackingStatus,setTrackingStatus]=useState('pending'),[comments,setComments]=useState('');
  const firstField=useRef<HTMLInputElement|null>(null);
  const editorBox=useRef<HTMLDivElement|null>(null);
  const requestId=useRef(0);
  const filterKey=section.resource+':'+query+':'+status+':'+countryFilter+':'+sort+':'+archived+':'+page;
  useEffect(()=>{let live=true;setLoading(true);setError('');const controller=new AbortController();
    const queryString=new URLSearchParams({page:String(page),perPage:'25',q:query,status,countryCode:countryFilter,sort,archived:String(archived)});
    api<AdminPage>(`/admin/${section.resource}?${queryString}`,{auth:true,signal:controller.signal}).then(value=>{if(live){setResult(value);if(value.items.length===0&&page>1)setPage(page-1)}}).catch(e=>{if(live){setError(e.message);setResult({items:[],totalRecords:0,page:1,pageSize:25})}}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false;controller.abort()};
  },[filterKey,revision]);
  async function lookup(resource:string, extra=''){
    let current=1;const all:AdminItem[]=[];
    for(;;){const data=await api<AdminPage>(`/admin/${resource}?perPage=250&page=${current}&sort=name${extra}`,{auth:true});all.push(...data.items);if(all.length>=data.totalRecords||!data.items.length)break;current++}
    return all;
  }
  useEffect(()=>{let live=true;Promise.all([lookup('country'),lookup('shipping-type')]).then(([c,m])=>{if(live){setCountries(c);setMethods(m);setLookupError('')}}).catch(e=>{if(live)setLookupError(e.message)});return()=>{live=false}},[revision]);
  useEffect(()=>{let live=true;setStates([]);if(section.resource==='city'&&draft.countryCode)lookup('state',`&countryCode=${encodeURIComponent(draft.countryCode)}`).then(s=>{if(live)setStates(s)}).catch(e=>{if(live)setLookupError(e.message)});return()=>{live=false}},[draft.countryCode,section.resource]);
  useEffect(()=>{if(editor!==undefined){editorBox.current?.scrollIntoView?.({behavior:'smooth',block:'start'});firstField.current?.focus()}},[editor]);
  useEffect(()=>{requestId.current++;setEditor(undefined);setDetail(null);setBusy(false)},[section.resource]);
  function navigate(resource:string){requestId.current++;setParams({section:resource});setPage(1);setQuery('');setSearch('');setStatus('');setCountryFilter('');setArchived(false);setSort('-createdAt');setEditor(undefined);setDetail(null);setNotice('');setError('')}
  async function open(record:AdminItem|null, editing=true){
    const current=++requestId.current;setError('');setNotice('');setBusy(true);
    try{
      const item=record?await api<AdminItem>(`/admin/${section.resource}/${record._id}`,{auth:true}):null;
      if(current!==requestId.current)return;
      if(!editing&&item){setDetail(item);setEditor(undefined);setTrackingStatus(String(item.status||'pending'));setComments('');return}
      const source=section.resource==='order'?{...orderCart(orderCart(item?.cart).formData),...item}:item;
      const values:Record<string,string>={};section.fields.forEach(field=>{const value=source?.[field.key];values[field.key]=value==null?(field.type==='active'?'1':field.type==='number'?'0':field.type==='select'?field.options![0]:''):String(value)});
      setDraft(values);setEditor(item);setDetail(null);
    }catch(e){if(current===requestId.current)setError((e as Error).message)}finally{if(current===requestId.current)setBusy(false)}
  }
  async function save(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    const payload:Record<string,unknown>={};section.fields.forEach(field=>{payload[field.key]=field.type==='number'||field.type==='active'?Number(draft[field.key]):draft[field.key]||''});
    if(section.resource==='order'){const cart=orderCart(editor?.cart);const formData={...orderCart(cart.formData)};for(const key of Object.keys(payload)){if(!['name','price','notes'].includes(key)){formData[key]=payload[key];delete payload[key]}}formData.name=payload.name;payload.cart={...cart,formData}}
    try{await api(`/admin/${section.resource}${editor?`/${editor._id}`:''}`,{method:editor?'PUT':'POST',auth:true,body:JSON.stringify(payload)});setEditor(undefined);setNotice(`${section.label} saved.`);setRevision(v=>v+1)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function upload(file:File){setBusy(true);setError('');try{const body=new FormData();body.append('file',file);const result=await api<{url:string}>('/admin/uploads/container-image',{method:'POST',auth:true,body});setDraft(d=>({...d,image:result.url}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function download(storageKey:string){if(!detail)return;setBusy(true);setError('');try{const blob=await api<Blob>(`/admin/order/${detail._id}/documents/${encodeURIComponent(storageKey)}`,{auth:true,responseType:'blob'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=storageKey;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function archive(record:AdminItem){
    if(!archived&&!window.confirm('Archive this record? You can restore it from the archive.'))return;
    setBusy(true);setError('');try{await api(`/admin/${section.resource}/${record._id}${archived?'/restore':''}`,{method:archived?'POST':'DELETE',auth:true});setNotice(archived?'Record restored.':'Record archived.');setRevision(v=>v+1)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function toggle(record:AdminItem){setBusy(true);setError('');try{await api(`/admin/${section.resource}/${record._id}`,{method:'PUT',auth:true,body:JSON.stringify({isActive:record.isActive===1?0:1})});setRevision(v=>v+1)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function track(event:FormEvent){event.preventDefault();if(!detail)return;setBusy(true);setError('');try{await api(`/admin/order/${detail._id}/tracking`,{method:'POST',auth:true,body:JSON.stringify({status:trackingStatus,comments})});const refreshed=await api<AdminItem>(`/admin/order/${detail._id}`,{auth:true});setDetail(refreshed);setComments('');setNotice('Tracking event added and order status updated.');setRevision(v=>v+1)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  function options(field:Field):{value:string;label:string}[]{
    if(field.type==='country')return countries.map(c=>({value:String(c.isoCode),label:String(c.name)}));
    if(field.type==='state')return states.map(c=>({value:String(c.isoCode),label:String(c.name)}));
    if(field.type==='shipping')return methods.map(c=>({value:c._id,label:String(c.name)}));
    if(field.type==='active')return [{value:'1',label:'Active'},{value:'0',label:'Inactive'}];
    return (field.options||[]).map(value=>({value,label:value}));
  }
  function display(row:AdminItem,key:string){const value=row[key];if(key==='value'&&row.type==='private')return row.hasValue?'Configured (hidden)':'Not configured';if(key==='isActive')return value===1?'Active':'Inactive';if(key==='isPaid')return value===1?'Paid':'Unpaid';if(key==='shippingType')return String(methods.find(m=>m._id===value)?.name||value||'—');if(key==='countryCode')return String(countries.find(c=>c.isoCode===value)?.name||value||'—');if(key==='createdAt')return value?new Date(String(value)).toLocaleDateString():'—';if(key==='price')return Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'});if(key==='rate')return `${value??0}%`;return String(value??'—')}
  return <section className="admin-shell"><aside className="admin-sidebar"><Link className="brand light" to="/">MIRIAX ONE</Link><small>ADMIN CONSOLE</small>{adminSections.map(item=><button key={item.resource} disabled={busy} className={section.resource===item.resource?'active':''} onClick={()=>navigate(item.resource)}>{item.label}</button>)}<Link className="back-site" to="/account">Account settings</Link><Link className="back-site" to="/">Back to website</Link></aside>
    <div className="admin-main"><div className="admin-top"><div><span className="eyebrow">Operations</span><h1>{section.label}</h1></div><SignOutButton/></div>
      {section.resource==='network-route'&&<p className="admin-notice">Creating the first route enables an allowlist for all bookings: publish every origin, destination, and service you support. Hidden, suspended, and archived routes block new bookings.</p>}{notice&&<p className="admin-notice" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error} <button onClick={()=>setRevision(v=>v+1)}>Retry</button></p>}{lookupError&&<p className="error">Dropdowns unavailable: {lookupError}</p>}
      <div className="admin-panel"><div className="admin-panel-head"><h2>{section.label} records <small>({result.totalRecords})</small></h2>{!archived&&<button className="button" disabled={busy} onClick={()=>void open(null)}>New record</button>}</div>
        <div className="admin-filters"><form onSubmit={e=>{e.preventDefault();setQuery(search);setPage(1)}}><label htmlFor="admin-search">Search {section.label.toLowerCase()}</label><div className="input-action"><input id="admin-search" value={search} onChange={e=>setSearch(e.target.value)}/><button className="button small">Search</button></div></form>
          {section.fields.some(f=>f.key==='countryCode')&&<label>Country filter<select value={countryFilter} onChange={e=>{setCountryFilter(e.target.value);setPage(1)}}><option value="">All countries</option>{countries.map(c=><option key={c._id} value={String(c.isoCode)}>{String(c.name)}</option>)}</select></label>}
          {(section.active||section.resource==='order'||section.resource==='contact-us')&&<label>Status filter<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">All statuses</option>{(section.active?['active','inactive']:section.resource==='order'?['pending','confirmed','in-transit','delivered']:['new','in-progress','resolved']).map(s=><option key={s}>{s}</option>)}</select></label>}
          <label>Sort<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1)}}><option value="-createdAt">Newest first</option><option value="createdAt">Oldest first</option><option value="name">Name A–Z</option><option value="-name">Name Z–A</option></select></label>
          <label>View<select value={String(archived)} onChange={e=>{setArchived(e.target.value==='true');setPage(1);setEditor(undefined);setDetail(null)}}><option value="false">Current records</option><option value="true">Archive</option></select></label>
        </div>
        {loading?<p role="status" className="admin-loading">Loading records…</p>:<div className="admin-table-wrap"><table><thead><tr>{section.columns.map(key=><th key={key}>{columnLabels[key]}</th>)}<th>Actions</th></tr></thead><tbody>{result.items.map(row=><tr key={row._id}>{section.columns.map(key=><td key={key}>{display(row,key)}</td>)}<td><div className="actions"><button className="table-action" disabled={busy} onClick={()=>void open(row,false)}>View</button>{!archived&&<button className="table-action" disabled={busy} onClick={()=>void open(row)}>Edit</button>}{section.active&&!archived&&<button className="table-action" disabled={busy} onClick={()=>void toggle(row)}>{row.isActive===1?'Deactivate':'Activate'}</button>}<button className="table-action" disabled={busy} onClick={()=>void archive(row)}>{archived?'Restore':'Archive'}</button></div></td></tr>)}{!result.items.length&&<tr><td colSpan={section.columns.length+1}>No matching records.</td></tr>}</tbody></table></div>}
        <div className="admin-pagination"><button disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(result.totalRecords/25))}</span><button disabled={loading||page*25>=result.totalRecords} onClick={()=>setPage(p=>p+1)}>Next</button></div>
      </div>
      {editor!==undefined&&<div ref={editorBox} className="panel admin-editor"><h2>{editor?'Edit':'Create'} {section.label.toLowerCase()}</h2><form className="form admin-field-grid" onSubmit={save}>{section.fields.map((field,index)=><label key={field.key} className={field.type==='textarea'?'span-two':''}>{field.label}
        {['country','state','shipping','active','select'].includes(field.type||'')?<select required={field.required} value={draft[field.key]||''} disabled={busy||(!!editor&&['country','state'].includes(section.resource)&&['countryCode','isoCode'].includes(field.key))} onChange={e=>setDraft(d=>({...d,[field.key]:e.target.value,...(field.key==='countryCode'?{stateCode:''}:{})}))}><option value="">Select…</option>{options(field).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:field.type==='textarea'?<textarea rows={4} value={draft[field.key]||''} required={field.required} onChange={e=>setDraft(d=>({...d,[field.key]:e.target.value}))}/>:<input ref={index===0?firstField:undefined} type={field.type==='number'?'number':field.type==='secret'&&draft.type==='private'?'password':field.key==='email'?'email':'text'} autoComplete={field.type==='secret'?'new-password':undefined} min={field.min} max={field.max} step={field.type==='number'?'any':undefined} required={field.required} readOnly={!!editor&&((section.resource==='global-settings'&&field.key==='slug')||(['country','state'].includes(section.resource)&&field.key==='isoCode'))} placeholder={field.type==='secret'&&editor?'Leave blank to keep the existing private value':''} value={draft[field.key]||''} onChange={e=>setDraft(d=>({...d,[field.key]:e.target.value}))}/>}
      </label>)}<div className="span-two">{section.resource==='container'&&<label>Upload container image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file)}}/></label>}</div><div className="actions span-two"><button className="button" disabled={busy}>{busy?'Saving…':editor?'Update':'Create'}</button><button type="button" disabled={busy} onClick={()=>setEditor(undefined)}>Cancel</button></div></form></div>}
      {detail&&<div className="panel admin-editor"><div className="admin-panel-head"><h2>Record details</h2><button onClick={()=>setDetail(null)}>Close</button></div>{section.resource==='container'&&typeof detail.image==='string'&&detail.image&&<img className="admin-container-image" src={mediaUrl(detail.image)} alt="Container"/>}<Snapshot value={Object.fromEntries(Object.entries(detail).filter(([key])=>!['tracking','hasValue','files'].includes(key)))}/>{section.resource==='order'&&<><h3>Documents</h3>{attachments(detail.files).map(file=><button className="table-action" disabled={busy} key={file.storageKey} onClick={()=>void download(file.storageKey)}>{file.name} ? Download</button>)}{attachments(detail.files).length===0&&<p>No downloadable documents are stored on this server.</p>}<h3>Tracking history</h3><Snapshot value={detail.tracking||[]}/>{!detail.archived&&<form className="form" onSubmit={track}><h3>Add tracking event</h3><label>Status<select value={trackingStatus} onChange={e=>setTrackingStatus(e.target.value)}>{['pending','confirmed','in-transit','delivered'].map(s=><option key={s}>{s}</option>)}</select></label><label>Public tracking comment<textarea maxLength={2000} value={comments} onChange={e=>setComments(e.target.value)}/></label><button className="button" disabled={busy}>Save tracking event</button></form>}</>}</div>}
    </div></section>;
}


