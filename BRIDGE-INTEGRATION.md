# Mistblossom Node bridge

Актуальний контракт, env, кешування, логування, CORS, запуск і сценарії приймання описані в [README.md](README.md#система-обміну).

Джерело істини — чинний дашборд:

- `GET https://guild.lihvodruida.pp.ua/api/site/guild`
- `GET/POST https://guild.lihvodruida.pp.ua/api/site/applications`

Публічний сайт тепер використовує Next.js/Node.js, а не Jekyll. Нової бази даних чи окремих статусів тут немає. Приватні контакти заявників не передаються до публічного списку. Професії лишаються статичним довідником, поки дашборд не експортує їх у публічному API.
