// supabase/functions/planta-api/openapi.ts
//
// A DOCUMENTAÇÃO PUBLICADA da API pública da Planta Inteligente (E9.2): o
// OpenAPI 3.1 servido em `GET /planta-api/openapi.json` e a página humana em
// `GET /planta-api/docs`. Vive junto do código que a implementa para os dois
// não divergirem — cada rota nova entra aqui e em `index.ts` no mesmo commit.

export const VERSAO_DA_API = '1.0.0';

const seguranca = [{ tokenDaOrganizacao: [] }];
const erro = { description: 'Erro', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } };
const parametroEstudo = { name: 'estudoId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Id do estudo (de `GET /v1/estudos`).' };
const parametroRevisao = { name: 'revisao', in: 'path', required: true, schema: { type: 'string' }, description: 'Número da revisão publicada (`1`, `2`, …) ou `ultima`.' };

export function openapi(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ÒPURA · Planta Inteligente — API pública',
      version: VERSAO_DA_API,
      description: [
        'Leitura dos estudos da Planta Inteligente de UMA organização: estudos, versões publicadas (payload canônico + hash), quantitativos, planilha, IFC e unidades/áreas.',
        '',
        '**Autenticação**: token da organização, criado em Planta › Colaborar › API. Mande `Authorization: Bearer opk_…`. O token vale para a organização em que foi criado e para nada além dela; revogue-o na mesma tela.',
        '',
        '**Versões**: só o que foi PUBLICADO. O rascunho na tela nunca sai pela API. Cada versão traz o `hash` do payload canônico e o `kernel` que a publicou; quantitativos, planilha, IFC e unidades são RECALCULADOS pelo kernel atual (`kernel_calculo`) sobre o payload publicado — o hash publicado é o da versão, não o do recálculo.',
        '',
        '**Somente leitura**: a API não cria, altera nem apaga nada. Não há paginação: um estudo raramente passa de algumas dezenas de versões.',
      ].join('\n'),
    },
    servers: [{ url: baseUrl }],
    security: seguranca,
    tags: [
      { name: 'Estudos' },
      { name: 'Versões' },
      { name: 'Derivados', description: 'Calculados pelo kernel sobre o payload publicado.' },
    ],
    paths: {
      '/v1/estudos': {
        get: {
          tags: ['Estudos'],
          summary: 'Estudos da organização do token',
          operationId: 'listarEstudos',
          responses: { '200': { description: 'Lista, do mais recente ao mais antigo.', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Estudo' } } } } }, '401': erro },
        },
      },
      '/v1/estudos/{estudoId}/versoes': {
        get: {
          tags: ['Versões'],
          summary: 'Versões publicadas de um estudo (sem o payload)',
          operationId: 'listarVersoes',
          parameters: [parametroEstudo],
          responses: { '200': { description: 'Da revisão mais alta à mais baixa.', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Versao' } } } } }, '401': erro, '404': erro },
        },
      },
      '/v1/estudos/{estudoId}/versoes/{revisao}': {
        get: {
          tags: ['Versões'],
          summary: 'Uma versão, com o payload canônico e o hash',
          operationId: 'obterVersao',
          parameters: [parametroEstudo, parametroRevisao],
          responses: { '200': { description: 'A versão. `payload` é o JSON canônico do kernel que a publicou.', content: { 'application/json': { schema: { $ref: '#/components/schemas/VersaoComPayload' } } } }, '401': erro, '404': erro },
        },
      },
      '/v1/estudos/{estudoId}/versoes/{revisao}/quantitativos': {
        get: {
          tags: ['Derivados'],
          summary: 'Quantitativos (o mesmo motor da aba Quantitativos)',
          operationId: 'obterQuantitativos',
          parameters: [parametroEstudo, parametroRevisao],
          responses: { '200': { description: 'Ambientes, paredes, aberturas, estrutura, telhado, escadas, guarda-corpos, instalações e totais.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Quantitativos' } } } }, '401': erro, '404': erro },
        },
      },
      '/v1/estudos/{estudoId}/versoes/{revisao}/planilha.csv': {
        get: {
          tags: ['Derivados'],
          summary: 'A planilha de quantitativos em CSV',
          description: 'As mesmas abas do .xlsx da tela, uma após a outra: cada aba começa com uma linha `## Nome da aba`, colunas separadas por `;`, decimal com vírgula, UTF-8 com BOM (abre direto no Excel em português).',
          operationId: 'obterPlanilhaCsv',
          parameters: [parametroEstudo, parametroRevisao],
          responses: { '200': { description: 'CSV.', content: { 'text/csv': { schema: { type: 'string' } } } }, '401': erro, '404': erro },
        },
      },
      '/v1/estudos/{estudoId}/versoes/{revisao}/ifc': {
        get: {
          tags: ['Derivados'],
          summary: 'O modelo em IFC 4 (STEP)',
          description: 'O mesmo arquivo que a tela exporta: paredes, aberturas, ambientes, estrutura, telhado, escadas, guarda-corpos, instalações, com quantidades (Qto_*) e classificação. GUIDs estáveis por identidade da peça.',
          operationId: 'obterIfc',
          parameters: [parametroEstudo, parametroRevisao],
          responses: { '200': { description: 'IFC em texto.', content: { 'application/x-step': { schema: { type: 'string' } } } }, '401': erro, '404': erro },
        },
      },
      '/v1/estudos/{estudoId}/versoes/{revisao}/unidades': {
        get: {
          tags: ['Derivados'],
          summary: 'Unidades e ambientes com áreas',
          operationId: 'obterUnidades',
          parameters: [parametroEstudo, parametroRevisao],
          responses: { '200': { description: 'Unidades (número, tipologia, PCD, área privativa somada) e todos os ambientes (nome, pavimento, tipo, unidade, áreas e perímetro).', content: { 'application/json': { schema: { $ref: '#/components/schemas/Unidades' } } } }, '401': erro, '404': erro },
        },
      },
    },
    components: {
      securitySchemes: {
        tokenDaOrganizacao: { type: 'http', scheme: 'bearer', bearerFormat: 'opk_…', description: 'Token da organização (Planta › Colaborar › API). Também aceito em `X-Api-Key`.' },
      },
      schemas: {
        Erro: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        Estudo: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: { type: 'string' },
            status: { type: 'string', description: 'RASCUNHO, PUBLICADO, …' },
            sistema_de_unidades: { type: 'string', enum: ['METRIC', 'IMPERIAL'] },
            obra_id: { type: ['string', 'null'], format: 'uuid' },
            criado_em: { type: 'string', format: 'date-time' },
            atualizado_em: { type: 'string', format: 'date-time' },
            versoes: { type: 'integer', description: 'Quantas revisões publicadas.' },
            ultima_revisao: { type: ['integer', 'null'] },
            ultima_publicacao: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        Versao: {
          type: 'object',
          properties: {
            revisao: { type: 'integer' },
            hash: { type: 'string', description: 'SHA-256 do payload canônico, como publicado.' },
            kernel: { type: 'string', description: 'Versão do kernel que publicou (`blueprint-kernel-ts-0.45.0`).' },
            publicada_em: { type: 'string', format: 'date-time' },
            notas: { type: ['string', 'null'] },
            aprovacao: { type: ['string', 'null'] },
            ramo_id: { type: 'string', format: 'uuid' },
          },
        },
        VersaoComPayload: {
          allOf: [
            { $ref: '#/components/schemas/Versao' },
            { type: 'object', properties: { estudo_id: { type: 'string', format: 'uuid' }, estudo: { type: 'string' }, payload: { type: 'object', description: 'Payload canônico do kernel: níveis, paredes, aberturas, etiquetas, estrutura, redes, … Chave `kernelVersion` dentro dele.' } } },
          ],
        },
        Quantitativos: {
          type: 'object',
          properties: {
            estudo_id: { type: 'string', format: 'uuid' },
            revisao: { type: 'integer' },
            hash: { type: 'string' },
            kernel_publicado: { type: 'string' },
            kernel_calculo: { type: 'string', description: 'O kernel que calculou AGORA.' },
            quantitativos: { type: 'object', description: 'A saída de `computeQuantities`: `ambientes[]`, `paredes[]`, `aberturas[]`, `estruturas[]`, `telhados[]`, `escadas[]`, `guardaCorpos[]`, `instalacoes`, `totais` (m², m³, m, un).' },
          },
        },
        Unidades: {
          type: 'object',
          properties: {
            estudo_id: { type: 'string', format: 'uuid' },
            revisao: { type: 'integer' },
            unidades: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, numero: { type: 'string' }, tipologia: { type: ['string', 'null'] }, pcd: { type: 'boolean' }, area_piso_m2: { type: 'number' }, ambientes: { type: 'array', items: { type: 'string' } } } } },
            ambientes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nome: { type: ['string', 'null'] }, pavimento: { type: 'string' }, tipo: { type: ['string', 'null'] }, unidade: { type: ['string', 'null'] }, area_piso_m2: { type: 'number' }, area_eixo_m2: { type: 'number' }, perimetro_m: { type: 'number' } } } },
          },
        },
      },
    },
  };
}

/**
 * A documentação humana em TEXTO (Markdown), servida em `/docs`.
 *
 * ⚠️ Não é HTML de propósito: a plataforma de Edge Functions devolve qualquer
 * `text/html` como `text/plain` (medido em 20/09/2026 — proteção contra
 * phishing no domínio *.supabase.co). Um HTML aqui apareceria como código-fonte.
 * A página bonita é a tela Planta › Colaborar › API, que lê o MESMO objeto
 * `openapi()`; aqui vai o Markdown, que qualquer leitor exibe.
 */
export function docsEmTexto(baseUrl: string): string {
  const spec = openapi(baseUrl);
  const rotas = Object.entries(spec.paths)
    .map(([caminho, ops]) => {
      const op = (ops as Record<string, { summary: string; description?: string }>).get;
      return `- GET ${caminho}\n  ${op.summary}${op.description ? `\n  ${op.description}` : ''}`;
    })
    .join('\n');
  return [
    `# ${spec.info.title} — v${VERSAO_DA_API}`,
    '',
    spec.info.description,
    '',
    `Especificação OpenAPI 3.1: ${baseUrl}/openapi.json (importe no Postman, Insomnia, Power Query…).`,
    '',
    '## Autenticação',
    '',
    'Token da organização, criado em Planta › Colaborar › API. Mande em `Authorization: Bearer opk_…` (ou `X-Api-Key`).',
    '',
    '```',
    `curl -H "Authorization: Bearer opk_…" ${baseUrl}/v1/estudos`,
    `curl -H "Authorization: Bearer opk_…" ${baseUrl}/v1/estudos/<estudoId>/versoes/ultima/quantitativos`,
    `curl -H "Authorization: Bearer opk_…" -o planta.ifc ${baseUrl}/v1/estudos/<estudoId>/versoes/3/ifc`,
    '```',
    '',
    '## Rotas',
    '',
    rotas,
    '',
    '## Erros',
    '',
    '- 401: token ausente, inválido, revogado ou vencido (a resposta não diz qual).',
    '- 404: estudo ou revisão que não existe PARA ESTE TOKEN — um estudo de outra organização é inexistente.',
    '- 405: qualquer método além de GET.',
    '',
  ].join('\n');
}
