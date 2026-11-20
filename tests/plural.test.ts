import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plural} from '../src/lib/plural';
test('Ukrainian plural forms for 1, 2–4, 5–20 and teens',()=>{
 const f=(n:number)=>`${n} ${plural(n,['персонаж','персонажі','персонажів'])}`;
 assert.deepEqual([0,1,2,4,5,11,12,14,21,22,24,25,101,111].map(f),['0 персонажів','1 персонаж','2 персонажі','4 персонажі','5 персонажів','11 персонажів','12 персонажів','14 персонажів','21 персонаж','22 персонажі','24 персонажі','25 персонажів','101 персонаж','111 персонажів']);
});
