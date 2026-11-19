import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Header />
      <div className="main">
        <Sidebar />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
