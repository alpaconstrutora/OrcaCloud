// @vitest-environment jsdom
/**
 * ESQUADRIAS EM LOTE (24/09/2026, P2.49).
 *
 * ⚠️ O número que motivou esta tela é real, medido na planta do usuário depois
 * da importação DXF: **104 esquadrias, 0 com tipo, 0 com item**. E
 * `blueprintBudget` pula a esquadria sem tipo ANTES de gerar linha OU
 * divergência (`if (!e.declarada) continue`) — a planta inteira não produzia
 * uma linha de esquadria no orçamento e não acusava nada. O caminho que
 * existia era nomear uma a uma, no painel do selecionado, 104 vezes.
 *
 * O que se trava aqui é o contrato, não o visual:
 *
 *   1. o aviso diz quantas PEÇAS estão fora do orçamento (não quantos tipos);
 *   2. "Nomear automaticamente" numera por tipo, do mais numeroso ao menos, e
 *      NÃO renomeia quem já tem nome — nem repete um nome já usado;
 *   3. aplicar manda UM lote com todas as aberturas de cada grupo;
 *   4. nome vazio não vira esquadria (o kernel recusa);
 *   5. clicar no tipo seleciona as aberturas dele no desenho.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PainelEsquadrias from '../../components/blueprint/PainelEsquadrias';
import type { QuantidadePorEsquadria } from '../../utils/blueprintKernel/quantities';

vi.mock('../../services/blueprintOpeningTypeService', () => ({
  listOpeningTypes: vi.fn().mockResolvedValue([]),
  saveOpeningType: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../hooks/useOrgContext', () => ({
  useOrgContext: () => ({ orgId: 'org_1' }),
  useOrgWriteTarget: () => ({
    resolveWriteOrg: vi.fn().mockResolvedValue({ kind: 'org', orgId: 'org_1' }),
    orgTargetModal: null,
  }),
  forEachTargetOrg: vi.fn().mockResolvedValue({ ok: 1, failed: [] }),
}));

vi.mock('../../components/DatabasePickerModal', () => ({
  default: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (i: { code: string; description: string }) => void }) =>
    isOpen ? (
      <button type="button" onClick={() => onSelect({ code: '90843', description: 'Porta semi-oca' })}>
        escolher-item-dublê
      </button>
    ) : null,
}));

/** Um grupo do quadro; por padrão SEM tipo declarado, como sai da importação. */
function grupo(over: Partial<QuantidadePorEsquadria> = {}): QuantidadePorEsquadria {
  const larguraM = over.larguraM ?? 0.8;
  const alturaM = over.alturaM ?? 2.1;
  const tipo = over.tipo ?? 'door';
  const nome = over.nome ?? `Porta ${larguraM * 100}×${alturaM * 100}`;
  return {
    assinatura: over.assinatura ?? `${tipo}|${larguraM * 1000}|${alturaM * 1000}||`,
    declarada: over.declarada ?? false,
    nome,
    tipo,
    larguraM,
    alturaM,
    itemCode: over.itemCode ?? '',
    descricao: over.descricao ?? '',
    quantidade: over.quantidade ?? 1,
    areaM2: larguraM * alturaM * (over.quantidade ?? 1),
    openingIds: over.openingIds ?? ['o1'],
  };
}

const onAplicar = vi.fn();
const onSelecionar = vi.fn();

function montar(grupos: QuantidadePorEsquadria[]) {
  onAplicar.mockClear();
  onSelecionar.mockClear();
  render(<PainelEsquadrias grupos={grupos} onAplicar={onAplicar} onSelecionar={onSelecionar} />);
}

beforeEach(() => vi.clearAllMocks());

describe('PainelEsquadrias · o quadro em lote', () => {
  it('anuncia quantas PEÇAS estão fora do orçamento, não quantos tipos', () => {
    montar([
      grupo({ quantidade: 35, openingIds: Array.from({ length: 35 }, (_, i) => `p${i}`) }),
      grupo({ assinatura: 'window|1200|1000||', tipo: 'window', larguraM: 1.2, alturaM: 1, quantidade: 51, openingIds: Array.from({ length: 51 }, (_, i) => `j${i}`) }),
    ]);
    expect(screen.getByTestId('resumo-esquadrias-lote')).toHaveTextContent('86 esquadria(s) em 2 tipo(s)');
    // 86 peças, e não "2 tipos": é a peça que fica fora do orçamento.
    expect(screen.getByTestId('aviso-sem-tipo')).toHaveTextContent('86 peça(s) fora hoje');
  });

  it('nomeia por tipo, do mais numeroso ao menos — P1 é a porta que mais se repete', async () => {
    const user = userEvent.setup();
    montar([
      grupo({ assinatura: 'a', quantidade: 3, larguraM: 0.7 }),
      grupo({ assinatura: 'b', quantidade: 12, larguraM: 0.8 }),
      grupo({ assinatura: 'c', tipo: 'window', larguraM: 1.2, alturaM: 1, quantidade: 8 }),
      grupo({ assinatura: 'd', tipo: 'sliding', larguraM: 1.5, alturaM: 2.1, quantidade: 2 }),
    ]);
    await user.click(screen.getByTestId('nomear-automaticamente'));
    const nomes = screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value);
    // A TABELA segue a mesma ordem da numeração — porta, correr, janela; dentro
    // de cada tipo, do mais numeroso ao menos. Medido no app: numerar por uma
    // ordem e listar por outra devolvia "J5, J2, J4, J21…" na tela.
    expect(nomes).toEqual(['P1', 'P2', 'PC1', 'J1']);
  });

  it('⚠️ não renomeia quem já tem nome, e não repete um nome que já existe no desenho', async () => {
    const user = userEvent.setup();
    montar([
      grupo({ assinatura: 'a', quantidade: 9, nome: 'P1', declarada: true }),
      grupo({ assinatura: 'b', quantidade: 20, larguraM: 0.9 }),
    ]);
    await user.click(screen.getByTestId('nomear-automaticamente'));
    const nomes = screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value);
    // A nova tem 20 peças e encabeça a lista; a existente (9) vem depois. A nova
    // NÃO pode virar "P1", que já está no desenho — vai para "P2".
    expect(nomes).toEqual(['P2', 'P1']);
  });

  it('aplicar manda UM lote com todas as aberturas do grupo, e só o que mudou', async () => {
    const user = userEvent.setup();
    montar([
      grupo({ assinatura: 'a', quantidade: 3, openingIds: ['o1', 'o2', 'o3'] }),
      grupo({ assinatura: 'b', quantidade: 1, larguraM: 0.9, openingIds: ['o9'] }),
    ]);
    const [primeiro] = screen.getAllByRole('textbox');
    await user.type(primeiro, 'P1');
    await user.click(screen.getByTestId('aplicar-esquadrias'));

    expect(onAplicar).toHaveBeenCalledTimes(1);
    const mudancas = onAplicar.mock.calls[0][0];
    // Só o grupo tocado, com as TRÊS aberturas dele.
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0].openingIds).toEqual(['o1', 'o2', 'o3']);
    expect(mudancas[0].esquadria).toEqual({ nome: 'P1', itemCode: '', descricao: '' });
  });

  it('nome vazio não vira esquadria: o item sozinho não é tipo', async () => {
    const user = userEvent.setup();
    montar([grupo({ assinatura: 'a', openingIds: ['o1'] })]);
    await user.click(screen.getByRole('button', { name: /Item do tipo/ }));
    await user.click(screen.getByRole('button', { name: 'escolher-item-dublê' }));
    // O item entrou no rascunho e o botão de aplicar habilitou…
    expect(screen.getByRole('button', { name: /Item do tipo/ })).toHaveTextContent('90843');
    await user.click(screen.getByTestId('aplicar-esquadrias'));
    // …mas sem nome nada é aplicado, e a tela diz por quê.
    expect(onAplicar).not.toHaveBeenCalled();
    expect(screen.getByTestId('aviso-esquadrias-lote')).toHaveTextContent('dê um nome ao tipo antes');
  });

  it('clicar no tipo seleciona as aberturas dele no desenho', async () => {
    const user = userEvent.setup();
    montar([grupo({ assinatura: 'a', quantidade: 2, openingIds: ['o1', 'o2'] })]);
    await user.click(screen.getByRole('button', { name: 'Porta' }));
    expect(onSelecionar).toHaveBeenCalledWith(['o1', 'o2']);
  });

  it('sem esquadria no pavimento, diz isso — e explica que vão livre não conta', () => {
    montar([]);
    expect(screen.getByTestId('esquadrias-vazio')).toHaveTextContent('não há caixilho a orçar');
  });
});
