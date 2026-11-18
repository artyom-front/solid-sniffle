import type { Metadata } from "next";
import AdminGate from "@/components/portal/AdminGate";

// Панель управления — только для сотрудников; индексация запрещена
// (robots.ts + X-Robots-Tag в next.config.ts)
export const metadata: Metadata = {
  title: "Панель управления",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPage() {
  return <AdminGate />;
}
