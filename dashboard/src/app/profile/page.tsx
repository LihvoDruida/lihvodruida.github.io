import { getSession } from "@/lib/auth";
import { getOwnProfilePath } from "@/lib/profiles";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfileRedirectPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(await getOwnProfilePath(user));
}
