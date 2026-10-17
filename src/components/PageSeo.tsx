import {breadcrumbItems,pageSchema,type SeoPath} from '@/lib/seo';
import {StructuredData} from './StructuredData';
import {Breadcrumbs} from './Breadcrumbs';
export function PageSeo({path,kind}:{path:SeoPath;kind?:string}){return <><StructuredData value={pageSchema(path,kind)}/><Breadcrumbs items={breadcrumbItems(path)}/></>;}
