import type { Metadata } from "next";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Custos Horti",
  description: "Wächter des Gartens – Growbox-Monitoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="backdrop" />
        <div className="shell">
          <Header />
          <div className="main">
            <Sidebar />
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
