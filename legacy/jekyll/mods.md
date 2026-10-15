---
layout: default
title: Адони та мої проєкти
permalink: /mods/
description: "Каталог моїх адонів і модифікацій для World of Warcraft та інших ігор з актуальними версіями, описами й посиланнями на CurseForge."
image: /assets/img/og-image-default.webp
tags: [CurseForge, адони, World of Warcraft, WoW, моди, Lihvo_Druida]
extra_css:
  - /assets/css/guild.css
  - /assets/css/mods.css
---

<div class="guild-page-container">

  <header class="guild-header">
    <div class="header-content">
      <div class="guild-badge">
        <span class="faction-icon">🛠️</span>
      </div>
      <div class="guild-info">
        <h1 class="guild-name">Мої Розробки</h1>
        <div class="guild-meta">
          <span class="meta-tag">World of Warcraft</span>
          <span class="meta-separator">/</span>
          <span class="meta-tag">Адони</span>
        </div>
      </div>
    </div>
    <div class="guild-actions">
      <a href="{{ site.curseforge_profile_url }}" target="_blank" rel="noopener noreferrer" class="btn-discord">
        CurseForge автора <span>↗</span>
      </a>
    </div>
  </header>

  <section class="guild-section">
    <div class="modern-header">
      <div class="header-left">
        <div class="icon-box trophy-glow" style="color: var(--gold-primary);">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
        </div>
        <div class="title-wrapper">
          <h2 class="section-title">Каталог Адонів</h2>
          <span class="subtitle">Покращення ігрового процесу</span>
        </div>
      </div>
      
      <div class="stat-badge">
        <span class="stat-val">{{ site.data.my_mods | size }}</span>
        <span class="stat-label">Проєктів</span>
      </div>
    </div>

    <div class="mods-grid">
      {% if site.data.my_mods and site.data.my_mods.size > 0 %}
      {% for mod in site.data.my_mods %}
      <div class="mod-card">
        
        <div class="mod-header">
          <div class="mod-logo-wrapper">
            <img src="{{ mod.logo }}" alt="{{ mod.name }}" loading="lazy">
          </div>
          <div class="mod-title-box">
            <h3 class="mod-name">{{ mod.name }}</h3>
            
            <div class="mod-versions">
              
              {% for ver in mod.game_versions limit: 10 %}
                <span class="version-badge">{{ ver }}</span>
              {% endfor %}

              {% assign total_versions = mod.game_versions | size %}
              {% assign hidden_count = total_versions | minus: 10 %}

              {% if hidden_count > 0 %}
                <div class="version-badge more-versions">
                  +{{ hidden_count }}
                  
                  <div class="versions-tooltip">
                    <div class="tooltip-header">Інші версії:</div>
                    <div class="tooltip-grid">
                      {% for ver in mod.game_versions offset: 10 %}
                        <span class="tooltip-tag">{{ ver }}</span>
                      {% endfor %}
                    </div>
                  </div>
                </div>
              {% endif %}
              
            </div>

            <div class="mod-categories">
              {% for cat in mod.categories limit:3 %}
                <span class="mod-tag">{{ cat }}</span>
              {% endfor %}
            </div>
          </div>
        </div>

        <div class="mod-body">
          <p class="mod-summary">{{ mod.summary | truncate: 120 }}</p>
        </div>

        <div class="mod-footer">
          <div class="mod-stats">
            
            <div class="stat-item" title="Завантаження">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              {{ mod.downloads }}
            </div>

            <div class="stat-item" title="Версія файлу">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
              {{ mod.version }}
            </div>

            <div class="stat-item" title="Оновлено">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              {{ mod.updated_at | date: "%d.%m.%Y" }}
            </div>

          </div>
          <a href="{{ mod.link }}" target="_blank" rel="noopener noreferrer" class="btn-mod-download">
            Відкрити
          </a>
        </div>

      </div>
      {% endfor %}
    {% else %}
      <div class="empty-state-wow" style="grid-column: 1 / -1; margin-top: 8px;">
        <div class="empty-icon-glow">🧰</div>
        <h2>Каталог ще не заповнений</h2>
        <p>Список модів скоро з’явиться. Ми вже готуємо актуальні проєкти для цього розділу.</p>
      </div>
    {% endif %}
    </div>

  </section>
</div>