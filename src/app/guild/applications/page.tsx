import {PageHeading} from '@/components/Shared';
import {ApplicationsView} from '@/components/ApplicationsView';
import {pageMetadata,SEO_PAGES} from '@/lib/seo';
import {Breadcrumbs} from '@/components/Breadcrumbs';
export const metadata=pageMetadata('/guild/applications','Статуси заявок до гільдії','Перевірка статусу заявки до Mistblossom Vanguard.','/assets/img/og-image-default.webp',true);
export default function Page(){return <div className="content-shell"><Breadcrumbs items={[{name:'Головна',path:'/'},{name:SEO_PAGES['/guild'].label,path:'/guild'},{name:'Статуси заявок',path:'/guild/applications'}]}/><PageHeading eyebrow="MISTBLOSSOM VANGUARD / ВСТУП" title="Твоя заявка, без невідомості" description="Перевіряй рішення офіцерів за ім’ям персонажа або номером відстеження. Статуси оновлюються автоматично."/><ApplicationsView/></div>;}
