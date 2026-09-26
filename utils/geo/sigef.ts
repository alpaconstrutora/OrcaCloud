/**
 * GeoINCRA / SIGEF (A4, 26/09/2026) — as peças do georreferenciamento de
 * imóvel rural que saem do desenho.
 *
 * O software NÃO certifica nada: gera a planilha ODS no layout do INCRA, o
 * memorial, as cartas de anuência e o relatório de vértices para o
 * CREDENCIADO revisar, validar (extensão do LibreOffice / validador do SIGEF) e
 * enviar. Integração com o portal do SIGEF não existe (não há API pública).
 *
 * Fontes das regras, lidas nos documentos do próprio INCRA:
 *  - planilha: o MODELO oficial `sigef_planilha_modelo_1.4_rc5.ods` (em
 *    `public/sigef/`) é PREENCHIDO, não recriado — as abas, as validações e os
 *    parâmetros dele continuam lá. Coordenada geográfica "45 30 25,892 W"
 *    (espaço entre graus, minutos e segundos; 3 casas; vírgula), sigma com 2
 *    casas em metros, altitude com 2 casas e vírgula (Manual do SIGEF);
 *  - tipos de limite LA1…LN6 (Manual Técnico de Limites e Confrontações, 1ª ed.);
 *  - métodos de posicionamento e a compatibilidade com o tipo de vértice, e o
 *    código `<credenciado 4>-<tipo>-<sequencial>` (Manual Técnico para
 *    Georreferenciamento de Imóveis Rurais, 2ª ed.);
 *  - precisão máxima por método × limite × tipo (aba `parametros_vertice_validacao`
 *    do modelo): 0,50 m para M e para P em limite artificial; 3,00 m para P em
 *    limite natural.
 */
import type { BlueprintModel, Boundary, TipoDeLimite, VerticeDoTerreno } from '../blueprintKernel';
import { paraGms } from './formato';
import { areaNoSgl, geoParaSgl } from './sgl';
import { roteiroPerimetrico, verticeNoPonto, type RoteiroPerimetrico } from '../blueprintRoteiroPerimetrico';
import { numeroBr } from '../blueprintMemorialLote';

// ── Catálogos do INCRA ───────────────────────────────────────────────────────

export const ROTULO_DO_TIPO_DE_LIMITE: Record<TipoDeLimite, string> = {
  LA1: 'Cerca',
  LA2: 'Muro',
  LA3: 'Estrada',
  LA4: 'Vala',
  LA5: 'Canal',
  LA6: 'Linha ideal',
  LA7: 'Limite artificial não tipificado',
  LN1: "Corpo d'água ou curso d'água",
  LN2: 'Linha de cumeada',
  LN3: 'Grota',
  LN4: 'Crista de encosta',
  LN5: 'Pé de encosta',
  LN6: 'Limite natural não tipificado',
};

/** Métodos de posicionamento e os tipos de vértice que cada um admite (MTGIR, 2ª ed.). */
export const METODOS_DE_POSICIONAMENTO: Record<string, { rotulo: string; tipos: readonly ('M' | 'P' | 'V')[] }> = {
  PG1: { rotulo: 'Relativo estático', tipos: ['M', 'P'] },
  PG2: { rotulo: 'Relativo estático-rápido', tipos: ['M', 'P'] },
  PG3: { rotulo: 'Relativo semicinemático', tipos: ['M', 'P'] },
  PG4: { rotulo: 'Relativo cinemático', tipos: ['P'] },
  PG5: { rotulo: 'Relativo a partir de códigos', tipos: ['P'] },
  PG6: { rotulo: 'RTK convencional', tipos: ['M', 'P'] },
  PG7: { rotulo: 'RTK em rede', tipos: ['M', 'P'] },
  PG8: { rotulo: 'Differential GPS (DGPS)', tipos: ['P'] },
  PG9: { rotulo: 'Posicionamento por Ponto Preciso', tipos: ['M', 'P'] },
  PT1: { rotulo: 'Poligonação', tipos: ['M', 'P'] },
  PT2: { rotulo: 'Triangulação', tipos: ['M', 'P'] },
  PT3: { rotulo: 'Trilateração', tipos: ['M', 'P'] },
  PT4: { rotulo: 'Triangulateração', tipos: ['M', 'P'] },
  PT5: { rotulo: 'Irradiação', tipos: ['M', 'P'] },
  PT6: { rotulo: 'Interseção linear', tipos: ['M', 'P', 'V'] },
  PT7: { rotulo: 'Interseção angular', tipos: ['M', 'P', 'V'] },
  PT8: { rotulo: 'Alinhamento', tipos: ['M', 'P'] },
  PT9: { rotulo: 'Estação livre', tipos: ['M', 'P'] },
  PA1: { rotulo: 'Paralela', tipos: ['V'] },
  PA2: { rotulo: 'Interseção de retas', tipos: ['V'] },
  PA3: { rotulo: 'Projeção técnica', tipos: ['V'] },
  PS1: { rotulo: 'Aerofotogrametria', tipos: ['V'] },
  PS2: { rotulo: 'Radar aerotransportado', tipos: ['V'] },
  PS3: { rotulo: 'Laser scanner aerotransportado', tipos: ['V'] },
  PS4: { rotulo: 'Sensores orbitais', tipos: ['V'] },
  PB1: { rotulo: 'Base cartográfica com precisão conhecida', tipos: ['V'] },
  PB2: { rotulo: 'Base cartográfica sem precisão conhecida', tipos: ['V'] },
};

/** Os valores das listas da aba `identificacao` do modelo (aba `parametros_controles`). */
export const NATUREZAS_DO_SERVICO = ['Particular', 'Contrato com Administração Pública'] as const;
export const SITUACOES_DA_AREA = ['Imóvel Registrado', 'Área Titulada não Registrada', 'Área não Titulada'] as const;
export const NATUREZAS_DA_AREA = [
  'Assentamento',
  'Assentamento Parcela',
  'Estrada',
  'Ferrovia',
  'Floresta Pública',
  'Gleba Pública',
  'Particular',
  'Perímetro Urbano',
  'Terra Indígena',
  'Terreno de Marinha',
  'Terreno Marginal',
  'Território Quilombola',
  'Unidade de Conservação',
] as const;

/** A identificação do serviço, do detentor e da área — a aba `identificacao`. */
export interface IdentificacaoSigef {
  naturezaDoServico: (typeof NATUREZAS_DO_SERVICO)[number];
  tipoPessoa: 'Física' | 'Jurídica';
  nome: string;
  cpfCnpj: string;
  denominacao: string;
  situacao: (typeof SITUACOES_DA_AREA)[number];
  naturezaDaArea: (typeof NATUREZAS_DA_AREA)[number];
  codigoSncr: string;
  cns: string;
  matricula: string;
  /** "Belo Horizonte-MG" — como na lista do modelo. */
  municipio: string;
  /** Código do credenciado no INCRA: 4 caracteres. */
  credenciado: string;
  /** Nome, conselho e registro do responsável técnico — vão no memorial e na carta. */
  responsavelTecnico: string;
  parcela: { denominacao: string; numero: string };
}

export const IDENTIFICACAO_VAZIA: IdentificacaoSigef = {
  naturezaDoServico: 'Particular',
  tipoPessoa: 'Física',
  nome: '',
  cpfCnpj: '',
  denominacao: '',
  situacao: 'Imóvel Registrado',
  naturezaDaArea: 'Particular',
  codigoSncr: '',
  cns: '',
  matricula: '',
  municipio: '',
  credenciado: '',
  responsavelTecnico: '',
  parcela: { denominacao: 'Parte 1', numero: '001' },
};

// ── Formatos da planilha ─────────────────────────────────────────────────────

/** "45 30 25,892 W" / "19 55 12,345 S" — o formato do Manual do SIGEF. */
export function gmsSigef(decimal: number, eixo: 'LON' | 'LAT'): string {
  const g = paraGms(decimal, 3);
  const hemisferio = eixo === 'LON' ? (g.sinal < 0 ? 'W' : 'E') : g.sinal < 0 ? 'S' : 'N';
  return `${g.graus} ${String(g.minutos).padStart(2, '0')} ${g.segundos.toFixed(3).replace('.', ',').padStart(6, '0')} ${hemisferio}`;
}

/** Metros com 2 casas e vírgula, sem milhar ("0,18", "1234,12"). */
export function metrosSigef(m: number): string {
  return m.toFixed(2).replace('.', ',');
}

// ── As linhas do perímetro ───────────────────────────────────────────────────

export interface LinhaSigef {
  codigo: string;
  tipo: 'M' | 'P' | 'V' | null;
  latitude: number;
  longitude: number;
  longitudeTexto: string;
  latitudeTexto: string;
  sigmaLongM: number | null;
  sigmaLatM: number | null;
  alturaM: number | null;
  sigmaAlturaM: number | null;
  metodo: string | null;
  /** Do trecho que SAI deste vértice para o próximo. */
  tipoDeLimite: TipoDeLimite | null;
  cns: string | null;
  matricula: string | null;
  confrontante: string | null;
  confrontanteDocumento: string | null;
  /** Trecho em SGL: azimute geodésico (plano topográfico) e distância, até o próximo vértice. */
  azimuteGraus: number;
  distanciaM: number;
  paraCodigo: string;
  ponto: { x: number; y: number };
}

export interface PerimetroSigef {
  linhas: LinhaSigef[];
  /** Área no plano topográfico local — a que o SIGEF confere —, em m². */
  areaSglM2: number;
  perimetroSglM: number;
  roteiro: RoteiroPerimetrico;
}

/**
 * O perímetro na ordem do SIGEF: sentido HORÁRIO começando pelo vértice mais
 * ao NORTE (maior latitude; empate, o mais a leste). Exige georreferência.
 * Azimutes e distâncias no SGL com origem no centróide dos vértices.
 */
export function perimetroSigef(model: BlueprintModel): PerimetroSigef | null {
  const roteiro = roteiroPerimetrico(model);
  if (!roteiro.georreferenciado || roteiro.vertices.length < 3) return null;
  const n = roteiro.vertices.length;
  let inicio = 0;
  roteiro.vertices.forEach((v, i) => {
    const a = roteiro.vertices[inicio];
    if ((v.latitude as number) > (a.latitude as number) + 1e-12 || (Math.abs((v.latitude as number) - (a.latitude as number)) <= 1e-12 && (v.longitude as number) > (a.longitude as number))) inicio = i;
  });
  const porId = new Map<string, Boundary>((model.boundaries ?? []).map((b) => [b.id, b]));
  const latM = roteiro.vertices.reduce((s, v) => s + (v.latitude as number), 0) / n;
  const lonM = roteiro.vertices.reduce((s, v) => s + (v.longitude as number), 0) / n;
  const altM = model.georreferencia?.elevacaoM ?? 0;
  const sgl = { origem: { lat: latM, lon: lonM }, altitudeM: altM ?? 0 };
  const noSgl = roteiro.vertices.map((v) => geoParaSgl({ lat: v.latitude as number, lon: v.longitude as number }, sgl));
  const linhas: LinhaSigef[] = [];
  let perimetro = 0;
  for (let k = 0; k < n; k++) {
    const i = (inicio + k) % n;
    const j = (i + 1) % n;
    const v = roteiro.vertices[i];
    const kv: VerticeDoTerreno | null = verticeNoPonto(model, v.ponto);
    const lado = roteiro.lados[i];
    const b = lado ? porId.get(lado.divisaId) : undefined;
    const de = noSgl[i];
    const para = noSgl[j];
    const dist = Math.hypot(para.este - de.este, para.norte - de.norte);
    perimetro += dist;
    const az = ((Math.atan2(para.este - de.este, para.norte - de.norte) * 180) / Math.PI + 360) % 360;
    const sigmaH = kv?.sigmaMm ?? null;
    linhas.push({
      codigo: v.nome,
      tipo: kv?.tipo ?? null,
      latitude: v.latitude as number,
      longitude: v.longitude as number,
      longitudeTexto: gmsSigef(v.longitude as number, 'LON'),
      latitudeTexto: gmsSigef(v.latitude as number, 'LAT'),
      sigmaLongM: kv?.sigmaEMm != null ? kv.sigmaEMm / 1000 : sigmaH != null ? sigmaH / 1000 : null,
      sigmaLatM: kv?.sigmaNMm != null ? kv.sigmaNMm / 1000 : sigmaH != null ? sigmaH / 1000 : null,
      alturaM: kv?.altitudeM ?? null,
      sigmaAlturaM: kv?.sigmaHMm != null ? kv.sigmaHMm / 1000 : null,
      metodo: kv?.metodo?.trim().toUpperCase() || null,
      tipoDeLimite: b?.tipoDeLimite ?? null,
      cns: b?.confrontanteCns ?? null,
      matricula: b?.confrontanteMatricula ?? null,
      confrontante: b?.confrontante ?? null,
      confrontanteDocumento: b?.confrontanteDocumento ?? null,
      azimuteGraus: az,
      distanciaM: dist,
      paraCodigo: roteiro.vertices[j].nome,
      ponto: v.ponto,
    });
  }
  const anelSgl = Array.from({ length: n }, (_, k) => noSgl[(inicio + k) % n]);
  return { linhas, areaSglM2: Math.abs(areaNoSgl(anelSgl)), perimetroSglM: perimetro, roteiro };
}

// ── Validação ────────────────────────────────────────────────────────────────

export interface PendenciaSigef {
  gravidade: 'ERRO' | 'AVISO';
  /** Código do vértice ou "identificação". */
  onde: string;
  texto: string;
}

const CODIGO_SIGEF = /^([A-Z0-9]{4})-([MPV])-(\d{4,})$/;

/** Precisão máxima (m): M sempre 0,50; P 0,50 em limite artificial e 3,00 em natural; V não se mede. */
export function precisaoMaximaM(tipo: 'M' | 'P' | 'V', limite: TipoDeLimite | null): number | null {
  if (tipo === 'V') return null;
  if (tipo === 'M') return 0.5;
  return limite?.startsWith('LN') ? 3 : 0.5;
}

/**
 * Tudo o que o validador do SIGEF recusaria e que dá para ver aqui — ERRO
 * impede de gerar a planilha "limpa"; AVISO passa, mas é dito. Não substitui o
 * validador do INCRA: ele confere contra os imóveis já certificados, e isso só
 * ele sabe.
 */
export function validarSigef(perimetro: PerimetroSigef | null, id: IdentificacaoSigef): PendenciaSigef[] {
  const p: PendenciaSigef[] = [];
  const erro = (onde: string, texto: string) => p.push({ gravidade: 'ERRO', onde, texto });
  const aviso = (onde: string, texto: string) => p.push({ gravidade: 'AVISO', onde, texto });
  if (!perimetro) {
    erro('imóvel', 'Sem georreferência com sistema projetado (Onde fica › latitude, longitude e CRS) ou sem lote fechado: não há coordenadas para o SIGEF.');
    return p;
  }
  const ident = 'identificação';
  if (!/^[A-Z0-9]{4}$/.test(id.credenciado.trim().toUpperCase())) erro(ident, 'Código do credenciado: 4 caracteres (letras e números).');
  if (!id.nome.trim()) erro(ident, 'Nome do detentor em branco.');
  const doc = id.cpfCnpj.replace(/\D/g, '');
  if (id.tipoPessoa === 'Física' ? doc.length !== 11 : doc.length !== 14) erro(ident, `${id.tipoPessoa === 'Física' ? 'CPF' : 'CNPJ'} do detentor com ${doc.length} dígitos.`);
  if (!id.denominacao.trim()) erro(ident, 'Denominação do imóvel em branco.');
  if (!/^.+-[A-Z]{2}$/.test(id.municipio.trim())) erro(ident, 'Município no formato da lista do INCRA: "Nome-UF".');
  if (id.situacao === 'Imóvel Registrado' && (!id.matricula.trim() || !id.cns.trim())) erro(ident, 'Imóvel registrado pede matrícula e CNS do cartório.');
  if (!id.responsavelTecnico.trim()) aviso(ident, 'Responsável técnico em branco — vai no memorial e nas cartas.');

  const vistos = new Map<string, number>();
  for (const l of perimetro.linhas) {
    const m = l.codigo.match(CODIGO_SIGEF);
    if (!m) erro(l.codigo, `Código fora do padrão "<credenciado>-<M|P|V>-<sequencial>" (use "Nomear no padrão SIGEF").`);
    else {
      if (m[1] !== id.credenciado.trim().toUpperCase()) aviso(l.codigo, `Código de outro credenciado (${m[1]}) — só se o vértice foi medido por ele.`);
      if (l.tipo && m[2] !== l.tipo) erro(l.codigo, `O código diz ${m[2]} e o vértice é do tipo ${l.tipo}.`);
    }
    vistos.set(l.codigo, (vistos.get(l.codigo) ?? 0) + 1);
    if (!l.tipo) erro(l.codigo, 'Tipo do vértice (M, P ou V) não informado.');
    if (!l.metodo) erro(l.codigo, 'Método de posicionamento não informado.');
    else if (!METODOS_DE_POSICIONAMENTO[l.metodo]) erro(l.codigo, `Método "${l.metodo}" não é um código do INCRA (PG1…PG9, PT1…PT9, PA1…PA3, PS1…PS4, PB1, PB2).`);
    else if (l.tipo && !METODOS_DE_POSICIONAMENTO[l.metodo].tipos.includes(l.tipo)) erro(l.codigo, `${l.metodo} (${METODOS_DE_POSICIONAMENTO[l.metodo].rotulo}) não serve para vértice ${l.tipo}.`);
    if (l.sigmaLongM === null || l.sigmaLatM === null) erro(l.codigo, 'Sigma de longitude/latitude não informado.');
    if (l.alturaM === null) erro(l.codigo, 'Altitude (h) não informada.');
    else if (l.alturaM === 0) aviso(l.codigo, 'Altitude zero — confira: é raro um vértice no nível do elipsoide.');
    if (l.sigmaAlturaM === null) erro(l.codigo, 'Sigma de altitude não informado.');
    if (!l.tipoDeLimite) erro(l.codigo, `Tipo de limite do trecho ${l.codigo} → ${l.paraCodigo} não informado.`);
    if (!l.confrontante) erro(l.codigo, `Confrontante do trecho ${l.codigo} → ${l.paraCodigo} em branco.`);
    if (l.tipo && l.sigmaLongM !== null && l.sigmaLatM !== null) {
      const max = precisaoMaximaM(l.tipo, l.tipoDeLimite);
      const pior = Math.max(l.sigmaLongM, l.sigmaLatM);
      if (max !== null && pior > max + 1e-9) erro(l.codigo, `Sigma de ${metrosSigef(pior)} m acima do máximo de ${metrosSigef(max)} m para vértice ${l.tipo}${l.tipoDeLimite ? ` em ${l.tipoDeLimite}` : ''}.`);
    }
  }
  for (const [codigo, n] of vistos) if (n > 1) erro(codigo, `Código repetido em ${n} vértices.`);
  return p;
}

// ── A planilha ODS (o MODELO oficial, preenchido) ────────────────────────────

const NS_TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
const NS_TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const NS_OFFICE = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';

function filhos(el: Element, local: string[]): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === NS_TABLE && local.includes((n as Element).localName));
}

/** Separa um elemento repetido (`number-*-repeated`) para que o índice pedido seja um elemento só. */
function materializar(pai: Element, indice: number, locais: string[], atributo: string): Element {
  let pos = 0;
  for (const el of filhos(pai, locais)) {
    const rep = Number(el.getAttributeNS(NS_TABLE, atributo) || '1');
    if (indice < pos + rep) {
      const antes = indice - pos;
      const depois = rep - antes - 1;
      const clone = () => el.cloneNode(true) as Element;
      if (antes > 0) {
        const a = clone();
        a.setAttributeNS(NS_TABLE, `table:${atributo}`, String(antes));
        pai.insertBefore(a, el);
      }
      if (depois > 0) {
        const d = clone();
        d.setAttributeNS(NS_TABLE, `table:${atributo}`, String(depois));
        pai.insertBefore(d, el.nextSibling);
      }
      el.removeAttributeNS(NS_TABLE, atributo);
      return el;
    }
    pos += rep;
  }
  throw new Error(`Planilha: posição ${indice} fora da tabela.`);
}

function escreverCelula(doc: Document, tabela: Element, linha: number, coluna: number, texto: string) {
  const row = materializar(tabela, linha, ['table-row'], 'number-rows-repeated');
  const cel = materializar(row, coluna, ['table-cell', 'covered-table-cell'], 'number-columns-repeated');
  // Mantém controles de formulário (draw:control) que a célula carrega; troca só o texto.
  for (const n of Array.from(cel.childNodes)) if ((n as Element).namespaceURI === NS_TEXT) cel.removeChild(n);
  cel.setAttributeNS(NS_OFFICE, 'office:value-type', 'string');
  cel.removeAttributeNS(NS_OFFICE, 'value');
  const p = doc.createElementNS(NS_TEXT, 'text:p');
  p.textContent = texto;
  cel.insertBefore(p, cel.firstChild);
}

function tabelaPorNome(doc: Document, nome: string): Element {
  const t = Array.from(doc.getElementsByTagNameNS(NS_TABLE, 'table')).find((x) => x.getAttributeNS(NS_TABLE, 'name') === nome);
  if (!t) throw new Error(`O modelo do SIGEF não tem a aba "${nome}" — versão do modelo diferente da esperada (1.4 rc5).`);
  return t;
}

/** A1 → (linha 0, coluna 0). */
function endereco(a1: string): { linha: number; coluna: number } {
  const m = a1.match(/^([A-Z]+)(\d+)$/)!;
  const coluna = m[1].split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { linha: Number(m[2]) - 1, coluna };
}

/**
 * Preenche o `content.xml` do modelo. Posições (lidas no modelo 1.4 rc5):
 * `identificacao` B2 natureza do serviço, B5 tipo pessoa, B6 nome, B7 CPF/CNPJ,
 * B10 denominação, B11 situação, B12 natureza da área, B13 código SNCR, B14 CNS,
 * B15 matrícula, B16 município; `perimetro_1` B3 denominação da parcela, B4
 * número, B5 lado, B9 tipo de coordenada, D9 meridiano central, F9 hemisfério,
 * e os vértices da linha 12 em diante, colunas A…L.
 */
export function preencherContentXml(xml: string, id: IdentificacaoSigef, perimetro: PerimetroSigef, meridianoCentral: number): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const erroDeParse = doc.getElementsByTagName('parsererror')[0];
  if (erroDeParse) throw new Error('O content.xml do modelo não abriu como XML.');
  const idt = tabelaPorNome(doc, 'identificacao');
  const per = tabelaPorNome(doc, 'perimetro_1');
  const em = (t: Element, a1: string, v: string) => {
    const { linha, coluna } = endereco(a1);
    escreverCelula(doc, t, linha, coluna, v);
  };
  em(idt, 'B2', id.naturezaDoServico);
  em(idt, 'B5', id.tipoPessoa);
  em(idt, 'B6', id.nome);
  em(idt, 'B7', id.cpfCnpj);
  em(idt, 'B10', id.denominacao);
  em(idt, 'B11', id.situacao);
  em(idt, 'B12', id.naturezaDaArea);
  em(idt, 'B13', id.codigoSncr);
  em(idt, 'B14', id.cns);
  em(idt, 'B15', id.matricula);
  em(idt, 'B16', id.municipio);
  em(per, 'B3', id.parcela.denominacao || 'Parte 1');
  em(per, 'B4', id.parcela.numero || '001');
  em(per, 'B5', 'Externo');
  em(per, 'B9', 'Geográfica');
  em(per, 'D9', String(meridianoCentral));
  em(per, 'F9', 'Sul');
  perimetro.linhas.forEach((l, i) => {
    const linha = 11 + i;
    const valores = [
      l.codigo,
      l.longitudeTexto,
      l.sigmaLongM !== null ? metrosSigef(l.sigmaLongM) : '',
      l.latitudeTexto,
      l.sigmaLatM !== null ? metrosSigef(l.sigmaLatM) : '',
      l.alturaM !== null ? metrosSigef(l.alturaM) : '',
      l.sigmaAlturaM !== null ? metrosSigef(l.sigmaAlturaM) : '',
      l.metodo ?? '',
      l.tipoDeLimite ?? '',
      l.cns ?? '',
      l.matricula ?? '',
      l.confrontante ?? '',
    ];
    valores.forEach((v, c) => escreverCelula(doc, per, linha, c, v));
  });
  return new XMLSerializer().serializeToString(doc);
}

/** O .ods: o modelo oficial com o `content.xml` preenchido; o resto do zip intacto (o `mimetype` primeiro, sem compressão). */
export async function planilhaOdsSigef(modelo: Uint8Array, id: IdentificacaoSigef, perimetro: PerimetroSigef, meridianoCentral: number): Promise<Uint8Array> {
  const PizZip = (await import('pizzip')).default;
  const zip = new PizZip(modelo);
  const content = zip.file('content.xml');
  if (!content) throw new Error('O modelo do SIGEF não tem content.xml.');
  const novo = preencherContentXml(content.asText(), id, perimetro, meridianoCentral);
  const saida = new PizZip();
  saida.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });
  for (const nome of Object.keys(zip.files)) {
    const f = zip.files[nome];
    if (nome === 'mimetype') continue;
    // As pastas vazias do modelo (Configurations2/…) ficam: o manifesto as cita.
    if (f.dir) {
      saida.folder(nome.replace(/\/$/, ''));
      continue;
    }
    if (nome === 'content.xml') saida.file(nome, novo);
    else saida.file(nome, f.asUint8Array());
  }
  return saida.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

// ── Memorial, cartas e relatório ─────────────────────────────────────────────

function azimuteGms(az: number): string {
  const g = paraGms(az, 0);
  return `${g.graus}°${String(g.minutos).padStart(2, '0')}'${String(Math.round(g.segundos)).padStart(2, '0')}"`;
}

/** "-45°30'25,892\"" — o GMS do memorial, com 3 casas. */
function gmsMemorial(decimal: number): string {
  const g = paraGms(decimal, 3);
  return `${g.sinal < 0 ? '-' : ''}${g.graus}°${String(g.minutos).padStart(2, '0')}'${g.segundos.toFixed(3).replace('.', ',').padStart(6, '0')}"`;
}

/**
 * O MEMORIAL DESCRITIVO no modelo do georreferenciamento: coordenadas
 * geodésicas SIRGAS 2000 em GMS com 3 casas, altitude, azimutes e distâncias
 * no plano topográfico local, confrontante e tipo de limite por trecho.
 */
export function memorialGeoIncra(perimetro: PerimetroSigef, id: IdentificacaoSigef): string {
  const L = perimetro.linhas;
  const cab = [
    'MEMORIAL DESCRITIVO',
    '',
    `Imóvel: ${id.denominacao || '—'}`,
    `Proprietário: ${id.nome || '—'} (${id.tipoPessoa === 'Física' ? 'CPF' : 'CNPJ'} ${id.cpfCnpj || '—'})`,
    `Município: ${id.municipio || '—'}`,
    `Matrícula: ${id.matricula || '—'} · CNS: ${id.cns || '—'} · Código SNCR: ${id.codigoSncr || '—'}`,
    `Área (SGL): ${numeroBr(perimetro.areaSglM2 / 10_000, 4)} ha · Perímetro: ${numeroBr(perimetro.perimetroSglM, 2)} m`,
    '',
  ];
  const corpo: string[] = [];
  L.forEach((l, i) => {
    const alt = l.alturaM !== null ? `, h ${numeroBr(l.alturaM, 2)} m` : '';
    const inicio =
      i === 0
        ? `Inicia-se a descrição deste perímetro no vértice ${l.codigo}, de coordenadas Longitude ${gmsMemorial(l.longitude)}, Latitude ${gmsMemorial(l.latitude)}${alt}`
        : `do vértice ${l.codigo}, de coordenadas Longitude ${gmsMemorial(l.longitude)}, Latitude ${gmsMemorial(l.latitude)}${alt}`;
    const limite = l.tipoDeLimite ? ` (${ROTULO_DO_TIPO_DE_LIMITE[l.tipoDeLimite].toLowerCase()})` : '';
    const prox = L[(i + 1) % L.length];
    const destino = i === L.length - 1 ? `até o vértice ${prox.codigo}, ponto inicial da descrição deste perímetro.` : `até o vértice ${prox.codigo};`;
    corpo.push(`${inicio}; deste, segue confrontando com ${l.confrontante ?? '—'}${limite}, com azimute de ${azimuteGms(l.azimuteGraus)} e distância de ${numeroBr(l.distanciaM, 2)} m, ${destino}`);
  });
  const rodape = [
    '',
    'Todas as coordenadas aqui descritas estão georreferenciadas ao Sistema Geodésico Brasileiro e encontram-se representadas no Sistema de Referência SIRGAS 2000. Os azimutes, as distâncias, a área e o perímetro foram calculados no plano topográfico local (SGL).',
    '',
    `Responsável técnico: ${id.responsavelTecnico || '—'} · Credenciado INCRA: ${id.credenciado || '—'}`,
  ];
  return [...cab, corpo.join(' '), ...rodape].join('\n');
}

export interface CartaDeAnuencia {
  confrontante: string;
  texto: string;
}

/** Uma CARTA DE ANUÊNCIA por confrontante, com os trechos que ele confronta. */
export function cartasDeAnuencia(perimetro: PerimetroSigef, id: IdentificacaoSigef): CartaDeAnuencia[] {
  const porConfrontante = new Map<string, LinhaSigef[]>();
  for (const l of perimetro.linhas) {
    if (!l.confrontante) continue;
    porConfrontante.set(l.confrontante, [...(porConfrontante.get(l.confrontante) ?? []), l]);
  }
  return [...porConfrontante.entries()].map(([confrontante, trechos]) => {
    const doc = trechos.find((t) => t.confrontanteDocumento)?.confrontanteDocumento;
    const mat = trechos.find((t) => t.matricula)?.matricula;
    const cns = trechos.find((t) => t.cns)?.cns;
    const texto = [
      'DECLARAÇÃO DE RECONHECIMENTO DE LIMITES (CARTA DE ANUÊNCIA)',
      '',
      `Eu, ${confrontante}${doc ? `, inscrito(a) sob o nº ${doc}` : ''}${mat ? `, proprietário(a) do imóvel da matrícula ${mat}${cns ? ` (CNS ${cns})` : ''}` : ''}, confrontante do imóvel "${id.denominacao || '—'}", de ${id.nome || '—'}, situado em ${id.municipio || '—'}, declaro que reconheço como corretos e em concordância com a posse os limites comuns abaixo, levantados por ${id.responsavelTecnico || '—'}:`,
      '',
      ...trechos.map(
        (t) =>
          `- Do vértice ${t.codigo} (Long ${gmsMemorial(t.longitude)}, Lat ${gmsMemorial(t.latitude)}) ao vértice ${t.paraCodigo}: azimute ${azimuteGms(t.azimuteGraus)}, distância ${numeroBr(t.distanciaM, 2)} m${t.tipoDeLimite ? `, limite ${ROTULO_DO_TIPO_DE_LIMITE[t.tipoDeLimite].toLowerCase()} (${t.tipoDeLimite})` : ''}.`,
      ),
      '',
      '__________________________________________',
      confrontante,
      '',
      'Local e data: ______________________________',
    ].join('\n');
    return { confrontante, texto };
  });
}

/** Relatório analítico de vértices em CSV (`;`) — o que o credenciado confere antes da planilha. */
export function relatorioDeVerticesCsv(perimetro: PerimetroSigef): string {
  const cab = ['codigo', 'tipo', 'longitude', 'latitude', 'sigma_long_m', 'sigma_lat_m', 'h_m', 'sigma_h_m', 'metodo', 'tipo_limite', 'confrontante', 'azimute_sgl', 'distancia_sgl_m', 'ate'];
  const linhas = perimetro.linhas.map((l) =>
    [
      l.codigo,
      l.tipo ?? '',
      l.longitudeTexto,
      l.latitudeTexto,
      l.sigmaLongM !== null ? metrosSigef(l.sigmaLongM) : '',
      l.sigmaLatM !== null ? metrosSigef(l.sigmaLatM) : '',
      l.alturaM !== null ? metrosSigef(l.alturaM) : '',
      l.sigmaAlturaM !== null ? metrosSigef(l.sigmaAlturaM) : '',
      l.metodo ?? '',
      l.tipoDeLimite ?? '',
      (l.confrontante ?? '').replace(/;/g, ','),
      azimuteGms(l.azimuteGraus),
      metrosSigef(l.distanciaM),
      l.paraCodigo,
    ].join(';'),
  );
  return [cab.join(';'), ...linhas].join('\n');
}

// ── Retorno do SIGEF ─────────────────────────────────────────────────────────

/** "45 30 25,892 W", "-45 30 25.892", "-45,5071922" → graus decimais. `null` = não lê. */
export function lerCoordenadaSigef(t: string): number | null {
  const s = t.trim().replace(/[°'"]/g, ' ').replace(/\s+/g, ' ');
  const hem = s.match(/\s*([NSEWO])$/i);
  const corpo = hem ? s.slice(0, -hem[0].length).trim() : s;
  const partes = corpo.split(' ').map((x) => Number(x.replace(',', '.')));
  if (partes.some((x) => !Number.isFinite(x)) || partes.length === 0) return null;
  const negativoNoTexto = corpo.startsWith('-');
  const [g, m = 0, sg = 0] = partes.map(Math.abs);
  let v = g + m / 60 + sg / 3600;
  if (negativoNoTexto || (hem && /[SWO]/i.test(hem[1]))) v = -v;
  return v;
}

export interface DiferencaDoRetorno {
  codigo: string;
  /** Diferença no plano local, certificado − desenho, em m. */
  dLesteM: number;
  dNorteM: number;
  distanciaM: number;
}

export interface ConferenciaDoRetorno {
  diferencas: DiferencaDoRetorno[];
  soNoRetorno: string[];
  soNoDesenho: string[];
  maiorM: number;
}

/**
 * Confere os vértices CERTIFICADOS (o que o SIGEF devolve, em CSV ou texto
 * com código, longitude e latitude) contra o desenho: a diferença de cada
 * vértice, em metros, e os códigos que só existem de um lado.
 */
export function conferirRetornoSigef(texto: string, perimetro: PerimetroSigef): ConferenciaDoRetorno {
  const lidos = new Map<string, { lat: number; lon: number }>();
  for (const linha of texto.split(/\r?\n/)) {
    const c = linha.split(/[;\t]/).map((x) => x.trim());
    if (c.length < 3 || !CODIGO_SIGEF.test(c[0])) continue;
    const lon = lerCoordenadaSigef(c[1]);
    const lat = lerCoordenadaSigef(c[2]);
    if (lon === null || lat === null) continue;
    lidos.set(c[0], { lat, lon });
  }
  const origem = { lat: perimetro.linhas[0]?.latitude ?? 0, lon: perimetro.linhas[0]?.longitude ?? 0 };
  const diferencas: DiferencaDoRetorno[] = [];
  const soNoDesenho: string[] = [];
  for (const l of perimetro.linhas) {
    const r = lidos.get(l.codigo);
    if (!r) {
      soNoDesenho.push(l.codigo);
      continue;
    }
    const a = geoParaSgl({ lat: l.latitude, lon: l.longitude }, { origem });
    const b = geoParaSgl(r, { origem });
    const dLesteM = b.este - a.este;
    const dNorteM = b.norte - a.norte;
    diferencas.push({ codigo: l.codigo, dLesteM, dNorteM, distanciaM: Math.hypot(dLesteM, dNorteM) });
  }
  const noDesenho = new Set(perimetro.linhas.map((l) => l.codigo));
  const soNoRetorno = [...lidos.keys()].filter((k) => !noDesenho.has(k));
  return { diferencas, soNoRetorno, soNoDesenho, maiorM: diferencas.reduce((m, d) => Math.max(m, d.distanciaM), 0) };
}
