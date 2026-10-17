import Link from 'next/link';
import type {Crumb} from '@/lib/seo';
export function Breadcrumbs({items}:{items:Crumb[]}){if(!items.length)return null;return <nav className="breadcrumbs" aria-label="Навігаційний шлях"><ol>{items.map((item,index)=><li key={item.path}>{index===items.length-1?<span aria-current="page">{item.name}</span>:<Link href={item.path}>{item.name}</Link>}</li>)}</ol></nav>;}
