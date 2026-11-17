/**
 * Cenários do orçamento paramétrico — regras puras (pedido "Corrigir problemas com cenários",
 * 17/11/2026). Os cenários moram em `settings.parametricScenarios`; o autosave do projeto
 * (hooks/usePersistenceSync.ts) grava no banco. Até essa data viviam só no estado da tela.
 */
import type { BdiComposition, ParametricScenario, ParametricSimulation } from '../types';

export type DadosDoCenario = Omit<ParametricScenario, 'id' | 'number' | 'name' | 'createdAt'>;

const numeroValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const CHAVES_BDI: (keyof BdiComposition)[] = ['taxes', 'profit', 'risk', 'insurance', 'admin', 'guarantee', 'finance'];

function lerComposicao(bruto: unknown): BdiComposition {
    const origem = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
    const comp = {} as BdiComposition;
    for (const chave of CHAVES_BDI) comp[chave] = numeroValido(origem[chave]) ? origem[chave] as number : 0;
    return comp;
}

/** Lê o que está gravado no projeto. Entrada sem id, sem número ou sem valor positivo é descartada. */
export function lerCenarios(bruto: unknown): ParametricScenario[] {
    if (!Array.isArray(bruto)) return [];
    return bruto.flatMap((item): ParametricScenario[] => {
        if (!item || typeof item !== 'object') return [];
        const c = item as Record<string, unknown>;
        if (typeof c.id !== 'string' || !numeroValido(c.number) || !numeroValido(c.totalValue) || c.totalValue <= 0) return [];
        const sens = (c.sensitivity && typeof c.sensitivity === 'object' ? c.sensitivity : {}) as Record<string, unknown>;
        return [{
            id: c.id,
            number: c.number,
            name: typeof c.name === 'string' ? c.name : `Cenário ${c.number}`,
            createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
            totalValue: c.totalValue,
            costPerM2: numeroValido(c.costPerM2) ? c.costPerM2 : 0,
            bdi: numeroValido(c.bdi) ? c.bdi : 0,
            bdiComposition: lerComposicao(c.bdiComposition),
            kFactor: numeroValido(c.kFactor) ? c.kFactor : 1,
            sensitivity: {
                materials: numeroValido(sens.materials) ? sens.materials : 0,
                labor: numeroValido(sens.labor) ? sens.labor : 0,
            },
            durationMonths: numeroValido(c.durationMonths) ? c.durationMonths : 18,
            area: numeroValido(c.area) ? c.area : 0,
            standard: typeof c.standard === 'string' ? c.standard : '',
        }];
    });
}

// ─── Simulação guardada no orçamento (settings.parametricSimulation) ─────────────────────
// Pedido "Corrigir também" (17/11/2026): até aqui o BDI, o K, a sensibilidade e o prazo
// mexidos na tela voltavam ao padrão ao sair dela.

/** Composição usada quando o projeto não tem BDI próprio (a mesma que a tela usava). */
export const COMPOSICAO_PADRAO: BdiComposition = { taxes: 8.5, profit: 12, risk: 2, insurance: 1, admin: 5, guarantee: 0, finance: 0 };
export const PRAZO_PADRAO_MESES = 18;

const positivo = (v: unknown): v is number => numeroValido(v) && v > 0;

/** O ponto de partida: BDI e fator K das Configurações do projeto, sem variação, 18 meses. */
export function simulacaoDoProjeto(projeto: { bdiComposition?: unknown; kFactor?: unknown }): ParametricSimulation {
    return {
        bdiComposition: projeto.bdiComposition && typeof projeto.bdiComposition === 'object'
            ? lerComposicao(projeto.bdiComposition)
            : { ...COMPOSICAO_PADRAO },
        kFactor: positivo(projeto.kFactor) ? projeto.kFactor : 1,
        sensitivity: { materials: 0, labor: 0 },
        durationMonths: PRAZO_PADRAO_MESES,
    };
}

/** Lê a simulação gravada; o que faltar ou vier estragado fica com o valor do projeto. */
export function lerSimulacao(bruto: unknown, projeto: { bdiComposition?: unknown; kFactor?: unknown }): ParametricSimulation {
    const base = simulacaoDoProjeto(projeto);
    if (!bruto || typeof bruto !== 'object') return base;
    const s = bruto as Record<string, unknown>;
    const sens = (s.sensitivity && typeof s.sensitivity === 'object' ? s.sensitivity : {}) as Record<string, unknown>;
    return {
        bdiComposition: s.bdiComposition && typeof s.bdiComposition === 'object' ? lerComposicao(s.bdiComposition) : base.bdiComposition,
        kFactor: positivo(s.kFactor) ? s.kFactor : base.kFactor,
        sensitivity: {
            materials: numeroValido(sens.materials) ? sens.materials : 0,
            labor: numeroValido(sens.labor) ? sens.labor : 0,
        },
        durationMonths: positivo(s.durationMonths) ? s.durationMonths : base.durationMonths,
    };
}

export function mesmaSimulacao(a: ParametricSimulation, b: ParametricSimulation): boolean {
    return a.kFactor === b.kFactor
        && a.durationMonths === b.durationMonths
        && a.sensitivity.materials === b.sensitivity.materials
        && a.sensitivity.labor === b.sensitivity.labor
        && CHAVES_BDI.every(chave => a.bdiComposition[chave] === b.bdiComposition[chave]);
}

// ─── Renomear ────────────────────────────────────────────────────────────────────────────

const MAX_NOME = 80;

/** Lista com o cenário renomeado, ou null quando não há o que gravar (nome vazio, igual ou id sumido). */
export function renomearCenario(cenarios: ParametricScenario[], id: string, nome: string): ParametricScenario[] | null {
    const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, MAX_NOME);
    const alvo = cenarios.find(c => c.id === id);
    if (!limpo || !alvo || alvo.name === limpo) return null;
    return cenarios.map(c => (c.id === id ? { ...c, name: limpo } : c));
}

/** Como o cenário aparece numa frase: "Cenário 1 (R8-N)" como está; nome livre vira 'cenário "Otimista"'. */
export function referenciaAoCenario(cenario: ParametricScenario): string {
    return /^cen[aá]rio\b/i.test(cenario.name) ? cenario.name : `cenário "${cenario.name}"`;
}

/** Maior número já usado + 1 — excluir o "Cenário 1" não faz o próximo repetir um nome. */
export function proximoNumero(cenarios: ParametricScenario[]): number {
    return cenarios.reduce((maior, c) => Math.max(maior, c.number), 0) + 1;
}

export function criarCenario(dados: DadosDoCenario, existentes: ParametricScenario[], agora: Date = new Date()): ParametricScenario {
    const number = proximoNumero(existentes);
    return {
        ...dados,
        bdiComposition: { ...dados.bdiComposition },
        sensitivity: { ...dados.sensitivity },
        id: `cenario-${number}-${agora.getTime()}`,
        number,
        name: `Cenário ${number} (${dados.standard})`,
        createdAt: agora.toISOString(),
    };
}

const fmtUmaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * O cenário em relação à simulação atual, em texto neutro ("12,3% abaixo do atual"). Antes era
 * "Variação VGV" (o valor é custo, não VGV), verde quando o atual ficava mais caro, vermelho em
 * 0% e "Infinity%" quando o cenário tinha R$ 0,00. Sem base para comparar → null.
 */
export function comparacaoComAtual(valorDoCenario: number, valorAtual: number): string | null {
    if (!numeroValido(valorDoCenario) || !numeroValido(valorAtual) || valorDoCenario <= 0 || valorAtual <= 0) return null;
    const diferenca = Math.round(((valorDoCenario / valorAtual) - 1) * 1000) / 10;
    if (diferenca === 0) return 'igual ao atual';
    return `${fmtUmaCasa.format(Math.abs(diferenca))}% ${diferenca < 0 ? 'abaixo' : 'acima'} do atual`;
}

const fmtArea = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** O que mudou no projeto desde que o cenário foi salvo (aplicar o cenário não volta ao mesmo valor). */
export function diferencasDeContexto(cenario: ParametricScenario, atual: { standard: string; area: number }): string[] {
    const diferencas: string[] = [];
    if (cenario.standard && cenario.standard !== atual.standard) {
        diferencas.push(`padrão ${cenario.standard} (hoje ${atual.standard})`);
    }
    if (cenario.area > 0 && cenario.area !== atual.area) {
        diferencas.push(`área ${fmtArea.format(cenario.area)} m² (hoje ${fmtArea.format(atual.area)} m²)`);
    }
    return diferencas;
}

const fmtDuasCasas = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatarPercentual = (valor: number): string => `${fmtDuasCasas.format(valor)}%`;

export const formatarFatorK = (k: number): string => `x${fmtDuasCasas.format(k)}`;

const fmtSinal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

/** "+5%", "−2%", "0%" — variação de sensibilidade. */
export const formatarVariacao = (valor: number): string => `${fmtSinal.format(valor)}%`;

/** "17/11/2026 14:05" — com a data: cenário gravado no projeto atravessa dias. */
export function formatarDataHora(iso: string): string {
    const data = new Date(iso);
    if (!iso || Number.isNaN(data.getTime())) return '';
    return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
