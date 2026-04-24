import type { DashboardSession } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";

export default async function DashboardIdentity({ user }: { user: DashboardSession | null }) {
  const guild = await getGuildBranding();
  const avatar = user?.avatar_url || user?.avatar || null;

  return (
    <div className="dashboard-identity">
      <img className="guild-mark" src={guild.iconUrl} alt="" />
      <div className="dashboard-identity__text">
        <strong>{guild.name}</strong>
        <span>{user ? `${user.name} • ${user.role}` : "Discord moderation dashboard"}</span>
      </div>
      {avatar ? (
        <img className="discord-avatar" src={avatar} alt="" referrerPolicy="no-referrer" />
      ) : null}
    </div>
  );
}
