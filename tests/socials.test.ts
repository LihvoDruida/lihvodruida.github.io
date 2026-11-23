import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {data} from '../src/lib/content';
import {SocialLinks} from '../src/components/SocialLinks';

test('every configured network renders as a labelled icon link, Telegram included',()=>{
 const socials=data<Record<string,string>>('socials');
 assert.equal(socials.telegram,'https://t.me/lihvo_druida');
 const html=renderToStaticMarkup(createElement(SocialLinks,{socials}));
 for(const [name,url] of Object.entries(socials)){
  assert.ok(html.includes(`data-network="${name}"`),`${name} has an icon`);
  assert.ok(html.includes(`href="${url}"`),`${name} links to its profile`);
 }
 assert.equal((html.match(/<svg /g)||[]).length,Object.keys(socials).length);
 assert.ok(!/↗|>(discord|tiktok|twitch|youtube|telegram)</i.test(html),'no text labels, icons only');
 assert.ok((html.match(/aria-label="[^"]+ Лігва Друїда/g)||[]).length===Object.keys(socials).length,'each icon has an accessible name');
});

test('unknown networks and non-https URLs are skipped',()=>{
 const html=renderToStaticMarkup(createElement(SocialLinks,{socials:{myspace:'https://myspace.com/x',discord:'javascript:alert(1)',telegram:'https://t.me/x'}}));
 assert.ok(!html.includes('myspace')&&!html.includes('javascript:'));
 assert.ok(html.includes('data-network="telegram"'));
});
