// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaSpace Connector",
  description: "Deine KI-Verbindung zu NovaSpace: Dateien, Deck, Kalender und weitere freigegebene Arbeitsbereiche.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
