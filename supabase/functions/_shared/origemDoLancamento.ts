// supabase/functions/_shared/origemDoLancamento.ts
//
// O DOCUMENTO DE ORIGEM de um lançamento (`internal_transactions`): o código
// (nº do boleto, da NF-e, do contrato) e o arquivo que o originou (boleto, XML,
// minuta), com o BUCKET junto do path — cada origem guarda no seu.
//
// Compartilhado entre o app (aba Despesas do condomínio, relatório de rateio)
// e a Edge Function `client-portal-rateio-comprovantes`, que assina os mesmos
// arquivos para o condômino. Sem import nenhum, para valer nos dois lados (o
// mesmo desenho de `planta-webhooks/politica.ts`): quem chama passa o próprio
// client — o app passa o `supabase` com a sessão do usuário, a function passa
// a service_role DEPOIS de ter autorizado o acesso pela RPC do portal.
//
// Existe num lugar só porque há dois leitores: uma segunda cópia desta regra na
// function divergiria da primeira no primeiro ajuste, e o mesmo lançamento
// passaria a apontar para dois arquivos — um na tela do síndico, outro no PDF
// do condômino.

/** O mínimo do client do Supabase que a resolução usa — o do app e o da
 *  Edge Function (esm.sh) satisfazem, sem este arquivo importar nenhum dos dois. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteDeLeitura = { from(tabela: string): any };

/** Buckets PRIVADOS de cada origem — a assinatura precisa saber qual. */
export const BUCKET_BOLETOS = 'boletos';
export const BUCKET_FISCAL = 'fiscal-documents';
export const BUCKET_DOCUMENTOS = 'documents';

/** Origens cujo documento é a minuta do contrato. */
export const ORIGENS_DE_CONTRATO = [
    'COMMERCIAL', 'CONTRACT_AVISTA', 'CONTRACT_PARCELADO',
    'CONTRACT_RECURRING', 'CONTRACT_MEASUREMENT',
] as const;

/**
 * O arquivo que originou a despesa, onde quer que ele esteja guardado.
 *
 * Carrega o BUCKET junto do path porque cada origem guarda no seu: boleto em
 * `boletos`, XML de NF-e em `fiscal-documents`. Assinar exige os dois, e
 * deixar o bucket implícito na tela seria espalhar essa decisão por quem
 * apenas exibe.
 */
export interface DocumentoDeOrigem {
    bucket: string;
    path: string;
    nome: string;
}

/** O que a origem de um lançamento oferece à lista: um código e um arquivo. */
export interface OrigemResolvida {
    codigo: string | null;
    documento: DocumentoDeOrigem | null;
}

/**
 * O primeiro UUID que aparece no `reference_id`, em qualquer das grafias.
 *
 * `originIdFromRef` (lib/receivableRef.ts) corta no primeiro `-p` ou `:`, o que
 * resolve `<id>-p2020-11-15` e `<id>:p3` — mas NÃO resolve `tax-<uuid>-p…-pis`,
 * que começa com um prefixo. Medido em 25/09/2026: das 1.245 linhas
 * `COMMERCIAL`, boa parte usa essa terceira grafia. Procurar o UUID por forma,
 * em vez de cortar por posição, atende as três — e devolve `null` em vez de um
 * pedaço de string quando não há UUID nenhum, que é o que gerava 22P02 em
 * `.in()` (ver o aviso em `BankReconciliation.tsx`).
 */
export function uuidDaReferencia(ref?: string | null): string | null {
    const m = String(ref ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0].toLowerCase() : null;
}

/**
 * Número da NF-e (nNF) extraído da chave de acesso.
 *
 * `nfe_invoices` não guarda o número em coluna própria — só `access_key`. A
 * chave tem layout FIXO de 44 dígitos (MOC 6.0, anexo I):
 *
 *   cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 *                                            └ posições 25..33
 *
 * Fora dos 44 dígitos devolve `null` em vez de recortar posição nenhuma: chave
 * truncada existe (veio de OCR em outras telas), e um número inventado na
 * coluna Código é pior que a coluna vazia.
 */
export function numeroDaChaveNfe(chave?: string | null): string | null {
    const limpa = String(chave ?? '').replace(/\D/g, '');
    if (limpa.length !== 44) return null;
    const numero = Number(limpa.slice(25, 34));
    return Number.isFinite(numero) && numero > 0 ? String(numero) : null;
}

/** Último segmento do path, que é o nome do arquivo. Serve de rótulo quando a
 *  origem não guarda um nome próprio (é o caso do XML de NF-e). */
function nomeDoArquivo(path: string): string {
    const partes = path.split('/').filter(Boolean);
    return partes[partes.length - 1] || 'Documento';
}

/**
 * `boleto.id → { código, arquivo }` do documento de origem.
 *
 * O código segue a regra da Conciliação Bancária (`loadOriginCodes`):
 * `String(numero).padStart(4, '0')`.
 *
 * Aqui a chave é o `reference_id` do lançamento porque, na origem BOLETO,
 * ele é o id do boleto puro — sem os sufixos compostos que as origens de
 * contrato usam (ver `lib/receivableRef.ts` e o aviso de 22P02 em
 * `BankReconciliation.tsx`). Por isso esta função não tenta desmontar a
 * referência: se a origem não for BOLETO, ela nem chega aqui.
 *
 * Traz só o PATH do arquivo, nunca uma URL: o bucket é privado e a
 * assinatura vale 15 minutos — assiná-la no carregamento da lista a faria
 * expirar antes do clique.
 */
export async function dadosDoBoleto(db: ClienteDeLeitura, boletoIds: string[]): Promise<Map<string, OrigemResolvida>> {
    const mapa = new Map<string, OrigemResolvida>();
    const ids = [...new Set(boletoIds)];
    if (ids.length === 0) return mapa;

    const { data, error } = await db
        .from('boletos')
        .select('id, numero, documento_path, documento_nome')
        .in('id', ids);
    if (error) throw new Error(`Falha ao carregar os documentos: ${error.message}`);

    for (const b of data || []) {
        const caminho = String(b.documento_path ?? '').trim();
        mapa.set(b.id as string, {
            codigo: b.numero == null ? null : String(b.numero).padStart(4, '0'),
            // Arquivo sem nome ainda é arquivo: o rótulo cai para o nome do
            // arquivo no path, e só então para "Documento" — a linha nunca
            // perde o link por falta de rótulo.
            documento: caminho
                ? { bucket: BUCKET_BOLETOS, path: caminho, nome: String(b.documento_nome ?? '').trim() || nomeDoArquivo(caminho) }
                : null,
        });
    }
    return mapa;
}

/**
 * Origem `NFE` → o XML da nota, em `fiscal-documents`.
 *
 * `reference_id` é o id de `nfe_invoices` (conferido: casa 3 de 3 na base),
 * e o arquivo mora no `raw_document` de onde a nota foi extraída — a nota é
 * o dado normalizado, o XML é o documento. Duas consultas porque o vínculo
 * é `nfe_invoices.raw_document_id`, e o embed do PostgREST aqui já deu
 * PGRST201 por ambiguidade em outras telas.
 */
export async function dadosDaNfe(db: ClienteDeLeitura, nfeIds: string[]): Promise<Map<string, OrigemResolvida>> {
    const mapa = new Map<string, OrigemResolvida>();
    const ids = [...new Set(nfeIds)];
    if (ids.length === 0) return mapa;

    const { data: notas, error } = await db
        .from('nfe_invoices')
        .select('id, raw_document_id, access_key')
        .in('id', ids);
    if (error) throw new Error(`Falha ao carregar as notas: ${error.message}`);

    // O código sai da chave e não depende do XML: nota sem documento bruto
    // ainda mostra o número.
    const porRaw = new Map<string, string[]>();
    for (const n of notas || []) {
        mapa.set(n.id as string, { codigo: numeroDaChaveNfe(n.access_key as string), documento: null });
        const raw = n.raw_document_id as string | null;
        if (!raw) continue;
        if (!porRaw.has(raw)) porRaw.set(raw, []);
        porRaw.get(raw)!.push(n.id as string);
    }
    if (porRaw.size === 0) return mapa;

    const { data: brutos, error: erroBruto } = await db
        .from('raw_documents')
        .select('id, file_path')
        .in('id', [...porRaw.keys()]);
    if (erroBruto) throw new Error(`Falha ao carregar os XMLs: ${erroBruto.message}`);

    for (const r of brutos || []) {
        const caminho = String(r.file_path ?? '').trim();
        if (!caminho) continue;
        for (const nfeId of porRaw.get(r.id as string) || []) {
            const atual = mapa.get(nfeId);
            mapa.set(nfeId, {
                codigo: atual?.codigo ?? null,
                documento: { bucket: BUCKET_FISCAL, path: caminho, nome: nomeDoArquivo(caminho) },
            });
        }
    }
    return mapa;
}

/**
 * Origens de contrato → a minuta, no bucket `documents`.
 *
 * O `reference_id` aponta para DOIS alvos diferentes, conferido na base em
 * 25/09/2026:
 *
 *   COMMERCIAL           → `commercial_deals.id`  (817 de 1.245 casam)
 *   CONTRACT_AVISTA      → `contracts.id`         (11 de 16)
 *   CONTRACT_PARCELADO   → `contracts.id`         (43 de 43)
 *
 * Por isso a busca é pelos dois caminhos e o que casar vale. Do contrato
 * sai o número (coluna Código) e a última versão de documento COM arquivo —
 * há versão de minuta com `storage_path` nulo, que é registro sem arquivo.
 */
export async function dadosDeContrato(db: ClienteDeLeitura, refs: string[]): Promise<Map<string, OrigemResolvida>> {
    const mapa = new Map<string, OrigemResolvida>();
    const porUuid = new Map<string, string[]>();
    for (const ref of refs) {
        const uuid = uuidDaReferencia(ref);
        if (!uuid) continue;
        if (!porUuid.has(uuid)) porUuid.set(uuid, []);
        porUuid.get(uuid)!.push(ref);
    }
    if (porUuid.size === 0) return mapa;
    const uuids = [...porUuid.keys()];

    // Um SELECT só: o contrato casa pelo próprio id OU pelo negócio.
    const { data: contratos, error } = await db
        .from('contracts')
        .select('id, number, deal_id')
        .or(`id.in.(${uuids.join(',')}),deal_id.in.(${uuids.join(',')})`);
    if (error) throw new Error(`Falha ao carregar os contratos: ${error.message}`);

    /** uuid da referência → contrato. */
    const contratoDoUuid = new Map<string, { id: string; number: string | null }>();
    for (const c of contratos || []) {
        const resumo = { id: c.id as string, number: (c.number ?? null) as string | null };
        if (porUuid.has(c.id as string)) contratoDoUuid.set(c.id as string, resumo);
        const deal = (c.deal_id ?? null) as string | null;
        if (deal && porUuid.has(deal)) contratoDoUuid.set(deal, resumo);
    }
    if (contratoDoUuid.size === 0) return mapa;

    const idsDeContrato = [...new Set([...contratoDoUuid.values()].map(c => c.id))];
    const { data: versoes } = await db
        .from('contract_document_versions')
        .select('contract_id, v, name, storage_path')
        .in('contract_id', idsDeContrato)
        .not('storage_path', 'is', null)
        .order('v', { ascending: false });

    /** contrato → a versão mais recente COM arquivo (a lista já vem por `v` desc). */
    const docDoContrato = new Map<string, DocumentoDeOrigem>();
    for (const v of versoes || []) {
        const contrato = v.contract_id as string;
        if (docDoContrato.has(contrato)) continue;
        const caminho = String(v.storage_path ?? '').trim();
        if (!caminho) continue;
        docDoContrato.set(contrato, {
            bucket: BUCKET_DOCUMENTOS,
            path: caminho,
            nome: String(v.name ?? '').trim() || nomeDoArquivo(caminho),
        });
    }

    for (const [uuid, refsDoUuid] of porUuid) {
        const contrato = contratoDoUuid.get(uuid);
        if (!contrato) continue;
        const valor: OrigemResolvida = {
            codigo: contrato.number,
            documento: docDoContrato.get(contrato.id) ?? null,
        };
        for (const ref of refsDoUuid) mapa.set(ref, valor);
    }
    return mapa;
}

/**
 * Código e documento de cada lançamento, UMA entrada por `source_system`.
 *
 * É aqui que uma origem nova entra: um ramo que sabe ler o
 * `reference_id` daquela origem e devolver `{ codigo, documento }`.
 * Cada ramo falha sozinho — uma origem sem permissão de leitura apaga a
 * própria coluna, não a lista inteira.
 */
export async function resolverOrigens(
    db: ClienteDeLeitura,
    linhas: { id: string; source_system?: string | null; reference_id?: string | null }[],
): Promise<Map<string, OrigemResolvida>> {
    const porTransacao = new Map<string, OrigemResolvida>();
    const refsPorOrigem = new Map<string, Map<string, string[]>>();
    for (const l of linhas) {
        const origem = l.source_system || '';
        const ref = l.reference_id || '';
        if (!origem || !ref) continue;
        if (!refsPorOrigem.has(origem)) refsPorOrigem.set(origem, new Map());
        const porRef = refsPorOrigem.get(origem)!;
        if (!porRef.has(ref)) porRef.set(ref, []);
        porRef.get(ref)!.push(l.id);
    }

    const aplicar = (porRef: Map<string, string[]>, ref: string, valor: OrigemResolvida) => {
        for (const txId of porRef.get(ref) || []) porTransacao.set(txId, valor);
    };

    const boletos = refsPorOrigem.get('BOLETO');
    if (boletos) {
        try {
            const dados = await dadosDoBoleto(db, [...boletos.keys()]);
            for (const [ref, valor] of dados) aplicar(boletos, ref, valor);
        } catch {
            // Só apaga as colunas Código e Documento das linhas de boleto.
        }
    }

    const notas = refsPorOrigem.get('NFE');
    if (notas) {
        try {
            const dados = await dadosDaNfe(db, [...notas.keys()]);
            for (const [ref, valor] of dados) aplicar(notas, ref, valor);
        } catch {
            // Idem, para as linhas de NF-e.
        }
    }

    // Origens de contrato: todas caem no MESMO resolvedor, porque o
    // documento é o mesmo (a minuta) — só a grafia da referência muda.
    const refsDeContrato = new Map<string, string[]>();
    for (const origem of ORIGENS_DE_CONTRATO) {
        for (const [ref, txIds] of refsPorOrigem.get(origem) || []) {
            if (!refsDeContrato.has(ref)) refsDeContrato.set(ref, []);
            refsDeContrato.get(ref)!.push(...txIds);
        }
    }
    if (refsDeContrato.size > 0) {
        try {
            const dados = await dadosDeContrato(db, [...refsDeContrato.keys()]);
            for (const [ref, valor] of dados) aplicar(refsDeContrato, ref, valor);
        } catch {
            // Idem, para as linhas de contrato.
        }
    }

    // Demais origens: sem arquivo hoje. Ver o comentário de `documento` em
    // `LancamentoDoCondominio` (services/condominioRateioService.ts) para a
    // medição que sustenta isso.
    return porTransacao;
}
