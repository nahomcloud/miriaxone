import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Box, PackageCheck } from 'lucide-react';
import { api } from './api';

type Country = { iso:string; name:string; canSendFrom:number; canDeliverTo:number };
type Service = { key:string; name:string; status:string; visibility:string; available:boolean; reason:string };

export default function OneHome(){
  const [countries,setCountries]=useState<Country[]>([]);
  const [origin,setOrigin]=useState(''),[destination,setDestination]=useState('');
  const [services,setServices]=useState<Service[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [checking,setChecking]=useState(false);
  useEffect(()=>{let live=true;api<{countries:Country[]}>('/site/platform-config').then(config=>{if(live)setCountries(config.countries)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
  useEffect(()=>{setServices([]);setChecking(false);if(!origin||!destination)return;let live=true;setChecking(true);setError('');api<Service[]>(`/site/availability?${new URLSearchParams({origin,destination})}`).then(items=>{if(live)setServices(items)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setChecking(false)});return()=>{live=false}},[origin,destination]);
  return <>
    <section className="one-hero"><div className="container"><span className="eyebrow">MIRIAX ONE · PEOPLE. PLACES. POSSIBILITIES.</span><h1>Your world.<br/><em>One connection.</em></h1><p>Cargo for the things that matter. Choose your route, find an available service, and arrange your shipment in one place.</p><a className="button" href="#one-route">Find your route <ArrowRight size={18}/></a><Link className="one-track" to="/track">Track a shipment</Link></div></section>
    <section className="section one-discover" id="one-route"><div className="container"><span className="eyebrow">WHERE ARE WE GOING?</span><h2>Start with your route.</h2><p>Availability comes from our current service network. Shipping methods, cargo options, and prices are confirmed in the booking form.</p><div className="one-route panel"><label>From<select value={origin} onChange={e=>{setOrigin(e.target.value);setServices([])}}><option value="">Choose origin</option>{countries.filter(c=>c.canSendFrom).map(c=><option key={c.iso} value={c.iso}>{c.name}</option>)}</select></label><ArrowRight aria-hidden="true"/><label>To<select value={destination} onChange={e=>{setDestination(e.target.value);setServices([])}}><option value="">Choose destination</option>{countries.filter(c=>c.canDeliverTo).map(c=><option key={c.iso} value={c.iso}>{c.name}</option>)}</select></label></div>
    {error&&<p className="error" role="alert">{error}</p>}{(loading||checking)&&<p role="status">Checking the service network…</p>}
    {!origin||!destination?<p>Select both countries to see available services.</p>:<div className="one-services">{services.map(s=><article className="panel" key={s.key}><Box/><span className="eyebrow">{s.available?'Available':s.status==='active'?'Unavailable':s.status.replace('-',' ')}</span><h3>{s.name}</h3><p>{s.key==='container'?'Choose a container and package from our catalog.':'Tell us about your cargo and select a shipping option.'}</p>{s.available?<Link className="button" to={`/ship?${new URLSearchParams({origin,destination,service:s.key})}`}>Arrange shipment <ArrowRight size={16}/></Link>:<p>{s.reason}</p>}</article>)}</div>}
    {!loading&&!checking&&origin&&destination&&!services.length&&!error&&<p>No services are currently published for this route.</p>}</div></section>
    <section className="section muted"><div className="container one-services"><div><PackageCheck/><h2>Every shipment,<br/>in one place.</h2><p>Sign in to review your orders and keep track of progress.</p><Link className="text-link" to="/account">Your account <ArrowRight size={18}/></Link></div><div><span className="eyebrow">SOMETHING DIFFERENT?</span><h2>Let’s talk cargo.</h2><p>Need shopping assistance, a gift delivery, or a custom request? Contact our team to confirm what is possible before booking.</p><Link className="text-link" to="/contact">Contact our team <ArrowRight size={18}/></Link></div></div></section>
  </>;
}
