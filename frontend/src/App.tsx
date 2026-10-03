import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Box, CheckCircle2, Clock3, Gift, Globe2, Headphones, LockKeyhole, Mail, MapPin, Menu, PackageCheck, Search, ShoppingBag, Truck, X } from 'lucide-react';
import { api, unwrap } from './api';
import { pageImage } from './pageImages';
import { RequireAuth, SignOutButton, useAuth } from './auth';
import AccountSettings from './AccountSettings';
import AdminPanel from './AdminPanel';
import Auth from './AuthPage';
import OneHome from './OneHome';
import ServiceFlowRouter from './ServiceFlows';

const services=[
  {slug:'ship-barrel',icon:PackageCheck,title:'Ship a Barrel',text:'Catalog-based barrel packing with item photos, size options, explanations, and dimensional weight guidance.',image:pageImage('barrelHero')},
  {slug:'express-gifts',icon:Gift,title:'Express Gifts',text:'Fast gift delivery with product cards, size chips, speed badges, and same-day availability.',image:pageImage('giftsHero')},
  {slug:'custom-cargo',icon:Truck,title:'Custom Cargo',text:'Professional freight quoting for parcels, LCL, and full-container cargo with a guided five-section flow.',image:pageImage('customCargo')},
];
const serviceCatalog=[...services];

function cartCount(){
  const qty=(raw:string|null)=>{try{const rows=JSON.parse(raw||'[]');return Array.isArray(rows)?rows.reduce((sum,row)=>sum+Number(row?.qty||0),0):0}catch{return 0}};
  return qty(localStorage.getItem('miriax_barrel_cart'))+qty(localStorage.getItem('miriax_cart'));
}
function CartLink(){
  const [count,setCount]=useState(0);
  const [bump,setBump]=useState(false);
  const [notice,setNotice]=useState('');
  const seen=useRef(false);
  const last=useRef(0);
  const timers=useRef<number[]>([]);
  useEffect(()=>{
    const sync=(event?: Event)=>{
      const next=cartCount();
      const name=event instanceof CustomEvent&&typeof event.detail?.name==='string'?event.detail.name:'';
      if(seen.current&&next>last.current){
        setBump(true);
        setNotice(name?`${name} added to cart`:'Added to cart');
        timers.current.forEach(id=>window.clearTimeout(id));
        timers.current=[window.setTimeout(()=>setBump(false),480),window.setTimeout(()=>setNotice(''),2400)];
      }
      seen.current=true; last.current=next; setCount(next);
    };
    sync();
    const onCart=(event: Event)=>sync(event);
    window.addEventListener('miriax-cart',onCart);
    window.addEventListener('storage',onCart);
    return()=>{window.removeEventListener('miriax-cart',onCart);window.removeEventListener('storage',onCart);timers.current.forEach(id=>window.clearTimeout(id))};
  },[]);
  return <><Link to="/ship" className={bump?'nav-cart bump':'nav-cart'} aria-label={count?`Cart, ${count} ${count===1?'item':'items'}`:'Cart'}><ShoppingBag size={18}/><span className="nav-cart-count" aria-hidden="true">{count}</span></Link><p className={notice?'cart-toast show':'cart-toast'} role="status">{notice}</p></>;
}
function NotFound(){return <section className="section"><div className="container narrow"><span className="eyebrow">404</span><h1>That page is not here.</h1><p>The link may be old. Start a shipment or track one you already have.</p><div className="actions"><Link className="button" to="/ship">Ship</Link><Link className="text-link" to="/">Home</Link></div></div></section>}


function Shell({children}:{children:React.ReactNode}){
  const {user}=useAuth(); const [open,setOpen]=useState(false); const location=useLocation(); const menuButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{setOpen(false);window.scrollTo(0,0)},[location.pathname,location.search]);
  useEffect(()=>{if(!open)return;const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);menuButton.current?.focus()}};document.body.style.overflow='hidden';document.addEventListener('keydown',onKeyDown);return()=>{document.body.style.overflow='';document.removeEventListener('keydown',onKeyDown)}},[open]);
  return <><header className="site-header"><div className="container nav"><Link to="/" className="brand" aria-label="MIRIAX ONE"><span>MIRIAX</span></Link><nav id="primary-navigation" className={open?'open':''} onClick={event=>{if((event.target as HTMLElement).closest('a,button'))setOpen(false)}}><NavLink to="/ship">Ship</NavLink><NavLink to="/track">Track</NavLink><NavLink to="/contact">Contact</NavLink>{user?.role==='admin'&&<NavLink to="/admin">Admin</NavLink>}{user?<NavLink to="/account">Account</NavLink>:<NavLink to="/login" className="nav-login">Sign in</NavLink>}{user&&<SignOutButton/>}</nav><div className="nav-end"><CartLink/><button ref={menuButton} className="menu" onClick={event=>{event.stopPropagation();setOpen(!open)}} aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls="primary-navigation">{open?<X/>:<Menu/>}</button></div></div></header>
    <main>{children}</main><footer><div className="container footer-line"><span>MIRIAX ONE</span><Link to="/about">About</Link><Link to="/services">Services</Link><Link to="/contact">Contact</Link><span>(c) {new Date().getFullYear()}</span></div></footer></>;
}

function Hero(){return <section className="hero"><div className="container hero-content"><span className="eyebrow">Cargo without borders</span><h1>Your world,<br/><em>delivered.</em></h1><p>Simple, secure shipping for everything that matters—from your door to destinations around the globe.</p><div className="actions"><Link className="button" to="/ship">Choose a service <ArrowRight size={18}/></Link><Link className="text-link" to="/track">Track shipment <Search size={17}/></Link></div><div className="proof"><span><CheckCircle2/> Transparent pricing</span><span><CheckCircle2/> End-to-end tracking</span><span><CheckCircle2/> Trusted support</span></div></div></section>}

function TrackingBox(){const [id,setId]=useState('');const nav=useNavigate();return <section className="track-strip"><div className="container"><div><span className="eyebrow">Already on the move?</span><h2>Track your shipment</h2></div><form onSubmit={e=>{e.preventDefault();if(id.trim())nav(`/track?id=${encodeURIComponent(id.trim())}`)}}><PackageCheck/><input value={id} onChange={e=>setId(e.target.value)} placeholder="Enter tracking number" aria-label="Tracking number"/><button className="button">Track now</button></form></div></section>}

function ServiceCard({service:s,index:i}:{service:typeof serviceCatalog[number];index:number}){return <Link className="service" to={`/services/${s.slug}`} aria-label={`Learn more about ${s.title}`}><img src={s.image} alt=""/><div><s.icon/><span>0{i+1}</span><h3>{s.title}</h3><p>{s.text}</p><b className="card-link">Learn more <ArrowRight size={16}/></b></div></Link>}
function Home(){return <><Hero/><TrackingBox/><section className="section"><div className="container"><div className="section-heading"><div><span className="eyebrow">Built around your needs</span><h2>However it needs to move,<br/>we’ll get it there.</h2></div><Link className="text-link" to="/services">Explore all services <ArrowRight/></Link></div><div className="cards">{services.map((s,i)=><ServiceCard service={s} index={i} key={s.title}/>)}</div></div></section><section className="section muted"><div className="container split"><img className="feature-image" src={pageImage('chooseUs')}/><div><span className="eyebrow">Why MIRIAX ONE</span><h2>Confidence at every mile.</h2><p className="lead">International shipping can feel complicated. We make it clear, personal, and dependable from booking to delivery.</p><div className="benefits"><div><Globe2/><span><b>Global reach</b>Connections across the world</span></div><div><LockKeyhole/><span><b>Secure handling</b>Care at every transfer</span></div><div><Headphones/><span><b>Human support</b>Real help when you need it</span></div><div><Clock3/><span><b>Clear updates</b>Know where things stand</span></div></div></div></div></section></>}

function PageHero({kicker,title,text}:{kicker:string,title:string,text:string}){return <section className="page-hero"><div className="container"><span className="eyebrow">{kicker}</span><h1>{title}</h1><p>{text}</p></div></section>}
function Services(){return <><PageHero kicker="What we do" title="The right route for every shipment." text="Flexible logistics for parcels, personal cargo, and commercial freight."/><section className="section"><div className="container cards">{serviceCatalog.map((s,i)=><ServiceCard service={s} index={i} key={s.title}/>)}</div></section></>}
function ServiceDetail(){const slug=useLocation().pathname.split('/').pop();const service=serviceCatalog.find(s=>s.slug===slug);if(!service)return <Services/>;const Icon=service.icon;return <><PageHero kicker="Our services" title={service.title} text={service.text}/><section className="section"><div className="container split"><img className="feature-image" src={service.image} alt={service.title}/><div><Icon className="detail-icon"/><span className="eyebrow">A better way to move cargo</span><h2>Reliable from origin to destination.</h2><p className="lead">We coordinate the details, provide clear updates, and help you choose the route that fits your timeline and budget.</p><div className="benefits"><div><CheckCircle2/><span><b>Clear planning</b>Practical guidance before you book</span></div><div><CheckCircle2/><span><b>Secure handling</b>Responsible care throughout transit</span></div><div><CheckCircle2/><span><b>Visible progress</b>Tracking and milestone updates</span></div><div><CheckCircle2/><span><b>Personal support</b>Help whenever questions arise</span></div></div><div className="actions"><Link className="button" to={`/ship?service=${service.slug}`}>Start this service <ArrowRight size={18}/></Link><Link className="text-link" to="/contact">Ask a question</Link></div></div></div></section></>}
function About(){return <><PageHero kicker="Our story" title="Moving more than cargo." text="MIRIAX ONE was built to make international shipping feel closer, clearer, and more dependable."/><section className="section"><div className="container split"><img className="feature-image" src={pageImage('about')}/><div><span className="eyebrow">People first</span><h2>A bridge between people and places.</h2><p className="lead">We understand that every shipment carries a purpose. That’s why we pair global logistics capability with attentive, straightforward service.</p><p>From the first quote to the final handoff, our team focuses on responsible handling, honest communication, and solutions that fit the journey.</p><Link className="button" to="/contact">Talk with our team <ArrowRight/></Link></div></div></section></>}

type TrackEvent={status?:string;description?:string;createdAt?:string};
type TrackData={trackingNumber?:string;trackingId?:string;status?:string;origin?:string;destination?:string;orderTracking?:TrackEvent[];order?:{_id?:string;status?:string};tracking?:TrackEvent[]};
function Track(){
  const [params]=useSearchParams();
  const nav=useNavigate();
  const queryId=params.get('id')||'';
  const [id,setId]=useState(queryId);
  const [result,setResult]=useState<TrackData|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function lookup(value:string){
    const query=value.trim();
    if(!query)return;
    setBusy(true);setError('');setResult(null);
    try{setResult(unwrap(await api<TrackData|{data:TrackData}>(`/site/track-order/${encodeURIComponent(query)}`)))}
    catch(e){const message=(e as Error).message;setError(query.length<20&&/not found/i.test(message)?'That short code is not a tracking number. Paste the full reference from your confirmation.':message)}
    finally{setBusy(false)}
  }
  useEffect(()=>{setId(queryId);if(queryId)void lookup(queryId)},[queryId]);
  async function submit(e:FormEvent){e.preventDefault();const query=id.trim();if(query&&query!==queryId)nav(`/track?id=${encodeURIComponent(query)}`);else await lookup(query)}
  const events=result?.orderTracking||result?.tracking||[];
  const reference=result?.trackingNumber||result?.trackingId||result?.order?._id||id;
  const status=result?.status||result?.order?.status||'Shipment found';
  return <><PageHero kicker="Shipment tracking" title="Follow every mile." text="Paste the full reference from your confirmation. A short code is not enough."/>
    <section className="section"><div className="container narrow">
      <form className="panel form" onSubmit={submit}><label htmlFor="track-id">Tracking number</label>
        <div className="input-action"><input id="track-id" required value={id} onChange={e=>setId(e.target.value)} placeholder="Full reference" autoComplete="off"/><button className="button" disabled={busy}>{busy?'Searching…':'Track'}</button></div>
        {error&&<p className="error" role="alert">{error} <Link to={`/contact?ref=${encodeURIComponent(id.trim())}`}>Ask us about it</Link></p>}
      </form>
      {!result&&!error&&!busy&&<p className="muted-text">Nothing is searched until you enter a reference.</p>}
      {result&&<div className="panel result" role="status"><div className="status-icon"><PackageCheck/></div><span className="eyebrow">Current status</span><h2>{status}</h2><p className="order-ref">{reference}</p>
        {(result.origin||result.destination)&&<div className="route"><span>{result.origin||'Origin'}</span><ArrowRight/><span>{result.destination||'Destination'}</span></div>}
        {events.length?events.map((event,i)=><div className="timeline" key={i}><i/><div><b>{event.status}</b><p>{event.description}</p><small>{event.createdAt&&new Date(event.createdAt).toLocaleString()}</small></div></div>):<p>No checkpoints yet. The reference is in the system.</p>}
        <div className="actions"><Link className="text-link" to={`/contact?ref=${encodeURIComponent(reference)}`}>Ask about this shipment</Link></div>
      </div>}
    </div></section></>;
}

function Contact(){
  const [params]=useSearchParams();
  const ref=params.get('ref')||'';
  const [state,setState]=useState<'idle'|'busy'|'done'>('idle');
  const [error,setError]=useState('');
  const [reason,setReason]=useState(ref?'Tracking':'Quote');
  const reasons=['Quote','Tracking','Account','Something else'];
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setState('busy');setError('');
    const form=e.currentTarget;
    const data=Object.fromEntries(new FormData(form));
    data.subject=reason==='Tracking'&&ref?`Tracking ${ref}`:reason;
    try{await api('/contact-us',{method:'POST',body:JSON.stringify(data)});setState('done');form.reset()}
    catch(err){setError((err as Error).message);setState('idle')}
  }
  return <><PageHero kicker="Contact us" title="Let’s move things forward." text="Tell us what you need. A quote, a tracking question, or an account issue each goes to the right person."/>
    <section className="section"><div className="container contact-grid">
      <div><span className="eyebrow">One message</span><h2>We reply from the operations desk.</h2><p className="lead">Include a tracking reference if you already have one. We do not take payment on this form.</p><div className="contact-detail"><Mail/><span><b>This form</b>Quote, tracking, or account</span></div><div className="contact-detail"><MapPin/><span><b>Routes</b>Shown when you choose a service</span></div></div>
      <form className="panel form" onSubmit={submit}>
        <div className="chip-row" role="group" aria-label="Reason">{reasons.map(item=><button type="button" key={item} className={reason===item?'chip active':'chip'} onClick={()=>setReason(item)}>{item}</button>)}</div>
        <div className="two"><div><label htmlFor="contact-name">Full name</label><input id="contact-name" name="name" required autoComplete="name"/></div><div><label htmlFor="contact-email">Email</label><input id="contact-email" name="email" type="email" required autoComplete="email"/></div></div>
        <label htmlFor="contact-phone">Phone</label><input id="contact-phone" name="phone" type="tel" required autoComplete="tel"/>
        <label htmlFor="contact-message">Message</label><textarea id="contact-message" name="message" rows={5} required defaultValue={ref?`Reference ${ref}. `:''} placeholder={reason==='Tracking'?'Where is the shipment, and what reference do you have?':'What do you need to move?'}/>
        {error&&<p className="error" role="alert">{error}</p>}
        {state==='done'&&<p className="success" role="status">Thanks—your message has been sent.</p>}
        <button className="button" disabled={state==='busy'}>{state==='busy'?'Sending…':'Send message'}</button>
      </form>
    </div></section></>;
}

function Account(){
  const [orders,setOrders]=useState<AdminRecord[]>([]);
  const [notice,setNotice]=useState('');
  const [filter,setFilter]=useState<'all'|'active'>('all');
  useEffect(()=>{api<ListResponse>('/account/orders',{auth:true}).then(v=>setOrders(listFrom(v))).catch(error=>setNotice(error.message))},[]);
  const moving=orders.filter(o=>!['delivered','cancelled'].includes(String(o.status).toLowerCase()));
  const shown=filter==='active'?moving:orders;
  return <><PageHero kicker="Your account" title="Shipment dashboard" text="Review orders, track active cargo, and start a new shipment."/>
    <section className="section"><div className="container">
      <div className="dashboard-actions"><Link className="button" to="/place-order">Create shipment <ArrowRight/></Link><SignOutButton/></div>
      <AccountSettings/>
      {notice&&<div className="admin-notice" role="alert">{notice}</div>}
      <div className="metrics"><div><PackageCheck/><b>{orders.length} orders</b><span>All shipment records</span></div><div><Truck/><b>{moving.length} active</b><span>Shipments still moving</span></div><div><Box/><b>New shipment</b><span><Link to="/place-order">Create your next order</Link></span></div></div>
      <div className="admin-panel account-orders"><div className="admin-panel-head"><div><h2>Your orders</h2><p>Use an order reference to open public tracking.</p></div>
        <div className="chip-row" role="group" aria-label="Order filter"><button type="button" className={filter==='all'?'chip active':'chip'} onClick={()=>setFilter('all')}>All</button><button type="button" className={filter==='active'?'chip active':'chip'} onClick={()=>setFilter('active')}>Still moving</button></div>
      </div>
      <div className="admin-table-wrap"><table><thead><tr><th>Reference</th><th>Name</th><th>Total</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>{shown.length?shown.map((o,i)=><tr key={o._id||i}><td><b className="order-ref">{o._id||'Pending'}</b></td><td>{o.name||'Shipment'}</td><td>{Number(o.price||o.total||o.amount||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</td><td><span className={`status ${String(o.status||'pending').toLowerCase()}`}>{o.status||'Pending'}</span></td><td>{o.createdAt?new Date(o.createdAt).toLocaleDateString():'—'}</td><td><Link className="table-action" to={`/track?id=${o._id}`}>Track</Link></td></tr>):<tr><td colSpan={6}><div className="empty-admin"><PackageCheck/><h3>{orders.length?'Nothing is still moving':'No orders yet'}</h3><p>{orders.length?'Delivered and cancelled shipments are under All.':'Your shipments will appear here.'}</p></div></td></tr>}</tbody></table></div></div>
    </div></section></>;
}

function ShipPage(){return <ServiceFlowRouter/>}

function PaymentResult(){const id=useLocation().pathname.split('/').pop();return <><PageHero kicker="Order received" title="Your shipment is in our system." text="Keep the reference below to follow its progress."/><section className="section"><div className="container narrow"><div className="panel result"><div className="status-icon"><CheckCircle2/></div><h2>Thank you for your order</h2><p>Tracking reference</p><h3>{id||'Pending confirmation'}</h3><div className="actions"><Link className="button" to={`/track?id=${id||''}`}>Track shipment</Link><Link className="text-link" to="/dashboard">View dashboard</Link></div></div></div></section></>}

type AdminRecord={_id?:string;status?:string;name?:string;email?:string;createdAt?:string;total?:number;amount?:number;price?:number;countryCode?:string;rate?:number;value?:string;slug?:string;type?:string;description?:string};
type ListResponse={docs?:AdminRecord[];totalDocs?:number;data?:AdminRecord[]}|AdminRecord[];
function listFrom(value:ListResponse){if(Array.isArray(value))return value;return value.docs||value.data||[]}
export default function App(){return <Routes><Route path="/admin" element={<RequireAuth admin><AdminPanel/></RequireAuth>}/><Route path="*" element={<Shell><Routes><Route path="/" element={<OneHome/>}/><Route path="/home" element={<OneHome/>}/><Route path="/about" element={<About/>}/><Route path="/services" element={<Services/>}/><Route path="/services/:slug" element={<ServiceDetail/>}/><Route path="/track" element={<Track/>}/><Route path="/contact" element={<Contact/>}/><Route path="/login" element={<Auth key="login" mode="login"/>}/><Route path="/register" element={<Auth key="register" mode="register"/>}/><Route path="/ship" element={<ShipPage/>}/><Route path="/place-order" element={<ShipPage/>}/><Route path="/account" element={<RequireAuth><Account/></RequireAuth>}/><Route path="/dashboard" element={<RequireAuth><Account/></RequireAuth>}/><Route path="/site/process-order/:id" element={<PaymentResult/>}/><Route path="*" element={<NotFound/>}/></Routes></Shell>}/></Routes>}



