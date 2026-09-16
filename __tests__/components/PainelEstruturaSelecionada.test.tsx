// @vitest-environment jsdom
/**
 * Painel da peça estrutural — peça ENTERRADA cresce para baixo (16/09/2026).
 *
 * Print do 3D do usuário: *"ao alterar o comprimento da estaca, deve aumentar
 * no sentido do terreno e não no sentido do bloco de coroamento"*. A estaca de
 * 8 m que virou 10 m ganhava 2 m para CIMA, atravessando bloco e baldrame.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelEstruturaSelecionada, { camposDaNovaAltura } from '../../components/blueprint/PainelEstruturaSelecionada';
import { point, type Structural } from '../../utils/blueprintKernel';
import { HIPOTESES_ARMADURA_PADRAO, armaduraDaPeca } from '../../utils/blueprintArmadura';

const estaca: Structural = {
  id: 'str_1', uid: 'u1', levelId: 'lvl_1', kind: 'ESTACA', pontos: [point(0, 0)],
  larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotacaoDeg: 0,
};
const pilar: Structural = { ...estaca, id: 'str_2', kind: 'PILAR', larguraMm: 190, profundidadeMm: 190, alturaMm: 3300, baseMm: -500, circular: false };

describe('camposDaNovaAltura', () => {
  it('estaca (topo −1,10): 8 m → 10 m desce a base para −11,10; o topo não se move', () => {
    expect(camposDaNovaAltura(estaca, 10000)).toEqual({ alturaMm: 10000, baseMm: -11100 });
  });
  it('bloco (topo no arrasamento) e baldrame (topo no piso) também crescem para baixo', () => {
    expect(camposDaNovaAltura({ baseMm: -1100, alturaMm: 600 }, 800)).toEqual({ alturaMm: 800, baseMm: -1300 });
    expect(camposDaNovaAltura({ baseMm: -500, alturaMm: 500 }, 400)).toEqual({ alturaMm: 400, baseMm: -400 });
  });
  it('pilar que desce até o bloco (base −0,50, topo +2,80) continua crescendo para cima — base fica', () => {
    expect(camposDaNovaAltura(pilar, 3500)).toEqual({ alturaMm: 3500 });
  });
});

describe('PainelEstruturaSelecionada · aço esquemático (16/09/2026)', () => {
  it('mostra o kg e o esquema da peça, com a origem; sem `armadura` não fala de aço', () => {
    const a = armaduraDaPeca(pilar, { volumeConcretoM3: 0.119, comprimentoM: 3.3, areaPlantaM2: 0 }, HIPOTESES_ARMADURA_PADRAO);
    const { rerender } = render(
      <PainelEstruturaSelecionada estrutura={pilar} armadura={a} onMedidas={vi.fn()} onTipo={vi.fn()} onExcluir={vi.fn()} />,
    );
    expect(screen.getByText(/kg de aço/)).toHaveTextContent(/4 Ø 12,5 \+ estribos Ø 5,0 c\/15/);
    expect(screen.getByText(/kg de aço/)).toHaveTextContent(/mínimos NBR 6118|taxa de referência/);
    rerender(<PainelEstruturaSelecionada estrutura={pilar} onMedidas={vi.fn()} onTipo={vi.fn()} onExcluir={vi.fn()} />);
    expect(screen.queryByText(/kg de aço/)).toBeNull();
  });
});

describe('PainelEstruturaSelecionada · comprimento da estaca', () => {
  it('o campo se chama Comprimento e aplicar 1000 cm manda altura E base', async () => {
    const onMedidas = vi.fn();
    render(
      <PainelEstruturaSelecionada estrutura={estaca} onMedidas={onMedidas} onTipo={vi.fn()} onExcluir={vi.fn()} />,
    );
    const campo = screen.getByRole('textbox', { name: /^Comprimento, em centímetros/ });
    expect(campo).toHaveAccessibleName(/cresce para baixo/);
    const user = userEvent.setup();
    await user.clear(campo);
    await user.type(campo, '1000{Enter}');
    expect(onMedidas).toHaveBeenCalledWith({ alturaMm: 10000, baseMm: -11100 });
  });
  it('no pilar o campo é Altura e só a altura vai', async () => {
    const onMedidas = vi.fn();
    render(
      <PainelEstruturaSelecionada estrutura={pilar} onMedidas={onMedidas} onTipo={vi.fn()} onExcluir={vi.fn()} />,
    );
    const campo = screen.getByRole('textbox', { name: /^Altura, em centímetros/ });
    const user = userEvent.setup();
    await user.clear(campo);
    await user.type(campo, '350{Enter}');
    expect(onMedidas).toHaveBeenCalledWith({ alturaMm: 3500 });
  });
});
