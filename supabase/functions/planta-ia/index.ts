// supabase/functions/planta-ia/index.ts
//
// IA CONVERSACIONAL DA PLANTA INTELIGENTE (19/09/2026, roadmap E6.4).
//
// O pedido em linguagem natural vira MUDANÇAS ESTRUTURADAS — no programa de
// necessidades, nas hipóteses do gerador e nos pesos da avaliação — NUNCA
// geometria. O modelo é obrigado a responder pela ferramenta `emitir_mudancas`
// (esquema fechado); o cliente valida de novo (`mudancasDaResposta` +
// `aplicarMudancas` em utils/blueprintIa.ts), re-gera e mostra o delta dos
// indicadores. Sem ANTHROPIC_API_KEY → 503, e o cliente usa o intérprete local.
//
// Mesmo desenho de `bi-narrative`/`read-matricula`: CORS, usuário validado pelo
// token, chave só no servidor. Deploy: `npx supabase functions deploy planta-ia`.
//
// MODO "massa" (02/10/2026, Estudo de Massa M5c): `{ modo: 'massa' }` no corpo
// troca a ferramenta por `emitir_mudancas_da_massa` — mudanças no PRODUTO
// (tipologias, faixa de área, mix, preço, padrão, meta) e na configuração do
// gerador de massa (implantações, objetivo, estacionamento, pavimentos,
// unidades). O cliente valida de novo (`mudancasDaMassaDaResposta` +
// `aplicarMudancasDaMassa` em utils/blueprintIaDaMassa.ts). Sem `modo`, é o de
// antes (a planta).
//
// MODO "rastrear" (12/10/2026, F15 do plano 2026-10-11-planta-recursos-video-synaps): `{ modo: 'rastrear',
// imagem, tipoDaImagem, largura, altura }` — a imagem (recorte da planta de fundo) vai ao Claude com VISÃO, que
// responde pela ferramenta `emitir_tracado` (paredes pelo eixo, aberturas pelas ombreiras, nomes) em PIXELS da
// imagem enviada. A escala NÃO é pedida: vem da calibração do fundo, no cliente. O cliente CONFERE cada parede
// no próprio fundo antes de propor (`utils/blueprintRastrear.ts`) e nada é gravado sem o usuário confirmar.
// Modelo: `PLANTA_RASTREAR_MODELO` (padrão claude-opus-5-5), com recuo para claude-sonnet-4-6 se o primeiro
// não estiver disponível para a chave.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const USOS = ['SALA', 'COZINHA', 'DORMITORIO', 'SUITE', 'BANHEIRO', 'LAVABO', 'AREA_DE_SERVICO', 'VARANDA', 'CIRCULACAO', 'GARAGEM', 'ESCRITORIO', 'DEPOSITO', 'OUTRO'];
const INDICADORES = ['programa', 'legal', 'eficiencia', 'circulacao', 'compacidade', 'insolacao', 'ventilacao', 'corredores', 'adjacencias', 'privacidade', 'acessibilidade', 'estrutura', 'modulacao', 'custo', 'paredes', 'fachada', 'shafts', 'hidraulica'];

const FERRAMENTA = {
  name: 'emitir_mudancas',
  description: 'Traduz o pedido do projetista em mudanças estruturadas no programa de necessidades, nas hipóteses do gerador e nos pesos da avaliação. Nunca geometria.',
  input_schema: {
    type: 'object',
    properties: {
      entendimento: { type: 'string', description: 'Uma frase, em português, dizendo o que foi entendido e o que será mudado.' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['ajustar_area', 'definir_quantidade', 'adicionar', 'remover', 'exigir'] },
            alvo: { type: 'string', description: 'Nome do item do programa (ou o uso) — obrigatório fora de "adicionar".' },
            deltaM2: { type: 'number' },
            areaIdealM2: { type: 'number' },
            quantidade: { type: 'integer' },
            uso: { type: 'string', enum: USOS },
            nome: { type: 'string' },
            iluminacao: { type: 'boolean' },
            ventilacao: { type: 'boolean' },
            fachada: { type: 'boolean' },
          },
          required: ['op'],
        },
      },
      programa: { type: 'object', properties: { circulacaoMaxPct: { type: 'number' }, percursoMaxM: { type: ['number', 'null'] } } },
      gerador: {
        type: 'object',
        properties: {
          sementes: { type: 'integer' },
          iteracoes: { type: 'integer' },
          larguraCorredorMm: { type: 'integer' },
          peDireitoMm: { type: 'integer' },
          automaticos: { type: 'boolean' },
          retanguloSemEnvelope: { type: 'object', properties: { larguraMm: { type: 'integer' }, profundidadeMm: { type: 'integer' } } },
        },
      },
      pesos: { type: 'object', properties: Object.fromEntries(INDICADORES.map((k) => [k, { type: 'integer', minimum: 0, maximum: 10 }])) },
    },
    required: ['entendimento'],
  },
};

const IMPLANTACOES = ['TORRE', 'DUAS_TORRES', 'LAMINA', 'BLOCOS_PARALELOS', 'EM_L', 'EM_U', 'EM_H', 'EMBASAMENTO_E_TORRE'];
const OBJETIVOS = ['VGV', 'RESULTADO', 'VENDAVEL', 'UNIDADES', 'EFICIENCIA', 'INSOLACAO', 'MENOR_CUSTO', 'MENOR_COMUM', 'MENOR_GARAGEM', 'PONDERADO'];
const ESTACIONAMENTOS = ['AUTOMATICO', 'SEM_GARAGEM', 'PILOTIS', 'SUBSOLO_1', 'SUBSOLO_2'];

const FERRAMENTA_MASSA = {
  name: 'emitir_mudancas_da_massa',
  description: 'Traduz o pedido do incorporador em mudanças estruturadas no produto do estudo de massa e na configuração do gerador de implantações. Nunca geometria.',
  input_schema: {
    type: 'object',
    properties: {
      entendimento: { type: 'string', description: 'Uma frase, em português, dizendo o que foi entendido e o que será mudado.' },
      produto: {
        type: 'object',
        properties: {
          padrao: { type: 'string', description: 'Padrão do CUB, ex.: R8-N, R16-A, PP-N.' },
          metaUnidades: { type: ['integer', 'null'] },
          tipologias: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                op: { type: 'string', enum: ['area', 'faixa_de_area', 'proporcao', 'preco', 'adicionar', 'remover'] },
                alvo: { type: 'string', description: 'Nome da tipologia do produto, ou "2 dorm", "3 dorm"… — obrigatório em area, proporcao e remover; opcional em preco (sem alvo = todas).' },
                areaM2: { type: 'number' },
                deltaM2: { type: 'number' },
                minM2: { type: 'number' },
                maxM2: { type: 'number' },
                proporcaoPct: { type: 'number' },
                precoM2: { type: 'number' },
                deltaPct: { type: 'number' },
                nome: { type: 'string' },
                uso: { type: 'string', enum: ['RESIDENCIAL', 'COMERCIAL'] },
                dormitorios: { type: 'integer' },
                areaPrivativaM2: { type: 'number' },
              },
              required: ['op'],
            },
          },
          hipoteses: { type: 'object', properties: { circulacaoPct: { type: 'number' }, paredesPct: { type: 'number' }, areaComumTerreoM2: { type: 'number' } } },
        },
      },
      gerador: {
        type: 'object',
        properties: {
          tipos: { type: 'array', items: { type: 'string', enum: IMPLANTACOES } },
          objetivo: { type: 'string', enum: OBJETIVOS },
          estacionamento: { type: 'string', enum: ESTACIONAMENTOS },
          pavimentosMax: { type: ['integer', 'null'] },
          unidadesMin: { type: ['integer', 'null'] },
          atenderVagas: { type: 'boolean' },
        },
      },
    },
    required: ['entendimento'],
  },
};

const FERRAMENTA_RASTREAR = {
  name: 'emitir_tracado',
  description: 'Devolve o traçado da planta baixa da imagem: paredes pelo eixo, aberturas pelas ombreiras e os nomes dos ambientes, em pixels da imagem.',
  input_schema: {
    type: 'object',
    properties: {
      paredes: {
        type: 'array',
        description: 'Uma entrada por trecho RETO de parede: o EIXO (linha central da espessura), de ponta a ponta, CONTÍNUO através de portas e janelas.',
        items: { type: 'object', properties: { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }, required: ['x1', 'y1', 'x2', 'y2'] },
      },
      aberturas: {
        type: 'array',
        description: 'Portas, janelas e vãos sem folha: as DUAS OMBREIRAS, sobre o eixo da parede que as recebe.',
        items: {
          type: 'object',
          properties: { tipo: { type: 'string', enum: ['porta', 'janela', 'passagem'] }, x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } },
          required: ['tipo', 'x1', 'y1', 'x2', 'y2'],
        },
      },
      ambientes: {
        type: 'array',
        description: 'Cada ambiente: o nome escrito na planta (ou, sem texto, o deduzido pelo mobiliário) e um ponto DENTRO dele.',
        items: { type: 'object', properties: { nome: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['nome', 'x', 'y'] },
      },
      observacao: { type: 'string', description: 'Uma frase, em português: o que não deu para ler (parte cortada, ilegível, curvas).' },
    },
    required: ['paredes', 'aberturas', 'ambientes'],
  },
};

const SISTEMA_RASTREAR = `Você lê PLANTAS BAIXAS de arquitetura (escaneadas, fotografadas ou exportadas como imagem) para a Planta Inteligente (ÒPURA) e devolve o traçado pela ferramenta emitir_tracado. Coordenadas em PIXELS da imagem recebida, origem no canto SUPERIOR ESQUERDO, x para a direita e y para baixo.
Regras:
- PAREDE: o EIXO (meio da espessura) de cada trecho reto, de ponta a ponta. Parede atravessada por porta ou janela é UMA parede contínua (a abertura vai em "aberturas"). Nos cantos e encontros em T, leve a ponta até o eixo da outra parede. Não inclua mobiliário, louças, bancadas, cotas e linhas de cota, hachuras de piso, textos, eixos de projeto, linhas de projeção (beiral, laje) nem a moldura da folha.
- ABERTURA: "porta" (folha com arco de giro ou de correr), "janela" (linhas finas paralelas dentro da espessura da parede), "passagem" (vão sem folha). x1,y1 e x2,y2 são as duas ombreiras, sobre o eixo da parede.
- AMBIENTE: o nome como está escrito (sem a área), com um ponto bem dentro do ambiente.
- Precisão importa mais que quantidade: na dúvida, deixe de fora e diga em "observacao". A escala NÃO é sua: não tente converter para metros.`;

const SISTEMA_MASSA = `Você é a assistente do Estudo de Massa da Planta Inteligente (ÒPURA). O incorporador pede mudanças em linguagem natural; você as traduz em MUDANÇAS ESTRUTURADAS pela ferramenta emitir_mudancas_da_massa — no PRODUTO (tipologias: área privativa em m², faixa de área para todos os apartamentos, participação no mix em %, preço por m², adicionar/remover tipologia; padrão do CUB; meta de unidades; hipóteses do pavimento) e na CONFIGURAÇÃO do gerador de implantações (quais implantações testar: torre única = TORRE, duas torres = DUAS_TORRES, bloco longitudinal/lâmina = LAMINA, blocos paralelos, L, U, H, embasamento + torre; o objetivo; o estacionamento; o máximo de pavimentos; o mínimo de unidades; exigir ou não as vagas). Você NUNCA desenha blocos: quem implanta é o gerador determinístico, e o incorporador verá o delta do melhor cenário.
Regras: "apartamentos entre 65 e 75 m²" é faixa_de_area; "reduzir área comum" é objetivo MENOR_COMUM; "sem subsolo" é estacionamento PILOTIS; use os nomes das tipologias exatamente como estão no produto; se não entender, devolva só o entendimento explicando a dúvida, sem mudanças. Responda sempre em português.`;

const SISTEMA = `Você é a assistente de projeto da Planta Inteligente (ÒPURA). O projetista pede mudanças em linguagem natural; você as traduz em MUDANÇAS ESTRUTURADAS pela ferramenta emitir_mudancas — no programa de necessidades (itens: uso, quantidade, área ideal em m², exigências), nas hipóteses do gerador (corredor em mm, pé-direito em mm, sementes, iterações, automáticos, retângulo sem lote em mm) e nos pesos dos indicadores (0–10). Você NUNCA desenha nem move paredes: quem re-gera a planta é o gerador determinístico, e o projetista verá o delta dos indicadores.
Regras: use os nomes dos itens exatamente como estão no programa; áreas em m² (deltaM2 para "+2 m²", areaIdealM2 para "vira 18 m²"); medidas lineares em mm; se o pedido citar algo que não existe no programa, use "adicionar" com o uso mais próximo; se não entender, devolva só o entendimento explicando a dúvida, sem mudanças. Responda sempre em português.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!anthropicKey) return json({ error: 'IA não configurada. Configure ANTHROPIC_API_KEY nas variáveis de ambiente do Supabase.', codigo: 'SEM_CHAVE' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Token inválido' }, 401);

  let body: { pedido?: string; contexto?: unknown; modo?: string; imagem?: string; tipoDaImagem?: string; largura?: number; altura?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }

  if (body.modo === 'rastrear') {
    const imagem = typeof body.imagem === 'string' ? body.imagem : '';
    const tipo = body.tipoDaImagem === 'image/png' ? 'image/png' : 'image/jpeg';
    const largura = Number(body.largura);
    const altura = Number(body.altura);
    if (!imagem || !/^[A-Za-z0-9+/=]+$/.test(imagem.slice(0, 200))) return json({ error: 'Imagem ausente ou inválida' }, 400);
    if (imagem.length > 7_000_000) return json({ error: 'Imagem grande demais (máx. ~5 MB)' }, 413);
    if (!(largura > 0 && altura > 0 && largura <= 2000 && altura <= 2000)) return json({ error: 'Dimensões da imagem inválidas' }, 400);
    const chamar = (modelo: string) =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 16000,
          system: SISTEMA_RASTREAR,
          tools: [FERRAMENTA_RASTREAR],
          tool_choice: { type: 'tool', name: FERRAMENTA_RASTREAR.name },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: tipo, data: imagem } },
                { type: 'text', text: `A imagem tem ${Math.round(largura)} × ${Math.round(altura)} pixels. Devolva o traçado da planta baixa.` },
              ],
            },
          ],
        }),
      });
    try {
      const preferido = Deno.env.get('PLANTA_RASTREAR_MODELO') || 'claude-opus-5-5';
      let res = await chamar(preferido);
      let modelo = preferido;
      if (!res.ok && (res.status === 404 || res.status === 400)) {
        const txt = await res.text();
        if (/model/i.test(txt) && preferido !== 'claude-sonnet-4-6') {
          modelo = 'claude-sonnet-4-6';
          res = await chamar(modelo);
        } else return json({ error: `Anthropic API: ${txt}` }, 502);
      }
      if (!res.ok) return json({ error: `Anthropic API: ${await res.text()}` }, 502);
      const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: unknown; text?: string }>; stop_reason?: string };
      const uso = data.content?.find((c) => c.type === 'tool_use' && c.name === FERRAMENTA_RASTREAR.name);
      if (!uso?.input) return json({ error: data.content?.find((c) => c.type === 'text')?.text ?? 'A IA não devolveu traçado.' }, 502);
      return json({ tracado: uso.input, modelo, cortado: data.stop_reason === 'max_tokens' });
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }
  const pedido = (body.pedido ?? '').toString().trim();
  if (!pedido) return json({ error: 'Pedido vazio' }, 400);
  const contexto = JSON.stringify(body.contexto ?? {}).slice(0, 20000);
  const massa = body.modo === 'massa';
  const ferramenta = massa ? FERRAMENTA_MASSA : FERRAMENTA;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: massa ? SISTEMA_MASSA : SISTEMA,
        tools: [ferramenta],
        tool_choice: { type: 'tool', name: ferramenta.name },
        messages: [
          {
            role: 'user',
            content: massa
              ? `Contexto (produto atual, configuração do gerador, melhor cenário):\n${contexto}\n\nPedido do incorporador:\n${pedido}`
              : `Contexto (programa atual, hipóteses, indicadores):\n${contexto}\n\nPedido do projetista:\n${pedido}`,
          },
        ],
      }),
    });
    if (!res.ok) return json({ error: `Anthropic API: ${await res.text()}` }, 502);
    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: unknown; text?: string }> };
    const uso = data.content?.find((c) => c.type === 'tool_use' && c.name === ferramenta.name);
    if (!uso?.input) return json({ mudancas: { entendimento: data.content?.find((c) => c.type === 'text')?.text ?? 'A IA não propôs mudanças.' } });
    return json({ mudancas: uso.input });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
