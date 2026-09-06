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
    description: "Meu Ted. Tudo em dia. Controle financeiro pessoal com o assistente TED.",
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
    background_color: "#F8F9FA",
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
        name: "Novo gasto no Meu Ted",
        url: "/capture?kind=expense",
      },
    ],
  };
}
