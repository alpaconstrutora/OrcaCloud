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
import { conferenciaDeCargaTermica, type ItemConferido } from './blueprintConferenciaClimatizacao';
import type { BlueprintModel } from './blueprintKernel';
import { TIPOS_DE_CLIMATIZACAO, TIPOS_DE_TERMINAL_DE_AR } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { numeracaoDeClimatizacao } from './blueprintNumeracaoClimatizacao';
import { FONTE_DAS_FAIXAS, conferenciaDaLinha, drenosConferidos, drenosTrechoATrecho, linhasConferidas } from './blueprintLinhaFrigorigena';
import { analisesDoNivel, conferenciaDoVrf } from './blueprintVrf';
import { analisarRedesDeAr, conferenciaDaRedeDeAr, nomeDaSecao, vazoesDosTerminais, ventilacaoDoNivel } from './blueprintRedeDeAr';

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
export function memorialDeCalculoClimatizacao(niveis: CargaTermicaDoNivel[], hip: HipotesesClimatizacao, ctx: ContextoDoMemorial, model?: BlueprintModel): BlocoDoMemorial[] {
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
  // E8.3 (07/10/2026): com o desenho, as instalações — equipamentos, linha e dreno, VRF e rede de ar.
  if (model) b.push(...memorialDasInstalacoesClimatizacao(model, niveis, hip, ctx, 5));
  return b;
}

const tabelaDaConferencia = (titulo: string, itens: readonly ItemConferido[]): BlocoDoMemorial => ({
  tipo: 'tabela',
  cabecalho: [titulo, 'Estado', 'Obtido'],
  linhas: itens.map((i) => [i.item, i.estado.replace('_', ' ').toLowerCase(), i.obtido]),
});
const ouTraco = (v: number | null | undefined, f: (x: number) => string) => (v == null ? '—' : f(v));

/**
 * E8.3 da climatização (07/10/2026): as INSTALAÇÕES no memorial de cálculo —
 * os equipamentos com o número do desenho, a linha frigorígena e o dreno
 * (faixa pela capacidade, comprimento, desnível, gás adicional), o VRF (taxa
 * de combinação, comprimentos) e a rede de ar (vazão, seção, velocidade,
 * perda, renovação). As mesmas funções dos painéis — o que a tela confere é o
 * que o memorial escreve. Cada seção só sai se o desenho tem do que falar.
 */
export function memorialDasInstalacoesClimatizacao(model: BlueprintModel, niveis: CargaTermicaDoNivel[], hip: HipotesesClimatizacao, ctx: ContextoDoMemorial, primeira = 1): BlocoDoMemorial[] {
  const b: BlocoDoMemorial[] = [];
  let n = primeira;
  const secao = (texto: string) => b.push({ tipo: 'secao', texto: `${n++}. ${texto}` });
  const ordem = [...model.levels].sort((a, c) => a.elevationMm - c.elevationMm);
  const numeros = numeracaoDeClimatizacao(model);

  const pecas = (model.terminais ?? []).filter((t) => t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico));
  if (pecas.length) {
    secao('Equipamentos e terminais');
    const nivelDe = new Map(ordem.map((l, i) => [l.id, i]));
    const linhas = [...pecas]
      .sort((a, c) => (nivelDe.get(a.levelId) ?? 0) - (nivelDe.get(c.levelId) ?? 0) || (numeros.get(a.id)?.numero ?? '').localeCompare(numeros.get(c.id)?.numero ?? '', 'pt-BR', { numeric: true }))
      .map((t) => [
        numeros.get(t.id)?.numero ?? '—',
        FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].rotulo,
        ctx.nomeDoNivel(t.levelId),
        ouTraco(t.capacidadeBtuH, n0),
        ouTraco(t.vazaoM3h, n0),
        n0(t.cotaMm),
      ]);
    b.push({ tipo: 'tabela', cabecalho: ['Nº', 'Peça', 'Pavimento', 'Capacidade (BTU/h)', 'Vazão (m³/h)', 'Cota (mm)'], linhas });
    if (pecas.some((t) => t.tipoHidraulico!.startsWith('EVAPORADORA') && t.capacidadeBtuH == null)) b.push({ tipo: 'paragrafo', texto: 'Há evaporadora sem capacidade declarada: a linha e o VRF dessa peça não se dimensionam até declarar (painel da peça ou seleção pela carga).' });
  }

  const linhasPorNivel = ordem.map((l) => ({ l, linhas: linhasConferidas(model, l.id, hip.linha), drenos: drenosConferidos(model, l.id) })).filter((x) => x.linhas.length || x.drenos.length);
  const drenos = drenosTrechoATrecho(model, hip.linha.declividadeDrenoPct);
  if (linhasPorNivel.length || drenos.length) {
    secao('Linha frigorígena e dreno de condensado');
    b.push({ tipo: 'paragrafo', texto: `Faixas pela capacidade (Ø líquido/sucção, comprimento e desnível máximos, carga adicional de gás): HIPÓTESE. ${FONTE_DAS_FAIXAS} Linha já coberta pela carga de fábrica: ${n0(hip.linha.preCargaM)} m. Dreno por gravidade com declividade mínima de ${n1(hip.linha.declividadeDrenoPct)} %.` });
    for (const { l, linhas } of linhasPorNivel) {
      if (!linhas.length) continue;
      b.push({ tipo: 'subsecao', texto: ctx.nomeDoNivel(l.id) });
      b.push({
        tipo: 'tabela',
        cabecalho: ['Sistema', 'Capacidade (BTU/h)', 'Comprimento (m)', 'Desnível (m)', 'Ø líquido (mm)', 'Ø sucção (mm)', 'Isolamento (mm)', 'Gás adicional (g)', 'Curvas', 'Pendências'],
        linhas: linhas.map((x) => [
          x.nome,
          ouTraco(x.capacidadeBtuH, n0),
          `${ouTraco(x.comprimentoM, n1)} (máx. ${n0(x.faixa.comprimentoMaxM)})`,
          `${n1(x.desnivelM)} (máx. ${n0(x.faixa.desnivelMaxM)})`,
          `${x.dnLiquidoMm.join(', ') || '—'} (pede ${x.faixa.liquidoMm})`,
          `${x.dnSuccaoMm.join(', ') || '—'} (pede ${x.faixa.succaoMm})`,
          ouTraco(x.isolamentoMinMm, n0),
          ouTraco(x.gasAdicionalG, n0),
          `${x.curvas} (raio ≥ ${n0(x.raioMinimoMm)} mm)`,
          x.pendencias.join(' ') || '—',
        ]),
      });
      b.push(tabelaDaConferencia(`Conferência da linha — ${ctx.nomeDoNivel(l.id)}`, conferenciaDaLinha(model, l.id, hip.linha)));
    }
    if (drenos.length) {
      const porGravidade = drenos.filter((d) => d.declividadePct != null);
      const abaixo = porGravidade.filter((d) => d.declividadePct! < d.declividadeMinimaPct - 1e-9);
      b.push({ tipo: 'paragrafo', texto: `Dreno: ${drenos.length} trecho(s), ${porGravidade.length} por gravidade${abaixo.length ? ` — ${abaixo.length} abaixo da declividade mínima (menor: ${n2(Math.min(...abaixo.map((d) => d.declividadePct!)))} %)` : porGravidade.length ? ', todos com a declividade mínima' : ''}; ${drenos.length - porGravidade.length} em prumada ou recalque (bomba de dreno).` });
      const semDescarte = linhasPorNivel.flatMap((x) => x.drenos.filter((d) => !d.chega).map((d) => d.nome));
      if (semDescarte.length) b.push({ tipo: 'paragrafo', texto: `Evaporadora(s) cujo dreno não chega a um descarte: ${semDescarte.join(', ')}.` });
    }
  }

  const vrf = ordem.map((l) => ({ l, analises: analisesDoNivel(model, l.id) })).filter((x) => x.analises.length);
  if (vrf.length) {
    secao('Sistemas VRF');
    const v = hip.vrf;
    b.push({ tipo: 'paragrafo', texto: `Limites do fabricante (HIPÓTESE — CONFERIR com o catálogo do equipamento): taxa de combinação ${n0(v.taxaMinPct)}–${n0(v.taxaMaxPct)} %; tubulação total ≤ ${n0(v.comprimentoTotalMaxM)} m; até a evaporadora mais distante ≤ ${n0(v.ateMaisDistanteMaxM)} m; após a 1ª derivação ≤ ${n0(v.aposPrimeiraDerivacaoMaxM)} m; desnível condensadora–evaporadora ≤ ${n0(v.desnivelCondEvapMaxM)} m e entre evaporadoras ≤ ${n0(v.desnivelEntreEvapMaxM)} m.` });
    for (const { l, analises } of vrf) {
      b.push({ tipo: 'subsecao', texto: ctx.nomeDoNivel(l.id) });
      b.push({
        tipo: 'tabela',
        cabecalho: ['Sistema', 'Evaporadoras', 'Σ evaporadoras (BTU/h)', 'Condensadora (BTU/h)', 'Taxa (%)', 'Total (m)', 'Mais distante (m)', 'Após 1ª derivação (m)', 'Desnível C–E / E–E (m)'],
        linhas: analises.map((a) => [
          a.sistema.nome,
          `${a.sistema.evaporadoras.length}${a.naoAlcancadas.length ? ` (${a.naoAlcancadas.length} sem linha)` : ''}`,
          ouTraco(a.somaBtuH, n0),
          ouTraco(a.capacidadeBtuH, n0),
          ouTraco(a.taxaPct, n0),
          ouTraco(a.comprimentoTotalM, n1),
          ouTraco(a.maisDistanteM, n1),
          ouTraco(a.aposPrimeiraDerivacaoM, n1),
          `${n1(a.desnivelCondEvapM)} / ${n1(a.desnivelEntreEvapM)}`,
        ]),
      });
      b.push(tabelaDaConferencia(`Conferência do VRF — ${ctx.nomeDoNivel(l.id)}`, conferenciaDoVrf(model, l.id, hip.vrf)));
    }
  }

  const ar = niveis
    .map((c) => {
      const vazoes = vazoesDosTerminais(model, c, hip.ar);
      return { c, redes: analisarRedesDeAr(model, c.levelId, vazoes, hip.ar), ventilacao: ventilacaoDoNivel(model, c, hip.ar) };
    })
    .filter((x) => x.redes.length || x.ventilacao.some((v) => v.exaustores || v.tomadasDeAr || v.falta));
  if (ar.length) {
    secao('Rede de ar, ventilação e exaustão');
    const h = hip.ar;
    b.push({ tipo: 'paragrafo', texto: `Dimensionamento por ${h.metodo === 'VELOCIDADE' ? `velocidade (tronco ${n1(h.velocidadeTroncoMs)} m/s, ramal ${n1(h.velocidadeRamalMs)} m/s)` : `igual atrito (${n1(h.perdaPorAtritoPaM)} Pa/m)`}; perda por atrito pela equação de Darcy-Weisbach com o fator de Swamee-Jain; vazão de insuflamento pelo calor sensível com ΔT de ${n0(h.dtInsuflamentoK)} K; pressão estática disponível ${n0(h.pressaoDisponivelPa)} Pa. Velocidades, perdas localizadas e taxas de renovação e exaustão: HIPÓTESE — CONFERIR NA NORMA (NBR 16401-1 e -3).` });
    for (const { c, redes, ventilacao } of ar) {
      b.push({ tipo: 'subsecao', texto: ctx.nomeDoNivel(c.levelId) });
      for (const r of redes) {
        b.push({ tipo: 'paragrafo', texto: `Rede de ${numeros.get(r.raiz.id)?.numero ?? 'equipamento'}: ${n0(r.vazaoTotalM3h)} m³/h, caminho crítico ${n0(r.perdaCriticaPa)} Pa de ${n0(r.pressaoDisponivelPa)} Pa disponíveis — ${r.atende ? 'atende' : 'NÃO atende'}.${r.semVazao.length ? ` ${r.semVazao.length} terminal(is) sem vazão.` : ''}` });
        if (r.trechos.length) b.push({ tipo: 'tabela', cabecalho: ['Seção', 'Vazão (m³/h)', 'Terminais a jusante', 'Velocidade (m/s)', 'Atrito (Pa)', 'Proposta'], linhas: r.trechos.map((t) => [nomeDaSecao(t.secao), n0(t.vazaoM3h), String(t.terminais), `${n1(t.velocidadeMs)}${t.velocidadeAlta ? ' (alta)' : ''}`, n1(t.atritoPa), nomeDaSecao(t.proposta)]) });
      }
      const amb = ventilacao.filter((v) => v.exaustores || v.tomadasDeAr || v.falta || v.exaustaoM3h || v.renovacaoM3h);
      if (amb.length) b.push({ tipo: 'tabela', cabecalho: ['Ambiente', 'Renovação (m³/h)', 'Exaustão (m³/h)', 'Exaustores', 'Tomadas de ar', 'Falta'], linhas: amb.map((v) => [v.nome, n0(v.renovacaoM3h), n0(v.exaustaoM3h), String(v.exaustores), String(v.tomadasDeAr), v.falta ?? '—']) });
      b.push(tabelaDaConferencia(`Conferência da rede de ar — ${ctx.nomeDoNivel(c.levelId)}`, conferenciaDaRedeDeAr(redes, ventilacao, h)));
    }
  }
  return b;
}


/** O memorial DESCRITIVO: o que foi considerado, em prosa, para o leitor que não vai conferir número a número. */
export function memorialDescritivoClimatizacao(niveis: CargaTermicaDoNivel[], hip: HipotesesClimatizacao, ctx: ContextoDoMemorial, model?: BlueprintModel): BlocoDoMemorial[] {
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
  let proxima = 4;
  if (model) {
    // E8.3: o que o desenho instala, em prosa.
    const pecas = (model.terminais ?? []).filter((t) => t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico));
    const conta = (pred: (tipo: string) => boolean) => pecas.filter((t) => pred(t.tipoHidraulico!)).length;
    const evap = conta((x) => x.startsWith('EVAPORADORA'));
    const split = conta((x) => x === 'CONDENSADORA_SPLIT');
    const vrf = conta((x) => x === 'CONDENSADORA_VRF');
    const terminaisDeAr = conta((x) => (TIPOS_DE_TERMINAL_DE_AR as readonly string[]).includes(x));
    const exaustores = conta((x) => x === 'EXAUSTOR_AR');
    const cap = pecas.filter((t) => t.tipoHidraulico!.startsWith('EVAPORADORA')).reduce((s, t) => s + (t.capacidadeBtuH ?? 0), 0);
    const metros = (disc: string) => (model.trechos ?? []).filter((t) => t.disciplina === disc).reduce((s, t) => s + Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm), 0) / 1000;
    const temRede = metros('FRIGORIGENA') > 0 || metros('DRENO_AC') > 0 || metros('MECANICA') > 0;
    b.push({ tipo: 'secao', texto: `${proxima++}. Instalações` });
    b.push({
      tipo: 'paragrafo',
      texto: pecas.length || temRede
        ? `${evap} evaporadora(s) (${n0(cap)} BTU/h declarados), ${split} condensadora(s) split e ${vrf} VRF; ${n1(metros('FRIGORIGENA'))} m de linha frigorígena em cobre isolado, ${n1(metros('DRENO_AC'))} m de dreno de condensado e ${n1(metros('MECANICA'))} m de duto; ${terminaisDeAr} terminal(is) de ar e ${exaustores} exaustor(es). Diâmetros, comprimentos e conferências no memorial de cálculo; símbolos, números e detalhes típicos nas pranchas de climatização.`
        : 'O desenho ainda não tem equipamento nem rede de climatização: este memorial cobre só a carga térmica.',
    });
  }
  b.push({ tipo: 'secao', texto: `${proxima}. O que fica a cargo do responsável` });
  b.push({ tipo: 'paragrafo', texto: 'Conferir as tabelas marcadas contra o texto das normas e o catálogo do fabricante do equipamento escolhido; declarar vidro, camadas de parede/cobertura e ocupação onde o cálculo usou valor típico; confirmar o equipamento pela carga total e pela razão sensível/latente, e a linha, o dreno e os dutos pelos limites do fabricante.' });
  return b;
}
