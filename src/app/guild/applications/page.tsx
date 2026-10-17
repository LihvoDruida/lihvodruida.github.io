import {PageHeading} from '@/components/Shared';
import {ApplicationsView} from '@/components/ApplicationsView';
import {pageMetadata} from '@/lib/seo';
export const metadata=pageMetadata('/guild/applications','Статуси заявок до гільдії','Перевірка статусу заявки до Mistblossom Vanguard.','/assets/img/og-image-default.webp',true);
export default function Page(){return <div className="content-shell"><PageHeading eyebrow="MISTBLOSSOM VANGUARD / ВСТУП" title="Твоя заявка, без невідомості" description="Перевіряй рішення офіцерів за ім’ям персонажа або номером відстеження. Статуси оновлюються автоматично."/><ApplicationsView/></div>;}
