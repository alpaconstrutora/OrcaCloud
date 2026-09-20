/**
 * API pública (20/09/2026, E9.2) — o que dá para provar sem Deno:
 *
 * 1. O BUNDLE do kernel que a Edge Function `planta-api` roda
 *    (`supabase/functions/planta-api/kernel.bundle.mjs`) está FRESCO
 *    (KERNEL_VERSION igual à do código) e dá o MESMO resultado do kernel do app
 *    (quantitativos, IFC e planilha idênticos para o mesmo modelo). Se este
 *    teste falhar depois de mexer no kernel: `node scripts/build-planta-api-kernel.mjs`.
 * 2. O CSV das abas (formato do Excel em português).
 * 3. O OpenAPI publicado descreve todas as rotas, com segurança por token, e
 *    a página de docs lista cada uma.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, computeQuantities, emptyModel, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, POLITICA_PADRAO, snapshotHash, type Command } from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import { abasDoQuantitativo } from '../utils/blueprintPlanilha';
import * as bundle from '../supabase/functions/planta-api/kernel.bundle.mjs';
import { csvDasAbas } from '../supabase/functions/planta-api/csv';
import { docsEmTexto, openapi, VERSAO_DA_API } from '../supabase/functions/planta-api/openapi';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const [a, b] = [...m.spaces].sort((p, q) => p.ring[0].x - q.ring[0].x);
  const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0 && x.a.x === 0)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: a.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: b.id, name: 'Banheiro', tipoDeAmbiente: 'BANHEIRO' },
    { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
  ]).model;
  return m;
}

describe('planta-api (E9.2)', () => {
  it('o bundle do kernel está fresco e é o MESMO kernel: versão, hash, quantitativos, IFC e planilha idênticos', () => {
    expect(bundle.KERNEL_VERSION).toBe(KERNEL_VERSION);
    const m = casa();
    // O caminho da function: payload publicado (texto do banco) → modelo → derivados.
    const doBanco = canonicalPayload(m);
    const modeloDaApi = bundle.modelFromCanonicalPayload(bundle.parseCanonicalPayload(doBanco));
    // O app relendo o próprio payload: é com ESSE modelo que a paridade se mede (a releitura reordena as paredes canonicamente).
    const modeloDoApp = modelFromCanonicalPayload(parseCanonicalPayload(doBanco));
    expect(bundle.snapshotHash(modeloDaApi)).toBe(snapshotHash(m));
    const qApp = computeQuantities(modeloDoApp, POLITICA_PADRAO, KERNEL_VERSION);
    const qApi = bundle.computeQuantities(modeloDaApi, bundle.POLITICA_PADRAO, bundle.KERNEL_VERSION);
    expect(JSON.stringify(qApi)).toBe(JSON.stringify(qApp));
    const data = new Date('2026-09-20T12:00:00Z');
    const opcoes = { titulo: 'Casa', revisao: 3, hash: snapshotHash(m), kernelVersion: KERNEL_VERSION, studyId: 'std_1', data };
    expect(bundle.gerarIfc(modeloDaApi, opcoes)).toBe(gerarIfc(modeloDoApp, opcoes));
    const ctx = { titulo: 'Casa', revisao: 3, hash: snapshotHash(m), kernelVersion: KERNEL_VERSION };
    expect(JSON.stringify(bundle.abasDoQuantitativo(qApi, ctx))).toBe(JSON.stringify(abasDoQuantitativo(qApp, ctx)));
  });

  it('CSV: BOM, "## Aba" por aba, ";" entre colunas, decimal com vírgula, aspas onde precisa, CRLF', () => {
    const csv = csvDasAbas([
      { nome: 'Totais', linhas: [['Grandeza', 'Valor'], ['Área de piso (m²)', 12.5], ['Paredes', 5], ['Obs', 'tem; ponto e vírgula'], ['Aspas', 'diz "oi"'], ['Vazio', null]] },
      { nome: 'Ambientes', linhas: [['Nome', 'm²'], ['Sala', 20.123456]] },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const linhas = csv.slice(1).split('\r\n');
    expect(linhas).toEqual(['## Totais', 'Grandeza;Valor', 'Área de piso (m²);12,5', 'Paredes;5', 'Obs;"tem; ponto e vírgula"', 'Aspas;"diz ""oi"""', 'Vazio;', '', '## Ambientes', 'Nome;m²', 'Sala;20,1235', '']);
  });

  it('OpenAPI 3.1: 7 rotas GET, todas exigindo o token da organização, com os derivados marcados; a documentação em Markdown lista cada rota e a autenticação', () => {
    const spec = openapi('https://x.supabase.co/functions/v1/planta-api');
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toBe(VERSAO_DA_API);
    expect(spec.servers[0].url).toBe('https://x.supabase.co/functions/v1/planta-api');
    const caminhos = Object.keys(spec.paths);
    expect(caminhos).toEqual([
      '/v1/estudos',
      '/v1/estudos/{estudoId}/versoes',
      '/v1/estudos/{estudoId}/versoes/{revisao}',
      '/v1/estudos/{estudoId}/versoes/{revisao}/quantitativos',
      '/v1/estudos/{estudoId}/versoes/{revisao}/planilha.csv',
      '/v1/estudos/{estudoId}/versoes/{revisao}/ifc',
      '/v1/estudos/{estudoId}/versoes/{revisao}/unidades',
    ]);
    for (const c of caminhos) {
      const ops = spec.paths[c as keyof typeof spec.paths] as Record<string, { operationId: string; responses: Record<string, unknown> }>;
      expect(Object.keys(ops)).toEqual(['get']);
      expect(ops.get.operationId).toBeTruthy();
      expect(ops.get.responses['401']).toBeTruthy();
    }
    expect(spec.security).toEqual([{ tokenDaOrganizacao: [] }]);
    expect(spec.components.securitySchemes.tokenDaOrganizacao.scheme).toBe('bearer');
    expect(spec.info.description).toMatch(/Somente leitura/);
    // A documentação humana é Markdown (a plataforma rebaixa HTML a text/plain): cada rota listada, autenticação e erros.
    const md = docsEmTexto('https://x.supabase.co/functions/v1/planta-api');
    for (const c of caminhos) expect(md).toContain(`- GET ${c}`);
    expect(md).toContain('Authorization: Bearer opk_');
    expect(md).toContain('https://x.supabase.co/functions/v1/planta-api/openapi.json');
    expect(md).toMatch(/## Erros/);
    expect(md).not.toMatch(/<[a-z]+>/);
  });
});
