/**
 * ÒPURA Pro — "Baixar meus dados" (15/11/2026, docs/planos/2026-11-14-opura-pro-publico.md).
 */
import { describe, it, expect } from 'vitest';
import { nomeDoArquivoMeusDados, montarArquivoMeusDados, VERSAO_DO_ARQUIVO } from '../utils/proMeusDados';

describe('nomeDoArquivoMeusDados', () => {
  it('usa a data local com dois dígitos', () => {
    expect(nomeDoArquivoMeusDados(new Date(2026, 0, 5, 9, 0))).toBe('opura-pro-meus-dados-2026-01-05.json');
  });
  it('à noite continua no mesmo dia (não converte para UTC)', () => {
    expect(nomeDoArquivoMeusDados(new Date(2026, 10, 15, 23, 50))).toBe('opura-pro-meus-dados-2026-11-15.json');
  });
});

describe('montarArquivoMeusDados', () => {
  const agora = new Date(Date.UTC(2026, 10, 15, 12, 0, 0));
  const dados = {
    conta: { id: 'u1', email: 'pessoa@exemplo.com' },
    ajustes: { pix_key: 'pessoa@exemplo.com', profissao: 'ELETRICISTA' },
    clientes: [{ id: 'c1', nome: 'Dona Maria' }, { id: 'c2', nome: 'Seu João' }],
    orcamentos: [{ id: 'o1', cliente_id: 'c1', valor: 350, fotos: ['data:image/jpeg;base64,AAA'] }],
    servicos: [{ id: 's1', orcamento_id: 'o1', assinatura_imagem: 'data:image/png;base64,BBB' }],
  };

  it('leva tudo, com fotos e assinatura, e os totais batem', () => {
    const arquivo = JSON.parse(montarArquivoMeusDados(dados, agora));
    expect(arquivo.aplicativo).toBe('ÒPURA Pro');
    expect(arquivo.versao_do_arquivo).toBe(VERSAO_DO_ARQUIVO);
    expect(arquivo.gerado_em).toBe('2026-11-15T12:00:00.000Z');
    expect(arquivo.conta).toEqual(dados.conta);
    expect(arquivo.totais).toEqual({ clientes: 2, orcamentos: 1, servicos: 1 });
    expect(arquivo.orcamentos[0].fotos[0]).toBe('data:image/jpeg;base64,AAA');
    expect(arquivo.servicos[0].assinatura_imagem).toBe('data:image/png;base64,BBB');
    expect(arquivo.ajustes.pix_key).toBe('pessoa@exemplo.com');
  });

  it('conta sem nada cadastrado ainda gera um arquivo válido', () => {
    const arquivo = JSON.parse(montarArquivoMeusDados(
      { conta: { id: 'u2', email: null }, ajustes: null, clientes: [], orcamentos: [], servicos: [] }, agora,
    ));
    expect(arquivo.totais).toEqual({ clientes: 0, orcamentos: 0, servicos: 0 });
    expect(arquivo.ajustes).toBeNull();
  });
});
