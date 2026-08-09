// @vitest-environment jsdom
/**
 * Painel de medições.
 *
 * Classe alvo, de novo: **ação apresentada que não funciona** — e aqui há uma
 * variante específica. Uma forma sem item ligado mede normalmente, aparece na
 * lista com um número bonito, e **não chega ao orçamento**. Se ela sumisse do
 * total em silêncio, o levantamento pareceria completo e faltaria material na
 * obra.
 *
 * A mesma classe reaparece com as camadas: esconder uma camada tira formas da
 * lista, e se o total encolhesse junto o levantamento pareceria menor do que é.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PainelMedicoes from '../../components/blueprint/PainelMedicoes';
import { codigoDeItemAvulso, type FormaMedida } from '../../utils/blueprintMedicoes';
import { point } from '../../utils/blueprintKernel';

/** Retângulo 4 × 3 m = 12,00 m². */
const AREA: FormaMedida = {
  id: 'a',
  tipo: 'POLIGONO',
  pontos: [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)],
  nome: 'Sala',
  itemCode: '87251',
  camada: 'Geral',
  cor: '#2563eb',
};

const LINHA: FormaMedida = {
  id: 'b',
  tipo: 'LINHA',
  pontos: [point(0, 0), point(5000, 0)],
  nome: 'Rodapé',
  itemCode: '88489',
  camada: 'Geral',
  cor: '#16a34a',
};

function montar(over: Partial<React.ComponentProps<typeof PainelMedicoes>> = {}) {
  const formas = over.formas ?? ([] as FormaMedida[]);
  const props = {
    formas,
    // `todas` acompanha `formas` por padrão: quem não está exercitando o filtro
    // não deveria ter de repetir a lista.
    todas: formas,
    selecionada: null,
    temFundo: true,
    ocupado: false,
    camadasOcultas: new Set<string>(),
    camadaAtiva: 'Geral',
    onAlternarCamada: vi.fn(),
    onCamadaAtiva: vi.fn(),
    onSelecionar: vi.fn(),
    onRenomear: vi.fn(),
    onEditarItem: vi.fn(),
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
    // LISTA de medições, e não no documento inteiro.
    montar({ formas: [AREA, LINHA] });
    const lista = screen.getByRole('list', { name: /medições traçadas/i });
    expect(within(lista).getByText('12,00 m²')).toBeInTheDocument();
    expect(within(lista).getByText('5,00 m')).toBeInTheDocument();
  });
});

describe('PainelMedicoes · a forma sem item não some em silêncio', () => {
  it('APARECE COMO PENDÊNCIA', () => {
    // Ela mede, aparece com número, e não chega ao orçamento. Sumir do total
    // sem dizer faria o levantamento parecer completo — e faltaria material.
    montar({ formas: [AREA, { ...LINHA, itemCode: null }] });
    expect(screen.getByText(/1 medição\(ões\) sem item/i)).toBeInTheDocument();
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

describe('PainelMedicoes · item avulso', () => {
  it('os campos de item avulso só aparecem SEM código de catálogo', () => {
    // Oferecer os dois caminhos ao mesmo tempo convidaria a preencher os dois, e
    // ninguém saberia qual vale.
    montar({ formas: [AREA] });
    expect(screen.queryByLabelText(/nome do item avulso/i)).not.toBeInTheDocument();

    screen.getByLabelText(/item de orçamento/i);
  });

  it('sem código, oferece nome e preço', async () => {
    const props = montar({ formas: [{ ...AREA, itemCode: null }] });

    // `fireEvent.change`, e não `type`: o campo é CONTROLADO pelo pai, e o pai
    // aqui é um `vi.fn()` que não devolve nada. Digitar tecla a tecla faria o
    // React repor o valor vazio a cada uma, e a asserção mediria o boneco de
    // teste em vez do componente.
    fireEvent.change(screen.getByLabelText(/nome do item avulso/i), {
      target: { value: 'Demolição' },
    });
    expect(props.onEditarItem).toHaveBeenCalledWith('a', { itemNome: 'Demolição' });

    fireEvent.change(screen.getByLabelText(/preço unitário/i), { target: { value: '45' } });
    expect(props.onEditarItem).toHaveBeenCalledWith('a', { itemPreco: 45 });
  });

  it('MOSTRA O CÓDIGO DERIVADO DO NOME', () => {
    // É o que explica por que reexportar não duplica a linha. O Medição gera
    // `MED-{4 dígitos aleatórios}`, que muda a cada exportação — e por isso
    // duplica. Sem mostrar o código, o usuário não tem como saber a diferença.
    const nome = 'Demolição de alvenaria';
    montar({ formas: [{ ...AREA, itemCode: null, itemNome: nome }] });
    // Dentro da LISTA: o mesmo código também encabeça a linha do total, e é na
    // forma que ele precisa aparecer — é ali que a pessoa está digitando o nome.
    const lista = screen.getByRole('list', { name: /medições traçadas/i });
    expect(within(lista).getByText(codigoDeItemAvulso(nome))).toBeInTheDocument();
  });

  it('a forma com item avulso CHEGA ao total, e não fica pendente', () => {
    const nome = 'Demolição de alvenaria';
    montar({ formas: [{ ...AREA, itemCode: null, itemNome: nome, itemPreco: 45 }] });

    expect(screen.queryByText(/sem item/i)).not.toBeInTheDocument();
    const totais = screen.getByRole('table');
    expect(within(totais).getByText(codigoDeItemAvulso(nome))).toBeInTheDocument();
  });
});

describe('PainelMedicoes · camadas', () => {
  const REVEST = { ...LINHA, camada: 'Revestimento' };

  it('lista as camadas em uso, com a contagem de cada uma', () => {
    montar({ formas: [AREA, REVEST] });
    expect(screen.getByRole('button', { name: /Geral/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revestimento/ })).toBeInTheDocument();
  });

  it('alternar a camada chega ao pai', async () => {
    const props = montar({ formas: [AREA, REVEST] });
    await userEvent.click(screen.getByRole('button', { name: /Revestimento/ }));
    expect(props.onAlternarCamada).toHaveBeenCalledWith('Revestimento');
  });

  it('ESCONDER NÃO É APAGAR: o total continua contando o que saiu da lista', () => {
    // É a razão de o painel receber duas listas. Se o total encolhesse junto com
    // a lista, desligar uma camada faria o levantamento parecer menor do que é —
    // e o número errado é o que vai para o orçamento.
    montar({
      formas: [AREA],
      todas: [AREA, REVEST],
      camadasOcultas: new Set(['Revestimento']),
    });

    const lista = screen.getByRole('list', { name: /medições traçadas/i });
    expect(within(lista).queryByText('5,00 m')).not.toBeInTheDocument();

    const totais = screen.getByRole('table');
    expect(within(totais).getByText(/88489/)).toBeInTheDocument();
  });

  it('e diz quantas ficaram de fora, em vez de deixá-las sumir', () => {
    montar({
      formas: [AREA],
      todas: [AREA, REVEST],
      camadasOcultas: new Set(['Revestimento']),
    });
    expect(screen.getByText(/1 medição\(ões\) fora da lista/i)).toBeInTheDocument();
  });

  it('A FORMA SEM PRANCHA É MARCADA, porque aparece em todas', () => {
    // Ela é visível em qualquer prancha — de propósito: escondê-la a deixaria
    // inalcançável, sem nenhum controle para religá-la. Mas sem a marca o
    // usuário concluiria que traçou a mesma medição uma vez por prancha.
    montar({ formas: [{ ...AREA, underlayId: null }], temFundo: true });
    expect(screen.getByText(/sem prancha/i)).toBeInTheDocument();
  });

  it('e a marca não aparece quando não há prancha nenhuma', () => {
    // Sem fundo, TODA forma é "sem prancha": a marca não distinguiria nada e
    // viraria ruído em cada linha.
    montar({ formas: [{ ...AREA, underlayId: null }], temFundo: false });
    expect(screen.queryByText(/sem prancha/i)).not.toBeInTheDocument();
  });

  it('a camada de uma forma pode ser trocada na própria linha', async () => {
    const props = montar({ formas: [AREA] });
    const campo = screen.getByLabelText(/camada da medição/i);

    fireEvent.change(campo, { target: { value: 'Piso' } });
    expect(props.onEditarItem).toHaveBeenCalledWith('a', { camada: 'Piso' });
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
    expect(props.onEditarItem).toHaveBeenCalledWith('a', { itemCode: '9' });
  });

  it('renomear chega ao pai', async () => {
    const props = montar({ formas: [{ ...AREA, nome: '' }] });
    const campo = screen.getByLabelText(/nome da medição/i);

    await userEvent.type(campo, 'X');
    expect(props.onRenomear).toHaveBeenCalledWith('a', 'X');
  });
});
