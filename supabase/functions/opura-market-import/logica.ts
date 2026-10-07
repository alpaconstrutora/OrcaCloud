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
export type Precisao = 'fonte' | 'endereco' | 'bairro' | 'nao_encontrado';

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

export interface ConsultaGeo {
  q: string;
  /** A consulta tem rua? Sem rua, o melhor resultado possível é o bairro. */
  temRua: boolean;
}

/**
 * Rua + número + bairro + cidade/UF. Sem rua, cai para bairro + cidade/UF.
 * Sem rua e sem bairro não há consulta: um ponto no centro da cidade não diz
 * nada sobre a vizinhança do imóvel, e entraria na análise de raio errado.
 */
export function consultaDeEndereco(e: {
  rua?: string | null; numero?: string | null; bairro?: string | null; cidade: string; uf: string;
}): ConsultaGeo | null {
  const cidade = `${e.cidade} - ${e.uf}, Brasil`;
  const rua = (e.rua ?? '').trim();
  const bairro = (e.bairro ?? '').trim();
  if (rua) {
    const comNumero = e.numero && !/\d/.test(rua) ? `${rua} ${String(e.numero).trim()}` : rua;
    return { q: [comNumero, bairro, cidade].filter(Boolean).join(', '), temRua: true };
  }
  if (bairro) return { q: `${bairro}, ${cidade}`, temRua: false };
  return null;
}

export interface ResultadoNominatim {
  lat: string | number;
  lon: string | number;
  place_rank?: string | number;
  display_name?: string;
}

export interface Localizacao {
  lat: number;
  lng: number;
  precisao: 'endereco' | 'bairro';
}

/**
 * Traduz o primeiro resultado do Nominatim. `place_rank`: 26–30 = rua/número,
 * 17–25 = bairro/localidade, ≤ 16 = cidade ou maior (descartado). O resultado
 * precisa estar na cidade pedida — sem isso, "Rosa" casava com uma rua a 30 km.
 */
export function localizacaoDoResultado(r: ResultadoNominatim | null | undefined, consulta: ConsultaGeo, cidade: string): Localizacao | null {
  if (!r) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  const rank = Number(r.place_rank);
  if (!coordenadaValida(lat, lng) || !Number.isFinite(rank)) return null;
  if (!normalizarNome(r.display_name).includes(normalizarNome(cidade))) return null;
  if (rank >= 26) return { lat, lng, precisao: consulta.temRua ? 'endereco' : 'bairro' };
  if (rank >= 17) return { lat, lng, precisao: 'bairro' };
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
