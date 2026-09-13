/**
 * DXF para a importação de topografia (fase 15).
 *
 * O leitor anterior (privado em `blueprintTopografiaImportacao.ts`) era um
 * laço de pares sobre o arquivo inteiro, sem seção: guardava POINT, CIRCLE,
 * TEXT e MTEXT e jogava fora INSERT em silêncio — um DXF com os pontos
 * cotados em BLOCO (o mais comum saído de estação total) importava zero e
 * não avisava nada. Este lê por seção, guarda a tabela de BLOCKS e resolve
 * cada INSERT (inserção, escala, rotação, aninhado até 4 níveis), e lê o que
 * as linhas de quebra e a TIN precisam: LINE com Z, LWPOLYLINE com
 * elevação, POLYLINE 3D com VERTEX e 3DFACE.
 *
 * Não reaproveita `utils/dxfLeitor.ts` de propósito: aquele é o importador
 * de PAREDES, 2D (sem Z), sem BLOCKS e recusa INSERT por desenho; mudar o
 * comportamento dele muda os relatórios de recusa de outra frente. As duas
 * lições dele valem aqui: `trim` no código ("  0" do AutoCAD) e a paridade
 * dos pares — `SECTION` é o VALOR do par (0, SECTION).
 *
 * Puro: texto entra, entidades em coordenadas do desenho (WCS) saem.
 */

export interface VerticeDxf {
  x: number;
  y: number;
  z: number;
}

export interface EntidadeDxfTopo {
  tipo: 'POINT' | 'CIRCLE' | 'TEXT' | 'MTEXT' | 'ATTRIB' | 'LINE' | 'POLILINHA' | 'FACE';
  camada: string;
  /** POINT/CIRCLE/TEXT/MTEXT/ATTRIB: a posição. LINE/POLILINHA/FACE: o primeiro vértice. */
  x: number;
  y: number;
  z: number;
  texto?: string;
  /** Altura do texto ou raio do círculo, já na escala do INSERT. */
  altura?: number;
  raio?: number;
  /** ATTRIB: a tag do atributo (ELEV, COTA…). */
  tag?: string;
  /** LINE (2), POLILINHA (n), FACE (3 — quadrilátero vira duas). */
  vertices?: VerticeDxf[];
  fechada?: boolean;
  /** POLILINHA: veio com Z de verdade (3D, ou elevação ≠ 0). */
  temZ?: boolean;
}

export interface LeituraDxfTopo {
  entidades: EntidadeDxfTopo[];
  insunits: number | null;
  avisos: string[];
}

interface Bruta {
  tipo: string;
  codigos: Map<number, string[]>;
  /** Os pares (código, valor) NA ORDEM do arquivo — a LWPOLYLINE alinha o bulge (42) ao vértice por ela. */
  pares: { c: number; v: string }[];
  /** POLYLINE: os VERTEX até o SEQEND; INSERT: os ATTRIB. */
  filhos?: Bruta[];
}

/** Quantos segmentos um arco de bulge vira: um a cada ~11°, entre 2 e 32. */
function segmentosDoArco(anguloRad: number): number {
  return Math.max(2, Math.min(32, Math.ceil(Math.abs(anguloRad) / (Math.PI / 16))));
}

/**
 * Os pontos INTERMEDIÁRIOS do arco entre `a` e `b` com o bulge do DXF
 * (bulge = tan(θ/4); positivo = anti-horário). Cota interpolada.
 */
function arcoDoBulge(a: VerticeDxf, b: VerticeDxf, bulge: number): VerticeDxf[] {
  if (!bulge || !Number.isFinite(bulge)) return [];
  const theta = 4 * Math.atan(bulge);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const corda = Math.hypot(dx, dy);
  if (corda === 0) return [];
  const r = corda / (2 * Math.sin(Math.abs(theta) / 2));
  // Centro: no meio da corda, deslocado na perpendicular (esquerda se anti-horário).
  const d = r * Math.cos(theta / 2) * Math.sign(bulge);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx - (dy / corda) * d;
  const cy = my + (dx / corda) * d;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const n = segmentosDoArco(theta);
  const saida: VerticeDxf[] = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const ang = a0 + theta * t;
    saida.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), z: a.z + (b.z - a.z) * t });
  }
  return saida;
}

interface Bloco {
  nome: string;
  base: VerticeDxf;
  entidades: Bruta[];
}

const PROFUNDIDADE_MAXIMA = 4;

function um(b: Bruta, codigo: number): string | undefined {
  return b.codigos.get(codigo)?.[0];
}

function numero(b: Bruta, codigo: number, padrao = 0): number {
  const v = Number(um(b, codigo));
  return Number.isFinite(v) ? v : padrao;
}

/** Pares (código, valor) → lista de entidades brutas por seção, e a tabela de blocos. */
function separar(texto: string): { blocos: Map<string, Bloco>; entidades: Bruta[]; insunits: number | null } {
  const linhas = texto.split(/\r?\n/);
  const pares: { c: number; v: string }[] = [];
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const c = Number(linhas[i].trim());
    if (!Number.isFinite(c)) continue;
    pares.push({ c, v: linhas[i + 1].trim() });
  }
  const blocos = new Map<string, Bloco>();
  const entidades: Bruta[] = [];
  let insunits: number | null = null;
  let secao = '';
  let atual: Bruta | null = null;
  let blocoAtual: Bloco | null = null;
  let lista: Bruta[] = entidades;
  const fechar = () => {
    if (atual && atual.tipo !== 'BLOCK' && atual.tipo !== 'ENDBLK' && atual.tipo !== 'SECTION' && atual.tipo !== 'ENDSEC') {
      lista.push(atual);
    }
    atual = null;
  };
  for (let i = 0; i < pares.length; i++) {
    const { c, v } = pares[i];
    if (c === 9 && v === '$INSUNITS') {
      const prox = pares[i + 1];
      if (prox && prox.c === 70) insunits = Number(prox.v);
      continue;
    }
    if (c === 0) {
      fechar();
      if (v === 'SECTION') {
        secao = pares[i + 1]?.c === 2 ? pares[i + 1].v : '';
        continue;
      }
      if (v === 'ENDSEC') {
        secao = '';
        continue;
      }
      if (secao === 'BLOCKS' && v === 'BLOCK') {
        blocoAtual = { nome: '', base: { x: 0, y: 0, z: 0 }, entidades: [] };
        lista = blocoAtual.entidades;
        atual = { tipo: 'BLOCK', codigos: new Map(), pares: [] };
        continue;
      }
      if (secao === 'BLOCKS' && v === 'ENDBLK') {
        if (blocoAtual) blocos.set(blocoAtual.nome, blocoAtual);
        blocoAtual = null;
        lista = entidades;
        atual = { tipo: 'ENDBLK', codigos: new Map(), pares: [] };
        continue;
      }
      if (secao === 'ENTITIES' || secao === 'BLOCKS') {
        atual = { tipo: v, codigos: new Map(), pares: [] };
        if (secao === 'ENTITIES') lista = entidades;
      }
      continue;
    }
    if (!atual) continue;
    if (atual.tipo === 'BLOCK' && blocoAtual) {
      if (c === 2) blocoAtual.nome = v;
      else if (c === 10) blocoAtual.base.x = Number(v) || 0;
      else if (c === 20) blocoAtual.base.y = Number(v) || 0;
      else if (c === 30) blocoAtual.base.z = Number(v) || 0;
      continue;
    }
    atual.pares.push({ c, v });
    const arr = atual.codigos.get(c);
    if (arr) arr.push(v);
    else atual.codigos.set(c, [v]);
  }
  fechar();
  return { blocos, entidades, insunits };
}

/** POLYLINE + VERTEX…SEQEND e INSERT + ATTRIB…SEQEND viram uma entidade com filhos. */
function agrupar(lista: Bruta[]): Bruta[] {
  const saida: Bruta[] = [];
  for (let i = 0; i < lista.length; i++) {
    const e = lista[i];
    if (e.tipo === 'POLYLINE' || (e.tipo === 'INSERT' && um(e, 66) === '1')) {
      const filhos: Bruta[] = [];
      let j = i + 1;
      while (j < lista.length && lista[j].tipo !== 'SEQEND') {
        if ((e.tipo === 'POLYLINE' && lista[j].tipo === 'VERTEX') || (e.tipo === 'INSERT' && lista[j].tipo === 'ATTRIB')) filhos.push(lista[j]);
        else break;
        j++;
      }
      saida.push({ ...e, filhos });
      i = j < lista.length && lista[j].tipo === 'SEQEND' ? j : j - 1;
      continue;
    }
    if (e.tipo === 'VERTEX' || e.tipo === 'SEQEND' || e.tipo === 'ATTRIB') continue;
    saida.push(e);
  }
  return saida;
}

/** Transformação afim 3D com rotação só em Z — o que um INSERT faz. */
interface Afim {
  aplicar: (p: VerticeDxf) => VerticeDxf;
  /** Fator para alturas de texto e raios: √|sx·sy|. */
  escala: number;
}

const IDENT: Afim = { aplicar: (p) => p, escala: 1 };

/**
 * A transformação de um INSERT: escala pela base do bloco, roda, desloca
 * para a inserção. `desloc` (fase 16) é a posição da instância numa
 * MINSERT — em unidades do bloco já roda-das, sem escala, como o AutoCAD faz.
 */
function afimDoInsert(pai: Afim, ins: Bruta, bloco: Bloco, desloc: { x: number; y: number } = { x: 0, y: 0 }): Afim {
  const ix = numero(ins, 10);
  const iy = numero(ins, 20);
  const iz = numero(ins, 30);
  const sx = numero(ins, 41, 1);
  const sy = numero(ins, 42, 1);
  const sz = numero(ins, 43, 1);
  const rot = (numero(ins, 50) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const { base } = bloco;
  return {
    aplicar: (p) => {
      const x0 = (p.x - base.x) * sx + desloc.x;
      const y0 = (p.y - base.y) * sy + desloc.y;
      const z0 = (p.z - base.z) * sz;
      return pai.aplicar({ x: ix + x0 * cos - y0 * sin, y: iy + x0 * sin + y0 * cos, z: iz + z0 });
    },
    escala: pai.escala * Math.sqrt(Math.abs(sx * sy)),
  };
}

function converter(
  lista: Bruta[],
  M: Afim,
  blocos: Map<string, Bloco>,
  profundidade: number,
  saida: EntidadeDxfTopo[],
  avisos: string[],
  blocosFaltando: Set<string>,
): void {
  for (const e of lista) {
    const camada = um(e, 8) ?? '';
    const p = (cx: number, cy: number, cz: number): VerticeDxf => M.aplicar({ x: numero(e, cx), y: numero(e, cy), z: numero(e, cz) });
    switch (e.tipo) {
      case 'POINT': {
        const v = p(10, 20, 30);
        saida.push({ tipo: 'POINT', camada, ...v });
        break;
      }
      case 'CIRCLE': {
        const v = p(10, 20, 30);
        saida.push({ tipo: 'CIRCLE', camada, ...v, raio: numero(e, 40) * M.escala });
        break;
      }
      case 'TEXT':
      case 'MTEXT':
      case 'ATTRIB': {
        const v = p(10, 20, 30);
        const texto = [...(e.codigos.get(3) ?? []), ...(e.codigos.get(1) ?? [])].join('');
        saida.push({ tipo: e.tipo, camada, ...v, texto, altura: numero(e, 40, 1) * M.escala, tag: e.tipo === 'ATTRIB' ? um(e, 2) : undefined });
        break;
      }
      case 'LINE': {
        const a = p(10, 20, 30);
        const b = p(11, 21, 31);
        saida.push({ tipo: 'LINE', camada, ...a, vertices: [a, b], temZ: numero(e, 30) !== 0 || numero(e, 31) !== 0 });
        break;
      }
      case 'LWPOLYLINE': {
        // Vértices na ordem do arquivo: 10, 20 e, quando há arco, o 42 do
        // vértice de partida (fase 16: o bulge é tesselado, não cortado pela corda).
        const elev = numero(e, 38);
        const crus: { x: number; y: number; bulge: number }[] = [];
        for (const { c, v } of e.pares) {
          if (c === 10) crus.push({ x: Number(v) || 0, y: 0, bulge: 0 });
          else if (c === 20 && crus.length > 0) crus[crus.length - 1].y = Number(v) || 0;
          else if (c === 42 && crus.length > 0) crus[crus.length - 1].bulge = Number(v) || 0;
        }
        if (crus.length < 2) break;
        const fechada = (numero(e, 70) & 1) === 1;
        const locais: VerticeDxf[] = [];
        const n = crus.length;
        for (let i = 0; i < n; i++) {
          const a = { x: crus[i].x, y: crus[i].y, z: elev };
          locais.push(a);
          const proximo = i + 1 < n ? crus[i + 1] : fechada ? crus[0] : null;
          if (proximo && crus[i].bulge) locais.push(...arcoDoBulge(a, { x: proximo.x, y: proximo.y, z: elev }, crus[i].bulge));
        }
        if (fechada) locais.push(locais[0]);
        const vertices = locais.map((p) => M.aplicar(p));
        saida.push({ tipo: 'POLILINHA', camada, ...vertices[0], vertices, fechada, temZ: elev !== 0 });
        break;
      }
      case 'POLYLINE': {
        const flag = numero(e, 70);
        const tresD = (flag & 8) === 8;
        const elev = numero(e, 30);
        const crus: { v: VerticeDxf; bulge: number }[] = [];
        for (const v of e.filhos ?? []) {
          // Vértices de ajuste de spline/curva (70 & 16 / & 8) ficam de fora.
          if ((numero(v, 70) & 16) === 16) continue;
          crus.push({ v: { x: numero(v, 10), y: numero(v, 20), z: tresD ? numero(v, 30) : elev }, bulge: numero(v, 42) });
        }
        if (crus.length < 2) break;
        const fechada = (flag & 1) === 1;
        const locais: VerticeDxf[] = [];
        for (let i = 0; i < crus.length; i++) {
          locais.push(crus[i].v);
          const proximo = i + 1 < crus.length ? crus[i + 1].v : fechada ? crus[0].v : null;
          if (proximo && crus[i].bulge) locais.push(...arcoDoBulge(crus[i].v, proximo, crus[i].bulge));
        }
        if (fechada) locais.push(locais[0]);
        const vertices = locais.map((p) => M.aplicar(p));
        saida.push({ tipo: 'POLILINHA', camada, ...vertices[0], vertices, fechada, temZ: tresD || elev !== 0 });
        break;
      }
      case '3DFACE': {
        const q = [p(10, 20, 30), p(11, 21, 31), p(12, 22, 32), p(13, 23, 33)];
        const igual = (a: VerticeDxf, b: VerticeDxf) => a.x === b.x && a.y === b.y && a.z === b.z;
        const tem4 = e.codigos.has(13) && !igual(q[3], q[2]);
        saida.push({ tipo: 'FACE', camada, ...q[0], vertices: [q[0], q[1], q[2]] });
        if (tem4) saida.push({ tipo: 'FACE', camada, ...q[0], vertices: [q[0], q[2], q[3]] });
        break;
      }
      case 'INSERT': {
        const nome = um(e, 2) ?? '';
        const bloco = blocos.get(nome);
        if (!bloco) {
          blocosFaltando.add(nome);
          break;
        }
        if (profundidade >= PROFUNDIDADE_MAXIMA) {
          avisos.push(`Bloco "${nome}" aninhado além de ${PROFUNDIDADE_MAXIMA} níveis foi ignorado.`);
          break;
        }
        // MINSERT (fase 16): todas as instâncias da matriz, espaçadas por 44/45
        // no sistema rodado do bloco, como o AutoCAD desenha.
        const colunas = Math.max(1, Math.floor(numero(e, 70, 1)));
        const linhas = Math.max(1, Math.floor(numero(e, 71, 1)));
        const dx = numero(e, 44);
        const dy = numero(e, 45);
        for (let j = 0; j < linhas; j++) {
          for (let i = 0; i < colunas; i++) {
            const M2 = afimDoInsert(M, e, bloco, { x: i * dx, y: j * dy });
            converter(agrupar(bloco.entidades), M2, blocos, profundidade + 1, saida, avisos, blocosFaltando);
          }
        }
        // Os ATTRIB do INSERT já vêm em coordenadas do desenho (WCS): não transformar.
        for (const at of e.filhos ?? []) {
          if (at.tipo !== 'ATTRIB') continue;
          const v = M.aplicar({ x: numero(at, 10), y: numero(at, 20), z: numero(at, 30) });
          const texto = [...(at.codigos.get(3) ?? []), ...(at.codigos.get(1) ?? [])].join('');
          saida.push({ tipo: 'ATTRIB', camada: um(at, 8) ?? camada, ...v, texto, altura: numero(at, 40, 1) * M.escala, tag: um(at, 2) });
        }
        break;
      }
      default:
        break;
    }
  }
}

/** O DXF inteiro em entidades no sistema do desenho, com os blocos resolvidos. */
export function lerDxfTopografia(texto: string): LeituraDxfTopo {
  const { blocos, entidades, insunits } = separar(texto);
  const saida: EntidadeDxfTopo[] = [];
  const avisos: string[] = [];
  const faltando = new Set<string>();
  converter(agrupar(entidades), IDENT, blocos, 0, saida, avisos, faltando);
  if (faltando.size > 0) {
    avisos.push(`Bloco(s) não encontrado(s) na seção BLOCKS e ignorado(s): ${[...faltando].map((n) => `"${n}"`).join(', ')}.`);
  }
  return { entidades: saida, insunits, avisos };
}
