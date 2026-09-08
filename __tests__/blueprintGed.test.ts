/**
 * A planta publicada no GED (Etapa 5, fatia 3 — 08/09/2026).
 *
 * ─── O QUE ESTES CASOS PROVAM ───────────────────────────────────────────────
 *
 * Não que "o upload foi chamado" — isso seria provar que o `mock` funciona. O
 * que está em jogo é o que chega ao GED: se a COBERTURA vai junto, se a REVISÃO
 * aparece onde alguém a lê, se a procedência dá para provar depois, e se
 * publicar não é a mesma coisa que divulgar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadNewDocument = vi.fn();
const sharePortalDocumentsBatch = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { email: 'quem@clicou.com' } } }) } },
}));

vi.mock('../services/documentService', () => ({
  documentService: {
    uploadNewDocument: (...a: unknown[]) => uploadNewDocument(...a),
    sharePortalDocumentsBatch: (...a: unknown[]) => sharePortalDocumentsBatch(...a),
  },
}));

import {
  artefatosDoFormato,
  compartilharComCliente,
  descricaoNoGed,
  nomeNoGed,
  publicarNoGed,
} from '../services/blueprintGedService';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { PAPEIS } from '../utils/blueprintExport';

function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const nivel = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: nivel,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 200,
    heightMm: 2800,
  });
  return applyBatch(base, [
    p(0, 0, 6000, 0),
    p(6000, 0, 6000, 4000),
    p(6000, 4000, 0, 4000),
    p(0, 4000, 0, 0),
  ]).model;
}

const OPCOES = {
  denominador: 50,
  papel: PAPEIS.find((p) => p.id === 'A3')!,
  titulo: 'Planta Térreo',
  revisao: 7,
  hash: 'a'.repeat(64),
  data: new Date('2026-09-08T12:00:00Z'),
};

const ALVO = {
  organizationId: 'org-1',
  projectId: 'obra-9',
  titulo: 'Planta Térreo',
  revisao: 7,
  hash: 'a'.repeat(64),
};

beforeEach(() => {
  uploadNewDocument.mockReset();
  sharePortalDocumentsBatch.mockReset();
  let n = 0;
  uploadNewDocument.mockImplementation(async () => ({ id: `doc-${++n}` }));
});

describe('o que vai para o GED', () => {
  it('⚠️ a COBERTURA vai junto, como documento próprio', async () => {
    // O `.txt` de cobertura é o que declara o que o arquivo NÃO contém, e é o
    // único motivo pelo qual exportar um IFC parcial é honesto. Publicar o
    // desenho e deixar a cobertura para trás faria no GED exatamente o que o
    // download evita: entregar o arquivo sem o que o limita.
    const publicados = await publicarNoGed('ifc', casa(), OPCOES, ALVO);
    expect(publicados).toHaveLength(2);
    expect(publicados.map((p) => p.artefato.tipo)).toEqual(['ifc', 'cobertura']);
  });

  it('a REVISÃO está no NOME, e não só na coluna', async () => {
    // Quem procura no GED lê a lista, não abre o registro: dois "Planta Térreo"
    // na mesma pasta são indistinguíveis justo quando importa saber qual é o
    // mais novo.
    await publicarNoGed('dxf', casa(), OPCOES, ALVO);
    const [dados] = uploadNewDocument.mock.calls[0] as [Record<string, unknown>];
    expect(dados.nome).toBe('Planta Térreo — rev. 7 — DXF');
    expect(dados.revisao).toBe('7');
  });

  it('a PROCEDÊNCIA dá para provar depois — o hash vai na descrição', async () => {
    // Sem o hash, "rev. 7" é um número que alguém digitou. Com ele, dá para
    // provar que este arquivo saiu deste desenho.
    await publicarNoGed('xlsx', casa(), OPCOES, ALVO);
    const [dados] = uploadNewDocument.mock.calls[0] as [Record<string, unknown>];
    expect(dados.descricao).toContain('a'.repeat(64));
    expect(dados.descricao).toContain('revisão 7');
  });

  it('o documento nasce na organização e na obra do estudo', async () => {
    // A policy de escrita de `opura_documents` é `organization_id IN (orgs de
    // que sou membro)`. Errar aqui não dá erro de tipo: dá recusa da RLS, na
    // produção, com o arquivo já no Storage.
    await publicarNoGed('ifc', casa(), OPCOES, ALVO);
    const [dados] = uploadNewDocument.mock.calls[0] as [Record<string, unknown>];
    expect(dados.organization_id).toBe('org-1');
    expect(dados.project_id).toBe('obra-9');
    expect(dados.categoria).toBe('engenharia');
    expect(dados.tags).toEqual(['planta-inteligente', 'ifc']);
  });

  it('o arquivo enviado tem o NOME da exportação, com a versão', async () => {
    // O nome do arquivo é o que sobrevive quando alguém baixa do GED e manda
    // por e-mail. Se ele perder a versão ali, perde para sempre.
    await publicarNoGed('ifc', casa(), OPCOES, ALVO);
    const arquivo = uploadNewDocument.mock.calls[0][1] as File;
    expect(arquivo.name).toMatch(/\.ifc$/);
    expect(arquivo.name).toContain('7');
    expect(arquivo.size).toBeGreaterThan(0);
  });

  it('quem clicou vai junto, para a auditoria — e sai da SESSÃO', async () => {
    // O e-mail não vem por parâmetro de propósito: recebê-lo de fora abriria a
    // porta para a tela mandar o de outra pessoa, e o campo existe justamente
    // para a auditoria. É a mesma disciplina do autor do comentário.
    await publicarNoGed('ifc', casa(), OPCOES, ALVO);
    expect(uploadNewDocument.mock.calls[0][2]).toBe('quem@clicou.com');
  });
});

describe('publicar não é divulgar', () => {
  it('⚠️ publicar no GED NÃO compartilha com o portal', async () => {
    // São duas decisões. Fundi-las faria toda revisão de estudo publicada
    // chegar ao cliente por omissão — inclusive a que ninguém queria mostrar.
    await publicarNoGed('pdf', casa(), OPCOES, ALVO);
    expect(sharePortalDocumentsBatch).not.toHaveBeenCalled();
  });

  it('compartilhar usa o caminho que já existe, e não um novo', async () => {
    await compartilharComCliente(['doc-1', 'doc-2'], 'cli-3');
    expect(sharePortalDocumentsBatch).toHaveBeenCalledWith(
      ['doc-1', 'doc-2'],
      { audience: 'cliente', clientId: 'cli-3' },
      'quem@clicou.com',
    );
  });

  it('lista vazia não chama nada — não existe compartilhar coisa nenhuma', async () => {
    await compartilharComCliente([], 'cli-3');
    expect(sharePortalDocumentsBatch).not.toHaveBeenCalled();
  });
});

describe('os artefatos por formato', () => {
  it('cada formato monta o que promete, e o nome carrega a extensão', () => {
    const model = casa();
    for (const [formato, extensao] of [
      ['ifc', 'ifc'],
      ['dxf', 'dxf'],
      ['xlsx', 'xlsx'],
    ] as const) {
      const artefatos = artefatosDoFormato(formato, model, OPCOES);
      expect(artefatos[0].tipo).toBe(formato);
      expect(artefatos[0].nome.endsWith(`.${extensao}`)).toBe(true);
      expect(artefatos[0].blob.size).toBeGreaterThan(0);
      // E a cobertura ao lado, sempre.
      expect(artefatos[1].tipo).toBe('cobertura');
      expect(artefatos[1].nome).toContain('cobertura');
    }
  });

  it('a cobertura é LEGÍVEL, e cita a versão de que saiu', async () => {
    const [, cobertura] = artefatosDoFormato('ifc', casa(), OPCOES);
    const texto = await cobertura.blob.text();
    expect(texto).toContain('COBERTURA DA EXPORTAÇÃO IFC');
    expect(texto).toContain('versão 7');
    expect(texto).toContain('a'.repeat(64));
  });
});

describe('as frases, sozinhas', () => {
  it('o nome distingue o arquivo da cobertura', () => {
    const base = { blob: new Blob(['x']), nome: 'x', tipo: 'ifc' };
    expect(nomeNoGed(ALVO, base)).toBe('Planta Térreo — rev. 7 — IFC');
    expect(nomeNoGed(ALVO, { ...base, tipo: 'cobertura' })).toBe(
      'Planta Térreo — rev. 7 — COBERTURA (cobertura)',
    );
  });

  it('a descrição diz de onde o arquivo veio', () => {
    expect(descricaoNoGed(ALVO)).toBe(
      `Gerado pela Planta Inteligente a partir da revisão 7 (hash ${'a'.repeat(64)}).`,
    );
  });
});
