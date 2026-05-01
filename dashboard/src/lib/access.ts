export {
  assertAdmin,
  assertCanModerate,
  canModerate,
  resolveDashboardRole,
} from "./auth";

export type {
  DashboardRole,
  DashboardSession,
  SessionUser,
} from "./auth";

export {
  canManageApplications,
  canManageGeneralEmbeds,
  canManageRulesEmbeds,
  canManageRaids,
  canManageSiteContent,
  canViewRulesStats,
  canViewRaidDirectory,
  canViewRaidRoster,
  canViewProfileAccessDetails,
  isDashboardStaff,
  isDashboardAdmin,
  dashboardRoleRank,
  canViewProfiles,
  canAccessDashboardRole,
  dashboardCapabilities,
  dashboardRoleLabel,
  hierarchyTitle,
  matchingDiscordRoleIds,
  matchingDiscordRoleLabels,
  siteStatusDescription,
  siteStatusLabel,
} from "./permissions";

export type { DashboardCapability } from "./permissions";
