import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BYOC - Cybersecurity Platform",
  description: "Bring Your Own Cloud - Enterprise Cybersecurity & Compliance Platform",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0e1a] antialiased">
        {children}
      </body>
    </html>
  );
}
