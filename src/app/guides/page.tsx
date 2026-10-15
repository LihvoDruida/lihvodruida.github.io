import {articles} from '@/lib/content';
import {PageHeading} from '@/components/Shared';
import {ArticleLibrary} from '@/components/ArticleLibrary';
export const dynamic='force-dynamic';
export const metadata={title:'Гайди українською',alternates:{canonical:'/guides'}};
export default async function Page(){return <div className="content-shell"><PageHeading eyebrow="ЛІГВО ДРУЇДА / БІБЛІОТЕКА" title='Гайди українською' description='Практичні матеріали про рейди, ключі, професії та гру. Зберігай потрібне й повертайся до пригод.'/><ArticleLibrary items={(await articles('guides')).map(({body,...a})=>a)}/></div>;}
