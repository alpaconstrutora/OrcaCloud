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
// Resposta: contagens (novos, duplicados, atualizados, semLocalizacao, pendentes…).
//
// ─── Autorização (REGRA OBRIGATÓRIA #7, pergunta 3) ─────────────────────────
// `exigirMembro` valida o JWT de usuário e o vínculo com `organizationId`. A
// escrita usa service_role, mas SEMPRE com o `organization_id` validado — nunca
// um que venha só do corpo sem passar pela checagem.
//
// ─── Geocodificação ─────────────────────────────────────────────────────────
// Nominatim (OpenStreetMap): 1 requisição por segundo, User-Agent identificado,
// cache por consulta. Orçamento de ~100 s por chamada: o que não couber fica
// pendente (geo_precision NULL) e o modo 'localizar' completa depois. Erro do
// Nominatim também é "pendente", não "não encontrado".

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { exigirMembro, respostaDeErro } from '../_shared/auth.ts';
import {
  normalizarNome,
  casarBairro,
  bairroDoEndereco,
  enderecoEhSoBairro,
  lerFeedVrsync,
  consultaDeEndereco,
  localizacaoDoResultado,
  urlDeFeedPermitida,
  type BairroConhecido,
  type ConsultaGeo,
  type Localizacao,
  type AnuncioLido,
} from './logica.ts';

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const AGENTE = 'OpuraMarketIntel/1.0 (OrcaCloud; contato@opura.com.br)';
const INTERVALO_MS = 1100;
const ORCAMENTO_MS = 100_000;
const MAX_LINHAS = 2000;
const MAX_FEED_BYTES = 20 * 1024 * 1024;
const LOTE = 200;

type Resultado = Localizacao | 'fonte' | null | 'adiado';

function criarGeocodificador(cidade: string) {
  const inicio = Date.now();
  let ultima = 0;
  const cache = new Map<string, Localizacao | null>();
  return async (consulta: ConsultaGeo): Promise<Localizacao | null | 'adiado'> => {
    if (cache.has(consulta.q)) return cache.get(consulta.q) ?? null;
    if (Date.now() - inicio > ORCAMENTO_MS) return 'adiado';
    const espera = ultima + INTERVALO_MS - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultima = Date.now();
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(consulta.q)}`;
      const r = await fetch(url, { headers: { 'User-Agent': AGENTE, Accept: 'application/json', 'Accept-Language': 'pt-BR' } });
      if (!r.ok) return 'adiado';
      const dados = await r.json();
      const loc = localizacaoDoResultado(Array.isArray(dados) ? dados[0] : null, consulta, cidade);
      cache.set(consulta.q, loc);
      return loc;
    } catch {
      return 'adiado';
    }
  };
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  // deno-lint-ignore no-explicit-any
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido: esperava JSON.' }, 400);
  }

  const organizationId: string | undefined = corpo?.organizationId;
  const vinculo = await exigirMembro(req, organizationId);
  if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

  const modo = corpo?.modo;
  if (!['planilha', 'feed', 'localizar'].includes(modo)) {
    return json({ error: "modo deve ser 'planilha', 'feed' ou 'localizar'." }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: cidade } = await admin
    .from('opura_market_cities').select('id, name, state').eq('id', corpo?.cityId ?? '').maybeSingle();
  if (!cidade) return json({ error: 'Cidade não encontrada.' }, 400);

  const { data: bairrosDb } = await admin.from('opura_market_neighborhoods').select('id, name').eq('city_id', cidade.id);
  const bairros: BairroConhecido[] = bairrosDb ?? [];
  const geo = criarGeocodificador(cidade.name);
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
        const consulta = consultaDeEndereco({ rua: endereco, bairro, cidade: cidade.name, uf: cidade.state });
        const loc = consulta ? await geo(consulta) : null;
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
      return json({ ...gravacao, ...contarLocalizacao(registros), invalidas });
    }

    // ── feed ───────────────────────────────────────────────────────────────
    if (modo === 'feed') {
      let xml: string;
      let origem: string;
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
      } else {
        return json({ error: 'Informe o link do feed (feedUrl) ou o conteúdo do arquivo (feedXml).' }, 400);
      }

      let lido;
      try {
        lido = lerFeedVrsync(xml);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }

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
      const existentes = new Map<string, string>();
      for (let i = 0; i < urls.length; i += LOTE) {
        const { data, error } = await admin
          .from('opura_market_listings').select('id, source_url')
          .eq('organization_id', organizationId).eq('city_id', cidade.id)
          .in('source_url', urls.slice(i, i + LOTE));
        if (error) throw new Error(`Falha ao buscar anúncios já importados: ${error.message}`);
        for (const r of data ?? []) existentes.set(r.source_url, r.id);
      }

      let atualizados = 0;
      const registros: Record<string, unknown>[] = [];
      for (const a of daCidade) {
        const idExistente = a.url ? existentes.get(a.url) : undefined;
        if (idExistente) {
          const { error } = await admin.from('opura_market_listings')
            .update({ price: a.preco, condo_fee: a.condominio, iptu: a.iptu, last_seen_at: agora, listing_status: 'active' })
            .eq('id', idExistente).eq('organization_id', organizationId);
          if (error) throw new Error(`Falha ao atualizar anúncio já importado: ${error.message}`);
          atualizados++;
          continue;
        }
        let loc: Resultado;
        if (a.lat != null && a.lng != null) {
          loc = 'fonte';
        } else {
          const consulta = consultaDeEndereco({ rua: a.rua, numero: a.numero, bairro: a.bairro, cidade: cidade.name, uf: cidade.state });
          loc = consulta ? await geo(consulta) : null;
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
      return json({ ...gravacao, atualizados, ...contarLocalizacao(registros), ignorados, lidos: lido.anuncios.length });
    }

    // ── localizar ─────────────────────────────────────────────────────────
    const { data: pendentes, error } = await admin
      .from('opura_market_listings')
      .select('id, address, neighborhood_name_raw')
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
      const consulta = soBairro
        ? consultaDeEndereco({ bairro, cidade: cidade.name, uf: cidade.state })
        : consultaDeEndereco({ rua: p.address, bairro, cidade: cidade.name, uf: cidade.state });
      const loc = consulta ? await geo(consulta) : null;
      if (loc === 'adiado') { restantes++; continue; }
      const { error: e2 } = await admin.from('opura_market_listings')
        .update(colunasDeLocalizacao(loc)).eq('id', p.id).eq('organization_id', organizationId);
      if (e2) throw new Error(`Falha ao gravar localização: ${e2.message}`);
      if (loc) localizados++; else naoEncontrados++;
    }
    return json({ localizados, naoEncontrados, restantes });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
