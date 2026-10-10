// supabase/functions/opura-market-import/index.ts
//
// Importação de anúncios do ÒPURA Market Intelligence, no SERVIDOR.
// Plano: docs/planos/2026-10-07-opura-market-intelligence.md, Fase 3 revisada (D7).
//
// ─── Por que existe ──────────────────────────────────────────────────────────
// Até 07/10/2026 a captura e a importação rodavam no navegador: o robô baixava o
// portal de uma imobiliária por proxies de CORS de terceiros (corsproxy.io,
// allorigins) e geocodificava no Nominatim direto do browser. O portal mudou e o
// robô parou de achar anúncios; e mesmo antes ele só tinha o NOME DO BAIRRO, que
// era geocodificado e gravado como se fosse o ponto do imóvel, e todo bairro
// desconhecido virava "Centro". A decisão D7 trocou o robô por feed XML.
//
// ─── Contrato ────────────────────────────────────────────────────────────────
// POST { modo, organizationId, cityId, ... }
//   modo 'planilha'  + linhas: [{ endereco, bairro?, preco, area, tipo?, quartos?,
//                      suites?, banheiros?, vagas?, padrao?, descricao? }]
//   modo 'feed'      + feedUrl (https, host público) OU feedXml (conteúdo do .xml)
//   modo 'localizar' — geocodifica os anúncios da organização na cidade que ainda
//                      não têm coordenada nem tentativa registrada.
//   modo 'relocalizar' — tenta de novo os anúncios 'bairro' e 'nao_encontrado' da
//                      organização na cidade; só grava se a posição MELHORAR
//                      (item 2 do plano 2026-10-10-opura-market-pendencias).
//   modo 'agendado'  — SÓ o cron diário (opura-market-feeds-diario), autenticado
//                      pelo CRON_SECRET. Reimporta cada feed salvo em
//                      opura_market_feeds. Sem organizationId no corpo: a
//                      organização vem da linha do feed.
// Resposta: contagens (novos, duplicados, atualizados, semLocalizacao, pendentes…).
//
// ─── Autorização (REGRA OBRIGATÓRIA #7, pergunta 3) ─────────────────────────
// `exigirMembro` valida o JWT de usuário e o vínculo com `organizationId`. A
// escrita usa service_role, mas SEMPRE com o `organization_id` validado — nunca
// um que venha só do corpo sem passar pela checagem. O modo 'agendado' é a única
// exceção: `chamadaDeCron` (CRON_SECRET em tempo constante) e a organização de
// cada feed lida do banco. A function é publicada com --no-verify-jwt (o cron não
// manda JWT); a prova é POST sem header nenhum → 401, em todos os modos.
//
// ─── Feed salvo e saídas (plano 2026-10-10-opura-market-pendencias, item 1) ──
// Importar um feed SALVO grava `feed_id` nos anúncios e marca como saída
// (listing_status 'inactive' + removed_at) o anúncio daquele feed que não veio no
// XML. É a medida de demanda dos indicadores do bairro. Anúncio que volta é
// reativado. Ver `anunciosQueSairam` em logica.ts.
//
// ─── Geocodificação ─────────────────────────────────────────────────────────
// Photon (OpenStreetMap): 1 requisição por segundo, User-Agent identificado,
// cache por consulta. Orçamento de ~100 s por chamada: o que não couber fica
// pendente (geo_precision NULL) e o modo 'localizar' completa depois. Erro do
// geocodificador também é "pendente", não "não encontrado"; o motivo volta em
// `falhaGeocodificacao`. O Nominatim público foi descartado: responde HTTP 403
// a chamadas vindas da Supabase.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { exigirMembro, respostaDeErro, chamadaDeCron } from '../_shared/auth.ts';
import {
  normalizarNome,
  casarBairro,
  bairroDoEndereco,
  enderecoEhSoBairro,
  lerFeedVrsync,
  consultasDeEndereco,
  primeiraLocalizacao,
  urlDeFeedPermitida,
  anunciosQueSairam,
  partesDoEndereco,
  precisaoMelhor,
  cepValido,
  ruaDoCep,
  consultasComCep,
  type BairroConhecido,
  type ConsultaGeo,
  type Localizacao,
  type AnuncioLido,
  type FeedLido,
} from './logica.ts';

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Photon (OpenStreetMap): o Nominatim público responde HTTP 403 a chamadas
// vindas da Supabase (medido em 07/10/2026). Ver o cabeçalho de logica.ts.
const PHOTON = 'https://photon.komoot.io/api/';
const AGENTE = 'OpuraMarketIntel/1.0 (OrcaCloud; contato@opura.com.br)';
const INTERVALO_MS = 1100;
const ORCAMENTO_MS = 100_000;
const MAX_LINHAS = 2000;
const MAX_FEED_BYTES = 20 * 1024 * 1024;
const LOTE = 200;

type Resultado = Localizacao | 'fonte' | null | 'adiado';

/** Bairro cadastrado na praça, com o ponto marcado no cadastro (pode faltar). */
interface BairroComPonto extends BairroConhecido { centroid_lat?: number | null; centroid_lng?: number | null }

/** O que se sabe do endereço de um anúncio na hora de localizar. */
interface EnderecoDoAnuncio { rua?: string | null; numero?: string | null; bairro?: string | null; cep?: string | null; soBairro?: boolean }

function criarGeocodificador(praca: { name: string; state: string }, inicio = Date.now(), bairros: BairroComPonto[] = []) {
  const cidade = praca.name;
  let ultima = 0;
  let ultimaFalha: string | null = null;
  const cache = new Map<string, Localizacao | null>();

  const tentar = async (consulta: ConsultaGeo): Promise<Localizacao | null | 'adiado'> => {
    if (cache.has(consulta.q)) return cache.get(consulta.q) ?? null;
    if (Date.now() - inicio > ORCAMENTO_MS) return 'adiado';
    const espera = ultima + INTERVALO_MS - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultima = Date.now();
    try {
      // limit=3: o 1º resultado às vezes é de outra cidade e o 2º é o certo.
      const url = `${PHOTON}?limit=3&q=${encodeURIComponent(consulta.q)}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': AGENTE, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        ultimaFalha = `Geocodificador respondeu HTTP ${r.status}`;
        return 'adiado';
      }
      const dados = await r.json();
      const loc = primeiraLocalizacao(Array.isArray(dados?.features) ? dados.features : null, consulta, cidade);
      cache.set(consulta.q, loc);
      return loc;
    } catch (e) {
      ultimaFalha = `Geocodificador inacessível: ${e instanceof Error ? e.message : String(e)}`;
      return 'adiado';
    }
  };

  /** Percorre as tentativas até a primeira que localiza. Falha de rede = adiado, não "não encontrado". */
  const localizar = async (consultas: ConsultaGeo[]): Promise<Localizacao | null | 'adiado'> => {
    for (const c of consultas) {
      const r = await tentar(c);
      if (r === 'adiado') return 'adiado';
      if (r) return r;
    }
    return null;
  };

  // CEP (item 2): ViaCEP e, se ele não responder, BrasilAPI. O CEP só dá o NOME
  // da rua para a busca; nunca vira coordenada sozinho.
  const cacheCep = new Map<string, Record<string, unknown> | null>();
  const usoCep = { consultados: 0, viacep: 0, brasilapi: 0, semResposta: 0 };
  const buscarCep = async (cep: string): Promise<Record<string, unknown> | null> => {
    if (cacheCep.has(cep)) return cacheCep.get(cep) ?? null;
    usoCep.consultados++;
    const fontes: [keyof typeof usoCep, string][] = [
      ['viacep', `https://viacep.com.br/ws/${cep}/json/`],
      ['brasilapi', `https://brasilapi.com.br/api/cep/v1/${cep}`],
    ];
    for (const [nome, url] of fontes) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': AGENTE, Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
        if (r.status === 404 || r.status === 400) { usoCep[nome]++; cacheCep.set(cep, null); return null; }
        if (!r.ok) continue;
        const dados = await r.json();
        usoCep[nome]++;
        cacheCep.set(cep, dados);
        return dados;
      } catch {
        // tenta a próxima fonte
      }
    }
    usoCep.semResposta++;
    cacheCep.set(cep, null);
    return null;
  };

  /**
   * Localiza um anúncio: rua do anúncio, rua do CEP, bairro. Se o geocodificador
   * não achar nada e o anúncio TRAZ o nome de um bairro cadastrado com ponto, usa
   * o ponto do bairro (precisão 'bairro'). Só pelo nome: vínculo de bairro sem
   * nome de origem pode ser resto do antigo "Centro" coringa.
   */
  const anuncio = async (a: EnderecoDoAnuncio): Promise<Localizacao | null | 'adiado'> => {
    const cep = a.soBairro ? null : cepValido(a.cep);
    const infoCep = cep ? ruaDoCep(await buscarCep(cep), cidade) : null;
    const consultas = a.soBairro
      ? consultasDeEndereco({ bairro: a.bairro, cidade, uf: praca.state })
      : consultasComCep({ rua: a.rua, numero: a.numero, bairro: a.bairro, cidade, uf: praca.state, cep: infoCep });
    const loc = await localizar(consultas);
    if (loc !== null) return loc;
    const idDoBairro = casarBairro(a.bairro, bairros);
    const b = idDoBairro ? bairros.find((x) => x.id === idDoBairro) : undefined;
    if (b && b.centroid_lat != null && b.centroid_lng != null) {
      return { lat: Number(b.centroid_lat), lng: Number(b.centroid_lng), precisao: 'bairro' };
    }
    return null;
  };

  return { localizar, anuncio, falha: () => ultimaFalha, usoCep: () => ({ ...usoCep }) };
}

/** Colunas de localização a partir do resultado. 'adiado' = pendente (precisão NULL). */
function colunasDeLocalizacao(r: Resultado, latFonte?: number | null, lngFonte?: number | null) {
  if (r === 'fonte' && latFonte != null && lngFonte != null) {
    return { latitude: latFonte, longitude: lngFonte, geom: `SRID=4326;POINT(${lngFonte} ${latFonte})`, geo_precision: 'fonte' };
  }
  if (r && typeof r === 'object') {
    return { latitude: r.lat, longitude: r.lng, geom: `SRID=4326;POINT(${r.lng} ${r.lat})`, geo_precision: r.precisao };
  }
  return { latitude: null, longitude: null, geom: null, geo_precision: r === 'adiado' ? null : 'nao_encontrado' };
}

const inteiro = (v: unknown, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : padrao;
};
const textoOuNulo = (v: unknown) => {
  const t = v == null ? '' : String(v).trim();
  return t === '' ? null : t;
};

// deno-lint-ignore no-explicit-any
async function gravar(admin: any, registros: Record<string, unknown>[]) {
  let gravados = 0;
  let duplicados = 0;
  for (let i = 0; i < registros.length; i += LOTE) {
    const { data, error } = await admin
      .from('opura_market_listings')
      .insert(registros.slice(i, i + LOTE))
      .select('id, parent_listing_id');
    if (error) throw new Error(`Falha ao gravar anúncios: ${error.message}`);
    gravados += data?.length ?? 0;
    duplicados += (data ?? []).filter((d: { parent_listing_id: string | null }) => d.parent_listing_id).length;
  }
  return { novos: gravados - duplicados, duplicados };
}

function contarLocalizacao(registros: Record<string, unknown>[]) {
  return {
    semLocalizacao: registros.filter((r) => r.geo_precision === 'nao_encontrado').length,
    pendentes: registros.filter((r) => r.geom == null && r.geo_precision == null).length,
  };
}

async function baixarFeed(url: URL): Promise<string> {
  let atual = url;
  for (let salto = 0; salto < 4; salto++) {
    const r = await fetch(atual.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': AGENTE, Accept: 'application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get('location');
      if (!destino) throw new Error(`O feed respondeu HTTP ${r.status} sem destino.`);
      // O redirecionamento passa pela mesma checagem: senão um feed público
      // poderia mandar a function buscar um endereço interno.
      const v = urlDeFeedPermitida(new URL(destino, atual).toString());
      if (!v.ok) throw new Error(`O feed redireciona para um endereço não permitido: ${v.motivo}`);
      atual = v.url;
      continue;
    }
    if (!r.ok) throw new Error(`O servidor do feed respondeu HTTP ${r.status}.`);
    const tamanho = Number(r.headers.get('content-length') ?? 0);
    if (tamanho > MAX_FEED_BYTES) throw new Error('O feed passa de 20 MB.');
    const texto = await r.text();
    if (texto.length > MAX_FEED_BYTES) throw new Error('O feed passa de 20 MB.');
    return texto;
  }
  throw new Error('O feed redirecionou vezes demais.');
}

// deno-lint-ignore no-explicit-any
type Admin = any;
interface Cidade { id: string; name: string; state: string }

/**
 * Grava os anúncios de um feed já lido para a organização na cidade. Com
 * `feedId` (feed SALVO), grava o vínculo, reativa quem voltou e marca como
 * saída quem sumiu do XML — a medida de demanda do item 3.
 */
async function gravarFeed(admin: Admin, p: {
  organizationId: string;
  cidade: Cidade;
  bairros: BairroComPonto[];
  geo: ReturnType<typeof criarGeocodificador>;
  lido: FeedLido;
  origem: string;
  feedId: string | null;
  agora: string;
}) {
  const { organizationId, cidade, bairros, geo, lido, origem, feedId, agora } = p;
  const vinculo = feedId ? { feed_id: feedId } : {};
  const base = { city_id: cidade.id, organization_id: organizationId, listing_status: 'active', captured_at: agora, last_seen_at: agora, ...vinculo };

  const ignorados: Record<string, number> = { ...lido.ignorados };
  const daCidade: AnuncioLido[] = [];
  for (const a of lido.anuncios) {
    if (!a.cidade) { ignorados['cidade não informada'] = (ignorados['cidade não informada'] ?? 0) + 1; continue; }
    if (normalizarNome(a.cidade) !== normalizarNome(cidade.name)) { ignorados['outra cidade'] = (ignorados['outra cidade'] ?? 0) + 1; continue; }
    daCidade.push(a);
  }

  // Reimportar o mesmo feed não duplica: o anúncio é reconhecido pela URL
  // dentro da organização e só tem preço e data de "visto" atualizados.
  const urls = daCidade.map((a) => a.url).filter((u): u is string => !!u);
  const existentes = new Map<string, { id: string; status: string | null }>();
  for (let i = 0; i < urls.length; i += LOTE) {
    const { data, error } = await admin
      .from('opura_market_listings').select('id, source_url, listing_status')
      .eq('organization_id', organizationId).eq('city_id', cidade.id)
      .in('source_url', urls.slice(i, i + LOTE));
    if (error) throw new Error(`Falha ao buscar anúncios já importados: ${error.message}`);
    for (const r of data ?? []) existentes.set(r.source_url, { id: r.id, status: r.listing_status });
  }

  let atualizados = 0;
  let reativados = 0;
  const registros: Record<string, unknown>[] = [];
  for (const a of daCidade) {
    const existente = a.url ? existentes.get(a.url) : undefined;
    if (existente) {
      const { error } = await admin.from('opura_market_listings')
        .update({ price: a.preco, condo_fee: a.condominio, iptu: a.iptu, last_seen_at: agora, listing_status: 'active', removed_at: null, ...vinculo })
        .eq('id', existente.id).eq('organization_id', organizationId);
      if (error) throw new Error(`Falha ao atualizar anúncio já importado: ${error.message}`);
      if (existente.status !== 'active') reativados++; else atualizados++;
      continue;
    }
    let loc: Resultado;
    if (a.lat != null && a.lng != null) {
      loc = 'fonte';
    } else {
      loc = await geo.anuncio({ rua: a.rua, numero: a.numero, bairro: a.bairro, cep: a.cep });
    }
    const ruaComNumero = a.rua ? [a.rua, a.numero].filter(Boolean).join(', ') : null;
    registros.push({
      ...base,
      neighborhood_id: casarBairro(a.bairro, bairros),
      neighborhood_name_raw: a.bairro,
      source: origem,
      source_url: a.url,
      property_type: a.tipo,
      address: [ruaComNumero, a.bairro].filter(Boolean).join(', ') || null,
      zip_code: a.cep,
      area_private: a.area,
      area_total: a.areaTotal ?? a.area,
      bedrooms: a.quartos,
      suites: a.suites,
      bathrooms: a.banheiros,
      parking_spaces: a.vagas,
      price: a.preco,
      condo_fee: a.condominio,
      iptu: a.iptu,
      description: [a.titulo, a.descricao].filter(Boolean).join('\n\n') || null,
      construction_standard: null,
      ...colunasDeLocalizacao(loc, a.lat, a.lng),
    });
  }
  const gravacao = await gravar(admin, registros);

  // Saídas: só para feed salvo, e nunca com um feed que veio sem a cidade.
  let saidas = 0;
  let saidasIgnoradas: string | null = null;
  if (feedId) {
    const { data: ativos, error } = await admin
      .from('opura_market_listings').select('id, source_url')
      .eq('organization_id', organizationId).eq('city_id', cidade.id)
      .eq('feed_id', feedId).eq('listing_status', 'active');
    if (error) throw new Error(`Falha ao buscar anúncios do feed: ${error.message}`);
    const r = anunciosQueSairam(
      (ativos ?? []).map((x: { id: string; source_url: string | null }) => ({ id: x.id, url: x.source_url })),
      daCidade.map((a) => a.url),
    );
    saidasIgnoradas = r.ignorado;
    for (let i = 0; i < r.ids.length; i += LOTE) {
      const { error: e2 } = await admin.from('opura_market_listings')
        .update({ listing_status: 'inactive', removed_at: agora })
        .in('id', r.ids.slice(i, i + LOTE)).eq('organization_id', organizationId);
      if (e2) throw new Error(`Falha ao marcar saídas: ${e2.message}`);
    }
    saidas = r.ids.length;
  }

  return {
    ...gravacao, atualizados, reativados, saidas, saidasIgnoradas,
    ...contarLocalizacao(registros), ignorados, lidos: lido.anuncios.length, falhaGeocodificacao: geo.falha(), cep: geo.usoCep(),
  };
}

/** Grava o resultado (ou o erro) da última execução de um feed salvo. */
async function registrarExecucao(admin: Admin, feedId: string, resultado: unknown, erro: string | null) {
  const agora = new Date().toISOString();
  await admin.from('opura_market_feeds')
    .update({ ultima_execucao: agora, ultimo_resultado: resultado ?? null, ultimo_erro: erro, updated_at: agora })
    .eq('id', feedId);
}

/**
 * Modo 'agendado': o cron diário reimporta cada feed salvo e ativo. O orçamento
 * de geocodificação é um só para a chamada inteira; feed que não couber fica
 * para o dia seguinte (os mais antigos vão primeiro).
 */
async function rodarAgendado(admin: Admin) {
  const inicio = Date.now();
  const { data: feeds, error } = await admin
    .from('opura_market_feeds').select('id, organization_id, city_id, url')
    .eq('ativo', true).order('ultima_execucao', { ascending: true, nullsFirst: true }).limit(50);
  if (error) throw new Error(`Falha ao listar feeds: ${error.message}`);

  const relatorio: { feed: string; ok: boolean; detalhe: string }[] = [];
  for (const feed of feeds ?? []) {
    if (Date.now() - inicio > ORCAMENTO_MS) {
      relatorio.push({ feed: feed.id, ok: false, detalhe: 'fica para amanhã (tempo esgotado)' });
      continue;
    }
    try {
      const { data: cidade } = await admin.from('opura_market_cities').select('id, name, state').eq('id', feed.city_id).maybeSingle();
      if (!cidade) throw new Error('A cidade do feed não existe mais.');
      const v = urlDeFeedPermitida(feed.url);
      if (!v.ok) throw new Error(v.motivo);
      const lido = lerFeedVrsync(await baixarFeed(v.url));
      const { data: bairrosDb } = await admin.from('opura_market_neighborhoods').select('id, name, centroid_lat, centroid_lng').eq('city_id', cidade.id);
      const resultado = await gravarFeed(admin, {
        organizationId: feed.organization_id, cidade, bairros: bairrosDb ?? [],
        geo: criarGeocodificador(cidade, inicio, bairrosDb ?? []), lido, origem: `Feed ${v.url.hostname}`,
        feedId: feed.id, agora: new Date().toISOString(),
      });
      await registrarExecucao(admin, feed.id, resultado, null);
      relatorio.push({ feed: feed.id, ok: true, detalhe: `novos ${resultado.novos}, saídas ${resultado.saidas}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await registrarExecucao(admin, feed.id, null, msg);
      relatorio.push({ feed: feed.id, ok: false, detalhe: msg });
    }
  }
  return { feeds: (feeds ?? []).length, relatorio };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  // Publicada com --no-verify-jwt (o cron não manda JWT): sem Authorization é
  // 401 já aqui, em qualquer modo e com qualquer corpo.
  if (!req.headers.get('Authorization')) return json({ error: 'Não autorizado.' }, 401);

  // deno-lint-ignore no-explicit-any
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido: esperava JSON.' }, 400);
  }

  // Cron: único modo sem JWT de usuário. Sem o CRON_SECRET, 401 — antes de
  // qualquer leitura.
  if (corpo?.modo === 'agendado') {
    if (!chamadaDeCron(req)) return json({ error: 'Não autorizado.' }, 401);
    const adminCron = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      return json(await rodarAgendado(adminCron));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  const organizationId: string | undefined = corpo?.organizationId;
  const vinculo = await exigirMembro(req, organizationId);
  if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

  const modo = corpo?.modo;
  if (!['planilha', 'feed', 'localizar', 'relocalizar'].includes(modo)) {
    return json({ error: "modo deve ser 'planilha', 'feed', 'localizar' ou 'relocalizar'." }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: cidade } = await admin
    .from('opura_market_cities').select('id, name, state').eq('id', corpo?.cityId ?? '').maybeSingle();
  if (!cidade) return json({ error: 'Cidade não encontrada.' }, 400);

  const { data: bairrosDb } = await admin.from('opura_market_neighborhoods').select('id, name, centroid_lat, centroid_lng').eq('city_id', cidade.id);
  const bairros: BairroComPonto[] = bairrosDb ?? [];
  const geo = criarGeocodificador(cidade, Date.now(), bairros);
  const agora = new Date().toISOString();
  const base = { city_id: cidade.id, organization_id: organizationId, listing_status: 'active', captured_at: agora, last_seen_at: agora };

  try {
    // ── planilha ───────────────────────────────────────────────────────────
    if (modo === 'planilha') {
      const linhas = Array.isArray(corpo.linhas) ? corpo.linhas : null;
      if (!linhas || linhas.length === 0) return json({ error: 'Nenhuma linha enviada.' }, 400);
      if (linhas.length > MAX_LINHAS) return json({ error: `No máximo ${MAX_LINHAS} linhas por importação.` }, 400);

      const registros: Record<string, unknown>[] = [];
      let invalidas = 0;
      for (const l of linhas) {
        const endereco = textoOuNulo(l?.endereco);
        const preco = Number(l?.preco);
        const area = Number(l?.area);
        if (!endereco || !(preco > 0) || !(area > 0)) { invalidas++; continue; }
        const bairro = textoOuNulo(l?.bairro);
        const partes = partesDoEndereco(endereco, bairro);
        const loc = await geo.anuncio({ rua: partes.rua, numero: partes.numero, bairro });
        registros.push({
          ...base,
          neighborhood_id: casarBairro(bairro, bairros),
          neighborhood_name_raw: bairro,
          source: 'Planilha Importada',
          source_url: null,
          property_type: textoOuNulo(l?.tipo) ?? 'Apartamento',
          address: endereco,
          area_private: area,
          area_total: area,
          bedrooms: inteiro(l?.quartos),
          suites: inteiro(l?.suites),
          bathrooms: inteiro(l?.banheiros),
          parking_spaces: inteiro(l?.vagas),
          price: preco,
          description: textoOuNulo(l?.descricao),
          construction_standard: textoOuNulo(l?.padrao),
          ...colunasDeLocalizacao(loc),
        });
      }
      const gravacao = await gravar(admin, registros);
      return json({ ...gravacao, ...contarLocalizacao(registros), invalidas, falhaGeocodificacao: geo.falha() });
    }

    // ── feed ───────────────────────────────────────────────────────────────
    if (modo === 'feed') {
      let xml: string;
      let origem: string;
      let feedUrlUsada: string | null = null;
      if (typeof corpo.feedXml === 'string' && corpo.feedXml.trim()) {
        if (corpo.feedXml.length > MAX_FEED_BYTES) return json({ error: 'O feed passa de 20 MB.' }, 413);
        xml = corpo.feedXml;
        origem = 'Feed XML (arquivo)';
      } else if (typeof corpo.feedUrl === 'string' && corpo.feedUrl.trim()) {
        const v = urlDeFeedPermitida(corpo.feedUrl);
        if (!v.ok) return json({ error: v.motivo }, 400);
        try {
          xml = await baixarFeed(v.url);
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 502);
        }
        origem = `Feed ${v.url.hostname}`;
        feedUrlUsada = v.url.toString();
      } else {
        return json({ error: 'Informe o link do feed (feedUrl) ou o conteúdo do arquivo (feedXml).' }, 400);
      }

      let lido: FeedLido;
      try {
        lido = lerFeedVrsync(xml);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }

      // Link igual ao do feed SALVO desta organização+cidade: conta como execução
      // dele (vínculo, saídas e "última importação" na tela).
      let feedId: string | null = null;
      if (feedUrlUsada) {
        const { data: salvo } = await admin.from('opura_market_feeds').select('id, url')
          .eq('organization_id', organizationId).eq('city_id', cidade.id).maybeSingle();
        let mesma = false;
        try { mesma = !!salvo && new URL(salvo.url).toString() === feedUrlUsada; } catch { mesma = false; }
        if (mesma) feedId = salvo.id;
      }

      const resultado = await gravarFeed(admin, { organizationId: organizationId as string, cidade, bairros, geo, lido, origem, feedId, agora });
      if (feedId) await registrarExecucao(admin, feedId, resultado, null);
      return json(resultado);
    }

    // ── relocalizar ───────────────────────────────────────────────────────
    if (modo === 'relocalizar') {
      const { data: aproximados, error: eAprox } = await admin
        .from('opura_market_listings')
        .select('id, address, neighborhood_name_raw, zip_code, geo_precision')
        .eq('organization_id', organizationId).eq('city_id', cidade.id)
        .in('geo_precision', ['nao_encontrado', 'bairro'])
        .order('geo_precision', { ascending: false })   // 'nao_encontrado' primeiro
        .limit(1000);
      if (eAprox) throw new Error(`Falha ao buscar anúncios aproximados: ${eAprox.message}`);

      let melhorados = 0;
      let semMudanca = 0;
      let restantes = 0;
      for (const p of aproximados ?? []) {
        const soBairro = enderecoEhSoBairro(p.address, cidade.name, cidade.state);
        const bairro = p.neighborhood_name_raw ?? (soBairro ? bairroDoEndereco(p.address) : null);
        // Só o bairro é conhecido e o anúncio já está no bairro: não há o que melhorar.
        if (soBairro && p.geo_precision === 'bairro') { semMudanca++; continue; }
        const partes = partesDoEndereco(p.address, p.neighborhood_name_raw);
        const loc = await geo.anuncio(soBairro
          ? { bairro, soBairro: true }
          : { rua: partes.rua, numero: partes.numero, bairro, cep: p.zip_code });
        if (loc === 'adiado') { restantes++; continue; }
        if (!loc || !precisaoMelhor(loc.precisao, p.geo_precision)) { semMudanca++; continue; }
        const { error: eUp } = await admin.from('opura_market_listings')
          .update(colunasDeLocalizacao(loc)).eq('id', p.id).eq('organization_id', organizationId);
        if (eUp) throw new Error(`Falha ao gravar localização: ${eUp.message}`);
        melhorados++;
      }
      return json({ melhorados, semMudanca, restantes, cep: geo.usoCep(), falhaGeocodificacao: geo.falha() });
    }

    // ── localizar ─────────────────────────────────────────────────────────
    const { data: pendentes, error } = await admin
      .from('opura_market_listings')
      .select('id, address, neighborhood_name_raw, zip_code')
      .eq('organization_id', organizationId).eq('city_id', cidade.id)
      .is('geom', null).is('geo_precision', null)
      .limit(1000);
    if (error) throw new Error(`Falha ao buscar anúncios sem localização: ${error.message}`);

    let localizados = 0;
    let naoEncontrados = 0;
    let restantes = 0;
    for (const p of pendentes ?? []) {
      const soBairro = enderecoEhSoBairro(p.address, cidade.name, cidade.state);
      const bairro = p.neighborhood_name_raw ?? (soBairro ? bairroDoEndereco(p.address) : null);
      // O address do feed é "rua, número, bairro": separar antes de buscar (item 2).
      const partes = partesDoEndereco(p.address, p.neighborhood_name_raw);
      const loc = await geo.anuncio(soBairro
        ? { bairro, soBairro: true }
        : { rua: partes.rua, numero: partes.numero, bairro, cep: p.zip_code });
      if (loc === 'adiado') { restantes++; continue; }
      const { error: e2 } = await admin.from('opura_market_listings')
        .update(colunasDeLocalizacao(loc)).eq('id', p.id).eq('organization_id', organizationId);
      if (e2) throw new Error(`Falha ao gravar localização: ${e2.message}`);
      if (loc) localizados++; else naoEncontrados++;
    }
    return json({ localizados, naoEncontrados, restantes, cep: geo.usoCep(), falhaGeocodificacao: geo.falha() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
