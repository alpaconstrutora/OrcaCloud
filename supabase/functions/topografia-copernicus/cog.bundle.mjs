// GERADO por scripts/build-topografia-copernicus.mjs — não editar. Leitor de COG (utils/geo/cog.ts) para a Edge Function topografia-copernicus.

// utils/geo/tiff.ts
var TiffNaoSuportado = class extends Error {
};
var TIPO_TAMANHO = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
var Leitor = class {
  constructor(b, le) {
    this.b = b;
    this.le = le;
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u16(o) {
    return this.v.getUint16(o, this.le);
  }
  u32(o) {
    return this.v.getUint32(o, this.le);
  }
  valores(e) {
    const out = [];
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
  texto(e) {
    let s = "";
    for (let i = 0; i < e.n; i++) {
      const c = this.v.getUint8(e.offset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
};
function descomprimirLzw(entrada, tamanhoEsperado) {
  const saida = new Uint8Array(tamanhoEsperado);
  let pos = 0;
  let bitPos = 0;
  const totalBits = entrada.length * 8;
  let largura = 9;
  let dicionario = [];
  const reiniciar = () => {
    dicionario = [];
    for (let i = 0; i < 256; i++) dicionario.push(Uint8Array.of(i));
    dicionario.push(new Uint8Array(0), new Uint8Array(0));
    largura = 9;
  };
  const ler = () => {
    if (bitPos + largura > totalBits) return 257;
    let v = 0;
    for (let i = 0; i < largura; i++) {
      const byte = entrada[bitPos + i >> 3];
      v = v << 1 | byte >> 7 - (bitPos + i & 7) & 1;
    }
    bitPos += largura;
    return v;
  };
  const escrever = (s) => {
    const n = Math.min(s.length, saida.length - pos);
    saida.set(n === s.length ? s : s.subarray(0, n), pos);
    pos += n;
  };
  reiniciar();
  let anterior = null;
  for (; ; ) {
    const c = ler();
    if (c === 257) break;
    if (c === 256) {
      reiniciar();
      anterior = null;
      continue;
    }
    let atual;
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
      throw new TiffNaoSuportado("LZW corrompido: c\xF3digo fora do dicion\xE1rio no in\xEDcio da faixa.");
    }
    escrever(atual);
    anterior = atual;
    if (dicionario.length + 1 >= 1 << largura && largura < 12) largura++;
    if (pos >= saida.length) break;
  }
  return saida;
}
function descomprimirPackBits(entrada, tamanhoEsperado) {
  const saida = new Uint8Array(tamanhoEsperado);
  let i = 0;
  let o = 0;
  while (i < entrada.length && o < saida.length) {
    const n = entrada[i++] << 24 >> 24;
    if (n >= 0) {
      for (let k = 0; k <= n && o < saida.length; k++) saida[o++] = entrada[i++];
    } else if (n !== -128) {
      const b = entrada[i++];
      for (let k = 0; k < 1 - n && o < saida.length; k++) saida[o++] = b;
    }
  }
  return saida;
}
async function descomprimirDeflate(entrada) {
  if (typeof DecompressionStream !== "function") {
    throw new TiffNaoSuportado("Este navegador n\xE3o descomprime Deflate (DecompressionStream). Use um navegador atual ou um TIFF sem compress\xE3o/LZW.");
  }
  const fluxo = new Blob([entrada]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}
function desfazerPreditor2(bloco, larguraBloco, linhas, spp, bytes, le) {
  const v = new DataView(bloco.buffer, bloco.byteOffset, bloco.byteLength);
  const passo = larguraBloco * spp;
  for (let l = 0; l < linhas; l++) {
    const base = l * passo;
    for (let i = spp; i < passo; i++) {
      const a = (base + i) * bytes;
      const b = (base + i - spp) * bytes;
      if (a + bytes > bloco.length) return;
      if (bytes === 1) bloco[a] = bloco[a] + bloco[b] & 255;
      else if (bytes === 2) v.setUint16(a, v.getUint16(a, le) + v.getUint16(b, le) & 65535, le);
      else if (bytes === 4) v.setUint32(a, v.getUint32(a, le) + v.getUint32(b, le) >>> 0, le);
    }
  }
}
function desfazerPreditor3(bloco, larguraBloco, linhas, spp, bytes, le) {
  const porLinha = larguraBloco * spp * bytes;
  const tmp = new Uint8Array(porLinha);
  const n = larguraBloco * spp;
  for (let l = 0; l < linhas; l++) {
    const base = l * porLinha;
    if (base + porLinha > bloco.length) return;
    for (let i = 1; i < porLinha; i++) bloco[base + i] = bloco[base + i] + bloco[base + i - 1] & 255;
    tmp.set(bloco.subarray(base, base + porLinha));
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < bytes; k++) {
        const destino = le ? bytes - 1 - k : k;
        bloco[base + i * bytes + destino] = tmp[k * n + i];
      }
    }
  }
}
function lerCabecalhoTiff(b) {
  if (b.length < 8) throw new TiffNaoSuportado("Arquivo curto demais para ser TIFF.");
  const ordem = String.fromCharCode(b[0], b[1]);
  if (ordem !== "II" && ordem !== "MM") throw new TiffNaoSuportado("N\xE3o \xE9 um TIFF (o cabe\xE7alho n\xE3o come\xE7a com II nem MM).");
  const r = new Leitor(b, ordem === "II");
  const magico = r.u16(2);
  if (magico === 43) throw new TiffNaoSuportado("BigTIFF n\xE3o \xE9 lido aqui. Converta para TIFF cl\xE1ssico (gdal_translate sem -co BIGTIFF=YES) ou recorte a \xE1rea do lote.");
  if (magico !== 42) throw new TiffNaoSuportado("N\xE3o \xE9 um TIFF (n\xFAmero m\xE1gico diferente de 42).");
  const ifd = r.u32(4);
  const n = r.u16(ifd);
  const tags = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12;
    const tag = r.u16(o);
    const tipo = r.u16(o + 2);
    const cont = r.u32(o + 4);
    const tamanho = (TIPO_TAMANHO[tipo] ?? 1) * cont;
    const offset = tamanho <= 4 ? o + 8 : r.u32(o + 8);
    if (offset + tamanho > b.length) throw new RangeError(`tag ${tag} al\xE9m do trecho lido (${offset + tamanho} > ${b.length})`);
    tags.set(tag, { tipo, n: cont, offset });
  }
  const um = (tag, padrao) => {
    const e = tags.get(tag);
    if (!e) {
      if (padrao === void 0) throw new TiffNaoSuportado(`TIFF sem a tag ${tag}.`);
      return padrao;
    }
    return r.valores(e)[0];
  };
  const varios = (tag) => {
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
  const formato = um(339, bits === 32 || bits === 64 ? 1 : 1) || 1;
  if (planar !== 1) throw new TiffNaoSuportado("TIFF com bandas SEPARADAS (planar) n\xE3o \xE9 lido. Converta com gdal_translate -co INTERLEAVE=PIXEL.");
  if (![1, 5, 8, 32946, 32773].includes(compressao)) {
    const nome = compressao === 7 ? "JPEG" : compressao === 50001 ? "WebP" : compressao === 34887 ? "LERC" : `c\xF3digo ${compressao}`;
    throw new TiffNaoSuportado(`Compress\xE3o ${nome} dentro do TIFF n\xE3o \xE9 lida. Converta com gdal_translate -co COMPRESS=DEFLATE (ou LZW).`);
  }
  if (![8, 16, 32, 64].includes(bits)) throw new TiffNaoSuportado(`${bits} bits por amostra n\xE3o \xE9 lido (s\xF3 8, 16, 32 e 64).`);
  const emBlocos = tags.has(322);
  const paletaV = varios(320);
  const nodataTxt = tags.get(42113) ? r.texto(tags.get(42113)).trim() : "";
  return {
    le: r.le,
    largura,
    altura,
    amostrasPorPixel: spp,
    bitsPorAmostra: bits,
    formatoDaAmostra: formato,
    fotometrica,
    compressao,
    preditor,
    emBlocos,
    larguraBloco: emBlocos ? um(322) : largura,
    alturaBloco: emBlocos ? um(323) : um(278, altura),
    offsets: varios(emBlocos ? 324 : 273) ?? [],
    contagens: varios(emBlocos ? 325 : 279) ?? [],
    paleta: paletaV ? Uint16Array.from(paletaV) : null,
    nodata: nodataTxt !== "" && Number.isFinite(Number(nodataTxt)) ? Number(nodataTxt) : null,
    geo: lerGeo(r, tags)
  };
}
function linhasDoBloco(c, k) {
  return c.emBlocos ? c.alturaBloco : Math.min(c.alturaBloco, c.altura - k * c.alturaBloco);
}
async function decodificarBloco(c, bruto, linhas) {
  const bytes = c.bitsPorAmostra / 8;
  const spp = c.amostrasPorPixel;
  const esperado = c.larguraBloco * linhas * spp * bytes;
  let bloco;
  if (c.compressao === 1) bloco = bruto.slice(0, esperado);
  else if (c.compressao === 5) bloco = descomprimirLzw(bruto, esperado);
  else if (c.compressao === 32773) bloco = descomprimirPackBits(bruto, esperado);
  else bloco = await descomprimirDeflate(bruto);
  if (bloco.length < esperado) {
    const cheio = new Uint8Array(esperado);
    cheio.set(bloco);
    bloco = cheio;
  }
  if (c.preditor === 2) desfazerPreditor2(bloco, c.larguraBloco, linhas, spp, bytes, c.le);
  else if (c.preditor === 3) desfazerPreditor3(bloco, c.larguraBloco, linhas, spp, bytes, c.le);
  return bloco;
}
function lerGeo(r, tags) {
  const escala = tags.get(33550) ? r.valores(tags.get(33550)) : null;
  const pontos = tags.get(33922) ? r.valores(tags.get(33922)) : null;
  const transf = tags.get(34264) ? r.valores(tags.get(34264)) : null;
  let modelo = null;
  let epsg = null;
  let pixelEhPonto = false;
  let citacao = null;
  const dir = tags.get(34735) ? r.valores(tags.get(34735)) : null;
  const ascii = tags.get(34737) ? r.texto({ ...tags.get(34737), n: tags.get(34737).n }) : "";
  if (dir && dir.length >= 4) {
    const nChaves = dir[3];
    let geografico = null;
    let projetado = null;
    for (let i = 0; i < nChaves; i++) {
      const [id, local, cont, valor] = dir.slice(4 + i * 4, 8 + i * 4);
      if (local === 34737 && (id === 1026 || id === 3073 || id === 2049)) {
        const t = ascii.slice(valor, valor + cont).replace(/\|$/, "");
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
    if (epsg === 32767) epsg = null;
  }
  let afim = null;
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
    afim = [afim[0], afim[1], afim[2] - (afim[0] + afim[1]) / 2, afim[3], afim[4], afim[5] - (afim[3] + afim[4]) / 2];
  }
  return { afim, modelo, epsg, citacao, pixelEhPonto };
}

// utils/geo/cog.ts
var URL_COPERNICUS_GLO30 = "https://copernicus-dem-30m.s3.amazonaws.com";
var dois = (n) => String(Math.abs(n)).padStart(2, "0");
var tres = (n) => String(Math.abs(n)).padStart(3, "0");
function nomeCopernicus(latSul, lonOeste) {
  const ns = latSul < 0 ? `S${dois(latSul)}` : `N${dois(latSul)}`;
  const ew = lonOeste < 0 ? `W${tres(lonOeste)}` : `E${tres(lonOeste)}`;
  return `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;
}
function urlCopernicus(latSul, lonOeste) {
  const nome = nomeCopernicus(latSul, lonOeste);
  return `${URL_COPERNICUS_GLO30}/${nome}/${nome}.tif`;
}
function quadriculaDe(lat, lon) {
  return { latSul: Math.ceil(lat) - 1, lonOeste: Math.floor(lon) };
}
var TRECHO_INICIAL = 64 * 1024;
var TRECHO_MAXIMO = 16 * 1024 * 1024;
var ArquivoCog = class {
  constructor(url, lerFaixa, trechoInicial = TRECHO_INICIAL) {
    this.url = url;
    this.lerFaixa = lerFaixa;
    this.trechoInicial = trechoInicial;
    this.cab = null;
    this.blocos = /* @__PURE__ */ new Map();
  }
  /** `null` = o arquivo não existe. */
  cabecalho() {
    if (!this.cab) {
      this.cab = this.lerCabecalho();
      this.cab.catch(() => {
        this.cab = null;
      });
    }
    return this.cab;
  }
  async lerCabecalho() {
    for (let n = this.trechoInicial; ; n *= 2) {
      const b = await this.lerFaixa(this.url, 0, n - 1);
      if (!b) return null;
      try {
        return lerCabecalhoTiff(b);
      } catch (e) {
        const curto = e instanceof RangeError;
        if (!curto || b.length < n || n >= TRECHO_MAXIMO) {
          if (curto) throw new TiffNaoSuportado(`O cabe\xE7alho de ${this.url} n\xE3o coube em ${b.length} bytes.`);
          throw e;
        }
      }
    }
  }
  /** Cota do pixel (coluna `i`, linha `j`). Fora do arquivo, nodata ou NaN → `null`. */
  async valor(i, j) {
    const c = await this.cabecalho();
    if (!c) return null;
    if (i < 0 || j < 0 || i >= c.largura || j >= c.altura) return null;
    const bx = Math.floor(i / c.larguraBloco);
    const by = Math.floor(j / c.alturaBloco);
    const k = c.emBlocos ? by * Math.ceil(c.largura / c.larguraBloco) + bx : by;
    const amostras = await this.bloco(c, k);
    const v = amostras[(j - by * c.alturaBloco) * c.larguraBloco + (i - bx * c.larguraBloco)];
    if (v === void 0 || !Number.isFinite(v)) return null;
    if (c.nodata !== null && v === c.nodata) return null;
    return v;
  }
  bloco(c, k) {
    let p = this.blocos.get(k);
    if (!p) {
      p = this.lerBloco(c, k);
      this.blocos.set(k, p);
      p.catch(() => this.blocos.delete(k));
    }
    return p;
  }
  async lerBloco(c, k) {
    if (c.amostrasPorPixel !== 1) throw new TiffNaoSuportado("Modelo de eleva\xE7\xE3o com mais de uma banda n\xE3o \xE9 lido.");
    const inicio = c.offsets[k];
    const n = c.contagens[k] ?? 0;
    if (inicio === void 0 || n <= 0) throw new TiffNaoSuportado(`Bloco ${k} ausente em ${this.url}.`);
    const bruto = await this.lerFaixa(this.url, inicio, inicio + n - 1);
    if (!bruto) throw new TiffNaoSuportado(`Bloco ${k} de ${this.url} n\xE3o foi encontrado.`);
    const linhas = linhasDoBloco(c, k);
    const bytes = await decodificarBloco(c, bruto.subarray(0, n), linhas);
    const total = c.larguraBloco * linhas;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tam = c.bitsPorAmostra / 8;
    const saida = c.bitsPorAmostra === 64 ? new Float64Array(total) : new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const o = i * tam;
      saida[i] = c.formatoDaAmostra === 3 ? tam === 4 ? v.getFloat32(o, c.le) : v.getFloat64(o, c.le) : tam === 2 ? c.formatoDaAmostra === 2 ? v.getInt16(o, c.le) : v.getUint16(o, c.le) : tam === 4 ? c.formatoDaAmostra === 2 ? v.getInt32(o, c.le) : v.getUint32(o, c.le) : c.formatoDaAmostra === 2 ? v.getInt8(o) : v.getUint8(o);
    }
    return saida;
  }
};
var MAX_ARQUIVOS_ABERTOS = 8;
var AmostradorCog = class _AmostradorCog {
  constructor(lerFaixa, urlDaQuadricula = urlCopernicus, trechoInicial = TRECHO_INICIAL) {
    this.lerFaixa = lerFaixa;
    this.urlDaQuadricula = urlDaQuadricula;
    this.trechoInicial = trechoInicial;
    this.arquivos = /* @__PURE__ */ new Map();
  }
  arquivo(latSul, lonOeste) {
    if (latSul < -90 || latSul >= 90) return null;
    const lon = lonOeste >= 180 ? lonOeste - 360 : lonOeste < -180 ? lonOeste + 360 : lonOeste;
    const chave = `${latSul}|${lon}`;
    let a = this.arquivos.get(chave);
    if (a) {
      this.arquivos.delete(chave);
      this.arquivos.set(chave, a);
      return a;
    }
    a = new ArquivoCog(this.urlDaQuadricula(latSul, lon), this.lerFaixa, this.trechoInicial);
    this.arquivos.set(chave, a);
    while (this.arquivos.size > MAX_ARQUIVOS_ABERTOS) this.arquivos.delete(this.arquivos.keys().next().value);
    return a;
  }
  /** Índice FRACIONÁRIO do ponto no arquivo, medido entre CENTROS de pixel. */
  static indice(c, lat, lon) {
    const g = c.geo;
    if (!g || g.afim[1] !== 0 || g.afim[3] !== 0) return null;
    const [a, , cx, , e, f] = g.afim;
    return { u: (lon - cx) / a - 0.5, v: (lat - f) / e - 0.5 };
  }
  /**
   * Cota do centro de pixel (i, j) do arquivo `q`. Índice que transborda vai ao
   * arquivo vizinho na direção do transbordo, e lá o índice é recalculado pela
   * coordenada do centro (a largura muda nas faixas de latitude alta).
   */
  async centro(q, c, i, j) {
    const dLat = j < 0 ? 1 : j >= c.altura ? -1 : 0;
    const dLon = i < 0 ? -1 : i >= c.largura ? 1 : 0;
    const proprio = this.arquivo(q.latSul, q.lonOeste);
    if (!proprio) return null;
    if (dLat === 0 && dLon === 0) return proprio.valor(i, j);
    const [a, , cx, , e, f] = c.geo.afim;
    const lonC = cx + a * (i + 0.5);
    const latC = f + e * (j + 0.5);
    const viz = this.arquivo(q.latSul + dLat, q.lonOeste + dLon);
    if (!viz) return null;
    const cv = await viz.cabecalho();
    if (!cv) return null;
    const ix = _AmostradorCog.indice(cv, latC, lonC);
    if (!ix) return null;
    return viz.valor(Math.round(ix.u), Math.round(ix.v));
  }
  /** Cota bilinear em cada coordenada, na mesma ordem. */
  async cotas(coordenadas) {
    return Promise.all(coordenadas.map((p) => this.cota(p)));
  }
  async cota(p) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
    const q = quadriculaDe(p.lat, p.lon);
    const arq = this.arquivo(q.latSul, q.lonOeste);
    if (!arq) return null;
    const c = await arq.cabecalho();
    if (!c) return null;
    const ix = _AmostradorCog.indice(c, p.lat, p.lon);
    if (!ix) throw new TiffNaoSuportado(`${arq.url} n\xE3o \xE9 um GeoTIFF norte-para-cima com georrefer\xEAncia.`);
    const i0 = Math.floor(ix.u);
    const j0 = Math.floor(ix.v);
    const fx = ix.u - i0;
    const fy = ix.v - j0;
    const [z00, z10, z01, z11] = await Promise.all([
      this.centro(q, c, i0, j0),
      this.centro(q, c, i0 + 1, j0),
      this.centro(q, c, i0, j0 + 1),
      this.centro(q, c, i0 + 1, j0 + 1)
    ]);
    if (z00 === null || z10 === null || z01 === null || z11 === null) return null;
    const topo = z00 + (z10 - z00) * fx;
    const base = z01 + (z11 - z01) * fx;
    return topo + (base - topo) * fy;
  }
};
export {
  AmostradorCog,
  ArquivoCog,
  URL_COPERNICUS_GLO30,
  nomeCopernicus,
  quadriculaDe,
  urlCopernicus
};
