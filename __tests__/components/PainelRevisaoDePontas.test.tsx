// @vitest-environment jsdom
/**
 * REVISÃO GUIADA — o painel (24/09/2026, P2.52).
 *
 * A regra tem teste próprio (`blueprintRevisaoDePontas.test.ts`). Aqui fica o
 * que só a interface promete:
 *
 *   1. a vista é levada até a ponta em foco, e só quando ela MUDA — focar a
 *      cada render brigaria com o zoom de quem está olhando;
 *   2. ⚠️ o índice FICA onde está quando a lista encolhe. É o que faz a revisão
 *      avançar sozinha: consertei a 8ª de 69, a lista vira 68 e eu continuo na
 *      8ª — que agora é a próxima. Se o índice acompanhasse a ponta, eu saltaria
 *      uma a cada conserto;
 *   3. ponta sem saída mostra o que fazer à mão, em vez de um painel vazio;
 *   4. "Não é problema" não aplica comando nenhum.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PainelRevisaoDePontas from '../../components/blueprint/PainelRevisaoDePontas';
import type { PontaEmRevisao } from '../../utils/blueprintRevisaoDePontas';

function ponta(over: Partial<PontaEmRevisao> = {}): PontaEmRevisao {
  return {
    wallId: over.wallId ?? 'w1',
    end: over.end ?? 'a',
    p: over.p ?? ({ x: 1000, y: 2000 } as PontaEmRevisao['p']),
    comprimentoMm: over.comprimentoMm ?? 3000,
    opcoes: over.opcoes ?? [],
  };
}

const comJuntar = (id: string) =>
  ponta({
    wallId: id,
    opcoes: [{ tipo: 'JUNTAR', rotulo: 'Juntar com a ponta a 25 mm', distanciaMm: 25, comandos: [] }],
  });

const onFocar = vi.fn();
const onAplicar = vi.fn();
const onIgnorar = vi.fn();
const onLimpar = vi.fn();

function montar(pontas: PontaEmRevisao[], ignoradas = 0) {
  return render(
    <PainelRevisaoDePontas
      pontas={pontas}
      ignoradas={ignoradas}
      onFocar={onFocar}
      onAplicar={onAplicar}
      onIgnorar={onIgnorar}
      onLimparIgnoradas={onLimpar}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('PainelRevisaoDePontas', () => {
  it('leva a vista até a ponta em foco, e só quando ela muda', async () => {
    const user = userEvent.setup();
    const { rerender } = montar([comJuntar('w1'), ponta({ wallId: 'w2', p: { x: 9, y: 9 } as PontaEmRevisao['p'] })]);
    expect(onFocar).toHaveBeenCalledTimes(1);
    expect(onFocar).toHaveBeenCalledWith({ x: 1000, y: 2000 });

    // Re-render com a MESMA ponta em foco: não foca de novo.
    rerender(
      <PainelRevisaoDePontas pontas={[comJuntar('w1'), ponta({ wallId: 'w2' })]} ignoradas={0} onFocar={onFocar} onAplicar={onAplicar} onIgnorar={onIgnorar} onLimparIgnoradas={onLimpar} />,
    );
    expect(onFocar).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText('Próxima ponta'));
    expect(onFocar).toHaveBeenCalledTimes(2);
  });

  it('⚠️ o índice FICA quando a lista encolhe — é o que avança para a próxima', async () => {
    const user = userEvent.setup();
    const tres = [comJuntar('w1'), comJuntar('w2'), comJuntar('w3')];
    const { rerender } = montar(tres);
    await user.click(screen.getByLabelText('Próxima ponta')); // 2 de 3
    expect(screen.getByTestId('revisao-posicao')).toHaveTextContent('Revisando 2 de 3');

    // A segunda foi consertada e saiu da lista: continuo na posição 2, que
    // agora é a que era a terceira.
    rerender(
      <PainelRevisaoDePontas pontas={[tres[0], tres[2]]} ignoradas={0} onFocar={onFocar} onAplicar={onAplicar} onIgnorar={onIgnorar} onLimparIgnoradas={onLimpar} />,
    );
    expect(screen.getByTestId('revisao-posicao')).toHaveTextContent('Revisando 2 de 2');
  });

  it('a opção aplica com o índice dela; "Não é problema" não aplica nada', async () => {
    const user = userEvent.setup();
    const p = comJuntar('w1');
    montar([p]);
    await user.click(screen.getByTestId('revisao-opcao-JUNTAR'));
    expect(onAplicar).toHaveBeenCalledWith(p, 0);

    await user.click(screen.getByTestId('revisao-ignorar'));
    expect(onIgnorar).toHaveBeenCalledWith(p);
    expect(onAplicar).toHaveBeenCalledTimes(1);
  });

  it('ponta sem saída diz o que fazer à mão, em vez de um painel vazio', () => {
    montar([ponta({ comprimentoMm: 9000 })]);
    expect(screen.queryByTestId('revisao-opcao-JUNTAR')).toBeNull();
    expect(screen.getByTestId('revisao-sem-opcao')).toHaveTextContent('Desenhe o trecho que falta');
    // O contexto continua: comprimento e coordenada da ponta.
    expect(screen.getByTestId('revisao-contexto')).toHaveTextContent('9000 mm');
  });

  it('lista vazia com marcadas oferece trazê-las de volta', async () => {
    const user = userEvent.setup();
    montar([], 4);
    expect(screen.getByTestId('revisao-vazia')).toHaveTextContent('4 marcada(s) como intencional(is)');
    await user.click(screen.getByTestId('limpar-ignoradas'));
    expect(onLimpar).toHaveBeenCalled();
  });
});
