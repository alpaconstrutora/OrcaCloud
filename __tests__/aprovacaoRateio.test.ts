// Aprovação do rateio pelo síndico (Portal do Síndico F3, 20/10/2026) — espelho
// do gatilho trg_rateio_exige_aprovacao. As mensagens são as do banco: a prova
// do gatilho em produção (bloco desfeito, 21/10/2026) devolveu exatamente estas.
import { describe, it, expect } from 'vitest';
import { podeFecharRateio, situacaoDaAprovacao } from '../utils/aprovacaoRateio';

const vigente = { exige: true, sindicoClientId: 's1', sindicoVigente: true };
const aprovado = { status: 'APROVADO' as const, porClientId: 's1', desatualizada: false };

describe('podeFecharRateio', () => {
    it('sem exigência fecha sempre (o padrão)', () => {
        expect(podeFecharRateio({ status: null, porClientId: null, desatualizada: false }, { ...vigente, exige: false })).toEqual({ ok: true, motivo: null });
    });

    it('exigência sem síndico vigente trava, dizendo o caminho', () => {
        expect(podeFecharRateio(aprovado, { ...vigente, sindicoVigente: false }).motivo).toMatch(/Defina o síndico na Ficha ou desligue a exigência/);
        expect(podeFecharRateio(aprovado, { ...vigente, sindicoClientId: null }).ok).toBe(false);
    });

    it('aguardando ou devolvido trava', () => {
        expect(podeFecharRateio({ ...aprovado, status: null }, vigente).motivo).toMatch(/ainda não aprovou/);
        expect(podeFecharRateio({ ...aprovado, status: 'DEVOLVIDO' }, vigente).motivo).toMatch(/ainda não aprovou/);
    });

    it('aprovação de outro síndico ou desatualizada trava', () => {
        expect(podeFecharRateio({ ...aprovado, porClientId: 'antigo' }, vigente).motivo).toMatch(/síndico anterior/);
        expect(podeFecharRateio({ ...aprovado, desatualizada: true }, vigente).motivo).toMatch(/mudou depois da aprovação/);
    });

    it('aprovado pelo síndico vigente, sem mudança: fecha', () => {
        expect(podeFecharRateio(aprovado, vigente)).toEqual({ ok: true, motivo: null });
    });
});

describe('situacaoDaAprovacao', () => {
    it('desatualizada vence o status', () => {
        expect(situacaoDaAprovacao({ status: 'APROVADO', desatualizada: true })).toBe('DESATUALIZADA');
        expect(situacaoDaAprovacao({ status: 'APROVADO', desatualizada: false })).toBe('APROVADO');
        expect(situacaoDaAprovacao({ status: 'DEVOLVIDO', desatualizada: false })).toBe('DEVOLVIDO');
        expect(situacaoDaAprovacao({ status: null, desatualizada: false })).toBe('AGUARDANDO');
    });
});
