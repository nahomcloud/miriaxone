import { ChangeEvent, useState } from 'react';
import { ImagePlus, RotateCcw, Save, X } from 'lucide-react';
import { loadPageImages, pageImages, savePageImages } from './pageImages';

export default function PageImagesAdmin(){
  const [images,setImages]=useState<Record<string,string>>(loadPageImages);const [notice,setNotice]=useState('');
  function update(key:string,value:string){setImages(current=>({...current,[key]:value}))}
  function upload(key:string,file?:File){if(!file)return;const reader=new FileReader();reader.onload=()=>update(key,String(reader.result));reader.readAsDataURL(file)}
  function save(){savePageImages(images);setNotice('Page images saved in this browser. Refresh the site to see the changes.')}
  function reset(key:string){const next={...images};delete next[key];setImages(next)}
  return <div className="admin-main page-images-admin"><div className="admin-top"><div><span className="eyebrow">Design control</span><h1>Page Images</h1><p>Change the photos used on the homepage, service panels, About page, and feature sections.</p></div><button className="button" onClick={save}><Save size={16}/> Save images</button></div>{notice&&<p className="admin-notice">{notice}</p>}<div className="page-image-grid">{pageImages.map(item=>{const src=images[item.key]||item.defaultUrl;return <article className="page-image-card panel" key={item.key}><div className="page-image-preview">{src?<img src={src} alt=""/>:<ImagePlus/>}<label><ImagePlus size={16}/> Upload<input type="file" accept="image/*" onChange={(e:ChangeEvent<HTMLInputElement>)=>upload(item.key,e.target.files?.[0])}/></label>{images[item.key]&&<button className="photo-remove" onClick={()=>reset(item.key)}><X size={14}/></button>}</div><div><h3>{item.label}</h3><p>{item.description}</p><label>Image URL<input value={images[item.key]||''} placeholder={item.defaultUrl} onChange={e=>update(item.key,e.target.value)}/></label><div className="actions"><button type="button" className="table-action" onClick={()=>reset(item.key)}><RotateCcw size={14}/> Use default</button></div></div></article>})}</div></div>
}
