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

it('opens the requested service from the query string on first render',()=>{
  renderShip('/ship?service=custom-cargo');
  expect(screen.getByRole('heading',{name:'Quote anything from LCL to a 40-foot container.'})).toBeTruthy();
});


it('continue shopping scrolls back to the gift products',()=>{
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  renderShip('/ship?service=express-gifts');
  fireEvent.click(screen.getByRole('button',{name:'Continue shopping'}));
  expect(scrollIntoView).toHaveBeenCalled();
});

it('requires dummy payment details before creating a gift order',()=>{
  localStorage.setItem('miriax_cart', JSON.stringify([{productId:'sunflwr',name:'Sunflower Bunch (10)',qty:1,price:40,delivery:'Same Day'}]));
  renderShip('/ship?service=express-gifts');
  fireEvent.click(screen.getByRole('button',{name:'Review gift order'}));
  const createButton = screen.getByRole('button',{name:'Create gift order'}) as HTMLButtonElement;
  expect(createButton.disabled).toBe(true);
  fireEvent.change(screen.getByPlaceholderText('Name on card'),{target:{value:'Demo Customer'}});
  fireEvent.change(screen.getByPlaceholderText('Card number, e.g. 4242 4242 4242 4242'),{target:{value:'4242 4242 4242 4242'}});
  fireEvent.change(screen.getByPlaceholderText('MM/YY'),{target:{value:'12/30'}});
  fireEvent.change(screen.getByPlaceholderText('CVC'),{target:{value:'123'}});
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
