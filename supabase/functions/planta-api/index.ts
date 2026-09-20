// supabase/functions/planta-api/index.ts
//
// API PÚBLICA da Planta Inteligente (20/09/2026, roadmap E9.2).
//
// ─── O DESENHO EM UMA FRASE ─────────────────────────────────────────────────
//
// Token da ORGANIZAÇÃO no header → RPCs `security definer` (só `service_role`
// executa; elas validam o token e devolvem só o que é daquela organização) →
// o que exige o KERNEL (quantitativos, planilha, IFC, unidades/áreas) é
// calculado AQUI, em Deno, pelo bundle do kernel do app
// (`kernel.bundle.mjs`, gerado por `scripts/build-planta-api-kernel.mjs`).
//
// ─── POR QUE O TOKEN NÃO É JWT ──────────────────────────────────────────────
//
// Quem consome a API é um sistema (ERP, BI, planilha), não uma pessoa logada.
// Por isso `verify_jwt = false` no `config.toml`: o gateway deixa passar e a
// autenticação é o token `opk_…` — validado no banco por hash, com uso
// registrado (`api_blueprint_resolver`). Sem token válido, 401 e nada mais.
//
// ─── O QUE NÃO FAZ ──────────────────────────────────────────────────────────
//
// Não escreve. Não expõe rascunho (só `blueprint_snapshots`). Não pagina.
// Não faz cache: o recálculo do kernel leva dezenas de ms para uma casa.
//
// Rotas: ver `openapi.ts` (a fonte da documentação publicada em `/docs`).

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore
import { KERNEL_VERSION, POLITICA_PADRAO, abasDoQuantitativo, computeQuantities, gerarIfc, modelFromCanonicalPayload, parseCanonicalPayload, unidadeDaEtiqueta } from './kernel.bundle.mjs';
import { docsEmTexto, openapi, VERSAO_DA_API } from './openapi.ts';
import { csvDasAbas } from './csv.ts';

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'X-Planta-Api-Version': VERSAO_DA_API, ...extra },
  });
const texto = (corpo: string, tipo: string, extra: Record<string, string> = {}) =>
  new Response(corpo, { status: 200, headers: { ...corsHeaders, 'Content-Type': tipo, 'X-Planta-Api-Version': VERSAO_DA_API, ...extra } });

function tokenDoPedido(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(opk_[0-9a-f]{48})$/i.exec(auth.trim());
  if (m) return m[1];
  const chave = req.headers.get('X-Api-Key')?.trim() ?? '';
  return /^opk_[0-9a-f]{48}$/.test(chave) ? chave : null;
}

/** Cliente de serviço: as RPCs só aceitam `service_role`, e é o TOKEN (dentro da RPC) que escopa a organização. */
function servico() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}

interface VersaoComPayload {
  estudo_id: string;
  estudo: string;
  revisao: number;
  hash: string;
  kernel: string;
  publicada_em: string;
  notas: string | null;
  aprovacao: string | null;
  payload: unknown;
}

/** Erro de RPC: `42501` (token inválido) vira 401; o resto, 500 com a mensagem. */
function respostaDeErroRpc(error: { code?: string; message: string }): Response {
  if (error.code === '42501' || /token inv/i.test(error.message)) return json({ error: 'Token inválido, revogado ou vencido' }, 401);
  return json({ error: `Falha no banco: ${error.message}` }, 500);
}


serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  // O gateway entrega `/planta-api/...`; localmente pode vir sem o prefixo.
  const caminho = url.pathname.replace(/^\/planta-api/, '').replace(/\/+$/, '') || '/';
  // A URL pública tem o `/functions/v1` que o gateway tira antes de chegar aqui — e é https
  // (o TLS termina no gateway; aqui dentro o pedido chega como http).
  const origem = url.origin.replace(/^http:\/\/(?!localhost|127\.)/, 'https://');
  const base = `${origem}/functions/v1/planta-api`;

  // ── Documentação: pública, sem token ──────────────────────────────────────
  // Markdown, não HTML: a plataforma rebaixa text/html a text/plain (ver `openapi.ts`).
  if (req.method === 'GET' && (caminho === '/' || caminho === '/docs')) return texto(docsEmTexto(base), 'text/markdown; charset=utf-8');
  if (req.method === 'GET' && caminho === '/openapi.json') return json(openapi(base));
  if (req.method !== 'GET') return json({ error: 'A API é somente leitura: use GET' }, 405);

  const token = tokenDoPedido(req);
  if (!token) return json({ error: 'Token ausente: mande Authorization: Bearer opk_… (Planta › Colaborar › API)' }, 401);
  const sb = servico();

  // GET /v1/estudos
  if (caminho === '/v1/estudos') {
    const { data, error } = await sb.rpc('api_blueprint_studies', { p_token: token });
    if (error) return respostaDeErroRpc(error);
    return json(data ?? []);
  }

  // GET /v1/estudos/{id}/versoes[/{rev}[/derivado]]
  const m = /^\/v1\/estudos\/([0-9a-f-]{36})\/versoes(?:\/([^/]+))?(?:\/(quantitativos|planilha\.csv|ifc|unidades))?$/.exec(caminho);
  if (!m) return json({ error: `Rota desconhecida: ${caminho}. Veja ${base}/docs` }, 404);
  const [, estudoId, revisaoTxt, derivado] = m;

  if (!revisaoTxt) {
    const { data, error } = await sb.rpc('api_blueprint_versions', { p_token: token, p_study: estudoId });
    if (error) return respostaDeErroRpc(error);
    if (data === null) return json({ error: 'Estudo não encontrado para este token' }, 404);
    return json(data);
  }

  const revisao = revisaoTxt === 'ultima' ? null : Number(revisaoTxt);
  if (revisao !== null && (!Number.isInteger(revisao) || revisao < 1)) return json({ error: 'Revisão deve ser um inteiro ≥ 1 ou "ultima"' }, 400);
  const { data, error } = await sb.rpc('api_blueprint_version', { p_token: token, p_study: estudoId, p_revision: revisao });
  if (error) return respostaDeErroRpc(error);
  const v = data as VersaoComPayload | null;
  if (!v) return json({ error: revisao === null ? 'Estudo sem versão publicada, ou inexistente para este token' : `Revisão ${revisao} não encontrada para este token` }, 404);
  if (!derivado) return json(v);

  // ── Derivados: o kernel recalcula sobre o payload publicado ──────────────
  let model;
  try {
    model = modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(v.payload)));
  } catch (e) {
    return json({ error: `O payload publicado não pôde ser lido pelo kernel atual: ${e instanceof Error ? e.message : String(e)}`, kernel_publicado: v.kernel, kernel_calculo: KERNEL_VERSION }, 500);
  }
  const quant = computeQuantities(model, POLITICA_PADRAO, KERNEL_VERSION);
  const cabecalho = { estudo_id: v.estudo_id, estudo: v.estudo, revisao: v.revisao, hash: v.hash, kernel_publicado: v.kernel, kernel_calculo: KERNEL_VERSION };
  const nomeBase = `${v.estudo.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'planta'}-v${v.revisao}`;

  if (derivado === 'quantitativos') return json({ ...cabecalho, quantitativos: quant });

  if (derivado === 'planilha.csv') {
    const abas = abasDoQuantitativo(quant, { titulo: v.estudo, revisao: v.revisao, hash: v.hash, kernelVersion: KERNEL_VERSION });
    return texto(csvDasAbas(abas), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${nomeBase}-quantitativos.csv"` });
  }

  if (derivado === 'ifc') {
    const ifc = gerarIfc(model, { titulo: v.estudo, revisao: v.revisao, hash: v.hash, kernelVersion: KERNEL_VERSION, studyId: v.estudo_id, data: new Date(v.publicada_em) });
    return texto(ifc, 'application/x-step; charset=utf-8', { 'Content-Disposition': `attachment; filename="${nomeBase}.ifc"` });
  }

  // unidades
  const nomeDoNivel = new Map<string, string>(model.levels.map((l: { id: string; name: string }) => [l.id, l.name]));
  const etiquetaDe = (uid?: string | null) => (uid ? (model.labels ?? []).find((l: { uid: string }) => l.uid === uid) : undefined);
  interface AmbienteDaApi { id: string; nome: string | null; pavimento: string; tipo: string | null; unidade: string | null; area_piso_m2: number; area_eixo_m2: number; perimetro_m: number }
  const ambientes: AmbienteDaApi[] = quant.ambientes.map((q: { spaceId: string; uid: string | null; nome?: string; areaPisoM2: number; areaEixoM2: number; perimetroEixoM: number }): AmbienteDaApi => {
    const s = model.spaces.find((x: { id: string }) => x.id === q.spaceId);
    const etiqueta = etiquetaDe(q.uid);
    const unidade = q.uid ? unidadeDaEtiqueta(model, q.uid) : null;
    return {
      id: q.spaceId,
      nome: q.nome ?? s?.name ?? null,
      pavimento: nomeDoNivel.get(s?.levelId ?? '') ?? '',
      tipo: etiqueta?.tipoDeAmbiente ?? null,
      unidade: unidade?.numero ?? null,
      area_piso_m2: Math.round(q.areaPisoM2 * 100) / 100,
      area_eixo_m2: Math.round(q.areaEixoM2 * 100) / 100,
      perimetro_m: Math.round(q.perimetroEixoM * 100) / 100,
    };
  });
  const unidades = (model.unidades ?? []).map((u: { id: string; numero: string; tipologia?: string | null; pcd: boolean; etiquetaUids: string[] }) => {
    const dela = ambientes.filter((a: AmbienteDaApi) => a.unidade === u.numero);
    return { id: u.id, numero: u.numero, tipologia: u.tipologia ?? null, pcd: u.pcd, area_piso_m2: Math.round(dela.reduce((soma: number, a: AmbienteDaApi) => soma + a.area_piso_m2, 0) * 100) / 100, ambientes: dela.map((a: AmbienteDaApi) => a.id) };
  });
  return json({ ...cabecalho, unidades, ambientes });
});
