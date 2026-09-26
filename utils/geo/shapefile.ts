/**
 * SHAPEFILE e KMZ (A3) — leitura e escrita, próprias.
 *
 * Shapefile é o formato que CAR/SICAR, prefeitura e QGIS trocam. São quatro
 * arquivos com o mesmo nome: `.shp` (geometria), `.shx` (índice), `.dbf`
 * (atributos, dBase III) e `.prj` (o sistema de coordenadas, em WKT). Aqui eles
 * viajam num `.zip` (via `pizzip`, que o motor de .docx já usa).
 *
 * Tipos: Point, PolyLine, Polygon e as versões Z (11, 13, 15); a escrita usa
 * sempre Z — curva e ponto cotado têm cota, e quem não liga para Z a ignora.
 * Anel externo de polígono no sentido HORÁRIO (é a regra do formato; o QGIS
 * tolera o contrário, o ArcGIS não).
 *
 * Endianness do formato (e o motivo de o leitor ser à mão): o cabeçalho e o
 * cabeçalho de cada registro são BIG-endian; o conteúdo, LITTLE-endian.
 */
/** `pizzip` entra por import dinâmico, como em `blueprintExportService`: fica fora do pacote inicial. */
async function carregarZip() {
  return (await import('pizzip')).default;
}

export type TipoDeShape = 'PONTO' | 'LINHA' | 'POLIGONO';

export interface Vertice3 {
  x: number;
  y: number;
  z?: number;
}

export interface FeicaoShp {
  /** PONTO: uma parte com um vértice. LINHA: partes abertas. POLIGONO: anéis (o 1º é o externo). */
  partes: Vertice3[][];
  atributos: Record<string, string | number | null>;
}

export interface CamadaShp {
  nome: string;
  tipo: TipoDeShape;
  feicoes: FeicaoShp[];
  /** WKT do .prj; `null` = sem sistema (coordenadas locais). */
  prj: string | null;
}

const CODIGO: Record<TipoDeShape, number> = { PONTO: 11, LINHA: 13, POLIGONO: 15 };
const TIPO_DO_CODIGO: Record<number, TipoDeShape> = { 1: 'PONTO', 11: 'PONTO', 21: 'PONTO', 3: 'LINHA', 13: 'LINHA', 23: 'LINHA', 5: 'POLIGONO', 15: 'POLIGONO', 25: 'POLIGONO' };

function areaComSinal(anel: Vertice3[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Anel fechado (1º = último) e no sentido pedido: externo horário, furos anti-horários. */
function anelDoShape(anel: Vertice3[], externo: boolean): Vertice3[] {
  const aberto = anel.length > 1 && anel[0].x === anel[anel.length - 1].x && anel[0].y === anel[anel.length - 1].y ? anel.slice(0, -1) : [...anel];
  const horario = areaComSinal(aberto) < 0;
  const certo = externo === horario ? aberto : [...aberto].reverse();
  return [...certo, certo[0]];
}

// ── DBF ──────────────────────────────────────────────────────────────────────

interface CampoDbf {
  nome: string;
  tipo: 'C' | 'N';
  tamanho: number;
  decimais: number;
}

const codificador = new TextEncoder();

function camposDe(feicoes: FeicaoShp[]): CampoDbf[] {
  const campos = new Map<string, CampoDbf>();
  for (const f of feicoes) {
    for (const [k, v] of Object.entries(f.atributos)) {
      const nome = k.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10).toUpperCase();
      const atual = campos.get(nome);
      if (typeof v === 'number') {
        const txt = v.toFixed(3);
        const c = atual ?? { nome, tipo: 'N' as const, tamanho: 1, decimais: 3 };
        if (c.tipo === 'N') c.tamanho = Math.min(19, Math.max(c.tamanho, txt.length));
        campos.set(nome, c);
      } else {
        const bytes = codificador.encode(v ?? '').length;
        const c = atual && atual.tipo === 'C' ? atual : { nome, tipo: 'C' as const, tamanho: Math.max(1, atual?.tamanho ?? 1), decimais: 0 };
        c.tamanho = Math.min(254, Math.max(c.tamanho, bytes));
        campos.set(nome, c);
      }
    }
  }
  return [...campos.values()];
}

function valorDoCampo(f: FeicaoShp, campo: CampoDbf): string | number | null {
  for (const [k, v] of Object.entries(f.atributos)) {
    const nome = k.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10).toUpperCase();
    if (nome === campo.nome) return v;
  }
  return null;
}

function escreverDbf(feicoes: FeicaoShp[]): Uint8Array {
  const campos = camposDe(feicoes);
  const tamRegistro = 1 + campos.reduce((s, c) => s + c.tamanho, 0);
  const tamCabecalho = 32 + 32 * campos.length + 1;
  const buf = new Uint8Array(tamCabecalho + tamRegistro * feicoes.length + 1);
  const v = new DataView(buf.buffer);
  const hoje = new Date();
  buf[0] = 0x03;
  buf[1] = hoje.getFullYear() - 1900;
  buf[2] = hoje.getMonth() + 1;
  buf[3] = hoje.getDate();
  v.setUint32(4, feicoes.length, true);
  v.setUint16(8, tamCabecalho, true);
  v.setUint16(10, tamRegistro, true);
  buf[29] = 0x57; // "language driver" ANSI; a codificação real vai no .cpg (UTF-8)
  campos.forEach((c, i) => {
    const o = 32 + i * 32;
    buf.set(codificador.encode(c.nome), o);
    buf[o + 11] = c.tipo.charCodeAt(0);
    buf[o + 16] = c.tamanho;
    buf[o + 17] = c.decimais;
  });
  buf[tamCabecalho - 1] = 0x0d;
  feicoes.forEach((f, r) => {
    let o = tamCabecalho + r * tamRegistro;
    buf[o++] = 0x20;
    for (const c of campos) {
      const val = valorDoCampo(f, c);
      let txt: Uint8Array;
      if (c.tipo === 'N') {
        const s = typeof val === 'number' && Number.isFinite(val) ? val.toFixed(c.decimais) : '';
        txt = codificador.encode(s.padStart(c.tamanho, ' ').slice(-c.tamanho));
      } else {
        const bytes = codificador.encode(val === null || val === undefined ? '' : String(val));
        txt = new Uint8Array(c.tamanho).fill(0x20);
        txt.set(bytes.subarray(0, c.tamanho));
      }
      buf.set(txt, o);
      o += c.tamanho;
    }
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

function lerDbf(b: Uint8Array): Record<string, string | number | null>[] {
  if (b.length < 32) return [];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = v.getUint32(4, true);
  const tamCab = v.getUint16(8, true);
  const tamReg = v.getUint16(10, true);
  const campos: CampoDbf[] = [];
  for (let o = 32; o + 32 <= tamCab && b[o] !== 0x0d; o += 32) {
    let nome = '';
    for (let k = 0; k < 11 && b[o + k] !== 0; k++) nome += String.fromCharCode(b[o + k]);
    campos.push({ nome, tipo: String.fromCharCode(b[o + 11]) === 'N' || String.fromCharCode(b[o + 11]) === 'F' ? 'N' : 'C', tamanho: b[o + 16], decimais: b[o + 17] });
  }
  const dec = new TextDecoder('utf-8');
  const saida: Record<string, string | number | null>[] = [];
  for (let r = 0; r < n; r++) {
    let o = tamCab + r * tamReg + 1;
    const reg: Record<string, string | number | null> = {};
    for (const c of campos) {
      const t = dec.decode(b.subarray(o, o + c.tamanho)).trim();
      reg[c.nome] = c.tipo === 'N' ? (t === '' ? null : Number(t)) : t;
      o += c.tamanho;
    }
    saida.push(reg);
  }
  return saida;
}

// ── SHP / SHX ────────────────────────────────────────────────────────────────

function conteudoDoRegistro(tipo: TipoDeShape, f: FeicaoShp): Uint8Array {
  const partes =
    tipo === 'POLIGONO' ? f.partes.filter((p) => p.length >= 3).map((p, i) => anelDoShape(p, i === 0)) : tipo === 'LINHA' ? f.partes.filter((p) => p.length >= 2) : [f.partes[0]?.slice(0, 1) ?? []];
  const pts = partes.flat();
  if (tipo === 'PONTO') {
    const p = pts[0] ?? { x: 0, y: 0, z: 0 };
    const b = new Uint8Array(4 + 8 * 4);
    const v = new DataView(b.buffer);
    v.setInt32(0, CODIGO.PONTO, true);
    v.setFloat64(4, p.x, true);
    v.setFloat64(12, p.y, true);
    v.setFloat64(20, p.z ?? 0, true);
    v.setFloat64(28, 0, true); // M
    return b;
  }
  const n = pts.length;
  const np = partes.length;
  const tam = 4 + 32 + 4 + 4 + 4 * np + 16 * n + 16 + 8 * n + 16 + 8 * n;
  const b = new Uint8Array(tam);
  const v = new DataView(b.buffer);
  let o = 0;
  v.setInt32(o, CODIGO[tipo], true);
  o += 4;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const zs = pts.map((p) => p.z ?? 0);
  for (const x of [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]) {
    v.setFloat64(o, x, true);
    o += 8;
  }
  v.setInt32(o, np, true);
  v.setInt32(o + 4, n, true);
  o += 8;
  let inicio = 0;
  for (const p of partes) {
    v.setInt32(o, inicio, true);
    o += 4;
    inicio += p.length;
  }
  for (const p of pts) {
    v.setFloat64(o, p.x, true);
    v.setFloat64(o + 8, p.y, true);
    o += 16;
  }
  v.setFloat64(o, Math.min(...zs), true);
  v.setFloat64(o + 8, Math.max(...zs), true);
  o += 16;
  for (const z of zs) {
    v.setFloat64(o, z, true);
    o += 8;
  }
  // M: zeros (faixa e valores).
  return b;
}

function cabecalho(v: DataView, tipo: number, tamanhoEmPalavras: number, caixa: number[]) {
  v.setInt32(0, 9994, false);
  v.setInt32(24, tamanhoEmPalavras, false);
  v.setInt32(28, 1000, true);
  v.setInt32(32, tipo, true);
  caixa.forEach((x, i) => v.setFloat64(36 + i * 8, x, true));
}

export interface ArquivosShp {
  shp: Uint8Array;
  shx: Uint8Array;
  dbf: Uint8Array;
  prj: string | null;
  cpg: string;
}

export function escreverShapefile(c: CamadaShp): ArquivosShp {
  const registros = c.feicoes.map((f) => conteudoDoRegistro(c.tipo, f));
  const todos = c.feicoes.flatMap((f) => f.partes.flat());
  const xs = todos.map((p) => p.x);
  const ys = todos.map((p) => p.y);
  const zs = todos.map((p) => p.z ?? 0);
  const caixa = todos.length > 0 ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), Math.min(...zs), Math.max(...zs), 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0];
  const tamShp = 100 + registros.reduce((s, r) => s + 8 + r.length, 0);
  const shp = new Uint8Array(tamShp);
  const shx = new Uint8Array(100 + 8 * registros.length);
  const vs = new DataView(shp.buffer);
  const vx = new DataView(shx.buffer);
  cabecalho(vs, CODIGO[c.tipo], tamShp / 2, caixa);
  cabecalho(vx, CODIGO[c.tipo], shx.length / 2, caixa);
  let o = 100;
  registros.forEach((r, i) => {
    vx.setInt32(100 + i * 8, o / 2, false);
    vx.setInt32(104 + i * 8, r.length / 2, false);
    vs.setInt32(o, i + 1, false);
    vs.setInt32(o + 4, r.length / 2, false);
    shp.set(r, o + 8);
    o += 8 + r.length;
  });
  return { shp, shx, dbf: escreverDbf(c.feicoes), prj: c.prj, cpg: 'UTF-8' };
}

export function lerShp(shp: Uint8Array): { tipo: TipoDeShape | null; feicoes: Vertice3[][][] } {
  const v = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
  if (shp.length < 100 || v.getInt32(0, false) !== 9994) throw new Error('Não é um .shp (código de arquivo diferente de 9994).');
  const tipoArq = v.getInt32(32, true);
  const tipo = TIPO_DO_CODIGO[tipoArq] ?? null;
  if (!tipo && tipoArq !== 0) throw new Error(`Tipo de shape ${tipoArq} não é lido (só ponto, linha e polígono, com ou sem Z).`);
  const feicoes: Vertice3[][][] = [];
  let o = 100;
  const fim = Math.min(shp.length, v.getInt32(24, false) * 2);
  while (o + 8 <= fim) {
    const tam = v.getInt32(o + 4, false) * 2;
    const c = o + 8;
    const t = v.getInt32(c, true);
    const temZ = t === 11 || t === 13 || t === 15;
    if (t === 0) feicoes.push([]);
    else if (t === 1 || t === 11 || t === 21) {
      feicoes.push([[{ x: v.getFloat64(c + 4, true), y: v.getFloat64(c + 12, true), ...(temZ ? { z: v.getFloat64(c + 20, true) } : {}) }]]);
    } else {
      const np = v.getInt32(c + 36, true);
      const n = v.getInt32(c + 40, true);
      const partes: number[] = [];
      for (let i = 0; i < np; i++) partes.push(v.getInt32(c + 44 + i * 4, true));
      const pts0 = c + 44 + np * 4;
      const z0 = pts0 + 16 * n + 16;
      const vertices: Vertice3[] = [];
      for (let i = 0; i < n; i++) {
        vertices.push({ x: v.getFloat64(pts0 + i * 16, true), y: v.getFloat64(pts0 + i * 16 + 8, true), ...(temZ && z0 + i * 8 + 8 <= c + tam ? { z: v.getFloat64(z0 + i * 8, true) } : {}) });
      }
      feicoes.push(partes.map((ini, k) => vertices.slice(ini, k + 1 < partes.length ? partes[k + 1] : n)));
    }
    o += 8 + tam;
  }
  return { tipo, feicoes };
}

// ── ZIP ──────────────────────────────────────────────────────────────────────

/** Várias camadas num .zip só (cada uma com .shp/.shx/.dbf/.cpg e o .prj quando houver). */
export async function zipDeShapefiles(camadas: CamadaShp[]): Promise<Uint8Array> {
  const PizZip = await carregarZip();
  const zip = new PizZip();
  for (const c of camadas) {
    if (c.feicoes.length === 0) continue;
    const a = escreverShapefile(c);
    zip.file(`${c.nome}.shp`, a.shp);
    zip.file(`${c.nome}.shx`, a.shx);
    zip.file(`${c.nome}.dbf`, a.dbf);
    zip.file(`${c.nome}.cpg`, a.cpg);
    if (a.prj) zip.file(`${c.nome}.prj`, a.prj);
  }
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Lê todas as camadas de um .zip de shapefiles (ou de um .shp avulso com o .dbf/.prj ao lado). */
export async function lerZipDeShapefiles(zipBytes: Uint8Array): Promise<CamadaShp[]> {
  const PizZip = await carregarZip();
  const zip = new PizZip(zipBytes);
  const arquivos = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const base = (n: string) => n.replace(/\.[^.\/]+$/, '');
  const camadas: CamadaShp[] = [];
  for (const nomeShp of arquivos.filter((n) => /\.shp$/i.test(n))) {
    const b = base(nomeShp);
    const achar = (ext: string) => arquivos.find((n) => base(n) === b && n.toLowerCase().endsWith(ext));
    const shp = zip.file(nomeShp)!.asUint8Array();
    const dbfNome = achar('.dbf');
    const prjNome = achar('.prj');
    const { tipo, feicoes } = lerShp(shp);
    const atributos = dbfNome ? lerDbf(zip.file(dbfNome)!.asUint8Array()) : [];
    camadas.push({
      nome: b.split('/').pop() ?? b,
      tipo: tipo ?? 'PONTO',
      feicoes: feicoes.map((partes, i) => ({ partes, atributos: atributos[i] ?? {} })),
      prj: prjNome ? zip.file(prjNome)!.asText() : null,
    });
  }
  if (camadas.length === 0) throw new Error('O .zip não tem nenhum .shp.');
  return camadas;
}

// ── KMZ ──────────────────────────────────────────────────────────────────────

/** KMZ = zip com o `doc.kml` na raiz. */
export async function kmzDoKml(kml: string): Promise<Uint8Array> {
  const PizZip = await carregarZip();
  const zip = new PizZip();
  zip.file('doc.kml', kml);
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

/** O KML de dentro do KMZ: o `doc.kml`, ou o primeiro `.kml` que houver. */
export async function kmlDoKmz(kmz: Uint8Array): Promise<string> {
  const PizZip = await carregarZip();
  const zip = new PizZip(kmz);
  const nomes = Object.keys(zip.files).filter((n) => /\.kml$/i.test(n));
  const escolhido = nomes.find((n) => /(^|\/)doc\.kml$/i.test(n)) ?? nomes[0];
  if (!escolhido) throw new Error('O KMZ não tem nenhum .kml dentro.');
  return zip.file(escolhido)!.asText();
}

// ── .prj ─────────────────────────────────────────────────────────────────────

/** WKT do ESRI para SIRGAS 2000 / UTM <zona>S — o que QGIS e ArcGIS reconhecem. */
export function prjSirgasUtm(zona: number): string {
  const mc = -183 + 6 * zona;
  return (
    `PROJCS["SIRGAS_2000_UTM_Zone_${zona}S",GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],` +
    `PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],` +
    `PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",${mc.toFixed(1)}],PARAMETER["Scale_Factor",0.9996],` +
    `PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`
  );
}
