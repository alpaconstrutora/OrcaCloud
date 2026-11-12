// @vitest-environment jsdom
/**
 * Etapa B da fase "itens 6 a 11" da casa automática (11/11/2026, plano docs/planos/2026-11-11-casa-automatica-itens-6-a-11.md):
 * o `DesenhistaSvg` fora do unifilar (B1) e a PLANTA DA PRÉVIA — a casa gerada desenhada por pavimento e disciplina com o
 * mesmo código das pranchas (B2).
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesenhistaSvg } from '../../components/blueprint/DesenhistaSvg';
import PlantaDaPrevia, { disciplinasDoPavimento, recorteDaCasa } from '../../components/blueprint/PlantaDaPrevia';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

/** Térreo com uma sala 8 × 5 e um ponto elétrico; Superior com uma parede só. */
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const p = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [p(t, 0, 0, 8000, 0), p(t, 8000, 0, 8000, 5000), p(t, 8000, 5000, 0, 5000), p(t, 0, 5000, 0, 0), p(s, 0, 0, 8000, 0)]).model;
  return applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Tomada baixa', at: point(4000, 200), cotaMm: 300 }).model;
}

describe('DesenhistaSvg (B1)', () => {
  it('coleta as primitivas como nós SVG na escala; texto centralizado e girado quando pedido', () => {
    const d = new DesenhistaSvg(2);
    d.linha(0, 0, 10, 0, { cor: '#111111', espessuraMm: 1 });
    d.texto(5, 5, 'Sala', 2, undefined, { centralizar: true, anguloGraus: 90 });
    d.texto(1, 1, 'solto', 2);
    const { container } = render(<svg>{d.nos}</svg>);
    const linha = container.querySelector('line')!;
    expect(linha.getAttribute('x2')).toBe('20');
    const [sala, solto] = [...container.querySelectorAll('text')];
    expect(sala.getAttribute('text-anchor')).toBe('middle');
    expect(sala.getAttribute('transform')).toBe('rotate(-90 10 10)');
    expect(solto.getAttribute('text-anchor')).toBeNull();
    expect(solto.getAttribute('transform')).toBeNull();
    cleanup();
  });
});

describe('DesenhistaSvg — retângulo', () => {
  it('padrão (unifilar): caixa branca com contorno; modo PRANCHA (o contrato do PDF): branco preenche, outra cor só contorna', () => {
    const u = new DesenhistaSvg(1);
    u.retangulo(0, 0, 10, 10, { cor: '#111111', espessuraMm: 1 });
    const p = new DesenhistaSvg(1, 'PRANCHA');
    p.retangulo(0, 0, 10, 10, { cor: '#111111', espessuraMm: 1 });
    p.retangulo(0, 0, 10, 10, { cor: '#ffffff', espessuraMm: 0 });
    const { container } = render(<svg>{[...u.nos, ...p.nos]}</svg>);
    const [caixa, moldura, fundo] = [...container.querySelectorAll('rect')];
    expect(caixa.getAttribute('fill')).toBe('#ffffff');
    expect(moldura.getAttribute('fill')).toBe('none');
    expect(moldura.getAttribute('stroke')).toBe('#111111');
    expect(fundo.getAttribute('fill')).toBe('#ffffff');
    expect(fundo.getAttribute('stroke')).toBeNull();
    cleanup();
  });
});

describe('PlantaDaPrevia (B2)', () => {
  it('disciplinasDoPavimento: arquitetura e humanizada sempre; a elétrica só onde há ponto elétrico', () => {
    const m = casa();
    const [t, s] = m.levels.map((l) => l.id);
    expect(disciplinasDoPavimento(m, t)).toEqual(['ARQUITETURA', 'HUMANIZADA', 'ELETRICA']);
    expect(disciplinasDoPavimento(m, s)).toEqual(['ARQUITETURA', 'HUMANIZADA']);
  });

  it('desenha o pavimento pedido, com o nome e a disciplina no aria-label; trocar o pavimento e a disciplina avisa', () => {
    const m = casa();
    const [t, s] = m.levels.map((l) => l.id);
    const onLevelId = vi.fn();
    const onDisciplina = vi.fn();
    const { rerender } = render(<PlantaDaPrevia modelo={m} levelId={t} onLevelId={onLevelId} disciplina="ARQUITETURA" onDisciplina={onDisciplina} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toBe('Planta da prévia — Térreo · Arquitetura');
    const nosDoTerreo = svg.querySelectorAll('*').length;
    expect(nosDoTerreo).toBeGreaterThan(4);
    fireEvent.change(screen.getByLabelText('Pavimento da prévia'), { target: { value: s } });
    expect(onLevelId).toHaveBeenCalledWith(s);
    fireEvent.click(screen.getByRole('tab', { name: 'Elétrica' }));
    expect(onDisciplina).toHaveBeenCalledWith('ELETRICA');
    rerender(<PlantaDaPrevia modelo={m} levelId={s} onLevelId={onLevelId} disciplina="ARQUITETURA" onDisciplina={onDisciplina} />);
    const doSuperior = screen.getByRole('img');
    expect(doSuperior.getAttribute('aria-label')).toBe('Planta da prévia — Superior · Arquitetura');
    expect(doSuperior.querySelectorAll('*').length).toBeLessThan(nosDoTerreo);
    // No Superior não há ponto elétrico: a aba Elétrica não aparece.
    expect(screen.queryByRole('tab', { name: 'Elétrica' })).toBeNull();
    cleanup();
  });

  it('recorteDaCasa: a caixa das paredes com 1,5 m de folga (o lote fica de fora); sem parede, null', () => {
    const m = casa();
    expect(recorteDaCasa(m)).toEqual({ minX: -1500, minY: -1500, maxX: 9500, maxY: 6500 });
    expect(recorteDaCasa(emptyModel())).toBeNull();
  });

  it('as marcas do pavimento aberto aparecem; as de outro pavimento, não', () => {
    const m = casa();
    const [t, s] = m.levels.map((l) => l.id);
    render(<PlantaDaPrevia modelo={m} levelId={t} onLevelId={vi.fn()} disciplina="ARQUITETURA" onDisciplina={vi.fn()} marcas={[{ levelId: t, ponto: point(4000, 2500) }, { levelId: s, ponto: point(1000, 0) }]} />);
    expect(screen.getAllByTestId('marca-da-previa')).toHaveLength(1);
    cleanup();
  });

  it('disciplina que o pavimento não tem cai na arquitetura', () => {
    const m = casa();
    const s = m.levels[1].id;
    render(<PlantaDaPrevia modelo={m} levelId={s} onLevelId={vi.fn()} disciplina="ELETRICA" onDisciplina={vi.fn()} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Planta da prévia — Superior · Arquitetura');
    cleanup();
  });

  it('sem pavimento, não desenha nada', () => {
    const { container } = render(<PlantaDaPrevia modelo={emptyModel()} levelId={null} onLevelId={vi.fn()} disciplina="ARQUITETURA" onDisciplina={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    cleanup();
  });
});
