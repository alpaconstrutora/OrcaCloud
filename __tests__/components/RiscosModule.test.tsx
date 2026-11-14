// @vitest-environment jsdom
/**
 * Módulo Riscos — o que o typecheck e o `check-ui-standard.sh` não veem: que a tela
 * RENDERIZA e que as regras da F1 acontecem (docs/planos/2026-11-13-modulo-riscos.md).
 * As tabelas do módulo ainda não existem no banco remoto: o serviço é simulado.
 *
 *  - Painel: os cartões contam pelas funções de `utils/riskPainel` e o clique abre a
 *    aba Registro com a MESMA lista (CA11);
 *  - "Todas as organizações" carrega (REGRA #5: o serviço recebe `null`);
 *  - ficha nova: salvar sem os obrigatórios mostra erro por campo e foca o primeiro (CA03);
 *  - sem `canEditRisks`: o motivo aparece e "Novo risco" fica desligado.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ProjectRisk, RiskAction } from '../../types/risk';

const listarRiscos = vi.fn();
const listarAcoes = vi.fn();
const criarRisco = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../services/riskService', () => ({
    riskService: {
        listarRiscos: (...a: unknown[]) => listarRiscos(...a),
        listarAcoes: (...a: unknown[]) => listarAcoes(...a),
        listarFaixasPorOrg: vi.fn(async () => ({})),
        listarCategorias: vi.fn(async () => [{ id: 'c14', organization_id: null, codigo: 'R14', nome: 'Segurança do trabalho', ordem: 14 }]),
        listarEmpreendimentos: vi.fn(async () => []),
        listarContratos: vi.fn(async () => []),
        listarCatalogo: vi.fn(async () => []),
        listarAvaliacoes: vi.fn(async () => []),
        listarHistorico: vi.fn(async () => []),
        listarDocumentosSst: vi.fn(async () => []),
        obterRisco: vi.fn(async () => null),
        criarRisco: (...a: unknown[]) => criarRisco(...a),
    },
    fichaDoCatalogo: vi.fn(),
}));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import RiscosModule from '../../components/riscos/RiscosModule';

const risco = (p: Partial<ProjectRisk>): ProjectRisk => ({
    id: 'r', organization_id: 'org-a', numero: 1, codigo: 'RSC-0001', catalog_id: null, catalog_codigo: null, catalog_versao: null,
    category_id: null, tipo: 'ameaca', titulo: 'Risco', causa: 'c', evento: 'e', consequencia: 'q', tags: [], dimensoes: [],
    escopo: 'obra', empreendimento_id: null, project_id: 'obra-1', contract_id: null, frente: null, localizacao: null, fase: null,
    partes_afetadas: null, owner_user_id: 'u1', owner_nome: 'Ana', avaliador_user_id: null, aprovador_user_id: null,
    data_identificacao: '2026-11-01', proxima_revisao: '2099-12-01', controles_existentes: null, estrategia: null,
    plano_resposta: null, contingencia: null, justificativa_aceite: null, status: 'identificado', encerramento_motivo: null,
    encerrado_em: null, gatilho_critico: false, gatilho_motivo: null, inerente_probabilidade: null, inerente_impacto: null,
    inerente_pontuacao: null, residual_probabilidade: null, residual_impacto: null, residual_pontuacao: null, valor_esperado: null,
    ultima_avaliacao_em: null, sst_document_tipo: null, sst_document_id: null, created_at: '', updated_at: '', ...p,
});

const RISCOS = [
    risco({ id: 'r1', numero: 1, codigo: 'RSC-0001', titulo: 'Recalque na torre B', inerente_probabilidade: 4, inerente_impacto: 5, inerente_pontuacao: 20 }),
    risco({ id: 'r2', numero: 2, codigo: 'RSC-0002', titulo: 'Queda de altura na fachada', gatilho_critico: true, gatilho_motivo: 'vida',
        inerente_probabilidade: 1, inerente_impacto: 2, inerente_pontuacao: 2 }),
    risco({ id: 'r3', numero: 3, codigo: 'RSC-0003', titulo: 'Atraso de aprovação na prefeitura' }),
];
const ACOES: RiskAction[] = [];

const montar = (podeEditar = true) => render(<ConfirmProvider><RiscosModule podeEditar={podeEditar} /></ConfirmProvider>);

beforeEach(() => {
    localStorage.clear();
    listarRiscos.mockReset().mockResolvedValue(RISCOS);
    listarAcoes.mockReset().mockResolvedValue(ACOES);
    criarRisco.mockReset();
    useStore.setState({
        activeOrganizationId: 'org-a',
        activeEmpresaId: null,
        organizations: [{ id: 'org-a', name: 'Construtora A', address: {}, members: [
            { id: 'm1', name: 'Ana', email: 'ana@x.com', role: 'admin', joinedAt: '', userId: 'u1', permissions: {} },
            { id: 'm2', name: 'Convite sem conta', email: 'conv@x.com', role: 'member', joinedAt: '', userId: null, permissions: {} },
        ] }] as never,
        projects: [{ id: 'obra-1', name: 'Residencial Aurora', settings: {} as never, budget: [], organization_id: 'org-a' }],
        currentProfile: { ...useStore.getState().currentProfile, email: 'ana@x.com' },
        viewFocus: null,
    });
});

describe('Riscos — tela', () => {
    it('Painel conta críticos com o gatilho, e o clique abre o Registro com a mesma lista (CA11)', async () => {
        const user = userEvent.setup();
        montar();
        expect(await screen.findByRole('heading', { level: 1, name: 'Riscos' })).toBeTruthy();
        await waitFor(() => expect(listarRiscos).toHaveBeenCalledWith('org-a'));
        const cartao = await screen.findByTitle('Ver os riscos críticos na aba Registro');
        await waitFor(() => expect(within(cartao).getByText('2')).toBeTruthy());

        await user.click(cartao);
        expect(await screen.findByRole('heading', { level: 1, name: 'Registro de riscos' })).toBeTruthy();
        expect(screen.getByText(/Recorte do painel/).textContent).toContain('2 riscos');
        expect(screen.getByText('Recalque na torre B')).toBeTruthy();
        expect(screen.getByText('Queda de altura na fachada')).toBeTruthy();
        expect(screen.queryByText('Atraso de aprovação na prefeitura')).toBeNull();
    });

    it('"Todas as organizações" carrega: o serviço recebe null (REGRA #5)', async () => {
        useStore.setState({ activeOrganizationId: null });
        montar();
        await waitFor(() => expect(listarRiscos).toHaveBeenCalledWith(null));
    });

    it('ficha nova: salvar sem os obrigatórios mostra erro por campo e foca o primeiro (CA03)', async () => {
        const user = userEvent.setup();
        montar();
        await waitFor(() => expect(listarRiscos).toHaveBeenCalled());
        await user.click(screen.getByRole('button', { name: /Novo risco/ }));
        expect(await screen.findByRole('heading', { name: 'Novo risco' })).toBeTruthy();
        // Dono sugerido = eu; o convite sem conta não é opção.
        const dono = screen.getByLabelText('Dono do risco') as HTMLSelectElement;
        expect(dono.value).toBe('u1');
        expect(within(dono).queryByText('Convite sem conta')).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Registrar risco' }));
        expect(screen.getByText('Dê um título curto ao risco.')).toBeTruthy();
        expect(screen.getByText('Descreva a causa: o que pode provocar o evento.')).toBeTruthy();
        expect(screen.getByText('Escolha a obra.')).toBeTruthy();
        expect(screen.getByText('Informe a data da próxima revisão.')).toBeTruthy();
        await waitFor(() => expect(document.activeElement?.id).toBe('rf-titulo'));
        expect(criarRisco).not.toHaveBeenCalled();
    });

    it('sem canEditRisks: o motivo aparece e "Novo risco" fica desligado', async () => {
        montar(false);
        await waitFor(() => expect(listarRiscos).toHaveBeenCalled());
        expect(screen.getAllByText(/Você pode consultar os riscos, mas não editar/).length).toBeGreaterThan(0);
        expect((screen.getByRole('button', { name: /Novo risco/ }) as HTMLButtonElement).disabled).toBe(true);
    });
    it('ficha existente: prévia da avaliação usa o MÁXIMO das dimensões; eficácia sem evidência fica desligada com o motivo', async () => {
        const user = userEvent.setup();
        localStorage.setItem('riscos:aba', JSON.stringify('registro'));
        montar();
        await user.click(await screen.findByText('Recalque na torre B'));
        expect(await screen.findByRole('heading', { name: 'RSC-0001 · Recalque na torre B' })).toBeTruthy();
        const painel = within(screen.getByRole('dialog'));

        await user.click(painel.getByRole('tab', { name: /Avaliações/ }));
        expect(screen.getByText(/Avaliação é histórico/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: /Nova avaliação/ }));
        await user.selectOptions(screen.getByLabelText('Probabilidade'), '3');
        await user.selectOptions(screen.getByLabelText('Acrescentar dimensão'), 'financeira');
        await user.selectOptions(screen.getByLabelText('Financeira'), '4');
        await user.selectOptions(screen.getByLabelText('Acrescentar dimensão'), 'prazo');
        await user.selectOptions(screen.getByLabelText('Prazo'), '2');
        expect(screen.getByText('3 × 4 = 12')).toBeTruthy();

        await user.click(painel.getByRole('tab', { name: /Ações/ }));
        await user.click(screen.getByRole('button', { name: /Nova ação/ }));
        expect((screen.getByRole('radio', { name: 'Eficaz' }) as HTMLInputElement).disabled).toBe(true);
        expect(screen.getAllByText(/Para marcar eficaz ou ineficaz, registre a evidência/).length).toBeGreaterThan(0);

        await user.click(painel.getByRole('tab', { name: /Histórico/ }));
        expect(await screen.findByText('Nenhum evento ainda')).toBeTruthy();
    });

    it('as abas Matriz, Ações e Catálogo renderizam', async () => {
        const user = userEvent.setup();
        montar();
        await waitFor(() => expect(listarRiscos).toHaveBeenCalled());
        await user.click(screen.getByRole('tab', { name: 'Matriz' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Matriz de riscos' })).toBeTruthy();
        expect(screen.getByText(/1 de 3 ativos têm avaliação inerente|2 de 3 ativos têm avaliação inerente/)).toBeTruthy();
        await user.click(screen.getByRole('tab', { name: 'Ações' }));
        expect(await screen.findByText('Nenhuma ação de tratamento')).toBeTruthy();
        await user.click(screen.getByRole('tab', { name: 'Catálogo' }));
        expect(await screen.findByRole('button', { name: /Novo risco próprio/ })).toBeTruthy();
    });
});

