import Link from 'next/link';
export default function NotFound(){return <div className="error-page"><span className="eyebrow">404 / СТЕЖКА ЗАГУБИЛАСЯ</span><h1>У цьому лісі інша дорога</h1><p>Сторінку не знайдено. Повернімося до знайомих стежок.</p><Link className="button primary" href="/">На головну →</Link></div>;}
