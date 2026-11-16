// supabase/functions/_shared/caminhoSemTravessia.ts
//
// O CAMINHO que uma Edge Function entrega à service_role para ASSINAR.
//
// `createSignedUrl` monta `/object/sign/<bucket>/<caminho>` e o `fetch` lê essa
// URL pelo parser WHATWG, que RESOLVE segmentos `.`/`..` — inclusive escritos
// como `%2e`. Um caminho como `partner-uploads/<workspace>/../<outra-pasta>/x`
// passa por qualquer conferência de PREFIXO e, na URL assinada, sai da pasta
// conferida; a service_role não tem a policy de pasta que o Storage aplica a
// quem usa o próprio JWT. Por isso o caminho é conferido aqui, na assinatura:
// vale para o que já estava gravado e para o que chega no corpo da requisição.
//
// Só TRAVESSIA — a pasta/prefixo continua sendo conferida por quem chama.
//
// A MESMA regra mora no banco, em `partner_portal_create_request`
// (aplicar_20271116905700_partner_anexo_sem_travessia.sql), que grava os
// caminhos dos anexos de solicitação do Portal do Parceiro. Mudar uma é mudar
// as duas.
//
// Sem import nenhum, para valer na Edge Function (Deno) e no Vitest.

const ehSegmentoDePonto = (s: string) => s === '.' || s === '..';

/** Corta do fim espaço e controle C0 (código <= 0x20). Laço linear, sem regex. */
function semEspacoNoFim(s: string): string {
    let fim = s.length;
    while (fim > 0 && s.charCodeAt(fim - 1) <= 0x20) fim--;
    return s.slice(0, fim);
}

/** Descarta tab/LF/CR em qualquer posição (o parser de URL os ignora). */
const semTabNemQuebra = (s: string) => s.replace(/[\t\n\r]/g, '');

/**
 * `true` quando nenhum segmento `.`/`..` sobra no caminho, lido de dois jeitos:
 *
 *  (a) como o parser de URL do `fetch` lê o que vem depois de
 *      `/object/sign/<bucket>/`: corta espaço/controle do fim, descarta
 *      tab/LF/CR, para no primeiro `?`/`#`, `\` vira `/`, `%2e` vira `.` e
 *      `%2f`/`%5c` viram `/` (o servidor decodifica antes de usar);
 *  (b) cru, sem cortar em `?`/`#`, com tab/LF/CR descartados, espaço/controle
 *      do fim cortado e `%2e` decodificado.
 *
 * `#`, `?`, `\`, espaço e acento sozinhos NÃO recusam: nome de arquivo legítimo
 * tem. Qualquer coisa que não seja string não vazia é recusada.
 */
export function caminhoSemTravessia(caminho: unknown): caminho is string {
    if (typeof caminho !== 'string' || caminho.length === 0) return false;

    let comoUrl = semTabNemQuebra(semEspacoNoFim(caminho));
    const corte = comoUrl.search(/[?#]/);
    if (corte >= 0) comoUrl = comoUrl.slice(0, corte);
    comoUrl = comoUrl.replace(/\\/g, '/').replace(/%2e/gi, '.').replace(/%2f|%5c/gi, '/');
    if (comoUrl.split('/').some(ehSegmentoDePonto)) return false;

    const cru = semEspacoNoFim(semTabNemQuebra(caminho)).replace(/%2e/gi, '.');
    if (cru.split('/').some(ehSegmentoDePonto)) return false;

    return true;
}
