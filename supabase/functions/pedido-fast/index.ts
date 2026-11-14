// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// @ts-ignore
import { decode as deBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { exigirUsuario } from "../_shared/auth.ts"
import {
    BUCKET, RAIZ_TEMPORARIA, IDADE_MAXIMA_DO_LOTE_MS, TIPOS_DE_IMAGEM,
    ARQUIVO_DA_LEITURA, ARQUIVO_DO_RESULTADO,
    validarPedido, pastaDoLote, pathDaFotoTemporaria, indiceDaFoto, pathDoAnexo,
    hojeEmBrasilia, nomeDoComprador, destinatariosDoAviso,
    type FotoRecebida,
} from "./regras.ts"
import { lerFotos } from "./leitura.ts"
import {
    leituraVazia, normalizarLeitura, montarPedidoFast, itensDaLeitura, conferirTotal,
    digitosDoDocumento, documentoComMascara, tipoDoFornecedor, nomeParaCasar, categoriaDoAnexo,
    type LeituraFast, type ResultadoDoPedidoFast,
} from "../../../lib/pedidoFast.ts"
import { criarNumeracao } from "../../../services/documentNumbering/motor.ts"
import { isObra } from "../../../utils/projectClassification.ts"
import { isSystemProject } from "../../../utils/systemProjects.ts"

/**
 * pedido-fast — Pedido Fast de Suprimentos (compra de balcão: foto + obra).
 * Plano: docs/planos/2026-11-14-pedido-fast.md.
 *
 *   ler   { fotos[1..3] }        → guarda as fotos num lote temporário do
 *                                   usuário, lê com a IA e guarda leitura.json.
 *                                   Devolve { lote, leitura, falha }.
 *   criar { lote, projectId }    → cria o pedido (Entregue, FOB, origem FAST,
 *                                   criado_por = comprador), anexa as fotos,
 *                                   avisa donos/admins. Idempotente por lote.
 *
 * ⚠️ AUTORIZAÇÃO NO CÓDIGO (REGRA #7, pergunta 3) — deploy com --no-verify-jwt:
 *   · app logado: JWT de usuário validado por `exigirUsuario` (a chave anon
 *     sozinha não passa no getUser → 401);
 *   · quem pode pedir decide o BANCO: `fn_pode_criar_pedido_em_alguma_de`
 *     (ler) e `fn_pode_criar_pedido_de(user, org da obra)` (criar);
 *   · o lote é SEMPRE `fast-tmp/<usuário autorizado>/<lote>` — o cliente manda
 *     só o uuid do lote, nunca um path; e a leitura que vira pedido é a que a
 *     Edge guardou, não uma que o navegador reenvie.
 *   · Parte 2 (link do celular, `token` no corpo) ainda não ligada: recusa 400.
 */

declare const Deno: { env: { get(key: string): string | undefined } };
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Admin = any;

interface ArquivoDaLeitura {
    versao: 1;
    leitura: LeituraFast;
    falha: { codigo: string; motivo: string } | null;
    modelo: string | null;
    lidaEm: string;
    fotos: { path: string; mediaType: string; bytes: number }[];
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    // Sem Authorization nenhum: 401 antes de ler o corpo (prova pós-deploy).
    if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);

    let corpo: unknown;
    try { corpo = await req.json(); } catch { return json({ error: 'Corpo inválido.' }, 400); }
    const validado = validarPedido(corpo);
    if (!validado.ok) return json({ error: validado.erro }, 400);
    const pedido = validado.pedido;

    if (pedido.token) {
        return json({ error: 'O Pedido Fast pelo link do celular ainda não está disponível.' }, 400);
    }
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return json({ error: usuario.erro }, usuario.status);

    const admin: Admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    try {
        if (pedido.acao === 'ler') {
            const { data: pode, error } = await admin.rpc('fn_pode_criar_pedido_em_alguma_de', { p_user: usuario.userId });
            if (error) throw error;
            if (pode !== true) return json({ error: 'Você não tem acesso a Pedidos de Compra.' }, 403);
            return await acaoLer(admin, usuario.userId, pedido.fotos);
        }
        return await acaoCriar(admin, usuario.userId, usuario.email, pedido.lote, pedido.projectId);
    } catch (e) {
        console.error('[pedido-fast] falha:', e);
        return json({ error: 'Falha ao processar o Pedido Fast. Tente de novo.' }, 500);
    }
});

// ── ler ──────────────────────────────────────────────────────────────────────
async function acaoLer(admin: Admin, userId: string, fotos: FotoRecebida[]): Promise<Response> {
    const lote = crypto.randomUUID();
    const pasta = pastaDoLote(userId, lote);

    // Subir as fotos e ler com a IA em paralelo: a foto guardada é o que garante
    // que a compra não se perde, mesmo se a leitura falhar.
    const subir = Promise.all(fotos.map(async (f, i) => {
        const path = pathDaFotoTemporaria(userId, lote, i, f.mediaType);
        const bytes = deBase64(f.base64) as Uint8Array;
        const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: f.mediaType, upsert: false });
        if (error) throw new Error(`Falha ao guardar a foto: ${error.message}`);
        return { path, mediaType: f.mediaType, bytes: bytes.length };
    }));
    const [guardadas, lida] = await Promise.all([subir, lerFotos(fotos)]);

    const arquivo: ArquivoDaLeitura = {
        versao: 1,
        leitura: lida.ok ? lida.leitura : leituraVazia(),
        falha: lida.ok ? null : { codigo: lida.codigo, motivo: lida.motivo },
        modelo: lida.ok ? lida.modelo : null,
        lidaEm: new Date().toISOString(),
        fotos: guardadas,
    };
    await gravarJson(admin, `${pasta}/${ARQUIVO_DA_LEITURA}`, arquivo);

    limparLotesVelhos(admin, userId, lote);

    return json({ lote, leitura: arquivo.leitura, falha: arquivo.falha });
}

// ── criar ────────────────────────────────────────────────────────────────────
async function acaoCriar(admin: Admin, userId: string, email: string, lote: string, projectId: string): Promise<Response> {
    const pasta = pastaDoLote(userId, lote);

    // Idempotente: o mesmo lote devolve o mesmo pedido (toque duplo, rede que caiu).
    const jaCriado = await lerJson<ResultadoDoPedidoFast>(admin, `${pasta}/${ARQUIVO_DO_RESULTADO}`);
    if (jaCriado) return json(jaCriado);

    const arquivo = await lerJson<ArquivoDaLeitura>(admin, `${pasta}/${ARQUIVO_DA_LEITURA}`);
    if (!arquivo) return json({ error: 'As fotos desta compra não foram encontradas (mais de 24 h?). Tire a foto de novo.' }, 404);
    const leitura = normalizarLeitura(arquivo.leitura);

    // Obra: só OBRA, nunca projeto de sistema (REGRAS #2 e #3), e a org decide quem pode.
    const { data: obra, error: errObra } = await admin
        .from('projects')
        .select('id, name, organization_id, settings')
        .eq('id', projectId)
        .maybeSingle();
    if (errObra) throw errObra;
    if (!obra || !isObra(obra) || isSystemProject(obra)) return json({ error: 'Obra não encontrada.' }, 404);
    const orgId: string | null = obra.organization_id ?? null;
    if (!orgId) return json({ error: 'A obra escolhida não está vinculada a uma organização.' }, 422);

    const { data: pode, error: errPode } = await admin.rpc('fn_pode_criar_pedido_de', { p_user: userId, p_org: orgId });
    if (errPode) throw errPode;
    if (pode !== true) return json({ error: 'Você não pode fazer pedidos nesta obra.' }, 403);

    // Quem comprou (nome para as observações e o aviso).
    const { data: perfil } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
    let { data: membro } = await admin.from('organization_members').select('name')
        .eq('organization_id', orgId).eq('user_id', userId).limit(1).maybeSingle();
    if (!membro) {
        ({ data: membro } = await admin.from('organization_members').select('name')
            .eq('organization_id', orgId).eq('email', email.toLowerCase()).limit(1).maybeSingle());
    }
    const compradorNome = nomeDoComprador(perfil?.name, membro?.name, email);

    const fornecedor = await resolverFornecedor(admin, orgId, leitura);

    // Número pela Nomenclatura — o MESMO motor do navegador (services/documentNumbering/motor.ts).
    const numeracao = criarNumeracao(admin, async (org, tipo, scopeKey) => {
        const { data, error } = await admin.rpc('fn_next_document_seq_de', {
            p_user: userId, p_org_id: org, p_doc_type: tipo, p_scope_key: scopeKey,
        });
        if (error) throw new Error(`Falha ao gerar o número do pedido: ${error.message}`);
        return Number(data);
    });
    const numero = await numeracao.gerar('PURCHASE_ORDER', orgId, { projectId, supplierId: fornecedor.id });

    const { data: colaborador } = await admin
        .from('employees').select('id')
        .eq('user_id', userId).eq('org_id', orgId).eq('status', 'ATIVO')
        .limit(1).maybeSingle();

    const agora = new Date();
    const linha = montarPedidoFast({
        numero,
        projectId,
        supplierId: fornecedor.id,
        leitura,
        compradorUserId: userId,
        compradorNome,
        retiradoPorEmployeeId: colaborador?.id ?? null,
        fornecedorIdentificado: !!fornecedor.id,
        falhaDaLeitura: arquivo.falha?.motivo ?? null,
        hoje: hojeEmBrasilia(agora),
        agora: agora.toISOString(),
    });
    const { data: criado, error: errPedido } = await admin
        .from('purchase_orders').insert(linha).select('id, number').single();
    if (errPedido) {
        if (errPedido.code === '23505') {
            return json({ error: `Já existe um pedido com o número ${numero}. Confira o código da obra em Obra › Editar.` }, 409);
        }
        throw errPedido;
    }

    await anexarFotos(admin, criado.id, numero, arquivo, leitura, userId, compradorNome);

    const itens = itensDaLeitura(leitura);
    const conferencia = conferirTotal(leitura, itens);
    const resultado: ResultadoDoPedidoFast = {
        pedidoId: criado.id,
        numero: criado.number ?? numero,
        fornecedorNome: fornecedor.nome,
        fornecedorCadastrado: fornecedor.cadastrado,
        itens,
        total: conferencia.somaDosItens,
        leituraFalhou: !!arquivo.falha || itens.length === 0,
        totalConfere: conferencia.confere,
    };
    await gravarJson(admin, `${pasta}/${ARQUIVO_DO_RESULTADO}`, resultado);
    await admin.storage.from(BUCKET).remove([`${pasta}/${ARQUIVO_DA_LEITURA}`]);

    await avisarGestores(admin, orgId, email, resultado, obra.name ?? 'obra', compradorNome);

    return json(resultado);
}

/** CNPJ/CPF lido → cadastro da org; sem documento → nome exato (normalizado); senão cadastra. */
async function resolverFornecedor(
    admin: Admin, orgId: string, leitura: LeituraFast,
): Promise<{ id: string | null; nome: string | null; cadastrado: boolean }> {
    const digitos = digitosDoDocumento(leitura.fornecedor.cnpj_cpf);
    const nomeLido = leitura.fornecedor.nome.trim();

    if (digitos) {
        const { data, error } = await admin.rpc('find_supplier_in_org_by_document', {
            p_organization_id: orgId, p_document: digitos,
        });
        if (error) throw error;
        const achado = (data ?? [])[0] as { id: string; name: string } | undefined;
        if (achado) return { id: achado.id, nome: achado.name, cadastrado: false };
    } else if (nomeLido) {
        const { data, error } = await admin
            .from('suppliers').select('id, name').eq('organization_id', orgId).limit(5000);
        if (error) throw error;
        const alvo = nomeParaCasar(nomeLido);
        const achado = ((data ?? []) as { id: string; name: string }[]).find(s => nomeParaCasar(s.name) === alvo);
        if (achado) return { id: achado.id, nome: achado.name, cadastrado: false };
    }

    if (!digitos && !nomeLido) return { id: null, nome: null, cadastrado: false };

    // Decisão do usuário (14/11/2026): CNPJ que não está cadastrado → cadastra sozinho.
    const nome = nomeLido || `Fornecedor ${documentoComMascara(digitos)}`;
    const { data: novo, error } = await admin
        .from('suppliers')
        .insert({
            organization_id: orgId,
            name: nome,
            document: digitos ? documentoComMascara(digitos) : null,
            type: tipoDoFornecedor(digitos),
            category: 'Geral',
        })
        .select('id, name')
        .single();
    if (error) {
        console.error('[pedido-fast] não cadastrou o fornecedor:', error.message);
        return { id: null, nome: nomeLido || null, cadastrado: false };
    }
    return { id: novo.id, nome: novo.name, cadastrado: true };
}

/** Move as fotos do lote para a pasta do pedido e cria as linhas de Documentos. */
async function anexarFotos(
    admin: Admin, orderId: string, numero: string, arquivo: ArquivoDaLeitura, leitura: LeituraFast,
    userId: string, compradorNome: string,
): Promise<void> {
    const categoria = categoriaDoAnexo(leitura.tipo_documento);
    for (const foto of arquivo.fotos) {
        const nome = foto.path.split('/').pop() ?? '';
        const indice = indiceDaFoto(nome);
        if (indice === null) continue;
        const ext = TIPOS_DE_IMAGEM[foto.mediaType] ?? 'jpg';
        const destino = pathDoAnexo(orderId, crypto.randomUUID(), numero, indice, ext);
        const { error: errMove } = await admin.storage.from(BUCKET).move(foto.path, destino);
        if (errMove) { console.error('[pedido-fast] não moveu a foto:', errMove.message); continue; }
        const { error } = await admin.from('purchase_order_documents').insert({
            order_id: orderId,
            categoria,
            descricao: arquivo.fotos.length > 1 ? `Foto da compra (${indice + 1} de ${arquivo.fotos.length}) — Pedido Fast` : 'Foto da compra — Pedido Fast',
            file_path: destino,
            file_name: destino.split('/').pop(),
            mime_type: foto.mediaType,
            size_bytes: foto.bytes,
            enviado_por_lado: 'COMPRADOR',
            enviado_por: compradorNome,
            uploaded_by: userId,
        });
        if (error) console.error('[pedido-fast] não registrou o anexo:', error.message);
    }
}

/** Decisão do usuário (14/11/2026): o aviso vai para donos e admins da org da obra. */
async function avisarGestores(
    admin: Admin, orgId: string, emailDoComprador: string, r: ResultadoDoPedidoFast, obraNome: string, compradorNome: string,
): Promise<void> {
    const { data: membros, error } = await admin
        .from('organization_members').select('email, role').eq('organization_id', orgId).in('role', ['owner', 'admin']);
    if (error) { console.error('[pedido-fast] não leu os gestores:', error.message); return; }
    const destinatarios = destinatariosDoAviso(membros ?? [], emailDoComprador);
    if (destinatarios.length === 0) return;
    const valor = `R$ ${r.total.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    const partes = [
        `${r.numero} · ${obraNome}`,
        `comprado por ${compradorNome}`,
        r.leituraFalhou ? 'itens a lançar (leitura da foto falhou)' : `${r.itens.length} ${r.itens.length === 1 ? 'item' : 'itens'} · ${valor}`,
        r.fornecedorNome ? `fornecedor ${r.fornecedorNome}` : 'fornecedor a conferir',
    ];
    const { error: errAviso } = await admin.from('notifications').insert(destinatarios.map(e => ({
        recipient_email: e,
        title: 'Novo Pedido Fast',
        message: `${partes.join(' · ')}. Confira os itens antes de Receber.`,
        link: `/supplies-orders?pedido=${r.pedidoId}`,
        type: 'pedido_fast_criado',
        organization_id: orgId,
    })));
    if (errAviso) console.error('[pedido-fast] não avisou os gestores:', errAviso.message);
}

// ── storage ──────────────────────────────────────────────────────────────────
async function gravarJson(admin: Admin, path: string, valor: unknown): Promise<void> {
    const corpo = new Blob([JSON.stringify(valor)], { type: 'application/json' });
    const { error } = await admin.storage.from(BUCKET).upload(path, corpo, { contentType: 'application/json', upsert: true });
    if (error) throw new Error(`Falha ao guardar o lote: ${error.message}`);
}

async function lerJson<T>(admin: Admin, path: string): Promise<T | null> {
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    try { return JSON.parse(await data.text()) as T; } catch { return null; }
}

/** Best-effort, sem segurar a resposta: apaga lotes do usuário com mais de 24 h. */
function limparLotesVelhos(admin: Admin, userId: string, loteAtual: string): void {
    const tarefa = (async () => {
        const raiz = `${RAIZ_TEMPORARIA}/${userId}`;
        const { data: lotes } = await admin.storage.from(BUCKET).list(raiz, { limit: 100 });
        const limite = Date.now() - IDADE_MAXIMA_DO_LOTE_MS;
        for (const l of (lotes ?? []) as { name: string }[]) {
            if (l.name === loteAtual) continue;
            const { data: arquivos } = await admin.storage.from(BUCKET).list(`${raiz}/${l.name}`, { limit: 20 });
            const lista = (arquivos ?? []) as { name: string; created_at?: string }[];
            if (lista.length === 0) continue;
            const maisNovo = Math.max(...lista.map(a => (a.created_at ? Date.parse(a.created_at) : Date.now())));
            if (maisNovo < limite) {
                await admin.storage.from(BUCKET).remove(lista.map(a => `${raiz}/${l.name}/${a.name}`));
            }
        }
    })().catch(e => console.error('[pedido-fast] limpeza de lotes:', e));
    try { EdgeRuntime?.waitUntil(tarefa); } catch { /* sem EdgeRuntime: a promessa segue solta */ }
}
