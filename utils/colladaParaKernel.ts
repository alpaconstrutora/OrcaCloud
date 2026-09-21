/**
 * IMPORTAR DO SKETCHUP — COLLADA (.dae) → PAREDES (21/09/2026, backlog P2,
 * "importação DAE/SKP" registrada na P2.23).
 *
 * ─── POR QUE COLLADA E NÃO .SKP ─────────────────────────────────────────────
 *
 * O `.skp` é binário fechado; o caminho é o mesmo da exportação: no SketchUp,
 * Arquivo › Exportar › Modelo 3D › COLLADA (.dae). O arquivo traz malhas
 * (triângulos ou polígonos), agrupadas por nó/componente, com unidade e eixo
 * vertical declarados. Não traz "parede" nenhuma — só faces. Este módulo
 * RECONHECE paredes nas faces, e diz o que ignorou.
 *
 * ─── COMO SE RECONHECE UMA PAREDE NUMA MALHA ────────────────────────────────
 *
 * 1. Toda face VERTICAL (normal sem componente Z) entra; piso, laje e telhado
 *    saem já aqui.
 * 2. As faces verticais são agrupadas por PLANO (direção em planta quantizada
 *    a 0,5°, afastamento a 5 mm); em cada plano, os trechos ocupados ao longo
 *    do plano (união das projeções, com emendas de até 20 mm) e a faixa de Z.
 * 3. Dois planos PARALELOS a uma distância entre `espessuraMinMm` e
 *    `espessuraMaxMm`, cujos trechos se sobrepõem por ao menos
 *    `comprimentoMinMm`, são as duas faces de UMA parede: eixo na linha média,
 *    espessura = distância, altura = faixa de Z, base = Z mínimo. Para cada
 *    trecho, só o plano MAIS PRÓXIMO de cada lado conta (senão a face de uma
 *    parede parearia também com a face de trás da parede vizinha).
 * 4. Fora: par mais baixo que `alturaMinMm` (viga, borda de laje, mureta),
 *    par mais curto que 2× a espessura (pilar), planos sem par (painel de
 *    porta/janela, mobiliário, vidro solto).
 *
 * Aberturas NÃO são reconhecidas nesta fase (o vão numa malha é só ausência de
 * faces entre verga e peitoril): fica registrado. As paredes saem com as
 * pontas na FACE da parede vizinha; `encostarNasFaces` (o mesmo do IFC) leva
 * as pontas ao eixo.
 *
 * ─── EIXOS E UNIDADES ───────────────────────────────────────────────────────
 *
 * `<unit meter="…">` dá a escala; `<up_axis>` diz qual eixo é o vertical.
 * Z_UP (SketchUp): kernel x = X, y = −Y (o Y do SketchUp aponta para o norte,
 * o do kernel para baixo na tela), z = Z. Y_UP: (X, Y, Z) → (X, −(−Z), Y) =
 * x = X, y = Z, z = Y. Tudo em mm inteiros no fim.
 */
import type { Point } from './blueprintKernel';
import { descendentes, filho, filhos, lerXml, nomeLocal, type ElementoXml } from './xmlLeve';

export interface OpcoesDeReconhecimento {
  espessuraMinMm: number;
  espessuraMaxMm: number;
  comprimentoMinMm: number;
  alturaMinMm: number;
}
export const OPCOES_PADRAO: OpcoesDeReconhecimento = { espessuraMinMm: 50, espessuraMaxMm: 600, comprimentoMinMm: 300, alturaMinMm: 1000 };

export interface ParedeLida {
  a: Point;
  b: Point;
  espessuraMm: number;
  alturaMm: number;
  baseMm: number;
  comprimentoMm: number;
  /** Nome do nó (grupo/componente) que mais contribuiu com faces. */
  origem: string | null;
}

export interface PavimentoLido {
  /** Cota da base das paredes deste grupo (mm). */
  elevationMm: number;
  alturaMm: number;
  paredes: ParedeLida[];
}

export interface ResumoCollada {
  unidadeM: number;
  upAxis: 'Z_UP' | 'Y_UP' | 'X_UP';
  geometrias: number;
  instancias: number;
  triangulos: number;
  verticais: number;
  planos: number;
  /** Planos verticais sem par (painéis, mobiliário, vidro solto). */
  planosSemPar: number;
  /** Pares recusados por altura/comprimento. */
  paresRecusados: { baixos: number; curtos: number };
}

export interface ColladaPreparado {
  paredes: ParedeLida[];
  pavimentos: PavimentoLido[];
  resumo: ResumoCollada;
  avisos: string[];
}

type V3 = [number, number, number];
type M4 = number[]; // 16, row-major

const IDENT: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M4, b: M4): M4 {
  const r = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}
function aplicar(m: M4, p: V3): V3 {
  const [x, y, z] = p;
  const w = m[12] * x + m[13] * y + m[14] * z + m[15] || 1;
  return [(m[0] * x + m[1] * y + m[2] * z + m[3]) / w, (m[4] * x + m[5] * y + m[6] * z + m[7]) / w, (m[8] * x + m[9] * y + m[10] * z + m[11]) / w];
}
const numeros = (t: string): number[] => t.trim().split(/\s+/).filter(Boolean).map(Number);

function matrizDoNo(no: ElementoXml): M4 {
  let m = IDENT;
  for (const f of no.filhos) {
    const nome = nomeLocal(f.nome);
    if (nome === 'matrix') {
      const v = numeros(f.texto);
      if (v.length === 16) m = mul(m, v);
    } else if (nome === 'translate') {
      const [x, y, z] = numeros(f.texto);
      m = mul(m, [1, 0, 0, x || 0, 0, 1, 0, y || 0, 0, 0, 1, z || 0, 0, 0, 0, 1]);
    } else if (nome === 'scale') {
      const [x, y, z] = numeros(f.texto);
      m = mul(m, [x ?? 1, 0, 0, 0, 0, y ?? 1, 0, 0, 0, 0, z ?? 1, 0, 0, 0, 0, 1]);
    } else if (nome === 'rotate') {
      const [x, y, z, graus] = numeros(f.texto);
      const c = Math.cos((graus * Math.PI) / 180);
      const s = Math.sin((graus * Math.PI) / 180);
      const l = Math.hypot(x, y, z) || 1;
      const [ux, uy, uz] = [x / l, y / l, z / l];
      const t = 1 - c;
      m = mul(m, [t * ux * ux + c, t * ux * uy - s * uz, t * ux * uz + s * uy, 0, t * ux * uy + s * uz, t * uy * uy + c, t * uy * uz - s * ux, 0, t * ux * uz - s * uy, t * uy * uz + s * ux, t * uz * uz + c, 0, 0, 0, 0, 1]);
    }
  }
  return m;
}

/** Os triângulos (índices em `posicoes`) de uma `<mesh>`: triangles, polylist e polygons. */
function triangulosDaMalha(mesh: ElementoXml): { posicoes: number[]; tris: number[] } | null {
  const fontes = new Map<string, number[]>();
  for (const s of filhos(mesh, 'source')) {
    const arr = filho(s, 'float_array');
    if (arr && s.atributos.id) fontes.set('#' + s.atributos.id, numeros(arr.texto));
  }
  const vertices = filho(mesh, 'vertices');
  if (!vertices) return null;
  const posInput = filhos(vertices, 'input').find((i) => i.atributos.semantic === 'POSITION');
  const posicoes = posInput ? fontes.get(posInput.atributos.source ?? '') : undefined;
  if (!posicoes) return null;
  const idVertices = '#' + (vertices.atributos.id ?? '');
  const tris: number[] = [];
  for (const prim of mesh.filhos) {
    const tipo = nomeLocal(prim.nome);
    if (tipo !== 'triangles' && tipo !== 'polylist' && tipo !== 'polygons') continue;
    const inputs = filhos(prim, 'input');
    const vtx = inputs.find((i) => i.atributos.semantic === 'VERTEX' && i.atributos.source === idVertices) ?? inputs.find((i) => i.atributos.semantic === 'VERTEX');
    if (!vtx) continue;
    const offset = Number(vtx.atributos.offset ?? 0);
    const passo = Math.max(...inputs.map((i) => Number(i.atributos.offset ?? 0))) + 1;
    const lerP = (p: ElementoXml): number[] => {
      const v = numeros(p.texto);
      const saida: number[] = [];
      for (let i = offset; i < v.length; i += passo) saida.push(v[i]);
      return saida;
    };
    if (tipo === 'triangles') {
      for (const p of filhos(prim, 'p')) tris.push(...lerP(p));
    } else if (tipo === 'polylist') {
      const vcount = numeros(filho(prim, 'vcount')?.texto ?? '');
      const idx = filhos(prim, 'p').flatMap(lerP);
      let c = 0;
      for (const k of vcount) {
        for (let j = 1; j + 1 < k; j++) tris.push(idx[c], idx[c + j], idx[c + j + 1]);
        c += k;
      }
    } else {
      for (const p of filhos(prim, 'p')) {
        const idx = lerP(p);
        for (let j = 1; j + 1 < idx.length; j++) tris.push(idx[0], idx[j], idx[j + 1]);
      }
    }
  }
  return { posicoes, tris };
}

export interface TrianguloNoMundo {
  p: [V3, V3, V3];
  origem: string | null;
}

/** Lê o COLLADA e devolve os triângulos já em mm, no referencial do kernel (x, y em planta, z para cima). */
export function trianguloesDoCollada(texto: string): { triangulos: TrianguloNoMundo[]; resumo: Pick<ResumoCollada, 'unidadeM' | 'upAxis' | 'geometrias' | 'instancias' | 'triangulos'>; avisos: string[] } {
  const raiz = lerXml(texto);
  if (nomeLocal(raiz.nome) !== 'COLLADA') throw new Error('Não é um arquivo COLLADA (.dae): a raiz não é <COLLADA>.');
  const avisos: string[] = [];
  const asset = filho(raiz, 'asset');
  const unidadeM = Number(filho(asset ?? raiz, 'unit')?.atributos.meter ?? 1) || 1;
  const up = (filho(asset ?? raiz, 'up_axis')?.texto.trim().toUpperCase() ?? 'Y_UP') as ResumoCollada['upAxis'];
  const geometrias = new Map<string, { posicoes: number[]; tris: number[] }>();
  for (const g of descendentes(raiz, 'geometry')) {
    const mesh = filho(g, 'mesh');
    if (!mesh || !g.atributos.id) continue;
    const t = triangulosDaMalha(mesh);
    if (t && t.tris.length) geometrias.set('#' + g.atributos.id, t);
  }
  const nosDaBiblioteca = new Map<string, ElementoXml>();
  for (const lib of descendentes(raiz, 'library_nodes')) for (const n of descendentes(lib, 'node')) if (n.atributos.id) nosDaBiblioteca.set('#' + n.atributos.id, n);

  const triangulos: TrianguloNoMundo[] = [];
  let instancias = 0;
  const paraKernel = (v: V3): V3 => {
    const [X, Y, Z] = v.map((c) => c * unidadeM * 1000) as V3;
    if (up === 'Z_UP') return [X, -Y, Z];
    if (up === 'X_UP') return [-Y, -Z, X];
    return [X, Z, Y]; // Y_UP
  };
  // `deBiblioteca`: dentro de um componente (library_nodes) o nome que vale é o da INSTÂNCIA na cena ("Parede A"), não o da definição ("Parede tipo").
  const visitar = (no: ElementoXml, acumulada: M4, nomePai: string | null, profundidade: number, deBiblioteca = false) => {
    if (profundidade > 32) return;
    const m = mul(acumulada, matrizDoNo(no));
    const nome = deBiblioteca ? (nomePai ?? no.atributos.name ?? no.atributos.id ?? null) : (no.atributos.name ?? no.atributos.id ?? nomePai);
    for (const ig of filhos(no, 'instance_geometry')) {
      const g = geometrias.get(ig.atributos.url ?? '');
      if (!g) continue;
      instancias++;
      for (let i = 0; i + 2 < g.tris.length; i += 3) {
        const p = [g.tris[i], g.tris[i + 1], g.tris[i + 2]].map((k) => paraKernel(aplicar(m, [g.posicoes[3 * k], g.posicoes[3 * k + 1], g.posicoes[3 * k + 2]]))) as [V3, V3, V3];
        if (p.some((q) => q.some((c) => !Number.isFinite(c)))) continue;
        triangulos.push({ p, origem: nome ?? null });
      }
    }
    for (const inst of filhos(no, 'instance_node')) {
      const alvo = nosDaBiblioteca.get(inst.atributos.url ?? '');
      if (alvo) visitar(alvo, m, nome ?? null, profundidade + 1, true);
      else avisos.push(`instance_node ${inst.atributos.url ?? '?'} não encontrado em library_nodes`);
    }
    for (const f of filhos(no, 'node')) visitar(f, m, nome ?? null, profundidade + 1, deBiblioteca);
  };
  const cenas = descendentes(raiz, 'visual_scene');
  if (cenas.length === 0) avisos.push('Sem <visual_scene>: nenhuma instância; as geometrias não foram posicionadas.');
  for (const cena of cenas) for (const n of filhos(cena, 'node')) visitar(n, IDENT, null, 0);
  return { triangulos, resumo: { unidadeM, upAxis: up, geometrias: geometrias.size, instancias, triangulos: triangulos.length }, avisos };
}

// ─── Reconhecimento de paredes ──────────────────────────────────────────────

interface Plano {
  /** Direção unitária em planta (normal do plano), canônica: nx > 0 ou (nx == 0 e ny > 0). */
  nx: number;
  ny: number;
  /** Afastamento da origem ao longo da normal (mm). */
  d: number;
  /** Intervalos ocupados ao longo de u = (−ny, nx), já unidos. */
  /** `origens`: nó de origem → comprimento de face que ele contribuiu (o maior dá o nome da parede). */
  trechos: { t0: number; t1: number; z0: number; z1: number; origens: Map<string, number> }[];
}

/**
 * Une as projeções das faces de um plano em trechos. Duas faces entram no
 * mesmo trecho quando se tocam ao longo do plano (emenda ≤ 20 mm) E se
 * sobrepõem em Z: a borda da laje (2,80–2,92 m) que passa sobre a testa da
 * parede (0–2,80 m) fica em trecho próprio — senão a testa "ganharia" a altura
 * da laje e a laje a altura da parede. Repete até nada mais unir (a ordem em
 * que as faces chegam não pode mudar o resultado).
 */
function unirTrechos(itens: { t0: number; t1: number; z0: number; z1: number; origem: string | null }[], emendaMm = 20): Plano['trechos'] {
  let trechos: Plano['trechos'] = itens.map((it) => ({ t0: it.t0, t1: it.t1, z0: it.z0, z1: it.z1, origens: new Map(it.origem ? [[it.origem, it.t1 - it.t0]] : []) }));
  let mudou = true;
  while (mudou) {
    mudou = false;
    const saida: Plano['trechos'] = [];
    for (const t of trechos.sort((x, y) => x.t0 - y.t0)) {
      const alvo = saida.find((u) => t.t0 <= u.t1 + emendaMm && t.t1 >= u.t0 - emendaMm && Math.min(t.z1, u.z1) - Math.max(t.z0, u.z0) > 0);
      if (alvo) {
        alvo.t0 = Math.min(alvo.t0, t.t0);
        alvo.t1 = Math.max(alvo.t1, t.t1);
        alvo.z0 = Math.min(alvo.z0, t.z0);
        alvo.z1 = Math.max(alvo.z1, t.z1);
        for (const [o, c] of t.origens) alvo.origens.set(o, (alvo.origens.get(o) ?? 0) + c);
        mudou = true;
      } else saida.push(t);
    }
    trechos = saida;
  }
  return trechos.sort((x, y) => x.t0 - y.t0);
}

/** Agrupa as faces verticais por plano (0,5° / 5 mm). */
export function planosVerticais(triangulos: readonly TrianguloNoMundo[]): { planos: Plano[]; verticais: number } {
  const grupos = new Map<string, { nx: number; ny: number; d: number; itens: { t0: number; t1: number; z0: number; z1: number; origem: string | null }[] }>();
  let verticais = 0;
  for (const t of triangulos) {
    const [a, b, c] = t.p;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const comp = Math.hypot(nx, ny, nz);
    if (comp < 1e-6) continue;
    if (Math.abs(nz) / comp > 0.05) continue; // não vertical
    verticais++;
    const h = Math.hypot(nx, ny);
    nx /= h;
    ny /= h;
    if (nx < 0 || (Math.abs(nx) < 1e-9 && ny < 0)) {
      nx = -nx;
      ny = -ny;
    }
    if (Math.abs(nx) < 1e-9) nx = 0;
    const d = (nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1])) / 3;
    const ang = Math.round((Math.atan2(ny, nx) * 180) / Math.PI / 0.5);
    const chave = `${ang}|${Math.round(d / 5)}`;
    const ts = [a, b, c].map((p) => -ny * p[0] + nx * p[1]);
    const zs = [a[2], b[2], c[2]];
    const item = { t0: Math.min(...ts), t1: Math.max(...ts), z0: Math.min(...zs), z1: Math.max(...zs), origem: t.origem };
    const g = grupos.get(chave);
    if (g) g.itens.push(item);
    else grupos.set(chave, { nx, ny, d, itens: [item] });
  }
  const planos: Plano[] = [];
  for (const g of grupos.values()) planos.push({ nx: g.nx, ny: g.ny, d: g.d, trechos: unirTrechos(g.itens) });
  return { planos, verticais };
}

/**
 * Reconhece paredes nos planos verticais pareados.
 *
 * Duas escolhas que os casos reais forçaram:
 * - Plano FINO (tem um paralelo a menos de `espessuraMinMm`, com sobreposição)
 *   é painel de porta/janela ou vidro: sai do jogo — como face A e como par.
 *   Sem isso a face da porta (a 55 mm da face da parede) virava "parede".
 * - Para cada trecho de face, o par escolhido é o que mais COBRE o trecho
 *   (empate: o mais próximo), não simplesmente o mais próximo: entre as duas
 *   faces de uma parede ficam as testas das paredes perpendiculares, e a mais
 *   próxima quase nunca é a face oposta.
 */
export function paredesDosPlanos(planos: readonly Plano[], o: OpcoesDeReconhecimento = OPCOES_PADRAO): { paredes: ParedeLida[]; semPar: number; baixos: number; curtos: number } {
  const paredes: ParedeLida[] = [];
  const chaves = new Set<string>();
  const usados = new Set<Plano>();
  let baixos = 0;
  let curtos = 0;
  const paralelos = (a: Plano, b: Plano) => Math.abs(a.nx * b.nx + a.ny * b.ny) > 0.99996; // ~0,5°
  const sobrepoe = (a: Plano, b: Plano) => a.trechos.some((ta) => b.trechos.some((tb) => Math.min(ta.t1, tb.t1) - Math.max(ta.t0, tb.t0) > 1));
  const finos = new Set<Plano>();
  for (const A of planos) {
    if (planos.some((B) => B !== A && paralelos(A, B) && Math.abs(B.d - A.d) > 0.5 && Math.abs(B.d - A.d) < o.espessuraMinMm && sobrepoe(A, B))) finos.add(A);
  }
  for (const A of planos) {
    if (finos.has(A)) continue;
    const candidatos = planos.filter((B) => B !== A && !finos.has(B) && paralelos(A, B) && Math.abs(B.d - A.d) >= o.espessuraMinMm && Math.abs(B.d - A.d) <= o.espessuraMaxMm);
    for (const lado of [1, -1] as const) {
      for (const tr of A.trechos) {
        let melhor: { B: Plano; tb: Plano['trechos'][number]; t0: number; t1: number; z0: number; z1: number; dist: number; cobertura: number } | null = null;
        let viuBaixo = false;
        for (const B of candidatos) {
          const dist = B.d - A.d;
          if (Math.sign(dist) !== lado) continue;
          for (const tb of B.trechos) {
            const t0 = Math.max(tr.t0, tb.t0);
            const t1 = Math.min(tr.t1, tb.t1);
            if (t1 - t0 < 1) continue;
            // A faixa de Z COMUM às duas faces: a borda da laje (2,80–2,92 m) sobre a face da parede (0–2,80 m) não é parede.
            const z0 = Math.max(tr.z0, tb.z0);
            const z1 = Math.min(tr.z1, tb.z1);
            if (z1 - z0 < o.alturaMinMm) {
              viuBaixo = true;
              continue;
            }
            // A sobreposição tem de cobrir a maior parte da face MENOR do par: a testa de uma parede
            // perpendicular (150 mm) tocando 75 mm de uma face longa não é parede de 75 mm.
            if (t1 - t0 < 0.6 * Math.min(tr.t1 - tr.t0, tb.t1 - tb.t0)) continue;
            const cobertura = (t1 - t0) / Math.max(1, tr.t1 - tr.t0);
            if (!melhor || cobertura > melhor.cobertura + 1e-9 || (Math.abs(cobertura - melhor.cobertura) <= 1e-9 && Math.abs(dist) < Math.abs(melhor.dist))) melhor = { B, tb, t0, t1, z0, z1, dist, cobertura };
          }
        }
        if (!melhor) {
          if (viuBaixo) baixos++;
          continue;
        }
        const espessura = Math.abs(melhor.dist);
        const comprimento = melhor.t1 - melhor.t0;
        const { z0, z1 } = melhor;
        if (comprimento < o.comprimentoMinMm || comprimento < 2 * espessura) {
          curtos++;
          continue;
        }
        const dm = (A.d + melhor.B.d) / 2;
        const ponto = (t: number): Point => ({ x: Math.round(A.nx * dm - A.ny * t), y: Math.round(A.ny * dm + A.nx * t) });
        const pa = ponto(melhor.t0);
        const pb = ponto(melhor.t1);
        const chave = [pa.x, pa.y, pb.x, pb.y, Math.round(espessura)].join('|');
        const chaveInv = [pb.x, pb.y, pa.x, pa.y, Math.round(espessura)].join('|');
        usados.add(A);
        usados.add(melhor.B);
        if (chaves.has(chave) || chaves.has(chaveInv)) continue;
        chaves.add(chave);
        const origens = new Map<string, number>();
        for (const [o, c] of [...tr.origens, ...melhor.tb.origens]) origens.set(o, (origens.get(o) ?? 0) + c);
        const origem = [...origens.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
        paredes.push({ a: pa, b: pb, espessuraMm: Math.round(espessura), alturaMm: Math.round(z1 - z0), baseMm: Math.round(z0), comprimentoMm: Math.round(comprimento), origem });
      }
    }
  }
  return { paredes, semPar: planos.filter((p) => !usados.has(p) && !finos.has(p)).length, baixos, curtos };
}

/** Agrupa as paredes por cota de base (pavimentos), a 300 mm de tolerância. */
export function pavimentosDasParedes(paredes: readonly ParedeLida[]): PavimentoLido[] {
  const ordenadas = [...paredes].sort((a, b) => a.baseMm - b.baseMm);
  const grupos: PavimentoLido[] = [];
  for (const p of ordenadas) {
    const g = grupos[grupos.length - 1];
    if (g && p.baseMm - g.elevationMm <= 300) g.paredes.push(p);
    else grupos.push({ elevationMm: p.baseMm, alturaMm: 0, paredes: [p] });
  }
  for (const g of grupos) {
    const alturas = g.paredes.map((p) => p.alturaMm).sort((a, b) => a - b);
    g.alturaMm = alturas[Math.floor(alturas.length / 2)] ?? 2800;
    g.elevationMm = Math.round(g.elevationMm / 10) * 10;
  }
  return grupos;
}

export function prepararCollada(texto: string, o: OpcoesDeReconhecimento = OPCOES_PADRAO): ColladaPreparado {
  const { triangulos, resumo: r, avisos } = trianguloesDoCollada(texto);
  const { planos, verticais } = planosVerticais(triangulos);
  const rec = paredesDosPlanos(planos, o);
  const pavimentos = pavimentosDasParedes(rec.paredes);
  if (triangulos.length === 0) avisos.push('Nenhum triângulo posicionado: o arquivo não tem malhas ou a cena está vazia.');
  if (triangulos.length > 0 && rec.paredes.length === 0) avisos.push('Nenhuma parede reconhecida: procure faces verticais paralelas entre 50 e 600 mm de distância; grupos sem espessura (faces únicas) não viram parede.');
  if (r.upAxis === 'Y_UP') avisos.push('Eixo vertical Y (padrão do COLLADA): convertido para Z para cima.');
  return {
    paredes: rec.paredes,
    pavimentos,
    resumo: { ...r, verticais, planos: planos.length, planosSemPar: rec.semPar, paresRecusados: { baixos: rec.baixos, curtos: rec.curtos } },
    avisos,
  };
}
