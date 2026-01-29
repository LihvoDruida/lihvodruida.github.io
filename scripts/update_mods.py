import requests
import yaml
import time
import os

# --- НАЛАШТУВАННЯ ---
API_KEY = "$2a$10$JluGEcJ9pdU87F13T10hrepUKFsdV5Kmyo9WOifGAwGaotAVEE0Ua"
AUTHOR_ID = 104580421
GAME_ID = 1
API_URL = "https://api.curseforge.com/v1/mods/search"

def fetch_author_mods(author_id):
    headers = {
        'x-api-key': API_KEY,
        'Accept': 'application/json'
    }
    
    params = {
        'gameId': GAME_ID,
        'authorId': author_id,
        'sortField': 2,
        'sortOrder': 'desc',
        'pageSize': 50
    }

    try:
        print(f"📡 Надсилаю запит до CurseForge для ID: {author_id}...")
        r = requests.get(API_URL, headers=headers, params=params, timeout=15)
        if r.status_code == 200:
            return r.json().get('data', [])
        else:
            print(f"❌ Помилка API: {r.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Помилка з'єднання: {e}")
        return None

def extract_game_versions(mod):
    """
    Збирає унікальні версії та сортує їх як числа (11.0 > 3.4).
    """
    latest_files = mod.get('latestFiles', [])
    unique_versions = set()
    
    for file in latest_files:
        for v in file.get('gameVersions', []):
            # Беремо тільки те, що починається з цифри
            if v and v[0].isdigit():
                unique_versions.add(v)
    
    # --- ЛОГІКА СОРТУВАННЯ ---
    def version_key(v):
        try:
            # Розбиваємо "11.0.7" на список чисел [11, 0, 7]
            # Це дозволяє Python зрозуміти, що 11 більше за 4
            parts = []
            for p in v.split('.'):
                if p.isdigit():
                    parts.append(int(p))
            return parts
        except:
            return [0]

    # Сортуємо за ключем (числами), reverse=True означає від більшого до меншого
    return sorted(list(unique_versions), key=version_key, reverse=True)

# --- ОСНОВНА ЛОГІКА ---

output = []
mods_list = fetch_author_mods(AUTHOR_ID)

if mods_list:
    print(f"✅ Знайдено модів: {len(mods_list)}")
    
    for mod in mods_list:
        website_url = mod.get('links', {}).get('websiteUrl', '')
        game_versions = extract_game_versions(mod)

        mod_data = {
            "id": mod.get("id"),
            "name": mod.get("name"),
            "summary": mod.get("summary"),
            "downloads": mod.get("downloadCount"),
            "updated_at": mod.get("dateReleased"),
            "link": website_url,
            "logo": mod.get("logo", {}).get("thumbnailUrl"),
            "categories": [cat.get("name") for cat in mod.get("categories", [])],
            "game_versions": game_versions 
        }

        output.append(mod_data)
        # Виводимо для перевірки (перші 3 версії)
        print(f"   -> {mod_data['name']} {game_versions[:3]}...")

    if not os.path.exists('_data'):
        os.makedirs('_data')
        
    with open("_data/my_mods.yml", "w", encoding="utf-8") as f:
        yaml.dump(output, f, allow_unicode=True, sort_keys=False)

    print(f"\n🎉 Успіх! Дані збережено.")
else:
    print("⚠️ Модів не знайдено.")