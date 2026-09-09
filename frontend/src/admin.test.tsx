import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPanel from './AdminPanel';
import { AuthProvider } from './auth';
import { adminSections, AdminItem } from './adminConfig';

const fetchMock=vi.fn();
const response=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
let records:Record<string,AdminItem[]>;
beforeEach(()=>{
  localStorage.clear();localStorage.setItem('habeshaline_token','test-token');fetchMock.mockReset();vi.stubGlobal('fetch',fetchMock);vi.stubGlobal('scrollTo',vi.fn());vi.spyOn(window,'confirm').mockReturnValue(true);
  records={
    service:[{_id:'service1',key:'ship-barrel',name:'Ship a Barrel',status:'active',visibility:'visible'}],
    'network-route':[{_id:'route1',name:'Test route',origin:'ET',destination:'ET',service:'ship-barrel',status:'active',visibility:'visible'}],
    order:[{_id:'order1',name:'Parcel',price:100,status:'pending',isPaid:0,cart:JSON.stringify({formData:{receiverName:'Receiver'},cartData:{cartItems:[{name:'Box'}]}}),tracking:[]}],
    product:[{_id:'product1',name:'Box',price:12,width:1,height:2,depth:3,weight:4,isActive:1}],
    container:[{_id:'container1',countryCode:'ET',shippingType:'air1',width:1,height:2,depth:3,price:40,isActive:1,description:'Small container'}],
    'tax-rate':[{_id:'tax1',name:'VAT',countryCode:'ET',rate:15}],
    'country-document':[{_id:'document1',name:'Invoice',countryCode:'ET',shippingType:'air1',description:'Upload invoice'}],
    'contact-us':[{_id:'contact1',name:'Sender',email:'sender@example.com',phone:'1234567',subject:'Question',message:'Help',status:'new'}],
    country:[{_id:'country1',name:'Ethiopia',isoCode:'ET',phonecode:'251',flag:'ET',currency:'ETB',isActive:1}],
    state:[{_id:'state1',name:'Addis Ababa',isoCode:'AA',countryCode:'ET'}],
    city:[{_id:'city1',name:'Addis Ababa',stateCode:'AA',countryCode:'ET'}],
    'global-settings':[{_id:'setting1',name:'API credential',slug:'square_payment_access_token',type:'private',value:'',hasValue:true}],
    'shipping-type':[{_id:'air1',name:'Air'}],
  };
  fetchMock.mockImplementation((raw:string,options:RequestInit={})=>{
    const url=new URL(raw,'http://localhost');const path=url.pathname.replace(/^\/api/,'');
    if(path==='/auth/me')return Promise.resolve(response({_id:'admin1',name:'Admin',role:'admin'}));
    const [, , resource,id,action]=path.split('/');
    if(!resource)return Promise.resolve(response({}));
    const list=records[resource]||[];
    if(options.method==='PUT'){const data=JSON.parse(String(options.body));const item=list.find(row=>row._id===id)!;Object.assign(item,data);return Promise.resolve(response(item))}
    if(options.method==='DELETE'){const item=list.find(row=>row._id===id)!;item.archived=true;return Promise.resolve(response({message:'Archived'}))}
    if(options.method==='POST'&&action==='restore'){list.find(row=>row._id===id)!.archived=false;return Promise.resolve(response({message:'Restored'}))}
    if(options.method==='POST'&&action==='tracking'){const data=JSON.parse(String(options.body));const item=list.find(row=>row._id===id)!;item.status=data.status;item.tracking=[data];return Promise.resolve(response({message:'Tracked'}))}
    if(options.method==='POST'){const item={_id:'new1',...JSON.parse(String(options.body))};list.push(item);return Promise.resolve(response(item))}
    if(id)return Promise.resolve(response(list.find(row=>row._id===id)));
    const filtered=list.filter(row=>Boolean(row.archived)===(url.searchParams.get('archived')==='true'));
    return Promise.resolve(response({items:filtered,totalRecords:filtered.length,page:Number(url.searchParams.get('page')||1),pageSize:25}));
  });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()});
function mount(resource:string){render(<MemoryRouter initialEntries={['/admin?section='+resource]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AuthProvider><AdminPanel/></AuthProvider></MemoryRouter>)}

describe('Forms for all admin sections',()=>{
  it.each(adminSections.filter(section=>section.fields.length))('$label opens and saves a structured form',async section=>{
    mount(section.resource);
    fireEvent.click(await screen.findByRole('button',{name:'Edit'}));
    const first=await screen.findByLabelText(section.fields[0].label);
    if(section.fields[0].key==='name')fireEvent.change(first,{target:{value:'Updated name'}});
    if(section.resource==='city')await waitFor(()=>expect((screen.getByLabelText('State / province') as HTMLSelectElement).value).toBe('AA'));
    fireEvent.click(screen.getByRole('button',{name:'Update'}));
    await screen.findByText(section.label+' saved.');
    const request=fetchMock.mock.calls.find(([,options])=>options.method==='PUT');
    expect(request![0]).toContain('/admin/'+section.resource+'/');
    const payload=JSON.parse(request![1].body);expect(payload._id).toBeUndefined();
    if(section.resource==='order')expect(payload.cart.cartData.cartItems[0].name).toBe('Box');
    if(section.resource==='global-settings')expect(payload.value).toBe('');
  });
  it('creates a tax rate with numeric input and country selection',async()=>{
    mount('tax-rate');fireEvent.click(await screen.findByRole('button',{name:'New record'}));
    fireEvent.change(await screen.findByLabelText('Name'),{target:{value:'VAT'}});
    fireEvent.change(screen.getByLabelText('Country'),{target:{value:'ET'}});
    fireEvent.change(screen.getByLabelText('Tax rate (%)'),{target:{value:'15'}});
    fireEvent.click(screen.getByRole('button',{name:'Create'}));await screen.findByText('Tax rates saved.');
    expect(JSON.parse(fetchMock.mock.calls.find(([,o])=>o.method==='POST')![1].body)).toEqual({name:'VAT',countryCode:'ET',rate:15});
  });
  it('archives and restores without permanent deletion',async()=>{
    mount('product');fireEvent.click(await screen.findByRole('button',{name:'Archive'}));await screen.findByText('Record archived.');
    fireEvent.change(screen.getByLabelText('View'),{target:{value:'true'}});fireEvent.click(await screen.findByRole('button',{name:'Restore'}));await screen.findByText('Record restored.');
    expect(records.product).toHaveLength(1);expect(records.product[0].archived).toBe(false);
  });
  it('sends search and filters to the paginated API',async()=>{
    mount('tax-rate');await screen.findByText('VAT');
    fireEvent.change(screen.getByLabelText('Search tax rates'),{target:{value:'GST'}});fireEvent.click(screen.getByRole('button',{name:'Search'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('q=GST')&&url.includes('perPage=25'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Country filter'),{target:{value:'ET'}});
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('countryCode=ET')&&url.includes('page=1'))).toBe(true));
  });
  it('masks private settings and keeps the replacement field empty',async()=>{
    mount('global-settings');await screen.findByText('Configured (hidden)');fireEvent.click(screen.getByRole('button',{name:'Edit'}));
    const value=await screen.findByLabelText('Value') as HTMLInputElement;expect(value.type).toBe('password');expect(value.value).toBe('');expect((screen.getByLabelText('Setting key') as HTMLInputElement).readOnly).toBe(true);
  });
  it('updates order status through a tracking event',async()=>{
    mount('order');fireEvent.click(await screen.findByRole('button',{name:'View'}));await screen.findByText('Tracking history');
    fireEvent.change(screen.getByLabelText('Status'),{target:{value:'in-transit'}});fireEvent.change(screen.getByLabelText('Public tracking comment'),{target:{value:'Departed hub'}});fireEvent.click(screen.getByRole('button',{name:'Save tracking event'}));
    await screen.findByText('Tracking event added and order status updated.');expect(records.order[0].status).toBe('in-transit');
  });  it('opens the local item catalog manager',async()=>{
    mount('item-catalog');
    expect(await screen.findByRole('heading',{name:'Item Catalog'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Container Shipping'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Gift Shop'})).toBeTruthy();
  });
});

