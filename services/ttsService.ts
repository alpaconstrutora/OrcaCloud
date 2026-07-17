import { supabase } from '../lib/supabase';
import {
  TtsRegimeSettings,
  TtsRegimeSettingsInsert,
  TtsFiscalMovement,
  TtsFiscalMovementInsert,
  TtsApuracaoRow,
  TtsCalculationInput,
  TtsCalculationResult,
  TtsBackfillResult,
  TtsScope,
} from '../types';

// Defaults do TTS-MG. NÃO são a fonte de verdade — só o fallback quando a org
// ainda não configurou tts_regime_settings. As alíquotas reais vivem no banco
// e podem mudar por decreto sem exigir deploy.
export const TTS_DEFAULTS = {
  home_uf: 'MG',
  active: true,
  debit_rate_internal: 0.18,
  debit_rate_interstate: 0.12,
  effective_rate_internal: 0.06,
  effective_rate_interstate: 0.013,
  credit_rate_default: 0.12,
  min_interstate_share: 0.30,
} as const;

type TtsRates = Pick<
  TtsRegimeSettings,
  | 'debit_rate_internal'
  | 'debit_rate_interstate'
  | 'effective_rate_internal'
  | 'effective_rate_interstate'
  | 'credit_rate_default'
  | 'min_interstate_share'
>;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Só dígitos — companies.cnpj pode vir formatado ("00.000.000/0001-00") e o
// XML traz só números; comparar sem normalizar erra o match de filial.
function onlyDigits(s: string | null | undefined): string {
  return (s || '').replace(/\D/g, '');
}

/**
 * Deriva SÓ o escopo de um CFOP (1º dígito). O CFOP impresso na NF-e é sempre
 * do EMITENTE — então ele NÃO diz a direção relativa à nossa empresa (uma nota
 * de compra traz o CFOP de saída do fornecedor). A direção vem do match de
 * CNPJ (emitente=saída, destinatário=entrada). O escopo, sim, é simétrico:
 *   1/5 = interna | 2/6 = interestadual | 3/7 = exterior
 * Retorna null quando o CFOP falta ou não começa por 1/2/3/5/6/7.
 */
export function cfopScope(cfop: string | null | undefined): TtsScope | null {
  switch (onlyDigits(cfop)[0]) {
    case '1':
    case '5': return 'interna';
    case '2':
    case '6': return 'interestadual';
    case '3':
    case '7': return 'exterior';
    default: return null;
  }
}

/**
 * Motor de cálculo do regime TTS-MG (crédito presumido de ICMS).
 *
 * Regime NORMAL: ICMS a recolher = (débito das saídas) − (crédito real das entradas).
 * Regime TTS:    o crédito presumido zera a relevância das entradas, e a carga
 *                vira a alíquota EFETIVA aplicada sobre as saídas. Ou seja, ao
 *                aderir ao TTS a empresa RENUNCIA ao crédito real das compras —
 *                por isso `icms_devido_tts` ignora `entradas_credito_real`.
 *
 * Ponto de equilíbrio (break-even): como o crédito presumido anula as entradas,
 * o TTS só compensa enquanto compras/vendas < (débito − efetivo) / crédito.
 * Retornado para o painel sinalizar quando o regime deixa de valer a pena.
 */
export function calcularTts(input: TtsCalculationInput, rates: TtsRates): TtsCalculationResult {
  const {
    debit_rate_internal,
    debit_rate_interstate,
    effective_rate_internal,
    effective_rate_interstate,
    credit_rate_default,
    min_interstate_share,
  } = rates;

  const totalSaidas = input.saidas_internas + input.saidas_interestaduais;

  // Débito das saídas (regime normal), por escopo
  const debito =
    input.saidas_internas * debit_rate_internal +
    input.saidas_interestaduais * debit_rate_interstate;

  // Crédito real das entradas: usa o informado; senão estima pela alíquota padrão
  const creditoReal =
    input.entradas_credito_real ?? input.entradas_base * credit_rate_default;

  const icmsDevidoNormal = Math.max(debito - creditoReal, 0);

  // Regime TTS: carga efetiva sobre as saídas (crédito real é renunciado)
  const icmsDevidoTts =
    input.saidas_internas * effective_rate_internal +
    input.saidas_interestaduais * effective_rate_interstate;

  const creditoPresumido = Math.max(debito - icmsDevidoTts, 0);
  const economia = icmsDevidoNormal - icmsDevidoTts;

  // Elegibilidade: participação interestadual ≥ meta mínima
  const pctInterestadual = totalSaidas > 0 ? input.saidas_interestaduais / totalSaidas : 0;
  const elegivel = pctInterestadual >= min_interstate_share;

  // Ponto de equilíbrio compras/vendas — usa o mix efetivo das saídas para as
  // alíquotas médias de débito e efetivo (pondera interna vs interestadual).
  const avgDebit = totalSaidas > 0 ? debito / totalSaidas : debit_rate_interstate;
  const avgEffective =
    totalSaidas > 0 ? icmsDevidoTts / totalSaidas : effective_rate_interstate;
  const breakEven =
    credit_rate_default > 0 ? (avgDebit - avgEffective) / credit_rate_default : null;
  const comprasVendasRatio = totalSaidas > 0 ? input.entradas_base / totalSaidas : null;

  return {
    icms_devido_normal: round2(icmsDevidoNormal),
    icms_devido_tts: round2(icmsDevidoTts),
    credito_presumido: round2(creditoPresumido),
    economia: round2(economia),
    economia_pct: icmsDevidoNormal > 0 ? round2((economia / icmsDevidoNormal) * 100) : 0,
    pct_interestadual: round2(pctInterestadual * 100),
    min_interstate_share: round2(min_interstate_share * 100),
    elegivel,
    break_even_ratio: breakEven !== null ? round2(breakEven * 100) : null,
    compras_vendas_ratio: comprasVendasRatio !== null ? round2(comprasVendasRatio * 100) : null,
  };
}

export const ttsService = {
  // ==========================================
  // MOTOR DE CÁLCULO (puro, reexportado)
  // ==========================================
  calcular: calcularTts,

  // ==========================================
  // PARÂMETROS DO REGIME
  // ==========================================

  /**
   * Retorna os parâmetros do regime para a filial. Precedência:
   * 1) config da filial (company_id = X);
   * 2) config org-wide (company_id NULL);
   * 3) TTS_DEFAULTS (fallback, marcado como não-configurado).
   */
  async getSettings(
    orgId: string,
    companyId?: string | null
  ): Promise<TtsRegimeSettings & { _isDefault?: boolean }> {
    const { data, error } = await supabase
      .from('tts_regime_settings')
      .select('*')
      .eq('org_id', orgId);

    if (error) {
      console.error('[ttsService] Erro ao carregar parâmetros TTS:', error);
      throw new Error(`Erro ao carregar parâmetros TTS: ${error.message}`);
    }

    const rows = (data || []) as TtsRegimeSettings[];
    const perCompany = companyId ? rows.find((r) => r.company_id === companyId) : undefined;
    const orgWide = rows.find((r) => r.company_id === null);
    const found = perCompany || orgWide;

    if (found) return found;

    // Fallback: nada configurado ainda
    return {
      id: '',
      org_id: orgId,
      company_id: companyId ?? null,
      created_at: '',
      updated_at: '',
      notes: null,
      ...TTS_DEFAULTS,
      _isDefault: true,
    };
  },

  async saveSettings(
    settings: TtsRegimeSettingsInsert & { id?: string }
  ): Promise<TtsRegimeSettings> {
    const payload = {
      org_id: settings.org_id,
      company_id: settings.company_id ?? null,
      home_uf: settings.home_uf,
      active: settings.active,
      debit_rate_internal: settings.debit_rate_internal,
      debit_rate_interstate: settings.debit_rate_interstate,
      effective_rate_internal: settings.effective_rate_internal,
      effective_rate_interstate: settings.effective_rate_interstate,
      credit_rate_default: settings.credit_rate_default,
      min_interstate_share: settings.min_interstate_share,
      notes: settings.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    // NÃO usar upsert(onConflict) aqui: a UNIQUE (org_id, company_id) não
    // deduplica quando company_id é NULL (Postgres trata NULLs como distintos),
    // então o default org-wide viraria linhas duplicadas. Resolvemos com
    // find-existing-then-update/insert, cobrindo company_id NULL e não-NULL.
    let existingQuery = supabase
      .from('tts_regime_settings')
      .select('id')
      .eq('org_id', payload.org_id);
    existingQuery =
      payload.company_id === null
        ? existingQuery.is('company_id', null)
        : existingQuery.eq('company_id', payload.company_id);

    const { data: existing, error: findError } = await existingQuery.maybeSingle();
    if (findError) {
      console.error('[ttsService] Erro ao localizar parâmetros TTS:', findError);
      throw new Error(`Erro ao localizar parâmetros TTS: ${findError.message}`);
    }

    const targetId = settings.id || existing?.id;
    const { data, error } = targetId
      ? await supabase
          .from('tts_regime_settings')
          .update(payload)
          .eq('id', targetId)
          .select()
          .single()
      : await supabase.from('tts_regime_settings').insert(payload).select().single();

    if (error) {
      console.error('[ttsService] Erro ao salvar parâmetros TTS:', error);
      throw new Error(`Erro ao salvar parâmetros TTS: ${error.message}`);
    }

    return data;
  },

  // ==========================================
  // LEDGER DE MOVIMENTOS
  // ==========================================
  async listMovements(
    orgId: string,
    companyId: string,
    referenceMonth?: string
  ): Promise<TtsFiscalMovement[]> {
    let query = supabase
      .from('tts_fiscal_movements')
      .select('*')
      .eq('org_id', orgId)
      .eq('company_id', companyId);

    if (referenceMonth) {
      query = query.eq('reference_month', referenceMonth);
    }

    query = query.order('reference_month', { ascending: false }).order('created_at', {
      ascending: false,
    });

    const { data, error } = await query;

    if (error) {
      console.error('[ttsService] Erro ao listar movimentos:', error);
      throw new Error(`Erro ao listar movimentos: ${error.message}`);
    }

    return data || [];
  },

  async saveMovement(
    movement: TtsFiscalMovementInsert & { id?: string }
  ): Promise<TtsFiscalMovement> {
    const payload = {
      org_id: movement.org_id,
      company_id: movement.company_id,
      reference_month: movement.reference_month,
      direction: movement.direction,
      scope: movement.scope,
      cfop: movement.cfop ?? null,
      base_amount: movement.base_amount,
      icms_debit: movement.icms_debit,
      icms_credit: movement.icms_credit,
      source: movement.source,
      nfe_invoice_id: movement.nfe_invoice_id ?? null,
      document_ref: movement.document_ref ?? null,
      description: movement.description ?? null,
      created_by: movement.created_by ?? null,
    };

    let query;
    if (movement.id) {
      query = supabase
        .from('tts_fiscal_movements')
        .update(payload)
        .eq('id', movement.id)
        .select()
        .single();
    } else {
      query = supabase.from('tts_fiscal_movements').insert(payload).select().single();
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ttsService] Erro ao salvar movimento:', error);
      throw new Error(`Erro ao salvar movimento: ${error.message}`);
    }

    return data;
  },

  async deleteMovement(id: string): Promise<void> {
    const { error } = await supabase.from('tts_fiscal_movements').delete().eq('id', id);

    if (error) {
      console.error('[ttsService] Erro ao deletar movimento:', error);
      throw new Error(`Erro ao deletar movimento: ${error.message}`);
    }
  },

  // ==========================================
  // APURAÇÃO (view agregada)
  // ==========================================
  async getApuracao(
    orgId: string,
    companyId: string,
    referenceMonth?: string
  ): Promise<TtsApuracaoRow | null> {
    let query = supabase
      .from('tts_apuracao_view')
      .select('*')
      .eq('org_id', orgId)
      .eq('company_id', companyId);

    if (referenceMonth) {
      query = query.eq('reference_month', referenceMonth);
    }

    query = query.order('reference_month', { ascending: false }).limit(1);

    const { data, error } = await query;

    if (error) {
      console.error('[ttsService] Erro ao carregar apuração:', error);
      throw new Error(`Erro ao carregar apuração: ${error.message}`);
    }

    return (data && data[0]) || null;
  },

  /**
   * Apuração + cálculo TTS combinados: puxa as somas da view e aplica as
   * alíquotas da org. É o que o painel consome para números REAIS.
   */
  async apurarComCalculo(
    orgId: string,
    companyId: string,
    referenceMonth?: string
  ): Promise<{ apuracao: TtsApuracaoRow | null; resultado: TtsCalculationResult | null }> {
    const [apuracao, settings] = await Promise.all([
      this.getApuracao(orgId, companyId, referenceMonth),
      this.getSettings(orgId, companyId),
    ]);

    if (!apuracao) return { apuracao: null, resultado: null };

    const resultado = calcularTts(
      {
        saidas_internas: apuracao.saidas_internas,
        saidas_interestaduais: apuracao.saidas_interestaduais,
        entradas_base: apuracao.total_entradas,
        entradas_credito_real: apuracao.icms_credito_real || undefined,
      },
      settings
    );

    return { apuracao, resultado };
  },

  // ==========================================
  // BACKFILL a partir das NF-e já ingeridas
  // ==========================================

  /**
   * Popula tts_fiscal_movements a partir das nfe_invoices/itens existentes.
   *
   * DIREÇÃO relativa à nossa empresa vem do MATCH DE CNPJ (não do CFOP, que na
   * nota é sempre do emitente): emitente=filial → saída; destinatário=filial →
   * entrada. Uma nota pode gerar as duas (transferência entre filiais). O
   * ESCOPO (interna/interestadual) vem do CFOP via cfopScope. Itens de exterior,
   * sem CFOP ou sem nenhuma filial correspondente são pulados e contabilizados.
   *
   * Base: total_value do item (as NF-e ingeridas NÃO trazem base/valor de ICMS
   * segregado — icms_debit/icms_credit ficam 0; o motor recalcula pelas
   * alíquotas). IDEMPOTENTE: remove os movimentos source='nfe' das NF-e
   * reprocessadas antes de reinserir, então rodar de novo não duplica.
   */
  async backfillFromNfe(orgId: string): Promise<TtsBackfillResult> {
    // Guarda contra org vazia (AppRouter passa '' enquanto a org não resolve) —
    // sem isso o Postgres rejeita a string vazia como UUID com erro críptico.
    if (!orgId) {
      throw new Error('Organização não identificada. Recarregue a página e tente novamente.');
    }

    const result: TtsBackfillResult = {
      invoices_scanned: 0,
      invoices_applied: 0,
      movements_created: 0,
      skipped_no_company: 0,
      skipped_no_cfop: 0,
      skipped_exterior: 0,
      companies_matched: [],
      registered_cnpjs: [],
      sample_unmatched_cnpjs: [],
      empty_cnpj_items: 0,
      direction_counts: { saida: 0, entrada: 0 },
    };
    const unmatchedCnpjs = new Set<string>();

    // 1. Mapa CNPJ(normalizado) → company_id
    const { data: comps, error: compErr } = await supabase
      .from('companies')
      .select('id, cnpj')
      .eq('org_id', orgId);
    if (compErr) {
      console.error('[ttsService] Erro ao carregar filiais p/ backfill:', compErr);
      throw new Error(`Erro ao carregar filiais: ${compErr.message}`);
    }
    const cnpjToCompany = new Map<string, string>();
    for (const c of comps || []) {
      const key = onlyDigits((c as { cnpj: string | null }).cnpj);
      if (key) cnpjToCompany.set(key, (c as { id: string }).id);
    }
    result.registered_cnpjs = Array.from(cnpjToCompany.keys());
    if (cnpjToCompany.size === 0) {
      // Sem CNPJ cadastrado em nenhuma filial não há como atribuir os movimentos.
      return result;
    }

    // 2. NF-e da org + itens
    const { data: invoices, error: invErr } = await supabase
      .from('nfe_invoices')
      .select('id, issuer_cnpj, recipient_cnpj, issue_date, access_key, nfe_invoice_items(cfop, total_value)')
      .eq('organization_id', orgId);
    if (invErr) {
      console.error('[ttsService] Erro ao carregar NF-e p/ backfill:', invErr);
      throw new Error(`Erro ao carregar NF-e: ${invErr.message}`);
    }

    type InvRow = {
      id: string;
      issuer_cnpj: string;
      recipient_cnpj: string | null;
      issue_date: string;
      access_key: string | null;
      nfe_invoice_items: { cfop: string | null; total_value: number | null }[] | null;
    };

    // 3. Agrega base por (invoice, company, mês, direção, escopo)
    const agg = new Map<string, TtsFiscalMovementInsert>();
    const matched = new Set<string>();
    const appliedInvoiceIds: string[] = [];

    // Acumula um movimento no agregador (uma linha por invoice/filial/mês/dir/escopo).
    const addToAgg = (
      invId: string,
      companyId: string,
      referenceMonth: string,
      direction: 'saida' | 'entrada',
      scope: 'interna' | 'interestadual',
      cfop: string | null,
      base: number,
      accessKey: string | null
    ) => {
      const key = `${invId}|${companyId}|${referenceMonth}|${direction}|${scope}`;
      const existing = agg.get(key);
      if (existing) {
        existing.base_amount += base;
      } else {
        agg.set(key, {
          org_id: orgId,
          company_id: companyId,
          reference_month: referenceMonth,
          direction,
          scope,
          cfop: onlyDigits(cfop).slice(0, 4) || null,
          base_amount: base,
          icms_debit: 0,
          icms_credit: 0,
          source: 'nfe',
          nfe_invoice_id: invId,
          document_ref: accessKey,
          description: null,
          created_by: null,
        });
      }
      matched.add(companyId);
      result.direction_counts[direction]++;
    };

    for (const inv of (invoices || []) as InvRow[]) {
      result.invoices_scanned++;
      const referenceMonth = `${inv.issue_date.slice(0, 7)}-01`;
      // Direção relativa à NOSSA empresa vem do CNPJ, não do CFOP (o CFOP da
      // nota é do emitente): emitente=filial → saída; destinatário=filial → entrada.
      const issuerDigits = onlyDigits(inv.issuer_cnpj);
      const recipientDigits = onlyDigits(inv.recipient_cnpj);
      const issuerCompany = cnpjToCompany.get(issuerDigits);
      const recipientCompany = cnpjToCompany.get(recipientDigits);
      let invoiceContributed = false;

      for (const item of inv.nfe_invoice_items || []) {
        const scope = cfopScope(item.cfop);
        if (!scope) {
          result.skipped_no_cfop++;
          continue;
        }
        if (scope === 'exterior') {
          result.skipped_exterior++;
          continue;
        }
        const base = item.total_value || 0;

        // Uma nota pode ser saída E entrada (transferência entre filiais da org).
        if (issuerCompany) {
          addToAgg(inv.id, issuerCompany, referenceMonth, 'saida', scope, item.cfop, base, inv.access_key);
          invoiceContributed = true;
        }
        if (recipientCompany) {
          addToAgg(inv.id, recipientCompany, referenceMonth, 'entrada', scope, item.cfop, base, inv.access_key);
          invoiceContributed = true;
        }
        if (!issuerCompany && !recipientCompany) {
          result.skipped_no_company++;
          if (!issuerDigits && !recipientDigits) result.empty_cnpj_items++;
          else if (unmatchedCnpjs.size < 12) unmatchedCnpjs.add(recipientDigits || issuerDigits);
        }
      }

      if (invoiceContributed) {
        result.invoices_applied++;
        appliedInvoiceIds.push(inv.id);
      }
    }

    const rows = Array.from(agg.values()).map((r) => ({
      ...r,
      base_amount: round2(r.base_amount),
    }));
    result.companies_matched = Array.from(matched);
    result.sample_unmatched_cnpjs = Array.from(unmatchedCnpjs);

    if (rows.length === 0) return result;

    // 4. Idempotência: apaga movimentos source='nfe' das NF-e reprocessadas
    for (let i = 0; i < appliedInvoiceIds.length; i += 200) {
      const chunk = appliedInvoiceIds.slice(i, i + 200);
      const { error: delErr } = await supabase
        .from('tts_fiscal_movements')
        .delete()
        .eq('source', 'nfe')
        .in('nfe_invoice_id', chunk);
      if (delErr) {
        console.error('[ttsService] Erro ao limpar movimentos NF-e antigos:', delErr);
        throw new Error(`Erro ao limpar movimentos antigos: ${delErr.message}`);
      }
    }

    // 5. Insere em lotes
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: insErr } = await supabase.from('tts_fiscal_movements').insert(chunk);
      if (insErr) {
        console.error('[ttsService] Erro ao inserir movimentos do backfill:', insErr);
        throw new Error(`Erro ao inserir movimentos: ${insErr.message}`);
      }
      result.movements_created += chunk.length;
    }

    return result;
  },
};
