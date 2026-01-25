import requests
import yaml
import time

# Налаштування
API_URL = "https://raider.io/api/v1/guilds/profile"
PARAMS = {
    "region": "eu",
    "realm": "terokkar",
    "name": "Mistblossom Vanguard",
    "fields": "raid_progression:current-expansion:previous-expansion,raid_rankings:current-expansion:previous-expansion,members"
}

def fetch_guild_data():
    print(f"🏰 Отримання даних гільдії {PARAMS['name']}...")
    
    try:
        # Виконуємо запит (аналог вашого curl)
        r = requests.get(API_URL, params=PARAMS, headers={'accept': 'application/json'}, timeout=15)
        
        if r.status_code == 200:
            return r.json()
        else:
            print(f"❌ Помилка API: {r.status_code}")
            return None
    except Exception as e:
        print(f"❌ Критична помилка: {e}")
        return None

# --- ОСНОВНИЙ ПРОЦЕС ---

data = fetch_guild_data()

if data:
    # Очистка даних (опціонально)
    # Raider.IO повертає список учасників у форматі { "rank": 0, "character": {...} }
    # Ми можемо залишити як є, або спростити структуру для Jekyll.
    # Нижче ми трохи спрощуємо структуру учасників для зручності в HTML.
    
    processed_members = []
    if "members" in data:
        for m in data["members"]:
            char = m["character"]
            processed_members.append({
                "rank": m["rank"],
                "name": char["name"],
                "class": char["class"],
                "race": char["race"],
                "spec": char.get("active_spec_name"),
                "role": char.get("active_spec_role"), # TANK, DPS, HEALING
                "avatar": char.get("thumbnail_url"),
                "profile_url": char.get("profile_url")
            })
    
    # Формуємо фінальний об'єкт для збереження
    guild_output = {
        "name": data.get("name"),
        "faction": data.get("faction"),
        "realm": data.get("realm"),
        "region": data.get("region"),
        "profile_url": data.get("profile_url"),
        "raid_progression": data.get("raid_progression", {}), # Прогрес рейдів
        "raid_rankings": data.get("raid_rankings", {}),       # Рейтинги
        "members": processed_members                          # Оброблений список учасників
    }

    # Збереження у файл
    # Краще використовувати guild.yml, щоб не плутати з окремими персонажами
    with open("_data/guild.yml", "w", encoding="utf-8") as f:
        yaml.dump(guild_output, f, allow_unicode=True, sort_keys=False)

    print("✅ Дані гільдії успішно збережено у _data/guild.yml")
else:
    print("❌ Не вдалося отримати дані.")