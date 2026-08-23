/**
 * categorizer â€” Auto-categorization for transactions
 *
 * Detects the macro and subcategory from a free-form description.
 * Creates new categories if they don't exist.
 */

import type { Pool } from "pg";

export type CategoryKind = "expense" | "income";

export interface CategoryMatch {
  macro: string;
  subcategory: string | null;
  fullName: string; // e.g. "AlimentaÃ§Ã£o > Lanche"
  kind: CategoryKind;
  confidence: number; // 0-1
  matchedKeyword: string;
}

/**
 * Hierarchical category rules.
 * Order matters: more specific patterns come first.
 */
const CATEGORY_RULES: Array<{
  macro: string;
  subcategory: string | null;
  keywords: string[];
  kind: CategoryKind;
}> = [
  // ALIMENTAÃ‡ÃƒO
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "iFood",
    keywords: ["ifood", "i food"],
    kind: "expense",
  },
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "Restaurante",
    keywords: ["restaurante", "almoÃ§o executivo", "jantar", "almoÃ§o", "almoco", "comida japonesa", "pizza", "hambÃºrguer", "hamburguer", "sushi", "churrasco", "churrascaria", "comida", "refeiÃ§Ã£o", "refeicao"],
    kind: "expense",
  },
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "Lanche",
    keywords: ["lanche", "snack", "petisco", "salgadinho", "miojo"],
    kind: "expense",
  },
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "CafÃ©",
    keywords: ["cafÃ©", "cafe", "cafÃ© da manhÃ£", "cafÃ© da tarde", "expresso", "cappuccino", "starbucks"],
    kind: "expense",
  },
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "Padaria",
    keywords: ["padaria", "pÃ£o", "pao", "pÃ£o francÃªs", "sonho", "croissant"],
    kind: "expense",
  },
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "Mercado",
    keywords: ["mercado", "supermercado", "feira", "hortifruti", "compras da semana", "compras do mÃªs", "compras do mes"],
    kind: "expense",
  },
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "Delivery",
    keywords: ["delivery", "entrega", "uber eats", "rappi", "loggi"],
    kind: "expense",
  },
  {
    macro: "AlimentaÃ§Ã£o",
    subcategory: "Bebida",
    keywords: ["cerveja", "vinho", "refrigerante", "suco", "Ã¡gua", "agua", "drink", "bar"],
    kind: "expense",
  },

  // TRANSPORTE
  {
    macro: "Transporte",
    subcategory: "Uber",
    keywords: ["uber", "99", "99app", "99 pop"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "TÃ¡xi",
    keywords: ["tÃ¡xi", "taxi"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Gasolina",
    keywords: ["gasolina", "combustÃ­vel", "combustivel", "posto", "etanol", "diesel"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Estacionamento",
    keywords: ["estacionamento", "parking", "estapar", "zona azul"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Ã”nibus",
    keywords: ["Ã´nibus", "onibus", "metro", "metrÃ´", "bilhete Ãºnico", "bilhete unico"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "PedÃ¡gio",
    keywords: ["pedÃ¡gio", "pedagio"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "ManutenÃ§Ã£o",
    keywords: ["oficina", "mecÃ¢nico", "mecanico", "troca de Ã³leo", "troca de oleo", "revisÃ£o", "revisao", "pneu", "alinhamento"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Aluguel de Carro",
    keywords: ["aluguel de carro", "locaÃ§Ã£o de carro", "locacao de carro", "rent a car"],
    kind: "expense",
  },

  // SAÃšDE
  {
    macro: "SaÃºde",
    subcategory: "FarmÃ¡cia",
    keywords: ["remÃ©dio", "remedio", "medicamento", "farmÃ¡cia", "farmacia", "drogaria", "droga", "paracetamol", "dipirona", "ibuprofeno"],
    kind: "expense",
  },
  {
    macro: "SaÃºde",
    subcategory: "Consulta",
    keywords: ["consulta", "mÃ©dico", "medico", "doutor", "doutora", "clÃ­nica", "clinica", "psicÃ³logo", "psicologo", "psicÃ³loga", "psicologa", "terapia", "dentista", "oftalmologista"],
    kind: "expense",
  },
  {
    macro: "SaÃºde",
    subcategory: "Exames",
    keywords: ["exame", "exames", "laboratÃ³rio", "laboratorio", "raio-x", "sangue", "urina", "hemograma"],
    kind: "expense",
  },
  {
    macro: "SaÃºde",
    subcategory: "Plano de SaÃºde",
    keywords: ["plano de saÃºde", "plano de saude", "unimed", "amil", "bradesco saÃºde", "bradesco saude", "amil"],
    kind: "expense",
  },
  {
    macro: "SaÃºde",
    subcategory: "Academia",
    keywords: ["academia", "gym", "smart fit", "smartfit", "musculaÃ§Ã£o", "musculacao", "crossfit"],
    kind: "expense",
  },

  // MORADIA
  {
    macro: "Moradia",
    subcategory: "Aluguel",
    keywords: ["aluguel", "rent"],
    kind: "expense",
  },
  {
    macro: "Moradia",
    subcategory: "CondomÃ­nio",
    keywords: ["condomÃ­nio", "condominio", "condo"],
    kind: "expense",
  },
  {
    macro: "Moradia",
    subcategory: "Ãgua",
    keywords: ["Ã¡gua", "agua", "conta de Ã¡gua", "conta de agua", "sabesp"],
    kind: "expense",
  },
  {
    macro: "Moradia",
    subcategory: "Luz",
    keywords: ["luz", "conta de luz", "energia", "enel", "eletropaulo", "cpfl"],
    kind: "expense",
  },
  {
    macro: "Moradia",
    subcategory: "Internet",
    keywords: ["internet", "wifi", "banda larga", "vivo fibra", "claro net", "oi fibra"],
    kind: "expense",
  },
  {
    macro: "Moradia",
    subcategory: "GÃ¡s",
    keywords: ["gÃ¡s", "gas", "botijÃ£o", "botijao", "comgÃ¡s", "comgas"],
    kind: "expense",
  },
  {
    macro: "Moradia",
    subcategory: "IPTU",
    keywords: ["iptu", "imposto predial"],
    kind: "expense",
  },

  // LAZER
  {
    macro: "Lazer",
    subcategory: "Cinema",
    keywords: ["cinema", "ingresso", "filme", "imax"],
    kind: "expense",
  },
  {
    macro: "Lazer",
    subcategory: "Streaming",
    keywords: ["netflix", "spotify", "amazon prime", "disney", "hbo", "paramount", "apple tv", "youtube premium", "deezer", "globoplay"],
    kind: "expense",
  },
  {
    macro: "Lazer",
    subcategory: "Jogos",
    keywords: ["jogo", "game", "psn", "playstation", "xbox", "nintendo", "steam", "epic games"],
    kind: "expense",
  },
  {
    macro: "Lazer",
    subcategory: "Bar",
    keywords: ["bar", "boteco", "pub", "cervejaria", "happy hour"],
    kind: "expense",
  },
  {
    macro: "Lazer",
    subcategory: "Balada",
    keywords: ["balada", "festa", "clube", "boate", "show", "concert"],
    kind: "expense",
  },
  {
    macro: "Lazer",
    subcategory: "Viagem",
    keywords: ["viagem", "passagem aÃ©rea", "hotel", "pousada", "airbnb", "booking"],
    kind: "expense",
  },

  // EDUCAÃ‡ÃƒO
  {
    macro: "EducaÃ§Ã£o",
    subcategory: "Curso",
    keywords: ["curso", "alura", "udemy", "coursera", "rocketseat", "origamid", "treinamento", "workshop"],
    kind: "expense",
  },
  {
    macro: "EducaÃ§Ã£o",
    subcategory: "Livro",
    keywords: ["livro", "kindle", "amazon books", "saraiva", "cultura"],
    kind: "expense",
  },
  {
    macro: "EducaÃ§Ã£o",
    subcategory: "Material",
    keywords: ["material escolar", "caderno", "caneta", "mochila"],
    kind: "expense",
  },
  {
    macro: "EducaÃ§Ã£o",
    subcategory: "Mensalidade",
    keywords: ["mensalidade", "faculdade", "universidade", "escola", "colÃ©gio", "colegio"],
    kind: "expense",
  },

  // COMPRAS
  {
    macro: "Compras",
    subcategory: "Roupa",
    keywords: ["roupa", "camisa", "calÃ§a", "calca", "sapato", "tÃªnis", "tenis", "vestido", "jeans", "renner", "c&a", "riachuelo", "zara"],
    kind: "expense",
  },
  {
    macro: "Compras",
    subcategory: "EletrÃ´nico",
    keywords: ["celular", "smartphone", "iphone", "samsung", "xiaomi", "notebook", "computador", "tv", "smart tv", "fone", "headphone", "airpods", "tablet", "console"],
    kind: "expense",
  },
  {
    macro: "Compras",
    subcategory: "DecoraÃ§Ã£o",
    keywords: ["decoraÃ§Ã£o", "decoracao", "mÃ³vel", "movel", "mÃ³veis", "moveis", "ikea", "tok stok"],
    kind: "expense",
  },
  {
    macro: "Compras",
    subcategory: "Supermercado Online",
    keywords: ["amazon", "mercado livre", "magalu", "americanas", "shopee", "aliexpress", "shein"],
    kind: "expense",
  },

  // SERVIÃ‡OS
  {
    macro: "ServiÃ§os",
    subcategory: "Assinatura",
    keywords: ["assinatura", "subscription", "mensal"],
    kind: "expense",
  },
  {
    macro: "ServiÃ§os",
    subcategory: "Streaming",
    keywords: ["apple music", "youtube music"],
    kind: "expense",
  },

  // PETS
  {
    macro: "Pets",
    subcategory: "RaÃ§Ã£o",
    keywords: ["raÃ§Ã£o", "racao", "petisco pet", "petisco para cachorro"],
    kind: "expense",
  },
  {
    macro: "Pets",
    subcategory: "VeterinÃ¡rio",
    keywords: ["veterinÃ¡rio", "veterinario", "vet", "vacina pet", "castraÃ§Ã£o"],
    kind: "expense",
  },

  // TRABALHO
  {
    macro: "Trabalho",
    subcategory: "Material de EscritÃ³rio",
    keywords: ["material de escritÃ³rio", "caneta", "papel", "grampeador"],
    kind: "expense",
  },

  // === INCOMES ===
  {
    macro: "SalÃ¡rio",
    subcategory: "Mensal",
    keywords: ["salÃ¡rio", "salario", "pagamento mensal", "holerite", "contracheque"],
    kind: "income",
  },
  {
    macro: "SalÃ¡rio",
    subcategory: "BÃ´nus",
    keywords: ["bÃ´nus", "bonus", "prÃªmio", "premio", "plr", "participaÃ§Ã£o nos lucros", "bonus de vendas"],
    kind: "income",
  },
  {
    macro: "SalÃ¡rio",
    subcategory: "13Âº",
    keywords: ["13Âº", "decimo terceiro", "dÃ©cimo terceiro", "13 salario"],
    kind: "income",
  },
  {
    macro: "SalÃ¡rio",
    subcategory: "FÃ©rias",
    keywords: ["fÃ©rias", "ferias"],
    kind: "income",
  },

  {
    macro: "Freelance",
    subcategory: "Projeto",
    keywords: ["freela", "freelance", "projeto", "job", "trampo"],
    kind: "income",
  },
  {
    macro: "Freelance",
    subcategory: "Consultoria",
    keywords: ["consultoria", "assessoria", "mentoria"],
    kind: "income",
  },

  {
    macro: "Investimento",
    subcategory: "Dividendos",
    keywords: ["dividendo", "dividendos", "jcp", "jcp's", "juros sobre capital prÃ³prio"],
    kind: "income",
  },
  {
    macro: "Investimento",
    subcategory: "Rendimento",
    keywords: ["rendimento", "yield", "rendimento cdb", "tesouro direto", "renda fixa", "lci", "lca"],
    kind: "income",
  },
  {
    macro: "Investimento",
    subcategory: "Venda de AÃ§Ã£o",
    keywords: ["venda de aÃ§Ã£o", "venda de acao", "lucro na venda", "ganho de capital"],
    kind: "income",
  },

  {
    macro: "Vendas",
    subcategory: "Produto",
    keywords: ["vendi", "venda de produto", "venda online"],
    kind: "income",
  },
  {
    macro: "Vendas",
    subcategory: "Pessoal",
    keywords: ["vendi pessoal", "venda pessoal"],
    kind: "income",
  },

  // === TRANSFERÃŠNCIAS (entrada/saÃ­da) ===
  {
    macro: "TransferÃªncia",
    subcategory: "PIX",
    keywords: ["pix", "pix para", "pix recebido"],
    kind: "expense",
  },
  {
    macro: "TransferÃªncia",
    subcategory: "PIX Recebido",
    keywords: ["pix recebido", "recebi pix", "caiu pix"],
    kind: "income",
  },
  {
    macro: "TransferÃªncia",
    subcategory: "TED",
    keywords: ["ted para", "ted enviado"],
    kind: "expense",
  },
  {
    macro: "TransferÃªncia",
    subcategory: "TED Recebido",
    keywords: ["ted recebido", "recebi ted"],
    kind: "income",
  },
];

/**
 * Normalize text for matching.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

/**
 * Match a description against the category rules.
 * Returns the FIRST match (priority by rule order) or null.
 * Rule order matters: more specific patterns must come first.
 */
export function matchCategory(
  description: string,
  kind: CategoryKind = "expense"
): CategoryMatch | null {
  const norm = normalizeText(description);

  for (const rule of CATEGORY_RULES) {
    if (rule.kind !== kind) continue;
    for (const keyword of rule.keywords) {
      if (norm.includes(normalizeText(keyword))) {
        const confidence = calculateConfidence(keyword, norm);
        return {
          macro: rule.macro,
          subcategory: rule.subcategory,
          fullName: rule.subcategory
            ? `${rule.macro} > ${rule.subcategory}`
            : rule.macro,
          kind: rule.kind,
          confidence,
          matchedKeyword: keyword,
        };
      }
    }
  }

  return null;
}

/**
 * Calculate confidence score (0-1) based on keyword specificity.
 * Longer keywords = more specific = higher confidence.
 */
function calculateConfidence(keyword: string, text: string): number {
  const kw = normalizeText(keyword);
  const normText = normalizeText(text);
  // Base confidence from keyword length
  const lengthScore = Math.min(kw.length / 20, 1); // max at 20 chars
  // Bonus for word boundary match
  const wordBoundary = new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`).test(normText);
  return Math.min(0.5 + lengthScore * 0.4 + (wordBoundary ? 0.1 : 0), 1);
}

/**
 * Find or create a category in the database.
 * Returns the category ID.
 */
export async function findOrCreateCategory(
  pool: Pool,
  householdId: string,
  categoryName: string,
  kind: CategoryKind
): Promise<string> {
  // First, look up using name_normalized (the trigger handles UNACCENT + LOWER)
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE household_id = $1
       AND name_normalized = LOWER(UNACCENT($2))
       AND kind = $3
       AND deleted_at IS NULL
     LIMIT 1`,
    [householdId, categoryName, kind]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create new category
  const result = await pool.query<{ id: string }>(
    `INSERT INTO categories (id, household_id, name, name_normalized, kind, active, created_at)
     VALUES (gen_random_uuid(), $1, $2, LOWER(UNACCENT($2)), $3, true, NOW())
     RETURNING id`,
    [householdId, categoryName, kind]
  );

  return result.rows[0].id;
}

/**
 * Find or create with full match.
 * Returns the category ID, or null if no match found.
 */
export async function autoCategorize(
  pool: Pool,
  householdId: string,
  description: string,
  kind: CategoryKind = "expense"
): Promise<{ id: string; match: CategoryMatch } | null> {
  const match = matchCategory(description, kind);
  if (!match) return null;
  const id = await findOrCreateCategory(pool, householdId, match.fullName, kind);
  return { id, match };
}

/**
 * Format a category match for display.
 */
export function formatMatch(match: CategoryMatch): string {
  const conf = Math.round(match.confidence * 100);
  return `${match.fullName} (${conf}% confianÃ§a, matched: "${match.matchedKeyword}")`;
}
