// Financeiro da folha: que títulos uma folha fechada gera, por obra e chave contábil.
//
// Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md
// SEM imports de serviço (puro — Vitest sem mock).
//
// Até 21/10/2026 a folha gerava um título "Encargos Patronais" = custo − líquido.
// Essa conta dava FGTS + TODOS os descontos do empregado (INSS, IRRF, adiantamento,
// falta, VR…): FGTS de 453,36 virava um "encargo" de 3.988,90. O adiantamento,
// que o líquido já desconta, era abatido de novo do salário. CPP e RAT não
// existiam. Aqui cada encargo e cada retenção é um título próprio:
//
//   salario    líquido − proventos pagos à parte (rubrica individualizada)
//   inss       INSS descontado do empregado          → Tributos a Pagar
//   irrf       IRRF retido                           → Tributos a Pagar
//   fgts       rubricas FGTS* (encargo)              → Tributos a Pagar
//   cpp        base INSS × CPP                       → Tributos a Pagar
//   rat        base INSS × RAT × FAP                 → Tributos a Pagar
//   terceiros  base INSS × Σ entidades               → Tributos a Pagar
//   rep-COD    desconto repassado a terceiro (rubrics.repasse_terceiros)
//   enc-COD    outro encargo de rubrica
//
// Os demais descontos (falta, VR, dedução do 13º, adiantamento) NÃO geram
// título: só reduzem o líquido. O adiantamento tem título próprio pela rubrica
// individualizada (fora daqui, no service).

export interface TerceiroTax { code: string; name: string; rate: number }

/**
 * FPAS 507 (indústria da construção): o padrão da construtora.
 * Antes o padrão era o do comércio (SENAC/SESC). O total era o mesmo, 5,8%,
 * mas as entidades eram as erradas.
 */
export const TERCEIROS_FPAS_507: TerceiroTax[] = [
    { code: '0001', name: 'Salário-Educação', rate: 0.025 },
    { code: '0002', name: 'INCRA',            rate: 0.002 },
    { code: '0004', name: 'SENAI',            rate: 0.010 },
    { code: '0008', name: 'SESI',             rate: 0.015 },
    { code: '0064', name: 'SEBRAE',           rate: 0.006 },
];

export interface EncargosConfig {
    cppRate: number;
    ratRate: number;
    fap: number;
    terceiros: TerceiroTax[];
    /** 'salvo' = linha em payroll_encargos_config; 'padrao' = derivado do regime. */
    origem: 'salvo' | 'padrao';
    /** Por que o padrão saiu assim — a tela mostra. */
    motivo: string | null;
}

export interface EmpresaRegime {
    regime_tributario?: string | null;
    simples_anexo_iv?: boolean | null;
    cprb?: boolean | null;
}

export const RAT_PADRAO = 0.03;   // construção civil (CNAE 41xx–43xx): grau de risco 3
export const CPP_PADRAO = 0.20;
/** CPRB em transição (Lei 14.973/2024): a CPP sobre a folha volta aos poucos — 10% em 2026. */
export const CPP_CPRB_2026 = 0.10;

/** Alíquotas padrão a partir do regime da empresa matriz. Todas são hipóteses editáveis. */
export function encargosPadrao(empresa: EmpresaRegime | null | undefined): EncargosConfig {
    const base = { ratRate: RAT_PADRAO, fap: 1, terceiros: TERCEIROS_FPAS_507.map(t => ({ ...t })), origem: 'padrao' as const };
    const regime = (empresa?.regime_tributario ?? '').toLowerCase();
    if ((regime === 'simples' || regime === 'mei') && !empresa?.simples_anexo_iv) {
        return {
            ...base, cppRate: 0, ratRate: 0, terceiros: [],
            motivo: 'Simples Nacional fora do Anexo IV: CPP, RAT e terceiros já estão no DAS.',
        };
    }
    if (empresa?.cprb) {
        return {
            ...base, cppRate: CPP_CPRB_2026,
            motivo: 'Empresa na CPRB: em 2026 a CPP sobre a folha é 10% (Lei 14.973/2024); a CPRB sobre a receita é à parte. Confira.',
        };
    }
    return { ...base, cppRate: CPP_PADRAO, motivo: null };
}

// ── Vencimentos ─────────────────────────────────────────────────────────────
// Parsing em horário LOCAL (nunca new Date('YYYY-MM-DD'): fuso UTC-3).

function fmtLocal(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dia `dia` do mês seguinte à competência (YYYY-MM…). Sem ajuste de dia útil. */
export function diaDoMesSeguinte(competencia: string, dia: number): string {
    const [y, m] = competencia.slice(0, 7).split('-').map(Number);
    return fmtLocal(new Date(y, m, dia));   // m (1-based) como índice 0-based = mês seguinte
}

/**
 * FGTS (FGTS Digital), INSS/CPP/RAT/terceiros (DCTFWeb) e IRRF da folha: dia 20
 * do mês seguinte. Em sábado ou domingo, ANTECIPA para sexta (feriado não é
 * tratado, como em taxPayableService.taxDueDate).
 */
export function vencimentoDia20(competencia: string): string {
    const [y, m] = competencia.slice(0, 7).split('-').map(Number);
    const d = new Date(y, m, 20);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return fmtLocal(d);
}

// ── Linhas da folha ─────────────────────────────────────────────────────────

export type TipoLinhaFolha = string; // 'salario' | 'inss' | 'irrf' | 'fgts' | 'cpp' | 'rat' | 'terceiros' | `rep-${string}` | `enc-${string}`

/** Uma fatia do custo de um colaborador: destino (obra ou não alocado) × chave contábil. */
export interface FatiaDaFolha {
    /** id da obra; null = custo administrativo (não alocado). */
    destino: string | null;
    destinoNome: string;
    cost_center_id: string | null;
    plano_de_contas_id: string | null;
    /** 0–1; as fatias de um colaborador somam 1. */
    share: number;
}

export interface ItemDaFolha { code: string; type: string; amount: number }

export interface ColaboradorDaFolha {
    employeeId: string;
    nome: string;
    liquido: number;
    bruto: number;
    baseInss: number;
    /** gross + itens 'encargo' (payroll_results.employer_cost). */
    custoEmpregador: number;
    itens: ItemDaFolha[];
    fatias: FatiaDaFolha[];
}

export interface OpcoesDaFolha {
    /** Rubricas com lancamento_individualizado: o provento é pago à parte (sai do salário). */
    individualizados: Set<string>;
    /** Rubricas de desconto com repasse_terceiros → nome. */
    repasses: Record<string, string>;
    /** Nomes das rubricas (para os encargos genéricos). */
    nomes?: Record<string, string>;
}

export interface LinhaDaFolha {
    tipo: TipoLinhaFolha;
    destino: string | null;
    destinoNome: string;
    cost_center_id: string | null;
    plano_de_contas_id: string | null;
    valor: number;
    colaboradores: string[];
}

export interface CustoPorDestino {
    destino: string | null;
    destinoNome: string;
    /** Custo do empregador: bruto + FGTS e encargos de rubrica + CPP + RAT + terceiros. */
    custo: number;
    colaboradores: string[];
}

export const ehFgts = (code: string) => /^FGTS/i.test(code);

/**
 * Fatias de um colaborador: alocação em obra × rateio contábil. O que a
 * alocação não cobre vai para o não alocado. Alocação acima de 100% é
 * proporcionalizada: lançar mais que o custo real é pior que normalizar.
 */
export function fatiasDoColaborador(
    alocacoes: { project_id: string; allocation_percent: number; nome?: string }[],
    rateio: { cost_center_id: string | null; plano_de_contas_id: string | null; share: number }[],
): FatiaDaFolha[] {
    const validas = alocacoes.filter(a => (a.allocation_percent || 0) > 0);
    const soma = validas.reduce((s, a) => s + a.allocation_percent, 0);
    const escala = soma > 100 ? 100 / soma : 1;
    const destinos: { destino: string | null; nome: string; pct: number }[] = validas.map(a => ({
        destino: a.project_id, nome: a.nome || 'Obra', pct: (a.allocation_percent * escala) / 100,
    }));
    const resto = 1 - destinos.reduce((s, d) => s + d.pct, 0);
    if (resto > 0.00001) destinos.push({ destino: null, nome: 'Custo Administrativo (Não Alocado)', pct: resto });

    const fatias: FatiaDaFolha[] = [];
    for (const d of destinos) {
        for (const r of rateio) {
            fatias.push({
                destino: d.destino, destinoNome: d.nome,
                cost_center_id: r.cost_center_id, plano_de_contas_id: r.plano_de_contas_id,
                share: d.pct * r.share,
            });
        }
    }
    return fatias;
}

export function chaveContabil(c: { cost_center_id: string | null; plano_de_contas_id: string | null }): string {
    return `${c.cost_center_id ?? 'none'}-${c.plano_de_contas_id ?? 'none'}`;
}
const chaveDaFatia = (f: { destino: string | null; cost_center_id: string | null; plano_de_contas_id: string | null }) =>
    `${f.destino ?? 'unallocated'}|${chaveContabil(f)}`;

/** Componentes de UM colaborador, em reais (sem arredondar os calculados). */
function componentes(c: ColaboradorDaFolha, cfg: EncargosConfig, op: OpcoesDaFolha): Record<TipoLinhaFolha, number> {
    const out: Record<string, number> = {};
    const add = (k: string, v: number) => { if (v) out[k] = (out[k] || 0) + v; };
    let proventoAParte = 0;
    for (const it of c.itens) {
        const v = Math.abs(it.amount || 0);
        if (!v) continue;
        if (it.type === 'provento' && op.individualizados.has(it.code)) proventoAParte += v;
        else if (it.type === 'desconto' && it.code === 'INSS') add('inss', v);
        else if (it.type === 'desconto' && it.code === 'IRRF') add('irrf', v);
        else if (it.type === 'desconto' && op.repasses[it.code] && !op.individualizados.has(it.code)) add(`rep-${it.code}`, v);
        else if (it.type === 'encargo') add(ehFgts(it.code) ? 'fgts' : `enc-${it.code}`, v);
    }
    add('salario', Math.max(0, (c.liquido || 0) - proventoAParte));
    const base = c.baseInss || 0;
    add('cpp', base * cfg.cppRate);
    add('rat', base * cfg.ratRate * cfg.fap);
    add('terceiros', base * cfg.terceiros.reduce((s, t) => s + t.rate, 0));
    return out;
}

/**
 * Distribui `totalCentavos` pelos pesos sem perder centavo (maior resto). A
 * soma das linhas de um tributo bate exatamente com o total da folha, que é o
 * que vai na guia.
 */
export function distribuirCentavos(totalCentavos: number, pesos: number[]): number[] {
    const soma = pesos.reduce((s, p) => s + p, 0);
    if (soma <= 0 || totalCentavos <= 0) return pesos.map(() => 0);
    const brutos = pesos.map(p => (totalCentavos * p) / soma);
    const base = brutos.map(Math.floor);
    let falta = totalCentavos - base.reduce((s, v) => s + v, 0);
    const ordem = brutos.map((b, i) => ({ i, resto: b - Math.floor(b) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
    for (let k = 0; falta > 0 && k < ordem.length; k++, falta--) base[ordem[k].i] += 1;
    return base;
}

/** Títulos da folha, por tipo × destino × chave contábil. */
export function montarLinhasDaFolha(colabs: ColaboradorDaFolha[], cfg: EncargosConfig, op: OpcoesDaFolha): LinhaDaFolha[] {
    // tipo → chave da fatia → peso; e o total exato do tipo
    const pesos = new Map<string, Map<string, number>>();
    const totais = new Map<string, number>();
    const meta = new Map<string, FatiaDaFolha>();
    const pessoas = new Map<string, Map<string, Set<string>>>();

    for (const c of colabs) {
        const comp = componentes(c, cfg, op);
        for (const [tipo, valor] of Object.entries(comp)) {
            totais.set(tipo, (totais.get(tipo) || 0) + valor);
            const porFatia = pesos.get(tipo) ?? new Map<string, number>();
            const quem = pessoas.get(tipo) ?? new Map<string, Set<string>>();
            for (const f of c.fatias) {
                if (f.share <= 0) continue;
                const k = chaveDaFatia(f);
                meta.set(k, f);
                porFatia.set(k, (porFatia.get(k) || 0) + valor * f.share);
                const s = quem.get(k) ?? new Set<string>();
                if (c.nome) s.add(c.nome);
                quem.set(k, s);
            }
            pesos.set(tipo, porFatia);
            pessoas.set(tipo, quem);
        }
    }

    const linhas: LinhaDaFolha[] = [];
    for (const [tipo, porFatia] of pesos) {
        const chaves = [...porFatia.keys()];
        const centavos = distribuirCentavos(Math.round((totais.get(tipo) || 0) * 100), chaves.map(k => porFatia.get(k) || 0));
        chaves.forEach((k, i) => {
            if (centavos[i] <= 0) return;
            const f = meta.get(k)!;
            linhas.push({
                tipo, destino: f.destino, destinoNome: f.destinoNome,
                cost_center_id: f.cost_center_id, plano_de_contas_id: f.plano_de_contas_id,
                valor: centavos[i] / 100,
                colaboradores: [...(pessoas.get(tipo)?.get(k) ?? [])],
            });
        });
    }
    return linhas;
}

/** Custo do empregador por destino (painel de custo por obra). */
export function custoPorDestino(colabs: ColaboradorDaFolha[], cfg: EncargosConfig): CustoPorDestino[] {
    const taxa = cfg.cppRate + cfg.ratRate * cfg.fap + cfg.terceiros.reduce((s, t) => s + t.rate, 0);
    const mapa = new Map<string, CustoPorDestino>();
    for (const c of colabs) {
        const custo = (c.custoEmpregador || 0) + (c.baseInss || 0) * taxa;
        for (const f of c.fatias) {
            const k = f.destino ?? 'unallocated';
            const d = mapa.get(k) ?? { destino: f.destino, destinoNome: f.destinoNome, custo: 0, colaboradores: [] };
            d.custo += custo * f.share;
            if (c.nome && !d.colaboradores.includes(c.nome)) d.colaboradores.push(c.nome);
            mapa.set(k, d);
        }
    }
    return [...mapa.values()].map(d => ({ ...d, custo: Math.round(d.custo * 100) / 100 }));
}

// ── Como cada tipo vira título ──────────────────────────────────────────────

export interface FormaDoTitulo {
    party_name: string;
    party_type: 'EMPLOYEE' | 'TAX' | 'GOVERNMENT';
    category: string;
    /** Rótulo curto da descrição. */
    rotulo: string;
    /** 'dia20' = vencimento legal da guia; 'dia05' = data de pagamento da folha. */
    vencimento: 'dia20' | 'dia05';
}

export function formaDoTitulo(tipo: TipoLinhaFolha, nomes: Record<string, string> = {}): FormaDoTitulo {
    switch (tipo) {
        case 'salario':   return { party_name: '', party_type: 'EMPLOYEE', category: 'Folha de Pagamento', rotulo: 'Salários', vencimento: 'dia05' };
        case 'inss':      return { party_name: 'INSS (segurados)', party_type: 'TAX', category: 'Folha de Pagamento', rotulo: 'INSS descontado dos empregados', vencimento: 'dia20' };
        case 'irrf':      return { party_name: 'IRRF (folha)', party_type: 'TAX', category: 'Folha de Pagamento', rotulo: 'IRRF retido na folha', vencimento: 'dia20' };
        case 'fgts':      return { party_name: 'FGTS', party_type: 'TAX', category: 'Encargos Patronais', rotulo: 'FGTS', vencimento: 'dia20' };
        case 'cpp':       return { party_name: 'INSS patronal (CPP)', party_type: 'TAX', category: 'Encargos Patronais', rotulo: 'INSS patronal (CPP)', vencimento: 'dia20' };
        case 'rat':       return { party_name: 'RAT/GILRAT', party_type: 'TAX', category: 'Encargos Patronais', rotulo: 'RAT/GILRAT', vencimento: 'dia20' };
        case 'terceiros': return { party_name: 'Terceiros (outras entidades)', party_type: 'TAX', category: 'Contribuições de Terceiros', rotulo: 'Contribuições de terceiros', vencimento: 'dia20' };
    }
    const codigo = tipo.slice(4);
    const nome = nomes[codigo] || codigo;
    if (tipo.startsWith('rep-')) return { party_name: nome, party_type: 'GOVERNMENT', category: 'Folha de Pagamento', rotulo: `${nome} (repasse)`, vencimento: 'dia05' };
    return { party_name: nome, party_type: 'GOVERNMENT', category: 'Encargos Patronais', rotulo: nome, vencimento: 'dia05' };
}

// ── Preservação ─────────────────────────────────────────────────────────────

/**
 * Título da folha que a re-sincronização NÃO apaga nem regrava. Os casos são:
 * pago (baixa ou conciliado), cancelado à mão, agrupado num DARF (o banco recusa
 * mexer: trg_darf_membro_trava), com vínculo no extrato ou com pagamento pela
 * Asaas. Até 21/10/2026 o sync apagava tudo, e o CASCADE levava junto o vínculo
 * da conciliação.
 */
export function tituloDaFolhaPreservado(r: {
    status?: string | null; business_status?: string | null; darf_id?: string | null;
    conciliado?: boolean; pagamentoAsaas?: boolean;
}): boolean {
    return r.status === 'CONCILIATED' || r.status === 'CANCELLED' || r.business_status === 'PAGO'
        || !!r.darf_id || !!r.conciliado || !!r.pagamentoAsaas;
}
