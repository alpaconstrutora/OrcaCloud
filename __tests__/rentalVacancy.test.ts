import { describe, it, expect } from 'vitest';
import {
    latestEventByProperty,
    snapshotsFrom,
    median,
    vacancyStats,
    netAbsorption,
    type StatusEvent,
} from '../lib/rentalVacancy';

const NOW = new Date('2026-08-06T12:00:00.000Z');

/** Evento a N dias atrás de NOW. */
const daysAgo = (n: number): string =>
    new Date(NOW.getTime() - n * 86_400_000).toISOString();

const ev = (over: Partial<StatusEvent> & { property_id: string; to_status: string }): StatusEvent => ({
    from_status: null,
    changed_at: daysAgo(0),
    source: 'MANUAL',
    ...over,
});

describe('latestEventByProperty — o estado atual é o último evento', () => {
    it('fica com o mais recente quando a unidade tem vários', () => {
        const events = [
            ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: daysAgo(90) }),
            ev({ property_id: 'u1', to_status: 'RENTED', changed_at: daysAgo(30), from_status: 'AVAILABLE' }),
            ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: daysAgo(10), from_status: 'RENTED' }),
        ];

        expect(latestEventByProperty(events).get('u1')?.changed_at).toBe(daysAgo(10));
    });

    it('não depende da ordem em que os eventos chegam', () => {
        const events = [
            ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: daysAgo(10) }),
            ev({ property_id: 'u1', to_status: 'RENTED', changed_at: daysAgo(90) }),
        ];

        expect(latestEventByProperty(events).get('u1')?.to_status).toBe('AVAILABLE');
    });
});

describe('snapshotsFrom — dias no status atual', () => {
    it('conta dias completos, sem arredondar para cima', () => {
        const events = [ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: daysAgo(45) })];
        expect(snapshotsFrom(events, NOW)[0].days).toBe(45);
    });

    it('marca como aproximado o que veio do backfill', () => {
        const events = [
            ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: daysAgo(45), source: 'BACKFILL' }),
            ev({ property_id: 'u2', to_status: 'AVAILABLE', changed_at: daysAgo(45), source: 'MANUAL' }),
        ];
        const byId = new Map(snapshotsFrom(events, NOW).map(s => [s.propertyId, s]));

        expect(byId.get('u1')?.approximate).toBe(true);
        expect(byId.get('u2')?.approximate).toBe(false);
    });

    it('não devolve dias negativos quando a data do evento é futura', () => {
        // Acontece com importação de fuso torto — nunca pode virar dia negativo.
        const events = [ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: daysAgo(-5) })];
        expect(snapshotsFrom(events, NOW)[0].days).toBe(0);
    });

    it('descarta evento com data inválida em vez de virar NaN', () => {
        const events = [ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: 'nao-e-data' })];
        expect(snapshotsFrom(events, NOW)).toEqual([]);
    });
});

describe('median', () => {
    it('ímpar pega o do meio', () => {
        expect(median([10, 90, 50])).toBe(50);
    });

    it('par tira a média dos dois do meio', () => {
        expect(median([10, 20, 30, 40])).toBe(25);
    });

    it('lista vazia é zero, não NaN', () => {
        expect(median([])).toBe(0);
    });

    it('não altera o array recebido', () => {
        const values = [30, 10, 20];
        median(values);
        expect(values).toEqual([30, 10, 20]);
    });
});

describe('vacancyStats', () => {
    const events = [
        ev({ property_id: 'vaga-10', to_status: 'AVAILABLE', changed_at: daysAgo(10) }),
        ev({ property_id: 'vaga-45', to_status: 'AVAILABLE', changed_at: daysAgo(45) }),
        ev({ property_id: 'vaga-200', to_status: 'AVAILABLE', changed_at: daysAgo(200), source: 'BACKFILL' }),
        ev({ property_id: 'alugada', to_status: 'RENTED', changed_at: daysAgo(300) }),
        ev({ property_id: 'reforma', to_status: 'MAINTENANCE', changed_at: daysAgo(20) }),
    ];

    it('conta só as vagas, e a mediana não é a média', () => {
        const stats = vacancyStats(events, NOW);

        expect(stats.vacantCount).toBe(3);
        expect(stats.averageDays).toBe(85);   // (10+45+200)/3
        expect(stats.medianDays).toBe(45);    // a mediana resiste ao outlier de 200
    });

    it('separa as faixas de envelhecimento', () => {
        const stats = vacancyStats(events, NOW);

        expect(stats.over30).toBe(2);   // 45 e 200
        expect(stats.over90).toBe(1);   // 200
        expect(stats.over180).toBe(1);  // 200
    });

    it('imóvel em reforma não entra na vacância — conta separado', () => {
        const stats = vacancyStats(events, NOW);

        expect(stats.unavailableCount).toBe(1);
        expect(stats.vacantCount).toBe(3); // a unidade em reforma ficou de fora
    });

    it('avisa quantas vagas ainda dependem do marco aproximado do backfill', () => {
        expect(vacancyStats(events, NOW).approximateCount).toBe(1);
    });

    it('carteira sem eventos não vira NaN', () => {
        const stats = vacancyStats([], NOW);
        expect(stats.averageDays).toBe(0);
        expect(stats.medianDays).toBe(0);
        expect(stats.vacantCount).toBe(0);
    });

    it('unidade que foi alugada some da vacância', () => {
        const relet = [
            ev({ property_id: 'u1', to_status: 'AVAILABLE', changed_at: daysAgo(100) }),
            ev({ property_id: 'u1', to_status: 'RENTED', changed_at: daysAgo(2), from_status: 'AVAILABLE' }),
        ];

        expect(vacancyStats(relet, NOW).vacantCount).toBe(0);
    });
});

describe('netAbsorption — locações menos desocupações no período', () => {
    const from = new Date(NOW.getTime() - 30 * 86_400_000);

    it('soma locações e subtrai desocupações', () => {
        const events = [
            ev({ property_id: 'a', to_status: 'RENTED', from_status: 'AVAILABLE', changed_at: daysAgo(20) }),
            ev({ property_id: 'b', to_status: 'RENTED', from_status: 'AVAILABLE', changed_at: daysAgo(10) }),
            ev({ property_id: 'c', to_status: 'AVAILABLE', from_status: 'RENTED', changed_at: daysAgo(5) }),
        ];

        expect(netAbsorption(events, from, NOW)).toEqual({ rented: 2, vacated: 1, net: 1 });
    });

    it('ignora o backfill, que não é transição', () => {
        // Sem isso, toda unidade já alugada viraria "locação nova" na data do
        // backfill e a absorção do primeiro mês seria uma ficção.
        const events = [
            ev({ property_id: 'a', to_status: 'RENTED', from_status: null, changed_at: daysAgo(10), source: 'BACKFILL' }),
        ];

        expect(netAbsorption(events, from, NOW).rented).toBe(0);
    });

    it('ignora evento fora da janela', () => {
        const events = [
            ev({ property_id: 'a', to_status: 'RENTED', from_status: 'AVAILABLE', changed_at: daysAgo(200) }),
        ];

        expect(netAbsorption(events, from, NOW).net).toBe(0);
    });
});
