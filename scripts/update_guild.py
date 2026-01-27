import requests
import yaml
import time

# --- CONFIGURATION ---
GUILD_API_URL = "https://raider.io/api/v1/guilds/profile"
CHAR_API_URL = "https://raider.io/api/v1/characters/profile"

# Global Headers
HEADERS = {'accept': 'application/json'}

# Guild Request Parameters
GUILD_PARAMS = {
    "access_key": "RIOJGDTBvmXP1GcEYRDhBZSzf", 
    "region": "eu",
    "realm": "terokkar",
    "name": "Mistblossom Vanguard",
    "fields": "raid_progression:current-expansion:previous-expansion,raid_rankings:current-expansion:previous-expansion,members"
}

def fetch_guild_data():
    """Fetches the main guild roster and raid progress."""
    print(f"🏰 Fetching guild data for {GUILD_PARAMS['name']}...")
    try:
        r = requests.get(GUILD_API_URL, params=GUILD_PARAMS, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            return r.json()
        else:
            print(f"❌ Guild API Error: {r.status_code} - {r.text}")
            return None
    except Exception as e:
        print(f"❌ Critical Guild Connection Error: {e}")
        return None

def fetch_character_details(region, realm, name):
    """
    Fetches detailed Mythic+ scores and avatar for a specific character.
    """
    params = {
        "region": region,
        "realm": realm,
        "name": name,
        "fields": "mythic_plus_scores_by_season:current"
    }
    
    try:
        r = requests.get(CHAR_API_URL, params=params, headers=HEADERS, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            
            # 1. Extract Thumbnail
            thumbnail = data.get("thumbnail_url")
            
            # 2. Extract Mythic+ Scores
            # We need to handle cases where a player has no M+ score for the season
            mp_data = {
                "dps":    {"score": 0, "color": "#ffffff"},
                "healer": {"score": 0, "color": "#ffffff"},
                "tank":   {"score": 0, "color": "#ffffff"}
            }
            
            seasons = data.get("mythic_plus_scores_by_season", [])
            if seasons:
                # The API returns a list, usually the first one is the requested 'current'
                current_season = seasons[0]
                segments = current_season.get("segments", {})
                
                # Update our map with actual data if it exists
                if "dps" in segments: mp_data["dps"] = segments["dps"]
                if "healer" in segments: mp_data["healer"] = segments["healer"]
                if "tank" in segments: mp_data["tank"] = segments["tank"]

            return {
                "thumbnail_url": thumbnail,
                "mythic_plus_scores": mp_data
            }
            
        else:
            print(f"   ⚠️ Char API Error for {name}: {r.status_code}")
            return None
            
    except Exception as e:
        print(f"   ⚠️ Connection Error for {name}: {e}")
        return None

# --- MAIN PROCESS ---

guild_data = fetch_guild_data()

if guild_data:
    processed_members = []
    
    if "members" in guild_data:
        total_members = len(guild_data['members'])
        print(f"👥 Found {total_members} members. Starting detailed scan...")
        
        for index, m in enumerate(guild_data["members"]):
            char_basic = m["character"]
            name = char_basic["name"]
            realm = char_basic.get("realm", GUILD_PARAMS["realm"]) # Fallback to guild realm
            region = char_basic.get("region", GUILD_PARAMS["region"])
            
            print(f"   [{index+1}/{total_members}] Processing {name}...")
            
            # --- FETCH DETAILED DATA ---
            details = fetch_character_details(region, realm, name)
            
            # Initialize default structure for details in case API fails
            char_thumbnail = char_basic.get("thumbnail_url") # Fallback to basic
            mp_scores = {
                "dps": {"score": 0, "color": "#ffffff"},
                "healer": {"score": 0, "color": "#ffffff"},
                "tank": {"score": 0, "color": "#ffffff"}
            }

            if details:
                if details["thumbnail_url"]:
                    char_thumbnail = details["thumbnail_url"]
                mp_scores = details["mythic_plus_scores"]

            # --- BUILD MEMBER OBJECT ---
            member_data = {
                "rank": m["rank"],
                "name": name,
                "class": char_basic["class"],
                "race": char_basic["race"],
                "spec": char_basic.get("active_spec_name"),
                "role": char_basic.get("active_spec_role"),
                "gender": char_basic.get("gender"),
                "faction": char_basic.get("faction"),
                "region": region,
                "realm": realm,
                "profile_url": char_basic.get("profile_url"),
                
                # Updated fields from detailed request
                "avatar": char_thumbnail,
                "mythic_plus_scores": mp_scores
            }
            
            processed_members.append(member_data)
            
            # IMPORTANT: Sleep to avoid API Rate Limits (Do not remove)
            time.sleep(0.1) 
    
    # Form Final Output
    guild_output = {
        "metadata": {
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "source": "Raider.IO API"
        },
        "guild_info": {
            "name": guild_data.get("name"),
            "faction": guild_data.get("faction"),
            "realm": guild_data.get("realm"),
            "region": guild_data.get("region"),
            "profile_url": guild_data.get("profile_url")
        },
        "raid_progression": guild_data.get("raid_progression", {}), 
        "raid_rankings": guild_data.get("raid_rankings", {}),       
        "members": processed_members                          
    }

    # Save to File
    file_path = "_data/guild.yml"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            yaml.dump(guild_output, f, allow_unicode=True, sort_keys=False)
        print(f"✅ Data successfully saved to {file_path}")
        
    except IOError as e:
        print(f"❌ File Write Error: {e}")

else:
    print("❌ Failed to fetch guild data.")