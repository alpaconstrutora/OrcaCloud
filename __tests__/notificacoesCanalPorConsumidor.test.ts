/**
 * notificationService.subscribeToNotifications — um canal Realtime POR CONSUMIDOR (16/10/2026).
 *
 * `supabase.channel(topico)` devolve a MESMA instância quando o tópico já existe
 * (realtime-js 2.90, RealtimeClient.channel). Layout, NotificationPanel e
 * NotificationsCenter assinavam todos `notifications-<email>`: fechar o sino
 * removia o canal que o Layout também usava, e como era o último canal o socket
 * caía no meio do handshake ("WebSocket is closed before the connection is
 * established"). O mock abaixo reproduz essa deduplicação por tópico.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

type CanalFalso = { topic: string; on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
const canais = new Map<string, CanalFalso>();
const removeChannel = vi.fn();

vi.mock('../lib/supabase', () => ({
    supabase: {
        channel: (topic: string) => {
            const existente = canais.get(topic);
            if (existente) return existente;
            const canal: CanalFalso = { topic, on: vi.fn(), subscribe: vi.fn() };
            canal.on.mockReturnValue(canal);
            canal.subscribe.mockReturnValue(canal);
            canais.set(topic, canal);
            return canal;
        },
        removeChannel: (c: CanalFalso) => { removeChannel(c); canais.delete(c.topic); },
    },
}));

import { notificationService } from '../services/notificationService';

describe('notificationService — canal Realtime por consumidor', () => {
    beforeEach(() => { canais.clear(); vi.clearAllMocks(); });

    it('dois consumidores do mesmo e-mail recebem canais DISTINTOS', () => {
        notificationService.subscribeToNotifications(() => {}, 'ana@x.com');
        notificationService.subscribeToNotifications(() => {}, 'ana@x.com');
        expect(canais.size).toBe(2);
        for (const topic of canais.keys()) expect(topic).toMatch(/^notifications-ana@x\.com-\d+$/);
    });

    it('cancelar um consumidor NÃO remove o canal do outro', () => {
        const cancelaPainel = notificationService.subscribeToNotifications(() => {}, 'ana@x.com');
        notificationService.subscribeToNotifications(() => {}, 'ana@x.com');
        const [canalPainel, canalLayout] = [...canais.values()];
        cancelaPainel();
        expect(removeChannel).toHaveBeenCalledTimes(1);
        expect(removeChannel).toHaveBeenCalledWith(canalPainel);
        expect(canais.has(canalLayout.topic)).toBe(true);
    });

    it('mantém o filtro por e-mail e, sem e-mail, assina a tabela inteira', () => {
        notificationService.subscribeToNotifications(() => {}, 'ana@x.com');
        notificationService.subscribeToNotifications(() => {});
        const [comEmail, semEmail] = [...canais.values()];
        expect(comEmail.on.mock.calls[0][1]).toMatchObject({ table: 'notifications', filter: 'recipient_email=eq.ana@x.com' });
        expect(semEmail.on.mock.calls[0][1]).toMatchObject({ table: 'notifications', filter: undefined });
        expect(semEmail.topic).toMatch(/^notifications-all-\d+$/);
    });
});
