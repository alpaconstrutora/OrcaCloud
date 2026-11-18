// O caminho que uma Edge Function assina (ou baixa) com a service_role não pode
// ter segmento `.`/`..` (nem `%2e`): o parser de URL do `fetch` resolve esses
// segmentos e a URL assinada sai da pasta — e do bucket — conferidos.
// Código: supabase/functions/_shared/caminhoSemTravessia.ts
// Espelhos no banco (mesma regra, conferida contra este helper em 200 mil
// entradas num PostgreSQL local, 18/11/2026, zero divergência):
//   public.partner_portal_create_request
//     (supabase/migrations/aplicar_20271116905700_partner_anexo_sem_travessia.sql)
//   public.fn_caminho_sem_travessia — usada pelas RPCs do síndico
//     (supabase/migrations/aplicar_20271118912000_caminho_sem_travessia_sindico.sql)
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

// F54 (18/11/2026): o síndico grava `internal_transactions.documento_path` pelas
// RPCs `sindico_portal_lancar_pagar`/`_editar_titulo`, que só conferiam
// `LIKE '<org>/sindico/%'` e `NOT LIKE '%..%'`. `%2e%2e` passava nas duas, e a
// `sindico-portal-financeiro` (abrir) e a `client-portal-rateio-comprovantes`
// (PDF do rateio) assinavam o caminho com a service_role.
describe('caminhoSemTravessia · anexo do síndico (F54)', () => {
    const SINDICO = `${ORG}/sindico`;
    const GRUPO = '0b6f0c0e-1111-4000-8000-000000000000';
    const base = 'https://x.supabase.co/storage/v1/object/sign/financeiro-anexos/';

    it('aceita o caminho que a Edge grava no upload do síndico e nomes com `?`/`#`', () => {
        // `<org>/sindico/<uuid>/<epoch>-<nomeSeguro>` (sindico-portal-financeiro, upload)
        for (const p of [
            `${SINDICO}/${GRUPO}/1731900000000-Nota-Fiscal-0042.pdf`,
            `${SINDICO}/${GRUPO}/1731900000000-boleto.v2.pdf`,
            // nome legítimo com `?`/`#` (o modo autenticado grava o nome cru em outros buckets)
            `${SINDICO}/${GRUPO}/NF #12?.pdf`, `${SINDICO}/${GRUPO}/a?b#c.pdf`,
        ]) expect(caminhoSemTravessia(p), p).toBe(true);
    });

    it('recusa o exploit do achado e as grafias vizinhas', () => {
        for (const p of [
            `${SINDICO}/%2e%2e/%2e%2e/%2e%2e/boletos/${ORG}/x.pdf`,
            `${SINDICO}/%2E./x`, `${SINDICO}/.%2E/x`, `${SINDICO}/%2E%2E/x`,
            `${SINDICO}/..%2fboletos%2fx`, `${SINDICO}/..%2Fx`, `${SINDICO}/..%5cx`,
            `${SINDICO}/x/.\t./y`, `${SINDICO}/x/.\n./y`, `${SINDICO}/x/.\r./y`,
            `${SINDICO}/x/..\t`, `${SINDICO}/x/.. `, `${SINDICO}/x/..\u0001\u0002 `,
            `${SINDICO}/x?/../y`, `${SINDICO}/x#/../y`, `${SINDICO}/x/..?q`, `${SINDICO}/x/..#f`,
        ]) expect(caminhoSemTravessia(p), JSON.stringify(p)).toBe(false);
    });

    it('o exploit do achado sai mesmo do bucket pelo parser WHATWG — é o que a trava recusa', () => {
        const exploit = `${SINDICO}/%2e%2e/%2e%2e/%2e%2e/boletos/${ORG}/x.pdf`;
        expect(new URL(base + exploit).pathname).toBe(`/storage/v1/object/sign/boletos/${ORG}/x.pdf`);
        expect(caminhoSemTravessia(exploit)).toBe(false);
    });

    // A 2ª tentativa de correção do F54 foi recusada por um único detalhe: o corte
    // do fim era `/[\x00-\x20]+$/`, quadrático no V8 quando há um bloco longo de
    // espaços. Um caminho assim, plantado pelo síndico, esgotava a CPU da Edge e
    // derrubava o PDF do rateio inteiro. Aqui, ~100 mil espaços/controles em
    // várias posições têm de terminar rápido — e com a resposta certa.
    it('~100 mil espaços/controles em qualquer posição: resposta certa, em tempo linear', () => {
        const ESPACOS = ' '.repeat(100_000);
        const casos: [string, boolean][] = [
            [`${SINDICO}/x${ESPACOS}`, true],                       // só no fim
            [`${SINDICO}/..${ESPACOS}`, false],                     // `..` + fim cortado
            [`${SINDICO}/x${ESPACOS}a`, true],                      // no meio (o caso quadrático)
            [`${SINDICO}/x${'\t '.repeat(50_000)}/..`, false],      // tab/espaço no meio, `..` no fim
            [`${SINDICO}/x${'\u0001'.repeat(100_000)}a/..${ESPACOS}`, false],
            [`${SINDICO}/${'%2e'.repeat(30_000)}/${'.'.repeat(100_000)}`, true],
            [`${ESPACOS}${SINDICO}/x`, true],                       // no começo
        ];
        const inicio = Date.now();
        for (const [p, esperado] of casos) expect(caminhoSemTravessia(p), `${p.slice(0, 60)}… (${p.length})`).toBe(esperado);
        expect(Date.now() - inicio).toBeLessThan(500);
    });
});
