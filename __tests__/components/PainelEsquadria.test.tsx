// @vitest-environment jsdom
/**
 * Painel do TIPO DE ESQUADRIA (dentro de "Parede selecionada", na abertura).
 *
 * O que se trava aqui é o contrato com o editor, não o visual:
 *
 *   1. dar NOME cria o tipo na abertura; apagar o nome REMOVE;
 *   2. escolher item exige nome antes — o kernel recusa item sem nome;
 *   3. aplicar um tipo salvo devolve o tipo INTEIRO a `onAplicarTipo` (é o
 *      editor que faz o lote de três comandos);
 *   4. só aparecem os tipos do MESMO kind da abertura;
 *   5. vão livre não tem tipo, e o painel diz isso.
 *
 * O catálogo vai ao Supabase na montagem: mockado, como no painel de camadas.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PainelEsquadria from '../../components/blueprint/PainelEsquadria';
import type { Opening } from '../../utils/blueprintKernel';
import type { TipoDeEsquadria } from '../../services/blueprintOpeningTypeService';

const P1: TipoDeEsquadria = {
  id: 't1',
  organizationId: 'org_1',
  nome: 'P1',
  kind: 'door',
  widthMm: 800,
  heightMm: 2100,
  sillMm: 0,
  embutida: false,
  itemCode: '90843',
  descricao: 'Porta semi-oca',
  active: true,
  createdAt: '',
  updatedAt: '',
};
const J1: TipoDeEsquadria = { ...P1, id: 't2', nome: 'J1', kind: 'window', widthMm: 1200, heightMm: 1200, sillMm: 900 };

const listOpeningTypes = vi.fn();
vi.mock('../../services/blueprintOpeningTypeService', () => ({
  listOpeningTypes: (...a: unknown[]) => listOpeningTypes(...a),
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

// O DatabasePickerModal fala com o SINAPI; aqui só interessa que ele exista.
vi.mock('../../components/DatabasePickerModal', () => ({
  default: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (i: { code: string; description: string }) => void }) =>
    isOpen ? (
      <button type="button" onClick={() => onSelect({ code: '90843', description: 'Porta semi-oca' })}>
        escolher-item-fake
      </button>
    ) : null,
}));

function porta(over: Partial<Opening> = {}): Opening {
  return {
    id: 'opn_1',
    uid: 'u-1',
    wallId: 'wal_1',
    kind: 'door',
    offsetMm: 1500,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
    hingeAtStart: true,
    swingReversed: false,
    embutida: false,
    ...over,
  };
}

function montar(over: Partial<React.ComponentProps<typeof PainelEsquadria>> = {}) {
  const props: React.ComponentProps<typeof PainelEsquadria> = {
    abertura: porta(),
    onEsquadria: vi.fn(),
    onAplicarTipo: vi.fn(),
    ...over,
  };
  render(<PainelEsquadria {...props} />);
  return props;
}

beforeEach(() => {
  listOpeningTypes.mockReset();
  listOpeningTypes.mockResolvedValue([P1, J1]);
});

describe('PainelEsquadria · 1. o nome', () => {
  it('dar um nome cria a esquadria na abertura, sem item', async () => {
    const user = userEvent.setup();
    const props = montar();
    const campo = screen.getByLabelText(/Código de projeto/);
    await user.type(campo, 'P1');
    await user.tab();
    expect(props.onEsquadria).toHaveBeenCalledWith({ nome: 'P1', itemCode: '', descricao: '' });
  });

  it('apagar o nome REMOVE o tipo — é o gesto de quem quer a abertura sem tipo', async () => {
    const user = userEvent.setup();
    const props = montar({ abertura: porta({ esquadria: { nome: 'P1', itemCode: '1', descricao: 'x' } }) });
    const campo = screen.getByLabelText(/Código de projeto/);
    await user.clear(campo);
    await user.tab();
    expect(props.onEsquadria).toHaveBeenCalledWith(null);
  });

  it('mostra o nome do tipo, ou o nome derivado quando não há', () => {
    montar();
    expect(screen.getByText('Porta 900×2100')).toBeTruthy();
  });
});

describe('PainelEsquadria · 2. o item', () => {
  it('sem nome, o botão de item fica desabilitado — item sem nome não é tipo', () => {
    montar();
    expect((screen.getByText(/Escolher item de catálogo/).closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('com nome, escolher o item grava código e descrição mantendo o nome', async () => {
    const user = userEvent.setup();
    const props = montar({ abertura: porta({ esquadria: { nome: 'P1', itemCode: '', descricao: '' } }) });
    await user.click(screen.getByText(/Escolher item de catálogo/));
    await user.click(screen.getByText('escolher-item-fake'));
    expect(props.onEsquadria).toHaveBeenCalledWith({ nome: 'P1', itemCode: '90843', descricao: 'Porta semi-oca' });
  });

  it('avisa que sem item o tipo fica FORA do orçamento', () => {
    montar({ abertura: porta({ esquadria: { nome: 'P1', itemCode: '', descricao: '' } }) });
    expect(screen.getByText(/FORA do/)).toBeTruthy();
  });
});

describe('PainelEsquadria · 3 e 4. aplicar um tipo salvo', () => {
  it('lista só os tipos do MESMO kind, e devolve o tipo inteiro ao aplicar', async () => {
    const user = userEvent.setup();
    const props = montar();
    const select = (await screen.findByLabelText(/Aplicar um tipo de esquadria salvo/)) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));

    const opcoes = Array.from(select.options).map((o) => o.textContent);
    expect(opcoes.some((t) => t?.includes('P1'))).toBe(true);
    // J1 é janela; a abertura é porta.
    expect(opcoes.some((t) => t?.includes('J1'))).toBe(false);

    await user.selectOptions(select, 't1');
    expect(props.onAplicarTipo).toHaveBeenCalledWith(P1);
  });

  it('sem tipo compatível, o seletor fica desabilitado e diz por quê', async () => {
    listOpeningTypes.mockResolvedValue([J1]);
    montar();
    const select = (await screen.findByLabelText(/Aplicar um tipo de esquadria salvo/)) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(true));
    expect(select.title).toMatch(/Nenhum tipo de porta/);
  });
});

describe('PainelEsquadria · 5. vão livre', () => {
  it('não oferece tipo, e diz o motivo', () => {
    montar({ abertura: porta({ kind: 'passage' }) });
    expect(screen.getByText(/não há caixilho a orçar/)).toBeTruthy();
    expect(screen.queryByLabelText(/Código de projeto/)).toBeNull();
  });
});
