// @vitest-environment jsdom
/**
 * O ponto elétrico fora de circuito se resolve NO AVISO (09/09/2026).
 *
 * ─── O RELATO ───────────────────────────────────────────────────────────────
 *
 * "1 ponto elétrico fora de circuito. Eles não entram em soma nenhuma.
 * Selecione o ponto e escolha o circuito no painel dele. **porém não encontrou
 * como conectar a um circuito**"
 *
 * O aviso dava um NÚMERO e uma instrução para procurar. E procurar o quê? Um
 * ponto fora de circuito está fora de circuito, quase sempre, exatamente por
 * ter passado despercebido — pedir que ele seja achado no desenho é pedir de
 * novo o que já falhou uma vez.
 *
 * Agora o aviso lista QUAIS são, leva a cada um no desenho, e liga ao circuito
 * ali mesmo.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import {
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
} from '../../utils/blueprintKernel';

/** Um desenho com quadro, um circuito e um ponto SOLTO. */
function cena(opcoes: { comCircuito?: boolean; comQuadro?: boolean } = {}) {
  const { comCircuito = true, comQuadro = true } = opcoes;
  let m: BlueprintModel = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;

  if (comQuadro) {
    m = applyCommand(m, {
      type: 'AddQuadro',
      levelId,
      nome: 'QDC',
      at: point(0, 0),
      cotaMm: 1600,
    }).model;
    if (comCircuito) {
      m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1' }).model;
    }
  }

  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'Tomada',
    at: point(1000, 1000),
    cotaMm: 300,
  }).model;
  m = applyCommand(m, {
    type: 'SetTerminalProps',
    terminalId: m.terminais[0].id,
    rotulo: 'TUG cozinha',
  }).model;
  return m;
}

const montar = (m: BlueprintModel, extra: Record<string, unknown> = {}) =>
  render(
    <PainelEletrica
      model={m}
      onAddCircuito={() => {}}
      onCircuitoProps={() => {}}
      onQuadroProps={() => {}}
      {...extra}
    />,
  );

describe('PainelEletrica · o ponto fora de circuito', () => {
  it('⚠️ diz QUAL ponto é, e não só quantos', () => {
    // O número sozinho é um beco sem saída: manda procurar o que passou
    // despercebido. E o rótulo do projetista vence o tipo.
    montar(cena());
    expect(screen.getByText(/1 .*ponto elétrico|ponto elétrico/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'TUG cozinha' })).toBeTruthy();
  });

  it('liga ao circuito ALI MESMO, sem sair do aviso', async () => {
    const onLigarAoCircuito = vi.fn();
    const m = cena();
    const user = userEvent.setup();
    montar(m, { onLigarAoCircuito });

    await user.selectOptions(
      screen.getByLabelText('Circuito de TUG cozinha'),
      m.circuitos[0].id,
    );
    expect(onLigarAoCircuito).toHaveBeenCalledWith(m.terminais[0].id, m.circuitos[0].id);
  });

  it('o nome do ponto leva a ele no desenho', async () => {
    const onSelecionar = vi.fn();
    const m = cena();
    const user = userEvent.setup();
    montar(m, { onSelecionar });

    await user.click(screen.getByRole('button', { name: 'TUG cozinha' }));
    expect(onSelecionar).toHaveBeenCalledWith(m.terminais[0].id);
  });

  it('⚠️ sem circuito nenhum, diz o que fazer em vez de oferecer uma lista vazia', () => {
    // Um seletor com uma opção só — "Ligar a…" — é uma porta que não abre, e
    // quem clica nela conclui que a tela está quebrada.
    montar(cena({ comCircuito: false }));
    expect(screen.queryByLabelText('Circuito de TUG cozinha')).toBeNull();
    expect(screen.getByText('crie um circuito abaixo')).toBeTruthy();
  });

  it('⚠️ SEM QUADRO, a pendência continua visível', () => {
    // Antes, o painel devolvia só "nenhum quadro ainda" e os pontos que ninguém
    // alimenta ficavam invisíveis até alguém criar o quadro — a tela parecia
    // completa justamente quando faltava mais coisa.
    montar(cena({ comQuadro: false }));
    expect(screen.getByText(/Nenhum quadro de distribuição ainda/)).toBeTruthy();
    expect(screen.getByText(/TUG cozinha/)).toBeTruthy();
  });

  it('agrupa pelo critério do usuário — "ambiente" sugerido; por tipo, cabeçalhos da taxonomia; "Ligar todos a…" liga o grupo inteiro', async () => {
    // 13/09/2026: "aparecem todos os pontos elétricos. agrupe-os por ambiente"
    // → "ofereça a forma que ele quer agrupar; sugira por ambiente e ele decide".
    localStorage.clear();
    let m = cena();
    const levelId = m.levels[0].id;
    m = applyCommand(m, {
      type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', at: point(2000, 2000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO',
    }).model;
    m = applyCommand(m, {
      type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG sala', at: point(3000, 1000), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600,
    }).model;
    const onLigarAoCircuito = vi.fn();
    const user = userEvent.setup();
    montar(m, { onLigarAoCircuito });

    // A coluna de POTÊNCIA (13/09/2026): o VA de cada ponto, "—" no que não tem,
    // e a soma do grupo com o aviso de quantos ficaram fora.
    expect(screen.getByText('600 VA', { selector: 'span[title*="declarada"]' })).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTitle(/2 sem potência — fora da soma/)).toHaveTextContent('600 VA');

    const criterio = screen.getByLabelText(/agrupar os pontos fora de circuito por/i) as HTMLSelectElement;
    expect(criterio.value).toBe('ambiente');
    expect(screen.getByRole('option', { name: /ambiente \(sugerido\)/i })).toBeTruthy();
    // Sem parede nenhuma, os três estão "Fora de ambiente" — dito, não escondido.
    expect(screen.getByText(/fora de ambiente/i)).toBeTruthy();

    await user.selectOptions(criterio, 'tipo');
    expect(screen.getByText('tomadas')).toBeTruthy();
    expect(screen.getByText('iluminação')).toBeTruthy();
    // O primeiro ponto da cena não tem tipo: fica em "A classificar", visível.
    expect(screen.getByText('A classificar')).toBeTruthy();

    // O grupo "tomadas" tem 1 ponto ("TUG sala"); só grupos com 2+ ganham "Ligar todos a…".
    expect(screen.queryByLabelText('Circuito de todos em tomadas')).toBeNull();
    await user.selectOptions(criterio, 'pavimento');
    await user.selectOptions(screen.getByLabelText('Circuito de todos em Térreo'), m.circuitos[0].id);
    expect(onLigarAoCircuito).toHaveBeenCalledTimes(3);
    expect(onLigarAoCircuito).toHaveBeenCalledWith(m.terminais[2].id, m.circuitos[0].id);
  });

  it('"Criar novo…" no seletor cria o circuito e liga ali mesmo — nome sugerido, Enter confirma', async () => {
    // 13/09/2026: "adicionar mais um item na lista chamado criar novo … sem ter
    // que ir no quadro de cargas e criar um novo circuito".
    const onCriarCircuitoELigar = vi.fn();
    const m = cena();
    const user = userEvent.setup();
    montar(m, { onCriarCircuitoELigar });

    await user.selectOptions(screen.getByLabelText('Circuito de TUG cozinha'), '__novo__');
    const nome = screen.getByLabelText('Nome do circuito a criar') as HTMLInputElement;
    // Já há C1 no quadro: sugere C2. Um quadro só: sem seletor de quadro.
    expect(nome.value).toBe('C2');
    expect(screen.queryByLabelText('Quadro do novo circuito')).toBeNull();

    await user.clear(nome);
    await user.type(nome, 'C2 — Cozinha{Enter}');
    expect(onCriarCircuitoELigar).toHaveBeenCalledWith(m.quadros[0].id, 'C2 — Cozinha', [m.terminais[0].id]);
    expect(screen.queryByLabelText('Nome do circuito a criar')).toBeNull();
  });

  it('sem circuito nenhum mas COM quadro, "Criar novo…" é a saída — em vez de "crie um circuito abaixo"', async () => {
    const onCriarCircuitoELigar = vi.fn();
    const m = cena({ comCircuito: false });
    const user = userEvent.setup();
    montar(m, { onCriarCircuitoELigar });
    expect(screen.queryByText('crie um circuito abaixo')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Circuito de TUG cozinha'), '__novo__');
    expect((screen.getByLabelText('Nome do circuito a criar') as HTMLInputElement).value).toBe('C1');
    await user.click(screen.getByRole('button', { name: /criar e ligar/i }));
    expect(onCriarCircuitoELigar).toHaveBeenCalledWith(m.quadros[0].id, 'C1', [m.terminais[0].id]);
  });

  it('pontos SEM potência: o painel diz quantos e oferece "Preencher potência pela norma"', async () => {
    // 13/09/2026: "verifique por que alguns pontos não têm potência" — eram
    // anteriores ao padrão. O botão resolve o legado num lote.
    const onPreencherPotencias = vi.fn();
    // Uma TUG sem potência (a cena nasce sem tipo elétrico; sem tipo a norma não sabe valorar).
    const m = applyCommand(cena(), { type: 'SetTerminalProps', terminalId: cena().terminais[0].id, tipoEletrico: 'TUG' }).model;
    const primeira = montar(m, { onPreencherPotencias });
    const b = screen.getByRole('button', { name: /preencher potência pela norma \(1\)/i });
    await userEvent.setup().click(b);
    expect(onPreencherPotencias).toHaveBeenCalledTimes(1);
    primeira.unmount();

    // Com potência em todos, o botão some.
    const comPotencia = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, potenciaW: 100 }).model;
    montar(comPotencia, { onPreencherPotencias });
    expect(screen.queryByRole('button', { name: /preencher potência pela norma/i })).toBeNull();
  });

  it('sem ponto solto, o aviso não aparece', () => {
    const m = cena();
    const ligado = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: m.terminais[0].id,
      circuitoId: m.circuitos[0].id,
    }).model;
    montar(ligado);
    expect(screen.queryByText(/fora de circuito/)).toBeNull();
  });
});
