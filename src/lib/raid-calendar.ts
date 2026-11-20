// Calendar export for scheduled guild raids. Raid dates and times are published as
// Kyiv wall-clock values ("2026-11-24", "20:00"); the .ics file carries UTC instants
// so every calendar app shows the right local time, including across DST changes.
export const PUBLIC_SITE='https://lihvodruida.pp.ua';
export type CalendarRaid={id:string;title:string;date:string;time:string;difficulty?:string;raid_leader?:string;going?:number;capacity?:number};

const KYIV=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

/** Kyiv wall-clock date+time → UTC epoch ms, or null for malformed input. */
export function kyivToUtc(date:string,time:string):number|null{
 const d=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),t=/^(\d{1,2}):(\d{2})$/.exec(time);
 if(!d||!t)return null;
 const wall=Date.UTC(+d[1],+d[2]-1,+d[3],+t[1],+t[2]);
 // Reject values Date.UTC would silently roll over (month 13, 31 November, 25:00).
 if(+t[1]>23||+t[2]>59||new Date(wall).toISOString().slice(0,10)!==date)return null;
 let guess=wall;
 // Two refinements settle the offset, also right next to a DST switch.
 for(let i=0;i<2;i++){
  const parts=Object.fromEntries(KYIV.formatToParts(guess).map(p=>[p.type,p.value]));
  const shown=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);
  guess+=wall-shown;
 }
 return guess;
}

const stamp=(ms:number)=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
// RFC 5545 §3.3.11 text escaping.
const text=(value:string)=>value.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');

/** A single-event iCalendar document, or null when the raid has no valid start. */
export function raidIcs(raid:CalendarRaid,{site,guild,stampedAt,durationHours=3}:{site:string;guild:string;stampedAt:string;durationHours?:number}):string|null{
 const start=kyivToUtc(raid.date,raid.time);if(start===null)return null;
 const stampMs=Date.parse(stampedAt);
 const details=[raid.difficulty,raid.raid_leader?`Рейд-лідер: ${raid.raid_leader}`:'',`${site}/guild`].filter(Boolean).join('\n');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lihvo Druida//Guild raids//UK','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
  `UID:${text(raid.id)}@lihvodruida.pp.ua`,`DTSTAMP:${stamp(Number.isFinite(stampMs)?stampMs:start)}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(start+durationHours*3600_000)}`,
  `SUMMARY:${text(`${raid.title} · ${guild}`)}`,`DESCRIPTION:${text(details)}`,`URL:${site}/guild`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
}

export const icsHref=(ics:string)=>'data:text/calendar;charset=utf-8,'+encodeURIComponent(ics);
export const icsFileName=(raid:CalendarRaid)=>`${raid.date}-${raid.title.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi,'-').replace(/^-|-$/g,'').slice(0,40)||'raid'}.ics`;
