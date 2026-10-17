import {staticMetadata} from '@/lib/seo';
import {PageSeo} from '@/components/PageSeo';
import {articles} from '@/lib/content';
import {PageHeading} from '@/components/Shared';
import {ArticleLibrary} from '@/components/ArticleLibrary';
export const dynamic='force-dynamic';
export const metadata=staticMetadata('/guides');
export default async function Page(){return <div className="content-shell"><PageSeo path="/guides" kind="CollectionPage"/><PageHeading eyebrow="ЛІГВО ДРУЇДА / БІБЛІОТЕКА" title='Гайди українською' description='Практичні матеріали про рейди, ключі, професії та гру. Зберігай потрібне й повертайся до пригод.'/><ArticleLibrary items={(await articles('guides')).map(({body,...a})=>a)}/></div>;}
