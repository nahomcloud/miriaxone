export type PageImage={key:string;label:string;description:string;defaultUrl:string};
export const pageImageKey='miriax_page_images';
export const pageImages:PageImage[]=[
  {key:'homeHero',label:'Home hero',description:'Full-screen landing page background.',defaultUrl:'/assets/hero.jpg'},
  {key:'barrelHero',label:'Ship a Barrel panel',description:'Barrel service and service card image.',defaultUrl:'/assets/services-2.jpg'},
  {key:'giftsHero',label:'Express Gifts panel',description:'Gift service background and service card image.',defaultUrl:'/assets/services-4.jpg'},
  {key:'customCargo',label:'Custom Cargo panel',description:'Custom cargo split-panel photo and service image.',defaultUrl:'/assets/services-6.jpg'},
  {key:'about',label:'About page',description:'About page feature photo.',defaultUrl:'/assets/about.jpg'},
  {key:'chooseUs',label:'Why choose us',description:'Homepage confidence section photo.',defaultUrl:'/assets/choose-us.jpg'},
];
export function loadPageImages():Record<string,string>{try{return JSON.parse(localStorage.getItem(pageImageKey)||'{}')}catch{return {}}}
export function savePageImages(value:Record<string,string>){localStorage.setItem(pageImageKey,JSON.stringify(value))}
export function pageImage(key:string){return loadPageImages()[key]||pageImages.find(item=>item.key===key)?.defaultUrl||''}
