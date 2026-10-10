/**
 * E2.2 — O ISOMÉTRICO DE PRANCHA (28/09/2026, roadmap hidrossanitário).
 *
 * O "detalhe" hidráulico e sanitário de cada ambiente molhado: a rede do
 * cômodo projetada em isométrico a 30° — x e y da planta giram 45° e achatam,
 * a cota sobe na vertical —, com o ø de cada tubo, a sigla e a ALTURA de cada
 * ponto e o nó de cada conexão. É a mesma geometria do 3D (trecho com cota em
 * cada ponta, terminal na sua cota), projetada; nada é guardado.
 *
 * Recorte: cada ambiente que tem ponto da rede leva os trechos que passam
 * pela sua caixa envolvente (folga de 300 mm, para pegar o ponto na face da
 * parede), CORTADOS nela — o tronco que segue para a caixa de inspeção lá
 * fora não esmaga o detalhe do banheiro.
 *
 * Puro: `isometricosDoModelo` diz QUAIS existem; `desenharIsometrico` desenha
 * um numa caixa do papel (mm) com a maior escala da lista que cabe.
 */
import type { BlueprintModel, DisciplinaDeRede, ObjectId, Point, TipoDeConexao } from './blueprintKernel';
import { conexoesDerivadas, pointInPolygon } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { COR_DA_DISCIPLINA } from './blueprintRede';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { DISCIPLINAS_DA_REDE, SIGLA_DA_CONEXAO, cotaComSinal, posicaoDoRotulo, type RedeDaPrancha } from './blueprintPranchaHidro';

const FOLGA_MM = 300;
const COS30 = Math.cos(Math.PI / 6);
const SEN30 = 0.5;
/** As escalas do detalhe, da maior para a menor. */
export const ESCALAS_DO_ISOMETRICO = [10, 20, 25, 50, 75, 100, 125, 200] as const;
const TEXTO_MM = 1.8;
const COR = '#000000';
const COR_FRACA = '#555555';

type P3 = { x: number; y: number; z: number };
type Caixa = { minX: number; minY: number; maxX: number; maxY: number };

export interface IsometricoDePrancha {
  chave: string;
  titulo: string;
  rede: RedeDaPrancha;
  levelId: ObjectId;
  /** A caixa do recorte, em mm do modelo. */
  recorte: Caixa;
  /** Os segmentos recortados, em mm do modelo (z = elevação do pavimento + cota). */
  /** `rotulo` (E8.2 da climatização): o texto do segmento quando não é "øN" — L×A no duto, líquido/sucção na linha. */
  segmentos: { trechoId: ObjectId; disciplina: DisciplinaDeRede; bitolaMm: number; a: P3; b: P3; rotulo?: string }[];
  pontos: { terminalId: ObjectId; sigla: string; cotaMm: number; p: P3; disciplina: DisciplinaDeRede }[];
  nos: { p: P3; disciplina: DisciplinaDeRede; tipo: TipoDeConexao }[];
}

export const ROTULO_DA_REDE: Record<RedeDaPrancha, string> = { AGUA: 'Água', ESGOTO: 'Esgoto', INCENDIO: 'Incêndio', CLIMATIZACAO: 'Climatização' };

function caixaDoAnel(ring: Point[], folga: number): Caixa {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return { minX: Math.min(...xs) - folga, minY: Math.min(...ys) - folga, maxX: Math.max(...xs) + folga, maxY: Math.max(...ys) + folga };
}

const dentro = (c: Caixa, p: { x: number; y: number }) => p.x >= c.minX && p.x <= c.maxX && p.y >= c.minY && p.y <= c.maxY;

/** Liang–Barsky: o pedaço do segmento 3D dentro da caixa em planta (a cota interpolada). `null` se não passa por ela. */
export function recortarNaCaixa(a: P3, b: P3, c: Caixa): [P3, P3] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return dentro(c, a) ? [a, b] : null;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a.x - c.minX],
    [dx, c.maxX - a.x],
    [-dy, a.y - c.minY],
    [dy, c.maxY - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  const em = (t: number): P3 => ({ x: a.x + dx * t, y: a.y + dy * t, z: a.z + (b.z - a.z) * t });
  return [em(t0), em(t1)];
}

/** A projeção isométrica a 30°, em mm do modelo; Y do papel para baixo. */
export function projetarIsometrico(p: P3): { u: number; v: number } {
  return { u: (p.x - p.y) * COS30, v: (p.x + p.y) * SEN30 - p.z };
}

/**
 * Os isométricos do desenho: por pavimento, por rede (água, depois esgoto),
 * por ambiente que tem ponto dessa rede — na ordem dos ambientes do modelo.
 */
export function isometricosDoModelo(model: BlueprintModel): IsometricoDePrancha[] {
  const saida: IsometricoDePrancha[] = [];
  const nos = conexoesDerivadas(model).conexoes;
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  for (const nivel of model.levels) {
    const z0 = nivel.elevationMm;
    const ambientes = model.spaces.filter((s) => s.levelId === nivel.id && s.ring.length >= 3);
    for (const rede of ['AGUA', 'ESGOTO'] as const) {
      const ds = DISCIPLINAS_DA_REDE[rede];
      const terminais = (model.terminais ?? []).filter((t) => t.levelId === nivel.id && ds.includes(t.disciplina) && t.tipoHidraulico);
      const trechos = (model.trechos ?? []).filter((t) => t.levelId === nivel.id && ds.includes(t.disciplina));
      for (const s of ambientes) {
        // O ponto é do ambiente que o contém; o da face da parede cai na folga.
        const caixa = caixaDoAnel(s.ring, FOLGA_MM);
        const doAmbiente = terminais.filter((t) => pointInPolygon(s.ring, t.at) || (dentro(caixa, t.at) && !ambientes.some((o) => o !== s && pointInPolygon(o.ring, t.at))));
        if (doAmbiente.length === 0) continue;
        const segmentos: IsometricoDePrancha['segmentos'] = [];
        for (const t of trechos) {
          const r = recortarNaCaixa({ x: t.a.x, y: t.a.y, z: z0 + t.cotaAMm }, { x: t.b.x, y: t.b.y, z: z0 + t.cotaBMm }, caixa);
          if (r) segmentos.push({ trechoId: t.id, disciplina: t.disciplina, bitolaMm: t.bitolaMm, a: r[0], b: r[1] });
        }
        if (segmentos.length === 0) continue;
        const idsDosSegmentos = new Set(segmentos.map((x) => x.trechoId));
        saida.push({
          chave: `${nivel.id}|${rede}|${s.id}`,
          titulo: `${ROTULO_DA_REDE[rede]} — ${s.name ?? 'Ambiente'} (${nivel.name})`,
          rede,
          levelId: nivel.id,
          recorte: caixa,
          segmentos,
          pontos: doAmbiente.map((t) => ({
            terminalId: t.id,
            sigla: FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].sigla,
            cotaMm: t.cotaMm,
            p: { x: t.at.x, y: t.at.y, z: z0 + t.cotaMm },
            disciplina: t.disciplina,
          })),
          // O nó de um tubo DESTE isométrico — o do andar de cima, abaixo da laje dele, vem
          // com o levelId do de baixo (a laje é o encontro) e ficaria solto no ar.
          // O z vem da PONTA do tubo, não da cota do nó: o kernel encontra os andares na
          // laje (piso de cima = teto de baixo) e a elevação conta a espessura dela.
          nos: nos
            .filter((c) => dentro(caixa, c.no) && c.trechoIds.some((id) => idsDosSegmentos.has(id)))
            .flatMap((c) => {
              const estimado = (elevacao.get(c.levelId) ?? z0) + c.cotaMm;
              const pontas = segmentos
                .filter((x) => c.trechoIds.includes(x.trechoId))
                .flatMap((x) => [x.a, x.b])
                .filter((q) => Math.hypot(q.x - c.no.x, q.y - c.no.y) < 1)
                .sort((q, r) => Math.abs(q.z - estimado) - Math.abs(r.z - estimado));
              return pontas.length ? [{ p: { ...pontas[0] }, disciplina: c.disciplina, tipo: c.tipo }] : [];
            }),
        });
      }
    }
  }
  return saida;
}


/**
 * Desenha um isométrico na caixa `(x, y, w, h)` do papel: título, escala, a
 * rede e os rótulos. Devolve o denominador usado.
 */
/** A caixa (mm de papel) de um texto ancorado à esquerda na linha de base — largura estimada (0,55 × altura por letra). */
export function caixaDoTexto(x: number, y: number, texto: string, altura: number): Caixa {
  return { minX: x, minY: y - altura, maxX: x + texto.length * altura * 0.55, maxY: y + altura * 0.2 };
}
const sobrepoe = (a: Caixa, b: Caixa) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * C13 (10/10/2026): onde o rótulo cabe SEM encostar nos já escritos. Tenta a posição de sempre
 * e as alternativas em volta, nessa ordem; nenhuma livre → a que menos sobrepõe. Marca a escolhida.
 */
export function lugarDoRotulo(candidatos: { x: number; y: number }[], texto: string, altura: number, ocupadas: Caixa[]): { x: number; y: number } {
  let melhor = candidatos[0];
  let menor = Infinity;
  for (const c of candidatos) {
    const caixa = caixaDoTexto(c.x, c.y, texto, altura);
    const choques = ocupadas.filter((o) => sobrepoe(caixa, o)).length;
    if (choques < menor) {
      menor = choques;
      melhor = c;
    }
    if (choques === 0) break;
  }
  ocupadas.push(caixaDoTexto(melhor.x, melhor.y, texto, altura));
  return melhor;
}

/** As posições em volta de uma âncora: a de sempre e, a passos de uma altura de texto, acima, abaixo, à esquerda e à direita. */
function emVolta(base: { x: number; y: number }, texto: string, altura: number): { x: number; y: number }[] {
  const w = texto.length * altura * 0.55;
  const p = altura * 1.3;
  const out = [base];
  for (let k = 1; k <= 3; k++) {
    out.push({ x: base.x, y: base.y - p * k }, { x: base.x, y: base.y + p * k }, { x: base.x - w - 1, y: base.y + p * (k - 1) }, { x: base.x + 1.5 * k, y: base.y - p * k });
  }
  return out;
}

export function desenharIsometrico(d: Desenhista, iso: IsometricoDePrancha, x: number, y: number, w: number, h: number): number {
  // C13: as caixas dos rótulos já escritos neste isométrico — ninguém escreve em cima de ninguém.
  const ocupadas: Caixa[] = [];
  d.retangulo(x, y, w, h, { espessuraMm: 0.18, cor: COR_FRACA });
  const pts = [...iso.segmentos.flatMap((s) => [s.a, s.b]), ...iso.pontos.map((p) => p.p)].map(projetarIsometrico);
  const minU = Math.min(...pts.map((p) => p.u));
  const maxU = Math.max(...pts.map((p) => p.u));
  const minV = Math.min(...pts.map((p) => p.v));
  const maxV = Math.max(...pts.map((p) => p.v));
  // Margens: título em cima, rótulos à direita e embaixo.
  const livreW = Math.max(10, w - 24);
  const livreH = Math.max(10, h - 16);
  const precisa = Math.max((maxU - minU) / livreW, (maxV - minV) / livreH, 1e-9);
  const den = ESCALAS_DO_ISOMETRICO.find((e) => e >= precisa) ?? Math.ceil(precisa / 25) * 25;
  d.texto(x + 2, y + 4, iso.titulo, 2.2, COR);
  d.texto(x + 2, y + 7.2, `Isométrico · 1:${den} (medidas em verdadeira grandeza nos eixos)`, TEXTO_MM, COR_FRACA);
  const ox = x + 4 + (livreW - (maxU - minU) / den) / 2 + 6;
  const oy = y + 11 + (livreH - (maxV - minV) / den) / 2;
  const papel = (p: P3) => {
    const q = projetarIsometrico(p);
    return { x: ox + (q.u - minU) / den, y: oy + (q.v - minV) / den };
  };

  for (const s of iso.segmentos) {
    const a = papel(s.a);
    const b = papel(s.b);
    const cor = COR_DA_DISCIPLINA[s.disciplina];
    d.linha(a.x, a.y, b.x, b.y, { espessuraMm: s.disciplina === 'ESGOTO' ? 0.5 : 0.35, cor });
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 8) {
      const texto = s.rotulo ?? `ø${s.bitolaMm}`;
      const r = lugarDoRotulo(emVolta(posicaoDoRotulo(a, b, 0.9, texto), texto, TEXTO_MM), texto, TEXTO_MM, ocupadas);
      d.texto(r.x, r.y, texto, TEXTO_MM, cor);
    }
  }
  for (const n of iso.nos) {
    const c = papel(n.p);
    d.poligono(
      Array.from({ length: 12 }, (_, i) => ({ x: c.x + 0.45 * Math.cos((i / 12) * Math.PI * 2), y: c.y + 0.45 * Math.sin((i / 12) * Math.PI * 2) })),
      COR_DA_DISCIPLINA[n.disciplina],
    );
    // E2.4: a peça no nó, pela sigla (a legenda da folha diz o nome).
    const sigla = SIGLA_DA_CONEXAO[n.tipo];
    const q = lugarDoRotulo(emVolta({ x: c.x - 2.2, y: c.y + 2.4 }, sigla, TEXTO_MM * 0.8), sigla, TEXTO_MM * 0.8, ocupadas);
    d.texto(q.x, q.y, sigla, TEXTO_MM * 0.8, COR_FRACA);
  }
  for (const p of iso.pontos) {
    const c = papel(p.p);
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      const a1 = ((i + 1) / 12) * Math.PI * 2;
      d.linha(c.x + 0.8 * Math.cos(a0), c.y + 0.8 * Math.sin(a0), c.x + 0.8 * Math.cos(a1), c.y + 0.8 * Math.sin(a1), { espessuraMm: 0.25, cor: COR });
    }
    const texto = `${p.sigla} · h ${cotaComSinal(p.cotaMm).replace('+', '')}`;
    const q = lugarDoRotulo(emVolta({ x: c.x + 1.3, y: c.y - 0.9 }, texto, TEXTO_MM), texto, TEXTO_MM, ocupadas);
    // Afastado da peça: uma linha fina leva o olho do rótulo até ela.
    if (Math.hypot(q.x - (c.x + 1.3), q.y - (c.y - 0.9)) > 0.5) d.linha(c.x, c.y, q.x, q.y - TEXTO_MM * 0.4, { espessuraMm: 0.1, cor: COR_FRACA });
    d.texto(q.x, q.y, texto, TEXTO_MM, COR);
  }
  return den;
}

/**
 * Distribui os isométricos numa área do papel: a grade (colunas × linhas)
 * cujas células ficam mais perto de 3:2; célula abaixo de 35 mm de altura não
 * desenha — devolve quantos ficaram de fora, para a folha dizer.
 */
export function desenharIsometricos(d: Desenhista, isos: IsometricoDePrancha[], x0: number, y0: number, largura: number, altura: number): { desenhados: number; deFora: number } {
  if (isos.length === 0 || altura < 35) return { desenhados: 0, deFora: isos.length };
  const MIN_H = 35;
  let melhor = { cols: 1, rows: isos.length, erro: Infinity };
  for (let cols = 1; cols <= Math.min(isos.length, 6); cols++) {
    const rows = Math.ceil(isos.length / cols);
    const cw = largura / cols;
    const ch = altura / rows;
    if (ch < MIN_H && cols < Math.min(isos.length, 6)) continue;
    const erro = Math.abs(Math.log(cw / ch / 1.5));
    if (erro < melhor.erro) melhor = { cols, rows, erro };
  }
  const cw = largura / melhor.cols;
  const rowsQueCabem = Math.max(1, Math.floor(altura / MIN_H));
  const rows = Math.min(melhor.rows, rowsQueCabem);
  const ch = Math.min(altura / rows, altura);
  const cabem = Math.min(isos.length, rows * melhor.cols);
  const GAP = 3;
  for (let i = 0; i < cabem; i++) {
    const c = i % melhor.cols;
    const r = Math.floor(i / melhor.cols);
    desenharIsometrico(d, isos[i], x0 + c * cw, y0 + r * ch, cw - GAP, ch - GAP);
  }
  return { desenhados: cabem, deFora: isos.length - cabem };
}
