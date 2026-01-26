import requests
import yaml
import time

# --- НАЛАШТУВАННЯ ---
API_URL = "https://raider.io/api/v1/guilds/profile"

# Параметри запиту (включаючи ключ доступу з вашого curl)
PARAMS = {
    "access_key": "RIOJGDTBvmXP1GcEYRDhBZSzf", 
    "region": "eu",
    "realm": "terokkar",
    "name": "Mistblossom Vanguard",
    "fields": "raid_progression:current-expansion:previous-expansion,raid_rankings:current-expansion:previous-expansion,members"
}

def fetch_guild_data():
    print(f"🏰 Отримання даних гільдії {PARAMS['name']}...")
    
    try:
        # Виконуємо запит
        r = requests.get(API_URL, params=PARAMS, headers={'accept': 'application/json'}, timeout=15)
        
        if r.status_code == 200:
            return r.json()
        else:
            print(f"❌ Помилка API: {r.status_code}")
            print(f"Відповідь: {r.text}")
            return None
    except Exception as e:
        print(f"❌ Критична помилка з'єднання: {e}")
        return None

# --- ОСНОВНИЙ ПРОЦЕС ---

data = fetch_guild_data()

if data:
    processed_members = []
    
    if "members" in data:
        print(f"👥 Оброблено учасників: {len(data['members'])}")
        
        for m in data["members"]:
            char = m["character"]
            
            # Формуємо об'єкт персонажа з новими полями
            member_data = {
                "rank": m["rank"],
                "name": char["name"],
                "class": char["class"],
                "race": char["race"],
                "spec": char.get("active_spec_name"),
                "role": char.get("active_spec_role"), # TANK, DPS, HEALING
                
                # --- НОВІ ПОЛЯ ---
                "gender": char.get("gender"),
                "faction": char.get("faction"), # Важливо для крос-фракційних гільдій
                "region": char.get("region"),
                "realm": char.get("realm"),     # Важливо для крос-серверних гравців
                # -----------------
                
                "avatar": char.get("thumbnail_url"),
                "profile_url": char.get("profile_url")
            }
            
            processed_members.append(member_data)
    
    # Формуємо фінальний об'єкт для збереження
    guild_output = {
        "metadata": {
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "source": "Raider.IO API"
        },
        "guild_info": {
            "name": data.get("name"),
            "faction": data.get("faction"),
            "realm": data.get("realm"),
            "region": data.get("region"),
            "profile_url": data.get("profile_url")
        },
        "raid_progression": data.get("raid_progression", {}), 
        "raid_rankings": data.get("raid_rankings", {}),       
        "members": processed_members                          
    }

    # Збереження у файл
    file_path = "_data/guild.yml"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            yaml.dump(guild_output, f, allow_unicode=True, sort_keys=False)
        print(f"✅ Дані успішно збережено у {file_path}")
        
    except IOError as e:
        print(f"❌ Помилка запису файлу: {e}")

else:
    print("❌ Не вдалося отримати дані. Перевірте налаштування.")