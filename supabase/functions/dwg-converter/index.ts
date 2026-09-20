// supabase/functions/dwg-converter/index.ts
//
// DWG → DXF para a Planta Inteligente (20/09/2026, roadmap E9.1).
//
// ─── POR QUE UMA EDGE FUNCTION ──────────────────────────────────────────────
//
// O formato DWG é fechado; quem o lê é o libredwg (GPL), compilado para
// WebAssembly em `@mlightcad/libredwg-web`. O wasm tem 9,5 MB — pesado demais
// para entrar no bundle do navegador de quem nunca vai abrir um DWG — e o
// roadmap fixou a conversão no servidor: o navegador manda o DWG, recebe o
// DXF e segue pelo pipeline que já existe (`dxfLeitor` → `dxfParaKernel` →
// `PainelImportarDxf`). Nada aqui toca no kernel nem no banco.
//
// ─── CONTRATO ────────────────────────────────────────────────────────────────
//
//   POST  corpo = bytes do .dwg (Content-Type: application/octet-stream)
//         Authorization: Bearer <JWT de usuário> — só exige login; não há
//         organização envolvida porque nada é lido nem gravado.
//   200   corpo = DXF em texto (Content-Type: application/dxf; charset=utf-8)
//         X-Dwg-Version: AC1032 · X-Dwg-Release: AutoCAD 2018 · X-Dwg-Bytes: n
//   400   não é DWG (cabeçalho fora de AC10xx) / corpo vazio
//   413   maior que MAX_BYTES
//   422   o libredwg não conseguiu ler (arquivo truncado, cifrado, versão
//         fora do alcance) — `{ error, versao }`
//
// A versão do DWG vem do cabeçalho do próprio arquivo (6 primeiros bytes,
// "AC1032"), antes de qualquer conversão: é o que o painel mostra e o que o
// usuário confere com o "salvar como" do CAD dele.
//
// ─── O QUE NÃO FAZ ──────────────────────────────────────────────────────────
//
// Não escreve DWG. O wasm publicado pelo pacote é compilado com
// `--disable-write`; exportar para o CAD continua sendo o DXF da E4, que todo
// CAD abre. Está declarado na tela.
//
// O binário do libredwg (`libredwg-web.wasm.gz`, arquivo estático da function,
// gzip porque o upload recusa 9,5 MB crus) e
// a cola emscripten (`libredwg-web.js`, vendorada com duas alterações
// marcadas "OPURA") ficam ao lado deste arquivo.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore
import createModule from './libredwg-web.js';

declare const Deno: { env: { get(key: string): string | undefined }; readFile(path: URL | string): Promise<Uint8Array> };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Dwg-Version, X-Dwg-Release, X-Dwg-Bytes, X-Libredwg-Code',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** 30 MB: uma planta executiva grande tem 5–10 MB; acima disto é levantamento com nuvem de pontos, que não é o caso de uso. */
const MAX_BYTES = 30 * 1024 * 1024;

/** Cabeçalho do DWG → release do AutoCAD que o gravou. */
const RELEASES: Record<string, string> = {
  AC1006: 'AutoCAD R10',
  AC1009: 'AutoCAD R11/R12',
  AC1012: 'AutoCAD R13',
  AC1014: 'AutoCAD R14',
  AC1015: 'AutoCAD 2000/2002',
  AC1018: 'AutoCAD 2004/2006',
  AC1021: 'AutoCAD 2007/2009',
  AC1024: 'AutoCAD 2010/2012',
  AC1027: 'AutoCAD 2013/2017',
  AC1032: 'AutoCAD 2018+',
};

interface ModuloLibredwg {
  FS: {
    writeFile(nome: string, dados: Uint8Array): void;
    readFile(nome: string): Uint8Array;
    unlink(nome: string): void;
    analyzePath(nome: string, dontResolveLastLink?: boolean): { exists: boolean };
  };
  dwg_write_dxf(entrada: string, saida: string): number;
}

/** O wasm carrega UMA vez por instância da function e fica quente para as chamadas seguintes. */
let modulo: Promise<ModuloLibredwg> | null = null;
function libredwg(): Promise<ModuloLibredwg> {
  modulo ??= (async () => {
    // O wasm vai COMPRIMIDO (9,5 MB → 2,2 MB): o upload da function recusa o
    // binário cru com 413. Descompressão nativa, uma vez por instância.
    const comprimido = await Deno.readFile(new URL('./libredwg-web.wasm.gz', import.meta.url));
    const wasmBinary = new Uint8Array(await new Response(new Blob([comprimido]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    return (await createModule({ wasmBinary, print: () => {}, printErr: () => {} })) as ModuloLibredwg;
  })();
  return modulo;
}

/** Os 6 primeiros bytes: "AC1032". Fora de `AC10xx` não é DWG (é DXF, PDF, zip…). */
function cabecalho(bytes: Uint8Array): string | null {
  if (bytes.length < 6) return null;
  const s = String.fromCharCode(...bytes.subarray(0, 6));
  return /^AC10\d\d$/.test(s) ? s : null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST com o arquivo .dwg no corpo' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Token inválido' }, 401);

  const declarado = Number(req.headers.get('Content-Length') ?? 0);
  if (declarado > MAX_BYTES) return json({ error: `Arquivo maior que ${MAX_BYTES / 1024 / 1024} MB` }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) return json({ error: 'Corpo vazio: mande os bytes do .dwg' }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: `Arquivo maior que ${MAX_BYTES / 1024 / 1024} MB` }, 413);
  const versao = cabecalho(bytes);
  if (!versao) return json({ error: 'Isto não é um DWG: o cabeçalho não começa com AC10xx. Se for DXF, importe direto.' }, 400);

  const M = await libredwg();
  const id = crypto.randomUUID();
  const entrada = `/tmp-${id}.dwg`;
  const saida = `/tmp-${id}.dxf`;
  try {
    M.FS.writeFile(entrada, bytes);
    const codigo = M.dwg_write_dxf(entrada, saida);
    // Códigos do libredwg: abaixo de DWG_ERR_CRITICAL (128) são AVISOS (entidade
    // desconhecida, proxy, classe estranha) e o DXF sai inteiro mesmo assim —
    // o TERRENO.dwg real da empresa devolve 4 e converte perfeitamente. A partir
    // de 128 é erro de leitura de verdade.
    if (codigo >= 128 || !M.FS.analyzePath(saida).exists) {
      return json({ error: `O libredwg não conseguiu ler este DWG (código ${codigo}). Arquivo truncado, protegido por senha ou fora do alcance do leitor.`, versao, release: RELEASES[versao] ?? null }, 422);
    }
    const dxf = M.FS.readFile(saida);
    if (dxf.length === 0) return json({ error: 'A conversão produziu um DXF vazio.', versao }, 422);
    return new Response(dxf, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/dxf; charset=utf-8',
        'X-Dwg-Version': versao,
        'X-Dwg-Release': RELEASES[versao] ?? 'desconhecido',
        'X-Dwg-Bytes': String(bytes.length),
        'X-Libredwg-Code': String(codigo),
      },
    });
  } catch (e) {
    return json({ error: `Falha na conversão: ${e instanceof Error ? e.message : String(e)}`, versao }, 500);
  } finally {
    for (const nome of [entrada, saida]) {
      try {
        if (M.FS.analyzePath(nome).exists) M.FS.unlink(nome);
      } catch {
        // nada: memória do wasm, some com a instância
      }
    }
  }
});
