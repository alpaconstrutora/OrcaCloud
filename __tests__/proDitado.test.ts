/**
 * Ditado por voz do orçamento do ÒPURA Pro (14/11/2026, passo 5 da crítica de design).
 *
 * Antes: o nome do cliente só aceitava `[a-zA-Z]` ("João" virava "Jo"), e qualquer
 * "para" no meio da descrição virava nome de cliente ("pintura para garagem").
 */
import { describe, it, expect } from 'vitest';
import { interpretarDitado } from '../utils/proDitado';

const clientes = [
  { id: 'c1', nome: 'João Pereira' },
  { id: 'c2', nome: 'Ana Souza' },
];

describe('interpretarDitado', () => {
  it('valor em reais', () => {
    expect(interpretarDitado('limpeza de split 350 reais', clientes).valor).toBe('350');
    expect(interpretarDitado('troca de disjuntor R$ 120,50', clientes).valor).toBe('120.50');
  });

  it('cliente com acento, pelo "para o cliente"', () => {
    const r = interpretarDitado('instalação de tomada para o cliente João 200 reais', clientes);
    expect(r.clienteId).toBe('c1');
    expect(r.descricao).toBe('Instalação de tomada');
  });

  it('cliente novo com acento vira nome do novo cliente', () => {
    const r = interpretarDitado('pintura para a cliente Conceição 500 reais', clientes);
    expect(r.clienteId).toBe('');
    expect(r.novoClienteNome).toBe('Conceição');
  });

  it('"para" solto só vira cliente se casar com um cliente cadastrado', () => {
    const r = interpretarDitado('pintura de portão para garagem 300 reais', clientes);
    expect(r.clienteId).toBe('');
    expect(r.novoClienteNome).toBe('');
    expect(r.descricao).toBe('Pintura de portão para garagem');
  });

  it('"para Ana" casa com cliente cadastrado', () => {
    const r = interpretarDitado('limpeza de caixa d\'água para Ana 180 reais', clientes);
    expect(r.clienteId).toBe('c2');
    expect(r.descricao).toBe("Limpeza de caixa d'água");
  });
});
