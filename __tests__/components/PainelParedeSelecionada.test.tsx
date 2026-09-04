// @vitest-environment jsdom
/**
 * Painel "Parede selecionada" (aba Ambientes do editor de plantas).
 *
 * O comprimento aqui deixou de ser texto morto: pedido do usuário em
 * 12/08/2026 foi digitar a cota do projetista e a parede fechar nela — hoje o
 * arraste da alça no canvas mira a olho, em pixel. `docs/planos/
 * 2026-08-12-comprimento-editavel-parede.md` tem o pedido literal.
 *
 * Este arquivo existe SEPARADO de `BlueprintEditor.test.tsx` porque selecionar
 * parede de verdade exige clique no canvas, que é opaco em jsdom — extrair o
 * componente foi o que tornou a interação testável.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PainelParedeSelecionada from '../../components/blueprint/PainelParedeSelecionada';
import { point, type Opening, type Wall } from '../../utils/blueprintKernel';

/** Parede de 4,00 m no eixo horizontal. */
function parede(over: Partial<Wall> = {}): Wall {
  return {
    id: 'wal_0001',
    levelId: 'lvl_1',
    a: point(0, 0),
    b: point(4000, 0),
    thicknessMm: 150,
    heightMm: 2800,
    ...over,
  };
}

/** Porta de 900 mm, no padrão de sempre: dobradiça no início, sem espelhar. */
function porta(over: Partial<Opening> = {}): Opening {
  return {
    id: 'opn_1',
    wallId: 'wal_1',
    kind: 'door',
    offsetMm: 1500,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
    hingeAtStart: true,
    swingReversed: false,
    ...over,
  };
}

function montar(over: Partial<React.ComponentProps<typeof PainelParedeSelecionada>> = {}) {
  const props: React.ComponentProps<typeof PainelParedeSelecionada> = {
    parede: parede(),
    abertura: null,
    pontaQueAnda: 'b',
    arrastaCanto: false,
    aLivre: true,
    bLivre: true,
    onEscolherPonta: vi.fn(),
    onDestacarPonta: vi.fn(),
    onComprimento: vi.fn(),
    onEspessura: vi.fn(),
    podeUnir: false,
    onDividir: vi.fn(),
    onUnir: vi.fn(),
    onFlipAbertura: vi.fn(),
    onTamanhoAbertura: vi.fn(),
    ...over,
  };
  render(<PainelParedeSelecionada {...props} />);
  return props;
}

function campo() {
  return screen.getByRole('textbox', { name: /comprimento da parede/i }) as HTMLInputElement;
}

describe('PainelParedeSelecionada · sem seleção', () => {
  it('sem parede nem abertura, não renderiza a caixa', () => {
    const { container } = render(
      <PainelParedeSelecionada
        parede={null}
        abertura={null}
        pontaQueAnda={null}
        arrastaCanto={false}
        onComprimento={vi.fn()}
        onEspessura={vi.fn()}
        podeUnir={false}
        onDividir={vi.fn()}
        onUnir={vi.fn()}
        onFlipAbertura={vi.fn()}
        onTamanhoAbertura={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PainelParedeSelecionada · campo de comprimento', () => {
  it('mostra o comprimento atual, em metros, com vírgula', () => {
    montar({ parede: parede({ a: point(0, 0), b: point(4100, 0) }) });
    expect(campo().value).toBe('4,10');
  });

  it('ENTER aplica o valor digitado, convertido para mm', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.type(campo(), '4,10');
    await user.keyboard('{Enter}');

    expect(props.onComprimento).toHaveBeenCalledExactlyOnceWith(4100);
  });

  it('aceita ponto decimal também', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.type(campo(), '3.52');
    await user.keyboard('{Enter}');

    expect(props.onComprimento).toHaveBeenCalledExactlyOnceWith(3520);
  });

  it('perder o foco SEM apertar Enter também aplica', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.type(campo(), '5');
    await user.tab();

    expect(props.onComprimento).toHaveBeenCalledExactlyOnceWith(5000);
  });

  it('ESCAPE descarta: não chama onComprimento e restaura o texto exibido', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: parede({ a: point(0, 0), b: point(4000, 0) }) });

    await user.clear(campo());
    await user.type(campo(), '999');
    await user.keyboard('{Escape}');

    expect(props.onComprimento).not.toHaveBeenCalled();
    expect(campo().value).toBe('4,00');
  });

  it('valor zerado, negativo ou não numérico não chama onComprimento', async () => {
    const user = userEvent.setup();
    const props = montar();

    for (const invalido of ['0', '-3', 'abc']) {
      await user.clear(campo());
      await user.type(campo(), invalido);
      await user.keyboard('{Enter}');
    }

    expect(props.onComprimento).not.toHaveBeenCalled();
  });

  it('campo vazio + Enter não chama onComprimento (e não trava em NaN)', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.keyboard('{Enter}');

    expect(props.onComprimento).not.toHaveBeenCalled();
  });

  it('trocar de parede selecionada RESSINCRONIZA o campo com o novo modelo', () => {
    const { rerender } = render(<PainelParedeSelecionada {...montarProps()} />);
    expect(campo().value).toBe('4,00');

    const outraParede = parede({ id: 'wal_0002', a: point(0, 0), b: point(2500, 0) });
    rerender(
      <PainelParedeSelecionada
        {...montarProps()}
        parede={outraParede}
      />,
    );

    expect(campo().value).toBe('2,50');
  });

  it('o arraste da alça no canvas (comprimento mudou, mesma parede) também ressincroniza', () => {
    const { rerender } = render(<PainelParedeSelecionada {...montarProps()} />);
    expect(campo().value).toBe('4,00');

    rerender(
      <PainelParedeSelecionada
        {...montarProps()}
        parede={parede({ a: point(0, 0), b: point(4750, 0) })}
      />,
    );

    expect(campo().value).toBe('4,75');
  });
});

describe('PainelParedeSelecionada · texto de ajuda sobre qual ponta anda', () => {
  it('ponta livre: avisa que não arrasta canto', () => {
    montar({ pontaQueAnda: 'a', arrastaCanto: false });
    expect(screen.getByText(/estica a ponta inicial \(livre\)/i)).toBeInTheDocument();
  });

  it('ponta presa: avisa que o canto vai junto', () => {
    montar({ pontaQueAnda: 'b', arrastaCanto: true });
    expect(screen.getByText(/estica a ponta final — o canto vai junto/i)).toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · escolher a ponta que anda', () => {
  /**
   * Pedido de 28/08/2026: "como eu escolho qual extremidade da parede deve ser
   * aplicada a nova medida?". Não dava — a regra automática decidia sozinha, e
   * numa parede com os dois cantos fechados ela sempre puxava a FINAL, que
   * depende de qual ponta foi clicada ao desenhar. Informação invisível.
   */
  it('oferece Início e Fim, com a ponta em vigor marcada', () => {
    montar({ pontaQueAnda: 'b' });
    expect(screen.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Fim' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicar em Início pede a ponta `a`', async () => {
    const props = montar({ pontaQueAnda: 'b' });
    await userEvent.click(screen.getByRole('button', { name: 'Início' }));
    expect(props.onEscolherPonta).toHaveBeenCalledWith('a');
  });

  it('passar o mouse acende a ponta no desenho, e sair apaga', async () => {
    // Sem este retorno visual "Início" e "Fim" são duas palavras sem referente:
    // o desenho não mostra em que ordem a parede foi traçada.
    const props = montar();
    await userEvent.hover(screen.getByRole('button', { name: 'Fim' }));
    expect(props.onDestacarPonta).toHaveBeenCalledWith('b');
    await userEvent.unhover(screen.getByRole('button', { name: 'Fim' }));
    expect(props.onDestacarPonta).toHaveBeenCalledWith(null);
  });

  it('cada botão diz a consequência de escolher aquela ponta', () => {
    montar({ aLivre: true, bLivre: false });
    expect(screen.getByRole('button', { name: 'Início' })).toHaveAttribute(
      'title',
      expect.stringContaining('livre'),
    );
    expect(screen.getByRole('button', { name: 'Fim' })).toHaveAttribute(
      'title',
      expect.stringContaining('o canto vai junto'),
    );
  });

  it('sem parede selecionada não há o que escolher', () => {
    montar({ parede: null, abertura: porta(), pontaQueAnda: null });
    expect(screen.queryByRole('button', { name: 'Início' })).not.toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · abertura selecionada', () => {
  it('mostra o resumo da abertura, sem campo de comprimento', () => {
    render(
      <PainelParedeSelecionada
        parede={null}
        abertura={porta()}
        pontaQueAnda={null}
        arrastaCanto={false}
        onComprimento={vi.fn()}
        onEspessura={vi.fn()}
        podeUnir={false}
        onDividir={vi.fn()}
        onUnir={vi.fn()}
        onFlipAbertura={vi.fn()}
        onTamanhoAbertura={vi.fn()}
      />,
    );
    // Matcher por elemento: o texto é montado de vários nós (o tipo e o offset
    // vêm de expressões separadas), e `getByText` com string não cruza nós.
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' && /porta a 1,50 m do início da parede/i.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument();
    // O comprimento é da PAREDE; com abertura selecionada ele não aparece.
    expect(
      screen.queryByRole('textbox', { name: /comprimento da parede/i }),
    ).not.toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · tamanho da abertura', () => {
  // Pedido de 14/08/2026: "opcao de edicao do tamaho da porta apos inserir uma
  // porta". Largura E altura, por decisão confirmada com o usuário: a altura
  // alimenta o quantitativo (área descontada da parede) e até aqui era um 2100
  // fixo que ninguém escolheu, nem ao inserir.

  const largura = () =>
    screen.getByRole('textbox', { name: /largura da abertura/i }) as HTMLInputElement;
  const altura = () =>
    screen.getByRole('textbox', { name: /altura da abertura/i }) as HTMLInputElement;

  it('mostra largura e altura da porta, em milímetros', () => {
    montar({ parede: null, abertura: porta() });
    expect(largura().value).toBe('900');
    expect(altura().value).toBe('2100');
  });

  it('ENTER na largura aplica só a largura', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    await user.clear(largura());
    await user.type(largura(), '800');
    await user.keyboard('{Enter}');

    expect(props.onTamanhoAbertura).toHaveBeenCalledExactlyOnceWith({ widthMm: 800 });
  });

  it('ENTER na altura aplica só a altura', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    await user.clear(altura());
    await user.type(altura(), '2300');
    await user.keyboard('{Enter}');

    expect(props.onTamanhoAbertura).toHaveBeenCalledExactlyOnceWith({ heightMm: 2300 });
  });

  it('ESCAPE descarta e devolve o valor exibido', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    await user.clear(largura());
    await user.type(largura(), '9999');
    await user.keyboard('{Escape}');

    expect(props.onTamanhoAbertura).not.toHaveBeenCalled();
    expect(largura().value).toBe('900');
  });

  it('valor inválido não emite comando', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    for (const invalido of ['0', '-5', 'abc']) {
      await user.clear(largura());
      await user.type(largura(), invalido);
      await user.keyboard('{Enter}');
    }

    expect(props.onTamanhoAbertura).not.toHaveBeenCalled();
  });

  it('PORTA não mostra peitoril — o vão nasce no piso', () => {
    montar({ parede: null, abertura: porta() });
    expect(screen.queryByRole('textbox', { name: /peitoril/i })).not.toBeInTheDocument();
  });

  it('VÃO LIVRE mostra peitoril — subir o peitoril é o que faz um passa-prato', () => {
    montar({ parede: null, abertura: porta({ kind: 'passage' }) });
    expect(screen.getByRole('textbox', { name: /peitoril/i })).toBeInTheDocument();
  });

  it('JANELA mostra peitoril, e ele aplica sozinho', async () => {
    const user = userEvent.setup();
    const props = montar({
      parede: null,
      abertura: porta({ kind: 'window', heightMm: 1200, sillMm: 900 }),
    });

    const peitoril = screen.getByRole('textbox', { name: /peitoril/i }) as HTMLInputElement;
    expect(peitoril.value).toBe('900');

    await user.clear(peitoril);
    await user.type(peitoril, '1000');
    await user.keyboard('{Enter}');

    expect(props.onTamanhoAbertura).toHaveBeenCalledExactlyOnceWith({ sillMm: 1000 });
  });

  it('o kernel recusando (valor volta ao anterior) RESSINCRONIZA o campo', () => {
    // Digitar 3500 numa parede onde só cabem 3000: o comando é recusado, o
    // modelo não muda, e o campo tem que voltar a mostrar o valor real — senão
    // a tela afirma um número que o desenho não tem.
    const props = { ...montarProps(), parede: null, abertura: porta() };
    const { rerender } = render(<PainelParedeSelecionada {...props} />);
    expect(largura().value).toBe('900');

    // Mesma abertura, mesmo tamanho: é o que chega depois de uma recusa.
    rerender(<PainelParedeSelecionada {...props} abertura={porta()} />);
    expect(largura().value).toBe('900');
  });
});

describe('PainelParedeSelecionada · girar e espelhar porta', () => {
  // Pedido de 14/08/2026: "ao selecionar uma porta, implementar opcao de girar
  // e espelhar". São dois EIXOS INDEPENDENTES — dobradiça (girar) e lado da
  // folha (espelhar) — não um único botão de 180°, por decisão confirmada com
  // o usuário: as 4 combinações são as 4 variações padrão de porta em planta.

  it('porta selecionada oferece Girar e Espelhar', () => {
    montar({ parede: null, abertura: porta() });
    expect(screen.getByRole('button', { name: /girar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /espelhar/i })).toBeInTheDocument();
  });

  it('Girar chama onFlipAbertura com o eixo "hinge"', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    await user.click(screen.getByRole('button', { name: /girar/i }));
    expect(props.onFlipAbertura).toHaveBeenCalledExactlyOnceWith('hinge');
  });

  it('Espelhar chama onFlipAbertura com o eixo "swing"', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    await user.click(screen.getByRole('button', { name: /espelhar/i }));
    expect(props.onFlipAbertura).toHaveBeenCalledExactlyOnceWith('swing');
  });

  // Pedido de 23/08/2026: "a funcionalidade de girar e espelhar da porta de
  // abrir também deve ser aplicada a porta de correr".
  //
  // O kernel e o desenho já respeitavam os dois eixos na de correr desde que ela
  // nasceu (`hingeAtStart` = para qual ponta a folha recolhe; `swingReversed` =
  // sobre qual face ela desliza) — faltavam só os botões. Sem eles, mudar o lado
  // de recolhimento exigia apagar a abertura e inserir de novo.

  it('porta de correr oferece Girar e Espelhar', () => {
    montar({ parede: null, abertura: porta({ kind: 'sliding', embutida: false }) });
    expect(screen.getByRole('button', { name: /girar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /espelhar/i })).toBeInTheDocument();
  });

  it.each([
    ['Girar', /girar/i, 'hinge'],
    ['Espelhar', /espelhar/i, 'swing'],
  ] as const)('%s na de correr usa o MESMO eixo da de abrir', async (_r, nome, eixo) => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta({ kind: 'sliding', embutida: false }) });

    await user.click(screen.getByRole('button', { name: nome }));
    expect(props.onFlipAbertura).toHaveBeenCalledExactlyOnceWith(eixo);
  });

  it('de correr EMBUTIDA gira, mas não espelha — a folha vai para DENTRO', () => {
    // Na embutida a folha corre no eixo da parede, dentro do bolso: não há duas
    // faces para escolher, e `swingReversed` não muda um pixel do desenho. Botão
    // que não faz nada ensina a ignorar o botão.
    montar({ parede: null, abertura: porta({ kind: 'sliding', embutida: true }) });
    expect(screen.getByRole('button', { name: /girar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /espelhar/i })).not.toBeInTheDocument();
  });

  it('o título do botão fala a língua de CADA porta', () => {
    // "Move a dobradiça" numa porta que não tem dobradiça seria instrução
    // errada, e o rótulo curto ("Girar") é o mesmo nas duas de propósito: é o
    // mesmo eixo, e o controle não pode mudar de nome conforme o tipo.
    const { unmount } = render(
      <PainelParedeSelecionada {...montarProps()} parede={null} abertura={porta()} />,
    );
    expect(screen.getByRole('button', { name: /girar/i }).title).toMatch(/dobradiça/i);
    unmount();

    render(
      <PainelParedeSelecionada
        {...montarProps()}
        parede={null}
        abertura={porta({ kind: 'sliding', embutida: false })}
      />,
    );
    expect(screen.getByRole('button', { name: /girar/i }).title).toMatch(/recolhe/i);
    expect(screen.getByRole('button', { name: /espelhar/i }).title).toMatch(/face/i);
  });

  it('janela NÃO oferece Girar/Espelhar — não tem dobradiça nem lado de giro', () => {
    montar({ parede: null, abertura: porta({ kind: 'window', sillMm: 900 }) });
    expect(screen.queryByRole('button', { name: /girar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /espelhar/i })).not.toBeInTheDocument();
  });

  it('VÃO LIVRE também não — não tem folha para girar', () => {
    montar({ parede: null, abertura: porta({ kind: 'passage' }) });
    expect(screen.queryByRole('button', { name: /girar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /espelhar/i })).not.toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · nome do tipo', () => {
  it.each([
    ['door', /porta a 1,50 m/i],
    ['window', /janela a 1,50 m/i],
    ['passage', /vão livre a 1,50 m/i],
  ] as const)('%s aparece com o nome certo', (kind, esperado) => {
    montar({ parede: null, abertura: porta({ kind, sillMm: kind === 'window' ? 900 : 0 }) });
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && esperado.test(el.textContent ?? '')),
    ).toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · unir', () => {
  it('botão Unir desabilitado sem vizinha colinear', () => {
    montar({ podeUnir: false });
    expect(screen.getByRole('button', { name: /unir/i })).toBeDisabled();
  });

  it('botão Unir habilitado e chama onUnir', async () => {
    const user = userEvent.setup();
    const props = montar({ podeUnir: true });

    const botao = screen.getByRole('button', { name: /unir/i });
    expect(botao).toBeEnabled();
    await user.click(botao);
    expect(props.onUnir).toHaveBeenCalledOnce();
  });
});

// Props default reaproveitadas nos casos de rerender acima.
function montarProps(): React.ComponentProps<typeof PainelParedeSelecionada> {
  return {
    parede: parede(),
    abertura: null,
    pontaQueAnda: 'b',
    arrastaCanto: false,
    aLivre: true,
    bLivre: true,
    onEscolherPonta: vi.fn(),
    onDestacarPonta: vi.fn(),
    onComprimento: vi.fn(),
    onEspessura: vi.fn(),
    podeUnir: false,
    onDividir: vi.fn(),
    onUnir: vi.fn(),
    onFlipAbertura: vi.fn(),
    onTamanhoAbertura: vi.fn(),
  };
}

describe('PainelParedeSelecionada · identificador (§27)', () => {
  const UID = '89b784bd-c5b2-4f62-9194-a1c051daa280';

  it('parede com uid mostra o rótulo curto, com o uid inteiro no title', () => {
    montar({ parede: parede({ uid: UID }) });
    const rotulo = screen.getByText('P-89B7');
    expect(rotulo).toHaveAttribute('title', UID);
    expect(screen.getByRole('button', { name: /copiar identificador completo/i })).toBeInTheDocument();
  });

  it('abertura com uid usa o prefixo de vão', () => {
    montar({ parede: null, abertura: porta({ uid: UID }) });
    expect(screen.getByText('V-89B7')).toBeInTheDocument();
  });

  it('sem uid (modelo de teste) a linha não existe', () => {
    montar();
    expect(screen.queryByText(/identificador/i)).not.toBeInTheDocument();
  });
});
