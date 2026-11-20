import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kyivToUtc,raidIcs,icsFileName} from '../src/lib/raid-calendar';

test('Kyiv wall clock converts to UTC in winter (UTC+2), summer (UTC+3) and around the DST switch',()=>{
 assert.equal(new Date(kyivToUtc('2026-11-24','20:00')!).toISOString(),'2026-11-24T18:00:00.000Z');
 assert.equal(new Date(kyivToUtc('2026-07-01','20:30')!).toISOString(),'2026-07-01T17:30:00.000Z');
 // Europe switches to summer time on the last Sunday of March (2026-03-29) at 03:00 Kyiv.
 assert.equal(new Date(kyivToUtc('2026-03-28','21:00')!).toISOString(),'2026-03-28T19:00:00.000Z');
 assert.equal(new Date(kyivToUtc('2026-03-29','21:00')!).toISOString(),'2026-03-29T18:00:00.000Z');
 for(const [date,time] of [['2026-13-01','20:00'],['tomorrow','20:00'],['2026-11-24','evening']])assert.equal(kyivToUtc(date,time),null);
});

test('raid .ics is a valid single event with escaped text, CRLF lines and a 3 hour default slot',()=>{
 const ics=raidIcs({id:'r1',title:'Voidspire Heroic, прогрес; фаза 2',date:'2026-11-24',time:'20:00',difficulty:'Героїчний',raid_leader:'Sebas'},{site:'https://lihvodruida.pp.ua',guild:'Mistblossom Vanguard',stampedAt:'2026-11-20T10:00:00Z'})!;
 assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
 assert.ok(!/[^\r]\n/.test(ics),'every line ends with CRLF');
 assert.match(ics,/\r\nDTSTART:20261124T180000Z\r\n/);assert.match(ics,/\r\nDTEND:20261124T210000Z\r\n/);assert.match(ics,/\r\nDTSTAMP:20261120T100000Z\r\n/);
 assert.match(ics,/\r\nSUMMARY:Voidspire Heroic\\, прогрес\\; фаза 2 · Mistblossom Vanguard\r\n/);
 assert.match(ics,/\r\nDESCRIPTION:Героїчний\\nРейд-лідер: Sebas\\nhttps:\/\/lihvodruida.pp.ua\/guild\r\n/);
 assert.match(ics,/\r\nUID:r1@lihvodruida.pp.ua\r\n/);
 assert.equal(raidIcs({id:'x',title:'Bad',date:'soon',time:'20:00'},{site:'https://x',guild:'G',stampedAt:'now'}),null);
 assert.equal(icsFileName({id:'r1',title:'Mythic прогрес!',date:'2026-11-26',time:'20:30'}),'2026-11-26-mythic-прогрес.ics');
});
