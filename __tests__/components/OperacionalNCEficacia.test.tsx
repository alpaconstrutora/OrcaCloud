// @vitest-environment jsdom
/**
 * Qualidade SiAC, fase 2 — Task 6: não conformidade com causa, ação corretiva e eficácia
 * (`OperacionalNC`) — docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md, Task 6.
 * Banco e serviços simulados: aqui se prova o que a TELA faz com o que eles devolvem.
 *
 *  (a) "Encerrar NC" abre o painel: sem causa ou sem ação corretiva o botão fica desligado com
 *      o motivo e `encerrarNC` não é chamado;
 *  (b) com as duas, chama `encerrarNC` com os valores; com foto, sobe pelo mesmo upload do
 *      checklist e passa o id da evidência;
 *  (c) "Verificar eficácia": não eficaz pede motivo → `registrarEficacia(id, false, motivo)` e a
 *      NC volta a "Aberta"; eficaz → `registrarEficacia(id, true)`;
 *  (d) "Histórico" lista `listarHistoricoNC`;
 *  (e) decisão 1 do controlador: a criação passa pelo serviço e leva a causa (opcional).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── banco simulado (só a leitura da lista e o "Iniciar tratamento") ─────────────
let ncs: Array<Record<string, unknown>> = [];

function consulta(tabela: string) {
    const q: Record<string, unknown> = {};
    const encadeia = () => q;
    Object.assign(q, {
        select: encadeia, order: encadeia, eq: encadeia, single: encadeia,
        update: encadeia, insert: encadeia,
        then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) =>
            Promise.resolve({ data: tabela === 'non_conformances' ? ncs.map(n => ({ ...n })) : null, error: null }).then(ok, falha),
    });
    return q;
}

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: (t: string) => consulta(t),
        rpc: vi.fn(async () => ({ data: null, error: null })),
        storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
    },
}));

// ── serviços simulados ───────────────────────────────────────────────────────
const createNonConformance = vi.fn();
const encerrarNC = vi.fn();
const registrarEficacia = vi.fn();
const listarHistoricoNC = vi.fn();
const enviarFotoEvidencia = vi.fn();
vi.mock('../../services/workOrderService', () => ({
    workOrderService: {
        createNonConformance: (...a: unknown[]) => createNonConformance(...a),
        encerrarNC: (...a: unknown[]) => encerrarNC(...a),
        registrarEficacia: (...a: unknown[]) => registrarEficacia(...a),
        listarHistoricoNC: (...a: unknown[]) => listarHistoricoNC(...a),
        enviarFotoEvidencia: (...a: unknown[]) => enviarFotoEvidencia(...a),
    },
}));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import OperacionalNC from '../../components/OperacionalNC';

const nc = (p: Record<string, unknown>) => ({
    id: 'nc-1', description: 'Reboco com fissura', severity: 'moderate', status: 'open', due_date: null,
    corrective_action: null, causa: null, eficacia: null, eficacia_em: null, eficacia_motivo: null, resolution_evidence_id: null,
    created_at: '2026-11-20T10:00:00Z', closed_at: null, oe_checklist_responses: [], ...p,
});

const montar = () => render(<ConfirmProvider><OperacionalNC workOrderId="wo-1" /></ConfirmProvider>);
const motivo = (el: HTMLElement) => el.closest('[title]')?.getAttribute('title') ?? '';
const abrirCard = async (descricao = 'Reboco com fissura') => {
    await userEvent.click(await screen.findByText(descricao));
};
const painel = () => screen.getByRole('dialog');

beforeEach(() => {
    vi.clearAllMocks();
    ncs = [nc({})];
    createNonConformance.mockResolvedValue({ id: 'nc-nova' });
    encerrarNC.mockResolvedValue(undefined);
    registrarEficacia.mockResolvedValue(undefined);
    listarHistoricoNC.mockResolvedValue([]);
    enviarFotoEvidencia.mockResolvedValue('ev-1');
    useStore.setState({
        organizations: [
            { id: 'org-spe', name: 'SPE Garden', address: {}, members: [{ id: 'm1', email: 'ana@spe.com', role: 'member', userId: 'u-1', name: 'Ana', permissions: {} }] },
        ] as never,
    });
});

describe('OperacionalNC — causa, ação corretiva e eficácia (fase 2)', () => {
    it('(a) encerrar sem causa ou sem ação corretiva não chama encerrarNC (botão desligado com o motivo)', async () => {
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Encerrar NC' }));

        const sheet = painel();
        const encerrar = within(sheet).getByRole('button', { name: 'Encerrar' });
        expect((encerrar as HTMLButtonElement).disabled).toBe(true);
        expect(motivo(encerrar)).toMatch(/causa/i);
        await userEvent.click(encerrar);

        await userEvent.type(within(sheet).getByLabelText(/^Causa/), 'Traço errado');
        expect((encerrar as HTMLButtonElement).disabled).toBe(true);
        expect(motivo(encerrar)).toMatch(/ação corretiva/i);
        await userEvent.click(encerrar);

        expect(encerrarNC).not.toHaveBeenCalled();
    });

    it('(b) com causa e ação corretiva chama encerrarNC com os valores (sem foto, sem evidência)', async () => {
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Encerrar NC' }));
        const sheet = painel();
        await userEvent.type(within(sheet).getByLabelText(/^Causa/), 'Traço errado');
        await userEvent.type(within(sheet).getByLabelText(/^Ação corretiva/), 'Refazer o reboco');
        await userEvent.click(within(sheet).getByRole('button', { name: 'Encerrar' }));

        await waitFor(() => expect(encerrarNC).toHaveBeenCalledTimes(1));
        expect(encerrarNC.mock.calls[0][0]).toBe('nc-1');
        expect(encerrarNC.mock.calls[0][1]).toEqual({ causa: 'Traço errado', acaoCorretiva: 'Refazer o reboco' });
        expect(enviarFotoEvidencia).not.toHaveBeenCalled();
    });

    it('(b) com foto da correção: sobe pelo upload do checklist e passa o id da evidência', async () => {
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Encerrar NC' }));
        const sheet = painel();
        await userEvent.type(within(sheet).getByLabelText(/^Causa/), 'Traço errado');
        await userEvent.type(within(sheet).getByLabelText(/^Ação corretiva/), 'Refazer o reboco');
        const foto = new File(['x'], 'correcao.jpg', { type: 'image/jpeg' });
        await userEvent.upload(within(sheet).getByLabelText(/^Foto da correção/), foto);
        await userEvent.click(within(sheet).getByRole('button', { name: 'Encerrar' }));

        await waitFor(() => expect(encerrarNC).toHaveBeenCalledTimes(1));
        expect(enviarFotoEvidencia).toHaveBeenCalledWith(expect.objectContaining({
            workOrderId: 'wo-1', file: foto,
        }));
        // REGRA #5: a pasta da foto é a da organização DA OE, que o service lê da OE — a tela não manda
        // a org que recebeu (a do topo).
        expect(enviarFotoEvidencia.mock.calls[0][0]).not.toHaveProperty('orgId');
        expect(encerrarNC).toHaveBeenCalledWith('nc-1', { causa: 'Traço errado', acaoCorretiva: 'Refazer o reboco', evidenciaId: 'ev-1' });
    });

    it('(c) não eficaz pede motivo → registrarEficacia(id, false, motivo) e a NC volta a "Aberta"', async () => {
        ncs = [nc({ status: 'closed', causa: 'Traço errado', corrective_action: 'Refazer', eficacia: 'pendente', closed_at: '2026-11-25T10:00:00Z' })];
        registrarEficacia.mockImplementation(async () => {
            ncs = [nc({ status: 'open', causa: 'Traço errado', corrective_action: 'Refazer', eficacia: 'nao_eficaz', eficacia_motivo: 'Fissura voltou', closed_at: null })];
        });
        montar();
        await abrirCard();
        expect(screen.getAllByText('Encerrada').length).toBeGreaterThan(0);
        await userEvent.click(screen.getByRole('button', { name: 'Verificar eficácia' }));

        const sheet = painel();
        const naoEficaz = within(sheet).getByRole('button', { name: 'Não eficaz' });
        expect((naoEficaz as HTMLButtonElement).disabled).toBe(true);
        expect(motivo(naoEficaz)).toMatch(/motivo/i);
        await userEvent.click(naoEficaz);
        expect(registrarEficacia).not.toHaveBeenCalled();

        await userEvent.type(within(sheet).getByLabelText(/^Motivo/), 'Fissura voltou');
        await userEvent.click(naoEficaz);

        await waitFor(() => expect(registrarEficacia).toHaveBeenCalledWith('nc-1', false, 'Fissura voltou'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const card = screen.getByText('Reboco com fissura').closest('[data-nc]') as HTMLElement;
        await waitFor(() => expect(within(card).getByText('Aberta')).toBeTruthy());
        expect(within(card).queryByText('Encerrada')).toBeNull();
        expect(within(card).getByText('Motivo: Fissura voltou')).toBeTruthy();
        // a descrição da NC não é reescrita com o motivo
        expect(within(card).getByText('Reboco com fissura')).toBeTruthy();
    });

    it('(c) eficaz → registrarEficacia(id, true)', async () => {
        ncs = [nc({ status: 'closed', causa: 'Traço errado', corrective_action: 'Refazer', eficacia: 'pendente', closed_at: '2026-11-25T10:00:00Z' })];
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Verificar eficácia' }));
        await userEvent.click(within(painel()).getByRole('button', { name: 'Eficaz' }));
        await waitFor(() => expect(registrarEficacia).toHaveBeenCalledWith('nc-1', true));
    });

    it('(d) "Histórico" lista as mudanças da NC (listarHistoricoNC)', async () => {
        listarHistoricoNC.mockResolvedValue([
            { id: 'h1', nc_id: 'nc-1', work_order_id: 'wo-1', status: 'closed', causa: 'Traço errado', corrective_action: 'Refazer', eficacia: 'pendente', eficacia_motivo: null, description: 'Reboco com fissura', evento: 'alteracao', alterado_por: 'u-1', created_at: '2026-11-25T10:00:00Z' },
            { id: 'h2', nc_id: 'nc-1', work_order_id: 'wo-1', status: 'open', causa: 'Traço errado', corrective_action: 'Refazer', eficacia: 'nao_eficaz', eficacia_motivo: 'Fissura voltou', description: 'Reboco com fissura', evento: 'alteracao', alterado_por: 'u-1', created_at: '2026-11-26T10:00:00Z' },
            { id: 'h3', nc_id: 'nc-1', work_order_id: 'wo-1', status: 'open', causa: 'Traço errado', corrective_action: 'Refazer', eficacia: 'nao_eficaz', eficacia_motivo: 'Fissura voltou', description: 'Reboco com fissura na fachada', evento: 'alteracao', alterado_por: 'u-1', created_at: '2026-11-26T11:00:00Z' },
        ]);
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Histórico' }));

        expect(listarHistoricoNC).toHaveBeenCalledWith('nc-1');
        const sheet = painel();
        expect((await within(sheet).findAllByText(/Eficácia: não eficaz/)).length).toBe(2);
        expect(within(sheet).getAllByText(/Causa: Traço errado/).length).toBe(3);
        expect(within(sheet).getAllByText('Motivo: Fissura voltou').length).toBe(2);
        // a descrição só aparece na linha em que mudou
        expect(within(sheet).getAllByText(/^Descrição:/).length).toBe(1);
        expect(within(sheet).getByText('Descrição: Reboco com fissura na fachada')).toBeTruthy();
        expect(within(sheet).getAllByText(/Ana/).length).toBeGreaterThan(0);
    });

    it('(f) X e "Cancelar" do encerrar com texto digitado pedem confirmação antes de descartar', async () => {
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Encerrar NC' }));
        await userEvent.type(within(painel()).getByLabelText(/^Causa/), 'Traço errado');

        await userEvent.click(within(painel()).getByRole('button', { name: 'Fechar painel' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Continuar editando' }));
        expect((within(painel()).getByLabelText(/^Causa/) as HTMLTextAreaElement).value).toBe('Traço errado');

        await userEvent.click(within(painel()).getByRole('button', { name: 'Cancelar' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Sair e descartar' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(encerrarNC).not.toHaveBeenCalled();
    });

    it('(f) encerrar sem nada digitado fecha direto, sem pergunta', async () => {
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Encerrar NC' }));
        await userEvent.click(within(painel()).getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.queryByRole('button', { name: 'Sair e descartar' })).toBeNull();
    });

    it('(f) eficácia: X com motivo digitado pergunta; "Eficaz" com motivo digitado pergunta antes de descartá-lo', async () => {
        ncs = [nc({ status: 'closed', causa: 'Traço errado', corrective_action: 'Refazer', eficacia: 'pendente', closed_at: '2026-11-25T10:00:00Z' })];
        montar();
        await abrirCard();
        await userEvent.click(screen.getByRole('button', { name: 'Verificar eficácia' }));
        await userEvent.type(within(painel()).getByLabelText(/^Motivo/), 'Fissura voltou');

        await userEvent.click(within(painel()).getByRole('button', { name: 'Fechar painel' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Continuar editando' }));
        expect(screen.getByRole('dialog')).toBeTruthy();

        await userEvent.click(within(painel()).getByRole('button', { name: 'Eficaz' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Voltar' }));
        expect(registrarEficacia).not.toHaveBeenCalled();

        await userEvent.click(within(painel()).getByRole('button', { name: 'Eficaz' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Registrar eficaz' }));
        await waitFor(() => expect(registrarEficacia).toHaveBeenCalledWith('nc-1', true));
    });

    it('(e) criar passa pelo serviço e leva a causa opcional', async () => {
        ncs = [];
        montar();
        await userEvent.click(await screen.findByRole('button', { name: /Registrar NC/ }));
        await userEvent.type(screen.getByLabelText(/^Descrição/), 'Prumo fora');
        await userEvent.type(screen.getByLabelText(/^Causa/), 'Gabarito torto');
        await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

        await waitFor(() => expect(createNonConformance).toHaveBeenCalledTimes(1));
        expect(createNonConformance.mock.calls[0][0]).toMatchObject({
            workOrderId: 'wo-1', description: 'Prumo fora', severity: 'minor', causa: 'Gabarito torto',
        });
    });
});
