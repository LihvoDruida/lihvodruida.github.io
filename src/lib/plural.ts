/** Ukrainian noun form for a count: [one, few, many], e.g. ['версія','версії','версій']. */
export function plural(n:number,[one,few,many]:readonly [string,string,string]){
 const d=Math.abs(n)%10,h=Math.abs(n)%100;
 return d===1&&h!==11?one:d>=2&&d<=4&&(h<12||h>14)?few:many;
}
