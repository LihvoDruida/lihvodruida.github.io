---
layout: default
---

<section id="account" class="cards">
{% include socials.html %}
{% include donate.html %}
</section>

{% include characters.html %}

<section id="news" class="news-container">
    <div class="section-header">
        <span class="stay-updated">Будь в темі</span>
        <h2 class="section-title">Останні новини</h2>
    </div>

    <div class="news-feed">
        {% assign all_news = site.news | sort: 'date' | reverse %}
        
        <div class="news-grid-classic">
            {% for post in all_news limit: 3 %}
            <article class="news-card-classic">
      
                <span class="date-tag">{{ post.date | date: "%d %b. %Y р." }}</span>
                <h3 class="card-title">{{ post.title }}</h3>
                <p class="card-description">{{ post.description | truncate: 120 }}</p>
                
                <a href="{{ post.url | relative_url }}" class="card-link">
                    Read More <i class="mdi mdi-arrow-right" aria-hidden="true">→</i>
                </a>
            </article>
            {% endfor %}
        </div>
    </div>

    <div class="view-all-wrap">
        <a href="/news/" class="btn-view-all">View All News →</a>
    </div>
</section>

