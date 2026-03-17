import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import "@/app/globals.css";

const basePath = process.env.TOXIFLOW_BASE_PATH || "";

function withBasePath(path: string) {
  return `${basePath}${path}`;
}

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "ToxiFlow",
  description: "Suporte a decisao toxicologica com triagem rapida e contato com o CIATox.",
  applicationName: "ToxiFlow Pro",
  manifest: withBasePath("/manifest.webmanifest"),
  icons: {
    icon: [
      {
        url: withBasePath("/favicon.ico"),
        sizes: "any"
      },
      {
        url: withBasePath("/favicon-32x32.png"),
        sizes: "32x32",
        type: "image/png"
      },
      {
        url: withBasePath("/favicon-16x16.png"),
        sizes: "16x16",
        type: "image/png"
      },
      {
        url: withBasePath("/icon.png"),
        sizes: "512x512",
        type: "image/png"
      }
    ],
    apple: [
      {
        url: withBasePath("/apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png"
      }
    ],
    shortcut: [withBasePath("/favicon.ico")]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ToxiFlow"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${manrope.variable} antialiased`}>{children}</body>
    </html>
  );
}