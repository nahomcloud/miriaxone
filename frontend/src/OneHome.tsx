import { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { pageImage } from './pageImages';

export default function OneHome(){
  return <>
    <section className="one-screen one-hero" style={{'--one-hero-image':`url(${pageImage('homeHero')})`} as CSSProperties}>
      <div className="container one-center">
        <span className="eyebrow">MIRIAX ONE</span>
        <h1>Move what matters.</h1>
        <p>Choose the right service for a barrel, a gift, or a custom cargo quote.</p>
        <div className="one-actions"><Link className="ghost-cta primary" to="/ship">Choose a service <ArrowRight size={16}/></Link><Link className="ghost-cta quiet" to="/track">Track shipment</Link></div>
      </div>
    </section>

    <section className="one-screen one-barrel" id="ship-barrel">
      <div className="container one-service-grid one-simple-service">
        <div>
          <span className="eyebrow">Ship a Barrel</span>
          <h2>Pack a barrel with clarity.</h2>
          <p>Add catalog items or your own goods, see space and weight update, then review the shipment before checkout.</p>
          <Link className="button light-action" to="/ship?service=ship-barrel">Build barrel <ArrowRight size={16}/></Link>
        </div>
      </div>
    </section>

    <section className="one-screen one-gifts" id="express-gifts" style={{'--one-gifts-image':`url(${pageImage('giftsHero')})`} as CSSProperties}>
      <div className="container one-gifts-content one-simple-service">
        <span className="eyebrow">Express Gifts</span>
        <h2>Send a gift that feels personal.</h2>
        <p>Choose a gift, add the recipient, and include an occasion or surprise note.</p>
        <Link className="button light-action" to="/ship?service=express-gifts">Send gift <ArrowRight size={16}/></Link>
      </div>
    </section>

    <section className="one-screen one-custom" id="custom-cargo">
      <img src={pageImage('customCargo')} alt="Freight moving through a cargo hub"/>
      <div className="one-simple-service">
        <span className="eyebrow">Custom Cargo</span>
        <h2>Quote freight without guesswork.</h2>
        <p>Tell us the cargo size, route, timing, and contact details. We review the estimate before payment.</p>
        <Link className="button" to="/ship?service=custom-cargo">Request quote <ArrowRight size={16}/></Link>
      </div>
    </section>

    <section className="one-footer-line"><div className="container"><b>MIRIAX ONE</b><span>(c) {new Date().getFullYear()}</span><Link to="/contact">Contact</Link><Link to="/login">Admin</Link></div></section>
  </>;
}
