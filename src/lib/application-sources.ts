export type ApplicationSource={value:string;platform?:string;platforms?:readonly string[];detail?:string;placeholder?:string;requireDetail?:boolean};
const creatorPlatforms=['TikTok','YouTube','Twitch','Discord','Telegram','Instagram','Facebook','Сайт / блог','Інша платформа'];
export const applicationSourceGroups:{label:string;items:ApplicationSource[]}[]=[
 {label:'Стрімери та автори',items:[
  {value:'Лігво Друїда',platforms:creatorPlatforms},
  {value:'MrFortune',platforms:creatorPlatforms},
  {value:'Інший стрімер / автор',platforms:creatorPlatforms,detail:'Ім’я автора та де побачив нас',placeholder:'Нік автора, відео або трансляція',requireDetail:true},
 ]},
 {label:'Рекомендації та гра',items:[
  {value:'Друзі / знайомі',platform:'Рекомендація',detail:'Хто порадив нас?',placeholder:'Ім’я або нік друга'},
  {value:'Учасник гільдії',platform:'Рекомендація',detail:'Хто запросив до гільдії?',placeholder:'Ім’я персонажа або нік'},
  {value:'Пошук гільдій у WoW',platform:'World of Warcraft'},
  {value:'Група / рейд / Mythic+',platform:'World of Warcraft',detail:'Де познайомилися?',placeholder:'Група, рейд, ключ або ім’я персонажа'},
 ]},
 {label:'Спільноти та пошук',items:[
  {value:'Discord',platform:'Спільнота / сервер',detail:'У якій спільноті побачив нас?',placeholder:'Назва Discord-сервера'},
  {value:'Соціальні мережі',platforms:['TikTok','YouTube','Twitch','Telegram','Instagram','Facebook','Reddit','X / Twitter','Інша платформа']},
  {value:'Пошук в інтернеті',platforms:['Google','Bing','Інший пошук']},
  {value:'Сайти та форуми WoW',platforms:['Raider.IO','WoWProgress','Warcraft Logs','Wowhead','Форум Blizzard','Інший сайт / форум']},
  {value:'Інше',detail:'Розкажи, звідки саме',placeholder:'Де ти дізнався про нашу гільдію?',requireDetail:true},
 ]},
];
