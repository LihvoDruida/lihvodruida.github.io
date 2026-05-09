export type AdminTabKey = "overview" | "groups" | "discord";

export default function AdminTabs({ active }: { active: AdminTabKey }) {
  const tabs = [
    { key: "overview" as const, href: "/admin", icon: "⚙", label: "Керування", description: "загальний центр" },
    { key: "groups" as const, href: "/admin/groups", icon: "🧩", label: "Групи та права доступу", description: "ролі й дозволи" },
    { key: "discord" as const, href: "/admin/discord", icon: "◆", label: "Discord-учасники", description: "ролі, ніки, шаблон" },
  ];

  return (
    <nav className="admin-tabs panel" aria-label="Розділи керування">
      {tabs.map((tab) => (
        <a key={tab.key} href={tab.href} className={active === tab.key ? "is-active" : undefined} aria-current={active === tab.key ? "page" : undefined}>
          <span aria-hidden="true">{tab.icon}</span>
          <strong>{tab.label}</strong>
          <small>{tab.description}</small>
        </a>
      ))}
    </nav>
  );
}
