// @vitest-environment jsdom
/**
 * O painel da bomba contra a rede (01/10/2026, E4.2): sem curva diz o que fazer
 * (e não desenha gráfico zerado); com curva, as verificações; as cadastradas
 * que atendem aplicam a curva.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelBombaIncendio from '../../components/blueprint/PainelBombaIncendio';
import { HIPOTESES_BOMBEAMENTO_PADRAO as HB, type AnaliseDaBomba } from '../../utils/blueprintBombeamentoIncendio';

const base: AnaliseDaBomba = {
  terminalId: 'b1', temCurva: true, projeto: { vazaoLmin: 605, alturaM: 47.2 }, alturaNaVazaoDeProjetoM: 54.9, atendeProjeto: true,
  operacao: { vazaoLmin: 690, alturaM: 52.1, atende: true }, cento50: { alturaM: 41, minimoM: 30.7, atende: true },
  shutoff: { alturaM: 70, estaticaMaximaKpa: 676.7, atende: true }, npsh: { disponivelM: 8.09, requeridoM: 4, atende: true, nivelDaSuccao: 'COTA_DA_BOMBA' },
  curvaDoSistema: [{ vazaoLmin: 0, alturaM: 0 }, { vazaoLmin: 600, alturaM: 47 }],
};
const CURVA = [{ vazaoLmin: 0, alturaMm: 70000 }, { vazaoLmin: 600, alturaMm: 55000 }, { vazaoLmin: 1200, alturaMm: 30000 }];

describe('PainelBombaIncendio', () => {
  it('com curva: as verificações do projeto, operação, 150 %, shutoff e NPSH', () => {
    render(<PainelBombaIncendio analise={base} curva={CURVA} hb={HB} onHb={vi.fn()} candidatas={[]} onAplicar={vi.fn()} onSelecionarBomba={vi.fn()} />);
    const v = screen.getByTestId('bomba-verificacoes').textContent!;
    expect(v).toContain('Ponto de projeto');
    expect(v).toContain('605 L/min a 47,2 m; a curva dá 54,9 m');
    expect(v).toContain('Ponto de operação');
    expect(v).toContain('NPSH');
    expect(screen.queryByTestId('bomba-sem-curva')).toBeNull();
  });

  it('sem curva: texto explicando, nunca gráfico zerado', () => {
    render(<PainelBombaIncendio analise={{ ...base, temCurva: false, atendeProjeto: null, operacao: null, cento50: null, shutoff: null }} curva={null} hb={HB} onHb={vi.fn()} candidatas={[]} onAplicar={vi.fn()} onSelecionarBomba={vi.fn()} />);
    expect(screen.getByTestId('bomba-sem-curva').textContent).toMatch(/não tem curva declarada/);
    expect(screen.getByTestId('bomba-sem-candidatas')).toBeInTheDocument();
  });

  it('as cadastradas que atendem aplicam a curva', async () => {
    const onAplicar = vi.fn();
    const cand = { id: 't1', nome: 'Fabricante X — 10 cv', curva: CURVA };
    render(<PainelBombaIncendio analise={base} curva={null} hb={HB} onHb={vi.fn()} candidatas={[{ candidata: cand, folgaM: 7.7 }]} onAplicar={onAplicar} onSelecionarBomba={vi.fn()} />);
    expect(screen.getByTestId('bomba-candidatas').textContent).toContain('Fabricante X — 10 cv');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onAplicar).toHaveBeenCalledWith(cand);
  });
});
