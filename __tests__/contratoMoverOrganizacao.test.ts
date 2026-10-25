/**
 * Mover contrato de organização (25/10/2026 —
 * docs/planos/2026-10-25-contrato-mover-organizacao.md, itens 3 e 4).
 *
 * A regra mora no banco (RPCs `previa_mover_contrato_organizacao` e
 * `mover_contrato_organizacao`, testadas no remoto numa transação desfeita).
 * Aqui trava o que o front faz com ela: o service chama a RPC com os
 * parâmetros certos e devolve a mensagem do banco, e o botão "Mover contrato"
 * desligado sempre diz por quê.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas: Array<{ fn: string; args: unknown }> = [];
let resposta: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: async (fn: string, args: unknown) => {
            chamadas.push({ fn, args });
            return resposta;
        },
    },
}));

import { contractService, type PreviaMoverContratoOrganizacao } from '../services/contractService';
import { motivoParaNaoMover } from '../components/MoverContratoOrganizacaoModal';

const previa = (impedimentos: string[] = []): PreviaMoverContratoOrganizacao => ({
    numero: 'CTS-010-036-0002', organizacao_atual: 'org-a',
    titulos: 73, titulos_pagos: 45, titulos_conciliados: 45, recibos_ficam: 1,
    processos: 38, documentos: 1, impedimentos,
});

beforeEach(() => {
    chamadas.length = 0;
    resposta = { data: null, error: null };
});

describe('contractService — mover de organização', () => {
    it('prévia chama a RPC com contrato e destino', async () => {
        resposta = { data: previa(), error: null };
        const p = await contractService.previaMoverOrganizacao('c1', 'org-b');
        expect(chamadas).toEqual([{ fn: 'previa_mover_contrato_organizacao', args: { p_contract_id: 'c1', p_org_destino: 'org-b' } }]);
        expect(p.titulos).toBe(73);
    });

    it('mover manda centro de custo e plano de contas; vazio vira null', async () => {
        await contractService.moverParaOrganizacao('c1', 'org-b', 'cc-1', '');
        expect(chamadas).toEqual([{
            fn: 'mover_contrato_organizacao',
            args: { p_contract_id: 'c1', p_org_destino: 'org-b', p_cost_center_id: 'cc-1', p_plano_de_contas_id: null },
        }]);
    });

    it('a recusa do banco chega com a mensagem dele', async () => {
        resposta = { data: null, error: { message: 'Competência 03/2026 já fechada em Contas a Pagar.' } };
        await expect(contractService.moverParaOrganizacao('c1', 'org-b', null, null))
            .rejects.toThrow('Competência 03/2026 já fechada em Contas a Pagar.');
    });
});

describe('motivoParaNaoMover — botão desligado sempre diz por quê', () => {
    const base = { destino: 'org-b', carregandoPrevia: false, previa: previa(), movendo: false };

    it('pode mover com destino e prévia sem impedimento', () => {
        expect(motivoParaNaoMover(base)).toBeNull();
    });

    it('sem destino', () => {
        expect(motivoParaNaoMover({ ...base, destino: '' })).toBe('Escolha a organização de destino.');
    });

    it('enquanto a prévia carrega', () => {
        expect(motivoParaNaoMover({ ...base, carregandoPrevia: true })).toBe('Conferindo o que vai junto…');
        expect(motivoParaNaoMover({ ...base, previa: null })).toBe('Conferindo o que vai junto…');
    });

    it('o impedimento do banco vira o motivo', () => {
        const msg = 'A organização de destino já tem um contrato com o número CTS-010-036-0002.';
        expect(motivoParaNaoMover({ ...base, previa: previa([msg]) })).toBe(msg);
    });

    it('conciliado NÃO impede (escolha do usuário: mover sempre, levando tudo)', () => {
        expect(motivoParaNaoMover({ ...base, previa: { ...previa(), titulos_conciliados: 45 } })).toBeNull();
    });
});
