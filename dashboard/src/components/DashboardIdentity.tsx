import type { DashboardSession } from "@/lib/auth";
import { getGuildBranding } from "@/lib/branding";

export default async function DashboardIdentity({ user }: { user: DashboardSession | null }) {
  const guild = await getGuildBranding();
  const avatar = user?.avatar_url || user?.avatar || null;

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-brand">
        <img className="guild-mark" src={guild.iconUrl} alt="" />
        <div>
          <strong>{guild.name}</strong>
          <span>Secure applications dashboard</span>
        </div>
      </div>

      {user ? (
        <div className="dashboard-user">
          <div className="dashboard-user__avatar-wrap">
            {avatar ? <img className="discord-avatar" src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="discord-avatar-fallback">{(user.name || user.login || "A").charAt(0)}</span>}
            <span className="dashboard-user__status" aria-hidden="true" />
          </div>
          <div>
            <strong>{user.name}</strong>
            <span>Discord • {user.role}</span>
          </div>
          <form method="post" action="/api/auth/logout" className="dashboard-user__logout">
            <button type="submit" aria-label="Вийти">Вийти</button>
          </form>
        </div>
      ) : null}
    </header>
  );
}
