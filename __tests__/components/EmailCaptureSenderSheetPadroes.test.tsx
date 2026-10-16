// @vitest-environment jsdom
/**
 * Cadastro do remetente com os padrões do boleto (16/10/2026). Plano:
 * docs/planos/2026-10-16-captura-padroes-do-remetente.md (passo F).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ salvarRemetente: vi.fn(), definirSenhaPdf: vi.fn(), previaDosPadroes: vi.fn() }));
const boletos = vi.hoisted(() => ({ preencherComPadroesDoRemetente: vi.fn() }));
vi.mock('../../services/emailCaptureService', () => ({ emailCaptureService: svc }));
vi.mock('../../services/boletoService', () => ({ boletoService: boletos }));
vi.mock('../../services/projectService', () => ({ projectService: { listProjects: async () => [{ id: 'obra1', name: 'Residencial Alfa' }] } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listCostCenters: async () => [{ id: 'cc1', name: 'Administrativo' }],
        listPlanoContas: async () => [],
        listChartOfAccounts: async () => [],
    },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({
        organizations: [{ id: 'o1', name: 'Alpa Construtora' }, { id: 'o2', name: 'Outra Org' }],
        currentProfile: { email: 'eu@alpa.com' },
    }),
}));

import EmailCaptureSenderSheet from '../../components/boletos/EmailCaptureSenderSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

const contas = [
    { id: 'c1', organization_id: 'o1', usuario: 'caixa@gmail.com', modo_piloto: true, status: 'ativa' },
    { id: 'c2', organization_id: 'o2', usuario: 'outra@gmail.com', modo_piloto: true, status: 'ativa' },
] as never[];

const remetente = (x: Record<string, unknown> = {}) => ({
    id: 's1', organization_id: 'o1', account_id: 'c1', supplier_id: 'f1', nome: 'LL', tipo: 'exato',
    email: 'll@contabil.com', dominio: null, palavras_chave: [], importacao: 'revisao', exigir_dmarc: true, ativo: true,
    pdf_senha_atualizada_em: null, created_at: '2026-10-16',
    padrao_descricao: 'Parcelamento {mês}', padrao_observacoes: null, padrao_project_id: 'obra1', padrao_cost_center_id: 'cc1',
    padrao_plano_de_contas_id: null, padrao_category_id: null, padrao_dia_vencimento: 20, padrao_valor: null,
    padrao_multa: null, padrao_multa_percentual: null, padrao_juros_dia: null, padrao_juros_dia_tipo: null, ...x,
}) as never;

beforeEach(() => {
    vi.clearAllMocks();
    svc.salvarRemetente.mockImplementation(async (_id: string, r: Record<string, unknown>) => ({ ...(remetente() as object), ...r, id: 's1' }));
    svc.previaDosPadroes.mockResolvedValue([]);
    boletos.preencherComPadroesDoRemetente.mockResolvedValue({ atualizados: [{ id: 'b1' }, { id: 'b2' }], pulados: 0 });
});

const montar = (onSalvo = vi.fn(), r = remetente()) => {
    render(
        <ConfirmProvider>
            <EmailCaptureSenderSheet open onClose={vi.fn()} contas={contas} fornecedores={[]} remetente={r} onSalvo={onSalvo} />
        </ConfirmProvider>,
    );
    return onSalvo;
};

describe('cadastro do remetente — padrões do boleto', () => {
    it('as quatro seções do boleto e a organização da caixa só leitura', async () => {
        montar();
        for (const t of ['Cobrança', 'Quem recebe', 'Classificação', 'Observações']) expect(screen.getByText(t)).toBeTruthy();
        expect(screen.getByText('Alpa Construtora')).toBeTruthy();
        expect((document.getElementById('erem-dia') as HTMLSelectElement).value).toBe('20');
        await waitFor(() => expect(screen.getByRole('option', { name: 'Residencial Alfa' })).toBeTruthy());
        // Prévia da descrição com o mês.
        expect(screen.getByText(/Fica:/)).toBeTruthy();
    });

    it('trocar para a caixa de outra organização limpa fornecedor e classificação', async () => {
        montar();
        fireEvent.change(document.getElementById('erem-conta')!, { target: { value: 'c2' } });
        expect(screen.getByText(/Fornecedor e classificação foram limpos/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Salvar remetente' }));
        await waitFor(() => expect(svc.salvarRemetente).toHaveBeenCalled());
        const enviado = svc.salvarRemetente.mock.calls[0][1];
        expect(enviado).toMatchObject({ account_id: 'c2', organization_id: 'o2', supplier_id: null, padrao_project_id: null, padrao_cost_center_id: null });
        // O que não é cadastro da org fica.
        expect(enviado.padrao_dia_vencimento).toBe(20);
    });

    it('com boletos em revisão, pergunta; "Aplicar" preenche e devolve o resultado', async () => {
        svc.previaDosPadroes.mockResolvedValue([{ boleto: { id: 'b1' } }, { boleto: { id: 'b2' } }]);
        const onSalvo = montar();
        fireEvent.click(screen.getByRole('button', { name: 'Salvar remetente' }));
        await screen.findByText(/Aplicar aos 2 boleto\(s\) em revisão/);
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        await waitFor(() => expect(boletos.preencherComPadroesDoRemetente).toHaveBeenCalledWith(
            [{ boleto: { id: 'b1' } }, { boleto: { id: 'b2' } }], 's1', 'eu@alpa.com'));
        await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), { atualizados: [{ id: 'b1' }, { id: 'b2' }], pulados: 0 }));
    });

    it('"Agora não" não mexe nos boletos', async () => {
        svc.previaDosPadroes.mockResolvedValue([{ boleto: { id: 'b1' } }]);
        const onSalvo = montar();
        fireEvent.click(screen.getByRole('button', { name: 'Salvar remetente' }));
        await screen.findByText(/Aplicar ao/);
        fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
        await waitFor(() => expect(onSalvo).toHaveBeenCalled());
        expect(boletos.preencherComPadroesDoRemetente).not.toHaveBeenCalled();
    });

    it('sem boletos em revisão, não pergunta; sem padrões, nem procura', async () => {
        const onSalvo = montar();
        fireEvent.click(screen.getByRole('button', { name: 'Salvar remetente' }));
        await waitFor(() => expect(onSalvo).toHaveBeenCalled());
        expect(screen.queryByText(/Aplicar ao/)).toBeNull();

        vi.clearAllMocks();
        svc.salvarRemetente.mockImplementation(async (_id: string, r: Record<string, unknown>) => ({ ...r, id: 's2' }));
        const semPadroes = remetente({ id: 's2', padrao_descricao: null, padrao_project_id: null, padrao_cost_center_id: null, padrao_dia_vencimento: null });
        montar(vi.fn(), semPadroes);
        fireEvent.click(screen.getAllByRole('button', { name: 'Salvar remetente' }).at(-1)!);
        await waitFor(() => expect(svc.salvarRemetente).toHaveBeenCalled());
        expect(svc.previaDosPadroes).not.toHaveBeenCalled();
    });
});
