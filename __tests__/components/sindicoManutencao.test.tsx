// @vitest-environment jsdom
/**
 * Portal do Síndico › Manutenção e Equipamentos (G4, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * O que fica travado:
 *  1. OS concluída não conclui nem edita de novo — o botão diz por quê;
 *  2. concluir manda a data e avisa o próximo vencimento que o BANCO recalculou;
 *  3. equipamento: modelo sem marca diz o que falta; com OS no histórico não remove;
 *  4. sem login, nada grava — o motivo é o do Financeiro.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getManutencao: vi.fn(), salvarOs: vi.fn(), concluirOs: vi.fn(), cancelarOs: vi.fn(),
    salvarItemDoPlano: vi.fn(), removerItemDoPlano: vi.fn(), salvarEquipamento: vi.fn(), removerEquipamento: vi.fn(),
}));
vi.mock('../../services/sindicoPortalService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/sindicoPortalService')>()),
    sindicoPortalService: svc,
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import PainelManutencaoDoSindico from '../../components/sindico/PainelManutencaoDoSindico';
import PainelEquipamentosDoSindico from '../../components/sindico/PainelEquipamentosDoSindico';
import { MOTIVO_SEM_LOGIN } from '../../utils/financeiroDoSindico';
import { MOTIVO_OS_FECHADA, type ManutencaoDoPredio, type OrdemDeServico } from '../../utils/manutencaoDoSindico';
import type { CondominioDoSindico } from '../../services/sindicoPortalService';

const CONDOMINIOS = [{ id: 'c1', codigo: '010', nome: '010 - Galeria Altavista', cnpj: null, razaoSocial: null, cidade: null, mandatoInicio: null, mandatoFim: null }] as CondominioDoSindico[];

const os = (p: Partial<OrdemDeServico> = {}): OrdemDeServico => ({
    id: 'o1', codigo: null, tipo: 'PREVENTIVA', prioridade: 'NORMAL', status: 'AGENDADA', descricao: 'Recarga dos extintores',
    sistemaId: 's1', sistema: 'Incêndio', itemId: 'i1', ativoId: null, ativo: null, previsto: '2026-12-10', executado: null,
    custo: null, fornecedorId: null, fornecedor: null, achados: null, ...p,
});

const DADOS: ManutencaoDoPredio = {
    sistemas: [{ id: 's1', nome: 'Incêndio' }],
    plano: { id: 'p1', nome: 'Plano de Manutenção — 010', desde: '2026-10-01' },
    itens: [{ id: 'i1', descricao: 'Recarga dos extintores', sistemaId: 's1', sistema: 'Incêndio', periodicidadeValor: 6,
        periodicidadeUnidade: 'MES', responsavel: 'EMPRESA_ESPECIALIZADA', proximo: '2026-12-15', ultimaExecucao: null }],
    ordens: [os(), os({ id: 'o2', descricao: 'Troca do portão', status: 'CONCLUIDA', executado: '2026-11-01', itemId: null })],
    ativos: [{ id: 'a1', codigo: 'OPR-PRE-0001', nome: 'Bomba de recalque', sistemaId: null, sistema: null, marca: 'Schneider', modelo: 'BC-92',
        serie: null, local: 'Subsolo', compra: null, garantiaAte: null, obs: null, ordens: 2 }],
    marcas: ['Schneider'], podeOperar: true, motivoNaoOpera: null,
};

const montar = (el: React.ReactElement) => render(<ConfirmProvider>{el}</ConfirmProvider>);

beforeEach(() => { Object.values(svc).forEach(f => f.mockReset()); svc.getManutencao.mockResolvedValue(DADOS); });

describe('Manutenção', () => {
    it('1. OS concluída não conclui nem edita de novo, e o botão diz por quê', async () => {
        montar(<PainelManutencaoDoSindico identidade={{ token: 't' }} condominios={CONDOMINIOS} logado notify={vi.fn()} />);
        await screen.findByText('Troca do portão');
        const concluir = screen.getAllByRole('button', { name: 'Concluir' }) as HTMLButtonElement[];
        expect(concluir[0].disabled).toBe(false);
        expect(concluir[1].disabled).toBe(true);
        const editar = screen.getAllByRole('button', { name: 'Editar' }) as HTMLButtonElement[];
        expect(editar[1].parentElement?.getAttribute('title')).toBe(MOTIVO_OS_FECHADA);
    });

    it('2. concluir manda a data e avisa o próximo vencimento recalculado no banco', async () => {
        svc.concluirOs.mockResolvedValue({ proximoDoPlano: '2027-06-10' });
        const notify = vi.fn();
        montar(<PainelManutencaoDoSindico identidade={{ token: 't' }} condominios={CONDOMINIOS} logado notify={notify} />);
        await screen.findByText('Troca do portão');
        fireEvent.click(screen.getAllByRole('button', { name: 'Concluir' })[0]);
        fireEvent.change(await screen.findByLabelText('Executada em *'), { target: { value: '2026-11-20' } });
        fireEvent.change(screen.getByLabelText('O que foi feito / encontrado'), { target: { value: 'Lacres trocados' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Concluir' }).at(-1)!);
        await waitFor(() => expect(svc.concluirOs).toHaveBeenCalledWith({ token: 't' }, 'c1', 'o1', '2026-11-20', null, 'Lacres trocados'));
        expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Ordem concluída\. Próximo vencimento no plano: /));
    });

    it('4. sem login nada grava — o motivo é o do Financeiro', async () => {
        montar(<PainelManutencaoDoSindico identidade={{ token: 't' }} condominios={CONDOMINIOS} logado={false} notify={vi.fn()} />);
        await screen.findByText('Troca do portão');
        const nova = screen.getByRole('button', { name: /Nova ordem/ }) as HTMLButtonElement;
        expect(nova.disabled).toBe(true);
        expect(nova.parentElement?.getAttribute('title')).toBe(MOTIVO_SEM_LOGIN);
    });
});

describe('Equipamentos', () => {
    it('3. modelo sem marca diz o que falta; com OS no histórico não remove', async () => {
        svc.salvarEquipamento.mockResolvedValue({ id: 'a2', codigo: 'OPR-PRE-0002' });
        const notify = vi.fn();
        montar(<PainelEquipamentosDoSindico identidade={{ token: 't' }} condominios={CONDOMINIOS} logado notify={notify} />);
        await screen.findByText('Bomba de recalque');
        const remover = screen.getByRole('button', { name: 'Remover' }) as HTMLButtonElement;
        expect(remover.disabled).toBe(true);
        expect(remover.parentElement?.getAttribute('title')).toMatch(/tem ordens de serviço no histórico/);

        fireEvent.click(screen.getByRole('button', { name: /Novo equipamento/ }));
        fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Portão da garagem' } });
        fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'PPA Jet' } });
        const cadastrar = screen.getByRole('button', { name: 'Cadastrar' }) as HTMLButtonElement;
        expect(cadastrar.parentElement?.getAttribute('title')).toBe('Informe a marca do modelo.');
        fireEvent.change(screen.getByLabelText('Marca'), { target: { value: 'PPA' } });
        fireEvent.click(cadastrar);
        await waitFor(() => expect(svc.salvarEquipamento).toHaveBeenCalledWith({ token: 't' }, 'c1', null,
            expect.objectContaining({ nome: 'Portão da garagem', marca: 'PPA', modelo: 'PPA Jet' })));
        expect(notify).toHaveBeenCalledWith('Equipamento cadastrado (OPR-PRE-0002).');
    });
});
