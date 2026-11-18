// supabase/functions/_shared/caminhoNoBucket.ts
//
// De um valor GRAVADO no banco para o CAMINHO do arquivo dentro de um bucket.
//
// Por que existe: os buckets `documents` e `organization-assets` eram públicos,
// e várias colunas guardaram a URL pública INTEIRA
// (`https://<projeto>.supabase.co/storage/v1/object/public/documents/<caminho>`):
// `contract_document_versions.url`, `contracts.minuta_versions[].url`,
// `contracts.signed_contract_url`, `investor_reports.url`… Com o bucket privado
// essa URL dá 400 — quem lê passa a pedir URL ASSINADA, e para isso precisa do
// caminho. O banco não é reescrito: o leitor extrai o caminho daqui, e o escritor
// novo já grava só o caminho. Os dois formatos convivem para sempre.
//
// Aceita:
//   • URL do Storage de `bucket` — `/object/public|sign|authenticated/<bucket>/…`
//     e `/render/image/public|sign|authenticated/<bucket>/…`, com ou sem query
//     (`?token=` de URL assinada sai). O domínio NÃO é conferido: o caminho
//     sobrevive a troca de domínio do projeto, e assinar continua sendo decisão
//     da RLS do Storage (quem usa a própria sessão) ou da lista de referências
//     do portal (Edge Function com service_role).
//   • `<bucket>:<caminho>` — a forma que o GED usa (`documentService`);
//   • caminho cru (`contract-minutas/<id>/arquivo.pdf`).
//
// Devolve `null` para: vazio, URL de OUTRO bucket ou de fora do Storage (essa é
// "URL externa": quem chama abre como está — ZapSign, imagem colada à mão),
// outro esquema (`data:`, `blob:`), percent-encoding quebrado e TRAVESSIA
// (segmento `.`/`..`, inclusive `%2e`, ou `\`). Travessia aqui é só a primeira
// linha: a Edge Function ainda passa o caminho por `caminhoSemTravessia` antes
// de assinar com a service_role.
//
// Sem import nenhum, para valer na Edge Function (Deno), no Vite e no Vitest.

const URL_DO_STORAGE =
    /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;

const temEsquema = (s: string) => /^[a-z][a-z0-9+.-]*:/i.test(s);

function decodificar(s: string): string | null {
    try {
        return decodeURIComponent(s);
    } catch {
        return null;
    }
}

/**
 * `true` se, lido como o servidor lê (`%2e` vira `.`, `%2f`/`%5c` viram `/`),
 * algum segmento é `.`/`..`; ou se há `\` ou caractere de controle. Mesma
 * leitura de `caminhoSemTravessia` — aqui sem o corte em `?`/`#`, porque o
 * caminho já veio sem a query.
 */
function temTravessia(caminho: string): boolean {
    if (caminho.includes('\\') || /[\x00-\x1f\x7f]/.test(caminho)) return true;
    const lido = caminho.replace(/%2e/gi, '.').replace(/%2f|%5c/gi, '/');
    return lido.split('/').some(s => s === '.' || s === '..');
}

export function caminhoNoBucket(valor: unknown, bucket: string): string | null {
    if (typeof valor !== 'string' || !bucket) return null;
    const v = valor.trim();
    if (!v) return null;

    let caminho: string | null;

    if (/^https?:\/\//i.test(v)) {
        // Travessia no texto CRU: o parser de URL resolveria `%2e%2e` e `..`
        // calado (e o caminho "certo" que sobra não é o que estava gravado).
        const pathCru = v.replace(/^https?:\/\/[^/?#]*/i, '').split(/[?#]/)[0];
        if (temTravessia(pathCru)) return null;
        let pathname: string;
        try {
            pathname = new URL(v).pathname;
        } catch {
            return null;
        }
        const m = URL_DO_STORAGE.exec(pathname);
        if (!m) return null;
        if (decodificar(m[1]) !== bucket) return null;
        // Cada segmento decodificado em separado: `%2F` dentro de um nome não
        // pode virar uma pasta nova.
        const segmentos = m[2].split('/').map(decodificar);
        if (segmentos.some(s => s === null || s.includes('/'))) return null;
        caminho = (segmentos as string[]).join('/');
    } else if (temEsquema(v)) {
        if (!v.startsWith(`${bucket}:`)) return null;
        caminho = v.slice(bucket.length + 1);
    } else {
        caminho = v;
    }

    caminho = caminho.replace(/^\/+/, '');
    if (!caminho || caminho.endsWith('/')) return null;
    if (caminho.split('/').some(s => s === '')) return null;
    if (temTravessia(caminho)) return null;
    return caminho;
}

/** URL http(s) que NÃO é deste bucket — abre como está (ZapSign, link colado). */
export function ehUrlExterna(valor: unknown, bucket: string): boolean {
    return typeof valor === 'string'
        && /^https?:\/\//i.test(valor.trim())
        && caminhoNoBucket(valor, bucket) === null;
}
