// @vitest-environment jsdom
/**
 * CONFLITOS × CAMADAS (04/10/2026): com camada oculta, a lista mostra só os
 * conflitos com os dois lados à vista, avisa o recorte e "Ver todos" devolve
 * a lista inteira. O recorte é o mesmo que o editor faz (`conflitoVisivel`).
 */
import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PainelConflitos from '../../components/blueprint/PainelConflitos';
import { applyCommand, conflitosArquitetonicos, conflitosDoModelo, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import { ESTADOS_PADRAO, classificarPecas, conflitoVisivel, idsPorEstado, type EstadosDasCamadas } from '../../utils/blueprintCamadasPorDisciplina';

/** Um tubo de água fria pela porta (térreo) e uma tomada dentro do pilar (superior). */
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

/** O painel com o recorte das camadas montado como no editor. */
function Recortado({ m, estados }: { m: BlueprintModel; estados: EstadosDasCamadas }) {
  const [verTodos, setVerTodos] = useState(false);
  const c = classificarPecas(m);
  const todos = conflitosDoModelo(m);
  const arq = conflitosArquitetonicos(m);
  const recorta = idsPorEstado(c, estados).ocultos.size > 0;
  const filtra = recorta && !verTodos;
  const mep = filtra ? todos.filter((x) => conflitoVisivel([x.trechoId, x.outroId], c, estados)) : todos;
  const a = filtra ? arq.filter((x) => conflitoVisivel([x.pecaId, x.outroId], c, estados)) : arq;
  return (
    <PainelConflitos
      model={m}
      conflitos={mep}
      arquitetonicos={a}
      recorteDasCamadas={recorta ? { exibidos: mep.length + a.length, total: todos.length + arq.length, verTodos, onAlternar: () => setVerTodos((v) => !v) } : null}
    />
  );
}

describe('PainelConflitos · recorte pelas camadas', () => {
  it('tudo à vista: os dois conflitos, sem faixa de recorte', () => {
    render(<Recortado m={cena()} estados={ESTADOS_PADRAO} />);
    expect(screen.getAllByTestId('conflito-aberto')).toHaveLength(2);
    expect(screen.queryByTestId('recorte-das-camadas')).toBeNull();
  });

  it('água fria oculta: sai o tubo × porta, a faixa diz "1 de 2" e Ver todos devolve', async () => {
    render(<Recortado m={cena()} estados={{ ...ESTADOS_PADRAO, AGUA_FRIA: 'OCULTA' }} />);
    const linhas = screen.getAllByTestId('conflito-aberto');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toMatch(/TUG/);
    expect(screen.getByTestId('recorte-das-camadas').textContent).toMatch(/Filtrado pelas camadas visíveis — 1 de 2/);
    await userEvent.click(screen.getByRole('button', { name: 'Ver todos' }));
    expect(screen.getAllByTestId('conflito-aberto')).toHaveLength(2);
    expect(screen.getByTestId('recorte-das-camadas').textContent).toMatch(/Todos os 2 conflitos/);
  });

  it('estrutura só em meio-tom continua contando — o conflito da tomada no pilar fica', () => {
    render(<Recortado m={cena()} estados={{ ...ESTADOS_PADRAO, ESTRUTURA: 'ATENUADA' }} />);
    expect(screen.getAllByTestId('conflito-aberto')).toHaveLength(2);
  });

  it('isolar a hidráulica com a arquitetura em meio-tom: fica só o tubo × porta', () => {
    const estados: EstadosDasCamadas = { ...ESTADOS_PADRAO, ESTRUTURA: 'OCULTA', ELETRICA_FORCA: 'OCULTA', ELETRICA_ILUMINACAO: 'OCULTA', ARQUITETURA: 'ATENUADA' };
    render(<Recortado m={cena()} estados={estados} />);
    const linhas = screen.getAllByTestId('conflito-aberto');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toMatch(/Água fria/);
  });

  it('todos recortados: a faixa explica o vazio em vez de "Nenhum conflito" sozinho', () => {
    render(<Recortado m={cena()} estados={{ ...ESTADOS_PADRAO, AGUA_FRIA: 'OCULTA', ESTRUTURA: 'OCULTA' }} />);
    expect(screen.queryAllByTestId('conflito-aberto')).toHaveLength(0);
    expect(screen.getByTestId('recorte-das-camadas').textContent).toMatch(/0 de 2/);
  });
});
