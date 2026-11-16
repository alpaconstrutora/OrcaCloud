// O caminho que a Edge Function `partner-portal-download` assina com a
// service_role não pode ter segmento `.`/`..` (nem `%2e`): o parser de URL do
// `fetch` resolve esses segmentos e a URL assinada sai da pasta do workspace.
// Código: supabase/functions/_shared/caminhoSemTravessia.ts
// Espelho no banco: public.partner_portal_create_request
//   (supabase/migrations/aplicar_20271116905700_partner_anexo_sem_travessia.sql)
import { describe, expect, it } from 'vitest';
import { caminhoSemTravessia } from '../supabase/functions/_shared/caminhoSemTravessia';

const WS = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const PASTA = `partner-uploads/${WS}`;

const ACEITOS = [
    // o que a Edge partner-portal-upload devolve (nome saneado) e o que o modo
    // autenticado grava (partnerService.uploadRequestAttachment, nome cru)
    `${PASTA}/1731600000000_Proposta_004.pdf`,
    `${PASTA}/1731600000000_NF #12 (final) ação?.pdf`,
    // versão ativa de documento do GED (Caso 2 da Edge)
    `${ORG}/${DOC}/44444444-4444-4444-8444-444444444444_Contrato.pdf`,
    // ponto que não é o segmento inteiro
    `${PASTA}/1_a..b.pdf`, `${PASTA}/1_...pdf`, `${PASTA}/x/.oculto`, `${PASTA}/x/...`,
    `${PASTA}/x/%252e%252e/y`, `${PASTA}/x/a b.pdf`,
];

const RECUSADOS = [
    `${PASTA}/../../${ORG}/${DOC}/v_contrato.pdf`,
    `${PASTA}/%2e%2e/%2e%2e/${ORG}/x.pdf`,
    `${PASTA}/%2E%2e/x`, `${PASTA}/.%2e/x`, `${PASTA}/%2e./x`, `${PASTA}/%2e/x`,
    `${PASTA}/../x`, `${PASTA}/./x`, `${PASTA}/x/..`, `${PASTA}/x/.`,
    `${PASTA}/x\\..\\..\\y`, `${PASTA}/x%2f..%2fy`, `${PASTA}/x%5c..%5cy`, `${PASTA}/x%2F..%5Cy`,
    `${PASTA}/x/.. \t`, `${PASTA}/x/.\t./y`, `${PASTA}/x/.\n./y`, `${PASTA}/x/%2e%2e\u0001`,
    `${PASTA}/x/..?q`, `${PASTA}/x/..#f`, `${PASTA}/x?/../y`, `${PASTA}/x#/../y`,
    '.', '..', '../x',
];

describe('caminhoSemTravessia', () => {
    it('aceita os caminhos que os escritores legítimos gravam', () => {
        for (const p of ACEITOS) expect(caminhoSemTravessia(p), p).toBe(true);
    });

    it('recusa segmento `.`/`..` em qualquer grafia que o parser de URL ou o servidor resolvem', () => {
        for (const p of RECUSADOS) expect(caminhoSemTravessia(p), JSON.stringify(p)).toBe(false);
    });

    it('recusa o que não é string não vazia', () => {
        for (const p of [null, undefined, 1, {}, [], '']) expect(caminhoSemTravessia(p)).toBe(false);
    });

    it('corta o fim em tempo linear (sem regex com backtracking)', () => {
        const longo = `${PASTA}/x${' '.repeat(200_000)}a`;
        const inicio = Date.now();
        expect(caminhoSemTravessia(longo)).toBe(true);
        expect(Date.now() - inicio).toBeLessThan(1000);
    });

    it('nenhum caminho aceito sai da pasta do workspace pelo parser WHATWG', () => {
        const base = 'https://x.supabase.co/storage/v1/object/sign/opura-docs/';
        const dentro = (p: string) =>
            new URL(base + p).pathname.startsWith(`/storage/v1/object/sign/opura-docs/${PASTA}/`);
        for (const p of [...ACEITOS, ...RECUSADOS].filter(c => c.startsWith(`${PASTA}/`))) {
            if (caminhoSemTravessia(p)) expect(dentro(p), p).toBe(true);
        }
        // e o exploit do achado sai, de fato — é ele que a trava recusa
        expect(new URL(base + RECUSADOS[0]).pathname)
            .toBe(`/storage/v1/object/sign/opura-docs/${ORG}/${DOC}/v_contrato.pdf`);
    });
});
