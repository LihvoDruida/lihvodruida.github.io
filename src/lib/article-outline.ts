// Reading time and a table of contents for CMS articles (Markdown bodies).
import {isValidElement,type ReactNode} from 'react';

export type OutlineItem={id:string;text:string;level:2|3};

/** Plain heading text from inline Markdown: links, emphasis and code markers removed. */
export function inlineText(markdown:string){
 return markdown.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[*_`~]+/g,'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
}

/** URL fragment for a heading; keeps Ukrainian letters so anchors stay readable. */
export function headingSlug(text:string){
 return text.toLocaleLowerCase('uk').normalize('NFC').replace(/[’'ʼ]/g,'').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80)||'section';
}

/** Hands out unique ids in render order: the same text gets -2, -3 … */
export function slugger(){const seen=new Map<string,number>();return (text:string)=>{const base=headingSlug(text),n=(seen.get(base)||0)+1;seen.set(base,n);return n===1?base:`${base}-${n}`;};}

/** ATX headings outside fenced code. "#" renders as h2 on the site, like "##". */
export function articleOutline(body:string):OutlineItem[]{
 const next=slugger(),items:OutlineItem[]=[];let fence:string|null=null;
 for(const line of body.split(/\r?\n/)){
  const f=/^\s{0,3}(```|~~~)/.exec(line);
  if(f){fence=fence===null?f[1]:(fence===f[1]?null:fence);continue;}
  if(fence)continue;
  const h=/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);if(!h)continue;
  const text=inlineText(h[2]);if(!text)continue;
  items.push({id:next(text),text,level:h[1].length===3?3:2});
 }
 return items;
}

/** Minutes at ~200 words per minute, never less than one. */
export function readingMinutes(body:string){
 const prose=body.replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\]\([^)]*\)/g,']');
 const words=prose.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu)?.length||0;
 return Math.max(1,Math.round(words/200));
}

/** Visible text of rendered heading children, for id generation at render time. */
export function nodeText(node:ReactNode):string{
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(nodeText).join('');
 if(isValidElement<{children?:ReactNode}>(node))return nodeText(node.props.children);
 return '';
}
