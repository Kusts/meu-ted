/**
 * categorizer — Auto-categorization for transactions
 *
 * Detects the macro and subcategory from a free-form description.
 * Creates new categories if they don't exist.
 */

import type { Pool } from "pg";

export type CategoryKind = "expense" | "income";

export interface CategoryMatch {
  macro: string;
  subcategory: string | null;
  fullName: string; // e.g. "Alimentação > Lanche"
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
  // ALIMENTAÇÃO
  {
    macro: "Alimentação",
    subcategory: "iFood",
    keywords: ["ifood", "i food"],
    kind: "expense",
  },
  {
    macro: "Alimentação",
    subcategory: "Restaurante",
    keywords: ["restaurante", "almoço executivo", "jantar", "almoço", "almoco", "comida japonesa", "pizza", "hambúrguer", "hamburguer", "sushi", "churrasco", "churrascaria", "comida", "refeição", "refeicao"],
    kind: "expense",
  },
  {
    macro: "Alimentação",
    subcategory: "Lanche",
    keywords: ["lanche", "snack", "petisco", "salgadinho", "miojo"],
    kind: "expense",
  },
  {
    macro: "Alimentação",
    subcategory: "Café",
    keywords: ["café", "cafe", "café da manhã", "café da tarde", "expresso", "cappuccino", "starbucks"],
    kind: "expense",
  },
  {
    macro: "Alimentação",
    subcategory: "Padaria",
    keywords: ["padaria", "pão", "pao", "pão francês", "sonho", "croissant"],
    kind: "expense",
  },
  {
    macro: "Alimentação",
    subcategory: "Mercado",
    keywords: ["mercado", "supermercado", "feira", "hortifruti", "compras da semana", "compras do mês", "compras do mes"],
    kind: "expense",
  },
  {
    macro: "Alimentação",
    subcategory: "Delivery",
    keywords: ["delivery", "entrega", "uber eats", "rappi", "loggi"],
    kind: "expense",
  },
  {
    macro: "Alimentação",
    subcategory: "Bebida",
    keywords: ["cerveja", "vinho", "refrigerante", "suco", "água", "agua", "drink", "bar"],
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
    subcategory: "Táxi",
    keywords: ["táxi", "taxi"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Gasolina",
    keywords: ["gasolina", "combustível", "combustivel", "posto", "etanol", "diesel"],
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
    subcategory: "Ônibus",
    keywords: ["ônibus", "onibus", "metro", "metrô", "bilhete único", "bilhete unico"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Pedágio",
    keywords: ["pedágio", "pedagio"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Manutenção",
    keywords: ["oficina", "mecânico", "mecanico", "troca de óleo", "troca de oleo", "revisão", "revisao", "pneu", "alinhamento"],
    kind: "expense",
  },
  {
    macro: "Transporte",
    subcategory: "Aluguel de Carro",
    keywords: ["aluguel de carro", "locação de carro", "locacao de carro", "rent a car"],
    kind: "expense",
  },

  // SAÚDE
  {
    macro: "Saúde",
    subcategory: "Farmácia",
    keywords: ["remédio", "remedio", "medicamento", "farmácia", "farmacia", "drogaria", "droga", "paracetamol", "dipirona", "ibuprofeno"],
    kind: "expense",
  },
  {
    macro: "Saúde",
    subcategory: "Consulta",
    keywords: ["consulta", "médico", "medico", "doutor", "doutora", "clínica", "clinica", "psicólogo", "psicologo", "psicóloga", "psicologa", "terapia", "dentista", "oftalmologista"],
    kind: "expense",
  },
  {
    macro: "Saúde",
    subcategory: "Exames",
    keywords: ["exame", "exames", "laboratório", "laboratorio", "raio-x", "sangue", "urina", "hemograma"],
    kind: "expense",
  },
  {
    macro: "Saúde",
    subcategory: "Plano de Saúde",
    keywords: ["plano de saúde", "plano de saude", "unimed", "amil", "bradesco saúde", "bradesco saude", "amil"],
    kind: "expense",
  },
  {
    macro: "Saúde",
    subcategory: "Academia",
    keywords: ["academia", "gym", "smart fit", "smartfit", "musculação", "musculacao", "crossfit"],
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
    subcategory: "Condomínio",
    keywords: ["condomínio", "condominio", "condo"],
    kind: "expense",
  },
  {
    macro: "Moradia",
    subcategory: "Água",
    keywords: ["água", "agua", "conta de água", "conta de agua", "sabesp"],
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
    subcategory: "Gás",
    keywords: ["gás", "gas", "botijão", "botijao", "comgás", "comgas"],
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
    keywords: ["viagem", "passagem aérea", "hotel", "pousada", "airbnb", "booking"],
    kind: "expense",
  },

  // EDUCAÇÃO
  {
    macro: "Educação",
    subcategory: "Curso",
    keywords: ["curso", "alura", "udemy", "coursera", "rocketseat", "origamid", "treinamento", "workshop"],
    kind: "expense",
  },
  {
    macro: "Educação",
    subcategory: "Livro",
    keywords: ["livro", "kindle", "amazon books", "saraiva", "cultura"],
    kind: "expense",
  },
  {
    macro: "Educação",
    subcategory: "Material",
    keywords: ["material escolar", "caderno", "caneta", "mochila"],
    kind: "expense",
  },
  {
    macro: "Educação",
    subcategory: "Mensalidade",
    keywords: ["mensalidade", "faculdade", "universidade", "escola", "colégio", "colegio"],
    kind: "expense",
  },

  // COMPRAS
  {
    macro: "Compras",
    subcategory: "Roupa",
    keywords: ["roupa", "camisa", "calça", "calca", "sapato", "tênis", "tenis", "vestido", "jeans", "renner", "c&a", "riachuelo", "zara"],
    kind: "expense",
  },
  {
    macro: "Compras",
    subcategory: "Eletrônico",
    keywords: ["celular", "smartphone", "iphone", "samsung", "xiaomi", "notebook", "computador", "tv", "smart tv", "fone", "headphone", "airpods", "tablet", "console"],
    kind: "expense",
  },
  {
    macro: "Compras",
    subcategory: "Decoração",
    keywords: ["decoração", "decoracao", "móvel", "movel", "móveis", "moveis", "ikea", "tok stok"],
    kind: "expense",
  },
  {
    macro: "Compras",
    subcategory: "Supermercado Online",
    keywords: ["amazon", "mercado livre", "magalu", "americanas", "shopee", "aliexpress", "shein"],
    kind: "expense",
  },

  // SERVIÇOS
  {
    macro: "Serviços",
    subcategory: "Assinatura",
    keywords: ["assinatura", "subscription", "mensal"],
    kind: "expense",
  },
  {
    macro: "Serviços",
    subcategory: "Streaming",
    keywords: ["apple music", "youtube music"],
    kind: "expense",
  },

  // PETS
  {
    macro: "Pets",
    subcategory: "Ração",
    keywords: ["ração", "racao", "petisco pet", "petisco para cachorro"],
    kind: "expense",
  },
  {
    macro: "Pets",
    subcategory: "Veterinário",
    keywords: ["veterinário", "veterinario", "vet", "vacina pet", "castração"],
    kind: "expense",
  },

  // TRABALHO
  {
    macro: "Trabalho",
    subcategory: "Material de Escritório",
    keywords: ["material de escritório", "caneta", "papel", "grampeador"],
    kind: "expense",
  },

  // === INCOMES ===
  {
    macro: "Salário",
    subcategory: "Mensal",
    keywords: ["salário", "salario", "pagamento mensal", "holerite", "contracheque"],
    kind: "income",
  },
  {
    macro: "Salário",
    subcategory: "Bônus",
    keywords: ["bônus", "bonus", "prêmio", "premio", "plr", "participação nos lucros", "bonus de vendas"],
    kind: "income",
  },
  {
    macro: "Salário",
    subcategory: "13º",
    keywords: ["13º", "decimo terceiro", "décimo terceiro", "13 salario"],
    kind: "income",
  },
  {
    macro: "Salário",
    subcategory: "Férias",
    keywords: ["férias", "ferias"],
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
    keywords: ["dividendo", "dividendos", "jcp", "jcp's", "juros sobre capital próprio"],
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
    subcategory: "Venda de Ação",
    keywords: ["venda de ação", "venda de acao", "lucro na venda", "ganho de capital"],
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

  // === TRANSFERÊNCIAS (entrada/saída) ===
  {
    macro: "Transferência",
    subcategory: "PIX",
    keywords: ["pix", "pix para", "pix recebido"],
    kind: "expense",
  },
  {
    macro: "Transferência",
    subcategory: "PIX Recebido",
    keywords: ["pix recebido", "recebi pix", "caiu pix"],
    kind: "income",
  },
  {
    macro: "Transferência",
    subcategory: "TED",
    keywords: ["ted para", "ted enviado"],
    kind: "expense",
  },
  {
    macro: "Transferência",
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
  const existing = await pool.query<{ rows: { id: string }[] }>(
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
  const result = await pool.query<{ rows: { id: string }[] }>(
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
  return `${match.fullName} (${conf}% confiança, matched: "${match.matchedKeyword}")`;
}
