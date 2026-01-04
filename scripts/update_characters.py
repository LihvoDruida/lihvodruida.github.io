import requests
import yaml

# Дані персонажів
characters = [
    {"region": "eu", "realm": "terokkar", "name": "sebas"},
    {"region": "eu", "realm": "terokkar", "name": "krouli"},
    {"region": "eu", "realm": "terokkar", "name": "kashin"}
]

output = []

for char in characters:
    url = f"https://raider.io/api/v1/characters/profile?region={char['region']}&realm={char['realm']}&name={char['name']}&fields=guild,mythic_plus_scores_by_season:current"
    r = requests.get(url)
    if r.status_code != 200:
        print(f"Failed to fetch {char['name']}")
        continue
    data = r.json()

    char_data = {
        "name": data.get("name"),
        "race": data.get("race"),
        "class": data.get("class"),
        "region": data.get("region"),
        "realm": data.get("realm"),
        "avatar": data.get("thumbnail_url"),
        "guild": {
            "name": data.get("guild", {}).get("name"),
            "realm": data.get("guild", {}).get("realm")
        },
        "dps": {
            "score": data.get("mythic_plus_scores_by_season", [{}])[0].get("scores", {}).get("dps", 0),
            "color": data.get("mythic_plus_scores_by_season", [{}])[0].get("segments", {}).get("dps", {}).get("color", "#ffffff")
        },
        "healer": {
            "score": data.get("mythic_plus_scores_by_season", [{}])[0].get("scores", {}).get("healer", 0),
            "color": data.get("mythic_plus_scores_by_season", [{}])[0].get("segments", {}).get("healer", {}).get("color", "#ffffff")
        },
        "tank": {
            "score": data.get("mythic_plus_scores_by_season", [{}])[0].get("scores", {}).get("tank", 0),
            "color": data.get("mythic_plus_scores_by_season", [{}])[0].get("segments", {}).get("tank", {}).get("color", "#ffffff")
        }
    }

    output.append(char_data)

# Запис у файл _data/characters.yml (Jekyll читає YAML з _data)
with open("_data/characters.yml", "w", encoding="utf-8") as f:
    yaml.dump(output, f, allow_unicode=True)
