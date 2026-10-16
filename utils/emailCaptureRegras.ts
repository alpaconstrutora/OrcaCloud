/**
 * Regras da captura de boletos por e-mail — PURAS (sem rede, sem banco).
 *
 * Usadas pela Edge Function `email-capture-sync` (import direto
 * `../../../utils/emailCaptureRegras.ts`, por isso nenhum import aqui) e
 * testadas no Vitest. Plano: docs/planos/2026-10-15-captura-boletos-por-email.md
 * (item 3.1).
 *
 * O princípio do PRD que estas regras implementam: remetente favorito NÃO torna
 * o boleto confiável. Para um boleto capturado sair de `revisao` sem ninguém
 * olhar, TODAS as pernas abaixo precisam passar — e, mesmo assim, ele só vira
 * `rascunho` com fornecedor; quem cria o título é o usuário ("Aprovar e
 * Lançar", sozinho ou em lote). Importar nunca autoriza pagamento.
 */

export type ResultadoAutenticacao = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror' | 'policy';

export interface AutenticacaoMensagem {
    spf: ResultadoAutenticacao;
    dkim: ResultadoAutenticacao;
    dmarc: ResultadoAutenticacao;
    /** Domínio do From conferido pelo DMARC (`header.from=`), quando houver. */
    headerFrom: string | null;
    /** authserv-id do cabeçalho usado (ex.: mx.google.com), ou null se nenhum confiável. */
    servidor: string | null;
}

export interface RemetenteMonitorado {
    id: string;
    tipo: 'exato' | 'dominio';
    email: string | null;
    dominio: string | null;
    palavras_chave: string[];
    importacao: 'automatica' | 'revisao';
    exigir_dmarc: boolean;
    ativo: boolean;
    supplier_id: string | null;
}

export type ModoCaptura = 'favoritos' | 'todos' | 'hibrido';

/** Servidores cujo Authentication-Results vale, por provedor. */
export const SERVIDORES_CONFIAVEIS = ['mx.google.com'];

const RESULTADOS: ResultadoAutenticacao[] = ['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror', 'policy'];

function resultado(bloco: string, mecanismo: 'spf' | 'dkim' | 'dmarc'): ResultadoAutenticacao {
    const m = bloco.match(new RegExp(`(?:^|[;\\s])${mecanismo}\\s*=\\s*([a-z]+)`, 'i'));
    const v = (m?.[1] ?? 'none').toLowerCase() as ResultadoAutenticacao;
    return RESULTADOS.includes(v) ? v : 'none';
}

/**
 * Lê SPF/DKIM/DMARC dos cabeçalhos `Authentication-Results`, na ordem em que
 * aparecem na mensagem (o de cima é o do último servidor que a recebeu).
 *
 * ⚠️ Só vale o PRIMEIRO cabeçalho cujo authserv-id é um servidor confiável
 * (o Gmail grava `mx.google.com`). Qualquer outro Authentication-Results pode
 * ter vindo pronto do remetente — um fraudador escreve "dmarc=pass" no próprio
 * e-mail de graça. Sem cabeçalho confiável → tudo 'none'.
 */
export function parseAuthenticationResults(
    cabecalhos: string[],
    servidores: string[] = SERVIDORES_CONFIAVEIS,
): AutenticacaoMensagem {
    const vazio: AutenticacaoMensagem = { spf: 'none', dkim: 'none', dmarc: 'none', headerFrom: null, servidor: null };
    for (const bruto of cabecalhos) {
        const bloco = bruto.replace(/\r?\n[ \t]+/g, ' ').trim();
        const servidor = bloco.split(';')[0].trim().split(/\s+/)[0].toLowerCase();
        if (!servidores.includes(servidor)) continue;
        const hf = bloco.match(/dmarc\s*=\s*[a-z]+[^;]*?header\.from\s*=\s*([^\s;]+)/i);
        return {
            spf: resultado(bloco, 'spf'),
            dkim: resultado(bloco, 'dkim'),
            dmarc: resultado(bloco, 'dmarc'),
            headerFrom: hf ? hf[1].toLowerCase() : null,
            servidor,
        };
    }
    return vazio;
}

/** "Fulano <Financeiro@ACME.com.br>" → { endereco: 'financeiro@acme.com.br', dominio: 'acme.com.br' } */
export function extrairEndereco(from: string | null | undefined): { endereco: string; dominio: string } | null {
    if (!from) return null;
    const m = from.match(/<([^<>\s]+@[^<>\s]+)>/) ?? from.match(/([^\s<>"']+@[^\s<>"']+)/);
    if (!m) return null;
    const endereco = m[1].toLowerCase().replace(/[.,;]+$/, '');
    const dominio = endereco.split('@')[1] ?? '';
    return dominio ? { endereco, dominio } : null;
}

function semAcento(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Remetente monitorado que casa com a mensagem. Endereço exato ganha de domínio;
 * domínio casa o próprio e subdomínios (`cobranca.acme.com.br` ⊂ `acme.com.br`).
 * Palavras-chave, quando cadastradas, precisam aparecer no assunto OU no nome
 * do anexo (sem acento, sem caixa).
 */
export function remetenteCasa(
    from: string | null | undefined,
    textoParaPalavras: string,
    remetentes: RemetenteMonitorado[],
): RemetenteMonitorado | null {
    const end = extrairEndereco(from);
    if (!end) return null;
    const alvo = semAcento(textoParaPalavras);
    const passaPalavras = (r: RemetenteMonitorado) =>
        !r.palavras_chave?.length || r.palavras_chave.some(p => p.trim() && alvo.includes(semAcento(p.trim())));

    const ativos = remetentes.filter(r => r.ativo);
    const exato = ativos.find(r => r.tipo === 'exato' && r.email?.toLowerCase() === end.endereco && passaPalavras(r));
    if (exato) return exato;
    return ativos.find(r => {
        if (r.tipo !== 'dominio' || !r.dominio) return false;
        const d = r.dominio.toLowerCase().replace(/^@/, '');
        return (end.dominio === d || end.dominio.endsWith('.' + d)) && passaPalavras(r);
    }) ?? null;
}

/**
 * O endereço já tem cadastro de remetente — e-mail exato, ou domínio (com
 * subdomínio) — ativo ou não, sem olhar palavras-chave (16/10/2026). Serve à tela:
 * o histórico só oferece "Monitorar remetente" a quem ainda não está cadastrado
 * (cadastrar de novo esbarraria na UNIQUE da caixa).
 */
export function remetenteJaCadastrado(
    from: string | null | undefined,
    remetentes: Array<Pick<RemetenteMonitorado, 'tipo' | 'email' | 'dominio'>>,
): boolean {
    const end = extrairEndereco(from);
    if (!end) return false;
    return remetentes.some(r => {
        if (r.tipo === 'exato') return !!r.email && r.email.toLowerCase() === end.endereco;
        const d = (r.dominio ?? '').toLowerCase().replace(/^@/, '');
        return !!d && (end.dominio === d || end.dominio.endsWith('.' + d));
    });
}

/** Modo "favoritos" só processa mensagem de remetente monitorado; os outros processam tudo. */
export function deveProcessar(modo: ModoCaptura, remetente: RemetenteMonitorado | null): boolean {
    return modo === 'favoritos' ? remetente !== null : true;
}

/**
 * PDF sem linha digitável de quem não é monitorado não vira boleto (16/10/2026).
 *
 * A 1ª busca por período real (01/07–16/10, caixa em "híbrido") pôs em revisão
 * nota fiscal, fatura de cartão e invoice pago no cartão — PDFs que não são
 * boleto. Decisão do usuário: "sim" a ignorar o PDF sem linha digitável quando o
 * remetente não é monitorado (aceitando que PDF ESCANEADO de remetente avulso
 * também fica de fora — ele aparece no histórico como ignorado).
 *
 * Vale para "híbrido" e "favoritos"; "todos" continua trazendo qualquer PDF.
 * Remetente escolhido na busca por período conta como monitorado.
 */
export const MOTIVO_PDF_SEM_BOLETO_AVULSO =
    'Sem linha digitável e o remetente não é monitorado: não virou boleto. Para trazer, monitore o remetente e busque o período de novo.';

export function ignorarPdfSemBoleto(e: {
    modo: ModoCaptura;
    remetenteMonitorado: boolean;
    escolhidoNaBusca: boolean;
    temLinhaValida: boolean;
}): boolean {
    if (e.temLinhaValida || e.remetenteMonitorado || e.escolhidoNaBusca) return false;
    return e.modo !== 'todos';
}

export interface EntradaDestino {
    modoPiloto: boolean;
    remetente: RemetenteMonitorado | null;
    auth: AutenticacaoMensagem;
    /** Domínio do From da mensagem (para conferir com o header.from do DMARC). */
    dominioFrom: string | null;
    checksumValido: boolean;
    /** Vencimento já validado (null = ausente ou implausível). */
    vencimento: string | null;
    /** Fornecedores da org com o CPF/CNPJ do beneficiário (find_supplier_in_org_by_document). */
    fornecedoresDoCnpj: string[];
    /** Confiança do CNPJ lido (findBeneficiarioCnpj). */
    cnpjConfianca: number;
}

export interface Destino {
    status: 'rascunho' | 'revisao';
    /** Grava em boletos.supplier_id — só quando `rascunho`. */
    supplierId: string | null;
    /** Grava em boletos.sugestao_supplier_id — a revisão mostra "Sugerido via CNPJ". */
    sugestaoSupplierId: string | null;
    /** Por que foi para revisão (vazio quando `rascunho`). Vai para erros_validacao. */
    motivos: string[];
}

export const CONFIANCA_MINIMA_CNPJ = 70;

/**
 * Para onde vai o boleto capturado. `rascunho` só se TODAS as pernas passam;
 * qualquer falha → `revisao`, com o motivo escrito.
 */
export function decidirDestino(e: EntradaDestino): Destino {
    const motivos: string[] = [];
    const fornecedorUnico = e.cnpjConfianca >= CONFIANCA_MINIMA_CNPJ && e.fornecedoresDoCnpj.length === 1
        ? e.fornecedoresDoCnpj[0]
        : null;

    if (e.modoPiloto) motivos.push('Caixa em modo piloto: todo boleto passa pela revisão.');
    if (!e.remetente) motivos.push('Remetente não está entre os monitorados.');
    else if (e.remetente.importacao !== 'automatica') motivos.push('Remetente configurado para revisão.');

    if (e.remetente?.exigir_dmarc) {
        if (e.auth.dmarc !== 'pass') {
            motivos.push(`Autenticação do e-mail não confirmada (DMARC: ${e.auth.dmarc}).`);
        } else if (e.dominioFrom && e.auth.headerFrom
            && e.dominioFrom !== e.auth.headerFrom && !e.dominioFrom.endsWith('.' + e.auth.headerFrom)) {
            motivos.push('O domínio autenticado não é o do remetente.');
        }
    }

    if (!e.checksumValido) motivos.push('Linha digitável ausente ou com dígito verificador inválido.');
    if (!e.vencimento) motivos.push('Vencimento ausente ou implausível.');

    if (e.cnpjConfianca < CONFIANCA_MINIMA_CNPJ) {
        motivos.push('CNPJ do beneficiário não identificado com segurança.');
    } else if (e.fornecedoresDoCnpj.length === 0) {
        motivos.push('Beneficiário não cadastrado como fornecedor nesta organização.');
    } else if (e.fornecedoresDoCnpj.length > 1) {
        motivos.push('Mais de um fornecedor com o mesmo CNPJ nesta organização.');
    }

    // Mudança de beneficiário habitual (PRD §7): o remetente é do fornecedor X,
    // mas o boleto paga a Y. Golpe clássico de boleto adulterado.
    if (e.remetente?.supplier_id && fornecedorUnico && e.remetente.supplier_id !== fornecedorUnico) {
        motivos.push('O beneficiário do boleto não é o fornecedor deste remetente.');
    }

    // Sem CNPJ identificado no PDF (o reaviso da Energisa não imprime CNPJ), o
    // fornecedor do remetente monitorado vira SUGESTÃO — nunca supplier_id
    // automático (o motivo do CNPJ continua mandando para revisão). Com CNPJ de
    // OUTRO beneficiário não entra: aí é o alerta de beneficiário trocado.
    const sugestao = fornecedorUnico
        ?? (e.cnpjConfianca < CONFIANCA_MINIMA_CNPJ ? (e.remetente?.supplier_id ?? null) : null);
    if (motivos.length) {
        return { status: 'revisao', supplierId: null, sugestaoSupplierId: sugestao, motivos };
    }
    return { status: 'rascunho', supplierId: fornecedorUnico, sugestaoSupplierId: fornecedorUnico, motivos: [] };
}

/** Espera antes da próxima tentativa de um anexo que falhou: 15 min, 1 h, 4 h. */
export function proximaTentativa(tentativas: number, agora = new Date()): Date | null {
    const minutos = [15, 60, 240][tentativas - 1];
    if (minutos === undefined) return null; // passou de 3: para, fica como erro visível
    return new Date(agora.getTime() + minutos * 60_000);
}

/**
 * Palavra-chave que parece SENHA de PDF (16/10/2026): só dígitos, 3 a 14.
 *
 * Caso real: a senha da conta da Energisa foi digitada em "Palavras-chave", o
 * campo logo acima de "Senha dos PDFs". Dois estragos calados: a senha nunca
 * chegou ao cofre (o boleto seguiu ilegível) e o remetente passou a exigir
 * esses dígitos no assunto/anexo — deixou de reconhecer os próprios e-mails.
 * Palavra-chave de verdade é texto ("boleto", "fatura"); número puro com cara
 * de CPF/CNPJ é senha. É aviso, não bloqueio: "2026" pode ser intencional.
 */
export function pareceSenhaDePdf(palavra: string): boolean {
    return /^\d{3,14}$/.test(palavra.trim());
}

// ─── Filtro de remetentes da busca por período (16/10/2026) ─────────────────

export interface FiltroRemetente { tipo: 'email' | 'dominio'; valor: string }

/** Máximo de remetentes numa busca (o pedido IMAP vira um OR por item). */
export const MAX_FILTROS_REMETENTE = 20;

/**
 * "Cobranca@ACME.com.br" → e-mail exato; "acme.com.br" ou "@acme.com.br" → domínio.
 * Qualquer outra coisa → null (a tela recusa com mensagem).
 */
export function normalizarFiltroRemetente(entrada: string): FiltroRemetente | null {
    const s = (entrada ?? '').trim().toLowerCase().replace(/^mailto:/, '');
    if (!s) return null;
    if (/^[^\s@<>"',;]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return { tipo: 'email', valor: s };
    const dom = s.replace(/^@/, '');
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dom)) return { tipo: 'dominio', valor: dom };
    return null;
}

/**
 * O remetente da mensagem está no filtro? Filtro vazio = todos. E-mail compara
 * exato; domínio casa o próprio e subdomínios. O IMAP só filtra por TRECHO do
 * cabeçalho From ("energisaonline.com.br" casaria "falso-energisaonline.com.br"),
 * por isso esta conferência exata depois.
 */
export function remetenteNoFiltro(from: string | null | undefined, filtros: string[] | null | undefined): boolean {
    const fs = (filtros ?? []).map(normalizarFiltroRemetente).filter((f): f is FiltroRemetente => !!f);
    if (!fs.length) return true;
    const end = extrairEndereco(from);
    if (!end) return false;
    return fs.some(f => f.tipo === 'email'
        ? end.endereco === f.valor
        : end.dominio === f.valor || end.dominio.endsWith('.' + f.valor));
}

/** Parte do SEARCH do imapflow para os remetentes: nada, `{ from }` ou `{ or: [...] }`. */
export function criterioImapDosRemetentes(filtros: string[] | null | undefined): Record<string, unknown> {
    const vs = (filtros ?? []).map(normalizarFiltroRemetente).filter((f): f is FiltroRemetente => !!f).map(f => f.valor);
    if (!vs.length) return {};
    if (vs.length === 1) return { from: vs[0] };
    return { or: vs.map(v => ({ from: v })) };
}
