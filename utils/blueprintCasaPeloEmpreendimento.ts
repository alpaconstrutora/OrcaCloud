// utils/blueprintCasaPeloEmpreendimento.ts
//
// CASA PELO EMPREENDIMENTO (25/10/2026, pedido "construir através dos dados de incorporação > empreendimento"):
// o botão "Construir pelo Empreendimento" da tela Casa automática encadeia o que já existia espalhado em duas
// telas — o lote pela ficha (era "Criar lote pela ficha" em Dados do lote), a zona do Mapa Regulatório (já entrava
// sozinha quando única), a unidade que preenche o programa (seletor da F15) — e gera a prévia. Plano:
// docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md.
//
// Puro: diz, passo a passo, o que está FEITO, o que o botão FAZ, onde ele precisa PERGUNTAR (não chuta — a
// profundidade da ficha que não fecha a área, várias zonas, várias unidades: decisões anteriores do usuário), o que
// FALTA (desliga o botão, com o motivo) e o que só merece AVISO. "Lançar" continua sendo o clique de confirmação.

import type { DadosDoEmpreendimentoParaPlanta } from './blueprintDadosDoEmpreendimento';
import { fecharLote, loteRetangular, type LoteFechado } from './blueprintLoteDigitado';
import { pontoCardeal, ROTULO_DO_PONTO_CARDEAL } from './blueprintGrafoEspacial';

export type PassoDaCasa = 'LOTE' | 'LOCAL' | 'ZONA' | 'UNIDADE' | 'GERAR';
export type EstadoDoPasso = 'FEITO' | 'FAZER' | 'PERGUNTAR' | 'FALTA' | 'AVISO';

export interface SituacaoDoPasso {
  passo: PassoDaCasa;
  rotulo: string;
  estado: EstadoDoPasso;
  texto: string;
}

export interface EntradaDosPassos {
  temPavimento: boolean;
  /** O pavimento aberto já tem paredes — a casa nasce num pavimento vazio. */
  pavimentoComParedes: boolean;
  /** O pavimento aberto já tem divisas de lote. */
  temLote: boolean;
  loteDaFicha: DadosDoEmpreendimentoParaPlanta['lote'];
  /** Por que a ficha não dá o lote (o mesmo texto de Dados do lote › Ficha do empreendimento). */
  motivoSemLoteNaFicha: string | null;
  /** 26/10/2026: o desenho já tem georreferência (nunca é sobrescrita). */
  temGeorreferencia?: boolean;
  /** 26/10/2026: latitude/longitude da ficha. */
  coordenadasDaFicha?: { latitude: number; longitude: number } | null;
  /** O rótulo da zona em vigor; `null` = nenhuma aplicada. */
  zonaAplicada: string | null;
  /** Quantas zonas o Empreendimento tem no Mapa Regulatório; `null` = ainda carregando. */
  zonasDoEmpreendimento: number | null;
  unidades: { id: string; rotulo: string }[];
  unidadeId: string | null;
  /** `motivoParaNaoGerar` da casa no desenho de agora. */
  motivoParaNaoGerar: string | null;
}

export interface PassosDaCasa {
  passos: SituacaoDoPasso[];
  /** Por que o botão está desligado; `null` = ligado. */
  motivoDoBotao: string | null;
  /** O primeiro passo que PERGUNTA: o botão faz o que vem antes e leva até ele. `null` = vai até gerar. */
  parada: PassoDaCasa | null;
}

/** A mesma régua do painel do lote digitado: até 1 cm é a mesma profundidade. */
export const MESMA_PROFUNDIDADE_MM = 10;

const metros = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function profundidadeAmbigua(l: NonNullable<DadosDoEmpreendimentoParaPlanta['lote']>): boolean {
  return l.profundidadeMm !== null && l.profundidadePelaAreaMm !== null && Math.abs(l.profundidadeMm - l.profundidadePelaAreaMm) > MESMA_PROFUNDIDADE_MM;
}

/**
 * O lote da ficha pronto para `comandosDoLote` — o que o painel do lote digitado montaria com a ficha sem mexer em
 * nada: retângulo (ou trapézio centralizado com os fundos), a frente na origem, sem orientação (a ficha não tem).
 * Profundidade só pela área = laterais calculadas (não viram escritura). Ambígua = não lança (o painel pergunta).
 */
export function loteDaFichaParaLancar(l: NonNullable<DadosDoEmpreendimentoParaPlanta['lote']>, rotacaoNorteDeg: number | null): LoteFechado {
  if (profundidadeAmbigua(l)) {
    return fecharLote({ ...loteRetangular({ frenteMm: 0, profundidadeMm: 0 }), problema: 'A profundidade da ficha não fecha a área total — escolha qual usar em Criar o lote digitando.' });
  }
  const pelaArea = l.profundidadeMm === null;
  const profundidadeMm = l.profundidadeMm ?? l.profundidadePelaAreaMm ?? 0;
  // 26/10/2026: a ficha pode dizer para onde a frente está voltada (`terreno_frente_azimute`).
  return fecharLote(
    loteRetangular({ frenteMm: l.frenteMm, fundosMm: l.fundosMm, profundidadeMm, lateraisCalculadas: pelaArea, frenteVoltadaPara: l.frenteVoltadaPara ?? null, rotacaoNorteDeg }),
    null,
  );
}

export function passosDaCasaPeloEmpreendimento(e: EntradaDosPassos): PassosDaCasa {
  const passos: SituacaoDoPasso[] = [];

  // ── Lote ──
  if (e.temLote) passos.push({ passo: 'LOTE', rotulo: 'Lote', estado: 'FEITO', texto: 'O lote já está desenhado neste pavimento.' });
  else if (!e.loteDaFicha) passos.push({ passo: 'LOTE', rotulo: 'Lote', estado: 'FALTA', texto: e.motivoSemLoteNaFicha ?? 'A ficha do Empreendimento não tem as medidas do terreno.' });
  else if (profundidadeAmbigua(e.loteDaFicha)) {
    const l = e.loteDaFicha;
    passos.push({
      passo: 'LOTE',
      rotulo: 'Lote',
      estado: 'PERGUNTAR',
      texto: `A profundidade da ficha (${metros(l.profundidadeMm!)} m) não fecha a área total (pediria ${metros(l.profundidadePelaAreaMm!)} m) — escolha qual usar no lote digitado.`,
    });
  } else {
    const l = e.loteDaFicha;
    const prof = l.profundidadeMm ?? l.profundidadePelaAreaMm!;
    const forma = l.fundosMm !== null && l.fundosMm !== l.frenteMm ? `frente ${metros(l.frenteMm)} m, fundos ${metros(l.fundosMm)} m × ${metros(prof)} m` : `${metros(l.frenteMm)} × ${metros(prof)} m`;
    passos.push({
      passo: 'LOTE',
      rotulo: 'Lote',
      estado: 'FAZER',
      texto: `Lança o lote da ficha (${forma}${l.profundidadeMm === null ? ', profundidade pela área total' : ''}). ${
        l.frenteVoltadaPara != null
          ? `Frente voltada para o ${ROTULO_DO_PONTO_CARDEAL[pontoCardeal(l.frenteVoltadaPara)]} (${l.frenteVoltadaPara}°), como na ficha.`
          : 'A ficha não tem a orientação da frente — informe em Torres & Unidades › Terreno ou confira em Dados do lote.'
      }`,
    });
  }

  // ── Local (26/10/2026): as coordenadas da ficha viram a georreferência do desenho, se ele ainda não tem ──
  if (e.temGeorreferencia) passos.push({ passo: 'LOCAL', rotulo: 'Local', estado: 'FEITO', texto: 'O desenho já está georreferenciado (a ficha não sobrescreve).' });
  else if (e.coordenadasDaFicha)
    passos.push({
      passo: 'LOCAL',
      rotulo: 'Local',
      estado: 'FAZER',
      texto: `Georreferencia o desenho pela ficha (${e.coordenadasDaFicha.latitude.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}, ${e.coordenadasDaFicha.longitude.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}) — latitude para o sol e o IFC.`,
    });
  else passos.push({ passo: 'LOCAL', rotulo: 'Local', estado: 'AVISO', texto: 'A ficha não tem latitude e longitude — o desenho fica sem georreferência (informe em Torres & Unidades › Terreno).' });

  // ── Zona ──
  if (e.zonaAplicada) passos.push({ passo: 'ZONA', rotulo: 'Zona', estado: 'FEITO', texto: `Zona em vigor: ${e.zonaAplicada}.` });
  else if (e.zonasDoEmpreendimento === null) passos.push({ passo: 'ZONA', rotulo: 'Zona', estado: 'FAZER', texto: 'Carregando as zonas do Mapa Regulatório…' });
  else if (e.zonasDoEmpreendimento === 1) passos.push({ passo: 'ZONA', rotulo: 'Zona', estado: 'FAZER', texto: 'Aplica a zona do Empreendimento (é a única do Mapa Regulatório).' });
  else if (e.zonasDoEmpreendimento > 1)
    passos.push({ passo: 'ZONA', rotulo: 'Zona', estado: 'PERGUNTAR', texto: `O Empreendimento tem ${e.zonasDoEmpreendimento} zonas no Mapa Regulatório — escolha a deste lote em Dados do lote › Zona.` });
  else passos.push({ passo: 'ZONA', rotulo: 'Zona', estado: 'AVISO', texto: 'O Empreendimento não tem zona no Mapa Regulatório — a casa sai sem os recuos e índices da lei.' });

  // ── Unidade ──
  if (e.unidadeId) {
    const u = e.unidades.find((x) => x.id === e.unidadeId);
    passos.push({ passo: 'UNIDADE', rotulo: 'Unidade', estado: 'FEITO', texto: u ? `O programa é o da unidade ${u.rotulo}.` : 'A unidade escolhida não está mais no Empreendimento — escolha outra em Programa.' });
  } else if (e.unidades.length === 1)
    passos.push({ passo: 'UNIDADE', rotulo: 'Unidade', estado: 'FAZER', texto: `Preenche o programa pela unidade ${e.unidades[0].rotulo} (a única do Empreendimento).` });
  else if (e.unidades.length > 1)
    passos.push({ passo: 'UNIDADE', rotulo: 'Unidade', estado: 'PERGUNTAR', texto: `O Empreendimento tem ${e.unidades.length} unidades — escolha a desta casa em Programa.` });
  else passos.push({ passo: 'UNIDADE', rotulo: 'Unidade', estado: 'AVISO', texto: 'O Empreendimento não tem unidades em Torres & Unidades — vale o programa desta tela.' });

  // ── Gerar ──
  // Sem lote, o motivo da casa é o próprio lote (que o botão lança); pavimento ausente ou com paredes, não.
  const motivoQueOBotaoNaoResolve = !e.temPavimento
    ? 'Abra um pavimento para gerar a casa.'
    : e.pavimentoComParedes || e.temLote
      ? e.motivoParaNaoGerar
      : null;
  passos.push(
    motivoQueOBotaoNaoResolve
      ? { passo: 'GERAR', rotulo: 'Gerar', estado: 'FALTA', texto: motivoQueOBotaoNaoResolve }
      : { passo: 'GERAR', rotulo: 'Gerar', estado: 'FAZER', texto: 'Gera a prévia da casa. Lançar no desenho continua sendo o seu clique.' },
  );

  const falta = passos.find((p) => p.estado === 'FALTA');
  const carregando = !e.zonaAplicada && e.zonasDoEmpreendimento === null;
  return {
    passos,
    motivoDoBotao: falta ? falta.texto : carregando ? 'Aguarde: carregando as zonas do Empreendimento.' : null,
    parada: passos.find((p) => p.estado === 'PERGUNTAR')?.passo ?? null,
  };
}
