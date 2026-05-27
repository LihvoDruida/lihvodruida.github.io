import DashboardBackgroundApiRefresh from "@/components/DashboardBackgroundApiRefresh";
import { getDashboardApiSettings } from "@/lib/dashboardApiSettings";

export default async function LiveDataRefresh() {
  const settings = await getDashboardApiSettings();
  return <DashboardBackgroundApiRefresh refreshMinMs={settings.backgroundRefreshMinSeconds * 1000} />;
}
