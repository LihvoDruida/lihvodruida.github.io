import { NextRequest } from "next/server";

import { adminDiscordResponse, requireDiscordAdmin } from "@/lib/adminDiscordRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireDiscordAdmin(request, "roles-add-disabled");
  if ("error" in guard) return guard.error;

  return adminDiscordResponse(request, {
    ok: false,
    tone: "warning",
    title: "Ручну видачу ролей вимкнено",
    message: "У /admin/discord більше не використовується ручне додавання ролей. Замість цього запусти перевірку Discord-стану профілів або окрему синхронізацію офіцерських ролей.",
    status: 410,
  });
}
