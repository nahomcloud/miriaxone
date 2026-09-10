export type CatalogVariant={id:string;label:string;description:string;price:number;weightLb?:number;volumeIn3?:number};
export type CatalogItem={id:string;service:'ship-barrel'|'express-gifts';name:string;category:string;price:number;weightLb?:number;volumeIn3?:number;deliverySpeed?:'Same Day'|'Next Day'|'2-3 Days'|'Express'|'Standard'|'Scheduled'|string;ownItem?:boolean;status:'live'|'hidden';countries:string[];image?:string;variants:CatalogVariant[]};
export type GiftCartItem={productId:string;name:string;qty:number;price:number;sizeLabel?:string;delivery?:string;image?:string};
export type GiftAddress={id:string;label:string;recipient:string;city:string;address:string;phone:string};
export type GiftOrder={id:string;createdAt:string;items:GiftCartItem[];address:GiftAddress;instructions:string;subtotal:number;paymentMethod:string;status:string};
const catalogKey='miriax_catalog';
const legacyCatalogKey='miriaxone_item_catalog_v1';
export const giftCartKey='miriax_cart';
export const giftOrdersKey='miriax_orders';
export const giftAddressesKey='miriax_addresses';
const sample:CatalogItem[]=[

 {id:'teff',service:'ship-barrel',name:'Teff Flour (5 lb bag)',category:'Food & Pantry',price:12,weightLb:5,volumeIn3:200,status:'live',countries:[],variants:[]},
 {id:'coffee-barrel',service:'ship-barrel',name:'Ethiopian Coffee (2 lb)',category:'Food & Pantry',price:18,weightLb:2.2,volumeIn3:100,status:'live',countries:[],variants:[]},
 {id:'berbere',service:'ship-barrel',name:'Berbere Spice Kit',category:'Food & Pantry',price:15,weightLb:2,volumeIn3:100,status:'live',countries:[],variants:[]},
 {id:'injera',service:'ship-barrel',name:'Injera Mix (5 lb)',category:'Food & Pantry',price:10,weightLb:5,volumeIn3:160,status:'live',countries:[],variants:[]},
 {id:'mitmita',service:'ship-barrel',name:'Mitmita Pepper (1 lb)',category:'Food & Pantry',price:8,weightLb:1,volumeIn3:36,status:'live',countries:[],variants:[]},
 {id:'honey',service:'ship-barrel',name:'Organic Honey (1 L jar)',category:'Food & Pantry',price:22,weightLb:3,volumeIn3:75,status:'live',countries:[],variants:[]},
 {id:'niter',service:'ship-barrel',name:'Niter Kibbeh (500 g)',category:'Food & Pantry',price:14,weightLb:1.1,volumeIn3:50,status:'live',countries:[],variants:[]},
 {id:'shea',service:'ship-barrel',name:'Shea Butter (500 g)',category:'Personal Care',price:12,weightLb:1.1,volumeIn3:80,status:'live',countries:[],variants:[]},
 {id:'soap',service:'ship-barrel',name:'African Black Soap (1 lb)',category:'Personal Care',price:8,weightLb:.5,volumeIn3:24,status:'live',countries:[],variants:[]},
 {id:'braid',service:'ship-barrel',name:'Hair Braiding Cream',category:'Personal Care',price:10,weightLb:1,volumeIn3:60,status:'live',countries:[],variants:[]},
 {id:'oils',service:'ship-barrel',name:'Essential Oil Gift Set',category:'Personal Care',price:28,weightLb:1,volumeIn3:120,status:'live',countries:[],variants:[]},
 {id:'butter',service:'ship-barrel',name:'Body Butter Kit',category:'Personal Care',price:20,weightLb:2,volumeIn3:150,status:'live',countries:[],variants:[]},
 {id:'tshirts',service:'ship-barrel',name:'T-Shirts (pack of 3)',category:'Clothing',price:0,weightLb:1.5,volumeIn3:240,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'jeans',service:'ship-barrel',name:'Jeans (1 pair)',category:'Clothing',price:0,weightLb:2,volumeIn3:420,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'kidswear',service:'ship-barrel',name:"Children's Clothes (set)",category:'Clothing',price:0,weightLb:2,volumeIn3:360,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'dress',service:'ship-barrel',name:'Traditional Dress',category:'Clothing',price:0,weightLb:2.5,volumeIn3:576,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'formal',service:'ship-barrel',name:'Formal Suit',category:'Clothing',price:0,weightLb:3,volumeIn3:1120,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'textile',service:'ship-barrel',name:'Traditional Woven Textile',category:'Household',price:0,weightLb:1.5,volumeIn3:336,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'pottery',service:'ship-barrel',name:'Pottery / Ceramics',category:'Household',price:0,weightLb:4,volumeIn3:800,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'books',service:'ship-barrel',name:'Books (5 paperbacks)',category:'Household',price:0,weightLb:7,volumeIn3:480,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'phone',service:'ship-barrel',name:'Smartphone',category:'Electronics',price:0,weightLb:.5,volumeIn3:64,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'laptop',service:'ship-barrel',name:'Laptop',category:'Electronics',price:0,weightLb:5,volumeIn3:576,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'tablet',service:'ship-barrel',name:'Tablet',category:'Electronics',price:0,weightLb:1.5,volumeIn3:192,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'chargers',service:'ship-barrel',name:'Chargers & Adapters (x3)',category:'Electronics',price:0,weightLb:1,volumeIn3:144,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'open-top-drum',service:'ship-barrel',name:'Open Top Drum',category:'Barrels & Drums',price:30,weightLb:14,volumeIn3:3465,status:'live',countries:[],variants:[{id:'drum-15',label:'15 Gallon',description:'Stores up to 222 lbs of solids. Quick-lock lid included.',price:30,weightLb:14,volumeIn3:3465},{id:'drum-30',label:'30 Gallon',description:'Stores up to 395 lbs of solids. Quick-lock lid included.',price:50,weightLb:25,volumeIn3:6930},{id:'drum-55',label:'55 Gallon',description:'Stores up to 550 lbs of solids. Quick-lock lid included.',price:80,weightLb:40,volumeIn3:12705}]},
 {id:'barrel-rice',service:'ship-barrel',name:'Rice Bag',category:'Food',price:18,weightLb:10,volumeIn3:420,deliverySpeed:'',ownItem:false,status:'live',countries:[],variants:[{id:'rice-5lb',label:'5 lb bag',description:'Good for a small pantry refill.',price:10,weightLb:5,volumeIn3:240},{id:'rice-10lb',label:'10 lb bag',description:'Family-size bag for barrel packing.',price:18,weightLb:10,volumeIn3:420}]},
 {id:'barrel-own-clothes',service:'ship-barrel',name:'Customer-owned clothing',category:'Own item',price:0,weightLb:8,volumeIn3:900,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'roses12',service:'express-gifts',name:'Red Roses (12 stems)',category:'Flowers',price:45,deliverySpeed:'Same Day',status:'live',countries:[],variants:[{id:'roses12-classic',label:'Classic',description:'12 premium stems wrapped for same-day delivery.',price:45},{id:'roses12-deluxe',label:'Deluxe',description:'18 stems with greenery and ribbon.',price:68}]},
 {id:'bouquet',service:'express-gifts',name:'Mixed Seasonal Bouquet',category:'Flowers',price:65,deliverySpeed:'Same Day',status:'live',countries:[],variants:[{id:'bouquet-small',label:'Small',description:'A bright hand-tied bouquet.',price:65},{id:'bouquet-large',label:'Large',description:'Fuller arrangement for celebrations.',price:95}]},
 {id:'sunflwr',service:'express-gifts',name:'Sunflower Bunch (10)',category:'Flowers',price:40,deliverySpeed:'Same Day',status:'live',countries:[],variants:[]},
 {id:'coffee',service:'express-gifts',name:'Ethiopian Coffee Gift Box',category:'Food',price:38,deliverySpeed:'Next Day',status:'live',countries:[],variants:[{id:'coffee-500',label:'500g',description:'Single-origin roast with gift wrap.',price:38},{id:'coffee-1kg',label:'1kg',description:'Larger family pack with premium wrap.',price:62}]},
 {id:'chocolate',service:'express-gifts',name:'Premium Chocolate Hamper',category:'Food',price:58,deliverySpeed:'2-3 Days',status:'live',countries:[],variants:[]},
 {id:'fragrance',service:'express-gifts',name:'Signature Fragrance',category:'Fragrance',price:78,deliverySpeed:'Next Day',status:'live',countries:[],variants:[{id:'frag-30',label:'30ml',description:'Compact bottle for a simple gesture.',price:78},{id:'frag-100',label:'100ml',description:'Full-size bottle in a gift box.',price:128}]},
 {id:'care-box',service:'express-gifts',name:'Family Care Box',category:'Gifts',price:72,deliverySpeed:'Same Day',status:'live',countries:[],variants:[{id:'care-small',label:'Small',description:'Essentials for one or two people.',price:72},{id:'care-family',label:'Family',description:'A larger curated set for the home.',price:118}]},
 {id:'cake',service:'express-gifts',name:'Celebration Cake',category:'Gifts',price:52,deliverySpeed:'Same Day',status:'live',countries:[],variants:[{id:'cake-8',label:'8 inch',description:'Serves 6-8 people.',price:52},{id:'cake-10',label:'10 inch',description:'Serves 10-14 people.',price:78}]},
];
function normalize(value:any):CatalogItem|null{if(!value||typeof value!=='object')return null;const service=value.service || (value.type==='shop'?'express-gifts':value.type==='container'?'ship-barrel':undefined);if(service!=='ship-barrel'&&service!=='express-gifts')return null;return {id:String(value.id||crypto.randomUUID()),service,name:String(value.name||'Untitled item'),category:String(value.category||'General'),price:Number(value.price||0),weightLb:value.weightLb==null?undefined:Number(value.weightLb),volumeIn3:value.volumeIn3==null?undefined:Number(value.volumeIn3),deliverySpeed:value.deliverySpeed||value.delivery,ownItem:Boolean(value.ownItem),status:value.status?value.status:(value.available===false?'hidden':'live'),countries:Array.isArray(value.countries)?value.countries.map(String):[],image:value.image||value.photo,variants:Array.isArray(value.variants||value.sizes)?(value.variants||value.sizes).map((v:any)=>({id:String(v.id||crypto.randomUUID()),label:String(v.label||'Size'),description:String(v.description||''),price:Number(v.price||0),weightLb:v.weightLb==null?undefined:Number(v.weightLb),volumeIn3:v.volumeIn3==null?undefined:Number(v.volumeIn3)})):[]}}
export function loadCatalog():CatalogItem[]{try{const raw=localStorage.getItem(catalogKey)||localStorage.getItem(legacyCatalogKey);const parsed=raw?JSON.parse(raw):[];const saved=Array.isArray(parsed)?parsed.map(normalize).filter(Boolean) as CatalogItem[]:[];const ids=new Set(saved.map(i=>i.id));const merged=[...saved,...sample.filter(i=>!ids.has(i.id))];if(!localStorage.getItem(catalogKey))saveCatalog(merged);return merged}catch{return sample}}
export function saveCatalog(items:CatalogItem[]){localStorage.setItem(catalogKey,JSON.stringify(items))}
export function loadGiftCart():GiftCartItem[]{try{return JSON.parse(localStorage.getItem(giftCartKey)||'[]')}catch{return []}}
export function saveGiftCart(items:GiftCartItem[]){localStorage.setItem(giftCartKey,JSON.stringify(items))}
export function loadGiftOrders():GiftOrder[]{try{return JSON.parse(localStorage.getItem(giftOrdersKey)||'[]')}catch{return []}}
export function saveGiftOrders(items:GiftOrder[]){localStorage.setItem(giftOrdersKey,JSON.stringify(items))}
export function loadGiftAddresses():GiftAddress[]{try{const saved=JSON.parse(localStorage.getItem(giftAddressesKey)||'[]');return saved.length?saved:defaultAddresses}catch{return defaultAddresses}}
export function saveGiftAddresses(items:GiftAddress[]){localStorage.setItem(giftAddressesKey,JSON.stringify(items))}
const defaultAddresses:GiftAddress[]=[{id:'family-addis',label:'Family Home Addis Ababa',recipient:'Family Home',city:'Addis Ababa',address:'Bole, Addis Ababa',phone:'+251'},{id:'sister-lagos',label:'Sister in Lagos',recipient:'Sister',city:'Lagos',address:'Victoria Island, Lagos',phone:'+234'}];
export function money(value:number){return value.toLocaleString('en-US',{style:'currency',currency:'USD'})}

