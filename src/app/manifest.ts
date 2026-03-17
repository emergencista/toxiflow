import type { MetadataRoute } from "next";

const basePath = process.env.TOXIFLOW_BASE_PATH || "";

function withBasePath(path: string) {
  return `${basePath}${path}`;
}

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ToxiFlow Pro",
    short_name: "ToxiFlow",
    description: "Suporte a decisao toxicologica para triagem rapida e contato com o CIATox.",
    start_url: withBasePath("/") || "/",
    scope: withBasePath("/") || "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    icons: [
      {
        src: withBasePath("/android-chrome-192x192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: withBasePath("/android-chrome-512x512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: withBasePath("/android-chrome-192x192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: withBasePath("/android-chrome-512x512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: withBasePath("/apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
        purpose: "any"
      }
    ]
  };
}