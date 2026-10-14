// @vitest-environment jsdom
/**
 * O alimentador predial na gaveta de água (E4.3; premissas recolhidas e campos
 * novos em 14/10/2026): a situação na boia, o botão que diz por que está
 * desligado e as premissas — gravadas ao sair do campo.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelAlimentador from '../../components/blueprint/PainelAlimentador';
import { HIPOTESES_ALIMENTACAO_PADRAO, type PlanoDoAlimentador } from '../../utils/blueprintAlimentador';

const plano: PlanoDoAlimentador = {
  entradaId: 'hd', destinoId: 'cx', destinoInferior: false, comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }] as never, apagados: 0, confirmados: 0,
  comprimentoM: 12.4, dnMm: 25, vazaoLs: 0.009, velocidadeMs: 0.03, desnivelM: 5.6,
  perdaDistribuidaKpa: 0.1, perdaLocalizadaKpa: 0.2, perdaNoHidrometroKpa: 0.3, pressaoNaBoiaKpa: 44.5, atende: true, avisos: [], motivo: null,
};

const abrirHipoteses = () => fireEvent.click(screen.getByRole('button', { name: /hipóteses do alimentador/i }));
const digitar = (rotulo: string, valor: string) => {
  const campo = screen.getByLabelText(rotulo);
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.blur(campo);
};

describe('PainelAlimentador', () => {
  beforeEach(() => localStorage.clear());

  it('a situação na boia e as premissas recolhidas com o resumo — sem botão de lançar (14/10/2026: é do "Lançar tudo" da gaveta)', () => {
    render(<PainelAlimentador plano={plano} hip={HIPOTESES_ALIMENTACAO_PADRAO} onHip={vi.fn()} />);
    expect(screen.getByTestId('alimentador-situacao')).toHaveTextContent('Chega à boia do reservatório superior com 44,5 kPa (mín. 10).');
    expect(screen.getByTestId('hipoteses-alimentador')).toHaveTextContent('rede 100 kPa · ≤ 1,0 m/s · DN ≥ 25 · boia ≥ 10 kPa');
    expect(screen.queryByLabelText('Pressão da rede pública em kPa')).toBeNull();
    expect(screen.queryByRole('button', { name: /lançar/i })).toBeNull();
  });

  it('sem hidrômetro: diz que o "Lançar tudo" da gaveta o põe na frente do lote', () => {
    const hidrometroProposto = { levelId: 't', at: { x: 0, y: 0 }, cotaMm: -300, origem: 'FRENTE' } as unknown as PlanoDoAlimentador['hidrometroProposto'];
    render(<PainelAlimentador plano={{ ...plano, hidrometroProposto }} hip={HIPOTESES_ALIMENTACAO_PADRAO} onHip={vi.fn()} />);
    expect(screen.getByTestId('alimentador-hidrometro-proposto')).toHaveTextContent('"Lançar tudo" da gaveta Água automática');
  });

  it('apagar a pressão da rede pública NÃO grava 0 (antes gravava)', () => {
    const onHip = vi.fn();
    render(<PainelAlimentador plano={plano} hip={HIPOTESES_ALIMENTACAO_PADRAO} onHip={onHip} />);
    abrirHipoteses();
    digitar('Pressão da rede pública em kPa', '');
    expect(onHip).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Pressão da rede pública em kPa')).toHaveValue(100);
  });

  it('velocidade máxima, DN mínimo e pressão mínima na boia viraram campos (eram constantes escondidas)', () => {
    const onHip = vi.fn();
    render(<PainelAlimentador plano={plano} hip={HIPOTESES_ALIMENTACAO_PADRAO} onHip={onHip} />);
    abrirHipoteses();
    digitar('Velocidade máxima no alimentador em metros por segundo', '1.5');
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_ALIMENTACAO_PADRAO, velocidadeMaxMs: 1.5 });
    fireEvent.change(screen.getByLabelText('DN mínimo do alimentador'), { target: { value: '32' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_ALIMENTACAO_PADRAO, dnMinimoMm: 32 });
    digitar('Pressão mínima na torneira de boia em kPa', '15');
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_ALIMENTACAO_PADRAO, pressaoMinimaNaBoiaKpa: 15 });
  });
});
