// @vitest-environment jsdom
/**
 * PA2 do prédio automático (13/11/2026): a tela — o programa que o motor lê, a hipótese das plantas, gerar desligado
 * dizendo por quê, o progresso, o resumo do prédio, a planta de cada pavimento (as cópias com o selo), o relatório que
 * leva à planta e as duas saídas (lançar com a trava; criar alternativa). O plano é REAL (o R4 do marco).
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TelaPredioAutomatico, { MOTIVO_GERANDO_PREDIO, MOTIVO_PREVIA_VELHA_PREDIO } from '../../components/blueprint/TelaPredioAutomatico';
import { applyBatch, emptyModel, point, type Command } from '../../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../../utils/blueprintProduto';
import { HIPOTESES_DO_PREDIO_PADRAO, planejarPredioDoPedido, type PlanoDoPredio } from '../../utils/blueprintPredioAutomatico';
import type { EstadoDoPredioAutomatico } from '../../hooks/usePredioAutomatico';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');

/** O R4 do marco: lote 30 × 40 com a rua ao sul, bloco 20 × 12 com 4 pavimentos. */
function r4() {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    div(0, 0, 30000, 0, 'FRENTE'), div(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), div(30000, 40000, 0, 40000, 'FUNDOS'), div(0, 40000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(5000, 15000), point(25000, 15000), point(25000, 27000), point(5000, 27000)], pavimentos: 4 },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const doBloco = distribuirProduto(m, massa, MEDIO).blocos[0];
  return { original: m, entrada: { blocoId: m.blocos![0].id, produto: MEDIO, doBloco, rotacaoNorteDeg: null }, hip: {} };
}
const PEDIDO = r4();
const PLANO: PlanoDoPredio = planejarPredioDoPedido(PEDIDO);

const estado = (extra: Partial<EstadoDoPredioAutomatico> = {}): EstadoDoPredioAutomatico => ({ rodando: false, plano: null, assinatura: null, erro: null, progresso: null, gerar: vi.fn(), cancelar: vi.fn(), limpar: vi.fn(), ...extra });

function tela(extra: Partial<React.ComponentProps<typeof TelaPredioAutomatico>> = {}) {
  const props: React.ComponentProps<typeof TelaPredioAutomatico> = {
    predio: estado(),
    bloco: { nome: 'Torre', pavimentos: 4 },
    produto: MEDIO,
    doBloco: PEDIDO.entrada.doBloco,
    onEditarProduto: vi.fn(),
    hipoteses: HIPOTESES_DO_PREDIO_PADRAO,
    onHipoteses: vi.fn(),
    motivoParaNaoGerar: null,
    onGerar: vi.fn(),
    prova: null,
    onLancar: vi.fn(async () => {}),
    onCriarAlternativa: vi.fn(async () => {}),
    lancado: null,
    ...extra,
  };
  render(<TelaPredioAutomatico {...props} />);
  return props;
}

afterEach(cleanup);

describe('TelaPredioAutomatico (PA2)', () => {
  it('sem prévia: o programa mostra o que o motor lê, e gerar chama o pedido', () => {
    const p = tela();
    const prog = screen.getByTestId('programa-do-predio');
    expect(within(prog).getByText('Bloco "Torre"')).toBeTruthy();
    expect(within(screen.getByTestId('tipologias-do-tipo')).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab', { name: /Resultado/ })).toBeNull();
    fireEvent.click(screen.getByTestId('gerar-predio'));
    expect(p.onGerar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('editar-produto-do-predio'));
    expect(p.onEditarProduto).toHaveBeenCalledTimes(1);
  });

  it('gerar desligado diz o porquê; a hipótese das plantas volta pelo onHipoteses', () => {
    const p = tela({ motivoParaNaoGerar: 'Pavimento tipo já montado: "Tipo".' });
    const gerar = screen.getByTestId('gerar-predio') as HTMLButtonElement;
    expect(gerar.disabled).toBe(true);
    expect(gerar.title).toMatch(/já montado/);
    expect(screen.getByTestId('motivo-gerar-predio').textContent).toMatch(/já montado/);
    fireEvent.click(screen.getByRole('tab', { name: 'Hipóteses' }));
    fireEvent.click(screen.getByTestId('hipotese-plantas'));
    expect(p.onHipoteses).toHaveBeenCalledWith({ ...HIPOTESES_DO_PREDIO_PADRAO, plantas: false });
    fireEvent.click(screen.getByTestId('hipotese-terreo'));
    expect(p.onHipoteses).toHaveBeenLastCalledWith({ ...HIPOTESES_DO_PREDIO_PADRAO, terreo: false });
  });

  it('gerando: o progresso por etapa e o Parar', () => {
    const cancelar = vi.fn();
    tela({ predio: estado({ rodando: true, progresso: { indice: 2, total: 4, rotulo: 'Planta interna das unidades' }, cancelar }) });
    expect(screen.getByTestId('progresso-predio').textContent).toBe('Etapa 2 de 4: Planta interna das unidades');
    fireEvent.click(screen.getByTestId('parar-predio'));
    expect(cancelar).toHaveBeenCalled();
  });

  it('com a prévia: o resumo do prédio, a planta no tipo com as cópias seladas, e lançar', async () => {
    const p = tela({ predio: estado({ plano: PLANO, assinatura: 'a' }), prova: { ok: true } });
    const resumo = screen.getByTestId('resumo-do-predio');
    expect(within(resumo).getByText(String(PLANO.resumo.unidades))).toBeTruthy();
    const pavimento = screen.getByLabelText('Pavimento da prévia') as HTMLSelectElement;
    expect(pavimento.value).toBe(PLANO.tipoLevelId);
    const opcoes = Array.from(pavimento.options).map((o) => o.textContent);
    expect(opcoes.filter((o) => o?.endsWith('· cópia do tipo'))).toHaveLength(PLANO.resumo.copias);
    expect(within(screen.getByTestId('etapas-do-predio')).getAllByRole('listitem')).toHaveLength(7);
    const lancar = screen.getByTestId('lancar-predio') as HTMLButtonElement;
    expect(lancar.textContent).toBe(`Lançar os ${PLANO.resumo.pavimentosLancados} pavimentos`);
    fireEvent.click(lancar);
    await waitFor(() => expect(p.onLancar).toHaveBeenCalledTimes(1));
  });

  it('lançar desligado: trava falhou, prévia velha, ainda gerando', () => {
    tela({ predio: estado({ plano: PLANO, assinatura: 'a' }), prova: { ok: false, motivo: 'O desenho mudou desde a prévia — gere de novo.' } });
    expect((screen.getByTestId('lancar-predio') as HTMLButtonElement).title).toMatch(/mudou desde a prévia/);
    cleanup();
    tela({ predio: estado({ plano: PLANO, assinatura: 'a' }), prova: { ok: true }, desatualizada: true });
    expect((screen.getByTestId('lancar-predio') as HTMLButtonElement).title).toBe(MOTIVO_PREVIA_VELHA_PREDIO);
    expect((screen.getByTestId('criar-alternativa-predio') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    tela({ predio: estado({ plano: PLANO, assinatura: 'a', rodando: true }), prova: { ok: true } });
    expect((screen.getByTestId('lancar-predio') as HTMLButtonElement).title).toBe(MOTIVO_GERANDO_PREDIO);
  });

  it('o relatório leva a pendência com local à planta da prévia, com a marca', () => {
    const tipo = PLANO.tipoLevelId;
    const etiqueta = PLANO.resultado.labels.find((l) => l.levelId === tipo)!;
    const plano: PlanoDoPredio = { ...PLANO, pendencias: [{ grupo: 'SEM_SOLUCAO', texto: 'Unidade 101: Dormitório sem fachada', locais: [{ levelId: tipo, ids: [etiqueta.id], ponto: etiqueta.at }] }] };
    tela({ predio: estado({ plano, assinatura: 'a' }), prova: { ok: true } });
    fireEvent.click(screen.getByRole('tab', { name: /Relatório/ }));
    fireEvent.click(screen.getByRole('button', { name: /ver na planta/ }));
    expect(screen.getByTestId('marcado-na-planta-predio').textContent).toMatch(/Unidade 101/);
    expect(screen.getAllByTestId('marca-da-previa').length).toBeGreaterThan(0);
  });
});
