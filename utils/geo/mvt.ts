/**
 * LADRILHO VETORIAL (Mapbox Vector Tile 2.1) — decodificador MÍNIMO (25/11/2026).
 *
 * Para os prédios do OpenStreetMap na Maquete, servidos pelo OpenFreeMap (esquema OpenMapTiles,
 * camada `building` com `render_height`). Lê só o que a especificação define: o protobuf do
 * ladrilho (camadas → feições → tags/geometria) e os comandos de geometria (MoveTo, LineTo,
 * ClosePath, parâmetros em zigue-zague). Sem dependência: a instalação de `@mapbox/vector-tile`
 * não estava disponível, e o formato é pequeno e estável.
 *
 * Especificação: https://github.com/mapbox/vector-tile-spec/tree/master/2.1
 */

export type ValorMvt = string | number | boolean | null;

export interface FeicaoMvt {
  id: number | null;
  /** 1 = ponto, 2 = linha, 3 = polígono. */
  tipo: number;
  propriedades: Record<string, ValorMvt>;
  /** Anéis/linhas em coordenadas do ladrilho (0…extent, y para BAIXO). */
  geometria: { x: number; y: number }[][];
}

export interface CamadaMvt {
  nome: string;
  extent: number;
  feicoes: FeicaoMvt[];
}

/** Leitor de protobuf: só varint, 64 bits, comprimento delimitado e 32 bits. */
class Leitor {
  pos = 0;
  constructor(
    readonly buf: Uint8Array,
    readonly fim = buf.length,
    inicio = 0,
  ) {
    this.pos = inicio;
  }

  varint(): number {
    let r = 0;
    let mult = 1;
    for (;;) {
      if (this.pos >= this.fim) throw new RangeError('MVT: varint cortado');
      const b = this.buf[this.pos++];
      r += (b & 0x7f) * mult;
      if (b < 0x80) return r;
      mult *= 128;
    }
  }

  /** Pula o valor de um campo pelo tipo do fio. */
  pular(tipoDoFio: number) {
    if (tipoDoFio === 0) this.varint();
    else if (tipoDoFio === 1) this.pos += 8;
    else if (tipoDoFio === 2) this.pos += this.varint();
    else if (tipoDoFio === 5) this.pos += 4;
    else throw new RangeError(`MVT: tipo de fio ${tipoDoFio} não suportado`);
  }

  /** Sub-leitor do campo de comprimento delimitado que começa aqui. */
  sub(): Leitor {
    const n = this.varint();
    const l = new Leitor(this.buf, this.pos + n, this.pos);
    this.pos += n;
    return l;
  }

  texto(): string {
    const l = this.sub();
    return new TextDecoder().decode(this.buf.subarray(l.pos, l.fim));
  }

  empacotados(): number[] {
    const l = this.sub();
    const out: number[] = [];
    while (l.pos < l.fim) out.push(l.varint());
    return out;
  }
}

const zigzag = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

function lerValor(l: Leitor): ValorMvt {
  let v: ValorMvt = null;
  while (l.pos < l.fim) {
    const chave = l.varint();
    const campo = Math.floor(chave / 8);
    const fio = chave & 7;
    const dv = new DataView(l.buf.buffer, l.buf.byteOffset);
    if (campo === 1 && fio === 2) v = l.texto();
    else if (campo === 2 && fio === 5) {
      v = dv.getFloat32(l.pos, true);
      l.pos += 4;
    } else if (campo === 3 && fio === 1) {
      v = dv.getFloat64(l.pos, true);
      l.pos += 8;
    } else if ((campo === 4 || campo === 5) && fio === 0) v = l.varint();
    else if (campo === 6 && fio === 0) v = zigzag(l.varint());
    else if (campo === 7 && fio === 0) v = l.varint() !== 0;
    else l.pular(fio);
  }
  return v;
}

/** Os comandos de geometria → listas de pontos (cada MoveTo abre uma nova). */
export function decodificarGeometria(cmds: readonly number[]): { x: number; y: number }[][] {
  const partes: { x: number; y: number }[][] = [];
  let atual: { x: number; y: number }[] | null = null;
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < cmds.length) {
    const c = cmds[i++];
    const id = c & 7;
    const n = c >> 3;
    if (id === 7) {
      // ClosePath: fecha repetindo o primeiro ponto.
      if (atual && atual.length > 0) atual.push({ ...atual[0] });
      continue;
    }
    for (let k = 0; k < n; k++) {
      if (i + 1 >= cmds.length) break;
      x += zigzag(cmds[i++]);
      y += zigzag(cmds[i++]);
      if (id === 1) {
        atual = [];
        partes.push(atual);
      }
      atual?.push({ x, y });
    }
  }
  return partes;
}

function lerFeicao(l: Leitor, chaves: string[], valores: ValorMvt[]): FeicaoMvt {
  let id: number | null = null;
  let tipo = 0;
  let tags: number[] = [];
  let geom: number[] = [];
  while (l.pos < l.fim) {
    const chave = l.varint();
    const campo = Math.floor(chave / 8);
    const fio = chave & 7;
    if (campo === 1 && fio === 0) id = l.varint();
    else if (campo === 2 && fio === 2) tags = l.empacotados();
    else if (campo === 3 && fio === 0) tipo = l.varint();
    else if (campo === 4 && fio === 2) geom = l.empacotados();
    else l.pular(fio);
  }
  const propriedades: Record<string, ValorMvt> = {};
  for (let k = 0; k + 1 < tags.length; k += 2) {
    const nome = chaves[tags[k]];
    if (nome !== undefined) propriedades[nome] = valores[tags[k + 1]] ?? null;
  }
  return { id, tipo, propriedades, geometria: decodificarGeometria(geom) };
}

function lerCamada(l: Leitor): CamadaMvt {
  let nome = '';
  let extent = 4096;
  const chaves: string[] = [];
  const valores: ValorMvt[] = [];
  const brutas: Leitor[] = [];
  while (l.pos < l.fim) {
    const chave = l.varint();
    const campo = Math.floor(chave / 8);
    const fio = chave & 7;
    if (campo === 1 && fio === 2) nome = l.texto();
    else if (campo === 2 && fio === 2) brutas.push(l.sub());
    else if (campo === 3 && fio === 2) chaves.push(l.texto());
    else if (campo === 4 && fio === 2) valores.push(lerValor(l.sub()));
    else if (campo === 5 && fio === 0) extent = l.varint();
    else l.pular(fio);
  }
  // As feições depois: chaves e valores podem vir depois delas no fio.
  return { nome, extent, feicoes: brutas.map((b) => lerFeicao(b, chaves, valores)) };
}

/** As camadas do ladrilho; `so` filtra pelo nome (as outras nem são decodificadas). */
export function lerLadrilho(buf: Uint8Array, so?: readonly string[]): CamadaMvt[] {
  const l = new Leitor(buf);
  const camadas: CamadaMvt[] = [];
  while (l.pos < l.fim) {
    const chave = l.varint();
    const campo = Math.floor(chave / 8);
    const fio = chave & 7;
    if (campo === 3 && fio === 2) {
      const sub = l.sub();
      if (so) {
        // Espia o nome antes de decodificar a camada inteira.
        const espia = new Leitor(sub.buf, sub.fim, sub.pos);
        let nome = '';
        while (espia.pos < espia.fim) {
          const k = espia.varint();
          if (Math.floor(k / 8) === 1 && (k & 7) === 2) {
            nome = espia.texto();
            break;
          }
          espia.pular(k & 7);
        }
        if (!so.includes(nome)) continue;
      }
      camadas.push(lerCamada(sub));
    } else l.pular(fio);
  }
  return camadas;
}
