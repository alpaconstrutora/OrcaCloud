/**
 * Casa automática — etapa(s) `instalacoes` de `planejarComPavimentos`, extraída(s) com o
 * `ContextoDaCasa` (P2, 12/11/2026). O marco das 8 casas prova que o motor gera o mesmo.
 */
import { applyBatch, conflitosDoModelo, distanciaEntreEixos3D, envelopeDoTrecho, point, pointInPolygon } from '../blueprintKernel';
import type { Command, ObjectId, Point } from '../blueprintKernel';
import { HIPOTESES_DO_GERADOR_PADRAO } from '../blueprintGerador';
import type { Retangulo } from '../blueprintGerador';
import { comandosDasAncoras } from '../blueprintAncorasDaCasa';
import type { ResultadoDasAncoras } from '../blueprintAncorasDaCasa';
import { HIPOTESES_HIDRO_PADRAO } from '../blueprintMemorialHidro';
import type { HipotesesHidro } from '../blueprintMemorialHidro';
import { comandosDeMobiliario, mobiliarNivel } from '../blueprintMobiliario';
import { planejarPontosDoNivel, pontosDasLoucasCriadas } from '../blueprintPontosHidraulicos';
import type { HipotesesDePontos } from '../blueprintPontosHidraulicos';
import { planejarAguaCompleta } from '../blueprintAguaCompleta';
import { cotaEnterradaAcimaDasRedes, planejarAlimentador } from '../blueprintAlimentador';
import { planejarCondutores } from '../blueprintCondutoresPluviais';
import { planejarEsgotoCompleto } from '../blueprintEsgotoCompleto';
import { planejarPluvialCompleta } from '../blueprintPluvialCompleto';
import { destinoDoEsgoto } from '../blueprintEsgotoAutomatico';
import { dimensionarTratamento, medidasDimensionadas } from '../blueprintTratamento';
import { pontoNaFrente } from '../blueprintAncorasHidro';
import { marcasDeVerificacao } from '../blueprintVerificacaoRede';
import { pressoesDoModelo } from '../blueprintPressaoDaRede';
import { comandosDePontosDoNivel } from '../blueprintPontosEletricosDoNivel';
import { comodosComForro } from '../blueprintRotaPeloForro';
import { furosPrevistos } from '../blueprintFurosPrevistos';
import { encaixarNaParede, paredesEmComum } from '../blueprintRotaPelasParedes';
import { distanciaAoTrecho3D } from '../blueprintPosicaoSplit';
import { anelDoPilar, pegadasDePilares } from '../blueprintObstaculosEstruturais';
import { centroDeCargas, comandosParaOCentro } from '../blueprintCentroDeCargas';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos } from '../blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, sugerirDPS } from '../blueprintEletricaDimensionamento';
import { comandosDasSugestoesDeDR, conferirNbr5410, sugerirDRs } from '../blueprintNbr5410';
import { HIPOTESES_ELETRODUTO_PADRAO, comandosDeBitolaPelaOcupacao, planejarEletrodutosDoModelo } from '../blueprintEletrodutos';
import type { HipotesesDeEletroduto } from '../blueprintEletrodutos';
import { REGRA_DE_CAIXAS_PADRAO } from '../blueprintCaixasDePassagem';
import { escolhasDoEletroduto } from '../blueprintEscolhasDoEletroduto';
import { comandoDeRegistro, registroDe } from '../blueprintRegistroDeLancamento';
import { comandoDeRegistroDosCircuitosCriados } from '../blueprintEscolhasDosCircuitos';
import { escolhasDaAgua, escolhasDoPluvial } from '../blueprintEscolhasDaAguaEPluvial';
import { escolhasDoEsgoto } from '../blueprintEscolhasDoEsgoto';
import { gerarClimatizacao } from '../blueprintGeradorClimatizacao';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../blueprintClimatizacao';
import { COTA_USUAL_DO_PONTO_ELETRICO, ROTULO_DO_PONTO_ELETRICO } from '../blueprintRede';
import { entradaDoQuadro, padraoDeEntrada } from '../blueprintEntradaDeEnergia';
import type { LocalDaPendencia } from '../blueprintGeradorPpci';
import { localDoConflito, localDoElemento } from '../blueprintLocalDaPendencia';
import { shaftDoGrupo } from '../blueprintSobrado';
import { comLocal, comLocais, f2, ROTULO_DA_ETAPA_DA_CASA, SUBIDA_DO_ALIMENTADOR_DA_CASA, SUBIDA_DO_QUADRO_MM, HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, ELETRICA_ZERADA, CLIMATIZACAO_ZERADA, HIDRAULICA_ZERADA, MARCA_DA_REDE, ROTULO_DA_DISCIPLINA_DA_REDE, ROTULO_DA_DISCIPLINA_DO_AR } from './hipoteses';
import type { PlanoDaCasa } from './hipoteses';
import { forroDaEletrica, forroDaAguaDaCasa, decidirPressao } from './forroEPressao';
import type { DecisaoDaPressao } from './forroEPressao';
import { PASSO_DO_PLUVIAL_SOBRE_O_ESGOTO_MM, pluvialRenteAoEsgoto, gruposDoTuboDeQueda, coletoresForaDoShaft, paredesSobORebaixo, LUZ_ALEM_DO_REBAIXO_MM, LUZ_FORA_DO_PILAR_MM, foraDoPoligono, FOLGA_DA_SUBIDA_DO_PRESSURIZADOR_MM } from './escolhaEShaft';
import type { ContextoDaCasa } from './contexto';

export function instalacoes(ctx: ContextoDaCasa, niveis: ObjectId[], ret: Retangulo, notaDoShaft: string | null = null) {
  const { aplicar, doCurto, entrada, etapa, faixaNoMundo, forroDoComodo, forroLigado, hip, hipGerador, implantacao, original, peDireitoMm, pendencias, q, rebaixoDoForro, terreno } = ctx;
  // ── ÂNCORAS (F6) ──────────────────────────────────────────────────────────
  // As peças que os lançamentos de instalações exigem no desenho: caixa d'água (água fria), aquecedor (água
  // quente), caixa de gordura (pia → CG → CI) e as vagas. O destino do esgoto já é hipótese do estudo
  // (`hidro.esgoto.destino`, de 14/10) e entra na F8.
  // No sobrado (F12c): a caixa d'água no pavimento de CIMA (sobre o banheiro, acima da laje dele); aquecedor, caixa
  // de gordura e vagas no térreo.
  let ancoras: ResultadoDasAncoras['resumo'] | null = null;
  if (!hip.ancoras.lancar) etapa('ANCORAS', ROTULO_DA_ETAPA_DA_CASA.ANCORAS, 'NAO_EXIGIDA', 0, 'desligadas nas hipóteses da casa');
  else {
    try {
      const espessuraExterna = hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm;
      const topoDe = (L: ObjectId) => peDireitoMm + ((ctx.m.structures ?? []).some((x) => x.levelId === L && x.kind === 'LAJE') ? hip.estrutura.lajes.espessuraMm : 0);
      const base = {
        padrao: doCurto.curto.padrao,
        espessuraExternaMm: espessuraExterna,
        garagemCoberta: doCurto.curto.garagemCoberta,
        quadro: q,
        retanguloLocal: ret,
        anelDoLote: terreno?.anel ?? null,
        vagasDescobertas: implantacao.vagasDescobertas,
        reservatorio: (entrada.hidro ?? HIPOTESES_HIDRO_PADRAO).reservatorio,
      };
      const terreo = niveis[0];
      const topo = niveis[niveis.length - 1];
      const a = comandosDasAncoras(ctx.m, { ...base, levelId: terreo, topoMm: topoDe(terreo), vagas: doCurto.curto.vagas, caixaDagua: topo === terreo }, hip.ancoras);
      let n = aplicar(a.comandos);
      const notas = [...a.notas];
      const resumo = { ...a.resumo };
      const pend = [...a.pendencias];
      if (topo !== terreo) {
        const c = comandosDasAncoras(ctx.m, { ...base, levelId: topo, topoMm: topoDe(topo), vagas: 0 }, { ...hip.ancoras, aguaQuente: 'NENHUM', caixaDeGordura: false });
        n += aplicar(c.comandos);
        notas.unshift(...c.notas);
        pend.push(...c.pendencias);
        resumo.caixaDaguaL = c.resumo.caixaDaguaL;
      }
      ancoras = resumo;
      if (notaDoShaft) notas.unshift(notaDoShaft);
    etapa('ANCORAS', ROTULO_DA_ETAPA_DA_CASA.ANCORAS, 'LANCOU', n, notas.join(' ') || null);
      // Item 8 (decisão do usuário, 19/10/2026: "parede interna + duto"): o aquecedor na parede interna é a solução
      // escolhida — fica para CONFERIR (o duto), não para decidir.
      for (const x of pend) pendencias.push({ grupo: /ficou numa parede interna/.test(x) ? 'CONFERIR' : 'NAO_DECIDIDO', texto: x });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa('ANCORAS', ROTULO_DA_ETAPA_DA_CASA.ANCORAS, 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Peças-âncora: ${motivo}` });
    }
  }

  // ── MOBILIÁRIO, LOUÇAS E PONTOS (F7) ──────────────────────────────────────
  // O kit mínimo de cada ambiente (cama, armário, bancada com pia, vaso, lavatório, box, tanque, máquina…); cada
  // LOUÇA lança os pontos dela (água e esgoto, na face da parede — `pontosDasLoucasCriadas`); o planejador por
  // ambiente completa o kit hidráulico SEM duplicar (pula tipo × disciplina que já existe no ambiente): entram a
  // caixa sifonada do banheiro e o que nenhuma louça cobre. Tudo `sugerida`. Água QUENTE só com aquecedor: no
  // chuveiro elétrico (R1-B) ou sem água quente, nenhum ponto de AQ — não há rede para ligá-los.
  const mobiliario = { pecas: 0, pontosDasLoucas: 0, pontosDoKit: 0 };
  const semAguaQuente = !ancoras?.aquecedor && (ancoras?.chuveiroEletrico || hip.ancoras.aguaQuente === 'NENHUM' || hip.ancoras.aguaQuente === 'CHUVEIRO_ELETRICO');
  const hipPontos: HipotesesDePontos = semAguaQuente ? { ...hip.pontos, aguaQuenteEm: [] } : hip.pontos;
  const etapaSimples = (id: 'MOBILIARIO' | 'LOUCAS' | 'PONTOS_HIDRAULICOS', fazer: () => { comandos: Command[]; nota: string }) => {
    if (!hip.mobiliario.lancar) {
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa');
      return 0;
    }
    try {
      const { comandos: lote, nota } = fazer();
      const n = aplicar(lote);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'LANCOU', n, nota);
      return n;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
      return 0;
    }
  };
  let criadosDoMobiliario: ObjectId[] = [];
  etapaSimples('MOBILIARIO', () => {
    const porNivel = niveis.map((L) => ({ L, lista: mobiliarNivel(ctx.m, L, hip.mobiliario) }));
    const lista = porNivel.flatMap((x) => x.lista);
    const lote = porNivel.flatMap((x) => comandosDeMobiliario(x.lista, x.L, ctx.m));
    // Os ids que o mobiliário vai criar (o kernel é determinístico: a simulação dá os mesmos ids da aplicação) —
    // os pontos das louças são planejados para eles.
    criadosDoMobiliario = lote.length ? applyBatch(ctx.m, lote).diff.created : [];
    const naoCouberam = lista.flatMap((a) => a.naoCouberam.map((x) => `${a.rotulo}: ${x}`));
    for (const a of lista) for (const x of a.naoCouberam) pendencias.push({ grupo: 'VERIFICACAO', texto: `Mobiliário: ${a.rotulo}: ${x}`, ...comLocal(localDoElemento(ctx.m, [a.spaceId])) });
    // F20: a peça que só coube menor — para conferir, não decidir.
    const reduzidas = lista.flatMap((a) => a.reduzidas.map((x) => `${a.rotulo}: ${x}`));
    for (const a of lista) for (const x of a.reduzidas) pendencias.push({ grupo: 'CONFERIR', texto: `Mobiliário: ${a.rotulo}: ${x} (a maior não coube)`, ...comLocal(localDoElemento(ctx.m, [a.spaceId])) });
    mobiliario.pecas = lote.length;
    return { comandos: lote, nota: `${lote.length} peça(s) em ${lista.filter((a) => a.pecas.length).length} ambiente(s)${reduzidas.length ? `; ${reduzidas.length} menor(es)` : ''}${naoCouberam.length ? `; ${naoCouberam.length} não couberam` : ''}` };
  });
  etapaSimples('LOUCAS', () => {
    const lote = pontosDasLoucasCriadas(ctx.m, criadosDoMobiliario, hipPontos, { sugerida: true });
    mobiliario.pontosDasLoucas = lote.length;
    return { comandos: lote, nota: `${lote.length} ponto(s) — cada louça liga a sua água e o seu esgoto${semAguaQuente ? '; sem água quente (não há aquecedor)' : ''}` };
  });
  etapaSimples('PONTOS_HIDRAULICOS', () => {
    const planos = niveis.flatMap((L) => planejarPontosDoNivel(ctx.m, L, hipPontos));
    // F14c: o coletor do box (caixa sifonada, ralo) que cai DENTRO de um shaft (o do F12c nasce antes dele) sai pelo
    // lado mais perto, 15 cm além da face, no mesmo cômodo — dentro, o esgoto que chega nele cruzava as colunas de
    // água do centro do shaft (sobrado a 30°).
    const lote = coletoresForaDoShaft(ctx.m, planos.flatMap((pl) => pl.comandos));
    for (const pl of planos) if (pl.motivo && !pl.comandos.length && pl.aCriar === 0 && pl.jaExistentes === 0) pendencias.push({ grupo: 'VERIFICACAO', texto: `Pontos de ${pl.nome}: ${pl.motivo}` });
    mobiliario.pontosDoKit = lote.length;
    return { comandos: lote, nota: `${lote.length} ponto(s) que nenhuma louça cobre (caixa sifonada, ralo…)` };
  });

  // F14c: no sobrado, cada grupo de peças de cima (o banheiro) com o shaft a até `shaftAteAsPecasMm` do centro delas —
  // o shaft do F12c nasce antes do mobiliário e, no banheiro comprido, ficava a 5 m das peças; sem um perto, ganha um
  // junto delas (o tubo de queda desce ali e o esgoto cabe no enchimento da laje rebaixada).
  // F27-D4: em cada pavimento de cima — na casa de 3, o shaft do banheiro do 2º desce até o térreo atravessando o 1º.
  const T0 = niveis[0];
  for (let k = 1; k < niveis.length; k++) {
    const S0 = niveis[k];
    const meio = niveis.slice(1, k);
    const pecas = (ctx.m.terminais ?? []).filter((t) => t.levelId === S0 && t.disciplina === 'ESGOTO');
    const grupos = gruposDoTuboDeQueda(ctx.m, S0, pecas, hip.sobrado.grupoDoTuboDeQuedaMm);
    const escada = ctx.m.spaces.find((sp) => sp.levelId === S0 && /escada/i.test(sp.name ?? ''))?.ring ?? null;
    const novos: string[] = [];
    for (const g of grupos) {
      const alvo = { x: g.reduce((a, t) => a + t.at.x, 0) / g.length, y: g.reduce((a, t) => a + t.at.y, 0) / g.length };
      const ban = ctx.m.spaces.find((sp) => sp.levelId === S0 && g.filter((t) => pointInPolygon(sp.ring, t.at)).length * 2 >= g.length);
      if (!ban) continue;
      const sh = shaftDoGrupo(ctx.m, T0, S0, ban.ring, alvo, escada, hip.sobrado.shaftMm, hip.sobrado.shaftAteAsPecasMm, meio);
      // S4: o shaft de baixo sob o banheiro sobe até ele.
      if (sh?.estender) aplicar([{ type: 'SetNucleoProps', nucleoId: sh.estender, ateLevelId: S0 } as Command]);
      if (sh && !sh.novo) continue;
      if (!sh) {
        pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Shaft: ${ban.name} não tem lugar junto das peças para o shaft (parede com parede embaixo, ou cômodo de baixo que aceite a caixa) — o tubo de queda desce longe delas; ponha o shaft à mão.`, ...comLocal(localDoElemento(ctx.m, [ban.id])) });
        continue;
      }
      aplicar([{ type: 'AddNucleo', levelId: T0, ateLevelId: S0, tipo: 'SHAFT', ring: sh.ring, rotulo: 'Shaft' } as Command]);
      novos.push(`${ban.name}${sh.noTerreo ? ` (descendo na ${sh.noTerreo})` : ''}`);
    }
    if (novos.length) pendencias.push({ grupo: 'CONFERIR', texto: `Shaft junto das peças: ${novos.join('; ')} — o do F12c ficava a mais de ${f2(hip.sobrado.shaftAteAsPecasMm / 1000)} m delas.` });
  }

  // ── HIDRÁULICA (F8) ───────────────────────────────────────────────────────
  // Os "Lançar tudo" das gavetas, na ordem e com as premissas do ESTUDO (`hidro`, as mesmas da gaveta):
  //  - ÁGUA: peças da caixa → barrilete, colunas e ramais (fria e, com aquecedor, quente) → hidrômetro e
  //    alimentador na frente do lote → recalque, se houver reservatório inferior;
  //  - ESGOTO: caixa de inspeção, ramais e coletor até a LIGAÇÃO à rede pública — ou, com o destino TRATAMENTO
  //    (`hidro.esgoto.destino`), tanque séptico, filtro e sumidouro dimensionados pela reservação — e ventilação;
  //  - PLUVIAL: calhas no beiral do telhado, condutores e saída na frente (precisa da intensidade de chuva:
  //    a cidade ou o valor nas premissas).
  // O que cada um PRESUMIU (cota estimada da rede, posição da caixa…) vai às pendências CONFERIR; o que faltou do
  // mundo, às PREMISSA. A casa nasce num pavimento vazio: não há peça confirmada do outro destino para apagar.
  // F14a ("forro com faixas"): a água quente e o esgoto traçados nas FAIXAS deles — a fria no eixo das paredes.
  const hidroDoEstudo = entrada.hidro ?? HIPOTESES_HIDRO_PADRAO;
  const hidro: HipotesesHidro = {
    ...hidroDoEstudo,
    // F14b: e os ramais no forro, nas faixas da fria e da quente.
    agua: {
      ...hidroDoEstudo.agua,
      faixaDaAguaQuente: faixaNoMundo(hip.faixas.aguaQuenteMm),
      noForro: forroDaAguaDaCasa(hip),
    },
    // F17 (decisão do usuário, "sobe pela fachada"): o alimentador enterrado só até a parede da frente — sobe nela e
    // corre sobre a laje até a caixa; sob o piso ele cruzava o esgoto enterrado. A premissa do estudo, se houver, vale.
    alimentacao: { ...hidroDoEstudo.alimentacao, subida: hidroDoEstudo.alimentacao.subida ?? SUBIDA_DO_ALIMENTADOR_DA_CASA },
    // F14c: no sobrado, um tubo de queda por banheiro de cima (cada um no shaft dele).
    esgoto: { ...hidroDoEstudo.esgoto, faixa: faixaNoMundo(hip.faixas.esgotoMm), ...(niveis.length > 1 ? { tuboDeQuedaPorGrupoMm: hip.sobrado.grupoDoTuboDeQuedaMm, raioDoShaftMm: hip.sobrado.tuboDeQuedaAteOShaftMm } : {}) },
  };
  const terrenoHidro = entrada.leitorDoTerreno ?? null;
  const hidraulica = HIDRAULICA_ZERADA();
  const contar = (lote: Command[]) => ({ pecas: lote.filter((c) => c.type === 'AddTerminal').length, tubos: lote.filter((c) => c.type === 'AddTrecho').length });
  // F3 do relançar (24/10/2026): `registro` — o REGISTRO do lançamento (com que escolhas), no mesmo lote da casa, logo
  // depois da rede (não entra na contagem da etapa). O painel do sistema avisa quando as premissas de lá diferem.
  const etapaDeRede = (
    id: 'AGUA' | 'ESGOTO' | 'PLUVIAL',
    planejar: () => { comandos: Command[]; presumido: string[]; pendencias: string[] },
    nota: (n: { pecas: number; tubos: number }) => string,
    registro?: () => Command,
  ): { pecas: number; tubos: number } => {
    if (!hip.hidraulica.lancar) {
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
      return { pecas: 0, tubos: 0 };
    }
    try {
      const plano = planejar();
      for (const x of plano.presumido) pendencias.push({ grupo: 'CONFERIR', texto: `${ROTULO_DA_ETAPA_DA_CASA[id].split(' (')[0]}: ${x}` });
      for (const x of plano.pendencias) pendencias.push({ grupo: 'PREMISSA', texto: `${ROTULO_DA_ETAPA_DA_CASA[id].split(' (')[0]}: ${x}` });
      if (!plano.comandos.length) {
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], plano.pendencias.length ? 'NAO_RODOU' : 'NADA_A_FAZER', 0, plano.pendencias[0] ?? null);
        return { pecas: 0, tubos: 0 };
      }
      const c = contar(plano.comandos);
      // A água ENCOSTA na face da parede o ponto solto no cômodo (`TranslateEntities`), e o kernel trata mover
      // como decidir: a marca "sugerida" cai. Aqui ninguém decidiu nada — o ponto continua proposta do sistema,
      // e volta a ser marcado no mesmo lote.
      const sugeridos = new Set(ctx.m.terminais.filter((t) => t.sugerida).map((t) => t.id));
      let n = aplicar(plano.comandos);
      n += aplicar(ctx.m.terminais.filter((t) => sugeridos.has(t.id) && !t.sugerida).map((t): Command => ({ type: 'SetTerminalProps', terminalId: t.id, sugerida: true })));
      if (registro) aplicar([registro()]);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'LANCOU', n, nota(c) + (plano.pendencias.length ? ` — ${plano.pendencias.length} pendência(s)` : ''));
      return c;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
      return { pecas: 0, tubos: 0 };
    }
  };
  // F13: a pressão por caso, ANTES do traçado — a caixa elevada ou o pressurizador entram no mesmo lote.
  let pressao: DecisaoDaPressao | null = null;
  hidraulica.agua = etapaDeRede(
    'AGUA',
    () => {
      pressao = decidirPressao(ctx.m, hidro, terrenoHidro, hip.pressao);
      // O plano da última simulação já é o traçado sobre o modelo com a solução — sem traçar de novo.
      const plano = pressao.plano ?? planejarAguaCompleta(pressao.comandos.length ? applyBatch(ctx.m, pressao.comandos).model : ctx.m, hidro, terrenoHidro);
      return { ...plano, comandos: [...pressao.comandos, ...plano.comandos] };
    },
    (c) => {
      const d = pressao as DecisaoDaPressao | null;
      const sol =
        d?.solucao === 'CAIXA_ELEVADA'
          ? `; caixa d'água elevada em ${f2(d.elevacaoMm / 1000)} m para a pressão`
          : d?.solucao === 'PRESSURIZADOR'
            ? `; pressurizador na saída da caixa (+${hidro.pressao.ganhoDoPressurizadorKpa} kPa)`
            : '';
      return `${c.tubos} tubo(s) e ${c.pecas} peça(s)${sol}`;
    },
    // Com o forro, a faixa da quente e a subida pela fachada (sem rótulo): o relançar pelo editor os mantém.
    () => comandoDeRegistro('AGUA', null, escolhasDaAgua(hidro)),
  );
  {
    const d = pressao as DecisaoDaPressao | null;
    if (d?.solucao === 'CAIXA_ELEVADA')
      pendencias.push({ grupo: 'CONFERIR', texto: `Pressão: a caixa d'água subiu ${f2(d.elevacaoMm / 1000)} m (faltavam ${f2(d.deficitM)} m de coluna no ponto mais desfavorável) — preveja a base elevada (torre) na estrutura.` });
    if (d?.solucao === 'PRESSURIZADOR')
      pendencias.push({
        grupo: 'CONFERIR',
        texto: `Pressão: faltavam ${f2(d.deficitM)} m de coluna — elevar a caixa até ${f2(hip.pressao.caixaElevadaAteMm / 1000)} m não basta; pressurizador na saída da caixa (+${hidro.pressao.ganhoDoPressurizadorKpa} kPa, ${hip.pressao.potenciaDoPressurizadorW} W, com ponto elétrico e circuito)${d.elevacaoMm > 0 ? ` e, como ele sozinho também não bastava, a caixa subiu ${f2(d.elevacaoMm / 1000)} m — preveja a base elevada (torre)` : ''} — confira o modelo no catálogo.`,
      });
  }
  const destino = destinoDoEsgoto(hidro.esgoto);
  hidraulica.esgoto = {
    ...etapaDeRede(
      'ESGOTO',
      () => {
        const medidas = destino === 'TRATAMENTO' ? medidasDimensionadas(dimensionarTratamento(ctx.m, hidro.tratamento, hidro.reservatorio)) : undefined;
        return planejarEsgotoCompleto(ctx.m, hidro.esgoto, terrenoHidro, { tratamento: { comFiltro: hidro.tratamento.comFiltro, medidas } });
      },
      (c) => `${c.tubos} tubo(s) e ${c.pecas} peça(s) — destino: ${destino === 'TRATAMENTO' ? 'tratamento individual (tanque, filtro, sumidouro)' : 'rede pública'}`,
      // F4 do relançar (24/10/2026): as escolhas do ESTUDO com rótulo, e o que só a casa decide — a faixa do esgoto e,
      // no sobrado, o tubo de queda por grupo e o raio do shaft — sem rótulo: o relançar pelo editor os mantém.
      () =>
        comandoDeRegistro(
          'ESGOTO',
          null,
          escolhasDoEsgoto(
            { esgoto: hidroDoEstudo.esgoto, tratamento: hidro.tratamento, reservatorio: hidro.reservatorio },
            { faixa: hidro.esgoto.faixa ?? null, tuboDeQuedaPorGrupoMm: hidro.esgoto.tuboDeQuedaPorGrupoMm ?? null, raioDoShaftMm: niveis.length > 1 ? (hidro.esgoto.raioDoShaftMm ?? null) : null },
          ),
        ),
    ),
    destino,
  };
  hidraulica.pluvial = etapaDeRede(
    'PLUVIAL',
    () => planejarPluvialCompleta(ctx.m, hidro.pluvial, terrenoHidro),
    (c) => `${c.tubos} tubo(s) e ${c.pecas} peça(s)`,
    () => comandoDeRegistro('PLUVIAL', null, escolhasDoPluvial(hidro.pluvial)),
  );
  // F18: o condutor pluvial horizontal (enterrado, para a saída na frente do lote) é traçado depois do esgoto e o
  // cruzava rente (15 × 25: a ligação de esgoto, com 6 cm entre os eixos). Ele passa POR CIMA — a saída fica na
  // sarjeta —: o início sobe (`profundidadeDoCondutorMm`) até livrar todo cruzamento, sem passar do recobrimento.
  if (hip.hidraulica.lancar && hidraulica.pluvial.tubos > 0 && pluvialRenteAoEsgoto(ctx.m) > 0) {
    let prof = hidro.pluvial.profundidadeDoCondutorMm;
    const minimo = hidro.alimentacao.recobrimentoMinimoMm ?? 150;
    // F25: cada passo planejado a partir do MESMO desenho e fica o de menos encontros (o inicial, se nenhum melhora) —
    // parar no primeiro passo que não melhora perdia o que livrava dois passos adiante; aceitar todos estragava o
    // cruzamento por baixo perto da saída (o coletor fundo no terreno inclinado).
    let melhor: { prof: number; comandos: Command[]; encontros: number } | null = null;
    let encontros = pluvialRenteAoEsgoto(ctx.m);
    for (let volta = 1; volta <= 4; volta++) {
      const nova = hidro.pluvial.profundidadeDoCondutorMm - volta * PASSO_DO_PLUVIAL_SOBRE_O_ESGOTO_MM;
      if (nova < minimo) break;
      const cond = planejarCondutores(ctx.m, { ...hidro.pluvial, profundidadeDoCondutorMm: nova }, terrenoHidro);
      if (cond.motivo || !cond.comandos.length) break;
      const n = pluvialRenteAoEsgoto(applyBatch(ctx.m, cond.comandos).model);
      if (n < encontros) {
        melhor = { prof: nova, comandos: cond.comandos, encontros: n };
        encontros = n;
        if (n === 0) break;
      }
    }
    if (melhor) {
      prof = melhor.prof;
      // O registro guarda a profundidade AJUSTADA (sem rótulo): relançar pelo editor não volta o condutor rente ao esgoto.
      aplicar([...melhor.comandos, comandoDeRegistro('PLUVIAL', null, escolhasDoPluvial(hidro.pluvial, { profundidadeAjustadaDoCondutorMm: melhor.prof }))]);
    }
    if (pluvialRenteAoEsgoto(ctx.m) > 0) pendencias.push({ grupo: 'VERIFICACAO', texto: `Águas pluviais: o condutor horizontal passa rente ao esgoto mesmo começando a ${f2(-prof / 1000)} m — confira o cruzamento (ou mude a saída).` });
    else pendencias.push({ grupo: 'CONFERIR', texto: `Águas pluviais: o condutor horizontal começa a ${f2(-prof / 1000)} m para passar por cima do esgoto.` });
  }
  // F18: o alimentador ENTERRADO é traçado antes do esgoto e do pluvial, que depois o cruzavam na mesma cota (o
  // esgoto e o condutor horizontal correm para a frente do lote). Agora ele passa POR CIMA deles (NBR 5626) — ou,
  // sem recobrimento para isso, por baixo, dito.
  if (hip.hidraulica.lancar) {
    const ajuste = cotaEnterradaAcimaDasRedes(ctx.m, hidro.alimentacao);
    if (ajuste.cruzamentos > 0 && ajuste.cotaMm !== hidro.alimentacao.cotaEnterradaMm) {
      const alim = planejarAlimentador(ctx.m, { ...hidro.alimentacao, cotaEnterradaMm: ajuste.cotaMm }, hidro.reservatorio, hidro.pressao.qMaxDoHidrometroM3h, terrenoHidro);
      if (!alim.motivo && alim.comandos.length) {
        // O registro guarda a cota AJUSTADA (sem rótulo): relançar pelo editor não volta o alimentador a cruzar o esgoto.
        const registro = registroDe(ctx.m, 'AGUA', null) ? [comandoDeRegistro('AGUA', null, escolhasDaAgua(hidro, { cotaEnterradaAjustadaMm: ajuste.cotaMm }))] : [];
        aplicar([...alim.comandos, ...registro]);
        const cota = f2(ajuste.cotaMm / 1000);
        pendencias.push(
          ajuste.sob
            ? { grupo: 'VERIFICACAO', texto: `Alimentador: a ${cota} m, POR BAIXO de ${ajuste.cruzamentos} cruzamento(s) com esgoto/pluvial — por cima não havia recobrimento; proteja a travessia (luva) e confira (NBR 5626).` }
            : { grupo: 'CONFERIR', texto: `Alimentador: a ${cota} m, por cima de ${ajuste.cruzamentos} cruzamento(s) com esgoto/pluvial (NBR 5626).` },
        );
      }
    }
  }

  // A VERIFICAÇÃO DE REDE do app sobre o resultado: tubos soltos, sem destino, contrafluxo, desconector sem
  // ventilação, tubo atravessando pilar ou cruzando viga. O que ela acusa vira pendência com a contagem, por tipo
  // (ERRO → VERIFICACAO; AVISO → CONFERIR). Medido em 15/10: a rede sai ligada (nenhuma ponta aberta, nenhum
  // trecho sem destino), mas o traçado pelas paredes cruza os pilares dos encontros — compatibilização à parte.
  const verificarRedes = (rotulos: Record<string, string>, alvo: { erros: number; avisos: number; porTipo: Record<string, number> }) => {
    const marcas = niveis.flatMap((L) => marcasDeVerificacao(ctx.m, L, [], hidro.pluvial)).filter((x) => x.disciplina && x.disciplina in rotulos);
    const grupos = new Map<string, { severidade: 'ERRO' | 'AVISO'; disciplina: string; tipo: string; n: number; texto: string; locais: LocalDaPendencia[] }>();
    for (const x of marcas) {
      const k = `${x.severidade}|${x.disciplina}|${x.tipo}`;
      const g = grupos.get(k) ?? { severidade: x.severidade, disciplina: x.disciplina!, tipo: x.tipo, n: 0, texto: x.texto, locais: [] };
      g.n++;
      g.locais.push({ levelId: x.levelId, ids: [x.alvoId], ponto: { x: x.at.x, y: x.at.y } });
      grupos.set(k, g);
    }
    for (const g of grupos.values()) {
      alvo[g.severidade === 'ERRO' ? 'erros' : 'avisos'] += g.n;
      alvo.porTipo[g.tipo] = (alvo.porTipo[g.tipo] ?? 0) + g.n;
      const oque = MARCA_DA_REDE[g.tipo] ? `${g.n} ${MARCA_DA_REDE[g.tipo]}` : `${g.n} × ${g.texto}`;
      pendencias.push({ grupo: g.severidade === 'ERRO' ? 'VERIFICACAO' : 'CONFERIR', texto: `Rede de ${rotulos[g.disciplina]}: ${oque}`, locais: g.locais });
    }
  };
  if (hip.hidraulica.lancar && (hidraulica.agua.tubos + hidraulica.esgoto.tubos + hidraulica.pluvial.tubos) > 0) verificarRedes(ROTULO_DA_DISCIPLINA_DA_REDE, hidraulica.verificacao);

  // A PRESSÃO nos pontos (o cálculo do app, o mesmo do selo no desenho): por gravidade, a caixa pouco acima do teto
  // não vence a perda do aquecedor (térrea) nem a altura dos pontos de cima (sobrado) — medido em 15/10/2026, a
  // água quente da térrea saía com −27 a −65 kPa e nada dizia. Aqui fica DITO, por rede, com as saídas; resolver
  // (caixa elevada ou pressurizador) é decisão de projeto.
  if (hip.hidraulica.lancar && hidraulica.agua.tubos > 0) {
    const caixa = (ctx.m.terminais ?? []).find((t) => t.tipoHidraulico === 'RESERVATORIO');
    const cotaDaCaixaM = caixa ? ((ctx.m.levels.find((l) => l.id === caixa.levelId)?.elevationMm ?? 0) + caixa.cotaMm) / 1000 : null;
    for (const rede of pressoesDoModelo(ctx.m)) {
      const baixos = rede.pontos.filter((x) => x.estado === 'INSUFICIENTE' && x.disponivelKpa != null);
      if (!baixos.length) continue;
      const pior = [...baixos].sort((a, b) => a.disponivelKpa! - a.minimaKpa - (b.disponivelKpa! - b.minimaKpa))[0];
      const comodo = ctx.m.spaces.find((x) => x.levelId === pior.levelId && pointInPolygon(x.ring, pior.at as Point))?.name;
      hidraulica.pressaoInsuficiente[rede.disciplina === 'AGUA_QUENTE' ? 'quente' : 'fria'] += baixos.length;
      pendencias.push({
        grupo: 'VERIFICACAO',
        texto: `Pressão da ${ROTULO_DA_DISCIPLINA_DA_REDE[rede.disciplina]}: ${baixos.length} ponto(s) abaixo do mínimo — o pior, ${pior.nome}${comodo ? ` (${comodo})` : ''}, com ${pior.disponivelKpa!.toFixed(1).replace('.', ',')} kPa (mínimo ${String(pior.minimaKpa).replace('.', ',')}). ${cotaDaCaixaM != null ? `Com a caixa d'água a ${f2(cotaDaCaixaM)} m, a gravidade não basta: ` : ''}eleve a caixa (hipótese "caixa acima da laje") ou preveja um pressurizador.`,
      });
    }
  }

  // ── ELÉTRICA E CLIMATIZAÇÃO (F9) ──────────────────────────────────────────
  // A ordem é a que as peças pedem: os PONTOS pela norma (com a potência padrão — o centro de cargas precisa
  // dela) e o chuveiro elétrico → o QUADRO no centro de cargas (+ entrada de serviço e medidor na frente) →
  // os CIRCUITOS → a CLIMATIZAÇÃO (ela liga os circuitos dos splits só com UM quadro e nenhum ponto solto, por
  // isso depois) → DR e DPS (o DR é por circuito) → ELETRODUTOS por último (precisam dos circuitos). No fim,
  // `conferirNbr5410` sobre o resultado: FALTA → VERIFICACAO, AVISO → CONFERIR.
  const eletrica = ELETRICA_ZERADA();
  const climatizacao = CLIMATIZACAO_ZERADA();
  const hipCircuitos = entrada.circuitos ?? HIPOTESES_CIRCUITOS_PADRAO;
  const hipEletricas = entrada.eletricas ?? HIPOTESES_ELETRICAS_PADRAO;
  const ETAPAS_ELETRICAS = ['PONTOS_ELETRICOS', 'QUADRO', 'CIRCUITOS', 'CLIMATIZACAO', 'DR_DPS', 'ELETRODUTOS'] as const;
  let quadroId: ObjectId | null = null;
  const tentarEletrica = (id: (typeof ETAPAS_ELETRICAS)[number], fazer: () => void) => {
    try {
      fazer();
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
    }
  };
  if (!hip.eletrica.lancar) {
    for (const id of ETAPAS_ELETRICAS) etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
  } else {
    tentarEletrica('PONTOS_ELETRICOS', () => {
      const lote = niveis.flatMap((L) =>
        comandosDePontosDoNivel(ctx.m, L, {
          peDireitoMm: ctx.m.levels.find((l) => l.id === L)!.defaultHeightMm,
          areaPorLuminariaM2: hip.eletrica.areaPorLuminariaM2,
          // F14b: no forro, a tomada também fica longe do ponto de água (a descida dela cruzava a entrada da quente no
          // aquecedor, na mesma posição ao longo da parede).
          // F14c: e das PRUMADAS das outras redes que correm na parede (a coluna de ventilação do esgoto: a descida da
          // tomada caía em cima dela, térrea a 30°).
          ocupados: [
            ...(ctx.m.terminais ?? []).filter((t) => t.levelId === L && (t.disciplina === 'ELETRICA' || (forroLigado && (t.disciplina === 'AGUA_FRIA' || t.disciplina === 'AGUA_QUENTE')))).map((t) => t.at),
            ...(forroLigado ? (ctx.m.trechos ?? []).filter((t) => t.levelId === L && t.disciplina !== 'ELETRICA' && t.a.x === t.b.x && t.a.y === t.b.y && Math.max(t.cotaAMm, t.cotaBMm) > 300).map((t) => t.a) : []),
            // F14c: e da parede sob a laje REBAIXADA — ali o forro não tem plenum, e o eletroduto não chega pelo anel
            // (a tomada do canto da cozinha, sob o banheiro da suíte, ficava ligada em reta pelo meio do cômodo).
            ...(forroLigado ? paredesSobORebaixo(ctx.m, L) : []),
          ],
        }),
      );
      // F14b: a luz de teto na FACE do forro do cômodo — a rede corre no plenum, acima dela.
      if (forroLigado) {
        for (let i = 0; i < lote.length; i++) {
          const c = lote[i];
          if (c.type !== 'AddTerminal' || (c as { tipoEletrico?: string | null }).tipoEletrico !== 'ILUMINACAO_TETO') continue;
          const sp = comodosComForro(ctx.m, c.levelId).find((x) => pointInPolygon(x.ring, c.at));
          // F14c: e fora da laje REBAIXADA (sob o banheiro de cima): ali o forro não tem plenum, e o eletroduto da luz
          // atravessava a área rebaixada em reta (sobrado a 0°).
          const teto = ctx.m.levels.find((l) => l.id === c.levelId)?.defaultHeightMm ?? Infinity;
          const rebaixos = (ctx.m.structures ?? []).filter((x) => x.kind === 'LAJE' && x.levelId === c.levelId && x.baseMm < teto - 1).map((x) => x.pontos as Point[]);
          const at = (sp && foraDoPoligono(rebaixos, c.at, sp.ring, LUZ_ALEM_DO_REBAIXO_MM)) || c.at;
          if (sp) lote[i] = { ...c, at, cotaMm: Math.round(forroDoComodo(ctx.m, sp).faceMm) } as Command;
        }
      }
      // F18: os pontos NA PAREDE (interruptor, tomada) fora do PILAR: escorregam pela face, fora de vão — o interruptor
      // junto da porta caía na pegada do pilar do canto, e a descida do eletroduto corria dentro dele (15 × 25).
      for (let i = 0; i < lote.length; i++) {
        const c = lote[i] as Extract<Command, { type: 'AddTerminal' }>;
        if (c.type !== 'AddTerminal' || !c.tipoEletrico || c.tipoEletrico === 'ILUMINACAO_TETO') continue;
        const aneis = pegadasDePilares(ctx.m, c.levelId).map((g) => anelDoPilar(g, LUZ_FORA_DO_PILAR_MM) as Point[]);
        if (!aneis.some((g) => pointInPolygon(g, c.at))) continue;
        const enc = encaixarNaParede(c.at, ctx.m.walls.filter((w) => w.levelId === c.levelId), 400);
        if (!enc) continue;
        const w = enc.parede;
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
        const t0 = (c.at.x - w.a.x) * u.x + (c.at.y - w.a.y) * u.y;
        const noVao = (t: number) => ctx.m.openings.some((o) => o.wallId === w.id && t > o.offsetMm - LUZ_FORA_DO_PILAR_MM && t < o.offsetMm + o.widthMm + LUZ_FORA_DO_PILAR_MM && c.cotaMm > o.sillMm - LUZ_FORA_DO_PILAR_MM && c.cotaMm < o.sillMm + o.heightMm);
        for (let d = 50; d <= 800; d += 50) {
          const q = [d, -d].map((k) => ({ k, p: { x: Math.round(c.at.x + u.x * k), y: Math.round(c.at.y + u.y * k) } as Point })).find(({ k, p }) => t0 + k >= 0 && t0 + k <= L && !noVao(t0 + k) && !aneis.some((g) => pointInPolygon(g, p)));
          if (q) {
            lote[i] = { ...c, at: q.p } as Command;
            break;
          }
        }
      }
      // F18: e a luz de teto fora do PILAR (com ou sem forro) — no centro de um cômodo pequeno ela caía na pegada dele,
      // e o eletroduto subia por dentro do pilar (R1-A).
      for (let i = 0; i < lote.length; i++) {
        const c = lote[i];
        if (c.type !== 'AddTerminal' || (c as { tipoEletrico?: string | null }).tipoEletrico !== 'ILUMINACAO_TETO') continue;
        const pilares = pegadasDePilares(ctx.m, c.levelId).map((g) => anelDoPilar(g, LUZ_FORA_DO_PILAR_MM) as Point[]);
        const sp = ctx.m.spaces.find((x) => x.levelId === c.levelId && pointInPolygon(x.ring, c.at));
        const at = foraDoPoligono(pilares, c.at, sp?.ring ?? null, LUZ_ALEM_DO_REBAIXO_MM);
        if (at) lote[i] = { ...c, at } as Command;
      }
      // O CHUVEIRO ELÉTRICO é LIGAÇÃO DIRETA (a 9.5.2.3 acusa chuveiro em tomada), no ponto hidráulico dele, com a
      // potência declarada — a padrão não dá potência a ligação direta. Exige DR e ganha circuito próprio.
      if (ancoras?.chuveiroEletrico) {
        for (const c of (ctx.m.terminais ?? []).filter((t) => niveis.includes(t.levelId) && t.tipoHidraulico === 'CHUVEIRO' && t.disciplina === 'AGUA_FRIA')) {
          // F18: AO LADO da saída d'água, na face (o afastamento lateral dos pontos), do lado sem tubo — no mesmo ponto, a
          // água e o eletroduto desciam juntos na parede e se cruzavam (R1-B).
          const cota = COTA_USUAL_DO_PONTO_ELETRICO.LIGACAO_DIRETA;
          const enc = encaixarNaParede(c.at, ctx.m.walls.filter((w) => w.levelId === c.levelId), 400);
          const afast = hip.pontos.afastamentoFriaQuenteMm ?? 150;
          const u = enc ? { x: (enc.parede.b.x - enc.parede.a.x) / Math.hypot(enc.parede.b.x - enc.parede.a.x, enc.parede.b.y - enc.parede.a.y), y: (enc.parede.b.y - enc.parede.a.y) / Math.hypot(enc.parede.b.x - enc.parede.a.x, enc.parede.b.y - enc.parede.a.y) } : null;
          const lados = u ? [1, -1].map((k) => ({ x: Math.round(c.at.x + u.x * afast * k), y: Math.round(c.at.y + u.y * afast * k) })) : [];
          const livre = (q: Point) => (ctx.m.trechos ?? []).every((t) => t.levelId !== c.levelId || distanciaAoTrecho3D(q, cota, t) > t.bitolaMm / 2 + afast / 2);
          const at = lados.find(livre) ?? { ...c.at };
          lote.push({
            type: 'AddTerminal', levelId: c.levelId, disciplina: 'ELETRICA', tipo: ROTULO_DO_PONTO_ELETRICO.LIGACAO_DIRETA, at,
            cotaMm: COTA_USUAL_DO_PONTO_ELETRICO.LIGACAO_DIRETA, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: hip.eletrica.chuveiroEletricoVA, rotulo: 'Chuveiro', sugerida: true,
          } as Command);
        }
      }
      // F13: o PRESSURIZADOR é ligação direta, com a potência das hipóteses (ganha circuito próprio).
      // F22: o ponto ao LADO da bomba onde a subida do eletroduto (do forro até ele) não encontra tubo — no lugar dela,
      // ela subia através do barrilete que sai da caixa (12 × 30).
      const teto = (L: string) => (ctx.m.levels.find((l) => l.id === L)?.defaultHeightMm ?? 2800) - 45;
      const subidaLivre = (q: Point, levelId: string, cota: number) => {
        const A = { x: q.x, y: q.y, z: Math.min(teto(levelId), cota) };
        const B = { x: q.x, y: q.y, z: Math.max(teto(levelId), cota) };
        return (ctx.m.trechos ?? []).every((t) => t.levelId !== levelId || distanciaEntreEixos3D(A, B, { x: t.a.x, y: t.a.y, z: t.cotaAMm }, { x: t.b.x, y: t.b.y, z: t.cotaBMm }) > envelopeDoTrecho(t).raioPlantaMm + 25 + FOLGA_DA_SUBIDA_DO_PRESSURIZADOR_MM);
      };
      for (const b of (ctx.m.terminais ?? []).filter((t) => niveis.includes(t.levelId) && t.tipoHidraulico === 'BOMBA' && t.disciplina === 'AGUA_FRIA')) {
        const lugares = [{ x: 0, y: 0 }, ...[150, 300, 450].flatMap((d) => [{ x: d, y: 0 }, { x: -d, y: 0 }, { x: 0, y: d }, { x: 0, y: -d }])].map((o) => point(b.at.x + o.x, b.at.y + o.y));
        const at = lugares.find((q) => subidaLivre(q, b.levelId, b.cotaMm)) ?? { ...b.at };
        lote.push({
          type: 'AddTerminal', levelId: b.levelId, disciplina: 'ELETRICA', tipo: ROTULO_DO_PONTO_ELETRICO.LIGACAO_DIRETA, at,
          cotaMm: b.cotaMm, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: hip.pressao.potenciaDoPressurizadorW, rotulo: 'Pressurizador', sugerida: true,
        } as Command);
      }
      const tipoDe = (c: Command) => (c.type === 'AddTerminal' ? (c as { tipoEletrico?: string | null }).tipoEletrico ?? null : null);
      eletrica.pontos = {
        tomadas: lote.filter((c) => tipoDe(c) === 'TUG' || tipoDe(c) === 'TUE').length,
        luzes: lote.filter((c) => /^ILUMINACAO/.test(tipoDe(c) ?? '')).length,
        interruptores: lote.filter((c) => tipoDe(c) === 'INTERRUPTOR').length,
        ligacoesDiretas: lote.filter((c) => tipoDe(c) === 'LIGACAO_DIRETA').length,
      };
      const p = eletrica.pontos;
      etapa('PONTOS_ELETRICOS', ROTULO_DA_ETAPA_DA_CASA.PONTOS_ELETRICOS, 'LANCOU', aplicar(lote), `${p.tomadas} tomada(s), ${p.luzes} luz(es), ${p.interruptores} interruptor(es)${p.ligacoesDiretas ? `, ${p.ligacoesDiretas} chuveiro(s) elétrico(s) de ${hip.eletrica.chuveiroEletricoVA} W` : ''}`);
    });
    tentarEletrica('QUADRO', () => {
      // No sobrado, o quadro fica no TÉRREO (perto do medidor e da cozinha), no centro de cargas de lá — solto, o
      // centro iria para o pavimento de mais carga, que pode ser o de cima.
      const c0 = centroDeCargas(niveis.length > 1 ? { ...ctx.m, terminais: (ctx.m.terminais ?? []).filter((t) => t.disciplina !== 'ELETRICA' || t.levelId === niveis[0]) } : ctx.m, null);
    // E a prumada do eletroduto sobe na posição do quadro: no sobrado, o quadro vai para a parede do térreo que
    // tem parede em cima (a até 3 m do centro de cargas) — senão a prumada sobe pelo meio de um cômodo de cima.
    const paredeMinimaDoQuadro = hip.eletrica.paredeMinimaDoQuadroMm ?? HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO.paredeMinimaDoQuadroMm;
    const sobreParede = c0 && niveis.length > 1 ? encaixarNaParede(c0.posicaoSugerida, paredesEmComum(ctx.m.walls.filter((w) => w.levelId === niveis[0]), niveis.slice(1).map((L) => ctx.m.walls.filter((w) => w.levelId === L)), 50, paredeMinimaDoQuadro), 3000) : null;
    const c = c0 && sobreParede ? { ...c0, posicaoSugerida: { x: Math.round(sobreParede.q.x), y: Math.round(sobreParede.q.y) }, paredeId: sobreParede.parede.id } : c0;
      if (!c) {
        etapa('QUADRO', ROTULO_DA_ETAPA_DA_CASA.QUADRO, 'NAO_RODOU', 0, 'nenhum ponto com potência — sem centro de cargas');
        return;
      }
      // F14b: no forro, os eletrodutos sobem do quadro até a faixa deles — se a travessia de outra rede (lançada antes)
      // passa bem ali, o quadro escorrega pela parede até ficar livre (de 10 em 10 cm, até 80 cm; fora de vão e pilar).
      if (forroLigado) {
        const L0 = niveis[0];
        const teto = ctx.m.levels.find((l) => l.id === L0)!.defaultHeightMm;
        const parede = encaixarNaParede(c.posicaoSugerida, ctx.m.walls.filter((w) => w.levelId === L0), 600)?.parede ?? null;
        const dSeg = (p: Point, a: Point, b: Point) => {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const L2 = dx * dx + dy * dy;
          const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
          return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
        };
        const noForro = (ctx.m.trechos ?? []).filter((t) => t.levelId === L0 && t.disciplina !== 'ELETRICA' && t.cotaAMm === t.cotaBMm && t.cotaAMm > teto - rebaixoDoForro && t.cotaAMm < teto);
        // S1 (20/10/2026): e as VERTICAIS de outra rede na altura da subida do quadro (de 1,60 m ao teto) — a descida da
        // fria do vaso ficava a 3 cm do eletroduto que sobe do quadro (10 × 30, 4 dorm.).
        const verticais = (ctx.m.trechos ?? []).filter((t) => t.levelId === L0 && t.disciplina !== 'ELETRICA' && t.a.x === t.b.x && t.a.y === t.b.y && Math.max(t.cotaAMm, t.cotaBMm) > 1600 && Math.min(t.cotaAMm, t.cotaBMm) < teto);
        const pilares = pegadasDePilares(ctx.m, L0);
        // No sobrado, só dentro do trecho de parede que tem parede em cima (a prumada do eletroduto sobe ali).
        const emComum = niveis.length > 1 ? paredesEmComum(ctx.m.walls.filter((w) => w.levelId === L0), niveis.slice(1).map((L) => ctx.m.walls.filter((w) => w.levelId === L)), 50, paredeMinimaDoQuadro) : null;
        const livre = (p: Point) =>
          (!emComum || !!encaixarNaParede(p, emComum, 5)) &&
          noForro.every((t) => dSeg(p, t.a, t.b) > SUBIDA_DO_QUADRO_MM + envelopeDoTrecho(t).raioPlantaMm + 20) &&
          verticais.every((t) => Math.hypot(p.x - t.a.x, p.y - t.a.y) > SUBIDA_DO_QUADRO_MM + envelopeDoTrecho(t).raioPlantaMm + 20) &&
          !pilares.some((g) => pointInPolygon(g as Point[], p)) &&
          !(parede && ctx.m.openings.some((o) => {
            if (o.wallId !== parede.id) return false;
            const L = Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y);
            const t = ((p.x - parede.a.x) * (parede.b.x - parede.a.x) + (p.y - parede.a.y) * (parede.b.y - parede.a.y)) / (L || 1);
            return t > o.offsetMm - 300 && t < o.offsetMm + o.widthMm + 300;
          }));
        if (parede && !livre(c.posicaoSugerida)) {
          const L = Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y) || 1;
          const u = { x: (parede.b.x - parede.a.x) / L, y: (parede.b.y - parede.a.y) / L };
          const desvios = [100, -100, 200, -200, 300, -300, 400, -400, 500, -500, 600, -600, 700, -700, 800, -800];
          const novo = desvios.map((d) => point(Math.round(c.posicaoSugerida.x + u.x * d), Math.round(c.posicaoSugerida.y + u.y * d))).find(livre);
          // F18: sem posição que atenda tudo, ao menos FORA do pilar e do vão (com parede em cima no sobrado), até 1,50 m —
          // o quadro do sobrado ficava dentro do pilar, e a prumada do eletroduto subia por ele os dois pavimentos.
          // Pela mesma parede e, na esquina (a ponta dela é o pilar), pelas outras paredes até 1,50 m — o ponto livre mais perto.
          const p0 = c.posicaoSugerida;
          const candidatas = (emComum ?? ctx.m.walls.filter((w) => w.levelId === L0)).flatMap((w) => {
            const Lw = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
            const uw = { x: (w.b.x - w.a.x) / Lw, y: (w.b.y - w.a.y) / Lw };
            const t0 = (p0.x - w.a.x) * uw.x + (p0.y - w.a.y) * uw.y;
            const pts: Point[] = [];
            for (let t = Math.max(0, Math.round((t0 - 1500) / 50) * 50); t <= Math.min(Lw, t0 + 1500); t += 50) pts.push(point(Math.round(w.a.x + uw.x * t), Math.round(w.a.y + uw.y * t)));
            return pts;
          });
          const livreNaSuaParede = (q: Point) => {
            const pw = encaixarNaParede(q, ctx.m.walls.filter((w) => w.levelId === L0), 5)?.parede;
            return !!pw && !pilares.some((g) => pointInPolygon(g as Point[], q)) && (!emComum || !!encaixarNaParede(q, emComum, 5)) && !ctx.m.openings.some((o) => {
              if (o.wallId !== pw.id) return false;
              const Lp = Math.hypot(pw.b.x - pw.a.x, pw.b.y - pw.a.y) || 1;
              const t = ((q.x - pw.a.x) * (pw.b.x - pw.a.x) + (q.y - pw.a.y) * (pw.b.y - pw.a.y)) / Lp;
              return t > o.offsetMm - 300 && t < o.offsetMm + o.widthMm + 300;
            });
          };
          const reserva = novo ?? candidatas.filter((q) => Math.hypot(q.x - p0.x, q.y - p0.y) <= 1500 && livreNaSuaParede(q)).sort((a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y))[0];
          if (reserva) c.posicaoSugerida = reserva;
        }
      }
      const antes = new Set((ctx.m.quadros ?? []).map((q) => q.id));
      let n = aplicar(comandosParaOCentro(ctx.m, c));
      const quadro = (ctx.m.quadros ?? []).find((q) => !antes.has(q.id)) ?? (ctx.m.quadros ?? []).find((q) => q.id === c.quadroId) ?? null;
      quadroId = quadro?.id ?? null;
      eletrica.quadro = quadro?.nome ?? null;
      let nota = quadro ? `${quadro.nome} no centro de cargas` : 'sem quadro';
      if (quadro && hip.eletrica.medidor) {
        // F26: o medidor fica no muro, fora do vão dos portões.
        const frente = pontoNaFrente(ctx.m, quadro.at, { foraDosPortoes: true });
        if (frente) {
          const infra = (tipoEletrico: 'ENTRADA_SERVICO' | 'MEDIDOR'): Command => ({
            type: 'AddTerminal', levelId: niveis[0], disciplina: 'ELETRICA', tipo: ROTULO_DO_PONTO_ELETRICO[tipoEletrico], at: { ...frente.ponto },
            cotaMm: COTA_USUAL_DO_PONTO_ELETRICO[tipoEletrico], tipoEletrico, quadroId: quadro.id, sugerida: true,
          } as Command);
          n += aplicar([infra('ENTRADA_SERVICO'), infra('MEDIDOR')]);
          eletrica.medidor = true;
          nota += '; entrada de serviço e medidor na frente do lote';
          pendencias.push({ grupo: 'CONFERIR', texto: 'Entrada de energia: medidor posto na frente do lote, junto da divisa — confira o padrão de entrada da concessionária.' });
        } else {
          pendencias.push({ grupo: 'PREMISSA', texto: 'Entrada de energia: sem a frente do lote para o medidor.' });
        }
      }
      etapa('QUADRO', ROTULO_DA_ETAPA_DA_CASA.QUADRO, 'LANCOU', n, nota);
    });
    tentarEletrica('CIRCUITOS', () => {
      if (!quadroId) {
        etapa('CIRCUITOS', ROTULO_DA_ETAPA_DA_CASA.CIRCUITOS, 'NAO_RODOU', 0, 'sem quadro');
        return;
      }
      // Um quadro para a casa: os circuitos de cada pavimento saem dele (no sobrado, os de cima sobem por prumada).
      let n = 0;
      let circuitos = 0;
      let motivo: string | null = null;
      const porPavimento: string[] = [];
      for (const L of niveis) {
        const plano = planejarCircuitos(ctx.m, L, quadroId, hipCircuitos, hipEletricas);
        for (const f of plano.foraDoPlano) pendencias.push({ grupo: 'CONFERIR', texto: `Circuitos: ponto ${f.terminalId} fora do plano — ${f.motivo}`, ...comLocal(localDoElemento(ctx.m, [f.terminalId])) });
        circuitos += plano.circuitos.length;
        n += aplicar(plano.comandos);
        motivo ??= plano.comandos.length ? null : plano.motivo;
        if (niveis.length > 1) porPavimento.push(`${plano.circuitos.length} ${L === niveis[0] ? 'no térreo' : niveis.length > 2 ? `no ${niveis.indexOf(L)}º` : 'no superior'}`);
      }
      eletrica.circuitos = circuitos;
      etapa('CIRCUITOS', ROTULO_DA_ETAPA_DA_CASA.CIRCUITOS, n ? 'LANCOU' : 'NADA_A_FAZER', n, n ? `${circuitos} circuito(s)${porPavimento.length ? ` (${porPavimento.join(', ')})` : ''}` : motivo);
    });
    tentarEletrica('CLIMATIZACAO', () => {
      if (!hip.climatizacao.lancar) {
        etapa('CLIMATIZACAO', ROTULO_DA_ETAPA_DA_CASA.CLIMATIZACAO, 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
        return;
      }
      const modelos = entrada.modelosDeClimatizacao ?? [];
      if (modelos.length === 0) {
        const motivo = 'sem catálogo de evaporadoras — cadastre os modelos (Catálogo de tipos) para escolher os splits';
        etapa('CLIMATIZACAO', ROTULO_DA_ETAPA_DA_CASA.CLIMATIZACAO, 'NAO_RODOU', 0, motivo);
        pendencias.push({ grupo: 'PREMISSA', texto: `Climatização: ${motivo}` });
        return;
      }
      // F14d (decisão do usuário, 16/10/2026: "Evaporadora na parede externa"): o split na parede externa, mesmo sobre a
      // janela (o topo da evaporadora abaixo do forro), e a linha e o dreno saindo juntos pela parede atrás dela.
      const tetoDoAr = Math.min(...niveis.map((L) => ctx.m.levels.find((l) => l.id === L)?.defaultHeightMm ?? 2800));
      const topoDaEvaporadora = forroLigado ? tetoDoAr - rebaixoDoForro - hip.climatizacao.folgaDaEvaporadoraAoForroMm : tetoDoAr - hip.climatizacao.folgaDaEvaporadoraAoForroMm - 200;
      const plano = gerarClimatizacao(ctx.m, entrada.climatizacao ?? HIPOTESES_CLIMATIZACAO_PADRAO, {
        modelos,
        circuitos: { hip: hipCircuitos, eletricas: hipEletricas },
        linhaNoForro: forroLigado ? { faixa: hip.forro.frigorigena, folgaSobAVigaMm: hip.forro.folgaSobAVigaMm } : null,
        splitNaParedeExterna: hip.climatizacao.naParedeExterna ? { topoMaximoMm: topoDaEvaporadora } : null,
        // F19: com o forro (decisão "manter 2,80 m, furar vigas"), a travessia de viga é furo previsto, como nas outras redes.
        travessiaDeVigaEhFuro: forroLigado,
        ...(entrada.cargaDaClimatizacao ? { carga: entrada.cargaDaClimatizacao } : {}),
      });
      for (const e of plano.etapas) climatizacao.etapas[e.id] = e.situacao;
      // O "conflito" de 0 mm é ENCOSTO (redes paralelas lado a lado — a linha com o dreno do mesmo split, o ramal ao
      // lado do eletroduto): nenhum eixo dentro. Um a um, eram ~90 linhas que escondiam o resto; vira uma, com a conta.
      const encostos = plano.pendencias.filter((x) => x.grupo === 'CONFLITO' && /\(0 mm dentro\)/.test(x.texto)).length;
      for (const x of plano.pendencias) if (!(x.grupo === 'CONFLITO' && /\(0 mm dentro\)/.test(x.texto))) pendencias.push({ ...x, texto: `Climatização: ${x.texto}` });
      if (encostos) pendencias.push({ grupo: 'CONFERIR', texto: `Climatização: ${encostos} encosto(s) entre redes (lado a lado, nenhum eixo dentro) — o afastamento entre redes não é tratado` });
      const n = aplicar(plano.comandos);
      climatizacao.equipamentos = plano.comandos.filter((c) => c.type === 'AddTerminal' && (c as { tipoEletrico?: string | null }).tipoEletrico === 'AR_CONDICIONADO').length;
      const lancou = plano.etapas.filter((e) => e.situacao === 'LANCOU').map((e) => e.rotulo.toLowerCase());
      const travou = plano.etapas.find((e) => e.situacao === 'NAO_RODOU');
      etapa('CLIMATIZACAO', ROTULO_DA_ETAPA_DA_CASA.CLIMATIZACAO, n > 0 ? 'LANCOU' : 'NAO_RODOU', n, n > 0 ? `${climatizacao.equipamentos} split(s); lançou: ${lancou.join(', ')}` : (travou?.nota ?? 'nada a climatizar'));
      if (n > 0) verificarRedes(ROTULO_DA_DISCIPLINA_DO_AR, climatizacao.verificacao);
    });
    tentarEletrica('DR_DPS', () => {
      if (!quadroId) {
        etapa('DR_DPS', ROTULO_DA_ETAPA_DA_CASA.DR_DPS, 'NAO_RODOU', 0, 'sem quadro');
        return;
      }
      const drs = comandosDasSugestoesDeDR(sugerirDRs(ctx.m, quadroId, hipEletricas));
      const quadro = (ctx.m.quadros ?? []).find((q) => q.id === quadroId);
      const dps: Command[] = quadro && !quadro.dps ? [{ type: 'SetQuadroProps', quadroId, dps: sugerirDPS(hipEletricas) } as Command] : [];
      // A LIGAÇÃO pela demanda (com os circuitos prontos): a menor categoria do padrão de entrada que comporta a
      // demanda — no empate, a de menos fases. O quadro nasce sem ligação (vale FN), e a casa com chuveiro, forno e
      // ar passa dos 10 kVA de uma monofásica.
      const nFases = { FN: 1, FF: 2, FFF: 3 } as Record<string, number>;
      const entradaAgora = entradaDoQuadro(ctx.m, quadroId, hipEletricas);
      const categoria = entradaAgora
        ? [...padraoDeEntrada(hipEletricas.padraoDeEntrada).categorias].sort((a, b) => a.demandaMaxKva - b.demandaMaxKva || (nFases[a.ligacao] ?? 9) - (nFases[b.ligacao] ?? 9)).find((c) => c.demandaMaxKva >= entradaAgora.demandaKva) ?? null
        : null;
      const ligacao: Command[] = categoria && entradaAgora && categoria.ligacao !== entradaAgora.ligacao ? [{ type: 'SetQuadroProps', quadroId, ligacao: categoria.ligacao } as Command] : [];
      eletrica.drs = drs.length;
      eletrica.dps = dps.length > 0 || !!quadro?.dps;
      eletrica.entrada = categoria && entradaAgora ? { categoria: categoria.id, ligacao: categoria.ligacao, demandaKva: Math.round(entradaAgora.demandaKva * 10) / 10 } : null;
      if (entradaAgora && !categoria) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Entrada de energia: demanda ${entradaAgora.demandaKva.toFixed(1)} kVA acima da maior categoria do padrão — trate com a concessionária` });
      const notaDaEntrada = eletrica.entrada ? `; entrada ${eletrica.entrada.categoria} (${eletrica.entrada.ligacao}, ${eletrica.entrada.demandaKva.toLocaleString('pt-BR')} kVA)` : '';
      etapa('DR_DPS', ROTULO_DA_ETAPA_DA_CASA.DR_DPS, 'LANCOU', aplicar([...drs, ...dps, ...ligacao]), `${drs.length} DR(s) de 30 mA${dps.length ? '; DPS no quadro' : ''}${notaDaEntrada}`);
    });
    // F5 do relançar (24/10/2026): o REGISTRO dos circuitos automáticos, por pavimento, no lote da casa — com que
    // escolhas e QUAIS circuitos a casa criou (pelo motor: os do pavimento e os do ar-condicionado, mesmas escolhas).
    // O painel dos circuitos avisa quando as escolhas de lá diferem e o "Relançar" refaz só estes; o circuito que o
    // usuário alterar depois fica. Depois do DR (que não muda o circuito) e antes dos eletrodutos (idem).
    {
      const daCasa = new Set((ctx.m.circuitos ?? []).map((c) => c.id).filter((id) => !(original.circuitos ?? []).some((c) => c.id === id)));
      for (const L of niveis) {
        const registro = comandoDeRegistroDosCircuitosCriados(ctx.m, L, daCasa, hipCircuitos, hipEletricas);
        if (registro) aplicar([registro]);
      }
    }
    tentarEletrica('ELETRODUTOS', () => {
      // F14b: no forro, na faixa do eletroduto. Task 3 (24/10/2026, "a regra vale também no forro"): quadro → luz do
      // ambiente → tomadas, como na obra — a luz → ponto reta pela faixa até a vertical dele no anel, e a descida do
      // forro; os anéis dos cômodos ficam para o ambiente sem luz. O que cruzar outra rede, o detector de conflitos avisa.
      // F2 (24/10/2026): as caixas de passagem são a preferência do usuário (padrão "pela luz do teto", sem caixas). As
      // outras escolhas (bitola, rota pela parede, encaminhamento) são as do planejador: com o painel dos eletrodutos no
      // padrão, o registro bate e não há aviso; com o painel fora do padrão, o aviso acende — e é diferença real (relançar
      // pelo painel usaria as escolhas de lá).
      const caixas = entrada.caixasDePassagem === 'CAIXAS' ? REGRA_DE_CAIXAS_PADRAO : null;
      const hipEletrodutos: HipotesesDeEletroduto = forroLigado
        ? { ...HIPOTESES_ELETRODUTO_PADRAO, caixas, encaminhamento: 'PELA_LUZ_DO_AMBIENTE' as const, noForro: forroDaEletrica(hip.forro) }
        : { ...HIPOTESES_ELETRODUTO_PADRAO, caixas };
      const planos = planejarEletrodutosDoModelo(ctx.m, hipEletrodutos, hipEletricas);
      // O REGISTRO do lançamento (com que escolhas), por quadro, no mesmo lote — o painel dos eletrodutos avisa quando
      // as escolhas de lá diferem e oferece refazer.
      const escolhas = escolhasDoEletroduto(hipEletrodutos, hipEletricas);
      const lote = planos.flatMap((p) => (p.comandos.length ? [...p.comandos, comandoDeRegistro('ELETRODUTOS', p.quadroId, escolhas)] : []));
      for (const a of new Set(planos.flatMap((p) => p.avisos))) pendencias.push({ grupo: 'CONFERIR', texto: `Eletrodutos: ${a}` });
      eletrica.eletrodutos = lote.filter((c) => c.type === 'AddTrecho').length;
      const motivo = planos.find((p) => p.motivo)?.motivo ?? null;
      let n = aplicar(lote);
      // O diâmetro pela fiação DERIVADA (a régua da conferência 6.2.11.1.6), não pela base por ligação.
      const bitolas = comandosDeBitolaPelaOcupacao(ctx.m, hipEletricas);
      n += aplicar(bitolas);
      etapa('ELETRODUTOS', ROTULO_DA_ETAPA_DA_CASA.ELETRODUTOS, lote.length ? 'LANCOU' : 'NAO_RODOU', n, lote.length ? `${eletrica.eletrodutos} trecho(s)${bitolas.length ? `; ${bitolas.length} com o diâmetro aumentado pela ocupação` : ''}` : (motivo ?? 'nada a ligar'));
    });

    eletrica.circuitos = (ctx.m.circuitos ?? []).filter((c) => c.quadroId === quadroId).length;
    // A CONFERÊNCIA NBR 5410 do app sobre o resultado, por regra.
    for (const r of niveis.flatMap((L) => conferirNbr5410(ctx.m, L, hipEletricas).regras)) {
      const faltas = r.achados.filter((a) => a.nivel === 'FALTA').length;
      const avisosR = r.achados.filter((a) => a.nivel === 'AVISO').length;
      if (!faltas && !avisosR) continue;
      eletrica.conferencia.porRegra[r.codigo] = { faltas, avisos: avisosR };
      eletrica.conferencia.faltas += faltas;
      eletrica.conferencia.avisos += avisosR;
      const locaisDos = (nivel: 'FALTA' | 'AVISO') => r.achados.filter((a) => a.nivel === nivel).flatMap((a) => (a.ids.length ? [localDoElemento(ctx.m, a.ids)].filter((l): l is LocalDaPendencia => !!l) : []));
      if (faltas) pendencias.push({ grupo: 'VERIFICACAO', texto: `Elétrica (${r.codigo} — ${r.titulo}): ${faltas} falta(s) — ${r.achados.find((a) => a.nivel === 'FALTA')!.mensagem}`, ...comLocais(locaisDos('FALTA')) });
      if (avisosR) pendencias.push({ grupo: 'CONFERIR', texto: `Elétrica (${r.codigo} — ${r.titulo}): ${avisosR} aviso(s) — ${r.achados.find((a) => a.nivel === 'AVISO')!.mensagem}`, ...comLocais(locaisDos('AVISO')) });
    }
  }

  // ── FORRO (F14b) ───────────────────────────────────────────────────────────
  // O forro de cada cômodo com nome (o vazio da escada e o shaft, não) — gesso; PVC nos molhados — ao rebaixo que
  // acomoda as faixas das redes; o pé-direito livre conferido pelo uso (permanência ou não).
  let forro: PlanoDaCasa['resumo']['forro'] = null;
  if (!forroLigado) etapa('FORRO', ROTULO_DA_ETAPA_DA_CASA.FORRO, 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa — as redes correm 10 cm sob a viga');
  else {
    const lote: Command[] = [];
    let menorLivre = Infinity;
    const abaixo: string[] = [];
    const locaisDoForroBaixo: LocalDaPendencia[] = [];
    for (const L of niveis) {
      for (const sp of comodosComForro(ctx.m, L)) {
        const f = forroDoComodo(ctx.m, sp);
        if (!f.etiqueta) continue;
        const livre = f.faceMm - hip.forro.pisoAcabadoMm;
        menorLivre = Math.min(menorLivre, livre);
        if (livre < f.minimoMm) {
          abaixo.push(`${sp.name} (${f2(livre / 1000)} m; mínimo ${f2(f.minimoMm / 1000)} m)`);
          const l = localDoElemento(ctx.m, [sp.id]);
          if (l) locaisDoForroBaixo.push(l);
        }
        lote.push({
          type: 'SetSpaceLabelProps',
          labelId: f.etiqueta.id,
          acabamentos: { ...(f.etiqueta.acabamentos ?? {}), forro: { camadas: f.preset.camadas.map((c) => ({ ...c })), rebaixoMm: rebaixoDoForro } },
        } as Command);
      }
    }
    const n = aplicar(lote);
    forro = { comodos: lote.length, rebaixoMm: rebaixoDoForro, peDireitoLivreMinimoMm: Number.isFinite(menorLivre) ? Math.round(menorLivre) : null };
    if (abaixo.length)
      pendencias.push({ grupo: 'PREMISSA', texto: `Forro: pé-direito livre abaixo do mínimo em ${abaixo.join(', ')} — as faixas das redes pedem ${f2(rebaixoDoForro / 1000)} m de plenum; aumente o pé-direito ou aperte as faixas`, ...comLocais(locaisDoForroBaixo) });
    pendencias.push({ grupo: 'CONFERIR', texto: `Forro: as redes correm no plenum (${f2(rebaixoDoForro / 1000)} m), atravessam as vigas entre os cômodos e descem aos pontos junto da viga, em caixote de gesso — os furos vão ao calculista (F14c)` });
    etapa('FORRO', ROTULO_DA_ETAPA_DA_CASA.FORRO, 'LANCOU', n, `${lote.length} cômodo(s), rebaixo de ${f2(rebaixoDoForro / 1000)} m; pé-direito livre mínimo de ${Number.isFinite(menorLivre) ? f2(menorLivre / 1000) : '—'} m`);
  }

  // ── FUROS PREVISTOS (F14c) ─────────────────────────────────────────────────
  // Toda passagem de rede por viga, baldrame e laje, com a avaliação dos critérios na viga — a lista para o calculista
  // (decisão do usuário: "manter 2,80 m, furar vigas"). Sai do modelo como ele ficou, com todas as redes.
  const listaDeFuros = furosPrevistos(ctx.m);
  const naViga = listaDeFuros.filter((f) => f.tipoDaPeca === 'VIGA');
  const furos: PlanoDaCasa['resumo']['furos'] = {
    emViga: naViga.length,
    dispensa: naViga.filter((f) => f.dispensa).length,
    verificar: naViga.filter((f) => f.dispensa === false).length,
    emBaldrame: listaDeFuros.filter((f) => f.tipoDaPeca === 'VIGA_FUNDACAO').length,
    emLaje: listaDeFuros.filter((f) => f.tipoDaPeca === 'LAJE').length,
    lista: listaDeFuros,
  };
  if (listaDeFuros.length)
    pendencias.push({
      grupo: 'CONFERIR',
      texto: `Furos previstos para o calculista: ${furos.emViga} em viga (${furos.dispensa} dispensam a verificação pelos critérios da NBR 6118, 13.2.5.1; ${furos.verificar} a verificar), ${furos.emBaldrame} em baldrame e ${furos.emLaje} passagem(ns) em laje — a lista está na tela da casa.`,
    });

  // As redes × PORTAS e JANELAS: o tubo que corre na cota do topo da janela (2,20 m — a mesma dos ramais, do
  // eletroduto e da linha abaixo da viga) ou que sai da parede para fora no vão dela. Fica à vista, por rede.
  const redesEmAberturas: Record<string, number> = {};
  {
    const porId = new Map((ctx.m.trechos ?? []).map((t) => [t.id, t]));
    // Etapa C (11/11/2026): cada contagem leva os locais dos conflitos — o Relatório leva à planta da prévia e ao editor.
    const locaisDasAberturas: Record<string, LocalDaPendencia[]> = {};
    const juntar = (alvo: Record<string, LocalDaPendencia[]>, k: string, l: LocalDaPendencia | null) => {
      if (l) (alvo[k] ??= []).push(l);
    };
    for (const c of conflitosDoModelo(ctx.m)) {
      if (c.classe !== 'ABERTURA' || c.comprimentoDentroMm <= 0) continue;
      const d = porId.get(c.trechoId)?.disciplina;
      if (d) {
        redesEmAberturas[d] = (redesEmAberturas[d] ?? 0) + 1;
        juntar(locaisDasAberturas, d, localDoConflito(ctx.m, c));
      }
    }
    const nome: Record<string, string> = { ...ROTULO_DA_DISCIPLINA_DA_REDE, ...ROTULO_DA_DISCIPLINA_DO_AR, ELETRICA: 'eletroduto' };
    for (const [d, n] of Object.entries(redesEmAberturas)) pendencias.push({ grupo: 'VERIFICACAO', texto: `Rede de ${nome[d] ?? d.toLowerCase()}: ${n} trecho(s) passando por porta ou janela`, ...comLocais(locaisDasAberturas[d]) });
    // F27 da casa automática (18/10/2026): os ENCONTROS de uma rede com outra, e o tubo que atravessa pilar, também
    // ficam à vista — por par de redes. Até aqui só a sonda os contava: a tela não dizia, e o Automático, que pesa as
    // pendências, escolhia o sobrado com o esgoto suspenso cruzando os eletrodutos do forro do térreo contra uma térrea
    // sem encontro nenhum.
    const est = new Map((ctx.m.structures ?? []).map((x) => [x.id, x]));
    const pares: Record<string, number> = {};
    const locaisDosPares: Record<string, LocalDaPendencia[]> = {};
    const locaisDosPilares: Record<string, LocalDaPendencia[]> = {};
    let emPilar = 0;
    for (const c of conflitosDoModelo(ctx.m)) {
      const t = porId.get(c.trechoId);
      if (!t) continue;
      if (c.classe === 'REDE') {
        const o = porId.get(c.outroId);
        if (!o) continue;
        const chave = [nome[t.disciplina] ?? t.disciplina.toLowerCase(), nome[o.disciplina] ?? o.disciplina.toLowerCase()].sort().join(' × ');
        pares[chave] = (pares[chave] ?? 0) + 1;
        juntar(locaisDosPares, chave, localDoConflito(ctx.m, c));
      } else if (c.classe === 'ESTRUTURA' && est.get(c.outroId)?.kind === 'PILAR' && c.comprimentoDentroMm > 0) {
        emPilar++;
        juntar(locaisDosPilares, 'pilar', localDoConflito(ctx.m, c));
      }
    }
    for (const [par, n] of Object.entries(pares)) pendencias.push({ grupo: 'CONFLITO', texto: `Redes: ${n} encontro(s) de ${par}`, ...comLocais(locaisDosPares[par]) });
    if (emPilar) pendencias.push({ grupo: 'CONFLITO', texto: `Redes: ${emPilar} trecho(s) atravessando pilar`, ...comLocais(locaisDosPilares.pilar) });
  }
  return { ancoras, mobiliario, hidraulica, eletrica, climatizacao, redesEmAberturas, forro, furos };
}
