// @vitest-environment jsdom
/**
 * CLIMATIZAÇÃO E3 (04/10/2026) no painel do trecho/ponto: capacidade e
 * condensadora na evaporadora; sucção e isolamento na linha frigorígena;
 * isolamento no dreno e no duto — e nada disso no ponto de água.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelTrechoSelecionado from '../../components/blueprint/PainelTrechoSelecionado';
import type { Terminal, Trecho } from '../../utils/blueprintKernel';

const trecho = (disciplina: Trecho['disciplina'], extra: Partial<Trecho> = {}): Trecho => ({
  id: 't1', uid: 'u1', levelId: 'l1', disciplina, a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, ...extra,
});
const terminal = (disciplina: Terminal['disciplina'], tipoHidraulico: Terminal['tipoHidraulico'], extra: Partial<Terminal> = {}): Terminal => ({
  id: 'p1', uid: 'up1', levelId: 'l1', disciplina, tipo: String(tipoHidraulico), tipoHidraulico, at: { x: 0, y: 0 }, cotaMm: 2200, ...extra,
});

describe('PainelTrechoSelecionado › climatização', () => {
  it('evaporadora: capacidade (BTU/h) e a condensadora do sistema; sem condensadora o seletor avisa em vermelho', async () => {
    const onTerminal = vi.fn();
    render(
      <PainelTrechoSelecionado
        trecho={null}
        terminal={terminal('FRIGORIGENA', 'EVAPORADORA_HI_WALL')}
        onTrecho={() => {}}
        onTerminal={onTerminal}
        condensadoras={[{ id: 'c1', nome: 'CD-1 · 12.000 BTU/h' }]}
      />,
    );
    const cap = screen.getByLabelText('Capacidade do equipamento (BTU/h)') as HTMLInputElement;
    expect(cap.value).toBe('');
    fireEvent.change(cap, { target: { value: '12000' } });
    fireEvent.blur(cap);
    expect(onTerminal).toHaveBeenLastCalledWith({ capacidadeBtuH: 12000 });
    const sel = screen.getByLabelText('Condensadora desta evaporadora') as HTMLSelectElement;
    expect(sel.className).toMatch(/border-red-300/);
    expect(sel.options[0].textContent).toBe('Sem sistema');
    await userEvent.setup().selectOptions(sel, 'c1');
    expect(onTerminal).toHaveBeenLastCalledWith({ condensadoraId: 'c1' });
  });

  it('11/10/2026: evaporadora fora do encosto mostra "Encostar na parede" (e o clique encosta); encostada, não mostra nada', () => {
    const onEncostar = vi.fn();
    const r = render(
      <PainelTrechoSelecionado trecho={null} terminal={terminal('FRIGORIGENA', 'EVAPORADORA_HI_WALL')} onTrecho={() => {}} onTerminal={() => {}} encostoDaEvaporadora={{ onEncostar }} />,
    );
    expect(screen.getByTestId('encosto-da-evaporadora').textContent).toMatch(/parte do aparelho entra na parede/);
    fireEvent.click(screen.getByRole('button', { name: 'Encostar na parede' }));
    expect(onEncostar).toHaveBeenCalledTimes(1);
    r.unmount();
    render(<PainelTrechoSelecionado trecho={null} terminal={terminal('FRIGORIGENA', 'EVAPORADORA_HI_WALL')} onTrecho={() => {}} onTerminal={() => {}} />);
    expect(screen.queryByTestId('encosto-da-evaporadora')).toBeNull();
  });

  it('condensadora: tem capacidade, não tem seletor de condensadora; difusor não tem nenhum dos dois', () => {
    const r = render(<PainelTrechoSelecionado trecho={null} terminal={terminal('FRIGORIGENA', 'CONDENSADORA_SPLIT', { capacidadeBtuH: 18000 })} onTrecho={() => {}} onTerminal={() => {}} />);
    expect((screen.getByLabelText('Capacidade do equipamento (BTU/h)') as HTMLInputElement).value).toBe('18.000');
    expect(screen.queryByLabelText('Condensadora desta evaporadora')).toBeNull();
    r.unmount();
    render(<PainelTrechoSelecionado trecho={null} terminal={terminal('MECANICA', 'DIFUSOR')} onTrecho={() => {}} onTerminal={() => {}} />);
    expect(screen.queryByTestId('campo-capacidade')).toBeNull();
    expect(screen.queryByTestId('campo-condensadora')).toBeNull();
  });

  it('linha frigorígena: sucção (padrão = a de líquido) e isolamento; dreno e duto só isolamento; água fria nenhum', () => {
    const onTrecho = vi.fn();
    const r = render(<PainelTrechoSelecionado trecho={trecho('FRIGORIGENA')} terminal={null} onTrecho={onTrecho} onTerminal={() => {}} />);
    const succao = screen.getByLabelText('Diâmetro da linha de sucção, em milímetros') as HTMLInputElement;
    expect(succao.value).toBe('6');
    fireEvent.change(succao, { target: { value: '10' } });
    fireEvent.blur(succao);
    expect(onTrecho).toHaveBeenLastCalledWith({ bitolaSuccaoMm: 10 });
    const iso = screen.getByLabelText('Espessura do isolamento térmico, em milímetros') as HTMLInputElement;
    expect(iso.value).toBe('0');
    fireEvent.change(iso, { target: { value: '9' } });
    fireEvent.blur(iso);
    expect(onTrecho).toHaveBeenLastCalledWith({ isolamentoMm: 9 });
    expect((screen.getByLabelText('Material do tubo') as HTMLSelectElement).options[0].textContent).toBe('Padrão da rede (Cobre (classe E))');
    r.unmount();
    for (const d of ['DRENO_AC', 'MECANICA'] as const) {
      const rr = render(<PainelTrechoSelecionado trecho={trecho(d, { bitolaMm: 25 })} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
      expect(screen.queryByLabelText('Diâmetro da linha de sucção, em milímetros')).toBeNull();
      expect(screen.getByLabelText('Espessura do isolamento térmico, em milímetros')).toBeTruthy();
      rr.unmount();
    }
    render(<PainelTrechoSelecionado trecho={trecho('AGUA_FRIA', { bitolaMm: 25 })} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
    expect(screen.queryByLabelText('Diâmetro da linha de sucção, em milímetros')).toBeNull();
    expect(screen.queryByLabelText('Espessura do isolamento térmico, em milímetros')).toBeNull();
  });

  it('E7.1: o duto escolhe a seção — redonda (Diâmetro) ou retangular (Largura + Altura); o flexível trava em redonda dizendo por quê; o material sem padrão diz "Não declarado"', () => {
    const onTrecho = vi.fn();
    const r = render(<PainelTrechoSelecionado trecho={trecho('MECANICA', { bitolaMm: 600 })} terminal={null} onTrecho={onTrecho} onTerminal={() => {}} />);
    const secao = screen.getByLabelText('Seção do duto') as HTMLSelectElement;
    expect(secao.value).toBe('REDONDA');
    expect(screen.getByLabelText('Bitola do trecho, em milímetros').closest('label')!.textContent).toMatch(/^Diâmetro/);
    expect((screen.getByLabelText('Material do tubo') as HTMLSelectElement).options[0].textContent).toBe('Não declarado');
    fireEvent.change(secao, { target: { value: 'RETANGULAR' } });
    expect(onTrecho).toHaveBeenLastCalledWith({ alturaDutoMm: 300 });
    r.unmount();
    const r2 = render(<PainelTrechoSelecionado trecho={trecho('MECANICA', { bitolaMm: 600, alturaDutoMm: 300 })} terminal={null} onTrecho={onTrecho} onTerminal={() => {}} />);
    expect(screen.getByLabelText('Bitola do trecho, em milímetros').closest('label')!.textContent).toMatch(/^Largura/);
    const altura = screen.getByLabelText('Altura do duto retangular, em milímetros') as HTMLInputElement;
    expect(altura.value).toBe('300');
    fireEvent.change(altura, { target: { value: '400' } });
    fireEvent.blur(altura);
    expect(onTrecho).toHaveBeenLastCalledWith({ alturaDutoMm: 400 });
    fireEvent.change(screen.getByLabelText('Seção do duto'), { target: { value: 'REDONDA' } });
    expect(onTrecho).toHaveBeenLastCalledWith({ alturaDutoMm: null });
    r2.unmount();
    render(<PainelTrechoSelecionado trecho={trecho('MECANICA', { bitolaMm: 200, material: 'DUTO_FLEXIVEL' })} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
    const travado = screen.getByLabelText('Seção do duto') as HTMLSelectElement;
    expect(travado.disabled).toBe(true);
    expect(travado.title).toMatch(/flexível é sempre redondo/);
  });

  it('E7.2: o terminal de ar declara a vazão (vazio = derivada); o ponto de água não tem o campo', () => {
    const onTerminal = vi.fn();
    const r = render(<PainelTrechoSelecionado trecho={null} terminal={terminal('MECANICA', 'DIFUSOR')} onTrecho={() => {}} onTerminal={onTerminal} />);
    const vazao = screen.getByLabelText('Vazão de ar do terminal (m³/h)') as HTMLInputElement;
    expect(vazao.placeholder).toBe('derivada do ambiente');
    fireEvent.change(vazao, { target: { value: '350' } });
    fireEvent.blur(vazao);
    expect(onTerminal).toHaveBeenLastCalledWith({ vazaoM3h: 350 });
    r.unmount();
    render(<PainelTrechoSelecionado trecho={null} terminal={terminal('AGUA_FRIA', 'LAVATORIO')} onTrecho={() => {}} onTerminal={() => {}} />);
    expect(screen.queryByTestId('campo-vazao')).toBeNull();
  });

  it('10/10/2026: a capacidade grava UMA vez ao terminar (não a cada tecla), lê "24.000" e desiste no Escape', async () => {
    const onTerminal = vi.fn();
    render(<PainelTrechoSelecionado trecho={null} terminal={terminal('FRIGORIGENA', 'EVAPORADORA_HI_WALL')} onTrecho={() => {}} onTerminal={onTerminal} condensadoras={[]} />);
    const user = userEvent.setup();
    const cap = screen.getByLabelText('Capacidade do equipamento (BTU/h)') as HTMLInputElement;
    await user.type(cap, '24.000');
    expect(onTerminal).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenLastCalledWith({ capacidadeBtuH: 24000 });
    // O Escape desiste do que foi digitado.
    await user.click(cap);
    await user.clear(cap);
    await user.type(cap, '99000');
    await user.keyboard('{Escape}');
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it('10/10/2026: a leitura em milhar e TR, o aviso fora da faixa do tipo, e apagar volta a "não declarada"', () => {
    const onTerminal = vi.fn();
    const r = render(<PainelTrechoSelecionado trecho={null} terminal={terminal('FRIGORIGENA', 'EVAPORADORA_HI_WALL', { capacidadeBtuH: 24000 })} onTrecho={() => {}} onTerminal={onTerminal} condensadoras={[]} />);
    expect(screen.getByTestId('leitura-da-capacidade')).toHaveTextContent('24.000 BTU/h · 2,0 TR');
    expect(screen.queryByTestId('aviso-da-capacidade')).toBeNull();
    const cap = screen.getByLabelText('Capacidade do equipamento (BTU/h)') as HTMLInputElement;
    fireEvent.change(cap, { target: { value: '' } });
    fireEvent.blur(cap);
    expect(onTerminal).toHaveBeenLastCalledWith({ capacidadeBtuH: null });
    r.unmount();
    // O zero a mais do teste no app real: 240.000 numa hi-wall.
    render(<PainelTrechoSelecionado trecho={null} terminal={terminal('FRIGORIGENA', 'EVAPORADORA_HI_WALL', { capacidadeBtuH: 240000 })} onTrecho={() => {}} onTerminal={() => {}} condensadoras={[]} />);
    expect(screen.getByTestId('leitura-da-capacidade')).toHaveTextContent('240.000 BTU/h · 20,0 TR');
    expect(screen.getByTestId('aviso-da-capacidade')).toHaveTextContent('Fora da faixa típica de evaporadora hi-wall (7.000 a 36.000 BTU/h) — confira o número.');
  });
});
