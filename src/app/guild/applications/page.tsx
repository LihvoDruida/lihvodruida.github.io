import {PageHeading} from '@/components/Shared';
import {ApplicationsView} from '@/components/ApplicationsView';
export const metadata={title:'Статуси заявок',robots:{index:false,follow:false}};
export default function Page(){return <div className="content-shell"><PageHeading eyebrow="MISTBLOSSOM VANGUARD / ВСТУП" title="Твоя заявка, без невідомості" description="Перевіряй рішення офіцерів за ім’ям персонажа або номером відстеження. Статуси оновлюються автоматично."/><ApplicationsView/></div>;}
