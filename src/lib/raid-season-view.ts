import type { Guild, Progress, Season } from './contracts';
export function raidSeasonView(guild: Guild, requested: string) {
    const seasons = guild.raid_seasons?.seasons || [], catalog = guild.raid_seasons?.catalog || {};
    const selected = seasons.find(season => season.id === requested) || seasons.find(season => season.id === guild.raid_seasons?.current_season_id) || seasons.find(season => season.current) || seasons[0];
    const slugs = selected ? selected.raids : Object.keys(guild.raid_progression);
    const cards = [...new Set(slugs)].map(slug => {
        const progress = guild.raid_progression[slug] as Progress | undefined;
        return { slug, name: catalog[slug]?.name || progress?.name || slug, total: progress?.total_bosses || catalog[slug]?.bosses || 0, progress, ranking: guild.raid_rankings?.[slug] };
    });
    const groups = new Map<string, Season[]>();
    for (const season of seasons) {
        const expansion = season.expansion || 'Сезони';
        groups.set(expansion, [...(groups.get(expansion) || []), season]);
    }
    return { selected, cards, groups: [...groups], pending: cards.filter(card => !card.progress).length };
}
