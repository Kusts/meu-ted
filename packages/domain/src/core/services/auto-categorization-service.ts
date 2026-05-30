import type { ICategorizationRuleRepository } from '../repositories/categorization-rule-repository.js';
import type { CategoryService } from './category-service.js';
import type { MatcherType } from '../entities/categorization-rule.js';

// ─────────────────────────────────────────────────────────────────────────────
// AutoCategorizationService
// Automatically categorizes transactions based on rules
// ─────────────────────────────────────────────────────────────────────────────

export class AutoCategorizationService {
  constructor(private deps: {
    ruleRepository: ICategorizationRuleRepository;
    categoryService: CategoryService;
  }) {}

  /**
   * Categorize a transaction based on rules
   * Returns categoryId if a rule matches, null otherwise
   */
  async categorize(
    householdId: string,
    description: string,
    merchantName?: string
  ): Promise<string | null> {
    const rules = await this.deps.ruleRepository.findActiveByHouseholdId(householdId);
    
    if (rules.length === 0) {
      return null;
    }

    const textToMatch = [description, merchantName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    for (const rule of rules) {
      if (this.matches(rule.matcher, rule.matcherType || 'text', textToMatch)) {
        return rule.categoryId;
      }
    }

    return null;
  }

  /**
   * Check if pattern matches text
   */
  private matches(pattern: string, type: MatcherType, text: string): boolean {
    switch (type) {
      case 'text':
        return text.includes(pattern.toLowerCase());
      
      case 'glob': {
        // Simple glob: * for any chars, ? for single char
        const regex = new RegExp(
          '^' + pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.') + '$',
          'i'
        );
        return regex.test(text);
      }
      
      case 'regex':
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(text);
        } catch {
          return false;
        }
      
      default:
        return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Rules Factory
// Creates standard categorization rules for a new household
// ─────────────────────────────────────────────────────────────────────────────

export interface DefaultRuleTemplate {
  matcher: string;
  matcherType?: MatcherType;
  categoryName: string;
  kind: 'income' | 'expense';
  priority?: number;
}

const DEFAULT_RULES: DefaultRuleTemplate[] = [
  // Alimentação
  { matcher: 'mercado', categoryName: 'Alimentação > Mercado', kind: 'expense', priority: 10 },
  { matcher: 'supermercado', categoryName: 'Alimentação > Mercado', kind: 'expense', priority: 10 },
  { matcher: 'compras', categoryName: 'Alimentação > Compras', kind: 'expense', priority: 8 },
  { matcher: 'restaurante', categoryName: 'Alimentação > Restaurante', kind: 'expense', priority: 10 },
  { matcher: 'lanche', categoryName: 'Alimentação > Lanches', kind: 'expense', priority: 9 },
  { matcher: 'ifood', categoryName: 'Alimentação > Delivery', kind: 'expense', priority: 10 },
  { matcher: 'rappi', categoryName: 'Alimentação > Delivery', kind: 'expense', priority: 10 },

  // Moradia
  { matcher: 'aluguel', categoryName: 'Moradia > Aluguel', kind: 'expense', priority: 10 },
  { matcher: 'energia', categoryName: 'Moradia > Energia', kind: 'expense', priority: 10 },
  { matcher: 'luz', categoryName: 'Moradia > Energia', kind: 'expense', priority: 10 },
  { matcher: 'saneamento', categoryName: 'Moradia > Água', kind: 'expense', priority: 10 },
  { matcher: 'gás', categoryName: 'Moradia > Gás', kind: 'expense', priority: 10 },
  { matcher: 'internet', categoryName: 'Moradia > Internet', kind: 'expense', priority: 10 },
  { matcher: 'vivo', categoryName: 'Moradia > Telefone', kind: 'expense', priority: 10 },
  { matcher: 'claro', categoryName: 'Moradia > Telefone', kind: 'expense', priority: 10 },
  { matcher: 'tv a cabo', categoryName: 'Moradia > TV', kind: 'expense', priority: 10 },

  // Transporte
  { matcher: 'uber', categoryName: 'Transporte > App', kind: 'expense', priority: 10 },
  { matcher: '99 pop', categoryName: 'Transporte > App', kind: 'expense', priority: 10 },
  { matcher: '99', categoryName: 'Transporte > App', kind: 'expense', priority: 9 },
  { matcher: 'gasolina', categoryName: 'Transporte > Combustível', kind: 'expense', priority: 10 },
  { matcher: 'posto', categoryName: 'Transporte > Combustível', kind: 'expense', priority: 10 },
  { matcher: 'estacionamento', categoryName: 'Transporte > Estacionamento', kind: 'expense', priority: 10 },
  { matcher: 'metrô', categoryName: 'Transporte > Público', kind: 'expense', priority: 10 },
  { matcher: 'ônibus', categoryName: 'Transporte > Público', kind: 'expense', priority: 10 },

  // Saúde
  { matcher: 'academia', categoryName: 'Saúde > Academia', kind: 'expense', priority: 10 },
  { matcher: 'farmácia', categoryName: 'Saúde > Farmácia', kind: 'expense', priority: 10 },
  { matcher: 'médico', categoryName: 'Saúde > Médico', kind: 'expense', priority: 10 },
  { matcher: 'dentista', categoryName: 'Saúde > Dentista', kind: 'expense', priority: 10 },
  { matcher: 'hospital', categoryName: 'Saúde > Hospital', kind: 'expense', priority: 10 },

  // Lazer
  { matcher: 'cinema', categoryName: 'Lazer > Cinema', kind: 'expense', priority: 10 },
  { matcher: 'netflix', categoryName: 'Lazer > Streaming', kind: 'expense', priority: 10 },
  { matcher: 'spotify', categoryName: 'Lazer > Streaming', kind: 'expense', priority: 10 },
  { matcher: 'steam', categoryName: 'Lazer > Jogos', kind: 'expense', priority: 10 },

  // Educação
  { matcher: 'curso', categoryName: 'Educação > Cursos', kind: 'expense', priority: 10 },
  { matcher: 'escola', categoryName: 'Educação > Escola', kind: 'expense', priority: 10 },
  { matcher: 'livro', categoryName: 'Educação > Livros', kind: 'expense', priority: 10 },

  // Receitas
  { matcher: 'salário', categoryName: 'Receita > Salário', kind: 'income', priority: 10 },
  { matcher: 'salario', categoryName: 'Receita > Salário', kind: 'income', priority: 10 },
  { matcher: 'pix recebido', categoryName: 'Receita > Pix', kind: 'income', priority: 8 },
  { matcher: 'transferência recebida', categoryName: 'Receita > Transferência', kind: 'income', priority: 8 },
  { matcher: 'rendimento', categoryName: 'Receita > Rendimento', kind: 'income', priority: 10 },
  { matcher: 'freelance', categoryName: 'Receita > Freelance', kind: 'income', priority: 10 },
];

/**
 * Seed default categorization rules for a household
 * Creates categories as needed, then creates rules
 */
export async function seedDefaultRules(
  ruleRepo: ICategorizationRuleRepository,
  categoryService: CategoryService,
  householdId: string
): Promise<number> {
  let created = 0;

  for (const template of DEFAULT_RULES) {
    // Find or create category
    const { category } = await categoryService.findOrCreateCategory({
      householdId,
      name: template.categoryName,
      kind: template.kind,
    });

    // Create rule
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: template.matcher,
      matcherType: template.matcherType || 'text',
      categoryId: category.id,
      priority: template.priority || 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    created++;
  }

  return created;
}