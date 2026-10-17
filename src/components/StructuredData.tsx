import {serializeSchema} from '@/lib/seo';
export function StructuredData({value}:{value:unknown}){return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeSchema(value)}}/>;}
