import { describe, expect, it } from 'vitest';
import { sortDocumentsForTable } from '../components/documents/DocumentsTable';
import type { OpuraDocument } from '../types/documents';

/**
 * sortDocumentsForTable — a ordem da DocumentsTable pela coluna do cabeçalho.
 * Até 03/10/2026 ninguém ordenava: a seta mudava e as linhas ficavam no lugar.
 */
const d = (id: string, extra: Partial<OpuraDocument> = {}): OpuraDocument =>
  ({ id, nome: id, status: 'ativo', categoria: 'engenharia', tipo_documento: '-', ...extra }) as OpuraDocument;

const ids = (docs: OpuraDocument[]) => docs.map(x => x.id);

describe('sortDocumentsForTable', () => {
  it('sem coluna, devolve a ordem recebida (e o mesmo array)', () => {
    const docs = [d('b'), d('a')];
    expect(sortDocumentsForTable(docs, null, 'asc')).toBe(docs);
  });

  it('nome: pt-BR, sem diferenciar maiúscula/acento, números em ordem natural', () => {
    const docs = [d('R10', { nome: 'Planta R10' }), d('R2', { nome: 'planta R2' }), d('A', { nome: 'Área técnica' })];
    expect(ids(sortDocumentsForTable(docs, 'nome', 'asc'))).toEqual(['A', 'R2', 'R10']);
    expect(ids(sortDocumentsForTable(docs, 'nome', 'desc'))).toEqual(['R10', 'R2', 'A']);
  });

  it('não altera o array de entrada', () => {
    const docs = [d('b'), d('a')];
    sortDocumentsForTable(docs, 'nome', 'asc');
    expect(ids(docs)).toEqual(['b', 'a']);
  });

  it('datas pelo instante; vazio vai para o fim nos DOIS sentidos', () => {
    const docs = [
      d('sem', { data_emissao: undefined }),
      d('jan', { data_emissao: '2026-01-10' }),
      d('dez', { data_emissao: '2025-12-31' }),
    ];
    expect(ids(sortDocumentsForTable(docs, 'data_emissao', 'asc'))).toEqual(['dez', 'jan', 'sem']);
    expect(ids(sortDocumentsForTable(docs, 'data_emissao', 'desc'))).toEqual(['jan', 'dez', 'sem']);
  });

  it('"-" conta como vazio', () => {
    const docs = [d('traco', { autor: '-' }), d('bia', { autor: 'Bia' }), d('ana', { autor: 'Ana' })];
    expect(ids(sortDocumentsForTable(docs, 'autor', 'desc'))).toEqual(['bia', 'ana', 'traco']);
  });

  it('extensão sai do arquivo da versão ativa, como a célula mostra', () => {
    const docs = [
      d('x', { active_version: { storage_path: 'a/planta.dwg' } as OpuraDocument['active_version'] }),
      d('y', { active_version: { storage_path: 'a/memorial.pdf' } as OpuraDocument['active_version'] }),
    ];
    expect(ids(sortDocumentsForTable(docs, 'extensao', 'asc'))).toEqual(['x', 'y']);
  });

  it('obra e status usam os resolvedores da tela (o texto exibido)', () => {
    const docs = [d('p1', { project_id: 'zzz' }), d('p2', { project_id: 'aaa' })];
    const nomes: Record<string, string> = { p1: 'Alfa', p2: 'Beta' };
    expect(ids(sortDocumentsForTable(docs, 'project_id', 'asc', { resolveProjectName: doc => nomes[doc.id] })))
      .toEqual(['p1', 'p2']);

    const status = (doc: OpuraDocument) => ({ label: doc.id === 'p1' ? 'Incluído no GED' : 'Aguardando revisão', className: '' });
    expect(ids(sortDocumentsForTable(docs, 'status', 'asc', { resolveStatus: status }))).toEqual(['p2', 'p1']);
  });

  it('status sem resolvedor: rótulo do GED (Ativo / Em Alerta / Vencido)', () => {
    const docs = [d('v', { status: 'vencido' }), d('a', { status: 'ativo' }), d('e', { status: 'alerta' })];
    expect(ids(sortDocumentsForTable(docs, 'status', 'asc'))).toEqual(['a', 'e', 'v']);
  });

  it('empate mantém a ordem de chegada (estável)', () => {
    const docs = [d('1', { autor: 'Ana' }), d('2', { autor: 'Ana' }), d('3', { autor: 'Ana' })];
    expect(ids(sortDocumentsForTable(docs, 'autor', 'desc'))).toEqual(['1', '2', '3']);
  });
});
