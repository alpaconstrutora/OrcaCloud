/**
 * DIAGRAMA UNIFILAR (15/09/2026).
 *
 * Pedido: *"implementar diagrama unifilar"*. É a leitura do quadro em UMA
 * linha: a alimentação entra, passa pelo disjuntor geral, chega ao barramento,
 * e de lá sai um ramal por circuito — cada um com o seu disjuntor, o DR quando
 * declarado, os condutores (quantos, de que seção) e, embaixo, o número, o
 * nome e a carga do circuito. É o desenho que o eletricista lê para montar o
 * quadro e que a concessionária pede junto do projeto.
 *
 * ─── DE ONDE VEM CADA NÚMERO ─────────────────────────────────────────────────
 *
 * Tudo sai do que o Quadro de cargas já tem — este módulo não calcula nada
 * novo, só ARRUMA:
 *   - disjuntor e seção do ramal: o DECLARADO no circuito; sem declaração, o
 *     SUGERIDO/CALCULADO do pré-dimensionamento, marcado como tal (o desenho
 *     diz "sug." — sugerido não é decisão);
 *   - condutores: pela ligação (FN = 2 carregados, FF = 2, FFF = 3) + terra na
 *     mesma seção, na notação corrente "2#2,5 + T2,5";
 *   - carga: a soma dos VA dos pontos do circuito; a entrada, a demandada;
 *   - geral e alimentador: `preDimensionarQuadroCompleto`.
 *
 * ─── DESENHO PURO, DOIS DESTINOS ─────────────────────────────────────────────
 *
 * `desenharUnifilar` fala com o `Desenhista` (linha, retângulo, polígono,
 * texto), em mm de papel — o mesmo contrato da prancha. O drawer do editor
 * renderiza por SVG e a prancha PDF por jsPDF, e os dois saem do MESMO
 * traçado: o que se vê na tela é o que sai no papel. `k` escala tudo (a folha
 * encolhe um quadro largo para caber).
 */
import type { Desenhista } from './blueprintExport';
import type { BlueprintModel, LigacaoDoCircuito } from './blueprintKernel';
import {
  HIPOTESES_PADRAO,
  preDimensionarQuadroCompleto,
  type HipotesesEletricas,
  type PreDimensionamentoDoQuadro,
} from './blueprintEletricaDimensionamento';
import { numeroDoCircuito } from './blueprintCondutores';

export interface RamalUnifilar {
  circuitoId: string;
  /** "1", "12" — o que vem depois do "C". */
  numero: string;
  nome: string;
  ligacao: LigacaoDoCircuito;
  tensaoV: number | null;
  disjuntorA: number | null;
  disjuntorOrigem: 'DECLARADO' | 'SUGERIDO' | null;
  secaoMm2: number | null;
  secaoOrigem: 'DECLARADA' | 'CALCULADA' | null;
  /** "2#2,5 + T2,5" — carregados pela ligação, terra na mesma seção. */
  condutores: string | null;
  cargaVA: number;
  pontos: number;
  dr: boolean;
  /** Quantas FALTAS o pré-dimensionamento acusa neste circuito. */
  faltas: number;
}

export interface DiagramaUnifilar {
  quadroId: string;
  nome: string;
  ligacao: LigacaoDoCircuito;
  tensaoV: number | null;
  entrada: {
    disjuntorGeralA: number | null;
    secaoMm2: number | null;
    condutores: string | null;
    ibA: number | null;
    demandadaVA: number;
    instaladaVA: number;
    alimentadorM: number | null;
  };
  ramais: RamalUnifilar[];
  /** Algum ramal tem DR declarado — a legenda do símbolo só entra se ele aparece. */
  comDR: boolean;
  /** Ramal com valor SUGERIDO em vez de declarado — o aviso do rodapé. */
  comSugerido: boolean;
}

const fmt = (v: number | null | undefined) => (v == null ? '—' : String(v).replace('.', ','));

/** Carregados por ligação: FN = fase + neutro; FF = duas fases; FFF = três. */
export function condutoresDoRamal(ligacao: LigacaoDoCircuito, secaoMm2: number | null): string | null {
  if (secaoMm2 == null) return null;
  const carregados = ligacao === 'FFF' ? 3 : 2;
  const s = fmt(secaoMm2);
  return `${carregados}#${s} + T${s}`;
}

function ramaisDe(model: BlueprintModel, q: PreDimensionamentoDoQuadro): RamalUnifilar[] {
  const porId = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
  return q.circuitos.map((c) => {
    const circuito = porId.get(c.circuitoId);
    const disjuntorA = c.disjuntorDeclaradoA ?? c.disjuntorSugeridoA ?? null;
    const secaoMm2 = c.secaoDeclaradaMm2 ?? c.secaoCalculada?.secaoMm2 ?? null;
    return {
      circuitoId: c.circuitoId,
      numero: numeroDoCircuito(c.nome),
      nome: c.nome,
      ligacao: c.ligacao,
      tensaoV: c.tensaoV,
      disjuntorA,
      disjuntorOrigem: c.disjuntorDeclaradoA != null ? 'DECLARADO' : disjuntorA != null ? 'SUGERIDO' : null,
      secaoMm2,
      secaoOrigem: c.secaoDeclaradaMm2 != null ? 'DECLARADA' : secaoMm2 != null ? 'CALCULADA' : null,
      condutores: condutoresDoRamal(c.ligacao, secaoMm2),
      cargaVA: Math.round(c.sVA),
      pontos: c.pontos,
      dr: circuito?.protecaoDR === true,
      faltas: c.achados.filter((a) => a.nivel === 'FALTA').length,
    };
  });
}

/** Um diagrama por quadro, na ordem do modelo. Sem quadro, lista vazia. */
export function montarUnifilar(model: BlueprintModel, hip: HipotesesEletricas = HIPOTESES_PADRAO): DiagramaUnifilar[] {
  return (model.quadros ?? [])
    .map((quadro) => {
      const q = preDimensionarQuadroCompleto(model, quadro.id, hip);
      if (!q) return null;
      const ramais = ramaisDe(model, q);
      const secaoEntrada = q.secaoCalculada?.secaoMm2 ?? null;
      return {
        quadroId: quadro.id,
        nome: quadro.nome,
        ligacao: q.ligacao,
        tensaoV: q.tensaoV,
        entrada: {
          disjuntorGeralA: q.disjuntorGeralA,
          secaoMm2: secaoEntrada,
          condutores: condutoresDoRamal(q.ligacao, secaoEntrada),
          ibA: q.ibA,
          demandadaVA: Math.round(q.sDemandadaVA),
          instaladaVA: Math.round(q.sInstaladaVA),
          alimentadorM: quadro.alimentadorM ?? null,
        },
        ramais,
        comDR: ramais.some((r) => r.dr),
        comSugerido: ramais.some((r) => r.disjuntorOrigem === 'SUGERIDO' || r.secaoOrigem === 'CALCULADA'),
      } satisfies DiagramaUnifilar;
    })
    .filter((d): d is DiagramaUnifilar => d != null);
}

// ─── O TRAÇADO ──────────────────────────────────────────────────────────────

/** Medidas do desenho, em mm de papel (k = 1). */
export const UNIFILAR = {
  /** Largura reservada à entrada (alimentação + geral) antes do barramento. */
  entradaMm: 58,
  /** Passo entre ramais. */
  ramalMm: 26,
  /** Folga depois do último ramal. */
  fimMm: 8,
  /** Do topo (título) ao barramento. */
  topoMm: 14,
  /** Do barramento ao pé do desenho (ramal + rótulos). */
  baixoMm: 52,
};

export function medidasDoUnifilar(diagrama: DiagramaUnifilar, k = 1): { larguraMm: number; alturaMm: number } {
  const n = Math.max(1, diagrama.ramais.length);
  return {
    larguraMm: (UNIFILAR.entradaMm + n * UNIFILAR.ramalMm + UNIFILAR.fimMm) * k,
    alturaMm: (UNIFILAR.topoMm + UNIFILAR.baixoMm) * k,
  };
}

const COR = '#000000';
const COR_FRACA = '#555555';
const COR_FALTA = '#b91c1c';

/**
 * O símbolo de DISJUNTOR da linha única: o fio chega, a lâmina abre em ângulo
 * (o contato), o fio segue. `vertical` = ramal (de cima para baixo);
 * horizontal = o geral. Devolve onde o fio continua.
 */
function disjuntor(
  d: Desenhista,
  x: number,
  y: number,
  k: number,
  vertical: boolean,
  fina: number,
): { x: number; y: number } {
  const L = 7 * k;
  if (vertical) {
    // lâmina inclinada para a direita, do ponto de chegada
    d.linha(x, y, x + 2.6 * k, y + L * 0.75, { espessuraMm: fina * 1.6, cor: COR });
    // um tracinho do contato de saída
    d.linha(x - 1.2 * k, y + L, x + 1.2 * k, y + L, { espessuraMm: fina, cor: COR });
    return { x, y: y + L };
  }
  d.linha(x, y, x + L * 0.75, y - 2.6 * k, { espessuraMm: fina * 1.6, cor: COR });
  d.linha(x + L, y - 1.2 * k, x + L, y + 1.2 * k, { espessuraMm: fina, cor: COR });
  return { x: x + L, y };
}

/**
 * Desenha UM quadro a partir de `(x0, y0)` (canto superior esquerdo), em mm
 * × `k`. Quem chama posiciona e, se precisar, encolhe.
 */
export function desenharUnifilar(d: Desenhista, diagrama: DiagramaUnifilar, x0: number, y0: number, k = 1): void {
  const fina = 0.25 * k;
  const media = 0.45 * k;
  const grossa = 1.1 * k;
  const T = 2.4 * k; // altura de texto padrão
  const t = (x: number, y: number, s: string, h = T, cor?: string) => d.texto(x, y, s, h, cor);

  // Título
  t(x0, y0 + 3.2 * k, `${diagrama.nome} — ${diagrama.ligacao}${diagrama.tensaoV ? ` ${diagrama.tensaoV} V` : ''}`, 3 * k);

  const yBus = y0 + UNIFILAR.topoMm * k;
  const xIni = x0 + 2 * k;
  const e = diagrama.entrada;

  // ── Entrada: alimentação → geral → barramento ─────────────────────────
  // seta de chegada
  d.poligono(
    [
      { x: xIni, y: yBus },
      { x: xIni + 3 * k, y: yBus - 1.6 * k },
      { x: xIni + 3 * k, y: yBus + 1.6 * k },
    ],
    COR,
  );
  t(xIni, yBus - 3.2 * k, 'ALIMENTAÇÃO', 1.9 * k, COR_FRACA);
  const xGeral = xIni + 14 * k;
  d.linha(xIni + 3 * k, yBus, xGeral, yBus, { espessuraMm: media, cor: COR });
  const fimGeral = disjuntor(d, xGeral, yBus, k, false, fina);
  // À DIREITA da lâmina, não em cima dela: em cima brigava com "ALIMENTAÇÃO" (captura de 15/09).
  t(fimGeral.x + 1.5 * k, yBus - 2.2 * k, `GERAL ${e.disjuntorGeralA != null ? `${e.disjuntorGeralA} A` : '— A'}`, 2.1 * k);
  if (e.condutores) t(xGeral - 1 * k, yBus + 5.2 * k, e.condutores, 2 * k, COR_FRACA);
  else t(xGeral - 1 * k, yBus + 5.2 * k, 'seção —', 2 * k, COR_FRACA);
  t(
    xGeral - 1 * k,
    yBus + 8.6 * k,
    `${e.demandadaVA} VA dem.${e.ibA != null ? ` · IB ${String(Math.round(e.ibA * 10) / 10).replace('.', ',')} A` : ''}${e.alimentadorM != null ? ` · ${fmt(e.alimentadorM)} m` : ''}`,
    1.8 * k,
    COR_FRACA,
  );
  const xBus0 = x0 + UNIFILAR.entradaMm * k;
  d.linha(fimGeral.x, yBus, xBus0, yBus, { espessuraMm: media, cor: COR });

  // ── Barramento ────────────────────────────────────────────────────────
  const n = diagrama.ramais.length;
  const xBus1 = xBus0 + Math.max(1, n) * UNIFILAR.ramalMm * k;
  d.linha(xBus0, yBus, xBus1, yBus, { espessuraMm: grossa, cor: COR });
  if (n === 0) t(xBus0 + 2 * k, yBus + 6 * k, 'sem circuitos', 2 * k, COR_FRACA);

  // ── Ramais ────────────────────────────────────────────────────────────
  diagrama.ramais.forEach((r, i) => {
    const x = xBus0 + (i + 0.5) * UNIFILAR.ramalMm * k;
    const corValor = r.faltas > 0 ? COR_FALTA : COR;
    // nó no barramento
    d.poligono(
      [
        { x: x - 0.9 * k, y: yBus - 0.9 * k },
        { x: x + 0.9 * k, y: yBus - 0.9 * k },
        { x: x + 0.9 * k, y: yBus + 0.9 * k },
        { x: x - 0.9 * k, y: yBus + 0.9 * k },
      ],
      COR,
    );
    let y = yBus;
    d.linha(x, y, x, y + 5 * k, { espessuraMm: media, cor: COR });
    y += 5 * k;
    // disjuntor do ramal
    const fim = disjuntor(d, x, y, k, true, fina);
    t(x + 3.4 * k, y + 3.4 * k, `${r.disjuntorA != null ? `${r.disjuntorA} A` : '— A'}${r.disjuntorOrigem === 'SUGERIDO' ? ' sug.' : ''}`, 2 * k, corValor);
    y = fim.y;
    d.linha(x, y, x, y + 4 * k, { espessuraMm: media, cor: COR });
    y += 4 * k;
    // DR, quando declarado
    if (r.dr) {
      d.retangulo(x - 3 * k, y, 6 * k, 4 * k, { espessuraMm: fina, cor: COR });
      t(x - 1.9 * k, y + 2.9 * k, 'DR', 1.9 * k);
      y += 4 * k;
      d.linha(x, y, x, y + 3 * k, { espessuraMm: media, cor: COR });
      y += 3 * k;
    } else {
      d.linha(x, y, x, y + 7 * k, { espessuraMm: media, cor: COR });
      y += 7 * k;
    }
    // condutores, ao lado do fio
    if (r.condutores) t(x + 1.6 * k, y - 1.2 * k, r.condutores + (r.secaoOrigem === 'CALCULADA' ? ' sug.' : ''), 1.9 * k, corValor);
    // o fio termina numa seta para baixo (segue para a carga)
    d.linha(x, y, x, y + 6 * k, { espessuraMm: media, cor: COR });
    y += 6 * k;
    d.poligono(
      [
        { x, y: y + 2.4 * k },
        { x: x - 1.4 * k, y },
        { x: x + 1.4 * k, y },
      ],
      COR,
    );
    y += 5.5 * k;
    // rótulos: número, nome, carga
    t(x - 2.2 * k, y, `C${r.numero}`, 2.6 * k);
    const nome = r.nome.replace(/^C\s*\d+\s*[—–-]\s*/i, '').trim();
    t(x - 11 * k, y + 3.4 * k, nome.length > 14 ? `${nome.slice(0, 13)}…` : nome, 1.8 * k, COR_FRACA);
    t(x - 11 * k, y + 6.4 * k, `${r.cargaVA} VA · ${r.pontos} pt${r.pontos === 1 ? '' : 's'}`, 1.8 * k, COR_FRACA);
  });
}

/** As linhas da legenda/rodapé do unifilar — só o que aparece no desenho. */
export function rodapeDoUnifilar(diagramas: readonly DiagramaUnifilar[]): string[] {
  const L: string[] = [];
  L.push('Disjuntor: lâmina aberta no ramal (In em A). Barramento: traço grosso. Seta: segue ao circuito.');
  if (diagramas.some((d) => d.comDR)) L.push('DR: dispositivo diferencial-residual declarado no circuito (30 mA para pessoas — 5.1.3.2.2).');
  L.push('Condutores: "2#2,5 + T2,5" = dois carregados de 2,5 mm² e terra de 2,5 mm² (ligação FN/FF); "3#…" em FFF.');
  if (diagramas.some((d) => d.comSugerido)) L.push('"sug." = valor do pré-dimensionamento, ainda não declarado no quadro de cargas — declare para assumir.');
  return L;
}
