/**
 * As INSTALAÇÕES no inventário de Componentes (09/09/2026).
 *
 * ─── O RELATO ───────────────────────────────────────────────────────────────
 *
 * *"componentes elétricos continuam sem grupo (accordion) em componentes"*
 *
 * O gerenciador listava alvenaria, esquadria, estrutura, cobertura e circulação
 * — e nenhuma peça de rede. Achar um eletroduto ou uma tomada só era possível
 * procurando no desenho com o olho, uma por uma.
 *
 * ⚠️ E os grupos JÁ EXISTIAM: "Instalações — trechos" e "Instalações — pontos"
 * estavam no catálogo desde sempre, servindo ao menu de ferramentas. Faltava
 * emitir as linhas. É a terceira vez esta semana que a mesma classe de defeito
 * aparece: a família é desenhada e não é LIGADA em algum dos caminhos que a
 * alcançam.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import { linhasDeComponentesPorNivel } from '../utils/blueprintComponentes';
import { fichaDoComponente } from '../components/blueprint/MenuComponentes';

function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;

  m = applyCommand(m, {
    type: 'AddQuadro',
    levelId,
    nome: 'QDC',
    at: point(0, 0),
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
  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ESGOTO',
    tipo: 'Ralo',
    at: point(2000, 0),
    cotaMm: 0,
  }).model;
  // Uma PRUMADA: as duas pontas no mesmo ponto em planta, subindo 2,2 m.
  m = applyCommand(m, {
    type: 'AddTrecho',
    levelId,
    disciplina: 'ELETRICA',
    a: point(1000, 0),
    b: point(1000, 0),
    cotaAMm: 300,
    cotaBMm: 2500,
    bitolaMm: 25,
  }).model;
  return m;
}

const linhas = (m: BlueprintModel) => linhasDeComponentesPorNivel(m).flatMap((b) => b.linhas);

describe('inventário · as instalações entram', () => {
  it('⚠️ trecho, ponto e quadro aparecem na lista', () => {
    // ⚠️ UM modelo só: `cena()` gera ids novos a cada chamada, e comparar ids
    // de dois modelos diferentes reprovaria o código certo.
    const m = cena();
    const ids = new Set(linhas(m).map((l) => l.id));
    expect(ids.has(m.trechos[0].id), 'o trecho sumia da lista').toBe(true);
    expect(ids.has(m.terminais[0].id), 'o ponto sumia da lista').toBe(true);
    expect(ids.has(m.quadros[0].id), 'o quadro sumia da lista').toBe(true);
  });

  it('⚠️ TODA linha tem grupo — chave sem ficha é peça sem accordion', () => {
    // É o defeito relatado, na sua forma exata: a peça aparecer na lista e não
    // cair em grupo nenhum. Uma chave inventada aqui produziria isso sem erro.
    const todas = linhas(cena());
    // ⚠️ A LISTA NÃO PODE ESTAR VAZIA. Este caso passou no vácuo enquanto o
    // inventário devolvia nada: laço sobre array vazio não afirma coisa alguma,
    // e o teste aprovou exatamente o defeito que existe para pegar.
    expect(todas.length).toBeGreaterThanOrEqual(4);
    for (const l of todas) {
      expect(fichaDoComponente(l.chave), `a chave "${l.chave}" não tem ficha`).not.toBeNull();
    }
  });

  it('cada disciplina cai no grupo de instalações que lhe cabe', () => {
    const m = cena();
    const porId = new Map(linhas(m).map((l) => [l.id, l]));
    expect(fichaDoComponente(porId.get(m.trechos[0].id)!.chave)?.grupo).toBe(
      'Instalações — trechos',
    );
    expect(fichaDoComponente(porId.get(m.terminais[0].id)!.chave)?.grupo).toBe(
      'Instalações — pontos',
    );
    expect(fichaDoComponente(porId.get(m.quadros[0].id)!.chave)?.grupo).toBe(
      'Instalações — pontos',
    );
  });

  it('⚠️ o comprimento do trecho é o REAL, em três dimensões', () => {
    // A prumada tem as duas pontas no mesmo ponto em planta: medida em planta,
    // ela daria 0,00 m na lista — o trecho mais comum de uma instalação
    // aparecendo como se não existisse.
    const m = cena();
    const linha = linhas(m).find((l) => l.id === m.trechos[0].id)!;
    expect(linha.medida).toBe('2,20 m');
  });

  it('o rótulo do projetista vence a numeração automática', () => {
    const m = cena();
    const comRotulo = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: m.terminais[0].id,
      rotulo: 'TUG cozinha',
    }).model;
    const linha = linhas(comRotulo).find((l) => l.id === m.terminais[0].id)!;
    expect(linha.rotulo).toBe('TUG cozinha');
  });

  it('desenho sem instalação nenhuma continua igual', () => {
    // A rede é opcional na assinatura: as chamadas antigas não sabem dela, e
    // não podem passar a ver linha nenhuma a mais.
    const m = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    expect(linhas(m)).toEqual([]);
  });
});
