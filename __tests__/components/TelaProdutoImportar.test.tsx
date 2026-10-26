// @vitest-environment jsdom
/**
 * Produto da massa › "Importar do Empreendimento" (25/10/2026): o botão desligado diz o motivo; com tipologias,
 * pede confirmação antes de substituir; importado, o produto vem das unidades e os avisos aparecem.
 * Plano: docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const confirmar = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));

import TelaProduto from '../../components/blueprint/TelaProduto';
import { produtoSemente, produtoVazio, type Produto } from '../../utils/blueprintProduto';
import type { TorreParaOProduto } from '../../utils/blueprintProdutoDoEmpreendimento';

const TORRES: TorreParaOProduto[] = [
  {
    name: 'Torre A',
    units: [
      { name: '101', typology: '2 dorm.', private_area: 60, bedrooms: 2, parking_spaces: 1 },
      { name: '102', typology: '3 dorm.', private_area: 80, bedrooms: 3, parking_spaces: 2 },
      { name: 'M-1', typology: '2 dorm.', private_area: 60, blueprint_massa_chave: 'b:1:1' },
    ],
  },
];

function tela(produto: Produto, empreendimento: React.ComponentProps<typeof TelaProduto>['empreendimento']) {
  const onProduto = vi.fn();
  render(<TelaProduto produto={produto} onProduto={onProduto} persistenciaIndisponivel={false} erroDeGravacao={null} empreendimento={empreendimento} />);
  return { onProduto, botao: () => screen.getByTestId('importar-do-empreendimento') as HTMLButtonElement };
}

afterEach(() => {
  cleanup();
  confirmar.mockClear();
});

describe('TelaProduto › Importar do Empreendimento', () => {
  it('sem empreendimento ligado: desligado, dizendo como vincular', () => {
    const { botao } = tela(produtoVazio(), null);
    expect(botao().disabled).toBe(true);
    expect(botao().title).toMatch(/não está ligada a um Empreendimento/);
  });

  it('carregando as torres: desligado, dizendo que carrega', () => {
    const { botao } = tela(produtoVazio(), { nome: 'Garden', torres: null });
    expect(botao().disabled).toBe(true);
    expect(botao().title).toMatch(/Carregando/);
  });

  it('empreendimento sem unidades: desligado com o motivo do importador', () => {
    const { botao } = tela(produtoVazio(), { nome: 'Garden', torres: [] });
    expect(botao().disabled).toBe(true);
    expect(botao().title).toMatch(/Torres & Unidades/);
  });

  it('produto vazio: importa direto, sem perguntar, e mostra os avisos', async () => {
    const { botao, onProduto } = tela(produtoVazio(), { nome: 'Garden', torres: TORRES });
    expect(botao().textContent).toMatch(/Importar do Empreendimento "Garden"/);
    fireEvent.click(botao());
    await waitFor(() => expect(onProduto).toHaveBeenCalledTimes(1));
    expect(confirmar).not.toHaveBeenCalled();
    const p = onProduto.mock.calls[0][0] as Produto;
    expect(p.tipologias.map((t) => [t.nome, t.proporcaoPct])).toEqual([
      ['2 dorm.', 50],
      ['3 dorm.', 50],
    ]);
    expect(p.metaUnidades).toBe(2);
    expect(screen.getByTestId('avisos-da-importacao').textContent).toMatch(/Estudo de massa/);
  });

  it('produto com tipologias: confirma antes; recusar não muda nada', async () => {
    confirmar.mockResolvedValueOnce(false);
    const { botao, onProduto } = tela(produtoSemente('RESIDENCIAL_MEDIO'), { nome: 'Garden', torres: TORRES });
    fireEvent.click(botao());
    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
    expect(confirmar.mock.calls[0][0]).toMatchObject({ title: 'Substituir as tipologias?', variant: 'warning' });
    expect(onProduto).not.toHaveBeenCalled();
  });
});
