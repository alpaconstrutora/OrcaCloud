// @vitest-environment jsdom
/**
 * Lista das preferências da planta elétrica — ids dos motivos.
 * A lista monta em dois lugares ao mesmo tempo (gaveta de Preferências e painel de exportação da
 * planta): `aria-describedby` de uma não pode apontar para o motivo da outra.
 */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ListaDePreferenciasEletricas from '../../components/preferencias/ListaDePreferenciasEletricas';
import { EXIBICAO_ELETRICA_PADRAO } from '../../utils/preferencias/resolver';

afterEach(cleanup);

const lista = (
  <ListaDePreferenciasEletricas
    colunas={['tela', 'prancha']}
    tela={EXIBICAO_ELETRICA_PADRAO}
    prancha={EXIBICAO_ELETRICA_PADRAO}
    travaDaPrancha="Só quem administra a organização muda o padrão da prancha."
    aoAlterar={() => undefined}
    aoVoltarAoPadrao={() => undefined}
  />
);

describe('ListaDePreferenciasEletricas · ids', () => {
  it('duas listas na mesma tela não repetem id, e cada chave aponta para o motivo da PRÓPRIA lista', () => {
    const { container } = render(
      <>
        <div data-testid="a">{lista}</div>
        <div data-testid="b">{lista}</div>
      </>,
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    for (const lado of ['a', 'b']) {
      const raiz = container.querySelector(`[data-testid="${lado}"]`) as HTMLElement;
      const apontados = Array.from(raiz.querySelectorAll('[aria-describedby]')).map((e) => e.getAttribute('aria-describedby') as string);
      expect(apontados.length).toBeGreaterThan(0);
      for (const id of apontados) expect(raiz.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
  });
});
