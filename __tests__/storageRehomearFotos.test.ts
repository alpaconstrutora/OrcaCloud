// Script de dados scripts/storage-rehomear-fotos.mjs: o PLANO (o que copia,
// para onde, o que só confere). A execução usa a service_role e o Storage de
// verdade — o usuário roda com `--ensaio` antes.
import { describe, expect, it } from 'vitest';
// @ts-expect-error — script .mjs, sem tipos
import { ALVOS, CONFERIR, caminhoGravado, conferirCaminho, destinoDe, planejar } from '../scripts/storage-rehomear-fotos.mjs';

const ORG_A = '926cf626-ba49-4ee4-9f35-472822fb90e6';
const ORG_B = 'ba88199a-202b-4720-88e2-24ca6ae3ef59';
const EMP = '8dd15b06-3822-4333-9f88-bfc720d31526';
const ATIVO = '0bcd9e2b-32ea-4b16-82e1-9f5c21899489';
const [FOTO_COLAB, FOTO_ATIVO] = ALVOS;

describe('storage-rehomear-fotos — plano', () => {
    it('foto de colaborador no layout antigo vai para a pasta do colaborador, na org ATUAL dele', () => {
        expect(destinoDe(FOTO_COLAB, { id: EMP, org_id: ORG_A, avatar_url: `labor-photos/${ORG_A}/58eb.jpeg` }))
            .toEqual({ situacao: 'mover', atual: `labor-photos/${ORG_A}/58eb.jpeg`, destino: `labor-photos/${ORG_A}/${EMP}/58eb.jpeg` });
    });

    it('ativo que mudou de org (caso real de produção): a pasta nova é a da org atual', () => {
        expect(destinoDe(FOTO_ATIVO, { id: ATIVO, organization_id: ORG_B, image_url: `asset-photos/${ORG_A}/a889.webp` }).destino)
            .toBe(`asset-photos/${ORG_B}/${ATIVO}/a889.webp`);
    });

    it('já no lugar: nada a fazer (idempotente)', () => {
        expect(destinoDe(FOTO_COLAB, { id: EMP, org_id: ORG_A, avatar_url: `labor-photos/${ORG_A}/${EMP}/x.jpg` }).situacao).toBe('ok');
    });

    it('URL pública inteira já no layout novo: só troca a coluna (destino = origem, sem copiar)', () => {
        const url = `https://p.supabase.co/storage/v1/object/public/organization-assets/labor-photos/${ORG_A}/${EMP}/x.jpg`;
        const d = destinoDe(FOTO_COLAB, { id: EMP, org_id: ORG_A, avatar_url: url });
        expect(d).toEqual({ situacao: 'mover', atual: `labor-photos/${ORG_A}/${EMP}/x.jpg`, destino: `labor-photos/${ORG_A}/${EMP}/x.jpg` });
    });

    it('URL externa / outro bucket: não mexe', () => {
        expect(destinoDe(FOTO_COLAB, { id: EMP, org_id: ORG_A, avatar_url: 'https://cdn.exemplo.com/f.jpg' }).situacao).toBe('fora');
        expect(caminhoGravado('https://p.supabase.co/storage/v1/object/public/documents/a/b.pdf')).toBeNull();
        expect(caminhoGravado('a/../b.jpg')).toBeNull();
    });

    it('duplicata antiga apontando para o MESMO arquivo: um grupo, um destino por ativo', () => {
        const outro = '11111111-1111-4111-8111-111111111111';
        const { grupos, ok, fora } = planejar(FOTO_ATIVO, [
            { id: ATIVO, organization_id: ORG_A, image_url: `asset-photos/${ORG_A}/f.webp` },
            { id: outro, organization_id: ORG_A, image_url: `asset-photos/${ORG_A}/f.webp` },
            { id: '22222222-2222-4222-8222-222222222222', organization_id: ORG_A, image_url: `asset-photos/${ORG_A}/22222222-2222-4222-8222-222222222222/g.webp` },
        ]);
        expect(ok).toHaveLength(1);
        expect(fora).toHaveLength(0);
        expect([...grupos.keys()]).toEqual([`asset-photos/${ORG_A}/f.webp`]);
        expect(grupos.get(`asset-photos/${ORG_A}/f.webp`).map((m: { destino: string }) => m.destino)).toEqual([
            `asset-photos/${ORG_A}/${ATIVO}/f.webp`,
            `asset-photos/${ORG_A}/${outro}/f.webp`,
        ]);
    });

    it('conferência: documento cujo caminho não é do colaborador da linha é apontado', () => {
        const [docs, , ausencias] = CONFERIR;
        expect(conferirCaminho(docs, { id: 'd1', employee_id: EMP, file_url: `labor-documents/${EMP}/a.pdf` })).toBeNull();
        expect(conferirCaminho(docs, { id: 'd2', employee_id: EMP, file_url: `labor-documents/${ATIVO}/a.pdf` }))
            .toEqual({ id: 'd2', caminho: `labor-documents/${ATIVO}/a.pdf`, esperado: EMP });
        expect(conferirCaminho(ausencias, { id: ATIVO, atestado_url: `absences/${ORG_A}/${ATIVO}.pdf` })).toBeNull();
        // certificado da Academia mora em outro bucket: não é conferido aqui
        expect(conferirCaminho(CONFERIR[3], { id: 'x', certificado_url: 'certificados/x.pdf' })).toBeNull();
    });
});
