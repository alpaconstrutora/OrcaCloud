import { describe, it, expect, vi, beforeEach } from 'vitest';

// RH › Colaboradores › Disponibilizar Colaborador (employee_org_shares).
// Desde a migration aplicar_20271118911000 o destino tem de ser org de quem grava. A tela devolve
// também os destinos que OUTRA pessoa criou para orgs de que o usuário não é membro (ele não vê a
// caixa deles). O serviço apagava tudo e reinseria a lista: o reinsert desses seria recusado com o
// DELETE já feito, e o colaborador perderia todas as disponibilizações. Agora grava a diferença.

const COLAB = 'e1';

vi.mock('../lib/supabase', () => {
    const chamadas: { op: string; args: unknown[] }[] = [];
    const estado = { atuais: [] as { target_org_id: string }[] };
    const from = vi.fn((tabela: string) => {
        const b: any = {};
        let op = 'select';
        b.select = vi.fn(() => { op = 'select'; return b; });
        b.delete = vi.fn(() => { op = 'delete'; chamadas.push({ op: 'delete', args: [tabela] }); return b; });
        b.insert = vi.fn((rows: unknown) => { chamadas.push({ op: 'insert', args: [tabela, rows] }); return Promise.resolve({ error: null }); });
        b.eq = vi.fn((col: string, val: unknown) => { chamadas.push({ op: `${op}.eq`, args: [col, val] }); return b; });
        b.in = vi.fn((col: string, vals: unknown) => { chamadas.push({ op: `${op}.in`, args: [col, vals] }); return b; });
        b.then = (ok: (r: unknown) => unknown) =>
            Promise.resolve(op === 'select' ? { data: estado.atuais, error: null } : { error: null }).then(ok);
        return b;
    });
    return { supabase: { from, rpc: vi.fn() }, __mocks: { chamadas, estado } };
});

import { laborService } from '../services/laborService';
import * as supabaseModule from '../lib/supabase';

const { chamadas, estado } = (supabaseModule as any).__mocks as {
    chamadas: { op: string; args: unknown[] }[];
    estado: { atuais: { target_org_id: string }[] };
};
const ops = () => chamadas.map(c => c.op);

describe('laborService.setEmployeeShares grava só a diferença', () => {
    beforeEach(() => {
        chamadas.length = 0;
        estado.atuais = [];
    });

    it('destino que outra pessoa criou (org de que eu não sou membro) fica intocado; só o novo é inserido', async () => {
        estado.atuais = [{ target_org_id: 'org-alheia' }, { target_org_id: 'org-c' }];
        await laborService.setEmployeeShares(COLAB, ['org-alheia', 'org-c', 'org-d'], 'ana@exemplo.com');
        expect(ops()).not.toContain('delete');
        const ins = chamadas.filter(c => c.op === 'insert');
        expect(ins).toHaveLength(1);
        expect(ins[0].args[1]).toEqual([{ employee_id: COLAB, target_org_id: 'org-d', granted_by: 'ana@exemplo.com' }]);
    });

    it('desmarcar uma org apaga só ela, filtrando pelo colaborador e pelo destino', async () => {
        estado.atuais = [{ target_org_id: 'org-alheia' }, { target_org_id: 'org-c' }];
        await laborService.setEmployeeShares(COLAB, ['org-alheia']);
        expect(ops()).toContain('delete');
        expect(chamadas).toContainEqual({ op: 'delete.eq', args: ['employee_id', COLAB] });
        expect(chamadas).toContainEqual({ op: 'delete.in', args: ['target_org_id', ['org-c']] });
        expect(ops()).not.toContain('insert');
    });

    it('nada mudou: não apaga nem insere', async () => {
        estado.atuais = [{ target_org_id: 'org-c' }];
        await laborService.setEmployeeShares(COLAB, ['org-c']);
        expect(ops()).not.toContain('delete');
        expect(ops()).not.toContain('insert');
    });
});
