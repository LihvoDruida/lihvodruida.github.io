'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="error-page"><h1>Не вдалося відкрити сторінку</h1><p>Спробуй ще раз за мить.</p><button className="button primary" onClick={reset}>Спробувати знову</button></div>;}
