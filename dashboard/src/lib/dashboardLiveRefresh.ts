export const DASHBOARD_DATA_MUTATED_EVENT = "dashboard:data-mutated";
export const DASHBOARD_DATA_REFRESHED_EVENT = "dashboard:data-refreshed";
export const DASHBOARD_LAST_MUTATION_STORAGE_KEY = "mistblossom-dashboard:last-data-mutation";
export const DASHBOARD_MUTATION_BROADCAST_CHANNEL = "mistblossom-dashboard:mutations";

export type DashboardDataScope =
  | "applications"
  | "content"
  | "discord"
  | "guild"
  | "integrations"
  | "profile"
  | "profiles"
  | "raids"
  | "session"
  | "unknown";

export type DashboardDataMutationDetail = {
  scope?: DashboardDataScope;
  resourceId?: string;
  revision?: string;
  source?: string;
  action?: string;
  path?: string;
  timestamp?: number;
};

function buildMutationDetail(detail: DashboardDataMutationDetail = {}): DashboardDataMutationDetail {
  return {
    ...detail,
    scope: detail.scope || "unknown",
    path: detail.path || (typeof window !== "undefined" ? window.location.pathname : undefined),
    timestamp: detail.timestamp || Date.now(),
  };
}

export function notifyDashboardDataChanged(detail: DashboardDataMutationDetail = {}) {
  if (typeof window === "undefined") return;

  const payload = buildMutationDetail(detail);
  window.dispatchEvent(new CustomEvent<DashboardDataMutationDetail>(DASHBOARD_DATA_MUTATED_EVENT, { detail: payload }));
  if (payload.scope === "raids") {
    const detail = {
      raidId: payload.resourceId,
      pollId: payload.resourceId,
      revision: payload.revision,
      source: payload.source || "site",
      action: payload.action,
    };
    window.dispatchEvent(new CustomEvent("dashboard:raid-updated", { detail }));
    window.dispatchEvent(new CustomEvent("dashboard:raid-poll-updated", { detail }));
  }

  try {
    window.localStorage.setItem(DASHBOARD_LAST_MUTATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore unavailable storage. Same-tab listeners still receive the event above.
  }

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(DASHBOARD_MUTATION_BROADCAST_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    }
  } catch {
    // BroadcastChannel is an optimization. localStorage + same-tab event remain enough.
  }
}
