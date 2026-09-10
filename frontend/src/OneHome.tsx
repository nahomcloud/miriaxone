import { CSSProperties, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Box, Gift, PackageCheck } from 'lucide-react';
import { api } from './api';
import { pageImage } from './pageImages';

type Country = { iso:string; name:string; canSendFrom:number; canDeliverTo:number };
type Service = { key:string; name:string; status:string; visibility:string; available:boolean; reason:string };

type ServiceStory = {
  key: 'ship-barrel' | 'express-gifts' | 'custom-cargo';
  title: string;
  eyebrow: string;
  text: string;
  image: string;
  cta: string;
};

const serviceStories: ServiceStory[] = [
  { key: 'ship-barrel', title: 'Ship a Barrel', eyebrow: 'Catalog packing', image: '/assets/services-2.jpg', cta: 'Build your barrel', text: 'A catalog-based packing interface for family cargo. Items carry photos, size options with clear explanations, and dimensional weight guidance while your shipment builds in real time.' },
  { key: 'express-gifts', title: 'Express Gifts', eyebrow: 'Same-day moments', image: '/assets/services-4.jpg', cta: 'Send a gift', text: 'Product cards, size chips, delivery speed badges, and same-day availability give customers a fast way to send thoughtful gifts with one click.' },
  { key: 'custom-cargo', title: 'Custom Cargo', eyebrow: 'Professional freight', image: '/assets/services-6.jpg', cta: 'Request a quote', text: 'A freight quoting flow shaped like Flexport or DHL Freight with the Miriax visual system: cargo size, shipping mode, route, delivery preferences, and contact details.' },
];

function storyFor(key:string){return serviceStories.find(s=>s.key===key)}
function hrefFor(service:Service, origin:string, destination:string){return `/ship?${new URLSearchParams({origin,destination,service:service.key})}`}

export default function OneHome(){
  const [countries,setCountries]=useState<Country[]>([]);
  const [origin,setOrigin]=useState(''),[destination,setDestination]=useState('');
  const [services,setServices]=useState<Service[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [checking,setChecking]=useState(false);
  useEffect(()=>{let live=true;api<{countries:Country[]}>('/site/platform-config').then(config=>{if(live)setCountries(config.countries)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
  useEffect(()=>{setServices([]);setChecking(false);if(!origin||!destination)return;let live=true;setChecking(true);setError('');api<Service[]>(`/site/availability?${new URLSearchParams({origin,destination})}`).then(items=>{if(live)setServices(items)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setChecking(false)});return()=>{live=false}},[origin,destination]);
  const visibleServices = services.filter(s=>storyFor(s.key));
  const barrelAvailability = services.find(s=>s.key==='ship-barrel');
  const giftsAvailability = services.find(s=>s.key==='express-gifts');
  return <>
    <section className="one-screen one-hero" style={{'--one-hero-image':`url(${pageImage('homeHero')})`} as CSSProperties}><div className="container one-center"><span className="eyebrow">MIRIAX ONE</span><h1>Move what matters.<br/><em>Beautifully.</em></h1><p>Three focused ways to ship: barrels for family cargo, express gifts for fast moments, and custom cargo for serious freight.</p><div className="one-actions"><a className="ghost-cta" href="#ship-barrel">Explore services</a><Link className="ghost-cta" to="/track">Track shipment</Link></div></div></section>

    <section className="one-screen one-barrel" id="ship-barrel"><div className="container one-service-grid"><div><span className="eyebrow">Ship a Barrel</span><h2>Pack the barrel as you browse.</h2><p>Catalog items show photos, size options, explanations, and dimensional weight. The cart builds the shipment in real time so customers understand space, weight, and price before they submit.</p><RoutePicker countries={countries} origin={origin} destination={destination} setOrigin={setOrigin} setDestination={setDestination}/>{origin&&destination&&<div className="route-inline-action">{checking?<p role="status">Checking barrel service...</p>:barrelAvailability?.available?<Link className="button" to={hrefFor(barrelAvailability,origin,destination)}>Build your barrel <ArrowRight size={16}/></Link>:<p className="error">{barrelAvailability?.reason||'Ship a Barrel is not published for this route yet.'}</p>}</div>}</div><div className="barrel-cards">{['Small family barrel','Shared medium barrel','Full priority barrel'].map((name,i)=><article key={name}><PackageCheck/><b>{name}</b><span>{['Best for essentials','Balanced space and price','Maximum packing room'][i]}</span></article>)}</div></div></section>

    <section className="one-screen one-gifts" id="express-gifts" style={{'--one-gifts-image':`url(${pageImage('giftsHero')})`} as CSSProperties}><div className="container one-gifts-content"><span className="eyebrow">Express Gifts</span><h2>Send something warm, fast.</h2><p>Gift cards use size chips, speed badges, same-day availability, and one-click cart actions for moments that should not feel like freight paperwork.</p><div className="gift-previews">{['Care box','Fresh bundle','Celebration kit','Home comfort'].map((name,i)=><article key={name}><Gift/><b>{name}</b><span>{i===0?'Same day':i===1?'Express':i===2?'Popular':'New'}</span></article>)}</div>{origin&&destination&&<div className="route-inline-action gift-route-action">{checking?<p role="status">Checking gift service...</p>:giftsAvailability?.available?<Link className="button" to={hrefFor(giftsAvailability,origin,destination)}>Shop Express Gifts <ArrowRight size={16}/></Link>:<p className="error">{giftsAvailability?.reason||'Express Gifts is not published for this route yet.'}</p>}</div>}</div></section>

    <section className="one-screen one-custom" id="custom-cargo"><img src={pageImage('customCargo')} alt="Freight moving through a cargo hub"/><div><span className="eyebrow">Custom Cargo</span><h2>Freight quoting with a human face.</h2><p>Five numbered sections guide cargo size, shipping mode, route, delivery preferences, and contact details. A sticky live quote panel recalculates as the customer types.</p><Link className="button" to="/ship?service=custom-cargo">Start custom quote <ArrowRight size={16}/></Link></div></section>

    <section className="one-stats"><div className="container"><b>3</b><span>Core services</span><b>5</b><span>Quote sections</span><b>24h</b><span>Fast response target</span></div></section>

    <section className="one-screen one-route-check" id="one-route"><div className="container"><span className="eyebrow">Live service network</span><h2>Choose a route and see what is open.</h2>{error&&<p className="error" role="alert">{error}</p>}{(loading||checking)&&<p role="status">Checking the service network...</p>}{!origin||!destination?<p>Select both countries to see available services.</p>:<div className="one-services">{visibleServices.map(s=>{const story=storyFor(s.key)!;return <article className="panel" key={s.key}><Box/><span className="eyebrow">{s.available?'Available':s.status==='active'?'Unavailable':s.status.replace('-',' ')}</span><h3>{story.title}</h3><p>{story.text}</p>{s.available?<Link className="button" to={hrefFor(s,origin,destination)}>{story.cta} <ArrowRight size={16}/></Link>:<p>{s.reason}</p>}</article>})}</div>}{!loading&&!checking&&origin&&destination&&!visibleServices.length&&!error&&<p>No services are currently published for this route.</p>}</div></section>

    <section className="one-footer-line"><div className="container"><b>MIRIAX ONE</b><span>(c) {new Date().getFullYear()}</span><Link to="/contact">Contact</Link><Link to="/login">Admin</Link></div></section>
  </>;
}

function RoutePicker({countries,origin,destination,setOrigin,setDestination}:{countries:Country[];origin:string;destination:string;setOrigin:(value:string)=>void;setDestination:(value:string)=>void}){
  return <div className="one-route panel"><label>From<select value={origin} onChange={e=>setOrigin(e.target.value)}><option value="">Choose origin</option>{countries.filter(c=>c.canSendFrom).map(c=><option key={c.iso} value={c.iso}>{c.name}</option>)}</select></label><ArrowRight aria-hidden="true"/><label>To<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Choose destination</option>{countries.filter(c=>c.canDeliverTo).map(c=><option key={c.iso} value={c.iso}>{c.name}</option>)}</select></label></div>
}
