// supabase/functions/topografia-elevacao/index.ts
//
// Cotas do SRTM 30 m (OpenTopoData) para a Planta Inteligente.
//
// ─── POR QUE UMA EDGE FUNCTION ──────────────────────────────────────────────
//
// O OpenTopoData responde SEM `Access-Control-Allow-Origin` (medido em
// 10/09/2026), então o navegador não consegue chamá-lo. Esta function é o
// proxy: recebe coordenadas de um usuário autenticado, pergunta ao provedor e
// devolve as cotas na mesma ordem. Não toca no banco, não recebe organização —
// só exige um JWT válido, para o limite de taxa do provedor (1 req/s, 1000/dia
// no plano público) não ser gasto por qualquer um.
//
// Contrato: POST { coordenadas: [{ lat, lon }, …] } (≤ 100) → { elevation: (number|null)[] }.
// Erro do provedor vira 502 com a mensagem; o cliente trata como
// `FonteIndisponivel` e NUNCA preenche cota com zero.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const URL_OPENTOPODATA = 'https://api.opentopodata.org/v1/srtm30m';
const MAX_POR_REQUISICAO = 100;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Token inválido' }, 401);

  let corpo: { coordenadas?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido: esperava JSON { coordenadas: [{ lat, lon }] }' }, 400);
  }
  const coordenadas = Array.isArray(corpo.coordenadas) ? corpo.coordenadas : null;
  if (!coordenadas || coordenadas.length === 0) return json({ error: 'Informe coordenadas' }, 400);
  if (coordenadas.length > MAX_POR_REQUISICAO) return json({ error: `No máximo ${MAX_POR_REQUISICAO} coordenadas por requisição` }, 400);
  const validas = coordenadas.every(
    (c: { lat?: unknown; lon?: unknown }) =>
      c && typeof c.lat === 'number' && typeof c.lon === 'number' && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180,
  );
  if (!validas) return json({ error: 'Coordenada fora do intervalo ou sem lat/lon numéricos' }, 400);

  const locations = (coordenadas as { lat: number; lon: number }[])
    .map((c) => `${c.lat.toFixed(6)},${c.lon.toFixed(6)}`)
    .join('|');

  let resposta: Response;
  try {
    resposta = await fetch(`${URL_OPENTOPODATA}?locations=${encodeURIComponent(locations)}&interpolation=bilinear`, {
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    return json({ error: `OpenTopoData inacessível: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
  if (!resposta.ok) {
    return json({ error: `OpenTopoData respondeu HTTP ${resposta.status}` }, 502);
  }
  let dados: { status?: string; results?: { elevation: number | null }[]; error?: string };
  try {
    dados = await resposta.json();
  } catch {
    return json({ error: 'OpenTopoData respondeu algo que não é JSON' }, 502);
  }
  if (dados.status !== 'OK' || !Array.isArray(dados.results)) {
    return json({ error: `OpenTopoData: ${dados.error ?? dados.status ?? 'resposta inesperada'}` }, 502);
  }
  const elevation = dados.results.map((r) => (typeof r?.elevation === 'number' && Number.isFinite(r.elevation) ? r.elevation : null));
  if (elevation.length !== coordenadas.length) {
    return json({ error: `OpenTopoData devolveu ${elevation.length} cotas para ${coordenadas.length} pontos` }, 502);
  }
  return json({ elevation, fonte: 'OpenTopoData srtm30m', atribuicao: 'SRTM (NASA/USGS) via OpenTopoData' });
});
