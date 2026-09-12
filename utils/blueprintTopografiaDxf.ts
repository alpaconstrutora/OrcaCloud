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
  /** POLYLINE: os VERTEX até o SEQEND; INSERT: os ATTRIB. */
  filhos?: Bruta[];
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
        atual = { tipo: 'BLOCK', codigos: new Map() };
        continue;
      }
      if (secao === 'BLOCKS' && v === 'ENDBLK') {
        if (blocoAtual) blocos.set(blocoAtual.nome, blocoAtual);
        blocoAtual = null;
        lista = entidades;
        atual = { tipo: 'ENDBLK', codigos: new Map() };
        continue;
      }
      if (secao === 'ENTITIES' || secao === 'BLOCKS') {
        atual = { tipo: v, codigos: new Map() };
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

function afimDoInsert(pai: Afim, ins: Bruta, bloco: Bloco): Afim {
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
      const x0 = (p.x - base.x) * sx;
      const y0 = (p.y - base.y) * sy;
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
        const xs = e.codigos.get(10) ?? [];
        const ys = e.codigos.get(20) ?? [];
        const elev = numero(e, 38);
        const vertices: VerticeDxf[] = [];
        for (let i = 0; i < Math.min(xs.length, ys.length); i++) vertices.push(M.aplicar({ x: Number(xs[i]) || 0, y: Number(ys[i]) || 0, z: elev }));
        if (vertices.length < 2) break;
        const fechada = (numero(e, 70) & 1) === 1;
        if (fechada) vertices.push(vertices[0]);
        saida.push({ tipo: 'POLILINHA', camada, ...vertices[0], vertices, fechada, temZ: elev !== 0 });
        break;
      }
      case 'POLYLINE': {
        const flag = numero(e, 70);
        const tresD = (flag & 8) === 8;
        const elev = numero(e, 30);
        const vertices: VerticeDxf[] = [];
        for (const v of e.filhos ?? []) {
          // Vértices de ajuste de spline/curva (70 & 16 / & 8) ficam de fora.
          if ((numero(v, 70) & 16) === 16) continue;
          vertices.push(M.aplicar({ x: numero(v, 10), y: numero(v, 20), z: tresD ? numero(v, 30) : elev }));
        }
        if (vertices.length < 2) break;
        const fechada = (flag & 1) === 1;
        if (fechada) vertices.push(vertices[0]);
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
        const colunas = numero(e, 70, 1);
        const linhas = numero(e, 71, 1);
        if (colunas > 1 || linhas > 1) avisos.push(`Bloco "${nome}" inserido em matriz (${colunas}×${linhas}): só a primeira instância foi lida.`);
        const M2 = afimDoInsert(M, e, bloco);
        converter(agrupar(bloco.entidades), M2, blocos, profundidade + 1, saida, avisos, blocosFaltando);
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
