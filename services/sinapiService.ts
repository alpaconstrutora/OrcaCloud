import { SinapiItem } from '../types';
import { supabase } from '../lib/supabase';

export interface SinapiReference {
  referenceDate: string; // 'YYYY-MM-DD' (1º dia da competência) — chave canônica
  label: string;         // 'MM/AAAA' para exibição
  status: string;
}

/**
 * Resolve um valor de referência armazenado (reference_date 'YYYY-MM-DD' ou
 * label legado 'MM/AAAA') para o reference_date canônico. Default = competência
 * mais recente publicada (references[0]).
 */
export function resolveReferenceDate(
  stored: string | undefined | null,
  references: SinapiReference[]
): string | undefined {
  if (references.length === 0) return undefined;
  if (stored) {
    const match = references.find(r => r.referenceDate === stored || r.label === stored);
    if (match) return match.referenceDate;
  }
  return references[0].referenceDate;
}

class SinapiDatabaseService {
  // Mantendo compatibilidade com a interface anterior, mas agora é assíncrono real
  private _databaseSize: number = 0;
  // Só passa a true quando sinapi_references existe (migration de versionamento
  // aplicada). Enquanto false, as buscas NÃO filtram por competência — assim o
  // código é seguro mesmo se publicado antes da migration.
  private _versioningEnabled = false;
  // Cache da competência mais recente publicada (undefined = ainda não resolvido,
  // null = versionamento inativo). Default das buscas que não informam referência.
  private _latestReference: string | null | undefined = undefined;

  constructor() {
    this.refreshCount();
  }

  /**
   * Lista as competências SINAPI publicadas (mais recente primeiro).
   * Fallback para 12/2025 se a tabela de versões ainda não existir.
   */
  public async getReferences(): Promise<SinapiReference[]> {
    try {
      const { data, error } = await supabase
        .from('sinapi_references')
        .select('reference_date, label, status')
        .eq('status', 'published')
        .order('reference_date', { ascending: false });

      if (error) throw error;
      if (data && data.length > 0) {
        this._versioningEnabled = true;
        this._latestReference = data[0].reference_date as string; // ordenado desc → 1ª é a mais recente
        return data.map(r => ({ referenceDate: r.reference_date, label: r.label, status: r.status }));
      }
    } catch (e) {
      this._versioningEnabled = false;
      console.warn('sinapi_references indisponível (migration de versionamento não aplicada?). Usando fallback 12/2025.', e);
    }
    return [{ referenceDate: '2025-12-01', label: '12/2025', status: 'published' }];
  }

  /**
   * reference_date da competência mais recente publicada (cacheado por sessão).
   * null = versionamento inativo (tabela ausente). Usado como default de escopo
   * em todas as consultas por código, evitando misturar competências.
   */
  public async getLatestReferenceDate(): Promise<string | null> {
    if (this._latestReference !== undefined) return this._latestReference;
    try {
      const { data, error } = await supabase
        .from('sinapi_references')
        .select('reference_date')
        .eq('status', 'published')
        .order('reference_date', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        this._versioningEnabled = true;
        this._latestReference = data[0].reference_date as string;
        return this._latestReference;
      }
    } catch {
      // tabela ausente — versionamento inativo
    }
    this._latestReference = null;
    return this._latestReference;
  }

  /**
   * Retorna a quantidade estimada de itens (pode estar desatualizado)
   */
  public get databaseSize(): number {
    return this._databaseSize;
  }

  /**
   * Atualiza a contagem de itens
   */
  public async loadDatabase(): Promise<void> {
    await this.refreshCount();
  }

  private async refreshCount() {
    const { count } = await supabase.from('sinapi_items').select('*', { count: 'exact', head: true });
    if (count !== null) {
      this._databaseSize = count;
    }
  }

  /**
   * Realiza a busca no Supabase
   */
  public async search(
    term: string,
    filters?: {
      code?: string;
      group?: string;
      type?: string;
      nature?: string;
      state?: string;
      chargeType?: string;
      searchScope?: 'description' | 'category' | 'both';
      searchMode?: 'exact' | 'all-words';
      codes?: string[];
      referenceDate?: string;
    }
  ): Promise<SinapiItem[]> {
    const cleanTerm = term.trim();
    // Allow empty term if code, group, or a list of codes is specified
    if (cleanTerm.length < 2 && !filters?.code && !filters?.group && !filters?.nature && !filters?.type && (!filters?.codes || filters.codes.length === 0)) return [];

    // composition (sub-itens JSON) é necessária para a CPU do item selecionado;
    // omiti-la antes deixava as composições "com 0 componentes" (regressão e237386).
    let query = supabase.from('sinapi_items').select('code, description, unit, price, prices, category, nature, type, origin, composition');

    // Escopo de competência: usa a informada ou, na ausência, a mais recente
    // publicada (evita misturar versões quando houver mais de uma competência).
    await this.getLatestReferenceDate();
    const refSearch = filters?.referenceDate ?? this._latestReference ?? undefined;
    if (this._versioningEnabled && refSearch) {
      query = query.eq('reference_date', refSearch);
    }

    // 1. Filtrar por Código (Correspondência Exata ou Início)
    if (filters?.code) {
      query = query.ilike('code', `${filters.code}%`);
    }

    // 2. Filtrar por Grupo/Categoria (SINAPI Classification)
    if (filters?.group) {
      query = query.eq('category', filters.group);
    }

    // 2.1 Filtrar por Natureza (Mão de Obra, Materiais, Equipamentos)
    if (filters?.nature) {
      if (filters.nature === 'Mão de Obra') {
        // No SINAPI, a mão de obra real com encargos está em 'Composição'
        // Insumos puros de mão de obra estão em 'Mão de Obra'
        query = query.in('nature', ['Mão de Obra', 'Composição']);
      } else {
        query = query.eq('nature', filters.nature);
      }
    }

    // 2.1 Filtrar por lista de códigos (Favoritos)
    if (filters?.codes && filters.codes.length > 0) {
      query = query.in('code', filters.codes);
    }

    // 2.1 Filtrar por Tipo (Insumo/Composição/Serviço)
    if (filters?.type) {
      if (filters.type === 'SERVICE') {
        // Para o usuário, Serviços e Composições são buscas similares
        query = query.in('type', ['SERVICE', 'COMPOSITION']);
      } else {
        query = query.eq('type', filters.type);
      }
    }

    // 3. Busca Textual (se houver termo)
    if (cleanTerm.length >= 2) {
      const scope = filters?.searchScope || 'both';
      const mode = filters?.searchMode || 'exact';

      if (mode === 'all-words') {
        // Words with commas (e.g. "12,7") break PostgREST's or() parser — skip them
        const words = cleanTerm.split(/\s+/).filter(w => w.length >= 2 && !w.includes(','));
        if (words.length > 0) {
          words.forEach(word => {
            if (scope === 'description') {
              query = query.ilike('description', `%${word}%`);
            } else if (scope === 'category') {
              query = query.ilike('category', `%${word}%`);
            } else {
              query = query.or(`description.ilike.%${word}%,code.ilike.%${word}%,category.ilike.%${word}%`);
            }
          });
        }
      } else {
        // Frase Exata (ilike padrão)
        if (scope === 'description') {
          query = query.ilike('description', `%${cleanTerm}%`);
        } else if (scope === 'category') {
          query = query.ilike('category', `%${cleanTerm}%`);
        } else {
          query = query.or(`description.ilike.%${cleanTerm}%,code.ilike.%${cleanTerm}%,category.ilike.%${cleanTerm}%`);
        }
      }
    }

    const { data, error } = await query.limit(500);

    if (error) {
      console.error("Supabase Search Error:", error);
      return [];
    }

    let results = this.mapToTypes(data || [], filters?.state, filters?.chargeType);

    // 4. Verificar Overrides na Base Própria (Custom Items)
    // Se o usuário salvou uma versão modificada de um item SINAPI, devemos mostrar ESSA versão.
    try {
      const codes = results.map(r => r.code);
      if (codes.length > 0) {
        const { data: overrides } = await supabase
          .from('custom_items')
          .select('code, description, unit, price, type, category, composition, database_id')
          .in('code', codes);

        if (overrides && overrides.length > 0) {
          // Cria um mapa para acesso rápido
          const overrideMap = new Map(overrides.map(o => [o.code, o]));

          // Substitui os itens oficiais pelos overrides
          results = results.map(item => {
            if (overrideMap.has(item.code)) {
              const override = overrideMap.get(item.code)!;
              // Retornamos o item original misturado com o override
              // O override tem prioridade em preço, descrição, composição, etc.
              return {
                ...item,
                ...override,
                // Garantimos que a composition seja parseada corretamente se vier do custom (string -> json)
                composition: typeof override.composition === 'string'
                  ? JSON.parse(override.composition)
                  : override.composition,
                isOverride: true // Flag útil para UI saber que é modificado
              };
            }
            return item;
          });
        }
      }
    } catch (err) {
      console.error("Error fetching overrides:", err);
      // Falha silenciosa: retorna os dados oficiais se der erro no override
    }

    return results;
  }

  /**
   * Busca múltiplos itens por código (para resolver composições auxiliares)
   */
  public async getItemsByCodes(codes: string[], state?: string, chargeType?: string, referenceDate?: string): Promise<SinapiItem[]> {
    if (!codes || codes.length === 0) return [];

    // Unique codes only
    const uniqueCodes = Array.from(new Set(codes));
    // Colunas reais de sinapi_items (verificado via REST): id/database_id/created_at/updated_at
    // NÃO existem — pedi-las fazia o PostgREST abortar com 42703 e a query retornar [],
    // zerando auxiliaryItems (Natureza "—", drill-down e fallback de preço quebrados na CPU).
    let query = supabase
      .from('sinapi_items')
      .select('code, description, unit, price, prices, category, nature, type, origin, source, composition')
      .in('code', uniqueCodes);

    // Resolve as composições filhas DENTRO de uma única competência (a informada
    // ou a mais recente publicada) — evita misturar preços de versões diferentes.
    await this.getLatestReferenceDate();
    const refByCodes = referenceDate ?? this._latestReference ?? undefined;
    if (this._versioningEnabled && refByCodes) {
      query = query.eq('reference_date', refByCodes);
    }

    // Se houver múltiplas linhas para o mesmo código, prioriza preço não-zero.
    const { data, error } = await query.order('price', { ascending: false });

    if (error) {
      console.error("Error fetching items by codes:", error);
      return [];
    }

    return this.mapToTypes(data || [], state, chargeType);
  }

  /**
   * Obtém lista de categorias/grupos disponíveis
   */
  public async getCategories(referenceDate?: string): Promise<string[]> {
    const allCategories = new Set<string>();

    try {
      // Tenta buscar via RPC primeiro (muito mais rápido e não sofre com limites de max_rows da API)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_distinct_categories').limit(1000);

      if (!rpcError && rpcData && rpcData.length > 0) {
        rpcData.forEach((row: any) => {
          if (row.category) allCategories.add(row.category);
        });
      } else {
        // Fallback para o método antigo caso a RPC não exista (ainda não foi executada a migration)
        console.warn("RPC get_distinct_categories falhou ou não existe, caindo para fallback via SELECT. Execute a migration SQL no Supabase para corrigir os grupos ausentes.");
        let sinapiQuery = supabase.from('sinapi_items').select('category').not('category', 'is', null).neq('category', '').limit(100000);
        if (this._versioningEnabled && referenceDate) {
          sinapiQuery = sinapiQuery.eq('reference_date', referenceDate);
        }
        const [{ data: sinapiData }, { data: customData }] = await Promise.all([
          sinapiQuery,
          supabase.from('custom_items').select('category').not('category', 'is', null).neq('category', '').limit(10000),
        ]);

        (sinapiData || []).forEach(d => allCategories.add(d.category!));
        (customData || []).forEach(d => allCategories.add(d.category));
      }
    } catch (error) {
      console.error("Critical error fetching categories:", error);
    }

    return Array.from(allCategories).sort();
  }

  private mapToTypes(data: any[], state?: string, chargeType?: string): SinapiItem[] {
    return data.map(item => {
      // Lógica de Preço Matricial
      // Se houver colunas específicas no retorno (ex: price_sp_com_desoneracao), usamos elas.
      // Caso contrário, usamos o padrão 'price'.
      // Esta lógica depende da estrutura exata do banco.
      // Assumindo convenção: price_<uf>_<tipo> (ex: price_sp_com, price_mg_sem)

      const getMappedPrice = (prices: any, state?: string, type?: string) => {
        if (!prices || !state || !type) return 0;
        let typeKey = 'sem';
        const ct = type.toUpperCase();
        if (ct.includes('COM')) typeKey = 'com';
        else if (ct.includes('SEM') && ct.includes('ENCARGOS')) typeKey = 'sem_encargos';
        else if (ct.includes('SEM')) typeKey = 'sem';

        const stateKey = state.toUpperCase();
        return prices[stateKey]?.[typeKey] !== undefined ? Number(prices[stateKey][typeKey]) : 0;
      };

      let finalPrice = item.price;
      if (state && chargeType && item.prices) {
        finalPrice = getMappedPrice(item.prices, state, chargeType) || item.price;
      } else if (state && chargeType) {
        // Normalize chargeType for column suffix
        let suffix = 'sem';
        const ct = chargeType.toUpperCase();
        if (ct.includes('COM')) suffix = 'com';

        const key = `price_${state.toLowerCase()}_${suffix}`;
        if (item[key] !== undefined && item[key] !== null) {
          finalPrice = Number(item[key]);
        }
      }

      // Process children prices recursively
      let composition = item.composition;
      if (typeof item.composition === 'string' && item.composition.trim()) {
        try {
          composition = JSON.parse(item.composition);
        } catch (e) {
          composition = [];
        }
      }

      const mappedComposition = Array.isArray(composition)
        ? composition.map((comp: any) => ({
          ...comp,
          price: comp.prices ? getMappedPrice(comp.prices, state, chargeType) : (comp.price || 0),
        }))
        : undefined;

      return {
        ...item,
        price: finalPrice,
        nature: item.nature,
        composition: mappedComposition,
        source: item.source || 'SINAPI'
      };
    });
  }
}

export const sinapiService = new SinapiDatabaseService();