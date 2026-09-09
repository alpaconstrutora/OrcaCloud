// @vitest-environment jsdom
/**
 * O grupo de INSTALAÇÕES aparece na PLANTA BAIXA (09/09/2026).
 *
 * ─── ⚠️ POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────
 *
 * Porque o teste anterior mediu o caminho errado, e eu publiquei achando que
 * tinha resolvido.
 *
 * `PainelComponentes` monta a lista de DOIS jeitos:
 *
 *   · **3D** — a partir de `blocos`, prontos, um por pavimento
 *     (`linhasDeComponentesPorNivel`);
 *   · **planta baixa** — a partir das props de peça, dentro do próprio painel.
 *
 * Liguei a rede só no primeiro. O grupo apareceu no 3D e continuou ausente na
 * planta baixa, que é onde se desenha. O usuário mandou o print: Alvenaria,
 * Esquadrias, Estrutura, Fundação, Circulação — e nenhuma instalação.
 *
 * A lição, pela terceira vez esta semana: **uma família nova precisa ser ligada
 * em TODOS os caminhos que a alcançam, e um teste que cobre um deles não diz
 * nada sobre os outros.** Por isso este arquivo renderiza o painel de verdade,
 * nos dois modos.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PainelComponentes from '../../components/blueprint/PainelComponentes';
import { linhasDeComponentesPorNivel } from '../../utils/blueprintComponentes';
import {
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
} from '../../utils/blueprintKernel';

function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, {
    type: 'AddWall',
    levelId,
    a: point(0, 0),
    b: point(4000, 0),
    thicknessMm: 150,
    heightMm: 2800,
  }).model;
  m = applyCommand(m, {
    type: 'AddQuadro',
    levelId,
    nome: 'QDC',
    at: point(500, 500),
    cotaMm: 1600,
  }).model;
  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'Tomada',
    at: point(1000, 0),
    cotaMm: 300,
  }).model;
  return applyCommand(m, {
    type: 'AddTrecho',
    levelId,
    disciplina: 'ELETRICA',
    a: point(500, 500),
    b: point(1000, 0),
    cotaAMm: 300,
    cotaBMm: 300,
    bitolaMm: 25,
  }).model;
}

const rede = (m: BlueprintModel) => ({
  trechos: m.trechos ?? [],
  terminais: m.terminais ?? [],
  quadros: m.quadros ?? [],
});

describe('PainelComponentes · planta baixa', () => {
  it('⚠️ mostra os grupos de INSTALAÇÕES — o caminho do print', () => {
    const m = cena();
    render(
      <PainelComponentes
        paredes={m.walls}
        aberturas={m.openings}
        estruturas={m.structures}
        escadas={{ model: m, itens: [] }}
        rede={rede(m)}
        selecionados={[]}
        onSelecionar={() => {}}
        onExcluir={() => {}}
      />,
    );
    expect(screen.getByText('Alvenaria')).toBeTruthy();
    expect(screen.getByText('Instalações — trechos')).toBeTruthy();
    expect(screen.getByText('Instalações — pontos')).toBeTruthy();
  });

  it('⚠️ sem a prop `rede`, os grupos somem — é o que estava publicado', () => {
    // Mede o defeito exato: as mesmas peças no modelo, o painel sem receber a
    // rede. Se este caso passasse a mostrar os grupos, o teste de cima estaria
    // aprovando por outro motivo.
    const m = cena();
    render(
      <PainelComponentes
        paredes={m.walls}
        aberturas={m.openings}
        estruturas={m.structures}
        escadas={{ model: m, itens: [] }}
        selecionados={[]}
        onSelecionar={() => {}}
        onExcluir={() => {}}
      />,
    );
    expect(screen.getByText('Alvenaria')).toBeTruthy();
    expect(screen.queryByText('Instalações — pontos')).toBeNull();
  });
});

describe('PainelComponentes · vista 3D', () => {
  it('os grupos de instalações também aparecem pelo caminho dos blocos', () => {
    const m = cena();
    render(
      <PainelComponentes
        paredes={[]}
        aberturas={[]}
        estruturas={[]}
        blocos={linhasDeComponentesPorNivel(m)}
        selecionados={[]}
        onSelecionar={() => {}}
        onExcluir={() => {}}
      />,
    );
    expect(screen.getByText('Instalações — trechos')).toBeTruthy();
    expect(screen.getByText('Instalações — pontos')).toBeTruthy();
  });
});
