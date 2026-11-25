// supabase/functions/cobertura-do-solo/index.ts
//
// Cobertura do solo (ESA WorldCover 10 m, 2021) para as ÁRVORES da Maquete da Planta Inteligente
// (25/11/2026, o reel da Hektar; decisão do usuário: "OSM + satélite").
//
// ─── POR QUE UMA EDGE FUNCTION ───────────────────────────────────────────────
//
// O WorldCover é público no AWS Open Data (licença CC BY 4.0, uso comercial com atribuição), como
// COG. O bucket responde `Range` mas SEM `Access-Control-Allow-Origin` (medido em 25/11/2026):
// o navegador não lê direto. Esta function lê só os blocos que a caixa toca e devolve as classes.
// Plano: docs/planos/2026-11-17-planta-maquete-curvas-interativas.md (F4).
//
// Contrato: POST { caixa: { sul, oeste, norte, leste } } (≤ 4 km²) →
//   { oeste, norte, passoGraus, colunas, linhas, classes (base64 de uint8, linha 0 = norte), atribuicao }
// Classe 0 = sem dado (mar, nodata). Falha ao ler o provedor → 502.
//
// Exige JWT de usuário: não toca no banco nem recebe organização, mas a banda de saída é nossa e
// não deve ser gasta por qualquer um com a chave pública.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — bundle gerado por scripts/build-cobertura-do-solo.mjs
import { ATRIBUICAO_WORLDCOVER, caixaValida, classesEmBase64, coberturaNaCaixa } from './cobertura.bundle.mjs';

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

/** Lê um trecho do COG. 404/403 = a quadrícula não existe (mar aberto). */
async function lerFaixa(url: string, inicio: number, fim: number): Promise<Uint8Array | null> {
  const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${fim}` } });
  if (r.status === 404 || r.status === 403) {
    await r.body?.cancel();
    return null;
  }
  if (!r.ok) throw new Error(`WorldCover respondeu HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// Vive enquanto a instância vive: a 2ª requisição do mesmo terreno não baixa o bloco de novo.
const arquivos = new Map();

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

  let corpo: { caixa?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido: esperava JSON { caixa: { sul, oeste, norte, leste } }' }, 400);
  }
  if (!caixaValida(corpo.caixa)) return json({ error: 'Caixa inválida: sul < norte, oeste < leste, em graus' }, 400);

  let grade;
  try {
    grade = await coberturaNaCaixa(corpo.caixa, lerFaixa, arquivos);
  } catch (e) {
    if (e instanceof RangeError) return json({ error: e.message }, 400);
    return json({ error: `WorldCover ilegível: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
  return json({
    oeste: grade.oeste,
    norte: grade.norte,
    passoGraus: grade.passoGraus,
    colunas: grade.colunas,
    linhas: grade.linhas,
    classes: classesEmBase64(grade.classes),
    fonte: 'ESA WorldCover 10 m v200 (AWS Open Data)',
    atribuicao: ATRIBUICAO_WORLDCOVER,
  });
});
