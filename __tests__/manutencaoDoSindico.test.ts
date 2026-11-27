import { describe, it, expect } from 'vitest';
import {
    MOTIVO_OS_FECHADA, diasAte, motivoNaoEditaOs, motivoNaoFechaOs, motivoNaoRemoveEquipamento, situacaoDoItem,
    textoDaPeriodicidade,
} from '../utils/manutencaoDoSindico';

describe('manutenção do síndico', () => {
    it('OS fechada não edita nem conclui; o motivo de operar vem antes (frases do banco)', () => {
        expect(motivoNaoEditaOs({ status: 'AGENDADA' }, null)).toBeNull();
        expect(motivoNaoEditaOs({ status: 'CONCLUIDA' }, null)).toBe(MOTIVO_OS_FECHADA);
        expect(motivoNaoEditaOs({ status: 'CANCELADA' }, 'base')).toBe('base');
        expect(motivoNaoFechaOs({ status: 'ABERTA' }, null)).toBeNull();
        expect(motivoNaoFechaOs({ status: 'CANCELADA' }, null)).toBe('Esta ordem já está concluída ou cancelada.');
    });

    it('equipamento com OS no histórico não se remove', () => {
        expect(motivoNaoRemoveEquipamento({ ordens: 0 }, null)).toBeNull();
        expect(motivoNaoRemoveEquipamento({ ordens: 2 }, null)).toBe('Este equipamento tem ordens de serviço no histórico — não dá para remover.');
    });

    it('periodicidade por extenso', () => {
        expect(textoDaPeriodicidade(1, 'MES')).toBe('a cada mês');
        expect(textoDaPeriodicidade(6, 'MES')).toBe('a cada 6 meses');
        expect(textoDaPeriodicidade(2, 'ANO')).toBe('a cada 2 anos');
    });

    it('situação do item pelo vencimento (data pura, sem fuso)', () => {
        expect(diasAte('2026-12-01', '2026-11-26')).toBe(5);
        expect(diasAte('2026-11-25', '2026-11-26')).toBe(-1);
        expect(situacaoDoItem('2026-11-25', '2026-11-26')).toBe('VENCIDO');
        expect(situacaoDoItem('2026-12-20', '2026-11-26')).toBe('PROXIMO');
        expect(situacaoDoItem('2027-05-20', '2026-11-26')).toBe('EM_DIA');
        expect(situacaoDoItem(null, '2026-11-26')).toBe('SEM_DATA');
    });
});
