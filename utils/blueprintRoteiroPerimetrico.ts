/**
 * ROTEIRO PERIMÉTRICO DO IMÓVEL (fase A1).
 *
 * É a tabela que a matrícula e o SIGEF pedem: vértice a vértice, em ordem, com
 * coordenadas, azimute, distância e confrontante. Tudo aqui é DERIVADO — nada
 * se grava: o nome do vértice vive no kernel (`VerticeDoTerreno`), a
 * geometria vive nas divisas, a georreferência vive no estudo. Este módulo só
 * junta as três coisas na forma que o papel espera.
 *
 * ⚠️ Duas convenções que valem papel assinado:
 *
 *  1. O roteiro corre no SENTIDO HORÁRIO, a partir do vértice de partida. É o
 *     que o registrador espera ler; um anel anti-horário é invertido aqui, sem
 *     tocar no desenho.
 *  2. O azimute que vai à tabela é o VERDADEIRO (corrigido da convergência),
 *     quando há georreferência com CRS projetado. Sem ela, o roteiro sai com o
 *     azimute de DESENHO, e diz que é de desenho — ele serve para conferir
 *     ângulos internos, não para a matrícula.
 */
import type { BlueprintModel, Boundary, Point, VerticeDoTerreno } from './blueprintKernel';
import { signedArea, TOLERANCIA_DO_VERTICE_MM } from './blueprintKernel';
import { anelDoTerreno, divisasDoLote, medirTerreno, type Terreno } from './blueprintTerreno';
import { localParaGeo } from './blueprintTopografia';
import {
  azimute as azimuteEntre,
  azimuteTexto,
  azimuteVerdadeiro,
  convergenciaMeridiana,
  crsPorCodigo,
  distanciaNoElipsoide,
  geoParaProjetado,
  latitudeTexto,
  longitudeTexto,
  rumoTexto,
  gmsTexto,
} from './geo';

export interface VerticeDoRoteiro {
  /** Posição no roteiro, a partir de 1. */
  ordem: number;
  /** O nome dado pelo usuário, ou o provisório "V1", "V2"… quando não há. */
  nome: string;
  /** true quando o nome é o provisório — a tela mostra em cinza. */
  provisorio: boolean;
  ponto: Point;
  /** Só com georreferência projetada. */
  este: number | null;
  norte: number | null;
  latitude: number | null;
  longitude: number | null;
  latitudeTexto: string | null;
  longitudeTexto: string | null;
  tipo: VerticeDoTerreno['tipo'] | null;
  sigmaMm: number | null;
}

export interface LadoDoRoteiro {
  ordem: number;
  de: string;
  para: string;
  /** Distância medida no desenho, em mm. */
  distanciaMm: number;
  /**
   * A distância no ELIPSOIDE (a do terreno), quando há georreferência. Difere
   * da de desenho pelo fator de escala da projeção — decímetros num lado longo.
   */
  distanciaNoTerrenoMm: number | null;
  /** Azimute de desenho (contra o Y do modelo), sempre presente. */
  azimuteDeDesenho: number;
  /** Azimute verdadeiro, só com georreferência. */
  azimuteVerdadeiro: number | null;
  azimuteTexto: string;
  rumoTexto: string;
  confrontante: string | null;
  divisaId: string;
}

export interface RoteiroPerimetrico {
  vertices: VerticeDoRoteiro[];
  lados: LadoDoRoteiro[];
  /** Soma dos azimutes internos fecha 360°: é o que prova que o anel é um polígono. */
  fechaEmGraus: number;
  areaMm2: number;
  perimetroMm: number;
  georreferenciado: boolean;
  crs: string | null;
  convergenciaGraus: number | null;
  /** O que falta para o roteiro valer como peça: vértice sem nome, sem georreferência… */
  avisos: string[];
}

const ROTEIRO_VAZIO: RoteiroPerimetrico = {
  vertices: [],
  lados: [],
  fechaEmGraus: 0,
  areaMm2: 0,
  perimetroMm: 0,
  georreferenciado: false,
  crs: null,
  convergenciaGraus: null,
  avisos: ['Feche o contorno do lote com a ferramenta Terreno antes de montar o roteiro.'],
};

/** O vértice nomeado que fica sobre este ponto, se houver. */
export function verticeNoPonto(model: BlueprintModel, p: Point): VerticeDoTerreno | null {
  for (const v of model.verticesDoTerreno ?? []) {
    if (Math.hypot(v.ponto.x - p.x, v.ponto.y - p.y) <= TOLERANCIA_DO_VERTICE_MM) return v;
  }
  return null;
}

/**
 * O anel do terreno em SENTIDO HORÁRIO, e a ordem das divisas junto.
 *
 * `anelDoTerreno` devolve o anel na ordem em que as divisas foram desenhadas,
 * que pode ser anti-horária. O roteiro tem sentido fixo; inverter o anel exige
 * inverter a lista de lados na mesma operação, senão o confrontante do lado 2
 * aparece no lado 4.
 */
function anelHorario(terreno: Terreno): { anel: Point[]; ladosIds: string[] } {
  if (terreno.anel.length < 3) return { anel: terreno.anel, ladosIds: terreno.ladosIds };
  // ⚠️ `signedArea`, e não `polygonArea`: a segunda devolve o valor absoluto e
  // não distingue o sentido — mesma armadilha da escritura e do loteamento.
  if (signedArea(terreno.anel) < 0) return { anel: terreno.anel, ladosIds: terreno.ladosIds };
  // Inverter o anel [p0,p1,…,pn-1] dá [p0,pn-1,…,p1]; o lado i do anel novo
  // (de p_i a p_{i+1}) é o lado (n-1-i) do antigo.
  const n = terreno.anel.length;
  const anel = [terreno.anel[0], ...terreno.anel.slice(1).reverse()];
  const ladosIds = anel.map((_, i) => terreno.ladosIds[(n - 1 - i) % n]);
  return { anel, ladosIds };
}

/** O vértice de partida: o nomeado com menor sufixo numérico, senão o primeiro. */
function indiceDePartida(model: BlueprintModel, anel: Point[]): number {
  let melhor = 0;
  let menor = Infinity;
  anel.forEach((p, i) => {
    const v = verticeNoPonto(model, p);
    if (!v) return;
    const m = v.nome.match(/(\d+)\s*$/);
    const n = m ? Number(m[1]) : Infinity;
    if (n < menor) {
      menor = n;
      melhor = i;
    }
  });
  return melhor;
}

/**
 * MONTA O ROTEIRO a partir do modelo. Puro: a mesma entrada dá a mesma tabela.
 */
export function roteiroPerimetrico(model: BlueprintModel): RoteiroPerimetrico {
  const limites: Boundary[] = divisasDoLote(model.boundaries ?? []);
  const terreno = medirTerreno(limites);
  if (!terreno || terreno.anel.length < 3 || !terreno.fechado) return ROTEIRO_VAZIO;

  const { anel: horario, ladosIds } = anelHorario(terreno);
  const partida = indiceDePartida(model, horario);
  const n = horario.length;
  const anel = horario.map((_, i) => horario[(partida + i) % n]);
  const ids = ladosIds.map((_, i) => ladosIds[(partida + i) % n]);
  const porId = new Map(limites.map((b) => [b.id, b]));

  // Georreferência: só com lat/long válidos e CRS projetado do catálogo.
  const geo = model.georreferencia ?? null;
  const crs = geo?.projetada?.crs ? crsPorCodigo(geo.projetada.crs) : null;
  const georreferenciado =
    !!geo &&
    Number.isFinite(geo.latitude) &&
    Number.isFinite(geo.longitude) &&
    !(geo.latitude === 0 && geo.longitude === 0) &&
    !!crs &&
    crs.tipo === 'PROJETADO' &&
    crs.zona != null;
  const convergencia = georreferenciado && geo && crs ? convergenciaMeridiana({ lat: geo.latitude, lon: geo.longitude }, crs.zona) : null;

  const avisos: string[] = [];
  const vertices: VerticeDoRoteiro[] = anel.map((p, i) => {
    const v = verticeNoPonto(model, p);
    let este: number | null = null;
    let norte: number | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (georreferenciado && geo && crs) {
      const g = localParaGeo(p, geo);
      const proj = geoParaProjetado({ lat: g.lat, lon: g.lon }, crs).valor;
      este = Math.round(proj.este * 1000) / 1000;
      norte = Math.round(proj.norte * 1000) / 1000;
      latitude = g.lat;
      longitude = g.lon;
    }
    return {
      ordem: i + 1,
      nome: v?.nome ?? `V${i + 1}`,
      provisorio: !v,
      ponto: p,
      este,
      norte,
      latitude,
      longitude,
      latitudeTexto: latitude != null ? latitudeTexto(latitude) : null,
      longitudeTexto: longitude != null ? longitudeTexto(longitude) : null,
      tipo: v?.tipo ?? null,
      sigmaMm: v?.sigmaMm ?? null,
    };
  });

  const semNome = vertices.filter((v) => v.provisorio).length;
  if (semNome > 0) avisos.push(`${semNome} vértice(s) sem nome — o roteiro mostra "V1, V2…" provisórios. Use "Nomear vértices" ou nomeie um a um.`);
  if (!georreferenciado) {
    avisos.push('Sem georreferência com sistema projetado: os azimutes são de DESENHO (contra o eixo Y do modelo) e não há coordenadas. Informe latitude/longitude e o CRS em "Dados do lote".');
  }

  const lados: LadoDoRoteiro[] = anel.map((p, i) => {
    const q = anel[(i + 1) % n];
    const distanciaMm = Math.round(Math.hypot(q.x - p.x, q.y - p.y));
    const de = vertices[i];
    const para = vertices[(i + 1) % n];
    // Azimute de desenho: o Y do modelo aponta para o "norte" da folha.
    const azDesenho = azimuteEntre({ x: p.x, y: p.y }, { x: q.x, y: q.y });
    let azVerd: number | null = null;
    let distanciaNoTerrenoMm: number | null = null;
    if (georreferenciado && de.este != null && de.norte != null && para.este != null && para.norte != null && convergencia != null && geo && crs) {
      // O azimute de quadrícula sai das coordenadas PROJETADAS (não do desenho
      // local, que pode estar girado pelo `rotacaoNorteDeg`).
      const azQuad = azimuteEntre({ x: de.este, y: de.norte }, { x: para.este, y: para.norte });
      azVerd = azimuteVerdadeiro(azQuad, convergencia);
      const dQuadMm = Math.hypot(para.este - de.este, para.norte - de.norte) * 1000;
      distanciaNoTerrenoMm = Math.round(distanciaNoElipsoide(dQuadMm, { lat: geo.latitude, lon: geo.longitude }, crs.zona));
    }
    const az = azVerd ?? azDesenho;
    const divisa = porId.get(ids[i]);
    return {
      ordem: i + 1,
      de: de.nome,
      para: para.nome,
      distanciaMm,
      distanciaNoTerrenoMm,
      azimuteDeDesenho: azDesenho,
      azimuteVerdadeiro: azVerd,
      azimuteTexto: azimuteTexto(az),
      rumoTexto: rumoTexto(az),
      confrontante: divisa?.confrontante ?? null,
      divisaId: ids[i],
    };
  });

  // Fechamento angular: a soma das deflexões de um polígono simples é 360°.
  let soma = 0;
  for (let i = 0; i < n; i += 1) {
    const a = lados[i].azimuteDeDesenho;
    const b = lados[(i + 1) % n].azimuteDeDesenho;
    let d = b - a;
    while (d <= -180) d += 360;
    while (d > 180) d -= 360;
    soma += d;
  }

  return {
    vertices,
    lados,
    fechaEmGraus: Math.round(Math.abs(soma) * 1e6) / 1e6,
    areaMm2: terreno.areaMm2,
    perimetroMm: terreno.perimetroMm,
    georreferenciado,
    crs: crs?.codigo ?? null,
    convergenciaGraus: convergencia,
    avisos,
  };
}

/**
 * O MEMORIAL CONVENCIONAL do imóvel, em texto: "Inicia-se no vértice P1…;
 * daí segue com azimute X e distância Y até o vértice P2, confrontando com…".
 * É a forma que o registro de imóveis lê para a gleba inteira (o memorial de
 * lote, da B4, é da unidade parcelada).
 */
export function memorialConvencional(roteiro: RoteiroPerimetrico, dados: { nome?: string; matricula?: string | null; cartorio?: string | null } = {}): string {
  if (roteiro.lados.length === 0) return '';
  const mm = (v: number) => (v / 1000).toFixed(2).replace('.', ',');
  const m2 = (v: number) => (v / 1e6).toFixed(2).replace('.', ',');
  const primeiro = roteiro.vertices[0];
  const frases: string[] = [];
  frases.push(
    `${(dados.nome ?? 'Imóvel').toUpperCase()}, com a área de ${m2(roteiro.areaMm2)} m² e o perímetro de ${mm(roteiro.perimetroMm)} m, assim descrito:`,
  );
  const origem = primeiro.este != null && primeiro.norte != null
    ? `Inicia-se a descrição no vértice ${primeiro.nome}, de coordenadas E ${primeiro.este.toFixed(3).replace('.', ',')} m e N ${primeiro.norte.toFixed(3).replace('.', ',')} m (${roteiro.crs}${primeiro.latitudeTexto ? `; ${primeiro.latitudeTexto}, ${primeiro.longitudeTexto}` : ''});`
    : `Inicia-se a descrição no vértice ${primeiro.nome};`;
  frases.push(origem);
  for (const l of roteiro.lados) {
    const dist = l.distanciaNoTerrenoMm ?? l.distanciaMm;
    const conf = l.confrontante ? `, confrontando com ${l.confrontante}` : '';
    frases.push(`daí segue com azimute ${l.azimuteTexto} e distância de ${mm(dist)} m até o vértice ${l.para}${conf};`);
  }
  frases[frases.length - 1] = frases[frases.length - 1].replace(/;$/, ', vértice inicial da descrição, fechando o perímetro.');
  if (roteiro.georreferenciado && roteiro.convergenciaGraus != null) {
    frases.push(`Azimutes verdadeiros, corrigidos da convergência meridiana de ${gmsTexto(roteiro.convergenciaGraus, 1)}; distâncias no plano do terreno.`);
  } else {
    frases.push('Azimutes referidos ao norte de desenho; o imóvel não está georreferenciado neste estudo.');
  }
  if (dados.matricula) frases.push(`Matrícula nº ${dados.matricula}${dados.cartorio ? ` do ${dados.cartorio}` : ''}.`);
  return frases.join(' ');
}

/**
 * RESTITUIÇÃO POR MEMORIAL: o texto do memorial → o polígono.
 *
 * Lê frases do tipo "azimute 45°30'10" e distância 32,50 m" (ou "rumo 45°30'
 * NE", ou "az. 45,5028°"), na ordem, e caminha a partir da origem. Devolve o
 * anel, o erro de fechamento e o que não conseguiu ler — porque memorial
 * antigo tem de tudo, e a linha que não parseia tem de ser DITA, não pulada.
 *
 * O resultado é em mm locais, no norte de desenho. Girar pelo norte verdadeiro
 * é assunto do `rotacaoNorteDeg` do estudo, não daqui.
 */
export interface RestituicaoDoMemorial {
  anel: Point[];
  /** Um trecho por lado lido: azimute (graus) e distância (mm). */
  trechos: { azimute: number; distanciaMm: number; texto: string }[];
  /** Distância entre o último ponto e a origem, em mm. Zero = fechou. */
  erroDeFechamentoMm: number;
  /** Linhas que pareciam trechos e não deu para ler. */
  naoLidos: string[];
}

const GMS = String.raw`(\d{1,3})\s*[°º]\s*(?:(\d{1,2})\s*['′]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*["″]\s*)?`;

function lerAngulo(texto: string): number | null {
  const gms = texto.match(new RegExp(`^\\s*${GMS}`));
  if (gms) {
    const g = Number(gms[1]);
    const m = gms[2] ? Number(gms[2]) : 0;
    const s = gms[3] ? Number(gms[3].replace(',', '.')) : 0;
    return g + m / 60 + s / 3600;
  }
  const dec = texto.match(/^\s*(\d{1,3}(?:[.,]\d+)?)\s*[°º]?/);
  if (dec) return Number(dec[1].replace(',', '.'));
  return null;
}

export function restituirMemorial(texto: string): RestituicaoDoMemorial {
  const trechos: RestituicaoDoMemorial['trechos'] = [];
  const naoLidos: string[] = [];
  // Um trecho por "segue…até" ou por linha/ponto-e-vírgula.
  const partes = texto
    .split(/;|\n|(?=\bda[íi]\s+segue)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const parte of partes) {
    const temAz = /azimute|\baz\b\.?/i.test(parte);
    const temRumo = /\brumo\b/i.test(parte);
    const temDist = /dist[âa]ncia|\bmede\b|\bcom\b\s+\d/i.test(parte);
    if (!(temAz || temRumo) || !temDist) continue;

    let azimute: number | null = null;
    const mAz = parte.match(/(?:azimute|\baz\b\.?)\s*(?:de\s*)?(?:plano\s*|verdadeiro\s*)?(?:de\s*)?([\d°º'′"″.,\s]+?)(?=\s*(?:e|,|;|dist|$))/i);
    if (mAz) azimute = lerAngulo(mAz[1]);
    if (azimute == null && temRumo) {
      const mR = parte.match(/rumo\s*(?:de\s*)?([\d°º'′"″.,\s]+?)\s*(NE|SE|SW|NW|SO|NO)\b/i);
      if (mR) {
        const ang = lerAngulo(mR[1]);
        const q = mR[2].toUpperCase().replace('SO', 'SW').replace('NO', 'NW') as 'NE' | 'SE' | 'SW' | 'NW';
        if (ang != null) {
          azimute = q === 'NE' ? ang : q === 'SE' ? 180 - ang : q === 'SW' ? 180 + ang : 360 - ang;
        }
      }
    }
    const mDist = parte.match(/(?:dist[âa]ncia\s*(?:de\s*)?|mede\s*|com\s*)(\d{1,6}(?:[.,]\d+)?)\s*m\b/i);
    const distanciaMm = mDist ? Math.round(Number(mDist[1].replace(',', '.')) * 1000) : null;

    if (azimute == null || distanciaMm == null) {
      naoLidos.push(parte);
      continue;
    }
    trechos.push({ azimute, distanciaMm, texto: parte });
  }

  const anel: Point[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (const t of trechos) {
    const rad = (t.azimute * Math.PI) / 180;
    x += t.distanciaMm * Math.sin(rad);
    y += t.distanciaMm * Math.cos(rad);
    anel.push({ x: Math.round(x), y: Math.round(y) });
  }
  // O último ponto DEVE ser a origem: se fechou, tira-o do anel; se não, o
  // erro de fechamento é a distância dele à origem.
  const ultimo = anel[anel.length - 1];
  const erro = trechos.length > 0 ? Math.hypot(ultimo.x, ultimo.y) : 0;
  if (trechos.length > 0) anel.pop();

  return { anel, trechos, erroDeFechamentoMm: Math.round(erro), naoLidos };
}

export { anelDoTerreno };
