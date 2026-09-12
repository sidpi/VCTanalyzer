import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

/* App shell for authenticated pages (Website Plan §9, §27) */

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <div className="lg:pl-56">
        <main className="mx-auto max-w-[1400px] px-6 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
