import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Gift, PackageCheck, Truck } from 'lucide-react';
import { CatalogItem, CatalogVariant, GiftAddress, GiftCartItem, loadCatalog, loadGiftAddresses, loadGiftCart, money, saveGiftAddresses, saveGiftCart } from './catalog';
import { api } from './api';

type CartLine = { item: CatalogItem; variant?: CatalogVariant; qty: number };
type PlatformCountry = { iso: string; name: string; canDeliverTo: number };
type PlatformCity = { id: string; name: string; countryCode: string; stateCode?: string };

const barrelCartKey = 'miriax_barrel_cart';
const corridorRates: Record<string, number> = { ET: 4.9, AE: 5.2, IN: 5.7, NG: 6.3 };
const cargoTypes = ['General merchandise','Household goods','Electronics','Food / pantry','Documents','Machinery parts','Textiles','Other'];
const regions = [
  { name: 'East Africa', multiplier: 1.05 },
  { name: 'Middle East', multiplier: 1.15 },
  { name: 'South Asia', multiplier: 1.25 },
  { name: 'West Africa', multiplier: 1.45 },
  { name: 'Europe', multiplier: 1.35 },
  { name: 'North America', multiplier: 1.6 },
  { name: 'Other', multiplier: 1.9 },
];
const containers = [
  { key: 'lcl', name: 'Shared LCL parcel', cbm: 1, base: 180 },
  { key: '20std', name: '20 ft standard', cbm: 33, base: 2200 },
  { key: '20hc', name: '20 ft high cube', cbm: 37, base: 2500 },
  { key: '40std', name: '40 ft standard', cbm: 67, base: 4100 },
  { key: '40hc', name: '40 ft high cube', cbm: 76, base: 4600 },
  { key: 'custom', name: 'Custom dimensions', cbm: 0, base: 240 },
];

function loadBarrelCart(): CartLine[] { try { return JSON.parse(localStorage.getItem(barrelCartKey) || '[]'); } catch { return []; } }
function saveBarrelCart(lines: CartLine[]) { localStorage.setItem(barrelCartKey, JSON.stringify(lines)); }
function itemsFor(service: CatalogItem['service']) { return loadCatalog().filter(item => item.service === service && item.status === 'live'); }
function linePrice(line: CartLine) { return ((line.variant?.price ?? line.item.price) || 0) * line.qty; }
function lineWeight(line: CartLine) { return ((line.variant?.weightLb ?? line.item.weightLb) || 0) * line.qty; }
function lineVolume(line: CartLine) { return ((line.variant?.volumeIn3 ?? line.item.volumeIn3) || 0) * line.qty; }

export default function ServiceFlowRouter() {
  const routerLocation = useLocation();
  const params = new URLSearchParams(routerLocation.search);
  const service = params.get('service');
  if (!service) return <ServiceChooser />;
  if (service === 'express-gifts') return <ExpressGiftsFlow />;
  if (service === 'custom-cargo') return <CustomCargoFlow />;
  return <ShipBarrelFlow />;
}

function Hero({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return <section className="page-hero service-flow-hero"><div className="container"><span className="eyebrow">{kicker}</span><h1>{title}</h1><p>{text}</p></div></section>;
}

function ServiceChooser() {
  const choices = [
    { service: 'ship-barrel', title: 'Ship a Barrel', text: 'Build a barrel from catalog items and your own goods. See space, weight, and estimate before checkout.', action: 'Build barrel', icon: PackageCheck },
    { service: 'express-gifts', title: 'Express Gifts', text: 'Choose a gift, add the recipient, and create a secure gift order with a note or surprise occasion.', action: 'Send gift', icon: Gift },
    { service: 'custom-cargo', title: 'Custom Cargo', text: 'Request a guided freight quote for parcels, LCL, or full-container cargo.', action: 'Request quote', icon: Truck },
  ];
  return <><Hero kicker="Choose one service" title="What are you sending?" text="Pick the path that matches the shipment. Each flow keeps only the decisions needed for that service."/><section className="section service-choice-section"><div className="container service-choice-grid">{choices.map(choice => { const Icon = choice.icon; return <Link className="service-choice-card panel" key={choice.service} to={`/ship?service=${choice.service}`}><Icon/><span className="eyebrow">{choice.action}</span><h2>{choice.title}</h2><p>{choice.text}</p><b>{choice.action} <ArrowRight size={16}/></b></Link>; })}</div></section></>;
}

function ShipBarrelFlow() {
  const routerLocation = useLocation();
  const routeDestination = useMemo(() => new URLSearchParams(routerLocation.search).get('destination') || '', [routerLocation.search]);
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>(loadBarrelCart);
  const [destination, setDestination] = useState(routeDestination);
  const [destinationCity, setDestinationCity] = useState('');
  const [done, setDone] = useState('');
  const [countries, setCountries] = useState<PlatformCountry[]>([]);
  const [cities, setCities] = useState<PlatformCity[]>([]);
  const [geoError, setGeoError] = useState('');

  useEffect(() => {
    let live = true;
    api<{ countries: PlatformCountry[]; cities?: PlatformCity[] }>('/site/platform-config').then(config => {
      if (!live) return;
      const destinations = config.countries.filter(c => c.canDeliverTo);
      setCountries(destinations);
      setCities(config.cities || []);
      setGeoError('');
      setDestination(current => current && destinations.some(c => c.iso === current) ? current : destinations[0]?.iso || '');
    }).catch(e => {
      if (live) { setCountries([]); setCities([]); setGeoError((e as Error).message); }
    });
    return () => { live = false; };
  }, []);

  const destinationCities = useMemo(() => cities.filter(city => city.countryCode === destination), [cities, destination]);
  useEffect(() => { setDestinationCity(current => current && destinationCities.some(city => city.id === current) ? current : destinationCities[0]?.id || ''); }, [destination, destinationCities]);

  const catalog = itemsFor('ship-barrel');
  const categories = ['All', ...Array.from(new Set(catalog.map(item => item.category)))];
  const filtered = category === 'All' ? catalog : catalog.filter(item => item.category === category);
  const actual = cart.reduce((sum, line) => sum + lineWeight(line), 0);
  const volume = cart.reduce((sum, line) => sum + lineVolume(line), 0);
  const dim = volume / 139;
  const effective = Math.max(actual, dim);
  const rate = corridorRates[destination] || 5;
  const goods = cart.reduce((sum, line) => sum + linePrice(line), 0);
  const shipping = effective * rate;

  function persist(next: CartLine[]) { setCart(next); saveBarrelCart(next); }
  function add(item: CatalogItem) { const variant = item.variants.find(v => v.id === selected[item.id]); if (item.variants.length && !variant) return; const next = [...cart]; const existing = next.find(line => line.item.id === item.id && (line.variant?.id || '') === (variant?.id || '')); existing ? existing.qty++ : next.push({ item, variant, qty: 1 }); persist(next); }
  function changeQty(itemId: string, variantId: string | undefined, delta: number) { const next = cart.flatMap(line => { if (line.item.id !== itemId || (line.variant?.id || '') !== (variantId || '')) return [line]; const qty = line.qty + delta; return qty > 0 ? [{ ...line, qty }] : []; }); persist(next); }
  function lineFor(item: CatalogItem) { const variantId = selected[item.id] || ''; return cart.find(line => line.item.id === item.id && (line.variant?.id || '') === variantId); }
  function submit(e: FormEvent) { e.preventDefault(); setDone('MXB-' + Math.random().toString(36).slice(2, 8).toUpperCase()); }

  return <><Hero kicker="Ship a Barrel" title="Pack a barrel with live weight and space." text="Choose catalog items, add customer-owned goods, and see dimensional weight update as the cart changes."/><section className="section"><div className="container flow-layout"><div><div className="flow-tabs">{categories.map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="flow-grid barrel-grid">{filtered.map(item => { const variant = item.variants.find(v => v.id === selected[item.id]); const dims = { weight: variant?.weightLb ?? item.weightLb ?? 0, volume: variant?.volumeIn3 ?? item.volumeIn3 ?? 0 }; const selectedLine = lineFor(item); return <article className="flow-card" key={item.id}>{item.image ? <img src={item.image} alt=""/> : <div className="flow-photo"><PackageCheck/></div>}{item.ownItem && <b className="own-badge">Own Item</b>}<span>{item.category}</span><h3>{item.name}</h3><p>{item.ownItem ? 'Customer-owned item' : item.variants.length && !variant ? 'From ' + money(Math.min(...item.variants.map(v => v.price))) : money(variant?.price ?? item.price)}</p>{item.variants.length > 0 && <div className="chip-row">{item.variants.map(v => <button className={selected[item.id] === v.id ? 'chip active' : 'chip'} key={v.id} onClick={() => setSelected({ ...selected, [item.id]: v.id })}>{v.label}<small>{v.description}</small></button>)}</div>}{variant?.description && <small className="size-note">{variant.description}</small>}<small>{dims.weight} lb / {dims.volume} in3 / {Math.max(dims.weight, dims.volume / 139).toFixed(1)} lb dim.</small>{selectedLine ? <div className="qty-row"><button onClick={() => changeQty(item.id, variant?.id, -1)}>-</button><b>{selectedLine.qty}</b><button onClick={() => changeQty(item.id, variant?.id, 1)}>+</button></div> : <button className="button small" disabled={item.variants.length > 0 && !selected[item.id]} onClick={() => add(item)}>{item.variants.length > 0 && !selected[item.id] ? 'Select a size' : '+ Add'}</button>}</article>; })}</div></div><aside className="flow-cart panel"><span className="eyebrow">Your Shipment</span><h2>{cart.reduce((sum, line) => sum + line.qty, 0)} items</h2><div className="quote-math"><span>Actual weight</span><b>{actual.toFixed(1)} lb</b><span>Cubic volume</span><b>{volume.toFixed(0)} in3</b><span>Dimensional weight</span><b>{dim.toFixed(1)} lb</b><span>Effective weight</span><b className={dim > actual ? 'highlight-weight' : ''}>{effective.toFixed(1)} lb</b></div>{cart.map((line, index) => <div className="cart-line" key={index}><span>{line.item.name}<small>{line.variant?.label || 'Base'} / Qty {line.qty} / {(line.variant?.weightLb ?? line.item.weightLb ?? 0)} lb each</small></span><b>{money(linePrice(line))}</b><button onClick={() => changeQty(line.item.id, line.variant?.id, -line.qty)}>x</button></div>)}<label>Destination corridor<select value={destination} onChange={e => setDestination(e.target.value)}>{countries.map(c => <option key={c.iso} value={c.iso}>{c.name}</option>)}</select>{geoError && <small className="error">Destination countries unavailable: {geoError}</small>}</label><label>Destination city<select value={destinationCity} onChange={e => setDestinationCity(e.target.value)} disabled={!destinationCities.length}>{destinationCities.length ? destinationCities.map(city => <option key={city.id} value={city.id}>{city.name}</option>) : <option value="">No active cities for this country</option>}</select>{destination && !destinationCities.length && <small className="muted-text">Add active cities under Operations / Cities to enable city selection.</small>}</label><div className="quote-math"><span>Items subtotal</span><b>{money(goods)}</b><span>Estimated shipping</span><b>{money(shipping)}</b><span>Total estimate</span><b>{money(goods + shipping)}</b></div><p>Shipping is estimated at {money(rate)}/lb using the higher of actual and dimensional weight.</p><CheckoutFields onSubmit={submit} button="Review barrel shipment" disabled={!cart.length || !destination || (destinationCities.length > 0 && !destinationCity)}/>{done && <p className="success">Shipment reference {done} created for review.</p>}</aside></div></section></>;
}

function CheckoutFields({ onSubmit, button, disabled = false }: { onSubmit: (e: FormEvent) => void; button: string; disabled?: boolean }) {
  return <form className="mini-form" onSubmit={onSubmit}><input required placeholder="Pickup / origin address"/><input required placeholder="Delivery address"/><input required type="email" placeholder="Email"/><button className="button" disabled={disabled}>{button} <ArrowRight size={16}/></button></form>;
}

function ExpressGiftsFlow() {
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<GiftCartItem[]>(loadGiftCart);
  const [checkout, setCheckout] = useState(false);
  const [addresses, setAddresses] = useState<GiftAddress[]>(loadGiftAddresses);
  const [addressId, setAddressId] = useState(addresses[0]?.id || 'new');
  const [newAddress, setNewAddress] = useState<GiftAddress>({ id: 'addr-' + Date.now(), label: '', recipient: '', city: '', address: '', phone: '' });
  const [instructions, setInstructions] = useState('');
  const [occasion, setOccasion] = useState('');
  const [surpriseNote, setSurpriseNote] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const catalog = itemsFor('express-gifts');
  const categories = ['All', ...Array.from(new Set(catalog.map(item => item.category)))];
  const filtered = category === 'All' ? catalog : catalog.filter(item => item.category === category);
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  function persist(next: GiftCartItem[]) { setCart(next); saveGiftCart(next); }
  function add(item: CatalogItem) { const variant = item.variants.find(v => v.id === selected[item.id]); if (item.variants.length && !variant) return; persist([...cart, { productId: item.id, name: item.name, qty: 1, price: variant?.price ?? item.price, sizeLabel: variant?.label, delivery: item.deliverySpeed, image: item.image }]); }
  function qty(index: number, delta: number) { persist(cart.map((line, i) => i === index ? { ...line, qty: Math.max(1, line.qty + delta) } : line)); }
  function remove(index: number) { persist(cart.filter((_, i) => i !== index)); }
  async function confirm(e: FormEvent) { e.preventDefault(); let address = addresses.find(a => a.id === addressId); if (addressId === 'new') { address = { ...newAddress, id: 'addr-' + Date.now(), label: newAddress.label || newAddress.recipient || 'Saved recipient' }; const nextAddresses = [address, ...addresses]; setAddresses(nextAddresses); saveGiftAddresses(nextAddresses); } if (!address) return; setBusy(true); setError(''); try { const order = await api<{ model: { _id: string }; total: number; message: string }>('/site/gift-checkout', { method: 'POST', auth: true, body: JSON.stringify({ items: cart, address, instructions, occasion, surpriseNote, submittedTotal: subtotal }) }); persist([]); setDone(order.model._id); setCheckout(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }

  return <><Hero kicker="Express Gifts" title="Send love, same day." text="Choose a gift, add a recipient, and create an order with a personal note."/><section className="section warm"><div className="container flow-layout express-shop"><div><div className="flow-tabs">{categories.map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="flow-grid gift-grid">{filtered.map(item => { const variant = item.variants.find(v => v.id === selected[item.id]); const price = variant?.price ?? item.price; return <article className="flow-card gift-card" key={item.id}>{item.image ? <img src={item.image} alt=""/> : <div className="flow-photo"><Gift/></div>}<div className="gift-card-top"><span>{item.category}</span><b>{item.deliverySpeed}</b></div><h3>{item.name}</h3><p>{money(price)}</p>{item.deliverySpeed === 'Same Day' && <em>Same-day available before 2 PM</em>}<div className="chip-row">{item.variants.map(v => <button className={selected[item.id] === v.id ? 'chip active' : 'chip'} key={v.id} onClick={() => setSelected({ ...selected, [item.id]: v.id })}>{v.label}<small>{v.description || money(v.price)}</small></button>)}</div><button className="button small" disabled={item.variants.length > 0 && !selected[item.id]} onClick={() => add(item)}>{item.variants.length > 0 && !selected[item.id] ? 'Pick a size' : 'Add to cart'}</button></article>; })}</div></div><aside className="flow-cart panel express-cart"><span className="eyebrow">Gift cart</span>{!cart.length ? <div className="empty-gift-cart"><Gift/><h3>Your gift cart is waiting.</h3><button onClick={() => setCheckout(false)}>Continue shopping</button></div> : <>{cart.map((line, index) => <div className="cart-line gift-line" key={index}><span>{line.name}<small>{line.sizeLabel || 'Standard'} / {line.delivery}</small><i><button onClick={() => qty(index, -1)}>-</button>{line.qty}<button onClick={() => qty(index, 1)}>+</button><button onClick={() => remove(index)}>Remove</button></i></span><b>{money(line.price * line.qty)}</b></div>)}<h2>{money(subtotal)}</h2><button className="button full" onClick={() => setCheckout(true)}>Review gift order</button><button className="ghost-action" onClick={() => setCheckout(false)}>Continue shopping</button></>}{checkout && cart.length > 0 && <form className="gift-checkout" onSubmit={confirm}><h3>Recipient and payment</h3><label>Saved address<select value={addressId} onChange={e => setAddressId(e.target.value)}>{addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}<option value="new">Add new address</option></select></label>{addressId === 'new' && <div className="address-form"><input required placeholder="Address label" value={newAddress.label} onChange={e => setNewAddress({ ...newAddress, label: e.target.value })}/><input required placeholder="Recipient name" value={newAddress.recipient} onChange={e => setNewAddress({ ...newAddress, recipient: e.target.value })}/><input required placeholder="City" value={newAddress.city} onChange={e => setNewAddress({ ...newAddress, city: e.target.value })}/><input required placeholder="Street / landmark" value={newAddress.address} onChange={e => setNewAddress({ ...newAddress, address: e.target.value })}/><input required placeholder="Recipient phone" value={newAddress.phone} onChange={e => setNewAddress({ ...newAddress, phone: e.target.value })}/></div>}<label>Occasion<select value={occasion} onChange={e => setOccasion(e.target.value)}><option value="">Choose occasion</option><option>Surprise gift</option><option>Birthday</option><option>Holiday</option><option>Thank you</option><option>Family support</option><option>Other</option></select></label><textarea value={surpriseNote} onChange={e => setSurpriseNote(e.target.value)} placeholder="Gift note for the recipient, card message, or surprise instructions..."/><textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Gate code, nearest landmark, call on arrival..."/><div className="payment-box"><b>Payment</b><span>Card on confirmation / final delivery window shown before dispatch.</span></div>{error && <p className="error">{error}</p>}<button className="button full" disabled={busy}>{busy ? 'Creating gift order...' : 'Create gift order'}</button></form>}{done && <p className="success">Gift order {done.slice(-8).toUpperCase()} was created on the server. Payment is pending confirmation.</p>}</aside></div></section></>;
}

function CustomCargoFlow() {
  const minDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const [box, setBox] = useState('lcl');
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const [dims, setDims] = useState({ l: 2, w: 1, h: 1 });
  const [weight, setWeight] = useState(250);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [mode, setMode] = useState('Sea LCL');
  const [region, setRegion] = useState(regions[0].name);
  const [priority, setPriority] = useState('standard');
  const [contact, setContact] = useState({ name: '', email: '' });
  const [done, setDone] = useState('');
  const picked = containers.find(c => c.key === box)!;
  const customCbm = unit === 'm' ? dims.l * dims.w * dims.h : dims.l * dims.w * dims.h * 0.0283168;
  const cbm = box === 'custom' ? customCbm : picked.cbm;
  const kg = weightUnit === 'kg' ? weight : weight * 0.453592;
  const airChargeable = Math.max(kg, cbm * 167);
  const regionMult = regions.find(r => r.name === region)?.multiplier || 1;
  const priorityMult = priority === 'economy' ? .88 : priority === 'express' ? 1.35 : 1;
  const base = (picked.base + (mode.includes('Air') ? airChargeable * 4.8 : cbm * 95)) * regionMult * priorityMult;
  function submit(e: FormEvent) { e.preventDefault(); setDone('MXF-' + Math.random().toString(36).slice(2, 8).toUpperCase()); }

  return <><Hero kicker="Custom Cargo" title="Quote anything from LCL to a 40-foot container." text="Five guided sections keep freight quoting clear while the estimate recalculates on every change."/><section className="section"><form className="container custom-flow" onSubmit={submit}><div className="freight-form"><FlowSection n="1" title="Cargo size"><div className="container-options">{containers.map(c => <button type="button" className={box === c.key ? 'active' : ''} key={c.key} onClick={() => setBox(c.key)}>{c.name}<small>{c.key === 'custom' ? 'Enter dimensions' : `${c.cbm} CBM`}</small></button>)}</div>{box === 'custom' && <div className="two"><label>Unit<select value={unit} onChange={e => setUnit(e.target.value as 'm' | 'ft')}><option value="m">Meters</option><option value="ft">Feet</option></select></label><label>Volume<input readOnly value={`${customCbm.toFixed(2)} m3 / ${(customCbm * 35.3147).toFixed(1)} ft3`}/></label><input type="number" min="0" step="any" value={dims.l} onChange={e => setDims({ ...dims, l: Number(e.target.value) })} placeholder="Length"/><input type="number" min="0" step="any" value={dims.w} onChange={e => setDims({ ...dims, w: Number(e.target.value) })} placeholder="Width"/><input type="number" min="0" step="any" value={dims.h} onChange={e => setDims({ ...dims, h: Number(e.target.value) })} placeholder="Height"/></div>}<div className="two"><label>Weight<input type="number" min="1" value={weight} onChange={e => setWeight(Number(e.target.value))}/></label><label>Weight unit<select value={weightUnit} onChange={e => setWeightUnit(e.target.value as 'kg' | 'lb')}><option value="kg">kg</option><option value="lb">lb</option></select></label></div></FlowSection><FlowSection n="2" title="Shipping mode"><select value={mode} onChange={e => setMode(e.target.value)}>{['Sea LCL','Sea FCL','Air freight','Air express'].map(v => <option key={v}>{v}</option>)}</select></FlowSection><FlowSection n="3" title="Route"><div className="two"><input required placeholder="Origin city or port"/><input required placeholder="Destination city or port"/></div><select value={region} onChange={e => setRegion(e.target.value)}>{regions.map(r => <option key={r.name}>{r.name}</option>)}</select></FlowSection><FlowSection n="4" title="Delivery preferences"><div className="two"><label>Preferred date<input type="date" min={minDate}/></label><label>Priority<select value={priority} onChange={e => setPriority(e.target.value)}><option value="economy">Economy -12%</option><option value="standard">Standard</option><option value="express">Express +35%</option></select></label></div><div className="chip-row"><span className="chip active">Morning</span><span className="chip">Afternoon</span><span className="chip">Evening</span></div></FlowSection><FlowSection n="5" title="Contact"><div className="two"><input required value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} placeholder="Name"/><input required type="email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} placeholder="Email"/></div><textarea placeholder="Goods description"/><select>{cargoTypes.map(v => <option key={v}>{v}</option>)}</select><button className="button" disabled={!contact.name || !contact.email}>Request freight quote</button>{done && <p className="success">Quote request {done} has been created.</p>}</FlowSection></div><aside className="quote panel quote-sticky"><span className="eyebrow">Live freight quote</span><h2>{money(base)}</h2><div><span>Volume</span><b>{cbm.toFixed(2)} m3</b></div><div><span>Actual weight</span><b>{kg.toFixed(0)} kg</b></div><div><span>Air chargeable</span><b>{airChargeable.toFixed(0)} kg</b></div><div><span>Zone multiplier</span><b>{regionMult.toFixed(2)}x</b></div><hr/><p>This estimate is reviewed by operations before payment collection.</p><CheckCircle2/></aside></form></section></>;
}

function FlowSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return <section className="flow-section"><h2><span>{n}</span>{title}</h2>{children}</section>;
}
