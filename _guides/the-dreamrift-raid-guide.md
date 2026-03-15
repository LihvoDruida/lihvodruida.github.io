---
layout: guides
title: "The Dreamrift — короткий гайд по рейду"
slug: the-dreamrift-raid-guide
description: "Короткий і структурований гайд по рейду The Dreamrift у World of Warcraft: Midnight."
date: 2026-03-15
author: Sebas
categories: [WoW, Raid, Guides]
tags: [The Dreamrift, Chimaerus, Midnight, Harandar, Raid]
image: /assets/img-content/the-dreamrift-raid.jpg
---

**The Dreamrift** — однобосовий рейд першого сезону **World of Warcraft: Midnight**.  
Рейд розташований у **Harandar**, глибоко в **Rift of Aln**, а єдиним босом тут є <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus, the Undreamt God</a>.

На відміну від великих рейдів, тут немає довгого маршруту й пачок трешу — ви заходите всередину й майже одразу починаєте бій. Зручно, швидко, боляче.

---

## Коротко про рейд

| Параметр | Значення |
|---|---|
| **Локація** | Harandar, Rift of Aln |
| **Вхід** | `/way 61.0 64.2` |
| **Боси** | 1 — <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus, the Undreamt God</a> |
| **Мінімальний ilvl для LFR** | 220 |
| **Головна нагорода** | chest tier token |
| **Треш** | відсутній |

---

## Вхід у рейд

Вхід до **The Dreamrift** розташований у **південно-східній частині Harandar**, у зоні **Rift of Aln**.

- координати входу: **/way 61.0 64.2**
- шукати потрібно **на нижньому рівні** зони
- якщо здається, що входу не видно — спускайся нижче

> **Порада:** тут немає трешу, тому підготовка до бою починається майже одразу після входу.

---

## Рекомендований склад рейду

Оскільки це **один довгий бій** із сильним акцентом на **аддів**, **interrupt** і **перемикання цілей**, важливо мати:

- стабільний набір **interrupt-ів**
- достатньо **burst AoE**
- гравців, які швидко перемикаються між пріоритетними цілями
- сильні **raid cooldowns** на другу фазу

### Особливо важливо

- **Haunting Essence** кастують небезпечні заклинання, які треба збивати
- частина механік працює через <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a> і поділ на два виміри
- слабкий контроль аддів тут карається дуже швидко

---

## Бос: <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus, the Undreamt God</a>

**<a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus</a>** — єдиний бос рейду, і весь енкаунтер будується навколо однієї ідеї:

> **не дати босу з’їсти Manifestations**

Якщо адди доживають до критичних моментів, бос отримує <a href="https://www.wowhead.com/spell=1245844/cannibalized-essence" data-wowhead="spell=1245844">Cannibalized Essence</a>, лікується й починає бити дедалі сильніше. Якщо таких стеків назбирається багато — бій фактично втрачено.

---

## Головна умова вайпу

### <a href="https://www.wowhead.com/spell=1245844/cannibalized-essence" data-wowhead="spell=1245844">Cannibalized Essence</a>

Кожен **Manifestation**, якого <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus</a> встигає поглинути:

- **лікує боса**
- **збільшує його шкоду на 50%**
- ефект **стакується**

> **Суть бою:** якщо адди живуть занадто довго, бос стає майже невбивним.

---

# Фаза 1 — Insatiable Hunger

Перша фаза — це основний цикл бою, де рейд працює з двома шарами реальності:

- **Reality**
- **Rift / Aln**

Після <a href="https://www.wowhead.com/spell=1262289/alndust-upheaval" data-wowhead="spell=1262289">Alndust Upheaval</a> частина гравців отримує <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a> і потрапляє в Rift-вимір.  
Саме ці гравці можуть бачити й атакувати **Manifestations** до того, як ті повністю вийдуть у звичайну реальність.

## Основна логіка фази

- гравці з <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a> знищують Manifestations у Rift
- якщо цього не зробити вчасно, адди переходять у **Reality**
- далі вони йдуть до боса
- якщо бос їх з’їдає — рейд отримує проблему у вигляді <a href="https://www.wowhead.com/spell=1245844/cannibalized-essence" data-wowhead="spell=1245844">Cannibalized Essence</a>

---

## Основні здібності фази 1

| Ability | Небезпека | Що робити |
|---|---|---|
| <a href="https://www.wowhead.com/spell=1262289/alndust-upheaval" data-wowhead="spell=1262289">Alndust Upheaval</a> | Висока | Формує ротацію гравців із <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a>. Треба заздалегідь визначити, хто заходить у Rift |
| <a href="https://www.wowhead.com/spell=1258610/rift-emergence" data-wowhead="spell=1258610">Rift Emergence</a> | Висока | Саме з цієї механіки починається хвиля проблем — з’являються адди, а рейд отримує додатковий тиск |
| **Titan Fragment Meld** | Дуже висока | Щит на Manifestations у Rift. Його мають ламати гравці з <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a> |
| <a href="https://www.wowhead.com/spell=1252863/insatiable" data-wowhead="spell=1252863">Insatiable</a> | Смертельна | Пасивка, через яку бос автоматично поглинає аддів у межах досяжності |
| <a href="https://www.wowhead.com/spell=1245396/consume" data-wowhead="spell=1245396">Consume</a> | Смертельна | Наприкінці каналу бос з’їдає всіх живих Manifestations поруч |
| **Discordant Roar** | Висока | Колосальний адд завдає зростаючої raid-wide шкоди |
| <a href="https://www.wowhead.com/spell=1249017/fearsome-cry" data-wowhead="spell=1249017">Fearsome Cry</a> | Середня / висока | Обов’язковий **interrupt** |
| <a href="https://www.wowhead.com/spell=1257087/consuming-miasma" data-wowhead="spell=1257087">Consuming Miasma</a> *(Heroic+)* | Висока | Диспелити тільки подалі від рейду |
| <a href="https://www.wowhead.com/spell=1246621/caustic-phlegm" data-wowhead="spell=1246621">Caustic Phlegm</a> | Середня | Постійний raid damage, який треба просто стабільно відхілювати |
| <a href="https://www.wowhead.com/spell=1272726/rending-tear" data-wowhead="spell=1272726">Rending Tear</a> | Середня | Фронталка по танку — боса треба тримати відвернутим від рейду |
| **Rift Madness** *(Mythic)* | Дуже висока | Гравці в Rift можуть шкодити союзникам і втрачати контроль |
| **Dissonance** *(Mythic)* | Висока | Карає за неправильне позиціонування між вимірами |

---

## Що робити DPS

### 1. Контролювати ротацію <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a>
Не можна відправляти всіх у Rift одночасно.  
Потрібна **чітка ротація**, щоб у кожній хвилі були люди, які можуть вбивати Manifestations.

### 2. Вбивати Manifestations до переходу в Reality
Чим довше живе адд, тим вищий шанс, що він:
- перейде в реальність
- дійде до боса
- стане їжею для <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus</a>

### 3. Збивати касти Haunting Essence
Особливо небезпечні:
- <a href="https://www.wowhead.com/spell=1249017/fearsome-cry" data-wowhead="spell=1249017">Fearsome Cry</a>
- <a href="https://www.wowhead.com/spell=1261997/essence-bolt" data-wowhead="spell=1261997">Essence Bolt</a>

### 4. Не стояти в <a href="https://www.wowhead.com/spell=1263026/alndust-essence" data-wowhead="spell=1263026">Alndust Essence</a>
Після смерті аддів лишаються калюжі:
- завдають шкоди
- сповільнюють рух

### 5. Швидко забирати Colossal Horror
Ці адди небезпечні через **Discordant Roar**, який дедалі сильніше тисне на весь рейд.

---

## Що робити хілерам

### 1. Слідкувати за постійним тиском через <a href="https://www.wowhead.com/spell=1250953/rift-sickness" data-wowhead="spell=1250953">Rift Sickness</a>
Кожен повноцінний вихід адда в Reality додає ще більше проблем для рейду.

### 2. Акуратно працювати з <a href="https://www.wowhead.com/spell=1257087/consuming-miasma" data-wowhead="spell=1257087">Consuming Miasma</a>
На Heroic і вище:
- це довгий DoT
- диспел створює вибух
- диспелити треба **поза стеком рейду**

### 3. Готувати cooldowns на Phase 2
Не витрачайте все в першій фазі без потреби — у повітряній фазі буде значно важче.

---

## Що робити танкам

### 1. Одразу забирати Colossal Horror
Якщо адд залишається без танка, він швидко створює хаос по рейду.

### 2. Контролювати позицію боса перед <a href="https://www.wowhead.com/spell=1245396/consume" data-wowhead="spell=1245396">Consume</a>
Позиціонування напряму впливає на те, скільки аддів опиниться в радіусі поглинання.

### 3. Тримати фронталку від рейду
<a href="https://www.wowhead.com/spell=1272726/rending-tear" data-wowhead="spell=1272726">Rending Tear</a> не можна повертати в групу.

### 4. На Heroic+ стежити за <a href="https://www.wowhead.com/spell=1253744/rift-vulnerability" data-wowhead="spell=1253744">Rift Vulnerability</a>
Занадто довге перебування в Rift робить наступні механіки небезпечнішими.

---

## Коротка стратегія фази 1

1. Розподілити гравців на **ротацію <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a>**
2. Ламати **Titan Fragment Meld**
3. Вбивати Manifestations до їхнього повного виходу в Reality
4. Збивати <a href="https://www.wowhead.com/spell=1249017/fearsome-cry" data-wowhead="spell=1249017">Fearsome Cry</a> і <a href="https://www.wowhead.com/spell=1261997/essence-bolt" data-wowhead="spell=1261997">Essence Bolt</a>
5. Швидко забирати **Colossal Horror**
6. Не допустити сильного накопичення живих аддів перед <a href="https://www.wowhead.com/spell=1245396/consume" data-wowhead="spell=1245396">Consume</a>

---

# Фаза 2 — To The Skies

Коли <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus</a> набирає **100 енергії**, він злітає в повітря.

У цій фазі:
- бос починає постійно тиснути по рейду зверху
- адди продовжують з’являтися
- наприкінці фази бос різко повертається вниз і **миттєво поглинає всіх живих Manifestations**

Це найнебезпечніший момент бою.

---

## Основні здібності фази 2

| Ability | Небезпека | Що робити |
|---|---|---|
| <a href="https://www.wowhead.com/spell=1245486/corrupted-devastation" data-wowhead="spell=1245486">Corrupted Devastation</a> | Дуже висока | Головне вікно для **healing / defensive cooldowns** |
| <a href="https://www.wowhead.com/spell=1245406/ravenous-dive" data-wowhead="spell=1245406">Ravenous Dive</a> | Смертельна | До цього моменту треба максимально зачищати арену від живих аддів |
| <a href="https://www.wowhead.com/spell=1262289/alndust-upheaval" data-wowhead="spell=1262289">Alndust Upheaval</a> *(Mythic, перед злетом)* | Висока | Дає ще більше хаосу перед повітряною фазою |

---

## Ключова ідея другої фази

> **Усі живі адди до <a href="https://www.wowhead.com/spell=1245406/ravenous-dive" data-wowhead="spell=1245406">Ravenous Dive</a> = безкоштовні стаки <a href="https://www.wowhead.com/spell=1245844/cannibalized-essence" data-wowhead="spell=1245844">Cannibalized Essence</a> для боса**

Тобто друга фаза — це не просто “пережити AoE”.  
Це одночасно:

- витримати масивний raid damage
- не втратити контроль над Manifestations
- увійти в приземлення боса з максимально чистою ареною

---

## Коротка стратегія фази 2

- зберігати головні **raid cooldowns** саме сюди
- не припиняти контроль аддів лише тому, що бос у повітрі
- не заходити в приземлення з живими Manifestations
- до <a href="https://www.wowhead.com/spell=1245406/ravenous-dive" data-wowhead="spell=1245406">Ravenous Dive</a> арена має бути максимально зачищена

---

## Загальні поради по рейду

- це **однобосовий рейд**, але він не є “легким”
- головна перевірка тут — **координація**
- найчастіша причина вайпу:
  - слабка ротація <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a>
  - пропущені **interrupt-и**
  - занадто багато живих аддів перед <a href="https://www.wowhead.com/spell=1245396/consume" data-wowhead="spell=1245396">Consume</a> / <a href="https://www.wowhead.com/spell=1245406/ravenous-dive" data-wowhead="spell=1245406">Ravenous Dive</a>
- рейд має чітко розуміти:
  - хто йде в Rift
  - хто збиває касти
  - хто забирає великих аддів
  - які cooldowns лишаються на другу фазу

---

## Чому рейд важливий

The Dreamrift — це швидкий, але цінний рейд сезону:

- лише **1 бос**
- немає трешу
- швидкий weekly clear після освоєння
- саме тут падає **chest tier token**

---

## Підсумок

**The Dreamrift** — короткий за структурою, але дуже вимогливий рейд.  
Бій із <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus</a> карає не за низький DPS сам по собі, а за:

- слабкий контроль аддів
- погану ротацію <a href="https://www.wowhead.com/spell=1245698/alnsight" data-wowhead="spell=1245698">Alnsight</a>
- неправильні dispel / interrupt рішення
- відсутність cooldown-плану на другу фазу

Якщо рейд дисципліновано працює з Manifestations і не годує ними боса — енкаунтер стає керованим.  
Якщо ні — <a href="https://www.wowhead.com/npc=256116/chimaerus" data-wowhead="npc=256116">Chimaerus</a> дуже швидко пояснює, хто тут насправді apex predator.
