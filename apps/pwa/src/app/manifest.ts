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
    name: "Pi Financeiro",
    short_name: "Pi Financeiro",
    description: "Controle financeiro pessoal inteligente com assistente IA TED",
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
    background_color: "#F7F8F5",
    theme_color: "#0E8C5A",
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
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    lang: "pt-BR",
    categories: ["finance"],
    shortcuts: [
      {
        name: "Novo gasto",
        url: "/capture?kind=expense",
      },
    ],
  };
}
