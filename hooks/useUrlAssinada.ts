/**
 * URL assinada para EXIBIR (`<img>`, `<video>`) arquivo de bucket privado.
 *
 * `<img src>` precisa da URL de forma síncrona; a assinatura é assíncrona. O
 * hook devolve `null` até assinar e depois a URL. Cache em memória por
 * bucket+caminho: a mesma foto numa tabela com 200 linhas é uma assinatura só,
 * e a URL é reaproveitada até faltar `RENOVAR_ANTES_MS` para vencer.
 *
 * Valor gravado pode ser o caminho ou a URL pública antiga inteira
 * (`caminhoNoBucket`). URL externa (outro bucket, link colado) volta como está.
 * Sem React Query de propósito: o hook roda em telas e testes sem
 * `QueryClientProvider`.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { caminhoNoBucket, ehUrlExterna, TTL_EXIBIR_SEGUNDOS } from '../lib/storageAssinado';

const RENOVAR_ANTES_MS = 5 * 60 * 1000;
const cache = new Map<string, { url: string; venceEm: number }>();

const chave = (bucket: string, caminho: string) => `${bucket}\n${caminho}`;

function doCache(bucket: string, caminho: string): string | null {
    const item = cache.get(chave(bucket, caminho));
    if (!item) return null;
    if (item.venceEm - Date.now() < RENOVAR_ANTES_MS) {
        cache.delete(chave(bucket, caminho));
        return null;
    }
    return item.url;
}

function guardar(bucket: string, caminho: string, url: string) {
    cache.set(chave(bucket, caminho), { url, venceEm: Date.now() + TTL_EXIBIR_SEGUNDOS * 1000 });
}

/** Só para testes. */
export function limparCacheDeUrlsAssinadas() {
    cache.clear();
}

/**
 * Várias de uma vez (uma requisição `createSignedUrls`). Devolve um mapa
 * valor-gravado → URL; o que não assinou fica de fora (a tela mostra o
 * substituto de "sem imagem").
 */
export async function assinarParaExibir(bucket: string, valores: (string | null | undefined)[]): Promise<Record<string, string>> {
    const saida: Record<string, string> = {};
    const pendentes = new Map<string, string[]>(); // caminho → valores que apontam para ele
    for (const bruto of valores) {
        const valor = (bruto ?? '').trim();
        if (!valor || valor in saida) continue;
        if (ehUrlExterna(valor, bucket)) {
            saida[valor] = valor;
            continue;
        }
        const caminho = caminhoNoBucket(valor, bucket);
        if (!caminho) continue;
        const emCache = doCache(bucket, caminho);
        if (emCache) {
            saida[valor] = emCache;
            continue;
        }
        pendentes.set(caminho, [...(pendentes.get(caminho) ?? []), valor]);
    }
    if (pendentes.size === 0) return saida;

    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls([...pendentes.keys()], TTL_EXIBIR_SEGUNDOS);
    if (error || !data) {
        console.warn('[useUrlAssinada] assinatura recusada:', error?.message);
        return saida;
    }
    for (const item of data) {
        if (!item.path || !item.signedUrl || item.error) continue;
        guardar(bucket, item.path, item.signedUrl);
        for (const valor of pendentes.get(item.path) ?? []) saida[valor] = item.signedUrl;
    }
    return saida;
}

/** Mapa valor-gravado → URL assinada para uma lista (tabela, galeria). */
export function useUrlsAssinadas(bucket: string, valores: (string | null | undefined)[]): Record<string, string> {
    // Chave estável: a lista nova a cada render não pode disparar nova assinatura.
    const assinatura = useMemo(
        () => [...new Set(valores.map(v => (v ?? '').trim()).filter(Boolean))].sort().join('\n'),
        [valores],
    );
    const [urls, setUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!assinatura) {
            setUrls({});
            return;
        }
        let vivo = true;
        assinarParaExibir(bucket, assinatura.split('\n'))
            .then(mapa => { if (vivo) setUrls(mapa); })
            .catch(() => { if (vivo) setUrls({}); });
        return () => { vivo = false; };
    }, [bucket, assinatura]);

    return urls;
}

/** URL assinada de UM arquivo, ou `null` enquanto assina / se não houver. */
export function useUrlAssinada(bucket: string, valor: string | null | undefined): string | null {
    const lista = useMemo(() => [valor], [valor]);
    const urls = useUrlsAssinadas(bucket, lista);
    const v = (valor ?? '').trim();
    return v ? urls[v] ?? null : null;
}
