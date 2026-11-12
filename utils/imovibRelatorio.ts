/**
 * Relatório completo do estudo (item 10.5 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Puro: as 12 seções
 * em texto e tabelas já formatados (pt-BR); utils/imovibRelatorioPdf.ts desenha.
 * Seção sem dado sai com a frase de vazio (`vazio`), não some.
 * Testes: __tests__/imovibRelatorio.test.ts.
 */
import type { ImovibStudy, ImovibRisk, ImovibScenario, ImovibLandChecklistItem } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { computeImovibMath } from './imovibMotor';
import { calcularIndicadores } from './imovibIndicadores';
import { memorialDePremissas } from './imovibMemorial';
import { criteriosDoParecer, ROTULO_DO_PARECER } from './imovibParecer';
import { terrenoMaximo, precoMinimo, custoMaximoDeObra, vendasMinimas, type PontoDeEquilibrio } from './imovibEquilibrio';
import { resumoDosComparaveis, type ImovibComparable } from './imovibMercado';
import { marcosDoEstudo } from './imovibCronograma';
import { aplicarCenario } from './imovibCenarios';
import { compararRegimes } from './imovibComparacaoDeRegimes';
import { ROTULO_DO_REGIME, type RegimeTributarioDoEstudo } from './imovibTributos';
import { resultadoPorSocio, type ImovibPartner } from './imovibSocios';
import { descreverFonte } from './imovibFontes';

export const ORDEM_DAS_SECOES = ['capa', 'indicadores', 'premissas', 'mercado', 'produto', 'cronograma', 'fluxo', 'sensibilidade', 'riscos', 'due_diligence', 'tributos', 'capital'] as const;
export type SecaoId = typeof ORDEM_DAS_SECOES[number];

export interface TabelaDoRelatorio { titulo?: string; colunas: string[]; linhas: string[][] }
export interface SecaoDoRelatorio {
    id: SecaoId;
    titulo: string;
    paragrafos: string[];
    tabelas: TabelaDoRelatorio[];
    /** A frase que substitui o conteúdo quando não há dado. */
    vazio: string | null;
}

export interface DadosDoRelatorio {
    study: ImovibStudy;
    comparaveis: ImovibComparable[];
    riscos: ImovibRisk[];
    cenarios: ImovibScenario[];
    dueDiligence: ImovibLandChecklistItem[];
    socios: ImovibPartner[];
    /** 'AAAA-MM-DD' de hoje (comparáveis e data do relatório). */
    hoje?: string;
}

const brl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v));
const pct = (v: number | null | undefined, casas = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`);
const num = (v: number | null | undefined, unidade = '') => (v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unidade ? ` ${unidade}` : ''}`);
const valorDoMemorial = (v: number | string | null, unidade: string) =>
    v == null ? '—' : typeof v === 'string' ? v : unidade === 'R$' ? brl(v) : unidade.startsWith('%') ? `${num(v)}${unidade}` : num(v, unidade);
const ponto = (p: PontoDeEquilibrio, f: (v: number) => string) =>
    p.valor == null ? (p.motivo === 'sem_vgv' ? 'Sem VGV' : p.motivo === 'acima_do_vgv' ? 'Nem vendendo tudo' : 'Não existe') : f(p.valor);
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const ROTULO_DO_RISCO: Record<ImovibRisk['category'], string> = { legal: 'Legal', mercado: 'Mercado', construcao: 'Construção', financeiro: 'Financeiro', ambiental: 'Ambiental', outro: 'Outro' };
const STATUS_DO_RISCO: Record<ImovibRisk['status'], string> = { aberto: 'Aberto', mitigado: 'Mitigado', aceito: 'Aceito', encerrado: 'Encerrado' };
const STATUS_DA_DD: Record<ImovibLandChecklistItem['status'], string> = { pendente: 'Pendente', ok: 'Ok', problema: 'Com problema', nao_se_aplica: 'Não se aplica' };

export function secoesDoRelatorio(d: DadosDoRelatorio): SecaoDoRelatorio[] {
    const { study } = d;
    const hoje = d.hoje ?? hojeISO();
    const r = computeImovibMath(study);
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    const ind = calcularIndicadores(r, tma);
    const secao = (id: SecaoId, titulo: string, s: Partial<SecaoDoRelatorio> = {}): SecaoDoRelatorio =>
        ({ id, titulo, paragrafos: [], tabelas: [], vazio: null, ...s });

    // 1. Capa e parecer
    const parecer = study.recommendation ? ROTULO_DO_PARECER[study.recommendation] : 'Não registrado';
    const capa = secao('capa', 'Capa e parecer', {
        paragrafos: [
            `Estudo: ${study.name}${study.version ? ` (v${study.version})` : ''}`,
            `Relatório gerado em ${dataBR(hoje)}`,
            `Parecer: ${parecer}${study.recommended_by ? `, por ${study.recommended_by}` : ''}${study.recommended_at ? ` em ${new Date(study.recommended_at).toLocaleDateString('pt-BR')}` : ''}`,
            ...(study.recommendation_notes ? [`Justificativa: ${study.recommendation_notes}`] : []),
        ],
        tabelas: [{
            titulo: 'Critérios',
            colunas: ['Critério', 'Estudo', 'Mínimo / limite', 'Atende'],
            linhas: criteriosDoParecer(study, r, ind).map(c => [
                c.rotulo,
                c.unidade === 'R$' ? brl(c.valor) : c.unidade === '%' ? pct(c.valor) : (c.valor == null ? 'Sem TIR' : `${num(c.valor)}% a.a.`),
                c.minimo == null ? 'Sem limite definido' : c.unidade === 'R$' ? brl(c.minimo) : c.unidade === '%' ? pct(c.minimo) : `${num(c.minimo)}% a.a.`,
                c.atende == null ? 'Sem como avaliar' : c.atende ? 'Sim' : 'Não',
            ]),
        }],
    });

    // 2. Indicadores e pontos de equilíbrio
    const indicadores = secao('indicadores', 'Indicadores e pontos de equilíbrio', {
        tabelas: [
            {
                colunas: ['Indicador', 'Valor'],
                linhas: [
                    ['VGV', brl(r.vgvTotal)],
                    ['VGV líquido', brl(r.netVgvTotal)],
                    ['VPL', brl(r.vpl)],
                    ['TIR', Number.isFinite(r.annualIrr) ? `${num(r.annualIrr)}% a.a.` : 'Sem TIR'],
                    ['VPL do projeto', brl(r.vplProjeto)],
                    ['TIR do projeto', Number.isFinite(r.annualIrrProjeto) ? `${num(r.annualIrrProjeto)}% a.a.` : 'Sem TIR'],
                    ['TMA', `${num(tma)}% a.a.`],
                    ['Lucro líquido', brl(ind.lucroLiquido)],
                    ['Margem líquida sobre o VGV', ind.margemLiquidaSobreVgv == null ? '—' : pct(ind.margemLiquidaSobreVgv * 100)],
                    ['Exposição máxima de caixa', brl(Math.max(0, -r.maxExposure))],
                    ['Payback simples', ind.paybackSimplesMes == null ? '—' : `mês ${ind.paybackSimplesMes}`],
                    ['Múltiplo do capital', ind.multiploDoCapital == null ? '—' : `${num(ind.multiploDoCapital)}x`],
                    ['Duração', num(r.duration, 'meses')],
                ],
            },
            {
                titulo: 'Pontos de equilíbrio',
                colunas: ['Ponto', 'Valor'],
                linhas: [
                    ['Valor máximo do terreno (VPL zero)', ponto(terrenoMaximo(study, { tipo: 'vpl_zero' }), brl)],
                    ['Variação de preço que zera o VPL', ponto(precoMinimo(study), v => pct(v))],
                    ['Variação do custo de obra que zera o VPL', ponto(custoMaximoDeObra(study), v => pct(v))],
                    ['Vendas mínimas', ponto(vendasMinimas(study), v => `${pct(v)} do VGV vendável`)],
                ],
            },
        ],
    });

    // 3. Premissas (memorial)
    const memorial = memorialDePremissas(study, { rubricasAtivas: r.capexRubricasAtivas });
    const semFonte = memorial.filter(l => !l.fonte).length;
    const premissas = secao('premissas', 'Premissas', {
        paragrafos: [`${semFonte} de ${memorial.length} premissas sem fonte anotada. "Padrão" é o valor do sistema para campo vazio.`],
        tabelas: [{
            colunas: ['Grupo', 'Premissa', 'Valor', 'Fonte', 'Data'],
            linhas: memorial.map(l => [l.grupo, l.premissa, `${valorDoMemorial(l.valor, l.unidade)}${l.ehPadrao ? ' (padrão)' : ''}`, l.fonte ?? '—', l.data ? dataBR(l.data) : '—']),
        }],
    });

    // 4. Mercado
    const resumo = resumoDosComparaveis(d.comparaveis, hoje);
    const mercado = d.comparaveis.length === 0
        ? secao('mercado', 'Mercado', { vazio: 'Sem comparáveis cadastrados (Premissas › Mercado).' })
        : secao('mercado', 'Mercado', {
            paragrafos: [
                `${resumo.n} comparáveis. Preço médio ${resumo.precoM2Medio == null ? '—' : `${brl(resumo.precoM2Medio)}/m²`}; VSO média ${resumo.vsoMediaMensal == null ? '—' : `${pct(resumo.vsoMediaMensal)} ao mês`}.`,
                `Preço do estudo: ${r.produto.vgvPorM2Privativo == null ? '—' : `${brl(r.produto.vgvPorM2Privativo)}/m²`}.`,
            ],
            tabelas: [{
                colunas: ['Empreendimento', 'Preço/m²', 'Vendidas / total', 'Lançamento', 'Distância'],
                linhas: d.comparaveis.map(c => [c.name, c.price_sqm ? brl(Number(c.price_sqm)) : '—', `${c.sold_units ?? '—'} / ${c.total_units ?? '—'}`,
                    c.launch_date ? c.launch_date.slice(0, 7).split('-').reverse().join('/') : '—', c.distance_km != null ? `${num(Number(c.distance_km))} km` : '—']),
            }],
        });

    // 5. Produto
    const p = r.produto;
    const produto = secao('produto', 'Produto', {
        tabelas: [{
            colunas: ['Indicador', 'Valor'],
            linhas: [
                ['Área privativa', num(r.totalPrivateArea, 'm²')],
                ['Área comum', num(r.totalCommonArea, 'm²')],
                ['Área construída', num(r.totalBlockArea, 'm²')],
                ['Eficiência', p.eficiencia == null ? (p.custoSemAreaComum ? 'Sem área comum cadastrada' : '—') : pct(p.eficiencia * 100)],
                ['Unidades à venda', String(p.unidadesVendaveis)],
                ['Tíquete médio', brl(p.ticketMedio)],
                ['VGV por m² privativo', p.vgvPorM2Privativo == null ? '—' : `${brl(p.vgvPorM2Privativo)}/m²`],
                ['Custo de obra por m² privativo', p.custoObraPorM2Privativo == null ? '—' : `${brl(p.custoObraPorM2Privativo)}/m²`],
            ],
        }],
    });

    // 6. Cronograma
    const cronograma = secao('cronograma', 'Cronograma', {
        paragrafos: [study.base_date ? `Data-base: ${study.base_date.split('-').reverse().join('/')}.` : 'Sem data-base: os meses saem numerados.'],
        tabelas: [{ colunas: ['Marco', 'Mês', 'Data'], linhas: marcosDoEstudo(study, r).map(m => [m.rotulo, m.mes == null ? '—' : `mês ${m.mes}`, m.data ? m.data.split('-').reverse().join('/') : '—']) }],
    });

    // 7. Fluxo anual
    const anos = new Map<number, { rec: number; cus: number; liq: number; acc: number }>();
    for (const f of r.monthlyFlows) {
        const ano = Math.ceil(f.month / 12);
        const a = anos.get(ano) ?? { rec: 0, cus: 0, liq: 0, acc: 0 };
        a.rec += f.rev; a.cus += f.cost; a.liq += f.net; a.acc = f.acc;
        anos.set(ano, a);
    }
    const fluxo = secao('fluxo', 'Fluxo de caixa anual', {
        paragrafos: ['Caixa do acionista (depois da dívida), sem desconto.'],
        tabelas: [{ colunas: ['Ano', 'Receitas', 'Custos', 'Caixa do ano', 'Acumulado no fim do ano'], linhas: [...anos.entries()].map(([ano, a]) => [`Ano ${ano}`, brl(a.rec), brl(a.cus), brl(a.liq), brl(a.acc)]) }],
    });

    // 8. Sensibilidade e cenários
    const sensibilidade = d.cenarios.length === 0
        ? secao('sensibilidade', 'Sensibilidade e cenários', { vazio: 'Sem cenários salvos (aba Sensibilidade e Risco).' })
        : secao('sensibilidade', 'Sensibilidade e cenários', {
            tabelas: [{
                colunas: ['Cenário', 'VPL', 'TIR'],
                linhas: [['Estudo', brl(r.vpl), Number.isFinite(r.annualIrr) ? `${num(r.annualIrr)}% a.a.` : 'Sem TIR'],
                    ...d.cenarios.map(c => {
                        const a = aplicarCenario(study, c.choques);
                        const rc = computeImovibMath(a.study, a.options);
                        return [c.name, brl(rc.vpl), Number.isFinite(rc.annualIrr) ? `${num(rc.annualIrr)}% a.a.` : 'Sem TIR'];
                    })],
            }],
        });

    // 9. Riscos
    const riscos = d.riscos.length === 0
        ? secao('riscos', 'Riscos', { vazio: 'Sem riscos cadastrados na matriz (aba Sensibilidade e Risco).' })
        : secao('riscos', 'Riscos', {
            tabelas: [{ colunas: ['Categoria', 'Risco', 'Prob.', 'Impacto', 'Mitigação', 'Situação'], linhas: d.riscos.map(x => [ROTULO_DO_RISCO[x.category], x.description, String(x.probability), String(x.impact), x.mitigation ?? '—', STATUS_DO_RISCO[x.status]]) }],
        });

    // 10. Due diligence
    const dueDiligence = d.dueDiligence.length === 0
        ? secao('due_diligence', 'Due diligence do terreno', { vazio: 'Due diligence não iniciada (Premissas › Terreno).' })
        : secao('due_diligence', 'Due diligence do terreno', {
            tabelas: [{ colunas: ['Item', 'Situação', 'Observação'], linhas: d.dueDiligence.map(x => [x.label, STATUS_DA_DD[x.status], x.notes ?? '—']) }],
        });

    // 11. Tributos
    const regime = (study.tax_regime ?? IMOVIB_DEFAULTS.tax_regime) as RegimeTributarioDoEstudo;
    const tributos = secao('tributos', 'Tributos', {
        paragrafos: [`Regime do estudo: ${ROTULO_DO_REGIME[regime]}. Alíquotas são hipóteses: confirme com a contabilidade.`],
        tabelas: [{ colunas: ['Regime', 'Imposto total', 'Alíquota efetiva', 'VPL', 'TIR'], linhas: compararRegimes(study).map(c => [ROTULO_DO_REGIME[c.regime], brl(c.impostoTotal), c.aliquotaEfetiva == null ? '—' : pct(c.aliquotaEfetiva * 100), brl(c.vpl), Number.isFinite(c.tir) ? `${num(c.tir)}% a.a.` : 'Sem TIR']) }],
    });

    // 12. Capital e sócios
    const socios = resultadoPorSocio(r.aportes, d.socios);
    const capital = secao('capital', 'Capital e sócios', {
        paragrafos: socios.avisos,
        tabelas: [
            { colunas: ['De onde vem o dinheiro', 'Valor'], linhas: [['Capital próprio', brl(r.capital.proprio)], ['Financiamento liberado', brl(r.capital.divida)], ['Vendas durante a obra', brl(r.capital.vendasNaObra)], ['Permuta', brl(r.capital.permuta)], ['Outras fontes', brl(r.capital.terceiros)]] },
            ...((study.funding_sources ?? []).length ? [{ titulo: 'Outras fontes de capital', colunas: ['Fonte', 'Valor', 'Como é paga'], linhas: (study.funding_sources ?? []).map(f => [f.name, brl(Number(f.amount) || 0), descreverFonte(f)]) }] : []),
            ...(d.socios.length ? [{ titulo: 'Sócios', colunas: ['Sócio', '% do resultado', '% dos aportes', 'Aporta', 'Recebe', 'Lucro', 'TIR'], linhas: d.socios.map((s, i) => { const x = socios.socios[i]; return [s.name, pct(Number(s.share_percent)), pct(Number(s.capital_percent)), brl(x.aportes), brl(x.distribuicoes), brl(x.lucro), Number.isNaN(x.tirAnual) ? '—' : `${num(x.tirAnual)}% a.a.`]; }) }] : []),
        ],
    });

    return [capa, indicadores, premissas, mercado, produto, cronograma, fluxo, sensibilidade, riscos, dueDiligence, tributos, capital];
}
