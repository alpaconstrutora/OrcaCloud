// supabase/functions/topografia-copernicus/index.ts
//
// Cotas do Copernicus DEM GLO-30 para a Planta Inteligente (11/10/2026).
//
// ─── POR QUE ESTA FONTE, E POR QUE UMA EDGE FUNCTION ────────────────────────
//
// Pedido: *"gerar tudo sem uso de ferramenta externa ... sem custos"*. O
// Copernicus GLO-30 (DLR/Airbus, 2011–2015) é público no AWS Open Data, com
// licença livre inclusive para uso comercial, sem limite de taxa — ao contrário
// do OpenTopoData (1000 pedidos/dia) e da API do Open-Meteo (só uso não
// comercial). O bucket responde `Range` mas SEM `Access-Control-Allow-Origin`
// (medido em 11/10/2026), então o navegador não lê direto: esta function lê os
// COGs por partes e devolve as cotas. Plano: docs/planos/2026-10-11-curvas-de-nivel-sem-ferramenta-externa.md.
//
// Contrato (o mesmo da `topografia-elevacao`, para o cliente tratar as duas
// igual): POST { coordenadas: [{ lat, lon }, …] } (≤ 2000) → { elevation: (number|null)[] }.
// `null` = sem dado (mar); NUNCA zero. Falha ao ler o provedor → 502, e o
// cliente trata como `FonteIndisponivel`.
//
// Exige JWT de usuário: não toca no banco nem recebe organização, mas a banda
// de saída é nossa e não deve ser gasta por qualquer um com a chave pública.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — bundle gerado por scripts/build-topografia-copernicus.mjs
import { AmostradorCog } from './cog.bundle.mjs';

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

const MAX_POR_REQUISICAO = 2000;
const ATRIBUICAO =
  'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 e © Airbus Defence and Space GmbH 2014-2018, fornecido no âmbito do COPERNICUS pela União Europeia e ESA';

/** Lê um trecho do COG. 404 = a quadrícula não existe (medido: mar aberto, S30 W030); 403 é tratado igual, que é como o S3 responde chave ausente em bucket sem listagem. */
async function lerFaixa(url: string, inicio: number, fim: number): Promise<Uint8Array | null> {
  const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${fim}` } });
  if (r.status === 404 || r.status === 403) {
    await r.body?.cancel();
    return null;
  }
  if (!r.ok) throw new Error(`Copernicus respondeu HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// Vive enquanto a instância vive: a 2ª requisição do mesmo terreno não baixa o
// bloco de novo (cada bloco de 1024 × 1024 tem ~2,5 MB comprimido).
const amostrador = new AmostradorCog(lerFaixa);

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

  let elevation: (number | null)[];
  try {
    elevation = await amostrador.cotas(coordenadas as { lat: number; lon: number }[]);
  } catch (e) {
    return json({ error: `Copernicus GLO-30 ilegível: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
  return json({ elevation, fonte: 'Copernicus DEM GLO-30 (AWS Open Data)', atribuicao: ATRIBUICAO });
});
