"use client";

export type IconGroup = {
  id: string;
  label: string;
  icons: string[];
};

/**
 * Curated finance icon set (~112 lucide icons). Every entry is a
 * lucide-react export name; unknown names fall back to "Tag" at render.
 */
export const ICON_GROUPS: IconGroup[] = [
  { id: "home", label: "Casa & Lar", icons: ["Home", "Building2", "Sofa", "Lamp", "BedDouble", "Hammer", "KeyRound", "DoorOpen", "Fence", "Wrench"] },
  { id: "bills", label: "Contas & Serviços", icons: ["Receipt", "FileText", "Wifi", "Lightbulb", "Droplets", "Flame", "Plug", "Phone", "Mail", "CalendarClock"] },
  { id: "food", label: "Alimentação", icons: ["UtensilsCrossed", "Coffee", "ShoppingBasket", "ChefHat", "Pizza", "Sandwich", "Salad", "Beer", "CakeSlice", "Popcorn"] },
  { id: "transport", label: "Transporte", icons: ["Car", "CarFront", "Bus", "Plane", "Bike", "Train", "Fuel", "Ticket", "Milestone", "SquareParking"] },
  { id: "health", label: "Saúde & Bem-estar", icons: ["HeartPulse", "Heart", "Activity", "Pill", "Dumbbell", "Stethoscope", "Brain", "Syringe", "ClipboardList", "ShieldPlus"] },
  { id: "study-work", label: "Educação & Trabalho", icons: ["GraduationCap", "BookOpen", "Library", "Laptop", "Briefcase", "Presentation", "PenLine", "Calculator", "Languages", "Award"] },
  { id: "leisure", label: "Lazer", icons: ["Clapperboard", "Film", "Music", "Gamepad2", "Tv", "Martini", "Dices", "Camera", "Palette", "PartyPopper"] },
  { id: "shopping", label: "Compras", icons: ["ShoppingBag", "Shirt", "Smartphone", "Armchair", "Watch", "Glasses", "ToyBrick", "Gift", "Store", "Baby"] },
  { id: "finance", label: "Finanças", icons: ["Wallet", "CreditCard", "PiggyBank", "TrendingUp", "TrendingDown", "Landmark", "Banknote", "Coins", "Percent", "Scale"] },
  { id: "income", label: "Renda", icons: ["HandCoins", "BadgeDollarSign", "CircleDollarSign", "RotateCcw", "ArrowLeftRight", "Sprout", "Vault", "Target", "LineChart", "DollarSign"] },
  { id: "family-pets", label: "Família & Pets", icons: ["Users", "PawPrint", "Dog", "Cat", "Bone", "HeartHandshake", "Flower2", "Sun", "Moon", "Smile"] },
  { id: "misc", label: "Outros", icons: ["Tag", "Star", "Sparkles", "Flag", "Bell", "MapPin", "Umbrella", "Cross", "Zap", "BookHeart"] },
];

/** pt-BR search labels per icon (fallback: the export name itself). */
export const ICON_LABELS: Record<string, string> = {
  Home: "casa lar moradia",
  Building2: "prédio condomínio empresa",
  Sofa: "sofá sala casa móveis",
  Lamp: "luminária luz abajur",
  BedDouble: "cama quarto dormir",
  Hammer: "reforma ferramenta obra",
  KeyRound: "aluguel chave",
  DoorOpen: "porta entrada",
  Fence: "cerca quintal",
  Wrench: "manutenção ferramenta conserto",
  Receipt: "recibo conta boleto taxa",
  FileText: "documento iptu contrato",
  Wifi: "internet wifi",
  Lightbulb: "luz energia ideia",
  Droplets: "água gotas",
  Flame: "gás fogo",
  Plug: "tomada energia elétrica",
  Phone: "telefone celular",
  Mail: "correio email",
  CalendarClock: "agendamento prazo vencimento",
  UtensilsCrossed: "restaurante comida refeição",
  Coffee: "café lanche",
  ShoppingBasket: "mercado feira compras",
  ChefHat: "restaurante chef cozinha",
  Pizza: "pizza lanche",
  Sandwich: "lanche sanduíche",
  Salad: "salada saudável",
  Beer: "cerveja bar bebida",
  CakeSlice: "bolo festa doce",
  Popcorn: "cinema pipoca filme",
  Car: "carro veículo",
  CarFront: "carro aplicativo uber 99",
  Bus: "ônibus transporte passagem",
  Plane: "avião viagem passagem",
  Bike: "bicicleta delivery",
  Train: "trem metrô",
  Fuel: "combustível gasolina posto",
  Ticket: "passagem ingresso",
  Milestone: "pedágio estrada marco",
  SquareParking: "estacionamento vaga",
  HeartPulse: "saúde coração",
  Heart: "saúde amor",
  Activity: "atividade saúde exame",
  Pill: "farmácia remédio",
  Dumbbell: "academia exercício",
  Stethoscope: "consulta médico",
  Brain: "mente terapia",
  Syringe: "vacina veterinário exame",
  ClipboardList: "exames checklist",
  ShieldPlus: "plano de saúde proteção",
  GraduationCap: "faculdade mensalidade formatura",
  BookOpen: "livro estudo curso",
  Library: "livros biblioteca",
  Laptop: "computador curso freelance",
  Briefcase: "trabalho emprego",
  Presentation: "apresentação curso aula",
  PenLine: "escrita material caneta",
  Calculator: "calculadora contas",
  Languages: "idioma curso",
  Award: "prêmio certificado",
  Clapperboard: "cinema filme lazer",
  Film: "filme cinema",
  Music: "música show",
  Gamepad2: "jogo videogame",
  Tv: "streaming televisão",
  Martini: "bar drink",
  Dices: "jogo sorte",
  Camera: "foto câmera",
  Palette: "arte pintura",
  PartyPopper: "festa comemoração",
  ShoppingBag: "compras sacola",
  Shirt: "roupas camisa",
  Smartphone: "celular eletrônicos",
  Armchair: "poltrona móveis casa",
  Watch: "relógio acessório",
  Glasses: "óculos acessório",
  ToyBrick: "brinquedo criança",
  Gift: "presente",
  Store: "loja comércio",
  Baby: "bebê filho criança",
  Wallet: "carteira renda dinheiro",
  CreditCard: "cartão crédito",
  PiggyBank: "poupança cofrinho",
  TrendingUp: "investimento alta rendimento",
  TrendingDown: "juros queda prejuízo",
  Landmark: "banco financeiro",
  Banknote: "salário dinheiro cédula",
  Coins: "moedas dinheiro outros",
  Percent: "taxa porcentagem desconto",
  Scale: "balança justiça",
  HandCoins: "mesada dinheiro mão",
  BadgeDollarSign: "bônus renda",
  CircleDollarSign: "dinheiro renda",
  RotateCcw: "reembolso estorno",
  ArrowLeftRight: "transferência troca",
  Sprout: "investimento crescimento",
  Vault: "cofre reserva",
  Target: "meta objetivo",
  LineChart: "gráfico investimento",
  Users: "família pessoas",
  PawPrint: "pet pata",
  Dog: "cachorro pet",
  Cat: "gato pet",
  Bone: "ração pet osso",
  HeartHandshake: "cuidado doação família",
  Flower2: "flor jardim",
  Sun: "dia sol",
  Moon: "noite sono",
  Smile: "felicidade bem-estar",
  Tag: "etiqueta geral",
  Star: "favorito destaque",
  Sparkles: "novo especial caridade",
  Flag: "meta marco",
  Bell: "alerta lembrete",
  MapPin: "lugar endereço viagem",
  Umbrella: "seguro proteção chuva",
  Cross: "saúde farmácia",
  Zap: "rápido energia",
  BookHeart: "doação caridade amor",
};

export const ALL_ICONS: string[] = [...new Set(ICON_GROUPS.flatMap((g) => g.icons))];

/** Filters groups by a free-text query matching icon name or pt-BR label. */
export function searchIconGroups(query: string): IconGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICON_GROUPS;
  const terms = q.split(/\s+/);
  return ICON_GROUPS.map((group) => ({
    ...group,
    icons: group.icons.filter((name) => {
      const hay = `${name} ${ICON_LABELS[name] ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }),
  })).filter((group) => group.icons.length > 0);
}

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
