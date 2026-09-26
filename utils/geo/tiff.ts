/**
 * LEITOR DE TIFF / GeoTIFF (A3, 26/09/2026) — próprio, sem dependência.
 *
 * Cobre o que ortofoto e DEM de prefeitura, IBGE, drone e GDAL costumam ser:
 *  - TIFF clássico (não BigTIFF), little ou big endian;
 *  - faixas (strips) OU blocos (tiles), configuração CHUNKY (pixel intercalado);
 *  - sem compressão, LZW, Deflate (zlib) e PackBits;
 *  - preditor 2 (diferença horizontal) e 3 (ponto flutuante);
 *  - amostras de 8/16/32 bits inteiras e 32/64 bits de ponto flutuante;
 *  - as tags GeoTIFF: ModelPixelScale, ModelTiepoint, ModelTransformation,
 *    GeoKeyDirectory (tipo de modelo, EPSG geográfico/projetado, PixelIsPoint)
 *    e o NODATA do GDAL.
 *
 * O que NÃO lê, e diz: BigTIFF, JPEG/WebP/LERC dentro do TIFF, configuração
 * planar (banda separada). A recusa nomeia o motivo — "converta com
 * `gdal_translate -co COMPRESS=DEFLATE`" é uma saída que o usuário consegue.
 *
 * A descompressão Deflate usa `DecompressionStream` (navegador e Node ≥ 18):
 * por isso a leitura é assíncrona.
 */

export interface Tiff {
  largura: number;
  altura: number;
  amostrasPorPixel: number;
  bitsPorAmostra: number;
  /** 1 = inteiro sem sinal, 2 = com sinal, 3 = ponto flutuante. */
  formatoDaAmostra: 1 | 2 | 3;
  /** 0/1 = tons de cinza, 2 = RGB, 3 = paleta. */
  fotometrica: number;
  /** Pixel intercalado, na ordem da imagem, JÁ no endian da máquina. */
  amostras: Float64Array | Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array;
  /** Paleta (fotométrica 3): 3 × 2^bits valores de 16 bits (R…, G…, B…). */
  paleta: Uint16Array | null;
  nodata: number | null;
  geo: GeoDoTiff | null;
}

export interface GeoDoTiff {
  /** Afim pixel → coordenada do modelo, no formato do world file: x = a·col + b·lin + c ; y = d·col + e·lin + f. Pixel (0,0) = CANTO superior esquerdo. */
  afim: [number, number, number, number, number, number];
  /** 1 = projetado, 2 = geográfico (GTModelTypeGeoKey). */
  modelo: number | null;
  /** EPSG do sistema projetado (ProjectedCSTypeGeoKey) ou geográfico (GeographicTypeGeoKey). */
  epsg: number | null;
  /** O texto que o GDAL grava em GeoAsciiParams ("SIRGAS 2000 / UTM zone 23S|…"). */
  citacao: string | null;
  pixelEhPonto: boolean;
}

export class TiffNaoSuportado extends Error {}

const TIPO_TAMANHO: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

interface Entrada {
  tipo: number;
  n: number;
  offset: number;
}

class Leitor {
  readonly v: DataView;
  constructor(
    readonly b: Uint8Array,
    readonly le: boolean,
  ) {
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u16(o: number) {
    return this.v.getUint16(o, this.le);
  }
  u32(o: number) {
    return this.v.getUint32(o, this.le);
  }
  valores(e: Entrada): number[] {
    const out: number[] = [];
    const t = e.tipo;
    for (let i = 0; i < e.n; i++) {
      const o = e.offset + i * (TIPO_TAMANHO[t] ?? 1);
      if (t === 1 || t === 7) out.push(this.v.getUint8(o));
      else if (t === 6) out.push(this.v.getInt8(o));
      else if (t === 3) out.push(this.v.getUint16(o, this.le));
      else if (t === 8) out.push(this.v.getInt16(o, this.le));
      else if (t === 4) out.push(this.v.getUint32(o, this.le));
      else if (t === 9) out.push(this.v.getInt32(o, this.le));
      else if (t === 5) out.push(this.v.getUint32(o, this.le) / (this.v.getUint32(o + 4, this.le) || 1));
      else if (t === 10) out.push(this.v.getInt32(o, this.le) / (this.v.getInt32(o + 4, this.le) || 1));
      else if (t === 11) out.push(this.v.getFloat32(o, this.le));
      else if (t === 12) out.push(this.v.getFloat64(o, this.le));
      else out.push(this.v.getUint8(o));
    }
    return out;
  }
  texto(e: Entrada): string {
    let s = '';
    for (let i = 0; i < e.n; i++) {
      const c = this.v.getUint8(e.offset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
}

// ── Descompressão ────────────────────────────────────────────────────────────

/** LZW do TIFF: códigos MSB-first, 9 a 12 bits, troca de largura "adiantada" (early change). */
export function descomprimirLzw(entrada: Uint8Array, tamanhoEsperado: number): Uint8Array {
  const saida = new Uint8Array(tamanhoEsperado);
  let pos = 0;
  let bitPos = 0;
  const totalBits = entrada.length * 8;
  let largura = 9;
  let dicionario: Uint8Array[] = [];
  const reiniciar = () => {
    dicionario = [];
    for (let i = 0; i < 256; i++) dicionario.push(Uint8Array.of(i));
    dicionario.push(new Uint8Array(0), new Uint8Array(0)); // 256 clear, 257 EOI
    largura = 9;
  };
  const ler = (): number => {
    if (bitPos + largura > totalBits) return 257;
    let v = 0;
    for (let i = 0; i < largura; i++) {
      const byte = entrada[(bitPos + i) >> 3];
      v = (v << 1) | ((byte >> (7 - ((bitPos + i) & 7))) & 1);
    }
    bitPos += largura;
    return v;
  };
  const escrever = (s: Uint8Array) => {
    const n = Math.min(s.length, saida.length - pos);
    saida.set(n === s.length ? s : s.subarray(0, n), pos);
    pos += n;
  };
  reiniciar();
  let anterior: Uint8Array | null = null;
  for (;;) {
    const c = ler();
    if (c === 257) break;
    if (c === 256) {
      reiniciar();
      anterior = null;
      continue;
    }
    let atual: Uint8Array;
    if (c < dicionario.length) {
      atual = dicionario[c];
      if (anterior) {
        const novo = new Uint8Array(anterior.length + 1);
        novo.set(anterior);
        novo[anterior.length] = atual[0];
        dicionario.push(novo);
      }
    } else if (anterior) {
      atual = new Uint8Array(anterior.length + 1);
      atual.set(anterior);
      atual[anterior.length] = anterior[0];
      dicionario.push(atual);
    } else {
      throw new TiffNaoSuportado('LZW corrompido: código fora do dicionário no início da faixa.');
    }
    escrever(atual);
    anterior = atual;
    // Early change: a largura sobe quando o PRÓXIMO código já não cabe.
    if (dicionario.length + 1 >= 1 << largura && largura < 12) largura++;
    if (pos >= saida.length) break;
  }
  return saida;
}

function descomprimirPackBits(entrada: Uint8Array, tamanhoEsperado: number): Uint8Array {
  const saida = new Uint8Array(tamanhoEsperado);
  let i = 0;
  let o = 0;
  while (i < entrada.length && o < saida.length) {
    const n = (entrada[i++] << 24) >> 24;
    if (n >= 0) {
      for (let k = 0; k <= n && o < saida.length; k++) saida[o++] = entrada[i++];
    } else if (n !== -128) {
      const b = entrada[i++];
      for (let k = 0; k < 1 - n && o < saida.length; k++) saida[o++] = b;
    }
  }
  return saida;
}

async function descomprimirDeflate(entrada: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new TiffNaoSuportado('Este navegador não descomprime Deflate (DecompressionStream). Use um navegador atual ou um TIFF sem compressão/LZW.');
  }
  const fluxo = new Blob([entrada as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

// ── Preditores ───────────────────────────────────────────────────────────────

/** Preditor 2: soma acumulada por amostra ao longo da linha (no endian do ARQUIVO). */
function desfazerPreditor2(bloco: Uint8Array, larguraBloco: number, linhas: number, spp: number, bytes: number, le: boolean) {
  const v = new DataView(bloco.buffer, bloco.byteOffset, bloco.byteLength);
  const passo = larguraBloco * spp;
  for (let l = 0; l < linhas; l++) {
    const base = l * passo;
    for (let i = spp; i < passo; i++) {
      const a = (base + i) * bytes;
      const b = (base + i - spp) * bytes;
      if (a + bytes > bloco.length) return;
      if (bytes === 1) bloco[a] = (bloco[a] + bloco[b]) & 0xff;
      else if (bytes === 2) v.setUint16(a, (v.getUint16(a, le) + v.getUint16(b, le)) & 0xffff, le);
      else if (bytes === 4) v.setUint32(a, (v.getUint32(a, le) + v.getUint32(b, le)) >>> 0, le);
    }
  }
}

/**
 * Preditor 3 (ponto flutuante, Adobe TN 3): cada linha guarda os bytes
 * separados por significância (todos os mais significativos, depois os
 * seguintes…) e diferenciados byte a byte. Desfaz a diferença e remonta no
 * endian do arquivo.
 */
function desfazerPreditor3(bloco: Uint8Array, larguraBloco: number, linhas: number, spp: number, bytes: number, le: boolean) {
  const porLinha = larguraBloco * spp * bytes;
  const tmp = new Uint8Array(porLinha);
  const n = larguraBloco * spp;
  for (let l = 0; l < linhas; l++) {
    const base = l * porLinha;
    if (base + porLinha > bloco.length) return;
    for (let i = 1; i < porLinha; i++) bloco[base + i] = (bloco[base + i] + bloco[base + i - 1]) & 0xff;
    tmp.set(bloco.subarray(base, base + porLinha));
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < bytes; k++) {
        // k = 0 é o byte MAIS significativo.
        const destino = le ? bytes - 1 - k : k;
        bloco[base + i * bytes + destino] = tmp[k * n + i];
      }
    }
  }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function lerTiff(dados: ArrayBuffer | Uint8Array): Promise<Tiff> {
  const b = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  if (b.length < 8) throw new TiffNaoSuportado('Arquivo curto demais para ser TIFF.');
  const ordem = String.fromCharCode(b[0], b[1]);
  if (ordem !== 'II' && ordem !== 'MM') throw new TiffNaoSuportado('Não é um TIFF (o cabeçalho não começa com II nem MM).');
  const r = new Leitor(b, ordem === 'II');
  const magico = r.u16(2);
  if (magico === 43) throw new TiffNaoSuportado('BigTIFF não é lido aqui. Converta para TIFF clássico (gdal_translate sem -co BIGTIFF=YES) ou recorte a área do lote.');
  if (magico !== 42) throw new TiffNaoSuportado('Não é um TIFF (número mágico diferente de 42).');
  const ifd = r.u32(4);
  const n = r.u16(ifd);
  const tags = new Map<number, Entrada>();
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12;
    const tag = r.u16(o);
    const tipo = r.u16(o + 2);
    const cont = r.u32(o + 4);
    const tamanho = (TIPO_TAMANHO[tipo] ?? 1) * cont;
    tags.set(tag, { tipo, n: cont, offset: tamanho <= 4 ? o + 8 : r.u32(o + 8) });
  }
  const um = (tag: number, padrao?: number): number => {
    const e = tags.get(tag);
    if (!e) {
      if (padrao === undefined) throw new TiffNaoSuportado(`TIFF sem a tag ${tag}.`);
      return padrao;
    }
    return r.valores(e)[0];
  };
  const varios = (tag: number): number[] | null => {
    const e = tags.get(tag);
    return e ? r.valores(e) : null;
  };

  const largura = um(256);
  const altura = um(257);
  const spp = um(277, 1);
  const bits = (varios(258) ?? [1])[0];
  const compressao = um(259, 1);
  const fotometrica = um(262, 1);
  const planar = um(284, 1);
  const preditor = um(317, 1);
  const formato = (um(339, bits === 32 || bits === 64 ? 1 : 1) as 1 | 2 | 3) || 1;

  if (planar !== 1) throw new TiffNaoSuportado('TIFF com bandas SEPARADAS (planar) não é lido. Converta com gdal_translate -co INTERLEAVE=PIXEL.');
  if (![1, 5, 8, 32946, 32773].includes(compressao)) {
    const nome = compressao === 7 ? 'JPEG' : compressao === 50001 ? 'WebP' : compressao === 34887 ? 'LERC' : `código ${compressao}`;
    throw new TiffNaoSuportado(`Compressão ${nome} dentro do TIFF não é lida. Converta com gdal_translate -co COMPRESS=DEFLATE (ou LZW).`);
  }
  if (![8, 16, 32, 64].includes(bits)) throw new TiffNaoSuportado(`${bits} bits por amostra não é lido (só 8, 16, 32 e 64).`);
  if (largura * altura > 120_000_000) throw new TiffNaoSuportado(`Imagem de ${largura} × ${altura} pixels é grande demais para o navegador. Recorte a área do lote antes.`);

  const bytes = bits / 8;
  const saidaBytes = new Uint8Array(largura * altura * spp * bytes);
  const porPixel = spp * bytes;

  const emBlocos = tags.has(322);
  const larguraBloco = emBlocos ? um(322) : largura;
  const alturaBloco = emBlocos ? um(323) : um(278, altura);
  const offsets = varios(emBlocos ? 324 : 273) ?? [];
  const contagens = varios(emBlocos ? 325 : 279) ?? [];
  const blocosPorLinha = Math.ceil(largura / larguraBloco);

  for (let k = 0; k < offsets.length; k++) {
    const bruto = b.subarray(offsets[k], offsets[k] + (contagens[k] ?? 0));
    const linhasDoBloco = emBlocos ? alturaBloco : Math.min(alturaBloco, altura - k * alturaBloco);
    if (linhasDoBloco <= 0) continue;
    const esperado = larguraBloco * linhasDoBloco * porPixel;
    let bloco: Uint8Array;
    if (compressao === 1) bloco = bruto.slice(0, esperado);
    else if (compressao === 5) bloco = descomprimirLzw(bruto, esperado);
    else if (compressao === 32773) bloco = descomprimirPackBits(bruto, esperado);
    else bloco = await descomprimirDeflate(bruto);
    if (bloco.length < esperado) {
      const cheio = new Uint8Array(esperado);
      cheio.set(bloco);
      bloco = cheio;
    }
    if (preditor === 2) desfazerPreditor2(bloco, larguraBloco, linhasDoBloco, spp, bytes, r.le);
    else if (preditor === 3) desfazerPreditor3(bloco, larguraBloco, linhasDoBloco, spp, bytes, r.le);
    const x0 = emBlocos ? (k % blocosPorLinha) * larguraBloco : 0;
    const y0 = emBlocos ? Math.floor(k / blocosPorLinha) * alturaBloco : k * alturaBloco;
    const colunasUteis = Math.min(larguraBloco, largura - x0);
    for (let l = 0; l < linhasDoBloco; l++) {
      const y = y0 + l;
      if (y >= altura) break;
      const de = l * larguraBloco * porPixel;
      saidaBytes.set(bloco.subarray(de, de + colunasUteis * porPixel), (y * largura + x0) * porPixel);
    }
  }

  // Amostras no endian da MÁQUINA.
  const total = largura * altura * spp;
  const v = new DataView(saidaBytes.buffer);
  let amostras: Tiff['amostras'];
  if (formato === 3) {
    amostras = bits === 32 ? new Float32Array(total) : new Float64Array(total);
    for (let i = 0; i < total; i++) amostras[i] = bits === 32 ? v.getFloat32(i * 4, r.le) : v.getFloat64(i * 8, r.le);
  } else if (bits === 8) {
    amostras = formato === 2 ? new Int8Array(saidaBytes.buffer) : saidaBytes;
  } else if (bits === 16) {
    amostras = formato === 2 ? new Int16Array(total) : new Uint16Array(total);
    for (let i = 0; i < total; i++) amostras[i] = formato === 2 ? v.getInt16(i * 2, r.le) : v.getUint16(i * 2, r.le);
  } else if (bits === 32) {
    amostras = formato === 2 ? new Int32Array(total) : new Uint32Array(total);
    for (let i = 0; i < total; i++) amostras[i] = formato === 2 ? v.getInt32(i * 4, r.le) : v.getUint32(i * 4, r.le);
  } else {
    throw new TiffNaoSuportado('Inteiro de 64 bits não é lido.');
  }

  const paletaV = varios(320);
  const nodataTxt = tags.get(42113) ? r.texto(tags.get(42113)!).trim() : '';
  const nodata = nodataTxt !== '' && Number.isFinite(Number(nodataTxt)) ? Number(nodataTxt) : null;

  return {
    largura,
    altura,
    amostrasPorPixel: spp,
    bitsPorAmostra: bits,
    formatoDaAmostra: formato,
    fotometrica,
    amostras,
    paleta: paletaV ? Uint16Array.from(paletaV) : null,
    nodata,
    geo: lerGeo(r, tags),
  };
}

function lerGeo(r: Leitor, tags: Map<number, Entrada>): GeoDoTiff | null {
  const escala = tags.get(33550) ? r.valores(tags.get(33550)!) : null;
  const pontos = tags.get(33922) ? r.valores(tags.get(33922)!) : null;
  const transf = tags.get(34264) ? r.valores(tags.get(34264)!) : null;
  let modelo: number | null = null;
  let epsg: number | null = null;
  let pixelEhPonto = false;
  let citacao: string | null = null;
  const dir = tags.get(34735) ? r.valores(tags.get(34735)!) : null;
  const ascii = tags.get(34737) ? r.texto({ ...tags.get(34737)!, n: tags.get(34737)!.n }) : '';
  if (dir && dir.length >= 4) {
    const nChaves = dir[3];
    let geografico: number | null = null;
    let projetado: number | null = null;
    for (let i = 0; i < nChaves; i++) {
      const [id, local, cont, valor] = dir.slice(4 + i * 4, 8 + i * 4);
      if (local === 34737 && (id === 1026 || id === 3073 || id === 2049)) {
        const t = ascii.slice(valor, valor + cont).replace(/\|$/, '');
        if (t && !citacao) citacao = t;
        continue;
      }
      if (local !== 0) continue;
      if (id === 1024) modelo = valor;
      else if (id === 1025) pixelEhPonto = valor === 2;
      else if (id === 2048) geografico = valor;
      else if (id === 3072) projetado = valor;
    }
    epsg = (modelo === 2 ? geografico : projetado ?? geografico) ?? null;
    if (epsg === 32767) epsg = null; // "user-defined"
  }
  let afim: GeoDoTiff['afim'] | null = null;
  if (transf && transf.length >= 16) {
    afim = [transf[0], transf[1], transf[3], transf[4], transf[5], transf[7]];
  } else if (escala && pontos && pontos.length >= 6) {
    const [i, j, , x, y] = pontos;
    const sx = escala[0];
    const sy = escala[1];
    afim = [sx, 0, x - i * sx, 0, -sy, y + j * sy];
  }
  if (!afim) return null;
  if (pixelEhPonto) {
    // A coordenada é do CENTRO do pixel: leva para o canto.
    afim = [afim[0], afim[1], afim[2] - (afim[0] + afim[1]) / 2, afim[3], afim[4], afim[5] - (afim[3] + afim[4]) / 2];
  }
  return { afim, modelo, epsg, citacao, pixelEhPonto };
}
