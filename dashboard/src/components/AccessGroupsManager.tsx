"use client";

import { useState } from "react";
import type { AccessGroup, DashboardPermissionKey } from "@/lib/accessGroupSchema";
import { DASHBOARD_PERMISSION_KEYS, PERMISSION_META, DEFAULT_ADMIN_GROUP_ID, DEFAULT_MODERATOR_GROUP_ID, DEFAULT_MENTOR_GROUP_ID, DEFAULT_MEMBER_GROUP_ID } from "@/lib/accessGroupSchema";

type Props = {
  groups: AccessGroup[];
  isServerOwner: boolean;
  currentGroupId?: string;
  saveGroupAction: (formData: FormData) => Promise<void>;
  deleteGroupAction: (formData: FormData) => Promise<void>;
  impersonateAction: (formData: FormData) => Promise<void>;
};

function permissionsByCategory() {
  return DASHBOARD_PERMISSION_KEYS.reduce<Record<string, DashboardPermissionKey[]>>((acc, key) => {
    const category = PERMISSION_META[key].category;
    acc[category] = acc[category] || [];
    acc[category].push(key);
    return acc;
  }, {});
}

function fixedLabel(group: AccessGroup) {
  if (group.id === DEFAULT_ADMIN_GROUP_ID) return "Системна група · ID 1";
  if (group.id === DEFAULT_MODERATOR_GROUP_ID) return "Системна група · ID 2";
  if (group.id === DEFAULT_MEMBER_GROUP_ID) return "Системна група · ID 99";
  if (group.id === DEFAULT_MENTOR_GROUP_ID) return "Стандартна група · наставники";
  return "Користувацька група";
}

export default function AccessGroupsManager({ groups, isServerOwner, currentGroupId, saveGroupAction, deleteGroupAction, impersonateAction }: Props) {
  const [expanded, setExpanded] = useState<string>(groups[0]?.id || "new");
  const categories: Array<[string, DashboardPermissionKey[]]> = Object.entries(permissionsByCategory()) as Array<[string, DashboardPermissionKey[]]>;

  return (
    <div className="access-groups-layout">
      <aside className="access-groups-list panel">
        <div className="section-title">Групи</div>
        {groups.map((group) => (
          <button key={group.id} type="button" className={expanded === group.id ? "is-active" : undefined} onClick={() => setExpanded(group.id)}>
            <strong>{group.name}</strong>
            <span>ID {group.id} · {group.permissions.length} прав</span>
          </button>
        ))}
        <button type="button" className={expanded === "new" ? "is-active" : undefined} onClick={() => setExpanded("new")}>
          <strong>＋ Нова група</strong>
          <span>ID, назва, Discord role ID і права</span>
        </button>
      </aside>

      <div className="access-groups-editor">
        {groups.map((group) => {
          const canEdit = isServerOwner || (group.id !== currentGroupId && group.id !== DEFAULT_ADMIN_GROUP_ID);
          const canDelete = canEdit && !group.protectedGroup;
          const adminFixed = group.id === DEFAULT_ADMIN_GROUP_ID;
          return expanded === group.id ? (
            <form key={group.id} className="panel access-group-card" action={saveGroupAction}>
              <input type="hidden" name="currentId" value={group.id} />
              <div className="access-group-card__head">
                <div>
                  <span className="eyebrow">{fixedLabel(group)}</span>
                  <h2>{group.name}</h2>
                  <p>{group.id === currentGroupId ? "Це твоя поточна група. Самому собі права не змінюємо." : adminFixed && !isServerOwner ? "Права адміна може змінювати тільки власник Discord-сервера." : "Зміни застосуються після наступного оновлення сесії користувача."}</p>
                </div>
                {isServerOwner ? (
                  <button className="btn subtle" formAction={impersonateAction} name="groupId" value={group.id} type="submit">Перегляд як</button>
                ) : null}
              </div>

              <div className="form-grid compact-form-grid">
                <label>
                  <span>ID групи</span>
                  <input name="id" defaultValue={group.id} readOnly={group.lockedId || !canEdit} />
                </label>
                <label>
                  <span>Назва</span>
                  <input name="name" defaultValue={group.name} readOnly={!canEdit} />
                </label>
                <label>
                  <span>Ранг</span>
                  <input name="rank" type="number" min="1" max="100" defaultValue={group.rank} readOnly={group.protectedGroup || !canEdit} />
                </label>
                <label>
                  <span>Discord role ID</span>
                  <input name="discordRoleIds" defaultValue={group.discordRoleIds.join(", ")} placeholder="123456789012345678, ..." readOnly={!canEdit} />
                </label>
              </div>

              <div className="permissions-grid">
                {categories.map(([category, keys]) => (
                  <fieldset key={category}>
                    <legend>{category}</legend>
                    {keys.map((key) => {
                      const checked = group.permissions.includes(key);
                      return (
                        <label key={key} className="permission-check">
                          <input type="checkbox" name="permissions" value={key} defaultChecked={checked} disabled={!canEdit || key === "dashboard.view" || (key === "groups.manage" && !isServerOwner)} />
                          <span><strong>{PERMISSION_META[key].title}</strong><small>{PERMISSION_META[key].description}</small></span>
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
              </div>

              <div className="form-actions">
                <button className="btn primary" type="submit" disabled={!canEdit}>Зберегти права</button>
                {canDelete ? <button className="btn danger" formAction={deleteGroupAction} name="groupId" value={group.id} type="submit">Видалити групу</button> : null}
              </div>
            </form>
          ) : null;
        })}

        {expanded === "new" ? (
          <form className="panel access-group-card" action={saveGroupAction}>
            <div className="access-group-card__head">
              <div>
                <span className="eyebrow">Нова група</span>
                <h2>Додати групу доступу</h2>
                <p>Вкажи власний ID, назву, Discord role ID і потрібні права. Системні ID 1, 2 і 99 зайняті.</p>
              </div>
            </div>
            <div className="form-grid compact-form-grid">
              <label><span>ID групи</span><input name="id" placeholder="10" required /></label>
              <label><span>Назва</span><input name="name" placeholder="Рейд-лідер" required /></label>
              <label><span>Ранг</span><input name="rank" type="number" min="1" max="100" defaultValue="20" /></label>
              <label><span>Discord role ID</span><input name="discordRoleIds" placeholder="123456789012345678" /></label>
            </div>
            <div className="permissions-grid">
              {categories.map(([category, keys]) => (
                <fieldset key={category}>
                  <legend>{category}</legend>
                  {keys.map((key) => (
                    <label key={key} className="permission-check">
                      <input type="checkbox" name="permissions" value={key} defaultChecked={key === "dashboard.view"} disabled={key === "dashboard.view" || (key === "groups.manage" && !isServerOwner)} />
                      <span><strong>{PERMISSION_META[key].title}</strong><small>{PERMISSION_META[key].description}</small></span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <div className="form-actions"><button className="btn primary" type="submit">Створити групу</button></div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
