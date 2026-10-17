import {staticMetadata} from '@/lib/seo';
import {PageSeo} from '@/components/PageSeo';
import {articles} from '@/lib/content';
import {PageHeading} from '@/components/Shared';
import {ArticleLibrary} from '@/components/ArticleLibrary';
export const dynamic='force-dynamic';
export const metadata=staticMetadata('/news');
export default async function Page(){return <div className="content-shell"><PageSeo path="/news" kind="CollectionPage"/><PageHeading eyebrow="ЛІГВО ДРУЇДА / БІБЛІОТЕКА" title='Новини спільноти' description='Оновлення, події та нові історії Лігва Друїда.'/><ArticleLibrary items={(await articles('news')).map(({body,...a})=>a)}/></div>;}
