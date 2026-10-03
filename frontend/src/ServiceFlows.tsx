import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Gift, PackageCheck, Truck } from 'lucide-react';
import { CatalogItem, CatalogVariant, GiftAddress, GiftCartItem, giftServerLine, loadCatalog, loadGiftAddresses, loadGiftCart, money, saveGiftAddresses, saveGiftCart } from './catalog';
import { api, submitServiceRequest } from './api';
import { useAuth } from './auth';

type CartLine = { item: CatalogItem; variant?: CatalogVariant; qty: number };
type PlatformCountry = { iso: string; name: string; canDeliverTo?: number; canSendFrom?: number };
type PlatformCity = { id: string; name: string; countryCode: string; stateCode?: string };

const barrelCartKey = 'miriax_barrel_cart';
const corridorRates: Record<string, number> = { ET: 4.9, ER: 5.4, UG: 5.6, AE: 5.2, IN: 5.7, NG: 6.3 };
const barrelSizes = [
  { key: 'small', name: 'Small barrel', detail: 'Best for essentials and light family items.', volumeIn3: 3465, baseFee: 30 },
  { key: 'medium', name: 'Medium barrel', detail: 'Balanced space for clothes, pantry, and gifts.', volumeIn3: 6930, baseFee: 50 },
  { key: 'large', name: 'Large barrel', detail: 'Maximum packing room for a full family shipment.', volumeIn3: 12705, baseFee: 80 },
];
const starterBarrelPacks = [
  { name: 'Family essentials', detail: 'Food, coffee, clothing, and care basics.', items: [{ id: 'teff', qty: 1 }, { id: 'coffee-barrel', qty: 1 }, { id: 'kidswear', qty: 2 }, { id: 'shea', qty: 1 }] },
  { name: 'Clothing barrel', detail: 'Common customer-owned clothing examples.', items: [{ id: 'tshirts', qty: 2 }, { id: 'jeans', qty: 2 }, { id: 'dress', qty: 1 }, { id: 'textile', qty: 1 }] },
  { name: 'Home and electronics', detail: 'Example mix for household and device shipping.', items: [{ id: 'books', qty: 1 }, { id: 'chargers', qty: 1 }, { id: 'tablet', qty: 1 }, { id: 'pottery', qty: 1 }] },
];
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
function saveBarrelCart(lines: CartLine[], name?: string) { localStorage.setItem(barrelCartKey, JSON.stringify(lines)); window.dispatchEvent(new CustomEvent('miriax-cart', { detail: name ? { name } : {} })); }
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
  const [barrelSize, setBarrelSize] = useState('medium');
  const [destination, setDestination] = useState(routeDestination);
  const [destinationCity, setDestinationCity] = useState('');
  const [done, setDone] = useState('');
  const [added, setAdded] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [countries, setCountries] = useState<PlatformCountry[]>([]);
  const [origins, setOrigins] = useState<PlatformCountry[]>([]);
  const [origin, setOrigin] = useState('');
  const [cities, setCities] = useState<PlatformCity[]>([]);
  const [geoError, setGeoError] = useState('');
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    let live = true;
    api<{ countries: PlatformCountry[]; cities?: PlatformCity[] }>('/site/platform-config').then(config => {
      if (!live) return;
      const destinations = config.countries.filter(c => c.canDeliverTo);
      const senders = config.countries.filter(c => c.canSendFrom);
      setCountries(destinations);
      setOrigins(senders);
      setCities(config.cities || []);
      setGeoError('');
      setOrigin(current => current && senders.some(c => c.iso === current) ? current : senders.find(c => c.iso === 'US')?.iso || senders[0]?.iso || '');
      setDestination(current => current && destinations.some(c => c.iso === current) ? current : destinations[0]?.iso || '');
    }).catch(e => {
      if (live) { setCountries([]); setCities([]); setGeoError((e as Error).message); }
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!origin || !destination) return;
    let live = true;
    api<{ key: string; available: boolean; reason: string }[]>(`/site/availability?origin=${origin}&destination=${destination}`)
      .then(rows => { if (live) setRouteError(rows.find(row => row.key === 'ship-barrel')?.reason || ''); })
      .catch(() => { if (live) setRouteError(''); });
    return () => { live = false; };
  }, [origin, destination]);

  const destinationCities = useMemo(() => cities.filter(city => city.countryCode === destination), [cities, destination]);
  useEffect(() => { setDestinationCity(current => current && destinationCities.some(city => city.id === current) ? current : destinationCities[0]?.id || ''); }, [destination, destinationCities]);

  const catalog = itemsFor('ship-barrel');
  const categories = ['All', ...Array.from(new Set(catalog.map(item => item.category)))];
  const filtered = category === 'All' ? catalog : catalog.filter(item => item.category === category);
  const selectedBarrel = barrelSizes.find(size => size.key === barrelSize) || barrelSizes[1];
  const actual = cart.reduce((sum, line) => sum + lineWeight(line), 0);
  const volume = cart.reduce((sum, line) => sum + lineVolume(line), 0);
  const dim = volume / 139;
  const effective = Math.max(actual, dim);
  const rate = corridorRates[destination] || 5;
  const goods = cart.reduce((sum, line) => sum + linePrice(line), 0);
  const shipping = effective * rate + selectedBarrel.baseFee;
  const fillPercent = Math.round((volume / selectedBarrel.volumeIn3) * 100);
  const overfilled = volume > selectedBarrel.volumeIn3;

  function persist(next: CartLine[], name?: string) { setCart(next); saveBarrelCart(next, name); }
  function add(item: CatalogItem) { const variant = item.variants.find(v => v.id === selected[item.id]); if (item.variants.length && !variant) return; const next = [...cart]; const existing = next.find(line => line.item.id === item.id && (line.variant?.id || '') === (variant?.id || '')); existing ? existing.qty++ : next.push({ item, variant, qty: 1 }); persist(next, item.name); setAdded(item.name); }
  function changeQty(itemId: string, variantId: string | undefined, delta: number) { const current = cart.find(line => line.item.id === itemId && (line.variant?.id || '') === (variantId || '')); const next = cart.flatMap(line => { if (line.item.id !== itemId || (line.variant?.id || '') !== (variantId || '')) return [line]; const qty = line.qty + delta; return qty > 0 ? [{ ...line, qty }] : []; }); persist(next, delta > 0 ? current?.item.name : undefined); }
  function lineFor(item: CatalogItem) { const variantId = selected[item.id] || ''; return cart.find(line => line.item.id === item.id && (line.variant?.id || '') === variantId); }
  function applyStarterPack(pack: typeof starterBarrelPacks[number]) { const next = pack.items.flatMap(entry => { const item = catalog.find(c => c.id === entry.id); return item ? [{ item, qty: entry.qty }] : []; }); persist(next); setDone(''); }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (overfilled) { setSubmitError('This barrel is over capacity. Remove items or choose a larger size.'); return; }
    if (routeError) { setSubmitError(routeError); return; }
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const country = countries.find(c => c.iso === destination)?.name || destination;
    const from = origins.find(c => c.iso === origin)?.name || origin;
    const city = destinationCities.find(c => c.id === destinationCity)?.name || 'city to be confirmed';
    const lines = cart.map(line => `${line.qty} x ${line.item.name}${line.variant ? ` (${line.variant.label})` : ''}`).join('; ');
    setBusy(true); setSubmitError('');
    try {
      const result = await submitServiceRequest({
        serviceKey: 'ship-barrel', name: data.name, email: data.email, phone: data.phone,
        origin, destination, estimate: Number((goods + shipping).toFixed(2)),
        items: cart.map(line => ({ id: line.item.id, name: line.item.name, qty: line.qty, variant: line.variant?.label || '' })),
        summary: `${selectedBarrel.name} from ${from} to ${city}, ${country}. Pickup: ${data.origin}. Delivery: ${data.delivery}. Items: ${lines}. Estimate ${money(goods + shipping)}.`,
      });
      setDone(result.model._id);
      persist([]);
    } catch (err) { setSubmitError((err as Error).message); } finally { setBusy(false); }
  }

  return <><Hero kicker="Ship a Barrel" title="Pack a barrel with live weight and space." text="Choose a barrel size, start from example items, then adjust the cart before review."/><section className="section"><div className="container flow-layout"><div><section className="barrel-setup panel"><div><span className="eyebrow">Step 1</span><h2>Choose barrel size</h2><p>Select the barrel size first so customers understand capacity and base handling before they add items.</p></div><div className="barrel-size-grid">{barrelSizes.map(size => <button type="button" className={barrelSize === size.key ? 'active' : ''} key={size.key} onClick={() => setBarrelSize(size.key)}><b>{size.name}</b><span>{size.detail}</span><small>{size.volumeIn3.toLocaleString()} in3 capacity / {money(size.baseFee)} base fee</small></button>)}</div></section><section className="barrel-setup panel"><div><span className="eyebrow">Starter examples</span><h2>Pre-filled item examples</h2><p>Use one of these examples to fill the cart quickly, then add or remove anything.</p></div><div className="starter-pack-grid">{starterBarrelPacks.map(pack => <button type="button" key={pack.name} onClick={() => applyStarterPack(pack)}><b>{pack.name}</b><span>{pack.detail}</span><small>{pack.items.reduce((sum, item) => sum + item.qty, 0)} example items</small></button>)}</div></section><div className="flow-tabs">{categories.map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="flow-grid barrel-grid">{filtered.map(item => { const variant = item.variants.find(v => v.id === selected[item.id]); const dims = { weight: variant?.weightLb ?? item.weightLb ?? 0, volume: variant?.volumeIn3 ?? item.volumeIn3 ?? 0 }; const selectedLine = lineFor(item); return <article className="flow-card" key={item.id}>{item.image ? <img src={item.image} alt=""/> : <div className="flow-photo"><PackageCheck/></div>}{item.ownItem && <b className="own-badge">Own Item</b>}<span>{item.category}</span><h3>{item.name}</h3><p>{item.ownItem ? 'Customer-owned item' : item.variants.length && !variant ? 'From ' + money(Math.min(...item.variants.map(v => v.price))) : money(variant?.price ?? item.price)}</p>{item.variants.length > 0 && <div className="chip-row">{item.variants.map(v => <button className={selected[item.id] === v.id ? 'chip active' : 'chip'} key={v.id} onClick={() => setSelected({ ...selected, [item.id]: v.id })}>{v.label}<small>{v.description}</small></button>)}</div>}{variant?.description && <small className="size-note">{variant.description}</small>}<small>{dims.weight} lb / {dims.volume} in3 / {Math.max(dims.weight, dims.volume / 139).toFixed(1)} lb dim.</small>{selectedLine ? <div className="qty-row"><button onClick={() => changeQty(item.id, variant?.id, -1)}>-</button><b>{selectedLine.qty}</b><button onClick={() => changeQty(item.id, variant?.id, 1)}>+</button></div> : <button className="button small" disabled={item.variants.length > 0 && !selected[item.id]} onClick={() => add(item)}>{item.variants.length > 0 && !selected[item.id] ? 'Select a size' : '+ Add'}</button>}</article>; })}</div></div><aside className="flow-cart panel barrel-cart"><span className="eyebrow">Your Shipment</span><h2>{cart.reduce((sum, line) => sum + line.qty, 0)} items</h2>{added && <p className="cart-added" role="status">{added} added</p>}<div className="selected-barrel"><b>{selectedBarrel.name}</b><span>{fillPercent}% filled by volume</span><small>{volume.toFixed(0)} of {selectedBarrel.volumeIn3.toLocaleString()} in3</small></div><div className="quote-math"><span>Actual weight</span><b>{actual.toFixed(1)} lb</b><span>Cubic volume</span><b>{volume.toFixed(0)} in3</b><span>Dimensional weight</span><b>{dim.toFixed(1)} lb</b><span>Effective weight</span><b className={dim > actual ? 'highlight-weight' : ''}>{effective.toFixed(1)} lb</b></div>{cart.map((line, index) => <div className="cart-line" key={index}><span>{line.item.name}<small>{line.variant?.label || 'Base'} / Qty {line.qty} / {(line.variant?.weightLb ?? line.item.weightLb ?? 0)} lb each</small></span><b>{money(linePrice(line))}</b><button onClick={() => changeQty(line.item.id, line.variant?.id, -line.qty)}>x</button></div>)}<label>Sending from<select value={origin} onChange={e => setOrigin(e.target.value)}>{origins.map(c => <option key={c.iso} value={c.iso}>{c.name}</option>)}</select></label><label>Destination corridor<select value={destination} onChange={e => setDestination(e.target.value)}>{countries.map(c => <option key={c.iso} value={c.iso}>{c.name}</option>)}</select>{geoError && <small className="error">Destination countries unavailable: {geoError}</small>}</label><label>Destination city<select value={destinationCity} onChange={e => setDestinationCity(e.target.value)} disabled={!destinationCities.length}>{destinationCities.length ? destinationCities.map(city => <option key={city.id} value={city.id}>{city.name}</option>) : <option value="">No active cities for this country</option>}</select>{destination && !destinationCities.length && <small className="muted-text">Add active cities under Operations / Cities to enable city selection.</small>}</label><div className="quote-math"><span>Items subtotal</span><b>{money(goods)}</b><span>Barrel base fee</span><b>{money(selectedBarrel.baseFee)}</b><span>Estimated shipping</span><b>{money(shipping)}</b><span>Total estimate</span><b>{money(goods + shipping)}</b></div><p>Shipping uses {money(rate)}/lb plus the selected barrel base fee. Final pricing is reviewed before payment.</p>{overfilled && <p className="error">This barrel is {fillPercent}% full. Remove items or choose a larger size.</p>}{routeError && <p className="error">{routeError}</p>}<CheckoutFields onSubmit={submit} button={busy ? 'Sending request' : 'Review barrel shipment'} disabled={busy || overfilled || Boolean(routeError) || !cart.length || !origin || !destination || (destinationCities.length > 0 && !destinationCity)}/>{submitError && <p className="error">{submitError}</p>}{done && <p className="success">Request received. Reference {done}. Our team will confirm the estimate before anything is charged.</p>}</aside></div></section></>;
}

function CheckoutFields({ onSubmit, button, disabled = false }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void; button: string; disabled?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
  const back = location.pathname + location.search;
  return <form className="mini-form" key={user?._id || 'guest'} onSubmit={onSubmit}>{user ? <p className="muted-text">Signed in as {user.name}. This request stays on your account.</p> : <p className="muted-text">Continue without an account, or <Link to="/login" state={{ from: back }}>sign in</Link> to track it later.</p>}<input required name="name" placeholder="Your name" autoComplete="name" defaultValue={user?.name || ''}/><input required name="phone" type="tel" placeholder="Phone" autoComplete="tel" defaultValue={user?.mobile || ''}/><input required name="origin" placeholder="Pickup / origin address"/><input required name="delivery" placeholder="Delivery address"/><input required name="email" type="email" placeholder="Email" autoComplete="email" defaultValue={user?.email || ''}/><button className="button" disabled={disabled}>{button} <ArrowRight size={16}/></button></form>;
}

function giftFloor(item: CatalogItem) {
  return item.variants.length ? Math.min(...item.variants.map(variant => variant.price)) : item.price;
}

function ExpressGiftsFlow() {
  const productListRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [viewId, setViewId] = useState('');
  const [detailQty, setDetailQty] = useState(1);
  const [cart, setCart] = useState<GiftCartItem[]>(loadGiftCart);
  const [checkout, setCheckout] = useState(false);
  const [addresses, setAddresses] = useState<GiftAddress[]>(loadGiftAddresses);
  const [addressId, setAddressId] = useState(addresses[0]?.id || 'new');
  const [newAddress, setNewAddress] = useState<GiftAddress>({ id: 'addr-' + Date.now(), label: '', recipient: '', city: '', address: '', phone: '' });
  const [instructions, setInstructions] = useState('');
  const [occasion, setOccasion] = useState('');
  const [surpriseNote, setSurpriseNote] = useState('');
  const [done, setDone] = useState('');
  const [added, setAdded] = useState('');
  const [pulse, setPulse] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'account' | 'delivery' | 'payment' | 'review'>('account');
  const [guestEmail, setGuestEmail] = useState('');
  const [payMethod, setPayMethod] = useState<'later' | 'mobile' | 'card'>('later');
  const [payProvider, setPayProvider] = useState('Telebirr');
  const [payPhone, setPayPhone] = useState('');
  const { user } = useAuth();
  const location = useLocation();
  const catalog = itemsFor('express-gifts');
  const categories = ['All', ...Array.from(new Set(catalog.map(item => item.category)))];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = category === 'All' ? catalog : catalog.filter(item => item.category === category);
    if (needle) list = list.filter(item => `${item.name} ${item.category}`.toLowerCase().includes(needle));
    if (sort === 'price-asc') list = [...list].sort((a, b) => giftFloor(a) - giftFloor(b));
    if (sort === 'price-desc') list = [...list].sort((a, b) => giftFloor(b) - giftFloor(a));
    if (sort === 'same-day') list = [...list].sort((a, b) => Number(b.deliverySpeed === 'Same Day') - Number(a.deliverySpeed === 'Same Day'));
    return list;
  }, [catalog, category, query, sort]);
  const view = catalog.find(item => item.id === viewId) || null;
  const viewVariant = view?.variants.find(variant => variant.id === selected[view.id]);
  const viewPrice = viewVariant?.price ?? view?.price ?? 0;
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.qty, 0);
  const pieces = cart.reduce((sum, line) => sum + line.qty, 0);
  function persist(next: GiftCartItem[], name?: string) { setCart(next); saveGiftCart(next, name); }
  function continueShopping() { setCheckout(false); setViewId(''); productListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function add(item: CatalogItem, count = 1) {
    const variant = item.variants.find(entry => entry.id === selected[item.id]);
    if (item.variants.length && !variant) return;
    const sizeLabel = variant?.label;
    const price = variant?.price ?? item.price;
    const index = cart.findIndex(line => line.productId === item.id && (line.sizeLabel || '') === (sizeLabel || ''));
    persist(index >= 0 ? cart.map((line, i) => i === index ? { ...line, qty: Math.min(25, line.qty + count), price } : line) : [...cart, { productId: item.id, name: item.name, qty: count, price, sizeLabel, delivery: item.deliverySpeed, image: item.image }], item.name);
    setDone('');
    setAdded(item.name);
    const key = `${item.id}-${sizeLabel || ''}`;
    setPulse(key);
    window.setTimeout(() => setPulse(current => current === key ? '' : current), 700);
  }
  function openGift(item: CatalogItem) {
    setViewId(item.id);
    setDetailQty(1);
    setCheckout(false);
    if (item.variants.length && !selected[item.id]) setSelected(current => ({ ...current, [item.id]: item.variants[0].id }));
  }
  function qty(index: number, delta: number) { const line = cart[index]; persist(cart.map((entry, i) => i === index ? { ...entry, qty: Math.max(1, entry.qty + delta) } : entry), delta > 0 ? line?.name : undefined); }
  function remove(index: number) { persist(cart.filter((_, i) => i !== index)); }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    let address = addresses.find(a => a.id === addressId);
    if (addressId === 'new') {
      address = { ...newAddress, id: 'addr-' + Date.now(), label: newAddress.label || newAddress.recipient || 'Saved recipient' };
      const nextAddresses = [address, ...addresses];
      setAddresses(nextAddresses);
      saveGiftAddresses(nextAddresses);
    }
    if (!address || !address.recipient.trim() || !address.city.trim() || !address.address.trim() || address.phone.trim().length < 5) { setError('Add a recipient name, city, street, and phone.'); setStep('delivery'); return; }
    const email = (user?.email || guestEmail).trim();
    if (!email.includes('@')) { setError('Add an email so we can confirm the order.'); setStep('account'); return; }
    const paymentPhone = payPhone.replace(/\D/g, '');
    if (payMethod === 'mobile' && paymentPhone.length < 7) { setError('Add the mobile money number.'); setStep('payment'); return; }
    const items = cart.map(giftServerLine);
    const total = Number(items.reduce((sum, line) => sum + line.price * line.qty, 0).toFixed(2));
    if (items.some((line, index) => line.price !== cart[index].price)) { persist(cart.map((line, index) => ({ ...line, price: items[index].price }))); setError('A gift price changed. Review the total, then send again.'); return; }
    setBusy(true);
    setError('');
    try {
      const order = await api<{ model: { _id: string }; total: number; message: string }>('/site/gift-checkout', { method: 'POST', auth: true, body: JSON.stringify({ items, address, email, instructions, occasion, surpriseNote, submittedTotal: total, paymentMethod: payMethod, paymentProvider: payMethod === 'mobile' ? payProvider : '', paymentPhone: payMethod === 'mobile' ? paymentPhone : '' }) });
      persist([]);
      setDone(order.model._id);
      setCheckout(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <><Hero kicker="Express Gifts" title="Send love, same day." text="Search the shop, choose a size, and check out to a recipient. No card is taken until the order is confirmed."/>
    <section className="section warm"><div className="container flow-layout express-shop">
      <div ref={productListRef} className="gift-products">
        <div className="shop-toolbar">
          <input aria-label="Search gifts" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search gifts"/>
          <select aria-label="Sort gifts" value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="same-day">Same day first</option></select>
          <span className="shop-count">{filtered.length} {filtered.length === 1 ? 'gift' : 'gifts'}</span>
        </div>
        <div className="flow-tabs">{categories.map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
        {view && <article className="gift-detail panel"><button type="button" className="ghost-action" onClick={() => setViewId('')}>Back to gifts</button><div className="gift-detail-grid">{view.image ? <img src={view.image} alt=""/> : <div className="flow-photo"><Gift/></div>}<div><span className="eyebrow">{view.category}</span><h2>{view.name}</h2><p className="gift-price">{money(viewPrice)}</p><p>{viewVariant?.description || view.deliverySpeed}</p>{view.deliverySpeed === 'Same Day' && <em>Same-day available before 2 PM</em>}{view.variants.length > 0 && <div className="chip-row">{view.variants.map(variant => <button type="button" className={selected[view.id] === variant.id ? 'chip active' : 'chip'} key={variant.id} onClick={() => setSelected({ ...selected, [view.id]: variant.id })}>{variant.label}<small>{money(variant.price)}</small></button>)}</div>}<div className="qty-row"><button type="button" aria-label="Decrease quantity" onClick={() => setDetailQty(value => Math.max(1, value - 1))}>-</button><b>{detailQty}</b><button type="button" aria-label="Increase quantity" onClick={() => setDetailQty(value => Math.min(25, value + 1))}>+</button></div><button className="button" disabled={view.variants.length > 0 && !viewVariant} onClick={() => add(view, detailQty)}>{view.variants.length > 0 && !viewVariant ? 'Pick a size' : `Add ${detailQty} to cart`}</button></div></div></article>}
        {filtered.length === 0 ? <p className="muted-text">No gifts match that search.</p> : <div className="flow-grid gift-grid">{filtered.map(item => { const variant = item.variants.find(entry => entry.id === selected[item.id]); const price = variant?.price ?? giftFloor(item); const inCart = cart.some(line => line.productId === item.id); return <article className="flow-card gift-card" key={item.id}>{item.image ? <img src={item.image} alt=""/> : <div className="flow-photo"><Gift/></div>}<div className="gift-card-top"><span>{item.category}</span><b>{item.deliverySpeed}</b></div><h3>{item.name}</h3><p>{item.variants.length && !variant ? `From ${money(price)}` : money(price)}</p>{item.deliverySpeed === 'Same Day' && <em>Same-day available before 2 PM</em>}{inCart && <small>In cart</small>}<div className="chip-row">{item.variants.map(entry => <button className={selected[item.id] === entry.id ? 'chip active' : 'chip'} key={entry.id} onClick={() => setSelected({ ...selected, [item.id]: entry.id })}>{entry.label}<small>{entry.description || money(entry.price)}</small></button>)}</div><div className="gift-card-actions"><button type="button" className="ghost-action" onClick={() => openGift(item)}>View {item.name}</button><button className="button small" disabled={item.variants.length > 0 && !selected[item.id]} onClick={() => add(item)}>{item.variants.length > 0 && !selected[item.id] ? 'Pick a size' : 'Add to cart'}</button></div></article>; })}</div>}
      </div>
      <aside className="flow-cart express-cart"><span className="eyebrow">Gift cart</span><h2>{pieces ? `${pieces} in cart` : 'Your cart'}</h2>{added && <p className="cart-added" role="status">{added} added</p>}{!cart.length ? <div className="empty-gift-cart"><Gift/><h3>Your gift cart is waiting.</h3><button type="button" onClick={continueShopping}>Continue shopping</button></div> : <>{cart.map((line, index) => <div className={pulse === `${line.productId}-${line.sizeLabel || ''}` ? 'cart-line gift-line just-added' : 'cart-line gift-line'} key={`${line.productId}-${line.sizeLabel || index}`}><span>{line.name}<small>{line.sizeLabel || 'Standard'} / {line.delivery}</small><i><button type="button" aria-label={`Decrease ${line.name}`} onClick={() => qty(index, -1)}>-</button>{line.qty}<button type="button" aria-label={`Increase ${line.name}`} onClick={() => qty(index, 1)}>+</button><button type="button" onClick={() => remove(index)}>Remove</button></i></span><b>{money(line.price * line.qty)}</b></div>)}<div className="quote-math"><span>Subtotal</span><b>{money(subtotal)}</b></div><button type="button" className="button full" onClick={() => { setCheckout(true); setViewId(''); setStep('account'); setError(''); }}>Review gift order</button><button type="button" className="ghost-action" onClick={continueShopping}>Continue shopping</button></>}{checkout && cart.length > 0 && <form className="gift-checkout" onSubmit={confirm}><ol className="checkout-steps">{(['account','delivery','payment','review'] as const).map((name, index) => <li key={name} className={step === name ? 'active' : ''}><button type="button" onClick={() => { const order = ['account','delivery','payment','review']; if (order.indexOf(name) <= order.indexOf(step)) { setError(''); setStep(name); } }}>{index + 1}. {name === 'account' ? 'Account' : name === 'delivery' ? 'Delivery' : name === 'payment' ? 'Payment' : 'Place order'}</button></li>)}</ol>{step === 'account' && (user ? <><h3>Checking out as {user.name}</h3><p className="muted-text">{user.email}. This order is saved to your account.</p><button type="button" className="button full" onClick={() => { setError(''); setStep('delivery'); }}>Continue</button></> : <><h3>How should we reach you?</h3><p className="muted-text">Sign in to save the order, or continue as a guest.</p><Link to="/login" state={{ from: location.pathname + location.search }}>Sign in</Link><label>Email<input type="email" aria-label="Email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label><button type="button" className="button full" onClick={() => { if (!guestEmail.includes('@')) { setError('Add an email so we can confirm the order.'); return; } setError(''); setStep('delivery'); }}>Continue as guest</button></>)}{step === 'delivery' && <><h3>Where should it go?</h3><label>Saved address<select aria-label="Saved address" value={addressId} onChange={e => setAddressId(e.target.value)}>{addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}<option value="new">Add new address</option></select></label>{addressId === 'new' && <div className="address-form"><input required aria-label="Address label" placeholder="Address label" value={newAddress.label} onChange={e => setNewAddress({ ...newAddress, label: e.target.value })}/><input required aria-label="Recipient name" placeholder="Recipient name" value={newAddress.recipient} onChange={e => setNewAddress({ ...newAddress, recipient: e.target.value })}/><input required aria-label="City" placeholder="City" value={newAddress.city} onChange={e => setNewAddress({ ...newAddress, city: e.target.value })}/><input required aria-label="Street" placeholder="Street / landmark" value={newAddress.address} onChange={e => setNewAddress({ ...newAddress, address: e.target.value })}/><input required aria-label="Recipient phone" placeholder="Recipient phone" value={newAddress.phone} onChange={e => setNewAddress({ ...newAddress, phone: e.target.value })}/></div>}<button type="button" className="button full" onClick={() => { const chosen = addressId === 'new' ? newAddress : addresses.find(a => a.id === addressId); if (!chosen || !chosen.recipient.trim() || !chosen.city.trim() || !chosen.address.trim() || chosen.phone.trim().length < 5) { setError('Add a recipient name, city, street, and phone.'); return; } setError(''); setStep('payment'); }}>Continue to payment</button></>}{step === 'payment' && <><h3>How will you pay?</h3><p className="muted-text">Nothing is charged until we confirm the order. Do not type a card number here.</p><div className="chip-row"><button type="button" className={payMethod === 'later' ? 'chip active' : 'chip'} onClick={() => setPayMethod('later')}>Pay when confirmed</button><button type="button" className={payMethod === 'mobile' ? 'chip active' : 'chip'} onClick={() => setPayMethod('mobile')}>Mobile money</button><button type="button" className={payMethod === 'card' ? 'chip active' : 'chip'} onClick={() => setPayMethod('card')}>Card request</button></div>{payMethod === 'mobile' && <div className="payment-box"><label>Provider<select aria-label="Mobile money provider" value={payProvider} onChange={e => setPayProvider(e.target.value)}><option>Telebirr</option><option>M-Pesa</option><option>CBE Birr</option><option>Airtel Money</option></select></label><label>Mobile money number<input aria-label="Mobile money number" inputMode="tel" value={payPhone} onChange={e => setPayPhone(e.target.value)} placeholder="Phone on the wallet" autoComplete="tel"/></label></div>}{payMethod === 'card' && <p className="muted-text">We send a secure card request for {money(subtotal)} after confirmation. This page never stores a card number.</p>}<button type="button" className="button full" onClick={() => { if (payMethod === 'mobile' && payPhone.replace(/\D/g, '').length < 7) { setError('Add the mobile money number.'); return; } setError(''); setStep('review'); }}>Continue to review</button></>}{step === 'review' && <><h3>Place the gift order</h3><ul className="checkout-lines">{cart.map((line, index) => <li key={index}><span>{line.qty} × {line.name}</span><b>{money(line.price * line.qty)}</b></li>)}</ul><p className="muted-text">{user ? user.email : guestEmail}</p><label>Occasion<select aria-label="Occasion" value={occasion} onChange={e => setOccasion(e.target.value)}><option value="">Choose occasion</option><option>Surprise gift</option><option>Birthday</option><option>Holiday</option><option>Thank you</option><option>Family support</option><option>Other</option></select></label><textarea aria-label="Gift note" value={surpriseNote} onChange={e => setSurpriseNote(e.target.value)} placeholder="Gift note for the recipient, card message, or surprise instructions..."/><textarea aria-label="Delivery note" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Gate code, nearest landmark, call on arrival..."/><button className="button full" disabled={busy}>{busy ? 'Creating gift order...' : 'Create gift order'}</button><p className="muted-text">{payMethod === 'mobile' ? `${payProvider} ${payPhone}` : payMethod === 'card' ? `Card request for ${money(subtotal)}` : 'Pay when the order is confirmed'}. Nothing is charged on this page.</p></>}{error && <p className="error">{error}</p>}</form>}{done && <p className="success">Gift order created. Track it with {done}.</p>}</aside>
    </div></section></>;
}

function regionForIso(iso: string) {
  if (['ET', 'ER', 'UG', 'KE', 'TZ', 'RW', 'SO', 'DJ'].includes(iso)) return 'East Africa';
  if (['AE', 'SA', 'QA', 'BH', 'KW', 'OM'].includes(iso)) return 'Middle East';
  if (['IN', 'PK', 'BD', 'LK'].includes(iso)) return 'South Asia';
  if (['NG', 'GH', 'SN', 'CI'].includes(iso)) return 'West Africa';
  if (['US', 'CA', 'MX'].includes(iso)) return 'North America';
  if (['GB', 'DE', 'FR', 'IT', 'NL', 'ES', 'SE', 'NO'].includes(iso)) return 'Europe';
  return 'Other';
}

function CustomCargoFlow() {
  const { user } = useAuth();
  const location = useLocation();
  const steps = ['Size', 'Mode', 'Route', 'Contact'];
  const minDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState('lcl');
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const [dims, setDims] = useState({ l: 2, w: 1, h: 1 });
  const [weight, setWeight] = useState(250);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [mode, setMode] = useState('Sea LCL');
  const [priority, setPriority] = useState('standard');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [goods, setGoods] = useState(cargoTypes[0]);
  const [notes, setNotes] = useState('');
  const [readyDate, setReadyDate] = useState('');
  const [origins, setOrigins] = useState<PlatformCountry[]>([]);
  const [countries, setCountries] = useState<PlatformCountry[]>([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [manualRoute, setManualRoute] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [done, setDone] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setContact(current => ({ name: current.name || user.name, email: current.email || user.email, phone: current.phone || user.mobile }));
  }, [user]);

  useEffect(() => {
    let live = true;
    api<{ countries: PlatformCountry[] }>('/site/platform-config').then(config => {
      if (!live) return;
      const senders = config.countries.filter(c => c.canSendFrom);
      const destinations = config.countries.filter(c => c.canDeliverTo);
      setOrigins(senders);
      setCountries(destinations);
      setOrigin(current => current || senders.find(c => c.iso === 'US')?.iso || senders[0]?.iso || '');
      setDestination(current => current || destinations[0]?.iso || '');
      setManualRoute(senders.length === 0 || destinations.length === 0);
      setGeoError('');
    }).catch(error => {
      if (!live) return;
      setManualRoute(true);
      setGeoError((error as Error).message);
    });
    return () => { live = false; };
  }, []);

  const picked = containers.find(c => c.key === box)!;
  const customCbm = unit === 'm' ? dims.l * dims.w * dims.h : dims.l * dims.w * dims.h * 0.0283168;
  const cbm = box === 'custom' ? customCbm : picked.cbm;
  const kg = weightUnit === 'kg' ? weight : weight * 0.453592;
  const airChargeable = Math.max(kg, cbm * 167);
  const regionName = manualRoute ? 'Other' : regionForIso(destination);
  const regionMult = regions.find(r => r.name === regionName)?.multiplier || 1;
  const priorityMult = priority === 'express' ? 1.35 : 1;
  const base = (picked.base + (mode.includes('Air') ? airChargeable * 4.8 : cbm * 95)) * regionMult * priorityMult;
  const originName = origins.find(c => c.iso === origin)?.name || origin;
  const destinationName = countries.find(c => c.iso === destination)?.name || destination;
  const routeReady = manualRoute ? origin.trim().length > 1 && destination.trim().length > 1 : Boolean(origin && destination);
  const contactReady = contact.name.trim().length > 1 && contact.email.includes('@') && contact.phone.trim().length > 5;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactReady || !routeReady) return;
    setBusy(true); setSubmitError('');
    try {
      const result = await submitServiceRequest({
        serviceKey: 'custom-cargo', name: contact.name, email: contact.email, phone: contact.phone,
        origin: originName, destination: destinationName, estimate: Number(base.toFixed(2)),
        summary: `${picked.name}, ${mode}, ${originName} to ${destinationName}, ${regionName}, ${priority}${readyDate ? `, ready ${readyDate}` : ''}. ${goods}. ${cbm.toFixed(2)} m3 / ${kg.toFixed(0)} kg. Estimate ${money(base)}. ${notes}`,
      });
      setDone(result.model._id);
    } catch (err) { setSubmitError((err as Error).message); } finally { setBusy(false); }
  }

  return <><Hero kicker="Custom Cargo" title="Quote anything from LCL to a 40-foot container." text="One decision at a time. The number on the side is an estimate, not a charge."/>
    <section className="section"><form className="container custom-flow" onSubmit={submit}>
      <div className="freight-form">
        <ol className="cargo-steps">{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><button type="button" onClick={() => index < step && setStep(index)}>{index + 1}. {label}</button></li>)}</ol>
        {step === 0 && <FlowSection n="1" title="How big is it?"><div className="container-options">{containers.map(c => <button type="button" className={box === c.key ? 'active' : ''} key={c.key} onClick={() => setBox(c.key)}>{c.name}<small>{c.key === 'custom' ? 'Enter dimensions' : `${c.cbm} CBM`}</small></button>)}</div>{box === 'custom' && <div className="two"><label>Unit<select value={unit} onChange={e => setUnit(e.target.value as 'm' | 'ft')}><option value="m">Meters</option><option value="ft">Feet</option></select></label><label>Volume<input readOnly value={`${customCbm.toFixed(2)} m3`}/></label><input aria-label="Length" type="number" min="0" step="any" value={dims.l} onChange={e => setDims({ ...dims, l: Number(e.target.value) })} placeholder="Length"/><input aria-label="Width" type="number" min="0" step="any" value={dims.w} onChange={e => setDims({ ...dims, w: Number(e.target.value) })} placeholder="Width"/><input aria-label="Height" type="number" min="0" step="any" value={dims.h} onChange={e => setDims({ ...dims, h: Number(e.target.value) })} placeholder="Height"/></div>}<div className="two"><label>Weight<input aria-label="Weight" type="number" min="1" value={weight} onChange={e => setWeight(Number(e.target.value))}/></label><label>Weight unit<select aria-label="Weight unit" value={weightUnit} onChange={e => setWeightUnit(e.target.value as 'kg' | 'lb')}><option value="kg">kg</option><option value="lb">lb</option></select></label></div></FlowSection>}
        {step === 1 && <FlowSection n="2" title="How should it move?"><div className="container-options">{['Sea LCL', 'Sea FCL', 'Air freight', 'Air express'].map(v => <button type="button" className={mode === v ? 'active' : ''} key={v} onClick={() => setMode(v)}>{v}<small>{v.startsWith('Air') ? 'Charged on weight or volume' : 'Charged on volume'}</small></button>)}</div><div className="chip-row"><button type="button" className={priority === 'standard' ? 'chip active' : 'chip'} onClick={() => setPriority('standard')}>Standard</button><button type="button" className={priority === 'express' ? 'chip active' : 'chip'} onClick={() => setPriority('express')}>Express</button></div><p className="muted-text">Express is about 35% above the standard estimate. Final price is confirmed before anything is charged.</p></FlowSection>}
        {step === 2 && <FlowSection n="3" title="Where is it going?"><p className="muted-text">{origins.length ? `Sending from ${origins.map(c => c.name).join(', ')}.` : 'Origin list is unavailable, so enter the city.'} {countries.length ? `Delivering to ${countries.map(c => c.name).join(', ')}.` : ''}</p>{geoError && <p className="error">{geoError}</p>}{manualRoute ? <div className="two"><input required aria-label="Origin" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Origin city or port"/><input required aria-label="Destination" value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination city or port"/></div> : <div className="two"><label>From<select aria-label="Origin" value={origin} onChange={e => setOrigin(e.target.value)}>{origins.map(c => <option key={c.iso} value={c.iso}>{c.name}</option>)}</select></label><label>To<select aria-label="Destination" value={destination} onChange={e => setDestination(e.target.value)}>{countries.map(c => <option key={c.iso} value={c.iso}>{c.name}</option>)}</select></label></div>}</FlowSection>}
        {step === 3 && <FlowSection n="4" title="Who should we call?">{user ? <p className="muted-text">Signed in as {user.name}. This quote stays on your account.</p> : <p className="muted-text">Continue without an account, or <Link to="/login" state={{ from: location.pathname + location.search }}>sign in</Link> to track it later.</p>}<div className="two"><input required aria-label="Name" value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} placeholder="Name"/><input required type="email" aria-label="Email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} placeholder="Email"/></div><input required type="tel" aria-label="Phone" value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} placeholder="Phone"/><label>Goods<select aria-label="Goods" value={goods} onChange={e => setGoods(e.target.value)}>{cargoTypes.map(v => <option key={v}>{v}</option>)}</select></label><label>Ready date<input aria-label="Ready date" type="date" min={minDate} value={readyDate} onChange={e => setReadyDate(e.target.value)}/></label><textarea aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="What is in the shipment?"/>{submitError && <p className="error">{submitError}</p>}<button className="button" disabled={busy || !contactReady || !routeReady}>{busy ? 'Sending quote' : 'Request freight quote'}</button>{done && <p className="success">Quote request {done} is with the team. This estimate is not a charge.</p>}</FlowSection>}
        <div className="cargo-nav">{step > 0 && <button type="button" className="ghost-action" onClick={() => setStep(step - 1)}>Back</button>}{step < 3 && <button type="button" className="button" disabled={step === 2 && !routeReady} onClick={() => setStep(step + 1)}>Continue</button>}</div>
      </div>
      <aside className="quote panel quote-sticky"><span className="eyebrow">Estimate</span><h2>{money(base)}</h2><div><span>Size</span><b>{picked.name}</b></div><div><span>Volume</span><b>{cbm.toFixed(2)} m3</b></div><div><span>Weight</span><b>{kg.toFixed(0)} kg</b></div>{mode.includes('Air') && <div><span>Air chargeable</span><b>{airChargeable.toFixed(0)} kg</b></div>}<div><span>Route</span><b>{originName && destinationName ? `${originName} to ${destinationName}` : 'Not chosen'}</b></div><hr/><p>Includes the selected mode and a handling estimate. It does not include duties, last-mile surprises, or a confirmed sailing. Nothing is charged until the team confirms the quote.</p></aside>
    </form></section></>;
}

function FlowSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return <section className="flow-section"><h2><span>{n}</span>{title}</h2>{children}</section>;
}
