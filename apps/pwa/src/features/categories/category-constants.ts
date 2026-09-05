"use client";

export type IconGroup = {
  id: string;
  label: string;
  icons: string[];
};

export const ICON_GROUPS: IconGroup[] = [
  { id: "home", label: "Casa & Lar", icons: ["Home", "Building2", "Sofa", "Lamp", "BedDouble", "Wrench"] },
  { id: "food", label: "Alimentação", icons: ["UtensilsCrossed", "Coffee", "ShoppingBasket", "ChefHat", "Apple", "Beer"] },
  { id: "transport", label: "Transporte", icons: ["Car", "Bus", "Plane", "Bike", "Train", "Fuel"] },
  { id: "leisure", label: "Lazer & Compras", icons: ["Gamepad2", "Film", "Music", "ShoppingBag", "Gift", "PartyPopper"] },
  { id: "health", label: "Saúde & Bem-estar", icons: ["Heart", "Activity", "Pill", "Dumbbell", "Brain", "Smile"] },
  { id: "finance", label: "Finanças", icons: ["Wallet", "CreditCard", "PiggyBank", "TrendingUp", "Landmark", "Receipt"] },
  { id: "income", label: "Renda", icons: ["Briefcase", "DollarSign", "Laptop", "HandCoins", "BadgeDollarSign", "TrendingDown"] },
];

export const ALL_ICONS: string[] = ICON_GROUPS.flatMap((g) => g.icons);

export const COLOR_PALETTE: string[] = [
  "#0E8C5A",
  "#0A3A28",
  "#2FA56F",
  "#38B2AC",
  "#3E6FB0",
  "#3182CE",
  "#805AD5",
  "#D53F8C",
  "#E53E3E",
  "#C8483B",
  "#B8791F",
  "#ED8936",
  "#EC7000",
  "#FF7A00",
  "#4A5568",
  "#1A202C",
];

export function getCategoryIconName(name: string): string {
  // deterministic fallback icon based on name hash
  const hash = Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return ALL_ICONS[hash % ALL_ICONS.length] ?? "Tag";
}
