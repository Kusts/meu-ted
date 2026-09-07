/**
 * Default category catalog (pt-BR) — item 11.
 *
 * Template applied per household via POST /categories/apply-defaults and
 * bootstrapped on account creation when the household has no categories.
 * Seeds are EDITABLE (isSystem=false, isDefault=true marks template origin);
 * the user owns the rows after application. Application is idempotent:
 * a same-kind macro with the same case-insensitive name is reused, and
 * subs are matched under their resolved macro.
 *
 * Icons are lucide-react export names (verified against the installed
 * version); the PWA IconPicker falls back to "Tag" for unknown names.
 */

import type { CategoryKind } from '../types/domain.js';

export type CatalogSub = {
  name: string;
  icon: string;
};

export type CatalogMacro = {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  subs: CatalogSub[];
};

export const DEFAULT_CATEGORY_CATALOG: readonly CatalogMacro[] = [
  {
    name: 'Moradia',
    kind: 'expense',
    icon: 'Home',
    color: '#3E6FB0',
    subs: [
      { name: 'Aluguel', icon: 'KeyRound' },
      { name: 'Condomínio', icon: 'Building2' },
      { name: 'Luz', icon: 'Lightbulb' },
      { name: 'Água', icon: 'Droplets' },
      { name: 'Gás', icon: 'Flame' },
      { name: 'Internet', icon: 'Wifi' },
      { name: 'IPTU', icon: 'FileText' },
      { name: 'Reforma', icon: 'Hammer' },
    ],
  },
  {
    name: 'Transporte',
    kind: 'expense',
    icon: 'Car',
    color: '#ED8936',
    subs: [
      { name: 'Combustível', icon: 'Fuel' },
      { name: 'Passagem', icon: 'Ticket' },
      { name: 'Uber/99', icon: 'CarFront' },
      { name: 'Estacionamento', icon: 'SquareParking' },
      { name: 'Manutenção', icon: 'Wrench' },
      { name: 'Pedágio', icon: 'Milestone' },
    ],
  },
  {
    name: 'Alimentação',
    kind: 'expense',
    icon: 'UtensilsCrossed',
    color: '#E53E3E',
    subs: [
      { name: 'Mercado', icon: 'ShoppingBasket' },
      { name: 'Restaurante', icon: 'ChefHat' },
      { name: 'Delivery', icon: 'Bike' },
      { name: 'Lanche', icon: 'Sandwich' },
    ],
  },
  {
    name: 'Saúde',
    kind: 'expense',
    icon: 'HeartPulse',
    color: '#D53F8C',
    subs: [
      { name: 'Farmácia', icon: 'Pill' },
      { name: 'Consulta', icon: 'Stethoscope' },
      { name: 'Exames', icon: 'ClipboardList' },
      { name: 'Plano de Saúde', icon: 'ShieldPlus' },
    ],
  },
  {
    name: 'Educação',
    kind: 'expense',
    icon: 'GraduationCap',
    color: '#805AD5',
    subs: [
      { name: 'Mensalidade', icon: 'Receipt' },
      { name: 'Curso', icon: 'BookOpen' },
      { name: 'Livros', icon: 'Library' },
    ],
  },
  {
    name: 'Lazer',
    kind: 'expense',
    icon: 'Clapperboard',
    color: '#38B2AC',
    subs: [
      { name: 'Streaming', icon: 'Tv' },
      { name: 'Viagem', icon: 'Plane' },
      { name: 'Bar', icon: 'Martini' },
      { name: 'Cinema', icon: 'Popcorn' },
    ],
  },
  {
    name: 'Compras',
    kind: 'expense',
    icon: 'ShoppingBag',
    color: '#B7791F',
    subs: [
      { name: 'Roupas', icon: 'Shirt' },
      { name: 'Eletrônicos', icon: 'Smartphone' },
      { name: 'Casa', icon: 'Sofa' },
    ],
  },
  {
    name: 'Financeiro',
    kind: 'expense',
    icon: 'Landmark',
    color: '#4A5568',
    subs: [
      { name: 'Taxas', icon: 'Percent' },
      { name: 'Juros', icon: 'TrendingDown' },
      { name: 'Investimentos', icon: 'TrendingUp' },
    ],
  },
  {
    name: 'Renda',
    kind: 'income',
    icon: 'Wallet',
    color: '#0E8C5A',
    subs: [
      { name: 'Salário', icon: 'Banknote' },
      { name: 'Freelance', icon: 'Laptop' },
      { name: 'Reembolso', icon: 'RotateCcw' },
      { name: 'Outros', icon: 'Coins' },
    ],
  },
  {
    name: 'Pets',
    kind: 'expense',
    icon: 'PawPrint',
    color: '#EC7000',
    subs: [
      { name: 'Ração', icon: 'Bone' },
      { name: 'Veterinário', icon: 'Syringe' },
      { name: 'Petshop', icon: 'Scissors' },
    ],
  },
  {
    name: 'Família',
    kind: 'expense',
    icon: 'Users',
    color: '#3182CE',
    subs: [
      { name: 'Filhos', icon: 'Baby' },
      { name: 'Mesada', icon: 'HandCoins' },
      { name: 'Cuidados', icon: 'HeartHandshake' },
    ],
  },
  {
    name: 'Presentes/Doações',
    kind: 'expense',
    icon: 'Gift',
    color: '#C8483B',
    subs: [
      { name: 'Presentes', icon: 'Gift' },
      { name: 'Doações', icon: 'HandHeart' },
      { name: 'Caridade', icon: 'Sparkles' },
    ],
  },
];
