import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { DashboardProviders } from "@/components/layout/providers";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0e1a]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          user={{
            name: session.name,
            email: session.email,
            roles: session.roles,
            tenantName: session.tenantName,
          }}
        />
        <main className="flex-1 overflow-auto p-6 grid-pattern">
          <DashboardProviders>{children}</DashboardProviders>
        </main>
      </div>
    </div>
  );
}
