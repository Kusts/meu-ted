import type { MetadataRoute } from "next";

type CaptureManifest = MetadataRoute.Manifest & {
  share_target: {
    action: string;
    method: "GET";
    enctype: "application/x-www-form-urlencoded";
    params: { title: string; text: string; url: string };
  };
  shortcuts: Array<{ name: string; url: string }>;
};

export default function manifest(): CaptureManifest {
  return {
    name: "Meu Ted",
    short_name: "Meu Ted",
    description: "Finanças mais simples. Uma vida mais sua.",
    start_url: "/",
    share_target: {
      action: "/capture",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
    display: "standalone",
    background_color: "#1F2A27",
    theme_color: "#0B7A5B",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    lang: "pt-BR",
    categories: ["finance"],
    shortcuts: [
      {
        name: "Novo gasto no Meu Ted",
        url: "/capture?kind=expense",
      },
    ],
  };
}
