// @vitest-environment jsdom
/**
 * Negociação › Dados do contrato (25/11/2026): o CTL-006 mostrava "Fim da Vigência
 * 22/03/2019" logo abaixo de "Vigência até 22/09/2021". Num contrato renovado os
 * campos da negociação são o período ORIGINAL (a divergência é legítima); a linha
 * de situação avisa o pai, que troca os rótulos para "… original" e explica.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const cadeia = vi.fn();
const aditivos = vi.fn();
vi.mock('../../services/contractRenewalService', () => ({ contractRenewalService: { getRenewalChain: (...a: unknown[]) => cadeia(...a) } }));
vi.mock('../../services/contractService', () => ({ contractService: { listAddendums: (...a: unknown[]) => aditivos(...a) } }));

import SituacaoDaVigencia from '../../components/rentals/SituacaoDaVigencia';
import type { Contract } from '../../types';

const CTL = { id: 'c1', number: 'CTL-006-012-0001', end_date: '2021-09-22', reajuste_proximo: '2020-11-05' } as unknown as Contract;

describe('SituacaoDaVigencia → onSituacao', () => {
    it('renovado por aditivo: avisa com o fim atual e o aditivo', async () => {
        cadeia.mockResolvedValue([CTL]);
        aditivos.mockResolvedValue([{ id: 'ad4', number: 'AD-004', status: 'Aprovado', new_start_date: '2020-03-23' }]);
        const onSituacao = vi.fn();
        render(<SituacaoDaVigencia contract={CTL} onSituacao={onSituacao} />);
        await waitFor(() => expect(onSituacao).toHaveBeenCalledWith({ renovado: true, fimAtual: '2021-09-22', por: 'AD-004' }));
    });

    it('nunca renovado (ou só com aditivo cancelado): renovado = false', async () => {
        cadeia.mockResolvedValue([CTL]);
        aditivos.mockResolvedValue([{ id: 'ad1', number: 'AD-001', status: 'Cancelado', new_start_date: '2019-03-23' }]);
        const onSituacao = vi.fn();
        render(<SituacaoDaVigencia contract={CTL} onSituacao={onSituacao} />);
        await waitFor(() => expect(onSituacao).toHaveBeenCalledWith(expect.objectContaining({ renovado: false })));
    });

    it('renovado por contrato novo: avisa com o contrato vigente', async () => {
        const filho = { id: 'c2', number: 'CTL-006-012-0002', end_date: '2023-09-22' } as unknown as Contract;
        cadeia.mockResolvedValue([CTL, filho]);
        aditivos.mockResolvedValue([]);
        const onSituacao = vi.fn();
        render(<SituacaoDaVigencia contract={CTL} onSituacao={onSituacao} />);
        await waitFor(() => expect(onSituacao).toHaveBeenCalledWith({ renovado: true, fimAtual: '2023-09-22', por: 'CTL-006-012-0002' }));
    });
});

describe('DealModal usa o aviso nos campos de vigência', () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, '../../components/DealModal.tsx'), 'utf8');
    it('rótulos "original" e a explicação dependem do contrato renovado', () => {
        expect(fonte).toContain("renovacaoDoContrato?.renovado ? 'Início da Vigência original' : 'Início da Vigência'");
        expect(fonte).toContain("renovacaoDoContrato?.renovado ? 'Fim da Vigência original' : 'Fim da Vigência'");
        expect(fonte).toMatch(/Período original desta negociação/);
        expect(fonte).toContain('onSituacao={setRenovacaoDoContrato}');
    });
});
