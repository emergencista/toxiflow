import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import "@/app/globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "ToxiFlow",
  description: "Suporte à decisão toxicológica com catálogo escalável em Next.js e Supabase."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${manrope.variable} antialiased`}>{children}</body>
    </html>
  );
}