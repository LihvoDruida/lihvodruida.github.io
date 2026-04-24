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
          {avatar ? <img className="discord-avatar" src={avatar} alt="" referrerPolicy="no-referrer" /> : null}
          <div>
            <strong>{user.name}</strong>
            <span>Discord • {user.role}</span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
