import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OneHome from './OneHome';

afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('uses server availability and carries route selection to real checkout',async()=>{
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>new Response(JSON.stringify(url.includes('platform-config')?{countries:[{iso:'US',name:'United States',canSendFrom:1,canDeliverTo:0},{iso:'ET',name:'Ethiopia',canSendFrom:0,canDeliverTo:1}]}:[{key:'ship-barrel',name:'Ship a Barrel',status:'active',visibility:'visible',available:true,reason:''},{key:'express-gifts',name:'Express Gifts',status:'suspended',visibility:'visible',available:false,reason:'This service is not currently available.'},{key:'custom-cargo',name:'Custom Cargo',status:'active',visibility:'hidden',available:false,reason:''}]),{status:200})));
  render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><OneHome/></MemoryRouter>);
  await screen.findByRole('option',{name:'United States'});
  fireEvent.change(screen.getByLabelText('From'),{target:{value:'US'}});
  fireEvent.change(screen.getByLabelText('To'),{target:{value:'ET'}});
  const booking=await screen.findByRole('link',{name:'Build your barrel'});
  expect(booking.getAttribute('href')).toBe('/ship?origin=US&destination=ET&service=ship-barrel');
  expect(screen.getAllByRole('link',{name:'Build your barrel'})).toHaveLength(1);
  expect(screen.getByText('This service is not currently available.')).toBeTruthy();
});

it('shows API failures without displaying fabricated services',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({detail:'Service unavailable'}),{status:503})));
  render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><OneHome/></MemoryRouter>);
  expect((await screen.findByRole('alert')).textContent).toContain('Service unavailable');
  expect(screen.queryByRole('link',{name:'Build your barrel'})).toBeNull();
});
