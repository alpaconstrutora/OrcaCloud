/**
 * MEMORIAIS HIDROSSANITÁRIOS (28/09/2026, Etapa 3 do roadmap hidrossanitário —
 * `docs/planos/2026-09-28-hidrossanitario-roadmap.md`).
 *
 * E3.1 — o MEMORIAL DE CÁLCULO, derivado do modelo a cada vez (nunca editado):
 * água trecho a trecho (ΣP, Q, DN, V, J, perdas, pressão a jusante) e ponto a
 * ponto (disponível × mínima), esgoto trecho a trecho (UHC, DN, declividade,
 * cotas), as caixas, as colunas e o reservatório. Cada seção só aparece se o
 * sistema EXISTE no desenho — memorial de sistema que não há é papel mentindo.
 *
 * E3.2 — o MEMORIAL DESCRITIVO: sistemas, materiais, normas, premissas e peças,
 * montado dos MESMOS dados.
 *
 * Os números são os da tela: a água vem de `pressoesDoModelo` (o mesmo cálculo
 * das marcas de pressão) e o esgoto de `esgotoTrechoATrecho` (o mesmo da
 * verificação do DN). Se o memorial divergisse da conferência, um dos dois
 * estaria errado e ninguém saberia qual.
 *
 * Saída: BLOCOS (título, seção, parágrafo, tabela). Quem desenha é o serviço
 * (PDF com tabelas, DOCX); `linhasDoMemorial` serializa em texto para guardar
 * na emissão (E3.3) e `blocosDasLinhas` volta — ida e volta sem perda.
 */
import type { BlueprintModel, DisciplinaDeRede, ObjectId, Terminal, Trecho } from './blueprintKernel';
import { KERNEL_VERSION, extensaoVerticalDaCaixa, materialDoTrecho, snapshotHash } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import { HIPOTESES_AGUA_PADRAO, origensDeAgua, type HipotesesDeAgua } from './blueprintAguaAutomatica';
import { HIPOTESES_PRESSAO_PADRAO, pressoesDoModelo, type EstadoDaPressao, type HipotesesDePressao } from './blueprintPressaoDaRede';
import { HIPOTESES_ESGOTO_PADRAO, caixasDeInspecao, esgotoTrechoATrecho, fontesDeEsgoto, type HipotesesDeEsgoto } from './blueprintEsgotoAutomatico';
import { colunasDoModelo, linhasDaLegendaDeColunas } from './blueprintEsquemaVertical';
import { ROTULO_DA_DISCIPLINA } from './blueprintRede';
import { ROTULO_DO_PAPEL } from './blueprintNbr8160';
import { planejarColetorPredial } from './blueprintColetorPredial';
import { HIPOTESES_RECALQUE_PADRAO, planejarRecalque, type HipotesesDeRecalque } from './blueprintRecalque';
import { HIPOTESES_ALIMENTACAO_PADRAO, planejarAlimentador, type HipotesesDeAlimentacao } from './blueprintAlimentador';
import { HIPOTESES_RESERVATORIO_PADRAO, dimensionarReservacao, volumeDoReservatorioL, type HipotesesDeReservatorio } from './blueprintReservacao';

// ─── Blocos ──────────────────────────────────────────────────────────────────

export type BlocoDoMemorial =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'secao'; texto: string }
  | { tipo: 'subsecao'; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] };

export interface HipotesesHidro {
  agua: HipotesesDeAgua;
  pressao: HipotesesDePressao;
  esgoto: HipotesesDeEsgoto;
  /** E4.1: população, per capita, dias de reserva, divisão inferior/superior. */
  reservatorio: HipotesesDeReservatorio;
  /** E4.3: pressão da rede pública, cota enterrada, velocidade e DN do alimentador. */
  alimentacao: HipotesesDeAlimentacao;
  /** E4.4: horas de funcionamento e rendimento da bomba de recalque. */
  recalque: HipotesesDeRecalque;
}

export const HIPOTESES_HIDRO_PADRAO: HipotesesHidro = {
  agua: HIPOTESES_AGUA_PADRAO,
  pressao: HIPOTESES_PRESSAO_PADRAO,
  esgoto: HIPOTESES_ESGOTO_PADRAO,
  reservatorio: HIPOTESES_RESERVATORIO_PADRAO,
  alimentacao: HIPOTESES_ALIMENTACAO_PADRAO,
  recalque: HIPOTESES_RECALQUE_PADRAO,
};

export interface ContextoDoMemorial {
  nomeDoEstudo: string;
  /** ISO — quando o documento foi gerado. */
  geradoEm: string;
}

/** Número em pt-BR com casas fixas. */
export const nBr = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dataBr = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};
const cota = (mm: number) => `${mm < 0 ? '−' : '+'}${nBr(Math.abs(mm) / 1000)}`;
const comprimento3dM = (t: Pick<Trecho, 'a' | 'b' | 'cotaAMm' | 'cotaBMm'>) => Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm) / 1000;

const ROTULO_DO_ESTADO: Record<EstadoDaPressao, string> = {
  OK: 'Atende',
  INSUFICIENTE: 'Insuficiente',
  EXCESSIVA: 'Excessiva',
  NAO_AVALIADO: 'Não avaliado',
};

function cabecalho(model: BlueprintModel, ctx: ContextoDoMemorial, titulo: string): BlocoDoMemorial[] {
  return [
    { tipo: 'titulo', texto: titulo },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Gerado em ${dataBr(ctx.geradoEm)}.` },
    {
      tipo: 'paragrafo',
      texto: `Documento derivado do modelo do desenho (base ${snapshotHash(model).slice(0, 16)}, ${KERNEL_VERSION}). Alterado o desenho ou as premissas, deve ser gerado de novo. Não substitui a análise e a responsabilidade do profissional habilitado.`,
    },
  ];
}

/** "a, b e c". */
const listaBr = (itens: string[]) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);

function blocoDePremissas(model: BlueprintModel, hip: HipotesesHidro, temAgua: boolean, temEsgoto: boolean): BlocoDoMemorial[] {
  const tipos = new Set((model.terminais ?? []).map((t) => t.tipoHidraulico));
  const linhas: string[][] = [];
  if (temAgua) {
    linhas.push(
      ['Água', 'Vazão de projeto', 'Q = 0,3 · √ΣP (L/s), pesos da NBR 5626'],
      ['Água', 'Velocidade máxima', `${nBr(hip.agua.velocidadeMaxMs, 1)} m/s`],
      ['Água', 'DN mínimo (fria / quente)', `${hip.agua.dnMinimoAguaFriaMm} / ${hip.agua.dnMinimoAguaQuenteMm} mm`],
      ['Água', 'Perda distribuída', 'Darcy-Weisbach, fator de atrito de Swamee-Jain'],
      ['Água', 'Perdas localizadas', 'Comprimentos equivalentes (tabela de PVC para todos os materiais)'],
      ['Água', 'Pressão dinâmica mínima', `${nBr(hip.pressao.pressaoMinimaKpa, 0)} kPa (válvula de descarga: 20 kPa)`],
      ['Água', 'Pressão estática máxima', `${nBr(hip.pressao.estaticaMaximaKpa, 0)} kPa`],
      ['Água', 'Lâmina d’água no cálculo', hip.pressao.laminaDaguaMm > 0 ? `${nBr(hip.pressao.laminaDaguaMm / 1000)} m acima do fundo` : 'nível mínimo (fundo do reservatório)'],
    );
    // Só o que existe no desenho: premissa de aquecedor sem aquecedor é ruído.
    if (tipos.has('AQUECEDOR')) linhas.push(['Água', 'Perda no aquecedor', `${nBr(hip.pressao.perdaDoAquecedorKpa, 0)} kPa`]);
    if (tipos.has('HIDROMETRO')) linhas.push(['Água', 'Hidrômetro', `Qmáx ${nBr(hip.pressao.qMaxDoHidrometroM3h, 1)} m³/h; Δh = (36·Q)²/Qmáx²`]);
  }
  if (temEsgoto) {
    linhas.push(
      ['Esgoto', 'Dimensionamento', 'Unidades Hunter de contribuição (UHC), NBR 8160'],
      ['Esgoto', 'Declividade mínima', `${nBr(hip.esgoto.caimentoPctAte75, 0)} % até DN 75; ${nBr(hip.esgoto.caimentoPctDe100, 0)} % a partir de DN 100`],
      ['Esgoto', 'DN do tubo de queda / ventilação', `${hip.esgoto.dnTuboQuedaMm} / ${hip.esgoto.dnVentilacaoMm} mm`],
    );
  }
  return linhas.length ? [{ tipo: 'secao', texto: 'Premissas de cálculo' }, { tipo: 'tabela', cabecalho: ['Sistema', 'Premissa', 'Valor'], linhas }] : [];
}

const nomeDoNivel = (model: BlueprintModel) => {
  const m = new Map(model.levels.map((l) => [l.id, l.name]));
  return (id: ObjectId) => m.get(id) ?? '—';
};

const siglaDe = (t: Terminal | undefined) => (t?.tipoHidraulico ? FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico].sigla : '—');

// ─── E3.1 — memorial de cálculo ──────────────────────────────────────────────

export function memorialDeCalculoHidro(model: BlueprintModel, hip: HipotesesHidro, ctx: ContextoDoMemorial): BlocoDoMemorial[] {
  const nivel = nomeDoNivel(model);
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const terminais = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const redesDeAgua = pressoesDoModelo(model, hip.pressao).filter((r) => r.trechos.length > 0 || r.pontos.length > 0);
  const esgoto = esgotoTrechoATrecho(model, hip.esgoto);
  const temAgua = redesDeAgua.length > 0;
  const temEsgoto = esgoto.length > 0;
  const B: BlocoDoMemorial[] = [...cabecalho(model, ctx, 'Memorial de cálculo — instalações hidrossanitárias')];

  if (!temAgua && !temEsgoto) {
    B.push({ tipo: 'paragrafo', texto: 'O desenho não tem rede de água nem de esgoto calculável: nada a memorializar.' });
    return B;
  }
  B.push(...blocoDePremissas(model, hip, temAgua, temEsgoto));

  // ── Água ──────────────────────────────────────────────────────────────────
  if (temAgua) {
    B.push({ tipo: 'secao', texto: 'Água fria e água quente' });
    let n = 0;
    for (const rede of redesDeAgua) {
      const origem = terminais.get(rede.origemId);
      B.push({ tipo: 'subsecao', texto: `${ROTULO_DA_DISCIPLINA[rede.disciplina]} — a partir de ${origem?.tipoHidraulico ? FICHA_DO_PONTO_HIDRAULICO[origem.tipoHidraulico].rotulo : 'origem'} (${origem ? nivel(origem.levelId) : '—'})` });
      if (rede.motivo) B.push({ tipo: 'paragrafo', texto: `Não calculada: ${rede.motivo}` });
      // Quem cada trecho abastece: os pontos cujo caminho passa por ele.
      const abastece = new Map<ObjectId, string[]>();
      for (const [pontoId, caminho] of Object.entries(rede.caminhos)) {
        for (const tid of caminho) abastece.set(tid, [...(abastece.get(tid) ?? []), siglaDe(terminais.get(pontoId))]);
      }
      const linhas: string[][] = [];
      for (const c of rede.trechos) {
        const t = porId.get(c.trechoId);
        if (!t) continue;
        n += 1;
        const L = comprimento3dM(t);
        const somaP = (c.vazaoLs / 0.3) ** 2;
        const material = materialDoTrecho(t);
        const siglas = [...new Set(abastece.get(t.id) ?? [])].sort();
        linhas.push([
          `T${String(n).padStart(2, '0')}`,
          nivel(t.levelId),
          siglas.length > 5 ? `${siglas.slice(0, 5).join(', ')}…` : siglas.join(', ') || '—',
          material ? FICHA_DO_MATERIAL[material].rotulo : '—',
          String(t.bitolaMm),
          nBr(L),
          nBr(somaP, 1),
          nBr(c.vazaoLs),
          nBr(c.velocidadeMs),
          L > 0 ? nBr(c.perdaDistribuidaMca / L, 3) : '—',
          nBr(c.perdaDistribuidaMca, 3),
          nBr(c.perdaLocalizadaMca, 3),
          nBr(c.pressaoJusanteKpa, 1),
          // Só a VELOCIDADE: a pressão se julga no ponto (tabela abaixo) — "Atende" aqui com
          // pressão negativa a jusante leria como se o trecho estivesse bom.
          c.velocidadeMs <= hip.agua.velocidadeMaxMs + 1e-9 ? 'Atende' : 'Acima do limite',
        ]);
      }
      if (linhas.length) {
        B.push({
          tipo: 'tabela',
          cabecalho: ['Trecho', 'Pav.', 'Abastece', 'Material', 'DN', 'L (m)', 'ΣP', 'Q (L/s)', 'V (m/s)', 'J (m/m)', 'hf dist. (mca)', 'hf loc. (mca)', 'P jus. (kPa)', 'Velocidade'],
          linhas,
        });
      }
      const pontos = rede.pontos.map((p) => [
        siglaDe(terminais.get(p.terminalId)),
        p.nome,
        nivel(p.levelId),
        p.disponivelKpa == null ? '—' : nBr(p.disponivelKpa, 1),
        nBr(p.minimaKpa, 0),
        p.estaticaKpa == null ? '—' : nBr(p.estaticaKpa, 1),
        p.motivo ? `${ROTULO_DO_ESTADO[p.estado]} — ${p.motivo}` : ROTULO_DO_ESTADO[p.estado],
      ]);
      if (pontos.length) {
        B.push({ tipo: 'paragrafo', texto: 'Pressão em cada ponto de utilização:' });
        B.push({ tipo: 'tabela', cabecalho: ['Ponto', 'Peça', 'Pav.', 'Dinâmica disponível (kPa)', 'Mínima (kPa)', 'Estática (kPa)', 'Situação'], linhas: pontos });
      }
      const critico = rede.pontos.find((p) => p.terminalId === rede.criticoId);
      if (critico) B.push({ tipo: 'paragrafo', texto: `Ponto crítico da rede: ${critico.nome} (${nivel(critico.levelId)}), com ${critico.disponivelKpa == null ? '—' : nBr(critico.disponivelKpa, 1)} kPa disponíveis para ${nBr(critico.minimaKpa, 0)} kPa exigidos.` });
      for (const a of rede.avisos) B.push({ tipo: 'paragrafo', texto: `Aviso: ${a}` });
    }
  }

  // ── Reservação (E4.1): população → consumo → volume, contra o declarado ─────
  if (temAgua) {
    const r = dimensionarReservacao(model, hip.reservatorio);
    B.push({ tipo: 'secao', texto: 'Reservação' });
    if (r.populacao.ambientes.length) {
      B.push({
        tipo: 'tabela',
        cabecalho: ['Ambiente', 'Tipo', 'Pessoas'],
        linhas: [
          ...r.populacao.ambientes.map((a) => [a.nome, a.tipo === 'SUITE' ? 'Suíte' : a.tipo === 'DORMITORIO' ? 'Dormitório' : 'Dependência', String(a.pessoas)]),
          ['Total contado', '', String(r.populacao.contada)],
        ],
      });
    }
    const linhas: string[][] = [
      ['População de projeto', `${r.populacao.pessoas} pessoa(s)${r.populacao.declarada ? ' (declarada)' : ''}`],
      ['Consumo per capita', `${nBr(hip.reservatorio.perCapitaLDia, 0)} L/hab·dia`],
      ['Consumo diário', `${nBr(r.consumoDiarioL, 0)} L`],
      ['Dias de reserva', nBr(hip.reservatorio.diasDeReserva, hip.reservatorio.diasDeReserva % 1 ? 1 : 0)],
      ['Volume a reservar', `${nBr(r.volumeNecessarioL, 0)} L`],
    ];
    if (r.inferiorNecessarioL > 0) {
      linhas.push(['Inferior / superior', `${nBr(r.inferiorNecessarioL, 0)} L / ${nBr(r.superiorNecessarioL, 0)} L (${nBr(hip.reservatorio.fracaoInferior * 100, 0)} % / ${nBr((1 - hip.reservatorio.fracaoInferior) * 100, 0)} %)`]);
    }
    linhas.push(['Caixa comercial sugerida', r.volumeSugeridoL ? `${nBr(r.volumeSugeridoL, 0)} L` : '—'], ['Volume no desenho', `${nBr(r.declaradoL, 0)} L`]);
    B.push({ tipo: 'tabela', cabecalho: ['Grandeza', 'Valor'], linhas });
    const caixas = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO');
    if (caixas.length) {
      B.push({
        tipo: 'tabela',
        cabecalho: ['Reservatório', 'Papel', 'Pav.', 'Dimensões (m)', 'Volume (L)', 'Cota do fundo'],
        linhas: caixas.map((t, i) => [
          `R${i + 1}`,
          t.papelReservatorio === 'INFERIOR' ? 'Inferior' : 'Superior',
          nivel(t.levelId),
          t.formaReservatorio === 'CILINDRO' && t.larguraMm && t.alturaMm
            ? `ø ${nBr(t.larguraMm / 1000)} × ${nBr(t.alturaMm / 1000)}`
            : t.larguraMm && t.profundidadeMm && t.alturaMm
              ? `${nBr(t.larguraMm / 1000)} × ${nBr(t.profundidadeMm / 1000)} × ${nBr(t.alturaMm / 1000)}`
              : '—',
          (() => {
            const v = volumeDoReservatorioL(t);
            return v == null ? '—' : `${nBr(v, 0)}${t.volumeL ? '' : ' (bruto)'}`;
          })(),
          cota(t.cotaMm),
        ]),
      });
    }
    B.push({ tipo: 'paragrafo', texto: `${r.situacao === 'ATENDE' ? 'Atende' : 'Não atende'}: ${r.texto}` });
  }

  // ── Alimentação predial (E4.3) ────────────────────────────────────────────
  if (temAgua) {
    const a = planejarAlimentador(model, hip.alimentacao, hip.reservatorio, hip.pressao.qMaxDoHidrometroM3h);
    B.push({ tipo: 'secao', texto: 'Alimentação predial' });
    if (a.motivo) {
      B.push({ tipo: 'paragrafo', texto: a.motivo });
    } else {
      B.push({
        tipo: 'tabela',
        cabecalho: ['Grandeza', 'Valor'],
        linhas: [
          ['Destino', `Reservatório ${a.destinoInferior ? 'inferior' : 'superior'} (torneira de boia)`],
          ['Vazão (consumo diário em 24 h)', `${nBr(a.vazaoLs, 3)} L/s`],
          ['DN · comprimento', `${a.dnMm} mm · ${nBr(a.comprimentoM)} m`],
          ['Velocidade', `${nBr(a.velocidadeMs)} m/s (máx. ${nBr(hip.alimentacao.velocidadeMaxMs, 1)})`],
          ['Pressão da rede pública', `${nBr(hip.alimentacao.pressaoDaRedePublicaKpa, 0)} kPa`],
          ['Desnível até a boia', `${nBr(a.desnivelM)} m`],
          ['Perda distribuída · localizada · hidrômetro', `${nBr(a.perdaDistribuidaKpa, 1)} · ${nBr(a.perdaLocalizadaKpa, 1)} · ${nBr(a.perdaNoHidrometroKpa, 1)} kPa`],
          ['Pressão na torneira de boia', `${nBr(a.pressaoNaBoiaKpa, 1)} kPa (mín. ${nBr(hip.alimentacao.pressaoMinimaNaBoiaKpa, 0)})`],
        ],
      });
      B.push({ tipo: 'paragrafo', texto: a.atende ? 'Atende: a rede pública abastece o reservatório.' : `Não atende: ${a.avisos.find((x) => /rede pública/.test(x)) ?? 'pressão insuficiente na boia.'}` });
    }
  }

  // ── Recalque (E4.4) — só com reservatório inferior ─────────────────────────
  if (temAgua) {
    const rc = planejarRecalque(model, hip.recalque, hip.reservatorio);
    if (rc.inferiorId || rc.motivo) {
      B.push({ tipo: 'secao', texto: 'Recalque' });
      if (rc.motivo) B.push({ tipo: 'paragrafo', texto: rc.motivo });
      else {
        B.push({
          tipo: 'tabela',
          cabecalho: ['Grandeza', 'Valor'],
          linhas: [
            ['Vazão de recalque', `${nBr(rc.vazaoLs, 3)} L/s (${nBr(rc.vazaoLs * 3.6, 2)} m³/h) — consumo diário em ${nBr(hip.recalque.horasDeFuncionamento, 0)} h`],
            ['Diâmetro de Forchheimer', `D = 1,3·√Q·X^¼ = ${nBr(rc.diametroForchheimerMm, 1)} mm`],
            ['Recalque', `DN ${rc.dnRecalqueMm} · ${nBr(rc.comprimentoRecalqueM)} m · V ${nBr(rc.velocidadeRecalqueMs)} m/s`],
            ['Sucção', `DN ${rc.dnSuccaoMm} · ${nBr(rc.comprimentoSuccaoM)} m`],
            ['Desnível geométrico', `${nBr(rc.desnivelGeometricoM)} m`],
            ['Perdas (sucção + recalque)', `${nBr(rc.perdasMca)} mca`],
            ['Altura manométrica', `${nBr(rc.alturaManometricaM)} mca`],
            ['Potência (η = ' + nBr(hip.recalque.rendimento, 2) + ')', `${nBr(rc.potenciaCv, 2)} cv → motor de ${nBr(rc.motorCv, rc.motorCv < 1 ? 2 : 1)} cv`],
          ],
        });
        for (const a of rc.avisos) B.push({ tipo: 'paragrafo', texto: `Aviso: ${a}` });
      }
    }
  }

  // ── Esgoto ────────────────────────────────────────────────────────────────
  if (temEsgoto) {
    B.push({ tipo: 'secao', texto: 'Esgoto sanitário' });
    // Os aparelhos e as UHC.
    const aparelhos = new Map<string, { rotulo: string; qtd: number; uhc: number; dn: number }>();
    for (const f of fontesDeEsgoto(model)) {
      if (!f.tipoHidraulico) continue;
      const ficha = FICHA_DO_PONTO_HIDRAULICO[f.tipoHidraulico];
      const a = aparelhos.get(f.tipoHidraulico) ?? { rotulo: ficha.rotulo, qtd: 0, uhc: ficha.uhcNbr8160 ?? 0, dn: ficha.dnMinimoMm.ESGOTO ?? 40 };
      a.qtd += 1;
      aparelhos.set(f.tipoHidraulico, a);
    }
    if (aparelhos.size) {
      const lista = [...aparelhos.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo));
      B.push({ tipo: 'subsecao', texto: 'Aparelhos e contribuições' });
      B.push({
        tipo: 'tabela',
        cabecalho: ['Aparelho', 'Quantidade', 'UHC unitária', 'UHC total', 'DN mínimo do ramal de descarga'],
        linhas: [
          ...lista.map((a) => [a.rotulo, String(a.qtd), String(a.uhc), String(a.uhc * a.qtd), String(a.dn)]),
          ['Total', String(lista.reduce((s, a) => s + a.qtd, 0)), '', String(lista.reduce((s, a) => s + a.uhc * a.qtd, 0)), ''],
        ],
      });
    }
    const caixas = new Map(caixasDeInspecao(model).map((c) => [c.id, c]));
    const ordemDoNivel = new Map([...model.levels].sort((a, b) => b.elevationMm - a.elevationMm).map((l, i) => [l.id, i]));
    const ordenados = [...esgoto].sort(
      (a, b) => a.caixaId.localeCompare(b.caixaId) || (ordemDoNivel.get(a.levelId) ?? 0) - (ordemDoNivel.get(b.levelId) ?? 0) || a.uhc - b.uhc || a.trechoId.localeCompare(b.trechoId),
    );
    B.push({ tipo: 'subsecao', texto: 'Trechos' });
    B.push({
      tipo: 'tabela',
      cabecalho: ['Trecho', 'Papel', 'Pav.', 'Caixa', 'UHC', 'DN', 'DN mín.', 'L (m)', 'i (%)', 'i mín. (%)', 'Cota mont.', 'Cota jus.', 'Situação'],
      linhas: ordenados.map((c, i) => {
        const situacao: string[] = [];
        if (c.contrafluxo) situacao.push('contrafluxo');
        if (c.dnAtualMm < c.dnNecessarioMm) situacao.push(`DN abaixo do exigido (${c.dnNecessarioMm})`);
        if (c.dnMontanteMaxMm != null && c.dnAtualMm < c.dnMontanteMaxMm) situacao.push(`DN diminui (${c.dnMontanteMaxMm} a montante)`);
        if (c.declividadePct != null && c.declividadePct + 1e-9 < c.declividadeMinimaPct) situacao.push('declividade abaixo da mínima');
        if (c.tipo === 'MAIOR') situacao.push('DN acima do necessário');
        return [
          `E${String(i + 1).padStart(2, '0')}${c.rotulo ? ` (${c.rotulo})` : ''}`,
          ROTULO_DO_PAPEL[c.papel],
          nivel(c.levelId),
          siglaDe(caixas.get(c.caixaId) ?? terminais.get(c.caixaId)),
          String(c.uhc),
          String(c.dnAtualMm),
          String(c.dnNecessarioMm),
          nBr(c.comprimentoM),
          c.declividadePct == null ? 'vertical' : nBr(c.declividadePct, 1),
          c.declividadePct == null ? '—' : nBr(c.declividadeMinimaPct, 0),
          cota(c.cotaMontanteMm),
          cota(c.cotaJusanteMm),
          situacao.length ? situacao.join('; ') : 'Atende',
        ];
      }),
    });
    // E5.3: o coletor predial até a rede pública.
    const col = planejarColetorPredial(model, hip.esgoto);
    B.push({ tipo: 'subsecao', texto: 'Coletor predial e ligação à rede pública' });
    if (col.motivo) B.push({ tipo: 'paragrafo', texto: col.motivo });
    else {
      B.push({
        tipo: 'tabela',
        cabecalho: ['Grandeza', 'Valor'],
        linhas: [
          ['UHC na caixa de inspeção', String(col.uhc)],
          ['Comprimento até a ligação', `${nBr(col.comprimentoM)} m`],
          ['Declividade (fundo da CI → rede)', `${nBr(col.declividadePct, 2)} % (mín. ${nBr(col.declividadeMinimaPct, 0)} %)`],
          ['DN (NBR 8160, tabela 7)', `${col.dnMm} mm`],
          ['Caixas intermediárias', col.caixasIntermediarias ? `${col.caixasIntermediarias} (última a ≤ 15 m da ligação; ≤ 25 m entre caixas)` : 'nenhuma (até 15 m)'],
        ],
      });
      B.push({ tipo: 'paragrafo', texto: col.porGravidade ? 'Atende: o esgoto chega à rede pública por gravidade.' : `Não atende: ${col.avisos[0] ?? 'sem declividade para a gravidade.'}` });
    }
    const caixasComCota = [...caixas.values()].map((c) => ({ c, ext: extensaoVerticalDaCaixa(c) })).filter((x) => x.ext);
    if (caixasComCota.length) {
      B.push({ tipo: 'subsecao', texto: 'Caixas' });
      B.push({
        tipo: 'tabela',
        cabecalho: ['Caixa', 'Pav.', 'Cota da tampa', 'Cota do fundo', 'Profundidade (m)'],
        linhas: caixasComCota.map(({ c, ext }) => [siglaDe(c), nivel(c.levelId), cota(ext!.topoMm), cota(ext!.fundoMm), nBr((ext!.topoMm - ext!.fundoMm) / 1000)]),
      });
    }
  }

  // ── Colunas (E2.3) ──────────────────────────────────────────────────────────
  const colunas = colunasDoModelo(model);
  if (colunas.length) {
    B.push({ tipo: 'secao', texto: 'Colunas, tubos de queda e ventilação' });
    for (const l of linhasDaLegendaDeColunas(model, colunas)) B.push({ tipo: 'paragrafo', texto: l });
  }
  return B;
}

// ─── E3.2 — memorial descritivo ──────────────────────────────────────────────

export function memorialDescritivoHidro(model: BlueprintModel, hip: HipotesesHidro, ctx: ContextoDoMemorial): BlocoDoMemorial[] {
  const trechos = model.trechos ?? [];
  const terminais = (model.terminais ?? []).filter((t) => t.tipoHidraulico);
  const tem = (d: DisciplinaDeRede) => trechos.some((t) => t.disciplina === d) || terminais.some((t) => t.disciplina === d);
  const temFria = tem('AGUA_FRIA');
  const temQuente = tem('AGUA_QUENTE');
  const temEsgoto = tem('ESGOTO');
  const B: BlocoDoMemorial[] = [...cabecalho(model, ctx, 'Memorial descritivo — instalações hidrossanitárias')];
  if (!temFria && !temQuente && !temEsgoto) {
    B.push({ tipo: 'paragrafo', texto: 'O desenho não tem instalação hidrossanitária.' });
    return B;
  }

  B.push({ tipo: 'secao', texto: 'Objeto' });
  const sistemas = listaBr([temFria && 'água fria', temQuente && 'água quente', temEsgoto && 'esgoto sanitário'].filter((x): x is string => !!x));
  B.push({ tipo: 'paragrafo', texto: `Este memorial descreve as instalações de ${sistemas} do estudo "${ctx.nomeDoEstudo}", em ${model.levels.length} pavimento(s): ${[...model.levels].sort((a, b) => a.elevationMm - b.elevationMm).map((l) => l.name).join(', ')}.` });

  B.push({ tipo: 'secao', texto: 'Normas' });
  const normas: string[][] = [];
  if (temFria || temQuente) normas.push(['ABNT NBR 5626:2020', 'Sistemas prediais de água fria e água quente — projeto, execução, operação e manutenção']);
  if (temEsgoto) normas.push(['ABNT NBR 8160:1999', 'Sistemas prediais de esgoto sanitário — projeto e execução']);
  B.push({ tipo: 'tabela', cabecalho: ['Norma', 'Assunto'], linhas: normas });

  B.push({ tipo: 'secao', texto: 'Sistemas' });
  const origens = origensDeAgua(model);
  if (temFria) {
    const fontes = origens.filter((o) => o.disciplina === 'AGUA_FRIA').map((o) => FICHA_DO_PONTO_HIDRAULICO[o.origem.tipoHidraulico ?? 'RESERVATORIO'].rotulo.toLowerCase());
    B.push({ tipo: 'subsecao', texto: 'Água fria' });
    B.push({
      tipo: 'paragrafo',
      texto: `${fontes.length ? `Alimentação a partir de ${[...new Set(fontes)].join(' e ')}. ` : ''}Distribuição por gravidade com barrilete, colunas e ramais${hip.agua.pelasParedes !== false ? ' embutidos nas paredes' : ''}, ramais a ${nBr(hip.agua.cotaRamalMm / 1000)} m do piso. Diâmetros pela vazão de projeto (Q = 0,3·√ΣP) com velocidade até ${nBr(hip.agua.velocidadeMaxMs, 1)} m/s e verificação da pressão dinâmica em cada ponto de utilização.`,
    });
  }
  if (temFria) {
    const r = dimensionarReservacao(model, hip.reservatorio);
    if (r.populacao.pessoas > 0) {
      B.push({ tipo: 'subsecao', texto: 'Reservação' });
      B.push({
        tipo: 'paragrafo',
        texto: `População de projeto de ${r.populacao.pessoas} pessoa(s)${r.populacao.declarada ? ' (declarada)' : ' (2 por dormitório)'}, consumo de ${nBr(hip.reservatorio.perCapitaLDia, 0)} L/hab·dia e reserva de ${nBr(hip.reservatorio.diasDeReserva, 0)} dia(s): ${nBr(r.volumeNecessarioL, 0)} L a reservar; o desenho prevê ${nBr(r.declaradoL, 0)} L.`,
      });
    }
  }
  if (temQuente) {
    B.push({ tipo: 'subsecao', texto: 'Água quente' });
    B.push({ tipo: 'paragrafo', texto: 'Produção no aquecedor indicado no desenho, alimentado pela rede de água fria; distribuição em tubulação própria para água quente até os pontos de utilização.' });
  }
  if (temEsgoto) {
    const cis = caixasDeInspecao(model).length;
    const colunas = colunasDoModelo(model).filter((c) => c.disciplina === 'ESGOTO');
    B.push({ tipo: 'subsecao', texto: 'Esgoto sanitário' });
    B.push({
      tipo: 'paragrafo',
      texto: `Diâmetros pelas tabelas da NBR 8160 conforme o papel do trecho (ramal de descarga, ramal de esgoto, tubo de queda, subcoletor — este com DN mínimo 100). Coleta por ramais de descarga e de esgoto com declividade mínima de ${nBr(hip.esgoto.caimentoPctAte75, 0)} % (DN até 75) e ${nBr(hip.esgoto.caimentoPctDe100, 0)} % (DN 100 ou mais), com junções a 45°${colunas.length ? `, ${colunas.length} tubo(s) de queda com ventilação` : ''}, até ${cis} caixa(s) de inspeção. Diâmetros pelas unidades Hunter de contribuição (UHC) acumuladas.`,
    });
  }

  B.push({ tipo: 'secao', texto: 'Materiais' });
  const materiais = new Map<string, Set<number>>();
  for (const t of trechos) {
    if (!['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'].includes(t.disciplina)) continue;
    const m = materialDoTrecho(t);
    const nome = `${ROTULO_DA_DISCIPLINA[t.disciplina]} — ${m ? FICHA_DO_MATERIAL[m].rotulo : 'PVC esgoto série normal (NBR 5688)'}`;
    materiais.set(nome, (materiais.get(nome) ?? new Set()).add(t.bitolaMm));
  }
  B.push({
    tipo: 'tabela',
    cabecalho: ['Rede — material', 'Diâmetros (mm)'],
    linhas: [...materiais.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, dns]) => [k, [...dns].sort((a, b) => a - b).join(', ')]),
  });

  B.push({ tipo: 'secao', texto: 'Peças e pontos de utilização' });
  const nivel = nomeDoNivel(model);
  const pecas = new Map<string, number>();
  for (const t of terminais) {
    const k = `${FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].rotulo}|${ROTULO_DA_DISCIPLINA[t.disciplina]}|${nivel(t.levelId)}`;
    pecas.set(k, (pecas.get(k) ?? 0) + 1);
  }
  B.push({
    tipo: 'tabela',
    cabecalho: ['Peça', 'Rede', 'Pavimento', 'Quantidade'],
    linhas: [...pecas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, q]) => [...k.split('|'), String(q)]),
  });

  B.push({ tipo: 'secao', texto: 'Premissas' });
  B.push(...blocoDePremissas(model, hip, temFria || temQuente, temEsgoto).filter((b) => b.tipo === 'tabela'));

  B.push({ tipo: 'secao', texto: 'Execução e ensaios' });
  if (temFria || temQuente) B.push({ tipo: 'paragrafo', texto: 'As tubulações de água devem ser ensaiadas quanto à estanqueidade antes do fechamento das paredes e forros, conforme a NBR 5626.' });
  if (temEsgoto) B.push({ tipo: 'paragrafo', texto: 'A rede de esgoto deve ser ensaiada quanto à estanqueidade (ensaio com água ou ar) antes do reaterro e do fechamento, conforme a NBR 8160; as caixas devem permitir inspeção e limpeza.' });
  B.push({ tipo: 'paragrafo', texto: 'Diâmetros, cotas e declividades são os do memorial de cálculo e das pranchas deste mesmo desenho.' });
  return B;
}

// ─── Serialização (a emissão guarda texto) ───────────────────────────────────

const escapar = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function dividirCelulas(linha: string): string[] {
  const miolo = linha.slice(2, -2);
  const celulas: string[] = [];
  let atual = '';
  for (let i = 0; i < miolo.length; i++) {
    const c = miolo[i];
    if (c === '\\' && i + 1 < miolo.length) {
      atual += miolo[++i];
      continue;
    }
    if (c === '|' && miolo[i - 1] === ' ' && miolo[i + 1] === ' ') {
      celulas.push(atual.slice(0, -1));
      atual = '';
      i++;
      continue;
    }
    atual += c;
  }
  celulas.push(atual);
  return celulas;
}

/**
 * Os blocos em texto (mini-markdown: `# `, `## `, `### `, tabela em `| a | b |`
 * com o cabeçalho seguido de `|---|`). É o que a emissão guarda.
 */
export function linhasDoMemorial(blocos: BlocoDoMemorial[]): string[] {
  const L: string[] = [];
  for (const b of blocos) {
    if (b.tipo === 'titulo') L.push(`# ${b.texto}`, '');
    else if (b.tipo === 'secao') L.push(`## ${b.texto}`, '');
    else if (b.tipo === 'subsecao') L.push(`### ${b.texto}`, '');
    else if (b.tipo === 'paragrafo') L.push(b.texto.replace(/\n/g, ' '), '');
    else {
      L.push(`| ${b.cabecalho.map(escapar).join(' | ')} |`, `|${b.cabecalho.map(() => '---').join('|')}|`);
      for (const l of b.linhas) L.push(`| ${l.map(escapar).join(' | ')} |`);
      L.push('');
    }
  }
  return L;
}

/** A volta de `linhasDoMemorial`. */
export function blocosDasLinhas(linhas: string[]): BlocoDoMemorial[] {
  const B: BlocoDoMemorial[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (l === '') continue;
    if (l.startsWith('### ')) B.push({ tipo: 'subsecao', texto: l.slice(4) });
    else if (l.startsWith('## ')) B.push({ tipo: 'secao', texto: l.slice(3) });
    else if (l.startsWith('# ')) B.push({ tipo: 'titulo', texto: l.slice(2) });
    else if (l.startsWith('| ') && l.endsWith(' |') && /^\|(---\|)+$/.test(linhas[i + 1] ?? '')) {
      const cabecalho = dividirCelulas(l);
      const corpo: string[][] = [];
      i += 2;
      while (i < linhas.length && linhas[i].startsWith('| ') && linhas[i].endsWith(' |')) corpo.push(dividirCelulas(linhas[i++]));
      i -= 1;
      B.push({ tipo: 'tabela', cabecalho, linhas: corpo });
    } else B.push({ tipo: 'paragrafo', texto: l });
  }
  return B;
}
