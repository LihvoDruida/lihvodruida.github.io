const region = "eu";
const realm = "terokkar";
const characterName = "Sebas";

const container = document.getElementById("character-info-container");
const nameElement = document.getElementById("character-name");
const guildElement = document.getElementById("guild-name");
const gearElement = document.getElementById("character-gear");
const realmElement = document.getElementById("realm-name");
const classElement = document.getElementById("class-name");
const raceElement = document.getElementById("race-name");
const scoresElement = document.getElementById("character-mythic-scores");
const gearIconElement = document.getElementById("gear-icon");
const scoresPrevElement = document.getElementById(
  "character-mythic-prev-scores"
);
const avatarElement = document.getElementById("character-avatar");

const loaderRioElement = document.getElementById("loader-rio");
const rioElement = document.getElementById("rio");
const loaderAffixesElement = document.getElementById("loader-affixes");
const affixesElement = document.getElementById("affix-container");

if (loaderRioElement && rioElement) {
  loaderRioElement.style.display = "block";
  rioElement.style.display = "none";
}
if (loaderAffixesElement && affixesElement) {
  loaderAffixesElement.style.display = "block";
  affixesElement.style.display = "none";
}

fetch(
  `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${characterName}&fields=guild%2Cmythic_plus_scores_by_season%3Acurrent%2Cprevious_mythic_plus_scores%2Cgear`
)
  .then((response) => response.json())
  .then((data) => {
    const name = data.name;
    const realm = data.realm;
    const gear = data.gear.item_level_equipped;
    const class_name = data.class;
    const spec_name = data.active_spec_name;
    const race = data.race;
    const region = data.region;
    const avatarUrl = data.thumbnail_url;
    const mythicScores =
      data.mythic_plus_scores_by_season[0]?.scores?.all || "Немає даних";
    const mythicColor =
      data.mythic_plus_scores_by_season[0]?.segments?.all?.color || "#000000";

    const mythicSeason = data.mythic_plus_scores_by_season[0].season;
    const previousMythicScores =
      data.previous_mythic_plus_scores?.all || "Немає даних";
    const guildName = data.guild.name;
    const guildRealm = data.guild.realm;

    const raceName = getRaceName(race);
    const regionName = getRegionName(region);
    const className = getClassName(class_name);
    const specName = getSpecName(spec_name);

    nameElement.textContent = name;
    gearElement.textContent = gear;
    if (gear > 400) {
      gearElement.style.color = "#a335ee";
      gearIconElement.style.fill = "#a335ee";
    } else {
      gearElement.style.color = "#0070dd";
      gearIconElement.style.fill = "#0070dd";
    }
    classElement.textContent = `${className} (${specName})`;
    raceElement.textContent = raceName;
    realmElement.textContent = `(${regionName}) ${realm}`;
    scoresElement.textContent = mythicScores;
    scoresElement.style.color = mythicColor;
    scoresPrevElement.textContent = previousMythicScores;
    avatarElement.src = avatarUrl;
    guildElement.textContent = `<${guildName}>`;

    if (loaderRioElement && rioElement) {
      loaderRioElement.style.display = "none";
      rioElement.style.display = "grid";
    }
  })
  .catch((error) => {
    console.error(error);
    if (loaderRioElement) {
      loaderRioElement.style.display = "none";
    }
  });

fetch("https://raider.io/api/v1/mythic-plus/affixes?region=eu&locale=en")
  .then((response) => response.json())
  .then((data) => {
    const affixes = data.affix_details;
    const affixContainer = document.getElementById("affix-container");

    affixes.forEach((affix) => {
      const affixLinkElement = document.createElement("a");
      affixLinkElement.href = affix.wowhead_url;

      const affixImageElement = document.createElement("img");
      affixImageElement.src = `https://wow.zamimg.com/images/wow/icons/large/${affix.icon}.jpg`;
      affixImageElement.alt = affix.name;
      affixLinkElement.appendChild(affixImageElement);

      affixContainer.appendChild(affixLinkElement);

      if (loaderAffixesElement && affixesElement) {
        loaderAffixesElement.style.display = "none";
        affixesElement.style.display = "flex";
      }
    });
  })
  .catch((error) => {
    console.error(error);
    if (loaderAffixesElement) {
      loaderAffixesElement.style.display = "none";
    }
  });

function getRaceName(race) {
  switch (race) {
    case "Night Elf":
      return "Нічний Ельф";
    default:
      return race;
  }
}
function getClassName(class_name) {
  switch (class_name) {
    case "Druid":
      return "Друїд";
    default:
      return class_name;
  }
}
function getSpecName(spec_name) {
  switch (spec_name) {
    case "Restoration":
      return "Відновлення";
    default:
      return spec_name;
  }
}

function getRegionName(region) {
  switch (region) {
    case "us":
      return "US";
    case "eu":
      return "EU";
    case "tw":
      return "TW";
    case "kr":
      return "KR";
    case "cn":
      return "CN";
    default:
      return region;
  }
}
