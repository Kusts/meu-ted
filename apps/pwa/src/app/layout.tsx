import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { RootProviders } from "@/components/RootProviders";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Pi Financeiro",
  description: "Controle financeiro pessoal via WhatsApp",
  applicationName: "Pi Financeiro",
  appleWebApp: {
    capable: true,
    title: "Pi Financeiro",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0E8C5A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt"
      className={`${plusJakartaSans.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-ui antialiased">
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
