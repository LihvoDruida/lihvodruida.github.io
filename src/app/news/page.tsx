import {articles} from '@/lib/content';
import {PageHeading} from '@/components/Shared';
import {ArticleLibrary} from '@/components/ArticleLibrary';
export const metadata={title:'Новини спільноти',alternates:{canonical:'/news'}};
export default function Page(){return <div className="content-shell"><PageHeading eyebrow="ЛІГВО ДРУЇДА / БІБЛІОТЕКА" title='Новини спільноти' description='Оновлення, події та нові історії Лігва Друїда.'/><ArticleLibrary items={articles('news').map(({body,...a})=>a)}/></div>;}
