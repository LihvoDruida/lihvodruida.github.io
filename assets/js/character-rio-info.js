const region = "eu";
const realm = "terokkar";
const characterName = "Sebas";

// Отримання елементів
const avatarElement = document.getElementById("character-avatar");
const nameElement = document.getElementById("character-name");
const guildElement = document.getElementById("guild-name");
const gearElement = document.getElementById("character-gear");
const realmElement = document.getElementById("realm-name");
const classElement = document.getElementById("class-name");
const raceElement = document.getElementById("race-name");
const scoresElement = document.getElementById("character-mythic-scores");
const loaderRioElement = document.getElementById("loader-rio");
const rioElement = document.getElementById("character-info-container");

if (loaderRioElement) showElement(loaderRioElement);
if (rioElement) hideElement(rioElement);

// Отримання даних Raider.IO
fetch(
  `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${characterName}&fields=guild,mythic_plus_scores_by_season:current,gear`
)
  .then((response) => response.json())
  .then((data) => {
    // Витягування даних
    const name = data.name;
    const avatarUrl = data.thumbnail_url;
    const gear = data.gear.item_level_equipped;
    const className = getClassName(data.class);
    const specName = getSpecName(data.active_spec_name);
    const raceName = getRaceName(data.race);
    const realmName = `(${getRegionName(data.region)}) ${data.realm}`;
    const guildName = data.guild ? `<${data.guild.name}>` : "Без гільдії";
    const mythicScores =
      data.mythic_plus_scores_by_season[0]?.scores?.all || "Немає даних";
    const mythicColor =
      data.mythic_plus_scores_by_season[0]?.segments?.all?.color || "#000000";

    // Оновлення HTML
    avatarElement.src = avatarUrl;
    nameElement.textContent = name;
    gearElement.textContent = gear;
    classElement.textContent = `${className} (${specName})`;
    raceElement.textContent = raceName;
    realmElement.textContent = realmName;
    guildElement.textContent = guildName;
    scoresElement.textContent = mythicScores;
    scoresElement.style.color = mythicColor;

    // Відображення основного контейнера
    // Ховаємо завантажувач та показуємо основний контейнер
    hideElement(loaderRioElement);
    showElement(rioElement);
  })
  .catch((error) => {
    console.error("Помилка завантаження даних:", error);
    if (loaderRioElement) hideElement(loaderRioElement);
  });

// Функції перекладу
function getRaceName(race) {
  switch (race) {
    case "Night Elf":
      return "Нічний Ельф";
    default:
      return race;
  }
}

function getClassName(className) {
  switch (className) {
    case "Druid":
      return "Друїд";
    default:
      return className;
  }
}

function getSpecName(specName) {
  switch (specName) {
    case "Restoration":
      return "Відновлення";
    default:
      return specName;
  }
}

function getRegionName(region) {
  switch (region) {
    case "us":
      return "США";
    case "eu":
      return "ЄС";
    case "tw":
      return "Тайвань";
    case "kr":
      return "Корея";
    case "cn":
      return "Китай";
    default:
      return region;
  }
}

function showElement(element) {
  if (element) {
    element.classList.remove("hidden");
    element.classList.add("visible");
  }
}

function hideElement(element) {
  if (element) {
    element.classList.remove("visible");
    element.classList.add("hidden");
  }
}

