/**
 * Espelho de vendas × "Vendável" do empreendimento (plano docs/planos/2026-11-19-espelho-vendavel-vgv.md).
 * Com estudo vinculado, só conta no VGV a unidade do espelho do estudo ligada a uma unidade VENDÁVEL do
 * empreendimento; não vendável (garagem, área comum) e sem unidade no empreendimento ficam fora, marcadas.
 */
import { describe, it, expect } from 'vitest';
import { marcarEspelhoDoEmpreendimento } from '../utils/imovibEstrutura';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy } from './fixtures/imovibEstudos';

const inst = (id: string, block_id: string, price: number, over: Record<string, unknown> = {}) => ({
    id, study_id: 'estudo-teste', block_id, name: id, floor: 1, private_area: 70, position_type: 'FRENTE' as const,
    sun_orientation: 'NORTE' as const, price, status: 'DISPONÍVEL' as const, created_at: '', updated_at: '', ...over,
});
const un = (id: string, imovib_instance_id: string | null, is_vendavel: boolean | null = true) => ({ id, imovib_instance_id, is_vendavel });

describe('marcarEspelhoDoEmpreendimento', () => {
    it('ligada a vendável: sem marca; a não vendável: nao_vendavel; sem unidade: sem_unidade', () => {
        const r = marcarEspelhoDoEmpreendimento(
            [inst('i1', 'b1', 100), inst('i2', 'b1', 100), inst('i3', 'b1', 100)],
            [un('u1', 'i1'), un('u2', 'i2', false)],
        );
        expect(r.map(i => i.fora_do_vgv)).toEqual([undefined, 'nao_vendavel', 'sem_unidade']);
    });

    it('vendável nulo conta como vendável (padrão do banco)', () => {
        expect(marcarEspelhoDoEmpreendimento([inst('i1', 'b1', 100)], [un('u1', 'i1', null)])[0].fora_do_vgv).toBeUndefined();
    });

    it('instância apontada por duas unidades, uma vendável: conta', () => {
        const r = marcarEspelhoDoEmpreendimento([inst('i1', 'b1', 100)], [un('u1', 'i1', false), un('u2', 'i1', true)]);
        expect(r[0].fora_do_vgv).toBeUndefined();
    });
});

describe('motor — instância fora do VGV', () => {
    it('Garden-like: 43 ligadas contam, 12 sem unidade ficam fora', () => {
        const ligadas = Array.from({ length: 43 }, (_, k) => inst(`l${k}`, 'b1', 1_000));
        const sobras = Array.from({ length: 12 }, (_, k) => inst(`s${k}`, 'b1', 500_000, { fora_do_vgv: 'sem_unidade' }));
        const m = computeImovibMath(baseStudy({ unit_instances: [...ligadas, ...sobras] }));
        expect(m.vgvPorBloco.b1).toEqual({ vgv: 43_000, fonte: 'espelho' });
    });

    it('torre só de não vendáveis: VGV 0 e sem aviso falso de "sem preço" para ela', () => {
        const garagens = Array.from({ length: 5 }, (_, k) => inst(`g${k}`, 'b2', 30_000, { fora_do_vgv: 'nao_vendavel' }));
        const estudo = baseStudy({
            blocks: [
                { id: 'b1', name: 'Torre A', sales_price_sqm: 10_000, construction_cost_sqm: 4_500, units: [{ id: 'u1', quantity: 40, private_area: 70, common_area: 20 }] },
                { id: 'b2', name: 'Garagens', sales_price_sqm: 0, construction_cost_sqm: 2_000, units: [{ id: 'u2', quantity: 5, private_area: 12, common_area: 0, is_vendavel: false }] },
            ],
            unit_instances: garagens,
        });
        const m = computeImovibMath(estudo);
        expect(m.vgvPorBloco.b2).toEqual({ vgv: 0, fonte: 'espelho' });
        expect(m.vgvPorBloco.b1.fonte).toBe('preco_m2');
        expect(m.avisos.map(a => a.mensagem).join(' ')).not.toMatch(/Garagens/);
    });
});
