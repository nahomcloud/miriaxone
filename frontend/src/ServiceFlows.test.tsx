import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ServiceFlowRouter from './ServiceFlows';

afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks()});

function renderShip(initialEntry='/ship'){
  render(<MemoryRouter initialEntries={[initialEntry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/ship" element={<ServiceFlowRouter/>}/></Routes></MemoryRouter>);
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
  expect((screen.getByRole('button',{name:'Create gift order'}) as HTMLButtonElement).disabled).toBe(false);
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
