export type CatalogVariant={id:string;label:string;description:string;price:number;weightLb?:number;volumeIn3?:number};
export type CatalogItem={id:string;service:'ship-barrel'|'express-gifts';name:string;category:string;price:number;weightLb?:number;volumeIn3?:number;deliverySpeed?:string;ownItem?:boolean;status:'live'|'hidden';countries:string[];image?:string;variants:CatalogVariant[]};
const key='miriaxone_item_catalog_v1';
const sample:CatalogItem[]=[
 {id:'barrel-rice',service:'ship-barrel',name:'Rice Bag',category:'Food',price:18,weightLb:10,volumeIn3:420,deliverySpeed:'',ownItem:false,status:'live',countries:[],variants:[{id:'rice-5lb',label:'5 lb bag',description:'Good for a small pantry refill.',price:10,weightLb:5,volumeIn3:240},{id:'rice-10lb',label:'10 lb bag',description:'Family-size bag for barrel packing.',price:18,weightLb:10,volumeIn3:420}]},
 {id:'barrel-own-clothes',service:'ship-barrel',name:'Customer-owned clothing',category:'Own item',price:0,weightLb:8,volumeIn3:900,ownItem:true,status:'live',countries:[],variants:[]},
 {id:'gift-care-box',service:'express-gifts',name:'Care Box',category:'Essentials',price:45,deliverySpeed:'Same Day',status:'live',countries:[],variants:[{id:'care-small',label:'Small',description:'A compact gift bundle for one person.',price:45},{id:'care-large',label:'Large',description:'A fuller family gift box.',price:72}]},
];
export function loadCatalog():CatalogItem[]{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):sample}catch{return sample}}
export function saveCatalog(items:CatalogItem[]){localStorage.setItem(key,JSON.stringify(items))}
export function money(value:number){return value.toLocaleString('en-US',{style:'currency',currency:'USD'})}
