/**
 * A PRANCHA ELÉTRICA no papel — F8 do pré-dimensionamento (13/09/2026).
 *
 * ─── O QUE FALTAVA ─────────────────────────────────────────────────────────
 *
 * A exportação (PDF/PNG/DXF) desenhava paredes, estrutura, ambientes e cotas.
 * Nenhum símbolo elétrico saía no papel: a prancha que o eletricista recebia
 * era a arquitetônica. Este módulo desenha, pelo MESMO `Desenhista` da
 * planta (linha, polígono, texto, retângulo — nada mais), o que a NBR 5444
 * põe numa planta elétrica:
 *
 *   · quadro (retângulo em escala, com o nome);
 *   · eletroduto (contínuo na parede/teto, TRACEJADO no piso), com Ø e a
 *     seção do circuito `#2,5`;
 *   · tomada (triângulo vazio/meio/cheio pela altura; no quadrado se no
 *     piso), luz (círculo com a potência), interruptor (círculo, com as
 *     seções), ligação direta (quadrado com diagonal), ponto de dados;
 *   · o rótulo `SIGLA · circuito` e a letra do comando.
 *
 * E duas coisas que só existem na folha: a LEGENDA dos símbolos usados e o
 * QUADRO DE CARGAS com o pré-dimensionamento e as hipóteses — numa página
 * própria, porque legenda por cima do desenho é o que some primeiro quando a
 * planta enche a folha.
 *
 * Tudo em MILÍMETROS DE PAPEL. Os tamanhos de símbolo são fixos no papel, não
 * em escala (a norma não desenha tomada em escala), e o rótulo é legível em
 * qualquer 1:N — o mesmo critério do canvas.
 */
import type { BlueprintModel, Terminal, Trecho } from './blueprintKernel';
import type { Desenhista, Enquadramento, OpcoesExportacao } from './blueprintExport';
// `OpcoesExportacao` só pela folha do quadro de cargas (carimbo por quem chama).
import {
  MEDIDAS_PADRAO_QUADRO,
  SIGLA_DO_PONTO_ELETRICO,
  ROTULO_DO_PONTO_ELETRICO,
  ROTULO_DO_INTERRUPTOR,
  alturaDaTomada,
  cantosDaPeca,
  embutidoNoPiso,
  giroDaPeca,
  medidasDaPeca,
  apoioDaTomada,
  secoesDoInterruptor,
  trianguloDaTomada,
} from './blueprintRede';
import { condutoresDoEletroduto, numeroDoCircuito, tracosDoCondutor, type TipoDeCondutor } from './blueprintCondutores';
import {
  HIPOTESES_PADRAO,
  preDimensionarQuadroCompleto,
  type HipotesesEletricas,
} from './blueprintEletricaDimensionamento';

const COR = '#000000';
const COR_FRACA = '#555555';
/** Tamanho de símbolo no papel: tomada 3 mm, luz r 1,8 mm, interruptor r 1,3 mm. */
const TOMADA_PAPEL_MM = 3;
const LUZ_R_PAPEL_MM = 1.8;
const INT_R_PAPEL_MM = 1.3;
const LD_PAPEL_MM = 2.6;
const TEXTO_PAPEL_MM = 1.8;
const FINA_PAPEL = 0.18;
const MEDIA_PAPEL = 0.35;

type P = { x: number; y: number };
type Proj = { px: (x: number) => number; py: (y: number) => number };

const n1 = (v: number) => v.toFixed(1).replace('.', ',');
const mm2 = (v: number | null | undefined) => (v == null ? '—' : String(v).replace('.', ','));

/** Círculo com 24 lados — o `Desenhista` não tem arco. */
function circulo(d: Desenhista, c: P, r: number, estilo: { cheio?: string; traco: number }): void {
  const pts: P[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  if (estilo.cheio) d.poligono(pts, estilo.cheio);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d.linha(a.x, a.y, b.x, b.y, { espessuraMm: estilo.traco, cor: COR });
  }
}

function contorno(d: Desenhista, pts: P[], espessuraMm: number): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d.linha(a.x, a.y, b.x, b.y, { espessuraMm, cor: COR });
  }
}

/** Linha tracejada por segmentos de 1,5 mm — o `Desenhista` não tem tracejado. */
function tracejada(d: Desenhista, a: P, b: P, espessuraMm: number, passo: number): void {
  const comp = Math.hypot(b.x - a.x, b.y - a.y);
  if (comp === 0) return;
  const n = Math.max(1, Math.floor(comp / passo));
  const ux = (b.x - a.x) / comp;
  const uy = (b.y - a.y) / comp;
  for (let i = 0; i < n; i += 2) {
    const de = i * passo;
    const ate = Math.min(comp, (i + 1) * passo);
    d.linha(a.x + ux * de, a.y + uy * de, a.x + ux * ate, a.y + uy * ate, { espessuraMm, cor: COR });
  }
}

/** O que a planta tem de elétrica — para a legenda listar só o que aparece. */
export function familiasPresentes(model: BlueprintModel): Set<string> {
  const f = new Set<string>();
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'ELETRICA') continue;
    f.add(t.tipoEletrico ?? 'SEM_TIPO');
  }
  if ((model.quadros ?? []).length) f.add('QUADRO');
  for (const t of model.trechos ?? []) {
    if (t.disciplina !== 'ELETRICA') continue;
    f.add(embutidoNoPiso(t) ? 'ELETRODUTO_PISO' : 'ELETRODUTO');
  }
  return f;
}

/** Desenha UM ponto elétrico no papel, no centro `c` (mm de papel). */
interface Medidas {
  TOMADA_MM: number;
  LUZ_R_MM: number;
  INT_R_MM: number;
  LD_MM: number;
  FINA: number;
  MEDIA: number;
}

function simboloDoPonto(d: Desenhista, t: Pick<Terminal, 'tipoEletrico' | 'cotaMm' | 'interruptor' | 'comando' | 'potenciaW'>, c: P, graus: number, m: Medidas): void {
  const { TOMADA_MM, LUZ_R_MM, INT_R_MM, LD_MM, FINA, MEDIA } = m;
  const tipo = t.tipoEletrico;
  if (tipo === 'TUG' || tipo === 'TUE') {
    const [b1, b2, ap] = trianguloDaTomada({ x: 0, y: 0 }, graus, TOMADA_MM);
    // O triângulo é calculado no modelo (Y para cima) e o papel tem Y para baixo: espelha.
    const tri = [b1, b2, ap].map((p) => ({ x: c.x + p.x, y: c.y - p.y }));
    const meioDaBase = { x: (tri[0].x + tri[1].x) / 2, y: (tri[0].y + tri[1].y) / 2 };
    const altura = alturaDaTomada(t.cotaMm);
    d.poligono(tri, '#ffffff');
    if (altura === 'ALTA') d.poligono(tri, COR);
    else if (altura === 'MEDIA') d.poligono([meioDaBase, tri[1], tri[2]], COR);
    contorno(d, tri, MEDIA);
    // Haste para a parede.
    d.linha(meioDaBase.x, meioDaBase.y, meioDaBase.x - (tri[2].x - meioDaBase.x) * 0.5, meioDaBase.y - (tri[2].y - meioDaBase.y) * 0.5, { espessuraMm: MEDIA, cor: COR });
    if (altura === 'PISO') {
      const l = TOMADA_MM * 1.6;
      d.retangulo(c.x - l / 2, c.y - l / 2, l, l, { espessuraMm: FINA, cor: COR });
    }
    return;
  }
  if (tipo === 'INTERRUPTOR') {
    circulo(d, c, INT_R_MM, { cheio: t.interruptor === 'PARALELO' ? '#999999' : '#ffffff', traco: MEDIA });
    const r = INT_R_MM;
    if (t.interruptor === 'DUAS_SECOES' || t.interruptor === 'INTERMEDIARIO') d.linha(c.x, c.y - r, c.x, c.y + r, { espessuraMm: FINA, cor: COR });
    if (t.interruptor === 'TRES_SECOES') {
      for (const ang of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) d.linha(c.x, c.y, c.x + r * Math.cos(ang), c.y + r * Math.sin(ang), { espessuraMm: FINA, cor: COR });
    }
    if (t.interruptor === 'INTERMEDIARIO') {
      for (let h = -r; h <= r; h += r / 2.2) d.linha(c.x - r, c.y + h, c.x - r + Math.max(0, r - Math.abs(h)), c.y + h - Math.max(0, r - Math.abs(h)), { espessuraMm: FINA, cor: COR });
    }
    return;
  }
  if (tipo === 'LIGACAO_DIRETA') {
    d.retangulo(c.x - LD_MM / 2, c.y - LD_MM / 2, LD_MM, LD_MM, { espessuraMm: MEDIA, cor: COR });
    d.linha(c.x - LD_MM / 2, c.y + LD_MM / 2, c.x + LD_MM / 2, c.y - LD_MM / 2, { espessuraMm: MEDIA, cor: COR });
    return;
  }
  if (tipo?.startsWith('ILUMINACAO')) {
    circulo(d, c, LUZ_R_MM, { cheio: '#ffffff', traco: MEDIA });
    // A cruz da luminária de teto; arandela e piso sem cruz, para distinguir.
    if (tipo === 'ILUMINACAO_TETO') {
      d.linha(c.x - LUZ_R_MM, c.y, c.x + LUZ_R_MM, c.y, { espessuraMm: FINA, cor: COR });
      d.linha(c.x, c.y - LUZ_R_MM, c.x, c.y + LUZ_R_MM, { espessuraMm: FINA, cor: COR });
    }
    return;
  }
  // Dados (telefone, TV, rede, USB) e ponto sem tipo: círculo pequeno cheio.
  circulo(d, c, 1.0, { cheio: tipo ? '#ffffff' : COR, traco: FINA });
  if (tipo) d.linha(c.x - 1.0, c.y - 1.0, c.x + 1.0, c.y + 1.0, { espessuraMm: FINA, cor: COR });
}

/**
 * A camada elétrica por cima da planta. `px`/`py` são as MESMAS funções de
 * projeção de `desenharPlanta` — um lugar só para a escala.
 */
export function desenharEletrica(d: Desenhista, model: BlueprintModel, proj: Proj, fator = 1): void {
  const { px, py } = proj;
  // Tamanhos de símbolo em unidades de SAÍDA: papel (fator 1) ou mm reais a 1:50 (DXF).
  const TOMADA_MM = TOMADA_PAPEL_MM * fator;
  const LUZ_R_MM = LUZ_R_PAPEL_MM * fator;
  const INT_R_MM = INT_R_PAPEL_MM * fator;
  const LD_MM = LD_PAPEL_MM * fator;
  const TEXTO_MM = TEXTO_PAPEL_MM * fator;
  const FINA = FINA_PAPEL * fator;
  const MEDIA = MEDIA_PAPEL * fator;
  const k = fator;
  const circuitosPorId = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
  const paredes = model.walls;

  // Eletrodutos primeiro: ficam por baixo dos símbolos.
  for (const t of model.trechos ?? []) {
    if (t.disciplina !== 'ELETRICA') continue;
    const a = { x: px(t.a.x), y: py(t.a.y) };
    const b = { x: px(t.b.x), y: py(t.b.y) };
    const prumada = Math.hypot(b.x - a.x, b.y - a.y) < 0.2 * k;
    if (prumada) {
      // Prumada: um círculo pequeno com a seta de sobe/desce como texto.
      circulo(d, a, 1.0 * k, { traco: FINA });
      d.texto(a.x + 1.4 * k, a.y + 0.7 * k, t.cotaBMm > t.cotaAMm ? '↑' : '↓', TEXTO_MM, COR_FRACA);
      continue;
    }
    if (embutidoNoPiso(t)) tracejada(d, a, b, MEDIA, 1.5 * k);
    else d.linha(a.x, a.y, b.x, b.y, { espessuraMm: MEDIA, cor: COR });
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / comp;
    const ny = (b.x - a.x) / comp;
    // Os condutores na simbologia da NBR 5444 (15/09/2026): fase reto, neutro
    // com o pé, retorno só de um lado, terra com a barra — a MESMA lista que o
    // canvas desenha (`condutoresDoEletroduto`), UM GRUPO POR CIRCUITO com um
    // vão entre grupos; número do circuito em cima do seu grupo, seção embaixo;
    // o Ø à esquerda do conjunto.
    const circuitosDoEletroduto = (t.circuitoIds ?? []).map((cid) => circuitosPorId.get(cid)).filter((c): c is NonNullable<typeof c> => !!c);
    const lista = condutoresDoEletroduto(
      t,
      circuitosDoEletroduto.map((c) => ({ id: c.id, ligacao: c.ligacao ?? null })),
    );
    const grupos: { circuitoId: string | null; tipos: TipoDeCondutor[] }[] = [];
    for (const c of lista) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.circuitoId === c.circuitoId) ultimo.tipos.push(c.tipo);
      else grupos.push({ circuitoId: c.circuitoId, tipos: [c.tipo] });
    }
    const ux = (b.x - a.x) / comp;
    const uy = (b.y - a.y) / comp;
    const MEIA = 1.2 * k;
    let passo = 1.2 * k;
    let vao = 2.6 * k;
    let total = grupos.reduce((w, g) => w + (g.tipos.length - 1) * passo, 0) + Math.max(0, grupos.length - 1) * vao;
    const util = Math.max(2 * k, comp - 4 * k);
    if (total > util) {
      const f = Math.max(0.45, util / total);
      passo *= f;
      vao *= f;
      total *= f;
    }
    const rel = (cx: number, cy: number, r: { t: number; s: number }) => ({
      x: cx + ux * r.t * MEIA + nx * r.s * MEIA,
      y: cy + uy * r.t * MEIA + ny * r.s * MEIA,
    });
    let cursor = -total / 2;
    for (const g of grupos) {
      const larg = (g.tipos.length - 1) * passo;
      g.tipos.forEach((tipo, i) => {
        const off = cursor + i * passo;
        const cx = meio.x + ux * off;
        const cy = meio.y + uy * off;
        for (const seg of tracosDoCondutor(tipo)) {
          const p1 = rel(cx, cy, seg.de);
          const p2 = rel(cx, cy, seg.ate);
          d.linha(p1.x, p1.y, p2.x, p2.y, { espessuraMm: FINA, cor: COR });
        }
      });
      const centro = cursor + larg / 2;
      const gx = meio.x + ux * centro;
      const gy = meio.y + uy * centro;
      const circuito = g.circuitoId ? circuitosPorId.get(g.circuitoId) : null;
      d.texto(gx - nx * 2.4 * k - 0.8 * k, gy - ny * 2.4 * k + 0.6 * k, circuito ? numeroDoCircuito(circuito.nome) : 'r', TEXTO_MM * 0.9);
      if (circuito?.secaoMm2 != null) d.texto(gx + nx * 2.4 * k - 0.8 * k, gy + ny * 2.4 * k + 1.4 * k, mm2(circuito.secaoMm2), TEXTO_MM * 0.9, COR_FRACA);
      cursor += larg + vao;
    }
    d.texto(meio.x - ux * (total / 2 + 1.5 * k) + nx * 2.2 * k - 3.2 * k, meio.y - uy * (total / 2 + 1.5 * k) + ny * 2.2 * k + 0.6 * k, `Ø${t.bitolaMm}`, TEXTO_MM * 0.8, COR_FRACA);
  }

  // Quadros: retângulo em escala (piso de 4 mm) com o nome.
  for (const q of model.quadros ?? []) {
    const m = medidasDaPeca(q, MEDIDAS_PADRAO_QUADRO);
    const cantos = cantosDaPeca(q.at, m, giroDaPeca(q)).map((p) => ({ x: px(p.x), y: py(p.y) }));
    const larg = Math.hypot(cantos[1].x - cantos[0].x, cantos[1].y - cantos[0].y);
    if (larg < 4 * k) {
      const c = { x: px(q.at.x), y: py(q.at.y) };
      d.retangulo(c.x - 2 * k, c.y - 1.5 * k, 4 * k, 3 * k, { espessuraMm: MEDIA, cor: COR });
      d.linha(c.x - 2 * k, c.y + 1.5 * k, c.x + 2 * k, c.y - 1.5 * k, { espessuraMm: FINA, cor: COR });
      d.texto(c.x + 3 * k, c.y + 0.7 * k, q.nome, TEXTO_MM);
    } else {
      d.poligono(cantos, '#ffffff');
      contorno(d, cantos, MEDIA);
      d.linha(cantos[0].x, cantos[0].y, cantos[2].x, cantos[2].y, { espessuraMm: FINA, cor: COR });
      d.texto(cantos[1].x + 1.5 * k, cantos[1].y + 0.7 * k, q.nome, TEXTO_MM);
    }
  }

  // Pontos.
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'ELETRICA') continue;
    // A TOMADA se apoia na FACE (15/09/2026): a base do triângulo vai do
    // ponto à face (`recuoMm`, no modelo) e o centro do símbolo fica meio
    // tamanho adiante, já no papel — a mesma regra do canvas. O papel tem Y
    // para baixo: a direção espelha em y.
    const apoio = apoioDaTomada(t, paredes);
    const graus = apoio.graus;
    const ehTomadaAqui = t.tipoEletrico === 'TUG' || t.tipoEletrico === 'TUE';
    const rad = (graus * Math.PI) / 180;
    const base = ehTomadaAqui
      ? { x: t.at.x + Math.cos(rad) * apoio.recuoMm, y: t.at.y + Math.sin(rad) * apoio.recuoMm }
      : t.at;
    const c = ehTomadaAqui
      ? { x: px(base.x) + (Math.cos(rad) * TOMADA_MM) / 2, y: py(base.y) - (Math.sin(rad) * TOMADA_MM) / 2 }
      : { x: px(t.at.x), y: py(t.at.y) };
    simboloDoPonto(d, t, c, graus, { TOMADA_MM, LUZ_R_MM, INT_R_MM, LD_MM, FINA, MEDIA });
    const circuito = t.circuitoId ? circuitosPorId.get(t.circuitoId)?.nome : null;
    const sigla = t.tipoEletrico ? SIGLA_DO_PONTO_ELETRICO[t.tipoEletrico] : '?';
    const ehInt = t.tipoEletrico === 'INTERRUPTOR';
    if (ehInt) {
      // Interruptor: as letras das seções em cima; o rótulo embaixo.
      const letras = (t.comando ?? '').split('');
      const n = secoesDoInterruptor(t);
      letras.slice(0, n).forEach((l, i) => {
        const x = n === 1 ? c.x + INT_R_MM : n === 2 ? c.x + (i === 0 ? -INT_R_MM - 1.4 * k : INT_R_MM) : i === 2 ? c.x - 0.6 * k : c.x + (i === 0 ? -INT_R_MM - 1.4 * k : INT_R_MM);
        const y = n === 3 && i === 2 ? c.y + INT_R_MM + 1.9 * k : c.y - INT_R_MM - 0.4 * k;
        d.texto(x, y, l, TEXTO_MM * 0.9);
      });
      if (circuito) d.texto(c.x + INT_R_MM + 0.6 * k, c.y + INT_R_MM + 2.2 * k, circuito, TEXTO_MM * 0.8, COR_FRACA);
      continue;
    }
    const ehTomada = t.tipoEletrico === 'TUG' || t.tipoEletrico === 'TUE';
    // Potência em cima; sigla · circuito embaixo — como na prancha.
    if (t.potenciaW != null && !t.tipoEletrico?.startsWith('ILUMINACAO')) d.texto(c.x - 2 * k, c.y - TOMADA_MM - 0.8 * k, `${t.potenciaW} VA`, TEXTO_MM * 0.8);
    if (t.potenciaW != null && t.tipoEletrico?.startsWith('ILUMINACAO')) d.texto(c.x - 1.4 * k, c.y + 0.6 * k, String(t.potenciaW), TEXTO_MM * 0.7);
    d.texto(c.x - 2 * k, c.y + (ehTomada ? TOMADA_MM : LUZ_R_MM) + 2.2 * k, `${sigla}${circuito ? ` · ${circuito}` : ' · ?'}`, TEXTO_MM * 0.8, circuito && t.tipoEletrico ? COR_FRACA : '#b45309');
    if (t.comando) d.texto(c.x + LUZ_R_MM + 0.8 * k, c.y + 0.6 * k, t.comando, TEXTO_MM * 0.9);
  }
}

/** As linhas da legenda — só as famílias PRESENTES no desenho. */
export function linhasDaLegenda(model: BlueprintModel): string[] {
  const f = familiasPresentes(model);
  const L: string[] = [];
  if (f.has('QUADRO')) L.push('QUADRO — quadro de distribuição (retângulo em escala, com a diagonal)');
  if (f.has('TUG') || f.has('TUE')) L.push('TUG / TUE — tomada: triângulo vazio = baixa (≈ 30 cm), meio cheio = média (≈ 1,30 m), cheio = alta (≈ 2,00 m); no quadrado = piso. Haste para a parede');
  if (f.has('ILUMINACAO_TETO')) L.push('LUZ TETO — círculo com cruz; a potência (VA) dentro');
  if (f.has('ILUMINACAO_PAREDE') || f.has('ILUMINACAO_PISO')) L.push('ARANDELA / LUZ PISO — círculo sem cruz');
  if (f.has('INTERRUPTOR')) L.push('INTERRUPTOR — círculo; uma seção (letra), duas (diâmetro, a|b), três (Y, a b c); paralelo = cheio; intermediário = metade hachurada');
  if (f.has('LIGACAO_DIRETA')) L.push('LIGAÇÃO DIRETA — quadrado com diagonal (chuveiro, aquecedor: sem tomada, NBR 5410 9.5.2.3)');
  if (['DADOS_TELEFONE', 'DADOS_TV', 'DADOS_REDE', 'DADOS_USB'].some((x) => f.has(x))) L.push('DADOS — círculo pequeno com traço (telefone, TV, rede, USB)');
  if (f.has('ELETRODUTO')) L.push('ELETRODUTO — linha contínua = embutido na parede ou teto; Ø nominal ao lado; condutores (NBR 5444): traço reto = fase, com pé = neutro, só de um lado = retorno, com barra = terra; número do circuito em cima, seção (mm²) embaixo');
  if (f.has('ELETRODUTO_PISO')) L.push('ELETRODUTO NO PISO — linha tracejada');
  if (f.has('SEM_TIPO')) L.push('● — ponto elétrico sem tipo (a classificar)');
  L.push('Ao lado de cada ponto: SIGLA · circuito; "?" = sem circuito ou sem tipo. Letra em itálico = comando (interruptor ↔ luz).');
  return L;
}

/** O quadro de cargas em LINHAS de texto — para o DXF, que não tem tabela. */
export function linhasDoQuadroDeCargas(model: BlueprintModel, hip: HipotesesEletricas = HIPOTESES_PADRAO): string[] {
  const L: string[] = ['QUADRO DE CARGAS E PRE-DIMENSIONAMENTO - NBR 5410:2004'];
  const quadros = (model.quadros ?? []).map((q) => preDimensionarQuadroCompleto(model, q.id, hip)).filter((q): q is NonNullable<typeof q> => !!q);
  for (const q of quadros) {
    L.push(`${q.nome} - ${q.ligacao}${q.tensaoV ? ` ${q.tensaoV} V` : ''}`);
    L.push('Circuito | Lig./V | Pts | VA | IB (A) | Secao decl./min. | Disj. decl./sug. | dV % | DR');
    for (const c of q.circuitos) {
      const circuito = (model.circuitos ?? []).find((x) => x.id === c.circuitoId);
      const dr = circuito?.protecaoDR === true ? 'DR' : circuito?.protecaoDR === false ? 'nao' : '-';
      L.push(
        `${c.nome} | ${c.ligacao}${c.tensaoV ? ` ${c.tensaoV}` : ''} | ${c.pontos}${c.pontosSemPotencia ? '*' : ''} | ${Math.round(c.sVA)} | ${c.ibA == null ? '-' : n1(c.ibA)} | ${mm2(c.secaoDeclaradaMm2)} / ${mm2(c.secaoCalculada?.secaoMm2)} | ${c.disjuntorDeclaradoA ?? '-'} / ${c.disjuntorSugeridoA ?? '-'} | ${c.quedaPct == null ? '-' : n1(c.quedaPct)} | ${dr}`,
      );
      for (const a of c.achados.filter((x) => x.nivel === 'FALTA')) L.push(`  ${a.referencia}: ${a.mensagem}`);
    }
    L.push(`Instalado ${Math.round(q.sInstaladaVA)} VA - demandado ${Math.round(q.sDemandadaVA)} VA (${q.demanda.nome})${q.ibA != null ? ` - alimentador IB ${n1(q.ibA)} A, ${mm2(q.secaoCalculada?.secaoMm2)} mm2, geral ${q.disjuntorGeralA ?? '-'} A` : ''}${q.quedaTotalMaxPct != null ? ` - dV total ${n1(q.quedaTotalMaxPct)} %` : ''}`);
    for (const a of q.achados) L.push(`  ${a.referencia}: ${a.mensagem}`);
  }
  L.push(`Hipoteses: cobre/PVC, metodo ${hip.metodoDeInstalacao}, ${hip.temperaturaAmbienteC} C, ${hip.circuitosAgrupados} circ./eletroduto, rho ${hip.rhoOhmMm2PorM}, dV <= ${hip.limiteQuedaTerminalPct} % terminal / ${hip.limiteQuedaTotalPct} % origem, demanda ${hip.demanda.nome}.`);
  L.push('LEGENDA');
  for (const l of linhasDaLegenda(model)) L.push(l);
  return L;
}

/**
 * A FOLHA do quadro de cargas: legenda, um quadro por tabela (circuitos com
 * IB, seção declarada/mínima, disjuntor declarado/sugerido, ΔV, DR), o
 * alimentador e as hipóteses. Desenhada com o mesmo carimbo da planta — quem
 * chama passa o `Enquadramento` da folha inteira e desenha o carimbo depois.
 */
export function desenharQuadroDeCargas(
  d: Desenhista,
  model: BlueprintModel,
  o: OpcoesExportacao,
  enq: Enquadramento,
  hip: HipotesesEletricas = HIPOTESES_PADRAO,
): void {
  const x0 = enq.offsetXMm - Math.max(0, (enq.utilLarguraMm - enq.desenhoLarguraMm) / 2);
  const larg = enq.utilLarguraMm;
  let y = enq.offsetYMm - Math.max(0, (enq.utilAlturaMm - enq.desenhoAlturaMm) / 2) + 6;
  const linha = (texto: string, altura = 2.2, cor?: string, dx = 0) => {
    d.texto(x0 + dx, y, texto, altura, cor);
    y += altura * 1.9;
  };

  linha('QUADRO DE CARGAS E PRÉ-DIMENSIONAMENTO — NBR 5410:2004', 3.2);
  y += 1;

  const quadros = (model.quadros ?? []).map((q) => preDimensionarQuadroCompleto(model, q.id, hip)).filter((q): q is NonNullable<typeof q> => !!q);
  if (quadros.length === 0) linha('Sem quadro de distribuição neste desenho.', 2.2, COR_FRACA);

  // Colunas da tabela, em mm a partir de x0.
  const col = [0, 46, 62, 74, 88, 104, 124, 142, 156];
  const cab = ['Circuito', 'Lig./V', 'Pts', 'VA', 'IB (A)', 'Seção decl./mín.', 'Disj. decl./sug.', 'ΔV %', 'DR'];
  for (const q of quadros) {
    linha(`${q.nome} — ${q.ligacao}${q.tensaoV ? ` ${q.tensaoV} V` : ''}${q.ligacaoDeduzida ? ' (deduzido)' : ''}`, 2.6);
    const topoTabela = y - 1.5;
    cab.forEach((c, i) => d.texto(x0 + col[i], y, c, 1.9, COR_FRACA));
    y += 3.6;
    for (const c of q.circuitos) {
      const circuito = (model.circuitos ?? []).find((x) => x.id === c.circuitoId);
      const dr = circuito?.protecaoDR === true ? 'DR' : circuito?.protecaoDR === false ? 'não' : '—';
      const falta = c.achados.some((a) => a.nivel === 'FALTA');
      const cor = falta ? '#b91c1c' : undefined;
      const cel = [
        c.nome.slice(0, 26),
        `${c.ligacao}${c.tensaoV ? ` ${c.tensaoV}` : ''}`,
        String(c.pontos) + (c.pontosSemPotencia ? '*' : ''),
        String(Math.round(c.sVA)),
        c.ibA == null ? '—' : n1(c.ibA),
        `${mm2(c.secaoDeclaradaMm2)} / ${mm2(c.secaoCalculada?.secaoMm2)}`,
        `${c.disjuntorDeclaradoA ?? '—'} / ${c.disjuntorSugeridoA ?? '—'}`,
        c.quedaPct == null ? '—' : `${n1(c.quedaPct)}${c.comprimento?.origem === 'ESTIMADO' ? '*' : ''}`,
        dr,
      ];
      cel.forEach((v, i) => d.texto(x0 + col[i], y, v, 1.9, cor));
      y += 3.4;
      for (const a of c.achados.filter((x) => x.nivel === 'FALTA')) {
        d.texto(x0 + 3, y, `${a.referencia}: ${a.mensagem}`, 1.6, '#b91c1c');
        y += 2.8;
      }
    }
    d.retangulo(x0 - 1.5, topoTabela, larg - 2, y - topoTabela + 0.5, { espessuraMm: 0.2, cor: COR });
    y += 2.5;
    linha(
      `Instalado ${Math.round(q.sInstaladaVA)} VA (luz ${Math.round(q.porGrupoVA.ILUMINACAO)} · TUG ${Math.round(q.porGrupoVA.TUG)} · força ${Math.round(q.porGrupoVA.FORCA)}) · demandado ${Math.round(q.sDemandadaVA)} VA (${q.demanda.nome})` +
        (q.ibA != null ? ` · alimentador IB ${n1(q.ibA)} A, ${mm2(q.secaoCalculada?.secaoMm2)} mm², geral ${q.disjuntorGeralA ?? '—'} A` : '') +
        (q.quedaTotalMaxPct != null ? ` · ΔV total ${n1(q.quedaTotalMaxPct)} %` : ''),
      2.0,
    );
    if (q.fases) linha(`Fases: R ${Math.round(q.fases.R)} · S ${Math.round(q.fases.S)} · T ${Math.round(q.fases.T)} VA${q.desequilibrioPct != null ? ` (desequilíbrio ${n1(q.desequilibrioPct)} %)` : ''}`, 2.0);
    for (const a of q.achados) linha(`${a.referencia}: ${a.mensagem}`, 1.8, a.nivel === 'FALTA' ? '#b91c1c' : '#b45309', 3);
    y += 2;
  }

  linha('* pontos sem potência (VA é piso) / comprimento estimado em planta (sem eletroduto até o quadro)', 1.7, COR_FRACA);
  y += 1;
  linha('HIPÓTESES', 2.6);
  linha(`Cobre / PVC 70 °C, método ${hip.metodoDeInstalacao} (Tab. 36) · ${hip.temperaturaAmbienteC} °C (Tab. 40) · ${hip.circuitosAgrupados} circ./eletroduto (Tab. 42) · mínimo por uso Tab. 47 · TUE ≥ ${String(hip.secaoMinimaTueMm2).replace('.', ',')} mm² (hipótese) · ρ ${String(hip.rhoOhmMm2PorM).replace('.', ',')} Ω·mm²/m · ΔV ≤ ${hip.limiteQuedaTerminalPct} % terminal, ≤ ${hip.limiteQuedaTotalPct} % da origem · IB ≤ In ≤ Iz (5.3.4.1)`, 1.8);
  linha(`Demanda: ${hip.demanda.nome} (luz ${hip.demanda.ILUMINACAO} · TUG ${hip.demanda.TUG} · força ${hip.demanda.FORCA}). Pré-dimensionamento: sugere; o dimensionamento é do responsável técnico.`, 1.8);
  y += 1;
  linha('LEGENDA', 2.6);
  for (const l of linhasDaLegenda(model)) linha(l, 1.8);
}
