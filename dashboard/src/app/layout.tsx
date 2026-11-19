import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Custos Horti",
  description: "Wächter des Gartens – Growbox-Monitoring",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
  return (
    <html lang="de" data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <div className="backdrop" />
        {children}
      </body>
    </html>
  );
}
