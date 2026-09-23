import { beforeEach, describe, expect, it, vi } from 'vitest';

// O service fala com o Supabase; aqui só interessa o que ele decide ANTES de
// falar (o que é path, o que passa direto, o que vai para a edge function).
const { createSignedUrls, invoke } = vi.hoisted(() => ({ createSignedUrls: vi.fn(), invoke: vi.fn() }));
vi.mock('../lib/supabase', () => ({
    supabase: {
        storage: { from: () => ({ createSignedUrls }) },
        functions: { invoke },
    },
}));

import {
    buildDiaryMediaPath,
    diaryMediaExtension,
    isDiaryStoragePath,
    signDiaryMediaUrls,
} from '../services/diaryMediaService';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJ = '22222222-2222-2222-2222-222222222222';

describe('diaryMediaService · o que é path e o que passa direto', () => {
    it('data URL, http(s) e blob NÃO são path — registro antigo continua abrindo', () => {
        expect(isDiaryStoragePath('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
        expect(isDiaryStoragePath('https://x.supabase.co/storage/v1/object/sign/a.jpg?token=1')).toBe(false);
        expect(isDiaryStoragePath('http://exemplo.com/a.jpg')).toBe(false);
        expect(isDiaryStoragePath('blob:http://localhost/123')).toBe(false);
        expect(isDiaryStoragePath('')).toBe(false);
        expect(isDiaryStoragePath(null)).toBe(false);
        expect(isDiaryStoragePath(undefined)).toBe(false);
    });

    it('caminho de bucket É path', () => {
        expect(isDiaryStoragePath(`${ORG}/${PROJ}/abc.jpg`)).toBe(true);
        expect(isDiaryStoragePath('DATA-planilha/x.pdf')).toBe(true); // prefixo parecido não engana o regex
    });
});

describe('diaryMediaService · path do objeto', () => {
    it('primeiro segmento é a ORGANIZAÇÃO (é o que a policy lê), depois o projeto', () => {
        const p = buildDiaryMediaPath(ORG, PROJ, 'jpg', 'uuid-fixo');
        expect(p).toBe(`${ORG}/${PROJ}/uuid-fixo.jpg`);
        expect(p.split('/')[0]).toBe(ORG);
    });

    it('extensão vem do MIME; sem MIME, do nome; sem nada, bin', () => {
        expect(diaryMediaExtension({ name: 'foto.jpeg', type: 'image/jpeg' })).toBe('jpg');
        expect(diaryMediaExtension({ name: 'IMG_0001.HEIC', type: 'image/heic' })).toBe('heic');
        expect(diaryMediaExtension({ name: 'video.mov', type: 'video/quicktime' })).toBe('mov');
        expect(diaryMediaExtension({ name: 'ata.PDF', type: '' })).toBe('pdf');
        expect(diaryMediaExtension({ name: 'semextensao', type: '' })).toBe('bin');
        expect(diaryMediaExtension({ name: 'x.docx', type: 'application/octet-stream' })).toBe('docx');
    });
});

describe('diaryMediaService · assinatura em lote', () => {
    beforeEach(() => {
        createSignedUrls.mockReset();
        invoke.mockReset();
    });

    it('data URL passa direto sem chamar o storage', async () => {
        const dataUrl = 'data:image/png;base64,AAAA';
        const out = await signDiaryMediaUrls([dataUrl, '']);
        expect(out).toEqual({ [dataUrl]: dataUrl });
        expect(createSignedUrls).not.toHaveBeenCalled();
        expect(invoke).not.toHaveBeenCalled();
    });

    it('paths vão numa única chamada, sem repetir, e o que falhou fica fora do mapa', async () => {
        const a = `${ORG}/${PROJ}/a.jpg`;
        const b = `${ORG}/${PROJ}/b.jpg`;
        createSignedUrls.mockResolvedValue({
            data: [
                { path: a, signedUrl: 'https://s/a?token=1', error: null },
                { path: b, signedUrl: '', error: 'Object not found' },
            ],
            error: null,
        });
        const out = await signDiaryMediaUrls([a, b, a, 'data:x']);
        expect(createSignedUrls).toHaveBeenCalledTimes(1);
        expect(createSignedUrls.mock.calls[0][0]).toEqual([a, b]);
        expect(out[a]).toBe('https://s/a?token=1');
        expect(out).not.toHaveProperty(b);
        expect(out['data:x']).toBe('data:x');
    });

    it('com portalToken vai pela edge function, nunca pelo storage direto', async () => {
        const a = `${ORG}/${PROJ}/a.jpg`;
        invoke.mockResolvedValue({ data: { urls: { [a]: 'https://s/a?token=2' } }, error: null });
        const out = await signDiaryMediaUrls([a], { portalToken: 'tok' });
        expect(createSignedUrls).not.toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledWith('client-portal-diary-download', {
            body: { token: 'tok', storagePaths: [a] },
        });
        expect(out[a]).toBe('https://s/a?token=2');
    });
});
