export type RaidSignupRole = "tank" | "healer" | "dps";
export type RaidSignupAction = "going" | "late" | "skipped";
export type RaidInteractionAction = {
  raidId: string;
  action: RaidSignupAction;
  characterKey?: string;
  signupRole?: RaidSignupRole;
};
export type WorkerConfig = {
  dashboardUrl: string;
  adminDashboardUrl: string;
  profileLookupEndpoint: string;
  raidActionEndpointTemplate: string;
  raidLifecycleEndpoint: string;
  discordApiTimeoutMs: number;
  dashboardApiTimeoutMs: number;
  discordSignatureSkewMs: number;
  raidLifecycleToken: string;
};
