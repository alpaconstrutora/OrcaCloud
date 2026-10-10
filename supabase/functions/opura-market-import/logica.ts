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
export function urlDeFeedPermitida(texto: string): { ok: true; url: URL } | { ok: false; motivo: string } {
  let url: URL;
  try { url = new URL(texto.trim()); } catch { return { ok: false, motivo: 'Link do feed inválido.' }; }
  if (url.protocol !== 'https:') return { ok: false, motivo: 'O link do feed precisa começar com https://.' };
  const host = url.hostname.toLowerCase();
  const interno =
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || !host.includes('.');
  if (interno) return { ok: false, motivo: 'Use o endereço público do feed (nome de domínio, não IP ou endereço interno).' };
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
