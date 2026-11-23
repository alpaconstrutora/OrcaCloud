/**
 * Linhas do card de empreendimento do Credit Room, por objetivo
 * (docs/planos/2026-11-22-credit-room-cards-por-objetivo.md).
 *
 * Protege: Vendas como sempre foi; Locação com aluguel contratado e pedido, sem nunca virar R$ 0 por falta
 * de valor cadastrado; Serviço com faturado/a faturar e a frase de "sem contrato"; versão congelada antes
 * destes campos mostra "—" (dado ausente ≠ zero).
 */
import { describe, expect, it } from 'vitest';
import { formatMoney } from '../components/ui/Format';
import { linhasDoCardDoEmpreendimento, FRASE_SEM_CONTRATO_DE_SERVICO } from '../utils/creditRoomEmpreendimentoCard';
import type { SnapshotEmpreendimentoItem } from '../utils/creditRoomSnapshot';

const emp = (over: Partial<SnapshotEmpreendimentoItem>): SnapshotEmpreendimentoItem => ({
    id: 'e1', nome: 'Residencial Aurora', organization_id: 'o1', cidade: 'Goiânia', uf: 'GO', objetivo: 'VENDAS',
    unidades_total: 40, vendidas: 20, alugadas: 5, disponiveis: 15,
    vgv_total: 8_000_000, vgv_vendido: 4_000_000, vgv_disponivel: 3_000_000, renda_mensal: 12_500,
    capa: null, fotos: [],
    ...over,
});

const R = (v: number) => formatMoney(v);

describe('linhasDoCardDoEmpreendimento — Vendas', () => {
    it.each(['VENDAS', 'MISTO', null, 'OUTRO'])('objetivo %s: VGV vendido, VGV disponível e renda do mês, como sempre', objetivo => {
        const linhas = linhasDoCardDoEmpreendimento(emp({ objetivo }));
        expect(linhas.map(l => l.rotulo)).toEqual(['VGV vendido', 'VGV disponível', 'Renda do mês']);
        expect(linhas.map(l => l.valor)).toEqual([R(4_000_000), R(3_000_000), R(12_500)]);
        expect(linhas.every(l => l.tom == null)).toBe(true);
    });

    it('book: ausente vira n/d e usa o formatador recebido', () => {
        const linhas = linhasDoCardDoEmpreendimento(
            emp({ renda_mensal: null as unknown as number }),
            { ausente: 'n/d', money: (x: number) => `$${x}` },
        );
        expect(linhas[0].valor).toBe('$4000000');
        expect(linhas[2].valor).toBe('n/d');
    });
});

describe('linhasDoCardDoEmpreendimento — Locação', () => {
    const base = { objetivo: 'LOCACAO', alugadas: 6, disponiveis: 4 };

    it('com aluguel contratado e pedido: quantidade + valor mensal; sem linha de aviso', () => {
        const linhas = linhasDoCardDoEmpreendimento(emp({
            ...base, aluguel_locadas: 18_000, aluguel_disponiveis: 10_000, disponiveis_sem_aluguel: 0,
        }));
        expect(linhas.map(l => l.rotulo)).toEqual(['Unidades locadas', 'Unidades disponíveis', 'Renda do mês']);
        expect(linhas[0].valor).toBe(`6 · ${R(18_000)}/mês`);
        expect(linhas[1].valor).toBe(`4 · ${R(10_000)}/mês`);
        expect(linhas.some(l => l.valor === R(4_000_000))).toBe(false); // não mostra VGV
    });

    it('parte das disponíveis sem aluguel cadastrado: soma só as com valor e conta as outras à parte', () => {
        const linhas = linhasDoCardDoEmpreendimento(emp({
            ...base, aluguel_locadas: 18_000, aluguel_disponiveis: 6_000, disponiveis_sem_aluguel: 2,
        }));
        expect(linhas.find(l => l.rotulo === 'Unidades disponíveis')!.valor).toBe(`4 · ${R(6_000)}/mês`);
        expect(linhas.find(l => l.rotulo === 'Sem aluguel cadastrado'))
            .toEqual({ rotulo: 'Sem aluguel cadastrado', valor: '2 unidades', tom: 'aviso' });
    });

    it('nenhuma disponível com valor: "—" e a contagem das sem valor (singular), nunca R$ 0,00', () => {
        const linhas = linhasDoCardDoEmpreendimento(emp({
            objetivo: 'LOCACAO', alugadas: 0, disponiveis: 1, aluguel_locadas: null, aluguel_disponiveis: null, disponiveis_sem_aluguel: 1,
        }));
        expect(linhas.find(l => l.rotulo === 'Unidades disponíveis')!.valor).toBe('1 · —');
        expect(linhas.find(l => l.rotulo === 'Unidades locadas')!.valor).toBe('0 · —');
        expect(linhas.find(l => l.rotulo === 'Sem aluguel cadastrado')!.valor).toBe('1 unidade');
        expect(linhas.map(l => l.valor).join('|')).not.toMatch(/R\$\s0,00/);
    });

    it('versão antiga (sem os campos novos): "—" no aluguel, sem linha de aviso, sem zero inventado', () => {
        const linhas = linhasDoCardDoEmpreendimento(emp(base));
        expect(linhas.find(l => l.rotulo === 'Unidades locadas')!.valor).toBe('6 · —');
        expect(linhas.find(l => l.rotulo === 'Unidades disponíveis')!.valor).toBe('4 · —');
        expect(linhas.some(l => l.rotulo === 'Sem aluguel cadastrado')).toBe(false);
    });
});

describe('linhasDoCardDoEmpreendimento — Serviço', () => {
    it('com contratos: faturado e a faturar', () => {
        const linhas = linhasDoCardDoEmpreendimento(emp({
            objetivo: 'SERVICO', servico: { n_contratos: 2, valor_contratos: 500_000, faturado: 180_000, a_faturar: 320_000 },
        }));
        expect(linhas.map(l => l.rotulo)).toEqual(['Contrato faturado', 'Contrato a faturar', 'Renda do mês']);
        expect(linhas[0].valor).toBe(R(180_000));
        expect(linhas[1].valor).toBe(R(320_000));
    });

    it('faturado maior que o contrato: a faturar zero (dado real, não ausência)', () => {
        const linhas = linhasDoCardDoEmpreendimento(emp({
            objetivo: 'SERVICO', servico: { n_contratos: 1, valor_contratos: 100_000, faturado: 120_000, a_faturar: 0 },
        }));
        expect(linhas.find(l => l.rotulo === 'Contrato a faturar')!.valor).toBe(R(0));
    });

    it('sem contrato de serviço ativo: a frase, em tom de aviso, e a renda do mês segue', () => {
        const linhas = linhasDoCardDoEmpreendimento(emp({
            objetivo: 'SERVICO', servico: { n_contratos: 0, valor_contratos: 0, faturado: 0, a_faturar: 0 },
        }));
        expect(linhas).toEqual([
            { rotulo: 'Contratos de serviço', valor: 'sem contrato de serviço ativo', tom: 'aviso' },
            { rotulo: 'Renda do mês', valor: R(12_500) },
        ]);
        expect(FRASE_SEM_CONTRATO_DE_SERVICO).toBe('sem contrato de serviço ativo');
    });

    it.each([undefined, null])('versão antiga ou leitura que falhou (servico = %s): "—", nunca zero nem a frase', servico => {
        const linhas = linhasDoCardDoEmpreendimento(emp({ objetivo: 'SERVICO', servico }));
        expect(linhas.find(l => l.rotulo === 'Contrato faturado')!.valor).toBe('—');
        expect(linhas.find(l => l.rotulo === 'Contrato a faturar')!.valor).toBe('—');
        expect(linhas.some(l => l.valor === FRASE_SEM_CONTRATO_DE_SERVICO)).toBe(false);
    });
});
