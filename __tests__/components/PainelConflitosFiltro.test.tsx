// @vitest-environment jsdom
/**
 * A LISTA DE CONFLITOS com filtro por pavimento e "Destacar no 3D" (E7.2, 29/09/2026).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelConflitos from '../../components/blueprint/PainelConflitos';
import { applyCommand, conflitosArquitetonicos, conflitosDoModelo, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

/** Dois pavimentos; no térreo, um tubo pela porta; no superior, uma tomada dentro do pilar. */
function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 }).model;
  const [t0, t1] = m.levels.map((l) => l.id);
  m = applyCommand(m, { type: 'AddWall', levelId: t0, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }).model;
  m = applyCommand(m, { type: 'AddTrecho', levelId: t0, disciplina: 'AGUA_FRIA', a: point(2450, -1000), b: point(2450, 1000), cotaAMm: 1000, cotaBMm: 1000, bitolaMm: 25 } as Command).model;
  m = applyCommand(m, { type: 'AddStructural', levelId: t1, kind: 'PILAR', pontos: [point(1000, 1000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 } as Command).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t1, disciplina: 'ELETRICA', tipo: 'TUG', at: point(1000, 1000), cotaMm: 300, tipoEletrico: 'TUG' }).model;
  return m;
}

const montar = (m: BlueprintModel, extras: Record<string, unknown> = {}) =>
  render(<PainelConflitos model={m} conflitos={conflitosDoModelo(m)} arquitetonicos={conflitosArquitetonicos(m)} {...extras} />);

describe('PainelConflitos · filtro por pavimento e destaque no 3D (E7.2)', () => {
  it('⚠️ as classes novas aparecem com nome e explicação: o vão e o ponto dentro do pilar', () => {
    montar(cena());
    const linhas = screen.getAllByTestId('conflito-aberto');
    expect(linhas).toHaveLength(2);
    const texto = linhas.map((l) => l.textContent).join(' | ');
    expect(texto).toMatch(/Porta V-.*dentro do vão — o tubo ficaria aparente/);
    expect(texto).toMatch(/TUG O-.*150 mm dentro da estrutura/);
  });

  it('⚠️ o filtro por pavimento mostra só os do pavimento, com a contagem de cada um nas opções', async () => {
    const m = cena();
    montar(m);
    const sel = screen.getByLabelText('Filtrar conflitos por pavimento') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Todos (2)', 'Térreo (1)', 'Superior (1)']);
    await userEvent.selectOptions(sel, m.levels[1].id);
    const linhas = screen.getAllByTestId('conflito-aberto');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toMatch(/TUG/);
  });

  it('pavimento sem conflito diz que os abertos estão em outro', async () => {
    let m = cena();
    m = applyCommand(m, { type: 'AddLevel', name: 'Cobertura', elevationMm: 6000, defaultHeightMm: 2800 }).model;
    montar(m);
    await userEvent.selectOptions(screen.getByLabelText('Filtrar conflitos por pavimento'), m.levels[2].id);
    expect(screen.queryAllByTestId('conflito-aberto')).toHaveLength(0);
    expect(screen.getByTestId('sem-abertos').textContent).toMatch(/Nenhum conflito aberto neste pavimento — 2 em outro\(s\)/);
  });

  it('"Destacar no 3D" liga e desliga pelo editor; sem o callback, a chave não aparece', async () => {
    const onDestaque = vi.fn();
    const { unmount } = montar(cena(), { destaqueNo3d: false, onDestaqueNo3d: onDestaque });
    await userEvent.click(within(screen.getByTestId('barra-conflitos')).getByLabelText('Destacar conflitos no 3D'));
    expect(onDestaque).toHaveBeenCalledWith(true);
    unmount();
    montar(cena());
    expect(screen.queryByLabelText('Destacar conflitos no 3D')).toBeNull();
  });
});
