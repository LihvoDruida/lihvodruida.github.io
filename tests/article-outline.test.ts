import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {articleOutline,readingMinutes,headingSlug,slugger,nodeText} from '../src/lib/article-outline';

test('outline lists h1-h3 outside code fences with readable, unique Ukrainian anchors',()=>{
 const body=['# Вступ','текст','## Підготовка **рейду**','### [Фаза](https://x) 1','```','## не заголовок','```','## Підготовка рейду','#### глибше','## Ґрунт’я та Їжа'].join('\n');
 assert.deepEqual(articleOutline(body),[
  {id:'вступ',text:'Вступ',level:2},{id:'підготовка-рейду',text:'Підготовка рейду',level:2},{id:'фаза-1',text:'Фаза 1',level:3},
  {id:'підготовка-рейду-2',text:'Підготовка рейду',level:2},{id:'ґрунтя-та-їжа',text:'Ґрунт’я та Їжа',level:2}]);
 assert.equal(headingSlug('!!!'),'section');
});

test('render-time ids match the outline for the same headings',()=>{
 const next=slugger();
 assert.equal(next(nodeText([createElement('strong',null,'Підготовка'),' рейду'])),'підготовка-рейду');
 assert.equal(next('Підготовка рейду'),'підготовка-рейду-2');
});

test('reading time counts words, ignores code and link targets, and is at least one minute',()=>{
 assert.equal(readingMinutes('коротко'),1);
 assert.equal(readingMinutes(Array(1000).fill('слово').join(' ')),5);
 assert.equal(readingMinutes('```\n'+Array(1000).fill('code').join(' ')+'\n```\n[посилання](https://example.com/a/b/c)'),1);
});
