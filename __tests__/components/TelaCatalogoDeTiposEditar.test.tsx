// @vitest-environment jsdom
/**
 * F15 (10/10/2026): a tela do catálogo edita as propriedades numéricas de um tipo
 * num painel lateral — capacidade, potência, medidas — e grava pelo callback; o
 * valor inválido é recusado com o motivo, e o tipo sem número a editar nem mostra
 * o botão.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TelaCatalogoDeTipos from '../../components/blueprint/TelaCatalogoDeTipos';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { TipoDoCatalogo } from '../../utils/blueprintCatalogoDeTipos';

const split = {
  id: 't1',
  organizationId: 'o1',
  familia: 'TERMINAL',
  nome: 'Split 12.000',
  propriedades: { familia: 'TERMINAL', disciplina: 'FRIGORIGENA', tipo: 'Split 12', tipoHidraulico: 'EVAPORADORA_HI_WALL', capacidadeBtuH: 12000, potenciaW: 1100, larguraMm: 900, profundidadeMm: 220, alturaMm: 300, cotaMm: 2200 },
  active: true,
  createdAt: '',
  updatedAt: '',
} as unknown as TipoDoCatalogo;
const semNumero = { ...split, id: 't2', nome: 'Sem número', propriedades: { familia: 'TERMINAL', disciplina: 'FRIGORIGENA', tipo: 'X' } } as unknown as TipoDoCatalogo;

function montar(onEditarPropriedades = vi.fn(async () => {})) {
  render(
    <ConfirmProvider>
      <TelaCatalogoDeTipos
        tipos={[split, semNumero]}
        carregando={false}
        indisponivel={null}
        usos={new Map()}
        nomeDaOrg={() => 'Org'}
        mostrarOrg={false}
        onRenomear={async () => {}}
        onEditarPropriedades={onEditarPropriedades}
        onAtivar={async () => {}}
        onExcluir={async () => {}}
        onSemear={async () => {}}
        onCopiar={async () => {}}
      />
    </ConfirmProvider>,
  );
  return onEditarPropriedades;
}

describe('F15 · editar as propriedades do tipo no catálogo', () => {
  it('abre o painel com os números do tipo, grava o editado e fecha', async () => {
    const user = userEvent.setup();
    const gravar = montar();
    await user.click(screen.getByTitle('Editar propriedades de Split 12.000'));
    const painel = await screen.findByTestId('propriedades-do-tipo');
    const capacidade = within(painel).getByLabelText('Capacidade (BTU/h)');
    expect(capacidade).toHaveValue('12000');
    await user.clear(capacidade);
    await user.type(capacidade, '18000');
    await user.click(screen.getByTestId('salvar-propriedades-do-tipo'));
    expect(gravar).toHaveBeenCalledWith('t1', expect.objectContaining({ capacidadeBtuH: 18000, potenciaW: 1100, tipo: 'Split 12' }));
    expect(screen.queryByTestId('propriedades-do-tipo')).toBeNull();
    expect(screen.getByTestId('aviso-do-catalogo')).toHaveTextContent('Propriedades do tipo "Split 12.000" gravadas.');
  });

  it('o valor inválido é recusado com o motivo, sem gravar', async () => {
    const user = userEvent.setup();
    const gravar = montar();
    await user.click(screen.getByTitle('Editar propriedades de Split 12.000'));
    const painel = await screen.findByTestId('propriedades-do-tipo');
    await user.clear(within(painel).getByLabelText('Potência (W)'));
    await user.click(screen.getByTestId('salvar-propriedades-do-tipo'));
    expect(screen.getByTestId('erro-das-propriedades')).toHaveTextContent('Potência (W): informe um número.');
    expect(gravar).not.toHaveBeenCalled();
  });

  it('o tipo sem propriedade numérica não mostra o botão', () => {
    montar();
    expect(screen.queryByTitle('Editar propriedades de Sem número')).toBeNull();
  });
});
