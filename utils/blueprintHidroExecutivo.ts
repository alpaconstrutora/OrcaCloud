/**
 * PROJETO EXECUTIVO HIDROSSANITÁRIO com ART (29/09/2026, E3.3 do roadmap
 * hidrossanitário). Molde: `blueprintEletricaExecutivo.ts`.
 *
 * A CONFERÊNCIA reúne o que já se calcula — pressões (NBR 5626), DN e
 * declividade por UHC (NBR 8160), pontas abertas, fontes sem rede, peças ainda
 * sugeridas — em verificações `exigido × obtido`. Sem nenhuma pendente, o
 * responsável emite: o registro fica imutável (trigger no banco), amarrado ao
 * hash do desenho E das premissas, e deixa de valer quando qualquer um muda.
 *
 * O MEMORIAL da emissão é a capa executiva (responsável, ART, base,
 * verificações, declaração) seguida do memorial de cálculo e do descritivo —
 * guardado em texto (`linhasDoMemorial`) e reaberto em PDF/DOCX.
 *
 * NBR 10844 (pluvial) e 7229 (tanque séptico) entram quando os sistemas
 * existirem no desenho (Etapas 6 e 7); hoje não há o que conferir.
 *
 * O software não emite projeto — quem emite é o responsável técnico.
 */
import type { BlueprintModel } from './blueprintKernel';
import { KERNEL_VERSION, sha256, snapshotHash, stableStringify } from './blueprintKernel';
import type { ResponsavelTecnico } from './blueprintTopografiaExecutivo';
import { planejarAguaDoModelo } from './blueprintAguaAutomatica';
import { pressoesDoModelo } from './blueprintPressaoDaRede';
import { esgotoTrechoATrecho, planejarEsgoto } from './blueprintEsgotoAutomatico';
import { marcasDeVerificacao } from './blueprintVerificacaoRede';
import { colunasDoModelo } from './blueprintEsquemaVertical';
import { dimensionarReservacao } from './blueprintReservacao';
import { ROTULO_DO_ALIMENTADOR, planejarAlimentador } from './blueprintAlimentador';
import { ROTULO_DA_SUCCAO, ROTULO_DO_RECALQUE, planejarRecalque } from './blueprintRecalque';
import { memorialDeCalculoHidro, memorialDescritivoHidro, nBr, type BlocoDoMemorial, type HipotesesHidro } from './blueprintMemorialHidro';

export interface VerificacaoHidro {
  grupo: 'RESPONSAVEL' | 'DADOS' | 'NBR5626' | 'NBR8160';
  item: string;
  norma: string;
  exigido: string;
  obtido: string;
  atende: boolean;
}

export interface ResultadoHidroExecutivo {
  verificacoes: VerificacaoHidro[];
  podeEmitir: boolean;
  pendencias: string[];
}

/** Velocidade máxima da NBR 5626 (a premissa de projeto costuma ser menor). */
const VELOCIDADE_MAXIMA_DA_NORMA_MS = 3;
const HIDRAULICAS = ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'] as const;

export function verificacoesHidro(model: BlueprintModel, hip: HipotesesHidro, responsavel: ResponsavelTecnico): ResultadoHidroExecutivo {
  const v: VerificacaoHidro[] = [];
  const sigla = responsavel.conselho === 'CAU' ? 'RRT' : 'ART';
  v.push({
    grupo: 'RESPONSAVEL',
    item: 'Responsável técnico identificado',
    norma: 'Lei 5.194/66 · Lei 12.378/10',
    exigido: 'nome e registro no conselho',
    obtido: responsavel.nome.trim() && responsavel.registro.trim() ? `${responsavel.nome} (${responsavel.conselho} ${responsavel.registro})` : 'incompleto',
    atende: !!(responsavel.nome.trim() && responsavel.registro.trim()),
  });
  v.push({
    grupo: 'RESPONSAVEL',
    item: `${sigla} recolhida`,
    norma: responsavel.conselho === 'CAU' ? 'Lei 12.378/10' : 'Lei 6.496/77',
    exigido: 'número e data',
    obtido: responsavel.artNumero.trim() && responsavel.artData ? `nº ${responsavel.artNumero}` : 'incompleta',
    atende: !!(responsavel.artNumero.trim() && responsavel.artData),
  });

  const trechos = (model.trechos ?? []).filter((t) => (HIDRAULICAS as readonly string[]).includes(t.disciplina));
  const terminais = (model.terminais ?? []).filter((t) => t.tipoHidraulico && (HIDRAULICAS as readonly string[]).includes(t.disciplina));
  const temAgua = trechos.some((t) => t.disciplina !== 'ESGOTO') || terminais.some((t) => t.disciplina !== 'ESGOTO');
  const temEsgoto = trechos.some((t) => t.disciplina === 'ESGOTO') || terminais.some((t) => t.disciplina === 'ESGOTO');

  // ── Dados do desenho ────────────────────────────────────────────────────────
  v.push({
    grupo: 'DADOS',
    item: 'Há instalação hidrossanitária no desenho',
    norma: '—',
    exigido: 'rede de água ou de esgoto',
    obtido: temAgua || temEsgoto ? [temAgua && 'água', temEsgoto && 'esgoto'].filter(Boolean).join(' e ') : 'nenhuma',
    atende: temAgua || temEsgoto,
  });
  const sugeridos = trechos.filter((t) => t.sugerido).length + terminais.filter((t) => t.sugerida).length;
  v.push({
    grupo: 'DADOS',
    item: 'Nenhuma peça ainda sugerida',
    norma: '—',
    exigido: 'todas confirmadas (aceitas ou movidas)',
    obtido: sugeridos ? `${sugeridos} sugerida(s)` : 'todas confirmadas',
    atende: sugeridos === 0,
  });
  const pressoes = temAgua ? pressoesDoModelo(model, hip.pressao) : [];
  const marcas = marcasDeVerificacao(model, null, pressoes);
  const pontas = marcas.filter((m) => m.tipo === 'PONTA_ABERTA' && m.disciplina && (HIDRAULICAS as readonly string[]).includes(m.disciplina)).length;
  v.push({ grupo: 'DADOS', item: 'Nenhuma ponta aberta', norma: '—', exigido: '0', obtido: String(pontas), atende: pontas === 0 });
  const loucas = marcas.filter((m) => m.tipo === 'LOUCA_SEM_PONTO').length;
  v.push({ grupo: 'DADOS', item: 'Toda louça tem os seus pontos', norma: '—', exigido: '0 sem ponto', obtido: loucas ? `${loucas} sem ponto` : 'todas', atende: loucas === 0 });

  // ── NBR 5626 ────────────────────────────────────────────────────────────────
  if (temAgua) {
    const semLigar = planejarAguaDoModelo(model, hip.agua).reduce((s, p) => s + p.aLigar, 0);
    v.push({ grupo: 'NBR5626', item: 'Todo ponto de água ligado à rede', norma: 'NBR 5626', exigido: '0 a ligar', obtido: semLigar ? `${semLigar} a ligar` : 'todos', atende: semLigar === 0 });
    const naoCalculadas = pressoes.filter((r) => r.motivo).length;
    v.push({ grupo: 'NBR5626', item: 'Toda rede de água calculada', norma: 'NBR 5626', exigido: 'todas', obtido: naoCalculadas ? `${naoCalculadas} sem cálculo` : 'todas', atende: naoCalculadas === 0 });
    const pontos = pressoes.flatMap((r) => r.pontos);
    const baixas = pontos.filter((p) => p.estado === 'INSUFICIENTE');
    const pior = [...pontos].filter((p) => p.disponivelKpa != null).sort((a, b) => a.disponivelKpa! - a.minimaKpa - (b.disponivelKpa! - b.minimaKpa))[0];
    v.push({
      grupo: 'NBR5626',
      item: 'Pressão dinâmica mínima em cada ponto',
      norma: 'NBR 5626:2020',
      exigido: `≥ ${nBr(hip.pressao.pressaoMinimaKpa, 0)} kPa (válvula de descarga ≥ 20)`,
      obtido: baixas.length ? `${baixas.length} ponto(s) abaixo; pior ${pior ? `${pior.nome} ${nBr(pior.disponivelKpa!, 1)} kPa` : '—'}` : pior ? `pior ${pior.nome} ${nBr(pior.disponivelKpa!, 1)} kPa` : 'sem pontos',
      atende: baixas.length === 0,
    });
    const altas = pontos.filter((p) => p.estado === 'EXCESSIVA').length;
    v.push({ grupo: 'NBR5626', item: 'Pressão estática máxima', norma: 'NBR 5626:2020', exigido: `≤ ${nBr(hip.pressao.estaticaMaximaKpa, 0)} kPa`, obtido: altas ? `${altas} ponto(s) acima` : 'todos abaixo', atende: altas === 0 });
    const vMax = Math.max(0, ...pressoes.flatMap((r) => r.trechos.map((t) => t.velocidadeMs)));
    // E4.3: a entrada de água e o alimentador até a boia, com pressão.
    const alim = planejarAlimentador(model, hip.alimentacao, hip.reservatorio, hip.pressao.qMaxDoHidrometroM3h);
    const lancado = (model.trechos ?? []).some((t) => t.rotulo === ROTULO_DO_ALIMENTADOR);
    v.push({
      grupo: 'NBR5626',
      item: 'Entrada de água e alimentador predial',
      norma: 'NBR 5626',
      exigido: 'hidrômetro e alimentador até o reservatório',
      obtido: alim.motivo ?? (lancado ? `DN ${alim.dnMm}, ${nBr(alim.comprimentoM)} m` : 'alimentador não lançado'),
      atende: !alim.motivo && lancado,
    });
    if (!alim.motivo) {
      v.push({
        grupo: 'NBR5626',
        item: 'Pressão na torneira de boia',
        norma: 'NBR 5626',
        exigido: `≥ ${nBr(hip.alimentacao.pressaoMinimaNaBoiaKpa, 0)} kPa (rede pública ${nBr(hip.alimentacao.pressaoDaRedePublicaKpa, 0)} kPa)`,
        obtido: `${nBr(alim.pressaoNaBoiaKpa, 1)} kPa`,
        atende: alim.atende,
      });
    }
    // E4.4: com inferior, o recalque lançado (bomba, sucção e recalque).
    const rc = planejarRecalque(model, hip.recalque, hip.reservatorio);
    if (rc.inferiorId || rc.motivo) {
      const temBomba = (model.terminais ?? []).some((t) => t.tipoHidraulico === 'BOMBA');
      const temRecalque = (model.trechos ?? []).some((t) => t.rotulo === ROTULO_DO_RECALQUE) && (model.trechos ?? []).some((t) => t.rotulo === ROTULO_DA_SUCCAO);
      v.push({
        grupo: 'NBR5626',
        item: 'Recalque do inferior ao superior',
        norma: 'NBR 5626',
        exigido: 'bomba, sucção e recalque',
        obtido: rc.motivo ?? (temBomba && temRecalque ? `bomba ${nBr(rc.motorCv, rc.motorCv < 1 ? 2 : 1)} cv, Hman ${nBr(rc.alturaManometricaM, 1)} mca` : 'não lançado'),
        atende: !rc.motivo && temBomba && temRecalque,
      });
    }
    // E4.1: a caixa guarda ao menos o consumo dos dias de reserva.
    const reserva = dimensionarReservacao(model, hip.reservatorio);
    v.push({
      grupo: 'NBR5626',
      item: 'Volume de reservação',
      norma: 'NBR 5626',
      exigido: reserva.populacao.pessoas > 0 ? `≥ ${Math.round(reserva.volumeNecessarioL).toLocaleString('pt-BR')} L (${reserva.populacao.pessoas} pessoa(s) × ${nBr(hip.reservatorio.perCapitaLDia, 0)} L × ${nBr(hip.reservatorio.diasDeReserva, 0)} dia(s))` : 'população conhecida',
      obtido: reserva.situacao === 'ATENDE' ? `${Math.round(reserva.declaradoL).toLocaleString('pt-BR')} L` : reserva.texto,
      atende: reserva.situacao === 'ATENDE',
    });
    v.push({ grupo: 'NBR5626', item: 'Velocidade da água', norma: 'NBR 5626:2020', exigido: `≤ ${nBr(VELOCIDADE_MAXIMA_DA_NORMA_MS, 1)} m/s`, obtido: `máx. ${nBr(vMax)} m/s`, atende: vMax <= VELOCIDADE_MAXIMA_DA_NORMA_MS + 1e-9 });
  }

  // ── NBR 8160 ────────────────────────────────────────────────────────────────
  if (temEsgoto) {
    const plano = planejarEsgoto(model, hip.esgoto);
    v.push({ grupo: 'NBR8160', item: 'Toda fonte de esgoto ligada à caixa de inspeção', norma: 'NBR 8160', exigido: '0 a ligar', obtido: plano.destinoId == null ? 'sem caixa de inspeção' : plano.aLigar ? `${plano.aLigar} a ligar` : 'todas', atende: plano.destinoId != null && plano.aLigar === 0 });
    const calc = esgotoTrechoATrecho(model, hip.esgoto);
    const dnMenor = calc.filter((c) => c.dnAtualMm < c.dnNecessarioMm).length;
    v.push({ grupo: 'NBR8160', item: 'DN de cada trecho pelas UHC a montante', norma: 'NBR 8160:1999', exigido: 'DN ≥ necessário', obtido: dnMenor ? `${dnMenor} trecho(s) abaixo` : `${calc.length} trecho(s) conferido(s)`, atende: dnMenor === 0 });
    const baixa = calc.filter((c) => c.declividadePct != null && c.declividadePct + 1e-9 < c.declividadeMinimaPct).length;
    v.push({
      grupo: 'NBR8160',
      item: 'Declividade mínima dos ramais e subcoletores',
      norma: 'NBR 8160:1999',
      exigido: `≥ ${nBr(hip.esgoto.caimentoPctAte75, 0)} % (DN ≤ 75) / ≥ ${nBr(hip.esgoto.caimentoPctDe100, 0)} % (DN ≥ 100)`,
      obtido: baixa ? `${baixa} trecho(s) abaixo` : 'todos',
      atende: baixa === 0,
    });
    const tqs = colunasDoModelo(model).filter((c) => c.sigla === 'TQ');
    const semVentilacao = tqs.filter((c) => !c.nomeDaVentilacao).length;
    v.push({ grupo: 'NBR8160', item: 'Tubo de queda ventilado', norma: 'NBR 8160:1999', exigido: 'todo TQ com coluna de ventilação', obtido: tqs.length ? (semVentilacao ? `${semVentilacao} sem ventilação` : `${tqs.length} TQ ventilado(s)`) : 'sem tubo de queda', atende: semVentilacao === 0 });
  }

  const pendencias = v.filter((x) => !x.atende).map((x) => `${x.item}: ${x.obtido}`);
  return { verificacoes: v, podeEmitir: pendencias.length === 0, pendencias };
}

/** O hash da BASE da emissão: desenho + premissas. Muda qualquer um, a emissão deixa de valer. */
export function hashDaBaseHidro(model: BlueprintModel, hip: HipotesesHidro): { desenho: string; base: string } {
  const desenho = snapshotHash(model);
  return { desenho, base: sha256(stableStringify({ desenho, hipoteses: hip })) };
}

const ROTULO_DO_GRUPO: Record<VerificacaoHidro['grupo'], string> = {
  RESPONSAVEL: 'Responsável técnico',
  DADOS: 'Dados do desenho',
  NBR5626: 'Água fria e quente — NBR 5626',
  NBR8160: 'Esgoto sanitário — NBR 8160',
};

/** A capa executiva + o memorial de cálculo + o descritivo, como blocos. */
export function memorialExecutivoHidro(
  model: BlueprintModel,
  hip: HipotesesHidro,
  responsavel: ResponsavelTecnico,
  r: ResultadoHidroExecutivo,
  ctx: { nomeDoEstudo: string; hashDoDesenho: string; hashDaBase: string; emitidoEm: string },
): BlocoDoMemorial[] {
  const sigla = responsavel.conselho === 'CAU' ? 'RRT' : 'ART';
  const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
  const B: BlocoDoMemorial[] = [
    { tipo: 'titulo', texto: 'Projeto executivo de instalações hidrossanitárias' },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Emitido em ${dataBr(ctx.emitidoEm)}.` },
    { tipo: 'secao', texto: 'Responsável técnico' },
    {
      tipo: 'tabela',
      cabecalho: ['Nome', 'Título', 'Registro', sigla, 'Data'],
      linhas: [[responsavel.nome, responsavel.titulo, `${responsavel.conselho} ${responsavel.registro}`, responsavel.artNumero, responsavel.artData ? dataBr(responsavel.artData) : '—']],
    },
    { tipo: 'secao', texto: 'Base do projeto' },
    {
      tipo: 'paragrafo',
      texto: `Desenho ${ctx.hashDoDesenho.slice(0, 16)} e premissas ${ctx.hashDaBase.slice(0, 16)} (${KERNEL_VERSION}). Alterada a base — o desenho ou as premissas —, esta emissão deixa de valer.`,
    },
    { tipo: 'secao', texto: 'Verificações' },
    {
      tipo: 'tabela',
      cabecalho: ['Grupo', 'Verificação', 'Norma', 'Exigido', 'Obtido', 'Resultado'],
      linhas: r.verificacoes.map((x) => [ROTULO_DO_GRUPO[x.grupo], x.item, x.norma, x.exigido, x.obtido, x.atende ? 'Atende' : 'Não atende']),
    },
    { tipo: 'secao', texto: 'Declaração' },
    {
      tipo: 'paragrafo',
      texto: `O responsável técnico acima declara ter conferido o projeto e os cálculos deste documento e responde por eles pela ${sigla} indicada. Os cálculos foram gerados pelo programa a partir do desenho; o programa não substitui o profissional habilitado.`,
    },
  ];
  const ctxMemorial = { nomeDoEstudo: ctx.nomeDoEstudo, geradoEm: ctx.emitidoEm };
  // O memorial de cálculo e o descritivo, sem os cabeçalhos próprios (a capa já diz estudo, data e base).
  const semCabecalho = (b: BlocoDoMemorial[]) => b.slice(3);
  const calculo = memorialDeCalculoHidro(model, hip, ctxMemorial);
  const descritivo = memorialDescritivoHidro(model, hip, ctxMemorial);
  B.push({ tipo: 'titulo', texto: calculo[0].tipo === 'titulo' ? calculo[0].texto : 'Memorial de cálculo' }, ...semCabecalho(calculo));
  B.push({ tipo: 'titulo', texto: descritivo[0].tipo === 'titulo' ? descritivo[0].texto : 'Memorial descritivo' }, ...semCabecalho(descritivo));
  return B;
}
