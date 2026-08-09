// @vitest-environment jsdom
/**
 * Painel de medições.
 *
 * Classe alvo, de novo: **ação apresentada que não funciona** — e aqui há uma
 * variante específica. Uma forma sem item ligado mede normalmente, aparece na
 * lista com um número bonito, e **não chega ao orçamento**. Se ela sumisse do
 * total em silêncio, o levantamento pareceria completo e faltaria material na
 * obra.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PainelMedicoes from '../../components/blueprint/PainelMedicoes';
import type { FormaMedida } from '../../utils/blueprintMedicoes';
import { point } from '../../utils/blueprintKernel';

/** Retângulo 4 × 3 m = 12,00 m². */
const AREA: FormaMedida = {
  id: 'a',
  tipo: 'POLIGONO',
  pontos: [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)],
  nome: 'Sala',
  itemCode: '87251',
  cor: '#2563eb',
};

const LINHA: FormaMedida = {
  id: 'b',
  tipo: 'LINHA',
  pontos: [point(0, 0), point(5000, 0)],
  nome: 'Rodapé',
  itemCode: '88489',
  cor: '#16a34a',
};

function montar(over: Partial<React.ComponentProps<typeof PainelMedicoes>> = {}) {
  const props = {
    formas: [] as FormaMedida[],
    selecionada: null,
    temFundo: true,
    ocupado: false,
    onSelecionar: vi.fn(),
    onRenomear: vi.fn(),
    onLigarItem: vi.fn(),
    onRemover: vi.fn(),
    onEnviarOrcamento: vi.fn(),
    aviso: null,
    erro: null,
    ...over,
  };
  render(<PainelMedicoes {...props} />);
  return props;
}

describe('PainelMedicoes · o que a tela diz', () => {
  it('sem planta de fundo, avisa que medir é traçar no vazio', () => {
    // Medir sobre nada produz número sem significado. Deixar traçar sem avisar
    // seria oferecer uma ação que só pode dar errado.
    montar({ temFundo: false });
    expect(screen.getByText(/traçar no vazio/i)).toBeInTheDocument();
  });

  it('sem medições, ensina como criar a primeira', () => {
    montar();
    expect(screen.getByText(/feche no primeiro ponto/i)).toBeInTheDocument();
  });

  it('MEDIDO ≠ DERIVADO, e o cabeçalho diz isso', () => {
    // É a distinção que justifica ter empilhado as duas camadas em vez de
    // fundi-las. Quem traça precisa saber que está AFIRMANDO um número.
    montar({ formas: [AREA] });
    expect(screen.getByText(/afirmado/i)).toBeInTheDocument();
  });

  it('mostra o valor de cada forma na unidade do tipo', () => {
    // O mesmo número aparece na lista e no total por item — daí buscar dentro da
    // LISTA, e não no documento inteiro.
    montar({ formas: [AREA, LINHA] });
    const lista = screen.getByRole('list');
    expect(within(lista).getByText('12,00 m²')).toBeInTheDocument();
    expect(within(lista).getByText('5,00 m')).toBeInTheDocument();
  });
});

describe('PainelMedicoes · a forma sem item não some em silêncio', () => {
  it('APARECE COMO PENDÊNCIA', () => {
    // Ela mede, aparece com número, e não chega ao orçamento. Sumir do total
    // sem dizer faria o levantamento parecer completo — e faltaria material.
    montar({ formas: [AREA, { ...LINHA, itemCode: null }] });
    expect(screen.getByText(/1 medição\(ões\) sem item ligado/i)).toBeInTheDocument();
  });

  it('e não entra no total por item', () => {
    montar({ formas: [AREA, { ...LINHA, itemCode: null }] });
    // Só o item da área aparece na tabela de totais.
    expect(screen.getByText(/87251/)).toBeInTheDocument();
    expect(screen.queryByText(/88489/)).not.toBeInTheDocument();
  });

  it('sem nenhum item ligado, não oferece enviar ao orçamento', () => {
    montar({ formas: [{ ...AREA, itemCode: null }] });
    expect(
      screen.queryByRole('button', { name: /enviar medições/i }),
    ).not.toBeInTheDocument();
  });
});

describe('PainelMedicoes · totais e envio', () => {
  it('SEPARA POR UNIDADE mesmo no mesmo item', () => {
    // m² somado com metro não significa nada. Duas linhas visíveis são melhores
    // que um número errado.
    montar({ formas: [AREA, { ...LINHA, itemCode: '87251' }] });
    const totais = screen.getByRole('table');
    // Duas linhas para o MESMO código, uma por unidade.
    expect(within(totais).getAllByText(/87251/)).toHaveLength(2);
    expect(within(totais).getByText('12,00 m²')).toBeInTheDocument();
    expect(within(totais).getByText('5,00 m')).toBeInTheDocument();
  });

  it('avisa que as linhas vão marcadas como MEDIDO', async () => {
    const props = montar({ formas: [AREA] });
    expect(screen.getByText(/marcadas como/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /enviar medições/i }));
    expect(props.onEnviarOrcamento).toHaveBeenCalled();
  });

  it('ligar o código chega ao pai', async () => {
    const props = montar({ formas: [{ ...AREA, itemCode: null }] });
    const campo = screen.getByLabelText(/item de orçamento/i);

    await userEvent.type(campo, '9');
    expect(props.onLigarItem).toHaveBeenCalledWith('a', '9');
  });

  it('renomear chega ao pai', async () => {
    const props = montar({ formas: [{ ...AREA, nome: '' }] });
    const campo = screen.getByLabelText(/nome da medição/i);

    await userEvent.type(campo, 'X');
    expect(props.onRenomear).toHaveBeenCalledWith('a', 'X');
  });
});
