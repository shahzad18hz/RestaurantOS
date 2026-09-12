import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar/Sidebar";
import Header from "@/components/header/Header";
import { getSessionUser } from "@/lib/auth";
import DemoBanner from "@/components/demo/DemoBanner";

interface Props { children: ReactNode; }
export default async function DashboardLayout({ children }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) redirect("/login");
  const user = await getSessionUser();
  if (!user) redirect(token ? "/demo-ended" : "/login");
  return <div className="flex min-h-dvh bg-[#f6f7fb] text-slate-900"><Sidebar role={user.role as keyof typeof import("@/components/navigation/menu").MENU} isDemo={user.isDemo}/><div className="flex min-w-0 flex-1 flex-col">{user.isDemo&&user.demoExpiresAt?<DemoBanner expiresAt={user.demoExpiresAt.toISOString()}/>:null}<Header/><main className="erp-main min-w-0 flex-1 overflow-x-hidden">{children}</main></div></div>;
}
