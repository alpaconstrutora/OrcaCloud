/**
 * CATÁLOGO DE SISTEMAS DE REFERÊNCIA (fase A0).
 *
 * É um catálogo FECHADO, e isso é a decisão central deste arquivo: aceitar
 * qualquer código EPSG que o usuário digitasse pareceria mais flexível e seria
 * pior. O erro que este módulo existe para impedir não é "código desconhecido"
 * — é **fuso ou datum errado**, que põe o desenho a centenas de quilômetros do
 * lugar COM A FORMA PERFEITA. Um catálogo fechado permite dizer, antes de
 * converter, que o fuso informado não contém a longitude do lote.
 *
 * O que entra:
 *   • SIRGAS 2000 — o único sistema legal no Brasil desde 2015 (IBGE, RPR
 *     01/2015). É o destino de toda conversão.
 *   • SAD 69 e Córrego Alegre — só como ORIGEM: é o que está escrito nas
 *     escrituras e nos levantamentos antigos que chegam para digitalizar.
 *   • WGS 84 — o que vem de GPS de navegação e de KML.
 *
 * ⚠️ SIRGAS 2000 e WGS 84 são tratados como coincidentes para fins de
 * cadastro (a diferença é centimétrica e varia com a época). Isso é declarado
 * aqui e repetido na tela: quem precisa de precisão geodésica não usa um
 * editor de plantas para transformar datum.
 */
import proj4 from 'proj4';

export type TipoDeCrs = 'GEOGRAFICO' | 'PROJETADO';

export interface DefinicaoDeCrs {
  /** "EPSG:31983". */
  codigo: string;
  /** "SIRGAS 2000 / UTM 23S". */
  nome: string;
  tipo: TipoDeCrs;
  /** O datum, para avisar quando a conversão muda de referencial. */
  datum: 'SIRGAS2000' | 'SAD69' | 'CORREGO_ALEGRE' | 'WGS84';
  /** Só em projetado: o fuso UTM e o hemisfério. */
  zona?: number;
  hemisferio?: 'N' | 'S';
  /** A string proj4 — é ela que faz a conta. */
  proj4: string;
  /** Sistema herdado: serve de origem, nunca de destino. */
  herdado?: boolean;
}

/** Longitude do meridiano central de um fuso UTM. */
export function meridianoCentral(zona: number): number {
  return (zona - 1) * 6 - 180 + 3;
}

/** O fuso UTM que contém esta longitude. */
export function zonaDaLongitude(lon: number): number {
  return Math.floor((lon + 180) / 6) + 1;
}

/** Os fusos que cobrem o Brasil: 18 a 25 no hemisfério sul (e o 19N em Roraima). */
export const ZONAS_DO_BRASIL = [18, 19, 20, 21, 22, 23, 24, 25] as const;

function utmSirgas(zona: number): DefinicaoDeCrs {
  return {
    codigo: `EPSG:${31960 + zona}`, // 31978 = zona 18S … 31985 = zona 25S
    nome: `SIRGAS 2000 / UTM ${zona}S`,
    tipo: 'PROJETADO',
    datum: 'SIRGAS2000',
    zona,
    hemisferio: 'S',
    proj4: `+proj=utm +zone=${zona} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
  };
}

function utmSad69(zona: number): DefinicaoDeCrs {
  return {
    codigo: `EPSG:${29170 + zona}`, // 29188 = SAD 69 / UTM 18S … 29195 = 25S
    nome: `SAD 69 / UTM ${zona}S`,
    tipo: 'PROJETADO',
    datum: 'SAD69',
    zona,
    hemisferio: 'S',
    // Os parâmetros oficiais do IBGE para SAD69 → WGS84 (translação de três
    // parâmetros). É o que a NBR e as escrituras antigas assumem.
    proj4: `+proj=utm +zone=${zona} +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs`,
    herdado: true,
  };
}

function utmCorregoAlegre(zona: number): DefinicaoDeCrs {
  return {
    codigo: `EPSG:${22500 + zona}`, // 22521 = Córrego Alegre / UTM 21S … 22525 = 25S
    nome: `Córrego Alegre / UTM ${zona}S`,
    tipo: 'PROJETADO',
    datum: 'CORREGO_ALEGRE',
    zona,
    hemisferio: 'S',
    proj4: `+proj=utm +zone=${zona} +south +ellps=intl +towgs84=-206.048,168.279,-3.821,0,0,0,0 +units=m +no_defs`,
    herdado: true,
  };
}

export const SIRGAS2000_GEO: DefinicaoDeCrs = {
  codigo: 'EPSG:4674',
  nome: 'SIRGAS 2000 (latitude/longitude)',
  tipo: 'GEOGRAFICO',
  datum: 'SIRGAS2000',
  proj4: '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs',
};

export const WGS84_GEO: DefinicaoDeCrs = {
  codigo: 'EPSG:4326',
  nome: 'WGS 84 (latitude/longitude)',
  tipo: 'GEOGRAFICO',
  datum: 'WGS84',
  proj4: '+proj=longlat +datum=WGS84 +no_defs',
};

export const SAD69_GEO: DefinicaoDeCrs = {
  codigo: 'EPSG:4618',
  nome: 'SAD 69 (latitude/longitude)',
  tipo: 'GEOGRAFICO',
  datum: 'SAD69',
  proj4: '+proj=longlat +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +no_defs',
  herdado: true,
};

/** O catálogo inteiro, na ordem em que a tela oferece. */
export const CATALOGO_DE_CRS: DefinicaoDeCrs[] = [
  SIRGAS2000_GEO,
  ...ZONAS_DO_BRASIL.map(utmSirgas),
  WGS84_GEO,
  SAD69_GEO,
  ...ZONAS_DO_BRASIL.map(utmSad69),
  ...[21, 22, 23, 24, 25].map(utmCorregoAlegre),
];

const POR_CODIGO = new Map(CATALOGO_DE_CRS.map((c) => [c.codigo.toUpperCase(), c]));

/**
 * Lê o que o usuário escreveu.
 *
 * Aceita o código ("EPSG:31983", "31983"), o nome ("SIRGAS 2000 / UTM 23S") e a
 * forma curta que o topógrafo usa ("UTM 23S", "23S"). A forma curta assume
 * SIRGAS 2000, que é o sistema legal — e o retorno DIZ que assumiu, para a tela
 * poder mostrar.
 */
export interface LeituraDeCrs {
  crs: DefinicaoDeCrs | null;
  /** O que foi assumido, quando o texto não disse tudo. Vazio = nada assumido. */
  assumido: string | null;
  /** Por que não deu, quando `crs` é null. */
  motivo: string | null;
}

export function lerCrs(texto: string | null | undefined): LeituraDeCrs {
  const t = (texto ?? '').trim();
  if (!t) return { crs: null, assumido: null, motivo: null };

  const direto = POR_CODIGO.get(t.toUpperCase());
  if (direto) return { crs: direto, assumido: null, motivo: null };

  // Só dígitos: é um código EPSG sem o prefixo.
  if (/^\d{4,5}$/.test(t)) {
    const comPrefixo = POR_CODIGO.get(`EPSG:${t}`);
    if (comPrefixo) return { crs: comPrefixo, assumido: null, motivo: null };
    return { crs: null, assumido: null, motivo: `EPSG:${t} não está no catálogo. O sistema legal no Brasil é o SIRGAS 2000.` };
  }

  const porNome = CATALOGO_DE_CRS.find((c) => c.nome.toLowerCase() === t.toLowerCase());
  if (porNome) return { crs: porNome, assumido: null, motivo: null };

  // "UTM 23S", "utm23s", "23S", "fuso 23".
  const curta = t.match(/(?:utm\s*|fuso\s*)?(\d{1,2})\s*([sn])?/i);
  if (curta) {
    const zona = Number(curta[1]);
    const hemisferio = (curta[2] ?? 'S').toUpperCase() as 'N' | 'S';
    if (hemisferio === 'N') {
      return { crs: null, assumido: null, motivo: 'Fuso no hemisfério norte: fora do catálogo, que cobre o Brasil ao sul do equador.' };
    }
    const achado = CATALOGO_DE_CRS.find((c) => c.datum === 'SIRGAS2000' && c.zona === zona);
    if (achado) return { crs: achado, assumido: 'SIRGAS 2000 (o sistema legal no Brasil desde 2015)', motivo: null };
    return { crs: null, assumido: null, motivo: `Fuso ${zona} fora dos que cobrem o Brasil (18 a 25).` };
  }

  return { crs: null, assumido: null, motivo: 'Não reconheci o sistema. Escolha na lista ou informe o código EPSG.' };
}

/** Registra no proj4 e devolve o nome para usar nas conversões. */
export function registrar(crs: DefinicaoDeCrs): string {
  proj4.defs(crs.codigo, crs.proj4);
  return crs.codigo;
}

/** Todos de uma vez — chamado uma vez, na borda. */
export function registrarCatalogo(): void {
  for (const c of CATALOGO_DE_CRS) proj4.defs(c.codigo, c.proj4);
}

/** O UTM SIRGAS do fuso que contém esta longitude. */
export function utmSirgasDaLongitude(lon: number): DefinicaoDeCrs | null {
  const zona = zonaDaLongitude(lon);
  return CATALOGO_DE_CRS.find((c) => c.datum === 'SIRGAS2000' && c.zona === zona) ?? null;
}

/**
 * ⚠️ O aviso que evita o erro caro: o fuso informado não contém a longitude.
 *
 * Converter mesmo assim não dá erro nenhum — o resultado sai com a forma
 * perfeita, deslocado por centenas de quilômetros. É o defeito mais difícil de
 * enxergar da cartografia, e o mais fácil de prevenir.
 */
export function conferirFuso(crs: DefinicaoDeCrs, lon: number): string | null {
  if (crs.tipo !== 'PROJETADO' || crs.zona == null) return null;
  const correta = zonaDaLongitude(lon);
  if (correta === crs.zona) return null;
  return `A longitude ${lon.toFixed(4)}° fica no fuso ${correta}, e o sistema escolhido é o fuso ${crs.zona}. Converter assim desloca o desenho em centenas de quilômetros, sem deformá-lo — confira o fuso antes de seguir.`;
}
