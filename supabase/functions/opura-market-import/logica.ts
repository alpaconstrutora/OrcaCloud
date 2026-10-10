// supabase/functions/opura-market-import/logica.ts
//
// Regras PURAS da importação de anúncios do ÒPURA Market: ler o feed VRSync,
// casar o nome do bairro, montar a consulta de geocodificação e traduzir o
// resultado em precisão. Sem `import` nenhum, de propósito: a Edge Function
// (Deno) importa este arquivo e o Vitest testa o MESMO arquivo — o desenho de
// `_shared/origemDoLancamento.ts`.
//
// Plano: docs/planos/2026-10-07-opura-market-intelligence.md, Fase 3 revisada (D7).
//
// As duas correções que a Fase 2 encontrou moram aqui:
//   1. geocodificar pelo ENDEREÇO (rua + número + bairro + cidade/UF), e dizer a
//      precisão do resultado — antes o robô geocodificava pelo nome do bairro e
//      gravava o ponto como se fosse do imóvel;
//   2. bairro que não casa com um cadastrado fica SEM bairro, com o nome original
//      guardado — antes o robô jogava todo bairro desconhecido no "Centro".

/** De onde veio a coordenada gravada. */
export type Precisao = 'fonte' | 'endereco' | 'rua' | 'bairro' | 'nao_encontrado';

export interface BairroConhecido {
  id: string;
  name: string;
}

/** Caixa, acento, pontuação e espaço repetido não distinguem bairro. */
export function normalizarNome(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Casa o nome bruto com um bairro cadastrado da cidade. Só igualdade após
 * normalizar — sem "contém", sem coringa. Não casou = null, e quem chama guarda
 * o nome bruto para o cadastro de bairros (Fase 4) aproveitar.
 */
export function casarBairro(nomeBruto: string | null | undefined, bairros: BairroConhecido[]): string | null {
  const alvo = normalizarNome(nomeBruto);
  if (!alvo) return null;
  return bairros.find((b) => normalizarNome(b.name) === alvo)?.id ?? null;
}

/** "Vale do Sol, Cambuí-MG" → "Vale do Sol" (o formato do robô antigo). */
export function bairroDoEndereco(endereco: string | null | undefined): string | null {
  const primeiro = (endereco ?? '').split(',')[0]?.trim() ?? '';
  return primeiro || null;
}

/**
 * O endereço gravado é só "Bairro, Cidade-UF"? Era o caso de todo anúncio do
 * robô: o portal nunca informou a rua. Aí a geocodificação só pode ser do bairro.
 */
export function enderecoEhSoBairro(endereco: string | null | undefined, cidade: string, uf: string): boolean {
  const partes = (endereco ?? '').split(',').map((p) => normalizarNome(p)).filter(Boolean);
  if (partes.length !== 2) return false;
  const resto = partes[1];
  const c = normalizarNome(cidade);
  const u = normalizarNome(uf);
  return resto === c || resto === `${c} ${u}`;
}

// ── Feed VRSync (padrão ZAP / VivaReal / OLX) ────────────────────────────────

export interface AnuncioLido {
  url: string | null;
  titulo: string | null;
  tipo: string;
  preco: number;
  area: number | null;
  areaTotal: number | null;
  quartos: number;
  banheiros: number;
  suites: number;
  vagas: number;
  condominio: number | null;
  iptu: number | null;
  descricao: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  /** O site esconde o preço, mas os dados da página ou da API trazem (decisão F1 do plano de fontes). */
  precoOcultoNaFonte?: boolean;
}

export interface FeedLido {
  anuncios: AnuncioLido[];
  /** motivo → quantidade (só aluguel, sem preço de venda). */
  ignorados: Record<string, number>;
}

function decodificar(texto: string): string {
  return texto
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(bloco: string, nome: string): string | null {
  const m = new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)</${nome}>`, 'i').exec(bloco);
  if (!m) return null;
  const v = decodificar(m[1]);
  return v === '' ? null : v;
}

function atributo(bloco: string, nome: string, attr: string): string | null {
  const m = new RegExp(`<${nome}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`, 'i').exec(bloco);
  return m ? decodificar(m[1]) || null : null;
}

function numero(texto: string | null): number | null {
  if (texto == null) return null;
  const n = Number(String(texto).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function inteiro(texto: string | null): number {
  const n = numero(texto);
  return n != null && n >= 0 ? Math.round(n) : 0;
}

/** "Residential / Apartment" → "Apartamento". */
export function tipoDoImovel(propertyType: string | null): string {
  const t = (propertyType ?? '').toLowerCase();
  if (/apartment|flat|penthouse|studio|kitnet/.test(t)) return 'Apartamento';
  if (/land|lot|farm|ranch|terreno/.test(t)) return 'Terreno';
  if (/commercial|office|business|building|warehouse|store|loja|sala/.test(t)) return 'Comercial';
  if (/home|house|condo|sobrado|village|casa/.test(t)) return 'Casa';
  return 'Outro';
}

/** Coordenada plausível: dentro dos limites e não o (0, 0) de campo vazio. */
export function coordenadaValida(lat: number | null, lng: number | null): boolean {
  return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export function lerFeedVrsync(xml: string): FeedLido {
  const blocos = [...xml.matchAll(/<Listing\b[^>]*>([\s\S]*?)<\/Listing>/gi)].map((m) => m[1]);
  if (blocos.length === 0) {
    throw new Error('O arquivo não parece um feed VRSync: nenhum <Listing> encontrado.');
  }

  const anuncios: AnuncioLido[] = [];
  const ignorados: Record<string, number> = {};
  const ignorar = (motivo: string) => { ignorados[motivo] = (ignorados[motivo] ?? 0) + 1; };

  for (const b of blocos) {
    const transacao = (tag(b, 'TransactionType') ?? '').toLowerCase();
    if (transacao && !/sale/.test(transacao)) { ignorar('só aluguel'); continue; }

    const preco = numero(tag(b, 'ListPrice'));
    if (preco == null || preco <= 0) { ignorar('sem preço de venda'); continue; }

    const local = tag(b, 'Location') ?? '';
    const lat = numero(tag(local, 'Latitude'));
    const lng = numero(tag(local, 'Longitude'));
    const valida = coordenadaValida(lat, lng);

    anuncios.push({
      url: tag(b, 'DetailViewUrl'),
      titulo: tag(b, 'Title'),
      tipo: tipoDoImovel(tag(b, 'PropertyType')),
      preco,
      area: numero(tag(b, 'LivingArea')),
      areaTotal: numero(tag(b, 'LotArea')),
      quartos: inteiro(tag(b, 'Bedrooms')),
      banheiros: inteiro(tag(b, 'Bathrooms')),
      suites: inteiro(tag(b, 'Suites')),
      vagas: inteiro(tag(b, 'Garage')),
      condominio: numero(tag(b, 'PropertyAdministrationFee')),
      iptu: numero(tag(b, 'YearlyTax')),
      descricao: tag(b, 'Description'),
      rua: tag(local, 'Address'),
      numero: tag(local, 'StreetNumber'),
      bairro: tag(local, 'Neighborhood'),
      cidade: tag(local, 'City'),
      uf: atributo(local, 'State', 'abbreviation') ?? tag(local, 'State'),
      cep: tag(local, 'PostalCode'),
      lat: valida ? lat : null,
      lng: valida ? lng : null,
    });
  }
  return { anuncios, ignorados };
}

// ── Geocodificação ───────────────────────────────────────────────────────────
//
// Provedor: Photon (photon.komoot.io), geocodificador público sobre os dados do
// OpenStreetMap. Medido em 07/10/2026: o Nominatim público responde HTTP 403 a
// chamadas vindas da Supabase (bloqueio de IP de nuvem); o Photon responde e
// acha as ruas e bairros de Cambuí. Mas ele APROXIMA: "Rua Tiradentes 80"
// caiu numa rua da cidade de Tiradentes, a 200 km. Por isso duas travas:
// a cidade do resultado tem de ser a pedida, e o nome procurado tem de estar
// no nome do resultado.

export interface ConsultaGeo {
  /** Texto da busca. */
  q: string;
  /** O que precisa aparecer no nome do resultado (normalizado), ex.: "tiradentes". */
  alvo: string;
  /** A consulta tem rua? Sem rua, o melhor resultado possível é o bairro. */
  temRua: boolean;
}

const ESTADOS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

/** "MG" → "Minas Gerais". */
export function estadoPorExtenso(uf: string | null | undefined): string {
  const t = (uf ?? '').trim();
  return ESTADOS[t.toUpperCase()] ?? t;
}

const TIPO_DE_VIA = /^(rua|r\.|avenida|av\.?|travessa|tv\.?|alameda|al\.|estrada|est\.|rodovia|rod\.|pra[cç]a|p[cç]a\.?|largo|beco|viela)\s+/i;

/** "Avenida Tiradentes" → "Tiradentes". */
export function semTipoDeVia(nome: string): string {
  return nome.replace(TIPO_DE_VIA, '').trim();
}

/** "Rua Tiradentes, 80" → nome "Rua Tiradentes", número "80". O número explícito vence. */
export function separarNumero(rua: string | null | undefined, numero?: string | null): { nome: string; numero: string | null } {
  const t = (rua ?? '').trim();
  const m = /^(.*?)[,\s]+(?:n[ºo°]?\.?\s*)?(\d+[a-z]?)\s*$/i.exec(t);
  const nome = (m ? m[1] : t).replace(/[,\s]+$/, '').trim();
  const n = (numero ?? '').toString().trim() || (m ? m[2] : '');
  return { nome, numero: n || null };
}

/**
 * Tentativas em ordem, da mais precisa para a menos: rua com número, rua sem
 * número, rua sem o tipo ("Rua Tiradentes" não existe no mapa de Cambuí,
 * "Avenida Tiradentes" sim, e "Tiradentes" acha a avenida — medido em
 * 07/10/2026) e, por fim, o bairro. Sem rua e sem bairro não há tentativa: o
 * centro da cidade não diz nada sobre a vizinhança do imóvel e entraria na
 * análise de raio errado.
 */
export function consultasDeEndereco(e: {
  rua?: string | null; numero?: string | null; bairro?: string | null; cidade: string; uf: string;
}): ConsultaGeo[] {
  const local = `${e.cidade}, ${estadoPorExtenso(e.uf)}`;
  const lista: ConsultaGeo[] = [];
  const { nome, numero } = separarNumero(e.rua, e.numero);
  if (nome) {
    const semTipo = semTipoDeVia(nome);
    const alvo = normalizarNome(semTipo || nome);
    if (numero) lista.push({ q: `${nome} ${numero}, ${local}`, alvo, temRua: true });
    lista.push({ q: `${nome}, ${local}`, alvo, temRua: true });
    if (semTipo && semTipo !== nome) lista.push({ q: `${semTipo}, ${local}`, alvo, temRua: true });
  }
  const bairro = (e.bairro ?? '').trim();
  if (bairro) lista.push({ q: `${bairro}, ${local}`, alvo: normalizarNome(bairro), temRua: false });
  return lista;
}

/** Um "feature" da resposta GeoJSON do Photon. */
export interface ResultadoPhoton {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    type?: string;
    name?: string;
    street?: string;
    city?: string;
    county?: string;
    locality?: string;
    district?: string;
    state?: string;
  };
}

export interface Localizacao {
  lat: number;
  lng: number;
  precisao: 'endereco' | 'rua' | 'bairro';
}

const PALAVRAS_DE_LIGACAO = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Cada palavra procurada (sem "de/da/do…" e sem letra solta) tem de ser o COMEÇO
 * de uma palavra do nome do resultado. "Davi Bueno" casa com "Rua Prefeito David
 * Bueno" (medido em 07/10/2026: a trava por texto literal perdia esse caso);
 * "Cap Zeferino" casa com "Capitão Zeferino"; "Padre Caramuru" não casa com
 * "Avenida Tiradentes".
 */
export function nomeContem(nomeDoResultado: string, alvo: string): boolean {
  const resultado = normalizarNome(nomeDoResultado).split(' ').filter(Boolean);
  const procuradas = normalizarNome(alvo).split(' ').filter((p) => p.length >= 2 && !PALAVRAS_DE_LIGACAO.has(p));
  if (procuradas.length === 0) return false;
  return procuradas.every((p) => resultado.some((r) => r.startsWith(p)));
}

/** O primeiro resultado do Photon que passa pelas travas (a busca pede 3). */
export function primeiraLocalizacao(resultados: ResultadoPhoton[] | null | undefined, consulta: ConsultaGeo, cidade: string): Localizacao | null {
  for (const r of resultados ?? []) {
    const loc = localizacaoDoResultado(r, consulta, cidade);
    if (loc) return loc;
  }
  return null;
}

/**
 * Traduz um resultado do Photon. Tipo house/street = rua; locality,
 * district = bairro/localidade; city ou maior = descartado. Travas: cidade
 * exata e nome procurado contido no nome do resultado.
 */
export function localizacaoDoResultado(r: ResultadoPhoton | null | undefined, consulta: ConsultaGeo, cidade: string): Localizacao | null {
  const c = r?.geometry?.coordinates;
  const p = r?.properties;
  if (!c || !p) return null;
  const [lng, lat] = c;
  if (!coordenadaValida(lat, lng)) return null;

  const alvoCidade = normalizarNome(cidade);
  if (normalizarNome(p.city) !== alvoCidade && normalizarNome(p.county) !== alvoCidade) return null;

  if (!nomeContem(`${p.name ?? ''} ${p.street ?? ''}`, consulta.alvo)) return null;

  const tipo = (p.type ?? '').toLowerCase();
  // Número achado (house) = endereco; só a rua (street) = rua. Ponto de rua é dividido
  // por imóveis diferentes e por isso não serve para detectar duplicado (Fase 4).
  if (tipo === 'house') return { lat, lng, precisao: consulta.temRua ? 'endereco' : 'bairro' };
  if (tipo === 'street') return { lat, lng, precisao: consulta.temRua ? 'rua' : 'bairro' };
  if (tipo === 'locality' || tipo === 'district') return { lat, lng, precisao: 'bairro' };
  return null;
}

// ── URL do feed ──────────────────────────────────────────────────────────────

/**
 * Só https e só host público. A function busca a URL com a rede do servidor:
 * aceitar "http://localhost" ou um IP interno deixaria qualquer membro usar a
 * function para sondar a rede do provedor.
 */
export function urlDeFeedPermitida(texto: string, doQue = 'do feed'): { ok: true; url: URL } | { ok: false; motivo: string } {
  let url: URL;
  try { url = new URL(texto.trim()); } catch { return { ok: false, motivo: `Link ${doQue} inválido.` }; }
  if (url.protocol !== 'https:') return { ok: false, motivo: `O link ${doQue} precisa começar com https://.` };
  const host = url.hostname.toLowerCase();
  const interno =
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || !host.includes('.');
  if (interno) return { ok: false, motivo: `Use o endereço público ${doQue} (nome de domínio, não IP ou endereço interno).` };
  return { ok: true, url };
}

/**
 * Anúncios de um feed SALVO que deixaram de vir no XML (item 1 do plano
 * docs/planos/2026-10-10-opura-market-pendencias.md). A saída de anúncio é a
 * medida de demanda dos indicadores do bairro (item 3): anúncio que some do feed
 * foi vendido ou retirado — não temos dado de venda, só isso.
 *
 * ⚠️ Feed que chega sem NENHUM anúncio da cidade não derruba ninguém: é muito
 * mais provável o feed ter quebrado ou mudado do que a praça inteira ter sido
 * vendida num dia. Marcar tudo como saída inventaria demanda.
 *
 * Anúncio sem URL não tem como ser reconhecido no feed seguinte: fica como está.
 */
export function anunciosQueSairam(
  ativos: { id: string; url: string | null }[],
  urlsNoFeed: (string | null | undefined)[],
): { ids: string[]; ignorado: string | null } {
  const presentes = new Set(urlsNoFeed.filter((u): u is string => !!u));
  if (presentes.size === 0) return { ids: [], ignorado: 'o feed não trouxe nenhum anúncio desta cidade; saídas não registradas' };
  return { ids: ativos.filter((a) => a.url && !presentes.has(a.url)).map((a) => a.id), ignorado: null };
}

// ── Item 2 do plano 2026-10-10-opura-market-pendencias: localização ─────────

/**
 * O `address` gravado do feed é "rua, número, bairro" (ver `gravarFeed`). Até
 * 10/10/2026 o modo 'localizar' mandava esse texto inteiro como RUA: o número
 * não era separado (não está no fim) e as palavras do bairro iam para a trava de
 * nome, que então não casava com resultado nenhum. Aqui o bairro conhecido sai
 * do fim e o número é separado.
 */
export function partesDoEndereco(endereco: string | null | undefined, bairro: string | null | undefined): { rua: string | null; numero: string | null } {
  const partes = (endereco ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const bairroNorm = normalizarNome(bairro);
  // O bairro sai do fim — e, se for a ÚNICA parte, não sobra rua: buscar o nome do
  // bairro como rua casaria com uma "Rua do Centro" qualquer, com precisão errada.
  if (bairroNorm && partes.length > 0 && normalizarNome(partes[partes.length - 1]) === bairroNorm) partes.pop();
  let numero: string | null = null;
  if (partes.length > 1 && /^(?:n[ºo°]?\.?\s*)?\d+[a-z]?$/i.test(partes[partes.length - 1])) {
    numero = (partes.pop() as string).replace(/^n[ºo°]?\.?\s*/i, '');
  }
  const rua = partes.join(', ').trim();
  return { rua: rua || null, numero };
}

/** Da mais exata para a menos. 'manual' é a posição que um usuário marcou no mapa. */
export const ORDEM_DE_PRECISAO = ['fonte', 'manual', 'endereco', 'rua', 'bairro', 'nao_encontrado'] as const;
export type PrecisaoGravada = (typeof ORDEM_DE_PRECISAO)[number];

/** A nova posição é melhor que a atual? Nunca troca por igual nem por pior. */
export function precisaoMelhor(nova: string | null | undefined, atual: string | null | undefined): boolean {
  const i = ORDEM_DE_PRECISAO.indexOf(nova as PrecisaoGravada);
  if (i < 0) return false;
  const j = ORDEM_DE_PRECISAO.indexOf(atual as PrecisaoGravada);
  return j < 0 || i < j;
}

/** "37600-000" → "37600000"; qualquer coisa que não tenha 8 dígitos → null. */
export function cepValido(cep: string | null | undefined): string | null {
  const d = (cep ?? '').replace(/\D/g, '');
  return d.length === 8 && !/^0+$/.test(d) ? d : null;
}

/**
 * Rua e bairro a partir da resposta de CEP — ViaCEP (`logradouro`, `bairro`,
 * `localidade`) ou BrasilAPI (`street`, `neighborhood`, `city`). O CEP nunca
 * vira coordenada: só dá o NOME da rua para a busca. CEP de outra cidade é
 * descartado (feed com CEP errado não pode puxar o anúncio para longe).
 */
export function ruaDoCep(resposta: Record<string, unknown> | null | undefined, cidade: string): { rua: string | null; bairro: string | null } | null {
  if (!resposta || resposta.erro) return null;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const cidadeDoCep = texto(resposta.localidade) ?? texto(resposta.city);
  if (!cidadeDoCep || normalizarNome(cidadeDoCep) !== normalizarNome(cidade)) return null;
  const rua = texto(resposta.logradouro) ?? texto(resposta.street);
  const bairro = texto(resposta.bairro) ?? texto(resposta.neighborhood);
  if (!rua && !bairro) return null;
  return { rua, bairro };
}

/**
 * Tentativas em ordem: a rua do próprio anúncio, a rua do CEP (se for outra) e,
 * por último, o bairro. Sem repetir a mesma busca.
 */
export function consultasComCep(e: {
  rua?: string | null; numero?: string | null; bairro?: string | null; cidade: string; uf: string;
  cep?: { rua: string | null; bairro: string | null } | null;
}): ConsultaGeo[] {
  const pelaRua = consultasDeEndereco({ rua: e.rua, numero: e.numero, cidade: e.cidade, uf: e.uf });
  const ruaCep = e.cep?.rua ?? null;
  const pelaRuaDoCep = ruaCep && normalizarNome(semTipoDeVia(ruaCep)) !== normalizarNome(semTipoDeVia(separarNumero(e.rua).nome))
    ? consultasDeEndereco({ rua: ruaCep, numero: e.numero, cidade: e.cidade, uf: e.uf })
    : [];
  const pelaBairro = consultasDeEndereco({ bairro: e.bairro || e.cep?.bairro || null, cidade: e.cidade, uf: e.uf });
  const vistas = new Set<string>();
  return [...pelaRua, ...pelaRuaDoCep, ...pelaBairro].filter((c) => (vistas.has(c.q) ? false : (vistas.add(c.q), true)));
}

// ── Fontes (plano 2026-10-10-opura-market-fontes, Fase A) ───────────────────

/** Conectores conhecidos. O texto é o que a tela mostra. */
export const TIPOS_DE_FONTE = {
  vrsync: 'Feed XML (VRSync)',
  api_conexao381: 'API do site da Conexão 381',
  portal_zap: 'ZAP Imóveis e VivaReal',
  portal_olx: 'OLX',
} as const;
export type TipoDeFonte = keyof typeof TIPOS_DE_FONTE;

/**
 * Codificação do texto a partir do Content-Type (e, sem ele, de um
 * `<meta charset>` no começo do HTML). Sites de imobiliária na plataforma
 * ImobiBrasil servem ISO-8859-1: lido como UTF-8, "Cambuí" vira "Cambu�"
 * e a cidade deixa de casar com a praça.
 */
export function charsetDaResposta(contentType: string | null | undefined, inicioDoCorpo = ''): string {
  const doCabecalho = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const doMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(inicioDoCorpo)?.[1];
  const bruto = (doCabecalho ?? doMeta ?? 'utf-8').toLowerCase();
  if (/^(iso-?8859-?1|latin-?1|windows-?1252|cp1252)$/.test(bruto)) return 'windows-1252';
  if (/^utf-?8$/.test(bruto)) return 'utf-8';
  return bruto;
}

/** Dois links apontam para a mesma fonte? (host sem www e caixa, sem barra final, sem #) */
export function mesmaUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (t: string | null | undefined) => {
    try {
      const u = new URL((t ?? '').trim());
      u.hash = '';
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const caminho = u.pathname.replace(/\/+$/, '') || '/';
      return `${u.protocol}//${host}${caminho}${u.search}`;
    } catch {
      return null;
    }
  };
  const na = norm(a);
  return na != null && na === norm(b);
}

/** Meia-noite UTC do dia de `agora`: o cron pega só fontes que não rodaram hoje. */
export function inicioDoDiaUtc(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString();
}

// ── Anúncio pelo link (plano 2026-10-10-opura-market-fontes, Fase B) ────────
//
// O usuário cola o link de um anúncio; a function baixa a página e estas regras
// tiram dela o que der. A ordem: o leitor específico do site (ZAP/VivaReal, OLX,
// sites Arbo, API da Conexão 381), depois os dados estruturados (JSON-LD), por
// último o título da página. O resultado SEMPRE passa pela conferência na tela
// antes de gravar: o site pode chamar o terreno de "área" (visto no WordPress da
// Imobiliária Sul Minas) e só quem lê o anúncio sabe.
//
// Amostras reais de 10/10/2026: ZAP e VivaReal (o mesmo anúncio, mesmo id), OLX,
// imobiliariasulminas.com.br (WordPress), imoveiscambui.com.br (ImobiBrasil),
// wandreimoveis.com.br (Arbo) e a API da Conexão 381.

/** O anúncio lido de uma página, com o que faltou e o que merece aviso. */
export interface AnuncioDaPagina {
  anuncio: AnuncioLido;
  /** Nome do site para a coluna `source` ("ZAP Imóveis", "OLX", o og:site_name…). */
  site: string;
  /** Quem achou os dados: 'zap', 'olx', 'arbo', 'conexao381', 'json-ld', 'titulo' ou 'nenhum'. */
  leitor: string;
  /** Campos que a gravação exige ou que as médias usam e não vieram. */
  faltando: string[];
  avisos: string[];
}

/**
 * Pontos que sites usam como "centro da cidade" quando o anúncio não tem
 * posição. Gravá-los como posição da FONTE poria o anúncio no lugar errado com a
 * maior precisão. Medido em 10/10/2026: OLX, Arbo e a Conexão 381 usam o mesmo
 * ponto para Cambuí.
 */
export const PONTOS_PADRAO_DE_CIDADE: { lat: number; lng: number; onde: string }[] = [
  { lat: -22.6100267, lng: -46.0576301, onde: 'Cambuí-MG' },
];

/** A coordenada é o ponto padrão de uma cidade (a ~30 m)? */
export function pontoPadraoDeCidade(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  return PONTOS_PADRAO_DE_CIDADE.some((p) => Math.abs(p.lat - lat) < 0.0003 && Math.abs(p.lng - lng) < 0.0003);
}

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", sup2: '²', sup3: '³', ordm: 'º', ordf: 'ª', deg: '°',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ', acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  agrave: 'à', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', ndash: '–', mdash: '—', hellip: '…',
};

/** Entidades HTML (nomeadas comuns e numéricas) → texto. */
export function textoDeHtml(texto: string | null | undefined): string {
  return (texto ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+\d?);/gi, (m, nome) => ENTIDADES[nome] ?? m);
}

/** Texto limpo ou null ('' e o "$undefined" do Next.js viram null). */
function textoLimpo(v: unknown, max = 500): string | null {
  if (v == null || typeof v === 'object') return null;
  const t = textoDeHtml(String(v)).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (!t || t === '$undefined' || t === 'null') return null;
  return t.slice(0, max);
}

/**
 * Número em formato brasileiro ou de máquina: "R$ 320.000" → 320000,
 * "R$ 1.234,56" → 1234.56, "550000.00" → 550000, "174m²" → 174.
 */
export function numeroBr(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /-?\d[\d.,]*/.exec(v.replace(/\s/g, ''));
  if (!m) return null;
  let t = m[0].replace(/[.,]$/, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Só número maior que zero: área 0 ou condomínio 0 no site é "não informado". */
function positivo(v: unknown): number | null {
  const n = numeroBr(v);
  return n != null && n > 0 ? n : null;
}

const TIPOS_NO_TEXTO: [RegExp, string][] = [
  [/\b(apartamento|apto|cobertura|kitnet|kitinete|flat|studio|apartment|penthouse)/i, 'Apartamento'],
  [/\b(casas?|sobrados?|chal[eé]s?|house|home)\b/i, 'Casa'],
  [/\b(terreno|lote|ch[aá]cara|s[ií]tio|fazenda|land|allotment)/i, 'Terreno'],
  [/\b(salas? comerc|lojas?\b|galp[aã]o|barrac[aã]o|pr[eé]dio comercial|ponto comercial|im[oó]vel comercial|office|commercial)/i, 'Comercial'],
];

/**
 * Tipo pelo texto: vale o tipo que aparece PRIMEIRO. "Casa com terreno de
 * 600 m²" é casa; "Terreno com casa" é terreno.
 */
export function tipoDoTexto(texto: string | null | undefined): string | null {
  let melhor: { i: number; tipo: string } | null = null;
  for (const [re, tipo] of TIPOS_NO_TEXTO) {
    const m = re.exec(texto ?? '');
    if (m && (!melhor || m.index < melhor.i)) melhor = { i: m.index, tipo };
  }
  return melhor?.tipo ?? null;
}

type Parcial = Partial<AnuncioLido>;

/**
 * O que o TÍTULO do anúncio diz ("Casa para Venda, 3 dormitórios, sendo 1
 * suíte, 4 vagas, área total 250 m², área construída 260 m²"). Só o título:
 * a descrição fala de vizinhos, de outro imóvel, de "a 200 m da praça".
 */
export function dadosDoTitulo(titulo: string | null | undefined): Parcial {
  const t = textoDeHtml(titulo ?? '');
  if (!t.trim()) return {};
  const num = (re: RegExp) => { const m = re.exec(t); return m ? numeroBr(m[1]) : null; };
  const area = num(/[áa]rea\s*(?:[úu]til|constru[íi]da|privativa)\s*(?:de\s*)?(\d[\d.,]*)\s*m/i);
  const areaTotal = num(/[áa]rea\s*(?:total|do terreno)\s*(?:de\s*)?(\d[\d.,]*)\s*m/i);
  const qualquerArea = area == null && areaTotal == null ? num(/(\d[\d.,]*)\s*m(?:²|2\b)/i) : null;
  const bairro =
    /\bno bairro\s+([^,.;]+?)(?:\s*,|\s+em\s|\s*-|$)/i.exec(t)?.[1] ??
    /\s-\s([^-]+?)\s-\s[^-/]+\/[A-Z]{2}\s*$/.exec(t)?.[1] ?? null;
  const preco = num(/R\$\s*(\d[\d.]*(?:,\d{2})?)/);
  return {
    tipo: tipoDoTexto(t) ?? undefined,
    area: area ?? qualquerArea,
    areaTotal,
    quartos: num(/(\d+)\s*(?:quartos?|dormit[óo]rios?|dorms?\b)/i) ?? undefined,
    suites: num(/(\d+)\s*su[íi]tes?/i) ?? undefined,
    banheiros: num(/(\d+)\s*banheiros?/i) ?? undefined,
    vagas: num(/(\d+)\s*vagas?/i) ?? undefined,
    bairro: bairro ? bairro.trim() : null,
    preco: preco ?? undefined,
  };
}

/** "Cambuí - MG", "Cambuí/MG", "Cambuí-MG" → cidade e UF. */
function cidadeEUf(texto: string | null): { cidade: string | null; uf: string | null } {
  if (!texto) return { cidade: null, uf: null };
  const m = /^(.+?)\s*[-/,]\s*([A-Za-z]{2})$/.exec(texto.trim());
  return m ? { cidade: m[1].trim(), uf: m[2].toUpperCase() } : { cidade: texto.trim(), uf: null };
}

/** "Minas Gerais" → "MG"; "MG" → "MG". */
function siglaDoEstado(texto: string | null): string | null {
  if (!texto) return null;
  if (/^[A-Za-z]{2}$/.test(texto.trim())) return texto.trim().toUpperCase();
  const alvo = normalizarNome(texto);
  return Object.keys(ESTADOS).find((uf) => normalizarNome(ESTADOS[uf]) === alvo) ?? null;
}

/** Coordenada aproveitável da fonte: válida e não o centro padrão da cidade. */
function posicao(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } {
  const a = numeroBr(lat);
  const b = numeroBr(lng);
  return coordenadaValida(a, b) && !pontoPadraoDeCidade(a, b) ? { lat: a, lng: b } : { lat: null, lng: null };
}

/** Objeto JSON começando em `inicio` (a chave de abertura), respeitando strings. */
export function objetoJsonEm(texto: string, inicio: number): string | null {
  if (texto[inicio] !== '{') return null;
  let prof = 0;
  let emTexto = false;
  let escape = false;
  for (let j = inicio; j < texto.length; j++) {
    const c = texto[j];
    if (emTexto) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return texto.slice(inicio, j + 1);
  }
  return null;
}

function hostSemWww(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/** Id do anúncio no grupo ZAP (ZAP Imóveis e VivaReal usam o mesmo): "...-id-2833700148/". */
export function idDoGrupoZap(url: string): string | null {
  const host = hostSemWww(url);
  if (!/(^|\.)(zapimoveis\.com\.br|vivareal\.com\.br)$/.test(host)) return null;
  return /-id-(\d{5,})/.exec(url)?.[1] ?? /\/id-(\d{5,})/.exec(url)?.[1] ?? null;
}

/** Link estável do grupo ZAP: o mesmo para ZAP e VivaReal; o site redireciona à página. */
export function urlDoGrupoZap(id: string): string {
  return `https://www.zapimoveis.com.br/imovel/id-${id}/`;
}

/** Código do anúncio na Conexão 381: "https://conexao381.com.br/imoveis/01006". */
export function codigoConexao381(url: string): string | null {
  if (hostSemWww(url) !== 'conexao381.com.br') return null;
  try {
    return /^\/imoveis\/([A-Za-z0-9-]+)\/?$/.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * O que buscar para ler o anúncio colado. VivaReal responde 403 a leitura
 * automática (10/10/2026) e o ZAP não: o mesmo anúncio é lido pela página do
 * ZAP. A Conexão 381 é um site de JavaScript: o anúncio vem da API pública.
 */
export function urlDeLeitura(url: string): { url: string; formato: 'html' | 'json-conexao381' } {
  const id = idDoGrupoZap(url);
  if (id) return { url: urlDoGrupoZap(id), formato: 'html' };
  const codigo = codigoConexao381(url);
  if (codigo) return { url: `https://conexao381.com.br/api/public-property-by-code/${encodeURIComponent(codigo)}`, formato: 'json-conexao381' };
  return { url, formato: 'html' };
}

/**
 * Link que identifica o anúncio para não duplicar: o canônico da página, se for
 * do mesmo site; senão o colado. Sem "#", sem utm_*, fbclid e gclid.
 */
export function urlEstavel(colada: string, canonica?: string | null): string {
  const limpar = (u: URL) => {
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  };
  let base: URL;
  try { base = new URL(colada.trim()); } catch { return colada.trim(); }
  if (canonica) {
    try {
      const c = new URL(/^www\./i.test(canonica.trim()) ? `https://${canonica.trim()}` : canonica.trim());
      if (/^https?:$/.test(c.protocol) && hostSemWww(c.toString()) === hostSemWww(base.toString())) return limpar(c);
    } catch {
      // canônico inválido: fica o colado
    }
  }
  return limpar(base);
}

const SITES_CONHECIDOS: [RegExp, string][] = [
  [/(^|\.)zapimoveis\.com\.br$/, 'ZAP Imóveis'],
  [/(^|\.)vivareal\.com\.br$/, 'VivaReal'],
  [/(^|\.)olx\.com\.br$/, 'OLX'],
  [/(^|\.)conexao381\.com\.br$/, 'Conexão 381'],
];

/** Nome do site: o conhecido pelo host, senão o og:site_name, senão o host. */
export function nomeDoSite(url: string, ogSiteName?: string | null): string {
  const host = hostSemWww(url);
  const conhecido = SITES_CONHECIDOS.find(([re]) => re.test(host))?.[1];
  if (conhecido) return conhecido;
  // "Wandré Imóveis em Extrema, Minas Gerais | Encontre Seu Lar Ideal": slogan não é nome.
  const og = (textoLimpo(ogSiteName, 200) ?? '').split(/\s[|–—-]\s/)[0].trim();
  return (og && og.length <= 40 ? og : host) || 'Link de anúncio';
}

/**
 * Bairro cadastrado citado no texto ("CASA no Vale do Sol Em Cambuí-MG"), para
 * o anúncio que não traz o campo bairro. Palavra inteira, o nome mais longo
 * ganha ("Vila Nova" antes de "Nova"). A tela mostra como sugestão a conferir.
 */
export function bairroNoTexto(texto: string | null | undefined, bairros: BairroConhecido[]): BairroConhecido | null {
  const alvo = ` ${normalizarNome(texto)} `;
  if (!alvo.trim()) return null;
  let melhor: BairroConhecido | null = null;
  for (const b of bairros) {
    const nome = normalizarNome(b.name);
    if (nome && alvo.includes(` ${nome} `) && (!melhor || nome.length > normalizarNome(melhor.name).length)) melhor = b;
  }
  return melhor;
}

function metaDe(html: string, nome: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tagMeta = m[0];
    const chave = /\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tagMeta)?.[1];
    if (chave && chave.toLowerCase() === nome.toLowerCase()) {
      return textoLimpo(/\bcontent\s*=\s*"([^"]*)"/i.exec(tagMeta)?.[1] ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tagMeta)?.[1], 5000);
    }
  }
  return null;
}

function canonicaDe(html: string): string | null {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/\brel\s*=\s*["']canonical["']/i.test(m[0])) return /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1] ?? null;
  }
  return null;
}

// ZAP Imóveis e VivaReal: o anúncio inteiro está no payload do Next.js
// (self.__next_f.push), como texto JSON escapado dentro de strings.
function lerGrupoZap(html: string, avisos: string[]): Parcial | null {
  let payload = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { payload += JSON.parse(m[1]); } catch { /* pedaço que não é texto */ }
  }
  const i = payload.indexOf('"listing":{');
  if (i < 0) return null;
  // deno-lint-ignore no-explicit-any
  let l: any;
  try { l = JSON.parse(objetoJsonEm(payload, i + '"listing":'.length) ?? ''); } catch { return null; }
  const venda = l?.prices?.sale;
  if (!venda) avisos.push('O anúncio não tem preço de venda no site (pode ser só aluguel).');
  const am = l?.amenities ?? {};
  const ad = l?.address ?? {};
  const primeiro = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const coordenadas = ad.coordinates && typeof ad.coordinates === 'object' ? ad.coordinates : null;
  // Posição "aproximada" é o centro do bairro que o portal mostra: não é do imóvel.
  const pos = ad.isApproximateLocation === false && coordenadas ? posicao(coordenadas.lat, coordenadas.lon ?? coordenadas.lng) : { lat: null, lng: null };
  if (ad.isApproximateLocation !== false) avisos.push('O portal mostra só a localização aproximada: a posição será buscada pelo endereço ou pelo bairro.');
  return {
    url: l?.id ? urlDoGrupoZap(String(l.id)) : null,
    titulo: textoLimpo(l?.title, 300),
    descricao: textoLimpo(l?.description, 5000),
    tipo: l?.unitType ? tipoDoImovel(String(l.unitType)) : undefined,
    preco: positivo(venda?.value) ?? undefined,
    condominio: positivo(venda?.condominium),
    iptu: positivo(venda?.iptu),
    area: positivo(primeiro(am.usableAreas)),
    areaTotal: positivo(primeiro(am.totalAreas)),
    quartos: positivo(primeiro(am.bedrooms)) ?? undefined,
    banheiros: positivo(primeiro(am.bathrooms)) ?? undefined,
    suites: positivo(primeiro(am.suites)) ?? undefined,
    vagas: positivo(primeiro(am.parkingSpaces)) ?? undefined,
    rua: textoLimpo(ad.street),
    numero: textoLimpo(ad.streetNumber, 20),
    bairro: textoLimpo(ad.neighborhood),
    cidade: textoLimpo(ad.city),
    uf: textoLimpo(ad.stateAcronym, 2) ?? siglaDoEstado(textoLimpo(ad.state)),
    cep: textoLimpo(ad.zipCode, 9),
    ...pos,
  };
}

// OLX: `<script id="initial-data" data-json="…">` com o anúncio (atributo HTML).
function lerOlx(html: string, avisos: string[]): Parcial | null {
  const m = /<script\b[^>]*\bid="initial-data"[^>]*\bdata-json="([^"]*)"/i.exec(html);
  if (!m) return null;
  // deno-lint-ignore no-explicit-any
  let ad: any;
  try { ad = JSON.parse(textoDeHtml(m[1]))?.ad; } catch { return null; }
  if (!ad) return null;
  const props: Record<string, string> = {};
  for (const p of Array.isArray(ad.properties) ? ad.properties : []) if (p?.name) props[p.name] = String(p.value ?? '');
  const negocio = props.real_estate_type ?? '';
  if (/alug|temporada/i.test(negocio) && !/venda/i.test(negocio)) avisos.push(`O anúncio é de "${negocio}", não de venda.`);
  const loc = ad.location ?? {};
  // Sem rua, o ponto da OLX é o do CEP (ou o centro da cidade): não é do imóvel.
  const rua = textoLimpo(loc.address);
  const pos = rua ? posicao(loc.mapLati, loc.mapLong) : { lat: null, lng: null };
  return {
    url: textoLimpo(ad.canonicalUrl, 1000) ?? textoLimpo(ad.friendlyUrl, 1000),
    titulo: textoLimpo(ad.subject, 300),
    descricao: textoLimpo(ad.body, 5000),
    tipo: tipoDoTexto(`${ad.categoryName ?? ''} ${props.re_types ?? ''} ${negocio}`) ?? undefined,
    preco: positivo(ad.priceValue) ?? undefined,
    condominio: positivo(props.condominio),
    iptu: positivo(props.iptu),
    area: positivo(props.size),
    quartos: positivo(props.rooms) ?? undefined,
    banheiros: positivo(props.bathrooms) ?? undefined,
    vagas: positivo(props.garage_spaces) ?? undefined,
    rua,
    bairro: textoLimpo(loc.neighbourhood),
    cidade: textoLimpo(loc.municipality),
    uf: textoLimpo(loc.uf, 2),
    cep: textoLimpo(loc.zipcode, 9),
    ...pos,
  };
}

// Sites de imobiliária na plataforma Arbo: `__NEXT_DATA__` com o imóvel em campos imv_*.
function lerArbo(html: string, avisos: string[], precoOculto: { valor: boolean }): Parcial | null {
  const m = /<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  // deno-lint-ignore no-explicit-any
  let imv: any;
  try { imv = JSON.parse(m[1])?.props?.pageProps?.imovel; } catch { return null; }
  if (!imv || typeof imv !== 'object' || !('imv_preco_venda' in imv)) return null;
  const negocio = textoLimpo(imv.tipo_negocio?.tpng_nome) ?? '';
  if (negocio && !/venda/i.test(negocio)) avisos.push(`O anúncio é de "${negocio}", não de venda.`);
  if (imv.imv_ocultar_preco === true) precoOculto.valor = true;
  // O anunciante escondeu o endereço: não usamos rua, número nem ponto.
  const escondido = imv.imv_hide_address_wl === true;
  return {
    url: textoLimpo(imv.url_amiga, 1000),
    titulo: textoLimpo(imv.imv_titulo, 300),
    descricao: textoLimpo(imv.imv_obs, 5000),
    tipo: tipoDoTexto(imv.tipo_imovel?.timv_nome ?? imv.imv_titulo) ?? undefined,
    preco: positivo(imv.imv_preco_venda) ?? undefined,
    condominio: positivo(imv.imv_preco_cond),
    iptu: positivo(imv.imv_preco_iptu),
    area: positivo(imv.imv_area_util) ?? positivo(imv.imv_area_construida),
    areaTotal: positivo(imv.imv_area_total) ?? positivo(imv.imv_area_terreno),
    quartos: positivo(imv.imv_qtd_dorm) ?? undefined,
    suites: positivo(imv.imv_qtd_suite) ?? undefined,
    banheiros: positivo(imv.imv_qtd_banheiros) ?? undefined,
    vagas: positivo(imv.imv_qtd_vagas) ?? undefined,
    rua: escondido ? null : textoLimpo(imv.imv_endereco),
    numero: escondido ? null : textoLimpo(imv.imv_end_numero, 20),
    bairro: textoLimpo(imv.imv_bairro),
    cidade: textoLimpo(imv.imv_cidade),
    uf: textoLimpo(imv.imv_estado, 2),
    ...(escondido ? { lat: null, lng: null } : posicao(imv.imv_latitude ?? imv.imv_location?.lat, imv.imv_longitude ?? imv.imv_location?.lng)),
  };
}

const LD_DO_ANUNCIANTE = /^(Organization|RealEstateAgent|LocalBusiness|Corporation|WebSite|WebPage|CollectionPage|BreadcrumbList|ImageObject|ItemList|ListItem|Person|SearchAction|ReadAction|SiteNavigationElement)$/;
const LD_DE_IMOVEL: Record<string, string> = { Apartment: 'Apartamento', House: 'Casa', SingleFamilyResidence: 'Casa' };

// deno-lint-ignore no-explicit-any
function nosDoLd(html: string): any[] {
  // deno-lint-ignore no-explicit-any
  const nos: any[] = [];
  // deno-lint-ignore no-explicit-any
  const visitar = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visitar); return; }
    if (Array.isArray(n['@graph'])) n['@graph'].forEach(visitar);
    const tipos = ([] as unknown[]).concat(n['@type'] ?? []).map(String);
    // O endereço e o telefone da IMOBILIÁRIA não são do imóvel; e a lista de
    // anúncios de uma página de busca não é "o" anúncio.
    if (tipos.some((t) => LD_DO_ANUNCIANTE.test(t))) return;
    nos.push(n);
    for (const k of ['object', 'Object', 'itemOffered', 'mainEntity']) visitar(n[k]);
  };
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visitar(JSON.parse(m[1].trim())); } catch { /* bloco inválido: segue */ }
  }
  return nos;
}

// Dados estruturados (schema.org): RealEstateListing, Product, BuyAction, Apartment…
function lerJsonLd(html: string): Parcial | null {
  const nos = nosDoLd(html);
  if (nos.length === 0) return null;
  const partes: Parcial[] = nos.map((n) => {
    const tipos = ([] as unknown[]).concat(n['@type'] ?? []).map(String);
    const ofertas = ([] as unknown[]).concat(n.offers ?? []) as Record<string, unknown>[];
    const oferta = ofertas.find((o) => o && (o.priceCurrency == null || o.priceCurrency === 'BRL'));
    const moedaBuy = n.priceSpecification?.priceCurrency ?? n.priceCurrency;
    const preco = positivo(oferta?.price) ?? (moedaBuy == null || moedaBuy === 'BRL' ? positivo(n.price) : null);
    const area = typeof n.floorSize === 'object' && n.floorSize ? positivo(n.floorSize.value) : positivo(n.floorSize);
    const end = n.address;
    const endObj = end && typeof end === 'object' ? end : null;
    const local = cidadeEUf(textoLimpo(endObj?.addressLocality));
    const geo = n.geo && typeof n.geo === 'object' ? posicao(n.geo.latitude, n.geo.longitude) : { lat: null, lng: null };
    const tipo = tipos.map((t) => LD_DE_IMOVEL[t]).find(Boolean);
    return {
      titulo: textoLimpo(n.name, 300),
      descricao: textoLimpo(n.description, 5000),
      tipo,
      preco: preco ?? undefined,
      area,
      quartos: positivo(n.numberOfBedrooms ?? n.numberOfRooms) ?? undefined,
      banheiros: positivo(n.numberOfBathroomsTotal) ?? undefined,
      rua: typeof end === 'string' ? textoLimpo(end) : textoLimpo(endObj?.streetAddress),
      cidade: local.cidade,
      uf: siglaDoEstado(textoLimpo(endObj?.addressRegion)) ?? local.uf,
      cep: textoLimpo(endObj?.postalCode, 9),
      ...geo,
    };
  });
  return juntar(...partes);
}

const CHAVES_NUMERICAS_ZERO_E_VAZIO = new Set(['preco', 'area', 'areaTotal', 'quartos', 'banheiros', 'suites', 'vagas']);

/** Primeiro valor útil de cada campo, na ordem das partes (a mais confiável primeiro). */
function juntar(...partes: (Parcial | null | undefined)[]): Parcial {
  const r: Record<string, unknown> = {};
  for (const p of partes) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (r[k] != null && r[k] !== '') continue;
      if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
      if (CHAVES_NUMERICAS_ZERO_E_VAZIO.has(k) && v === 0) continue;
      r[k] = v;
    }
  }
  // Coordenada só vale em par.
  if (r.lat == null || r.lng == null) { delete r.lat; delete r.lng; }
  return r as Parcial;
}

/** O que falta para gravar (preço, área, cidade) e para as médias do bairro (bairro, tipo). */
export function camposFaltando(a: AnuncioLido): string[] {
  const f: string[] = [];
  if (!(a.preco > 0)) f.push('preço');
  if (!(a.area != null && a.area > 0)) f.push('área');
  if (!a.cidade) f.push('cidade');
  if (!a.bairro) f.push('bairro');
  if (!a.tipo || a.tipo === 'Outro') f.push('tipo');
  return f;
}

function completar(p: Parcial, url: string, precoOculto: boolean): AnuncioLido {
  return {
    url: p.url ?? url,
    titulo: p.titulo ?? null,
    tipo: p.tipo ?? 'Outro',
    preco: p.preco ?? 0,
    area: p.area ?? null,
    areaTotal: p.areaTotal ?? null,
    quartos: Math.round(p.quartos ?? 0),
    banheiros: Math.round(p.banheiros ?? 0),
    suites: Math.round(p.suites ?? 0),
    vagas: Math.round(p.vagas ?? 0),
    condominio: p.condominio ?? null,
    iptu: p.iptu ?? null,
    descricao: p.descricao ?? null,
    rua: p.rua ?? null,
    numero: p.numero ?? null,
    bairro: p.bairro ?? null,
    cidade: p.cidade ?? null,
    uf: p.uf ?? null,
    cep: cepValido(p.cep),
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    precoOcultoNaFonte: precoOculto,
  };
}

/** Anúncio vazio só com o link: a tela abre a conferência para preencher à mão. */
export function anuncioEmBranco(url: string): AnuncioDaPagina {
  // O mesmo link estável da leitura: senão colar de novo um anúncio de portal
  // bloqueado não reconheceria o já gravado (o ZAP é gravado pelo id).
  const id = idDoGrupoZap(url);
  const codigo = codigoConexao381(url);
  const estavel = id ? urlDoGrupoZap(id) : codigo ? `https://conexao381.com.br/imoveis/${codigo}` : urlEstavel(url);
  const anuncio = completar({}, estavel, false);
  return { anuncio, site: nomeDoSite(url), leitor: 'nenhum', faltando: camposFaltando(anuncio), avisos: [] };
}

/** Lê o anúncio de uma página HTML. `url` é o link que o usuário colou. */
export function lerAnuncioDaPagina(html: string, url: string): AnuncioDaPagina {
  const avisos: string[] = [];
  const precoOculto = { valor: false };
  const especificos: [string, Parcial | null][] = [
    ['zap', lerGrupoZap(html, avisos)],
    ['olx', lerOlx(html, avisos)],
    ['arbo', lerArbo(html, avisos, precoOculto)],
  ];
  const especifico = especificos.find(([, p]) => p);
  const ld = lerJsonLd(html);
  const ogTitulo = metaDe(html, 'og:title') ?? textoLimpo(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], 300);
  const og: Parcial = {
    titulo: ogTitulo,
    descricao: metaDe(html, 'og:description') ?? metaDe(html, 'description'),
    preco: positivo(metaDe(html, 'product:price:amount') ?? metaDe(html, 'og:price:amount')) ?? undefined,
  };
  const p = juntar(especifico?.[1], ld, og, dadosDoTitulo(especifico?.[1]?.titulo ?? ld?.titulo ?? ogTitulo));
  // O link: o do leitor específico (estável por id) ou o canônico da página.
  p.url = especifico?.[1]?.url ?? urlEstavel(url, canonicaDe(html) ?? metaDe(html, 'og:url'));
  if (p.url && especifico?.[0] === 'olx') p.url = urlEstavel(p.url);
  const leitor = especifico?.[0] ?? (ld && (ld.preco || ld.area) ? 'json-ld' : (p.preco || p.area ? 'titulo' : 'nenhum'));
  const anuncio = completar(p, url, precoOculto.valor);
  if (anuncio.precoOcultoNaFonte) avisos.push('O site esconde o preço deste anúncio; o valor veio dos dados da página.');
  return { anuncio, site: nomeDoSite(url, metaDe(html, 'og:site_name')), leitor, faltando: camposFaltando(anuncio), avisos };
}

/** Rua da Conexão 381 que é link do Google Maps ou Plus Code não é rua. */
function ruaAproveitavel(rua: string | null): string | null {
  if (!rua) return null;
  if (/https?:|maps\.|goo\.gl|^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,}/i.test(rua)) return null;
  return rua;
}

/**
 * Anúncio da API pública da Conexão 381 (`/api/public-property-by-code/<código>`).
 * `hide_sale_price`: o site esconde o preço mas a API devolve — decisão F1 do
 * plano: usar, marcando `precoOcultoNaFonte`.
 */
// deno-lint-ignore no-explicit-any
export function lerAnuncioConexao381(d: any, url: string): AnuncioDaPagina {
  const avisos: string[] = [];
  if (!d || typeof d !== 'object' || d.error) {
    return { ...anuncioEmBranco(url), avisos: ['A Conexão 381 não encontrou este anúncio.'] };
  }
  const finalidade = textoLimpo(d.finalidade) ?? '';
  if (finalidade && !/venda/i.test(finalidade)) avisos.push(`O anúncio é de "${finalidade}", não de venda.`);
  const codigo = textoLimpo(d.codigo ?? d.code, 40);
  const p = juntar({
    url: codigo ? `https://conexao381.com.br/imoveis/${codigo}` : null,
    titulo: textoLimpo(d.titulo ?? d.title, 300),
    descricao: textoLimpo(d.descricao, 5000),
    tipo: tipoDoTexto(textoLimpo(d.tipo)) ?? undefined,
    preco: positivo(d.valor_venda) ?? undefined,
    condominio: positivo(d.valor_condominio),
    iptu: positivo(d.valor_iptu),
    area: positivo(d.area_util) ?? positivo(d.builtArea ?? d.built_area),
    areaTotal: positivo(d.area_terreno),
    quartos: positivo(d.dormitorios) ?? undefined,
    suites: positivo(d.suites) ?? undefined,
    banheiros: positivo(d.banheiros) ?? undefined,
    vagas: positivo(d.vagas) ?? undefined,
    rua: ruaAproveitavel(textoLimpo(d.endereco)),
    numero: textoLimpo(d.numero, 20),
    bairro: textoLimpo(d.bairro),
    cidade: textoLimpo(d.cidade),
    uf: textoLimpo(d.uf, 2) ?? siglaDoEstado(textoLimpo(d.estado)),
    cep: textoLimpo(d.cep, 9),
    ...posicao(d.latitude, d.longitude),
  }, dadosDoTitulo(textoLimpo(d.titulo ?? d.title, 300)));
  const anuncio = completar(p, urlEstavel(url), d.hide_sale_price === true);
  if (anuncio.precoOcultoNaFonte) avisos.push('O site esconde o preço deste anúncio; o valor veio da API da Conexão 381.');
  return { anuncio, site: 'Conexão 381', leitor: 'conexao381', faltando: camposFaltando(anuncio), avisos };
}

const TIPOS_GRAVAVEIS = ['Apartamento', 'Casa', 'Terreno', 'Comercial', 'Outro'];

/**
 * O anúncio que volta da conferência na tela, validado de novo no servidor: o
 * corpo da requisição não é confiável. Preço, área, cidade e um link http(s)
 * são obrigatórios (o link é o que impede duplicar ao colar de novo).
 */
// deno-lint-ignore no-explicit-any
export function anuncioConferido(e: any): { ok: true; anuncio: AnuncioLido & { url: string; cidade: string } } | { ok: false; motivo: string } {
  if (!e || typeof e !== 'object') return { ok: false, motivo: 'Anúncio não enviado.' };
  let url: string;
  try {
    const u = new URL(String(e.url ?? '').trim());
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    url = u.toString();
  } catch {
    return { ok: false, motivo: 'O link do anúncio é obrigatório (http ou https).' };
  }
  const preco = numeroBr(e.preco);
  if (!(preco != null && preco > 0)) return { ok: false, motivo: 'Informe o preço de venda.' };
  const area = numeroBr(e.area);
  if (!(area != null && area > 0)) return { ok: false, motivo: 'Informe a área (m²).' };
  const cidade = textoLimpo(e.cidade, 120);
  if (!cidade) return { ok: false, motivo: 'Informe a cidade.' };
  const inteiroOuZero = (v: unknown) => { const n = numeroBr(v); return n != null && n >= 0 ? Math.round(n) : 0; };
  const pos = posicao(e.lat, e.lng);
  return {
    ok: true,
    anuncio: {
      url,
      titulo: textoLimpo(e.titulo, 300),
      tipo: TIPOS_GRAVAVEIS.includes(e.tipo) ? e.tipo : 'Outro',
      preco,
      area,
      areaTotal: positivo(e.areaTotal),
      quartos: inteiroOuZero(e.quartos),
      banheiros: inteiroOuZero(e.banheiros),
      suites: inteiroOuZero(e.suites),
      vagas: inteiroOuZero(e.vagas),
      condominio: positivo(e.condominio),
      iptu: positivo(e.iptu),
      descricao: textoLimpo(e.descricao, 5000),
      rua: textoLimpo(e.rua, 200),
      numero: textoLimpo(e.numero, 20),
      bairro: textoLimpo(e.bairro, 120),
      cidade,
      uf: siglaDoEstado(textoLimpo(e.uf, 40)),
      cep: textoLimpo(e.cep, 9),
      lat: pos.lat,
      lng: pos.lng,
      precoOcultoNaFonte: e.precoOcultoNaFonte === true,
    },
  };
}
