/**
 * MEMORIAL DE CARGA TÉRMICA (04/10/2026, E2.4 da climatização): o cálculo do
 * motor em blocos (`BlocoDoMemorial`, o mesmo tipo do hidro/elétrica/incêndio),
 * para o PDF e o DOCX pelo serviço que já existe. O que a tela mostra é o que
 * o memorial escreve — mesma função, mesmos números.
 *
 * O memorial diz, no topo, o que é HIPÓTESE/CONFERIR: sem o texto das normas
 * no repositório, ele orienta o pré-dimensionamento, não aprova.
 */
import type { BlocoDoMemorial } from './blueprintMemorialHidro';
import type { HipotesesClimatizacao } from './blueprintClimatizacao';
import { FONTE_DO_CLIMA, FONTE_DO_CONFORTO, FONTE_DO_MOTOR } from './blueprintClimatizacao';
import { FONTE_DO_PADRAO_POR_USO, ROTULO_DA_ATIVIDADE } from './blueprintClimatizacaoAmbientes';
import { CALOR_POR_ATIVIDADE, IRRADIANCIA_POR_ORIENTACAO, type CargaDoAmbiente, type CargaTermicaDoNivel, type Parcela } from './blueprintCargaTermica';
import { ROTULO_DA_EXPOSICAO } from './blueprintExposicaoTermica';
import { conferenciaDeCargaTermica } from './blueprintConferenciaClimatizacao';

export interface ContextoDoMemorial {
  nomeDoEstudo: string;
  geradoEm: string;
  nomeDoNivel: (levelId: string) => string;
}

const n0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const marca = (p: Parcela) => (p.origem === 'HIPOTESE' ? ' *' : p.origem === 'NAO_AVALIADA' ? ' (não avaliada)' : '');
const w = (p: Parcela) => (p.origem === 'NAO_AVALIADA' ? '—' : n0(p.sensivelW));
const wl = (p: Parcela) => (p.origem === 'NAO_AVALIADA' ? '—' : n0(p.latenteW));

function linhasDasParcelas(a: CargaDoAmbiente): string[][] {
  const l: string[][] = [];
  for (const f of a.paredes) l.push([`${f.descricao} (${n2(f.areaLiquidaM2)} m²)${marca(f.parcela)}`, w(f.parcela), wl(f.parcela), f.parcela.memoria]);
  for (const v of a.vaos) {
    l.push([`${v.descricao} · condução (${n2(v.areaM2)} m²)${marca(v.conducao)}`, w(v.conducao), wl(v.conducao), v.conducao.memoria]);
    if (v.insolacao.memoria !== 'porta opaca') l.push([`${v.descricao} · insolação${marca(v.insolacao)}`, w(v.insolacao), wl(v.insolacao), v.insolacao.memoria]);
  }
  l.push([`Teto (${ROTULO_DA_EXPOSICAO[a.exposicao.teto.tipo]})${marca(a.teto)}`, w(a.teto), wl(a.teto), a.teto.memoria]);
  l.push([`Piso (${ROTULO_DA_EXPOSICAO[a.exposicao.piso.tipo]})${marca(a.piso)}`, w(a.piso), wl(a.piso), a.piso.memoria]);
  l.push([`Pessoas${marca(a.pessoas)}`, w(a.pessoas), wl(a.pessoas), a.pessoas.memoria]);
  l.push([`Iluminação${marca(a.iluminacao)}`, w(a.iluminacao), wl(a.iluminacao), a.iluminacao.memoria]);
  l.push([`Equipamentos${marca(a.equipamentos)}`, w(a.equipamentos), wl(a.equipamentos), a.equipamentos.memoria]);
  if (a.fonteExtra.sensivelW || a.fonteExtra.latenteW) l.push(['Fonte extra', w(a.fonteExtra), wl(a.fonteExtra), a.fonteExtra.memoria]);
  l.push([`Infiltração${marca(a.infiltracao)}`, w(a.infiltracao), wl(a.infiltracao), a.infiltracao.memoria]);
  l.push(['TOTAL', n0(a.sensivelW), n0(a.latenteW), `${n0(a.totalW)} W = ${n0(a.totalBtuH)} BTU/h · ${a.wPorM2} W/m²`]);
  return l;
}

/** O memorial de CÁLCULO: condições, hipóteses, cada ambiente climatizado com as parcelas, totais e conferência. */
export function memorialDeCalculoClimatizacao(niveis: CargaTermicaDoNivel[], hip: HipotesesClimatizacao, ctx: ContextoDoMemorial): BlocoDoMemorial[] {
  const b: BlocoDoMemorial[] = [];
  const todos = niveis.flatMap((n) => n.ambientes.filter((a) => a.climatizado));
  b.push({ tipo: 'titulo', texto: `Memorial de cálculo — carga térmica de verão · ${ctx.nomeDoEstudo}` });
  b.push({ tipo: 'paragrafo', texto: `Gerado em ${new Date(ctx.geradoEm).toLocaleString('pt-BR')} a partir do desenho e das premissas do estudo. Método simplificado de pico de verão (NBR 16655-3): condução pela envoltória com temperatura equivalente, insolação pelos vidros, cargas internas e infiltração.` });
  const conferir = niveis.some((n) => n.conferir);
  if (conferir) b.push({ tipo: 'paragrafo', texto: '⚠ CONFERIR NA NORMA: as parcelas marcadas com * usam hipótese de projeto ou tabela transcrita de memória (NBR 16655-3, NBR 16401-1, NBR 15220). O resultado orienta o pré-dimensionamento e não substitui a conferência do responsável técnico.' });

  const c = niveis[0]?.condicoes;
  b.push({ tipo: 'secao', texto: '1. Condições de projeto' });
  if (c) {
    b.push({
      tipo: 'tabela',
      cabecalho: ['Grandeza', 'Valor', 'Origem'],
      linhas: [
        ['Cidade', c.cidade.valor ?? '—', c.cidade.origem.toLowerCase().replace('_', ' ')],
        ['TBS externa', c.tbsC.valor == null ? '—' : `${n1(c.tbsC.valor)} °C`, c.tbsC.origem.toLowerCase()],
        ['TBU externa', c.tbuC.valor == null ? '—' : `${n1(c.tbuC.valor)} °C`, c.tbuC.origem.toLowerCase()],
        ['Altitude', c.altitudeM.valor == null ? '—' : `${n0(c.altitudeM.valor)} m`, c.altitudeM.origem.toLowerCase()],
        ['Temperatura interna (estudo)', `${n1(hip.conforto.temperaturaInternaC)} °C`, 'declarada'],
        ['Umidade relativa interna', `${n0(hip.conforto.umidadeRelativaPct)} %`, 'declarada'],
      ],
    });
  }
  b.push({ tipo: 'paragrafo', texto: `${FONTE_DO_CONFORTO} ${FONTE_DO_CLIMA}` });

  b.push({ tipo: 'secao', texto: '2. Hipóteses do motor' });
  const m = hip.motor;
  b.push({
    tipo: 'tabela',
    cabecalho: ['Hipótese', 'Valor'],
    linhas: [
      ['U típico de parede / cobertura / laje', `${n2(m.uParedePadraoWm2K)} / ${n2(m.uCoberturaPadraoWm2K)} / ${n2(m.uLajePadraoWm2K)} W/m²·K`],
      ['U típico de vidro / porta', `${n2(m.uVidroPadraoWm2K)} / ${n2(m.uPortaPadraoWm2K)} W/m²·K`],
      ['Fator solar típico do vidro', n2(m.fatorSolarPadrao)],
      ['Acréscimo solar: cobertura / parede (oeste)', `${n0(m.acrescimoSolarCoberturaK)} / ${n0(m.acrescimoSolarParedeK)} K`],
      ['Fração do ΔT para vizinho não climatizado', n2(m.fracaoDeltaTNaoClimatizado)],
      ['Infiltração', `${n2(m.trocasDeArPorHora)} trocas/h`],
      ['Fator de uso de luz e equipamentos', n2(m.fatorDeUsoInterno)],
      ['Irradiância por orientação (W/m²)', Object.entries(IRRADIANCIA_POR_ORIENTACAO).map(([k, v]) => `${k} ${v}`).join(' · ')],
      ['Calor por pessoa (sensível + latente, W)', Object.entries(CALOR_POR_ATIVIDADE).map(([k, v]) => `${ROTULO_DA_ATIVIDADE[k as keyof typeof ROTULO_DA_ATIVIDADE]}: ${v.sensivelW}+${v.latenteW}`).join(' · ')],
    ],
  });
  b.push({ tipo: 'paragrafo', texto: `${FONTE_DO_MOTOR} ${FONTE_DO_PADRAO_POR_USO}` });

  b.push({ tipo: 'secao', texto: '3. Carga por ambiente' });
  if (todos.length === 0) b.push({ tipo: 'paragrafo', texto: 'Nenhum ambiente climatizado no desenho.' });
  for (const n of niveis) {
    const clim = n.ambientes.filter((a) => a.climatizado);
    if (clim.length === 0) continue;
    b.push({ tipo: 'subsecao', texto: `${ctx.nomeDoNivel(n.levelId)} — ${n0(n.totalW)} W (${n0(n.totalBtuH)} BTU/h)${n.deltaTExternoK != null ? ` · ΔT ${n1(n.deltaTExternoK)} K` : ' · sem TBS'}` });
    for (const a of clim) {
      b.push({ tipo: 'paragrafo', texto: `${a.nome} — ${n1(a.areaPisoM2)} m², ${n1(a.volumeM3)} m³, ${n1(a.temperaturaInternaC)} °C, ${a.premissas.pessoas.valor} pessoa(s) (${ROTULO_DA_ATIVIDADE[a.premissas.atividade.valor].toLowerCase()}).${a.pendencias.length ? ` Pendências: ${a.pendencias.join(' ')}` : ''}` });
      b.push({ tipo: 'tabela', cabecalho: ['Parcela', 'Sensível (W)', 'Latente (W)', 'Como saiu'], linhas: linhasDasParcelas(a) });
    }
  }

  b.push({ tipo: 'secao', texto: '4. Resumo e conferência' });
  b.push({
    tipo: 'tabela',
    cabecalho: ['Pavimento', 'Sensível (W)', 'Latente (W)', 'Total (W)', 'BTU/h'],
    linhas: [...niveis.map((n) => [ctx.nomeDoNivel(n.levelId), n0(n.totalSensivelW), n0(n.totalLatenteW), n0(n.totalW), n0(n.totalBtuH)]), ['Estudo', n0(niveis.reduce((s, n) => s + n.totalSensivelW, 0)), n0(niveis.reduce((s, n) => s + n.totalLatenteW, 0)), n0(niveis.reduce((s, n) => s + n.totalW, 0)), n0(niveis.reduce((s, n) => s + n.totalBtuH, 0))]],
  });
  for (const n of niveis) {
    const conf = conferenciaDeCargaTermica(n);
    b.push({ tipo: 'tabela', cabecalho: [`Conferência — ${ctx.nomeDoNivel(n.levelId)}`, 'Estado', 'Obtido'], linhas: conf.itens.map((i) => [i.item, i.estado.replace('_', ' ').toLowerCase(), i.obtido]) });
  }
  return b;
}

/** O memorial DESCRITIVO: o que foi considerado, em prosa, para o leitor que não vai conferir número a número. */
export function memorialDescritivoClimatizacao(niveis: CargaTermicaDoNivel[], hip: HipotesesClimatizacao, ctx: ContextoDoMemorial): BlocoDoMemorial[] {
  const b: BlocoDoMemorial[] = [];
  const todos = niveis.flatMap((n) => n.ambientes.filter((a) => a.climatizado));
  const c = niveis[0]?.condicoes;
  b.push({ tipo: 'titulo', texto: `Memorial descritivo — climatização · ${ctx.nomeDoEstudo}` });
  b.push({ tipo: 'secao', texto: '1. Objeto' });
  b.push({ tipo: 'paragrafo', texto: `Estimativa da carga térmica de verão de ${todos.length} ambiente(s) climatizado(s) em ${niveis.length} pavimento(s), para pré-dimensionamento dos equipamentos de ar-condicionado. Total: ${n0(niveis.reduce((s, n) => s + n.totalW, 0))} W (${n0(niveis.reduce((s, n) => s + n.totalBtuH, 0))} BTU/h).` });
  b.push({ tipo: 'secao', texto: '2. Normas e método' });
  b.push({ tipo: 'paragrafo', texto: 'NBR 16655-3 (cargas térmicas em instalações residenciais), NBR 16401-1 (parâmetros de projeto, ocupação e renovação), NBR 15220 (desempenho térmico — transmitância das camadas). Método simplificado de pico: condução pela envoltória com temperatura equivalente ao sol, insolação pelos vidros com fator solar e proteção, cargas internas de pessoas, iluminação e equipamentos, infiltração por trocas de ar. Valores não transcritos da norma estão marcados CONFERIR NA NORMA no memorial de cálculo.' });
  b.push({ tipo: 'secao', texto: '3. Condições e ambientes' });
  b.push({ tipo: 'paragrafo', texto: c ? `Local: ${c.cidade.valor ?? 'não informado'}; TBS ${c.tbsC.valor == null ? 'não informada' : `${n1(c.tbsC.valor)} °C`}, TBU ${c.tbuC.valor == null ? 'não informada' : `${n1(c.tbuC.valor)} °C`}; interno ${n1(hip.conforto.temperaturaInternaC)} °C / ${n0(hip.conforto.umidadeRelativaPct)} %.` : 'Sem condições de projeto.' });
  if (todos.length) b.push({ tipo: 'tabela', cabecalho: ['Ambiente', 'Pavimento', 'Área (m²)', 'Teto', 'Piso', 'Total (W)', 'BTU/h'], linhas: niveis.flatMap((n) => n.ambientes.filter((a) => a.climatizado).map((a) => [a.nome, ctx.nomeDoNivel(n.levelId), n1(a.areaPisoM2), ROTULO_DA_EXPOSICAO[a.exposicao.teto.tipo], ROTULO_DA_EXPOSICAO[a.exposicao.piso.tipo], n0(a.totalW), n0(a.totalBtuH)])) });
  b.push({ tipo: 'secao', texto: '4. O que fica a cargo do responsável' });
  b.push({ tipo: 'paragrafo', texto: 'Conferir as tabelas marcadas contra o texto das normas; declarar vidro, camadas de parede/cobertura e ocupação onde o cálculo usou valor típico; escolher o equipamento pela carga total e pela razão sensível/latente (a seleção automática por catálogo é a etapa seguinte do roadmap).' });
  return b;
}
