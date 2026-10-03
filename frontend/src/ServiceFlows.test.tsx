import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ServiceFlowRouter from './ServiceFlows';
import { AuthProvider } from './auth';

afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks()});

function renderShip(initialEntry='/ship'){
  render(<MemoryRouter initialEntries={[initialEntry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AuthProvider><Routes><Route path="/ship" element={<ServiceFlowRouter/>}/></Routes></AuthProvider></MemoryRouter>);
}

it('changes service flow immediately when a service card changes only the query string',()=>{
  renderShip();
  expect(screen.getByRole('heading',{name:'What are you sending?'})).toBeTruthy();
  fireEvent.click(screen.getByRole('link',{name:/Send gift/}));
  expect(screen.getByRole('heading',{name:'Send love, same day.'})).toBeTruthy();
  expect(screen.queryByRole('heading',{name:'What are you sending?'})).toBeNull();
});

it('walks custom cargo one decision at a time', () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ countries: [
    { iso: 'US', name: 'United States', canSendFrom: 1 },
    { iso: 'ET', name: 'Ethiopia', canDeliverTo: 1 },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } })));
  renderShip('/ship?service=custom-cargo');
  expect(screen.getByRole('heading', { name: /How big is it/ })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /How should it move/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { name: /How should it move/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { name: /Where is it going/ })).toBeTruthy();
});


it('continue shopping scrolls back to the gift products',()=>{
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  renderShip('/ship?service=express-gifts');
  fireEvent.click(screen.getByRole('button',{name:'Continue shopping'}));
  expect(scrollIntoView).toHaveBeenCalled();
});

it('creates a gift order without asking for a card',()=>{
  localStorage.setItem('miriax_cart', JSON.stringify([{productId:'sunflwr',name:'Sunflower Bunch (10)',qty:1,price:40,delivery:'Same Day'}]));
  renderShip('/ship?service=express-gifts');
  fireEvent.click(screen.getByRole('button',{name:'Review gift order'}));
  expect(screen.queryByPlaceholderText('Name on card')).toBeNull();
  expect(screen.queryByRole('button',{name:'Create gift order'})).toBeNull();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'guest@example.com' } });
  fireEvent.click(screen.getByRole('button',{name:'Continue as guest'}));
  fireEvent.change(screen.getByLabelText('Recipient name'), { target: { value: 'Family' } });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Addis Ababa' } });
  fireEvent.change(screen.getByLabelText('Street'), { target: { value: 'Bole' } });
  fireEvent.change(screen.getByLabelText('Recipient phone'), { target: { value: '251911000000' } });
  fireEvent.click(screen.getByRole('button',{name:'Continue to review'}));
  expect((screen.getByRole('button',{name:'Create gift order'}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByPlaceholderText('Name on card')).toBeNull();
});

it('lets a signed-in customer skip the guest email', async () => {
  localStorage.setItem('habeshaline_token', 'token');
  localStorage.setItem('miriax_cart', JSON.stringify([{productId:'sunflwr',name:'Sunflower Bunch (10)',qty:1,price:40,delivery:'Same Day'}]));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/auth/me') ? { _id: 'u1', name: 'Nahom', email: 'nahom@example.com', username: 'nahom', role: 'customer', countryCode: 'US', mobile: '7035550100' } : {}), { status: 200, headers: { 'content-type': 'application/json' } })));
  renderShip('/ship?service=express-gifts');
  fireEvent.click(await screen.findByRole('button', { name: 'Review gift order' }));
  expect(await screen.findByRole('heading', { name: 'Checking out as Nahom' })).toBeTruthy();
  expect(screen.queryByLabelText('Email')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { name: 'Where should it go?' })).toBeTruthy();
});


it('asks for barrel size and adds starter barrel examples',async()=>{
  vi.stubGlobal('fetch', vi.fn(async()=>new Response(JSON.stringify({countries:[{iso:'ET',name:'Ethiopia',canDeliverTo:1}],cities:[{id:'addis',name:'Addis Ababa',countryCode:'ET'}]}),{status:200,headers:{'content-type':'application/json'}})));
  renderShip('/ship?service=ship-barrel');
  expect(screen.getByRole('heading',{name:'Choose barrel size'})).toBeTruthy();
  expect(screen.getByRole('button',{name:/Medium barrel/})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Pre-filled item examples'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Family essentials/}));
  expect(screen.getByRole('heading',{name:'5 items'})).toBeTruthy();
  expect(screen.getAllByText('Teff Flour (5 lb bag)').length).toBeGreaterThan(1);
});

it('searches the gift shop and sorts by price', () => {
  renderShip('/ship?service=express-gifts');
  fireEvent.change(screen.getByLabelText('Search gifts'), { target: { value: 'rose' } });
  expect(screen.getByRole('heading', { name: 'Red Roses (12 stems)', level: 3 })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Celebration Cake', level: 3 })).toBeNull();
  fireEvent.change(screen.getByLabelText('Search gifts'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Sort gifts'), { target: { value: 'price-asc' } });
  const names = screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent);
  expect(names[0]).toBe('Ethiopian Coffee Gift Box');
});

it('opens a gift, changes quantity, and adds that size to the cart', () => {
  renderShip('/ship?service=express-gifts');
  fireEvent.click(screen.getByRole('button', { name: 'View Red Roses (12 stems)' }));
  expect(screen.getByRole('heading', { name: 'Red Roses (12 stems)', level: 2 })).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /Deluxe/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add 2 to cart' }));
  expect(screen.getByText('2 in cart')).toBeTruthy();
  expect(screen.getByText('Deluxe / Same Day')).toBeTruthy();
});
