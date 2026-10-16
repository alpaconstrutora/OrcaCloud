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
    return !!encontrarRemetenteCadastrado(from, remetentes);
}

/** O cadastro do endereço (ativo ou não, sem palavras-chave): e-mail exato ganha de domínio. */
export function encontrarRemetenteCadastrado<T extends Pick<RemetenteMonitorado, 'tipo' | 'email' | 'dominio'>>(
    from: string | null | undefined,
    remetentes: T[],
): T | null {
    const end = extrairEndereco(from);
    if (!end) return null;
    const exato = remetentes.find(r => r.tipo === 'exato' && !!r.email && r.email.toLowerCase() === end.endereco);
    if (exato) return exato;
    return remetentes.find(r => {
        if (r.tipo !== 'dominio') return false;
        const d = (r.dominio ?? '').toLowerCase().replace(/^@/, '');
        return !!d && (end.dominio === d || end.dominio.endsWith('.' + d));
    }) ?? null;
}

// ─── Padrões do boleto por remetente (16/10/2026) ───────────────────────────
// Pedido: "Ao cadastrar o e-mail do remetente, criar campo para cadastrar também
// os dados para cadastro do boleto (cards Cobrança, Quem recebe, Classificação e
// Observações)". O padrão SÓ preenche o que o PDF não trouxe — nunca troca o que
// veio do boleto. Plano: docs/planos/2026-10-16-captura-padroes-do-remetente.md.

export interface PadroesRemetente {
    padrao_descricao: string | null;
    padrao_observacoes: string | null;
    padrao_project_id: string | null;
    padrao_cost_center_id: string | null;
    padrao_plano_de_contas_id: string | null;
    padrao_category_id: string | null;
    padrao_dia_vencimento: number | null;
    padrao_valor: number | null;
    padrao_multa: number | null;
    padrao_multa_percentual: number | null;
    padrao_juros_dia: number | null;
    padrao_juros_dia_tipo: 'valor' | 'percentual' | null;
}

/** As colunas de `boletos` que um padrão pode preencher. */
export interface CamposParaPadroes {
    vencimento: string | null;
    valor: number | null;
    multa: number | null;
    multa_percentual: number | null;
    juros_dia: number | null;
    juros_dia_tipo: 'valor' | 'percentual' | null;
    descricao: string | null;
    observacoes: string | null;
    project_id: string | null;
    cost_center_id: string | null;
    plano_de_contas_id: string | null;
    category_id: string | null;
}
export type PatchDosPadroes = Partial<CamposParaPadroes>;

export const MOTIVO_VENCIMENTO_DO_PADRAO = 'Vencimento pelo padrão do remetente (o PDF não trouxe): confira antes de aprovar.';
export const MOTIVO_VALOR_DO_PADRAO = 'Valor pelo padrão do remetente (o PDF não trouxe): confira antes de aprovar.';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Data do e-mail (ISO) → AAAA-MM-DD em Brasília. Sem data → `agora`. */
export function dataLocalDoEmail(iso: string | null | undefined, agora: Date = new Date()): string {
    const d = iso ? new Date(iso) : agora;
    const ok = Number.isNaN(d.getTime()) ? agora : d;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ok);
}

/**
 * Primeira data com o dia `dia` na `referencia` (AAAA-MM-DD) ou depois. Mês que
 * não tem o dia (31 em abril, 30 em fevereiro) usa o último dia do mês.
 */
export function vencimentoPeloDia(dia: number, referencia: string): string {
    const [a, m, d] = referencia.split('-').map(Number);
    const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    let ano = a, mes = m;
    let alvo = Math.min(dia, ultimoDia(ano, mes));
    if (alvo < d) {
        mes += 1;
        if (mes > 12) { mes = 1; ano += 1; }
        alvo = Math.min(dia, ultimoDia(ano, mes));
    }
    return `${ano}-${pad2(mes)}-${pad2(alvo)}`;
}

const MARCADOR_MES = /\{\s*m[eéêEÉÊ]s\s*\}/giu;

/** "{mês}" (ou {mes}, {MÊS}) → MM/AAAA do vencimento; sem vencimento, o mês da referência. */
export function descricaoComMes(modelo: string, vencimento: string | null, referencia: string): string {
    const base = vencimento ?? referencia;
    const [ano, mes] = base.split('-');
    return modelo.replace(MARCADOR_MES, `${mes}/${ano}`);
}

/** Inverso, para "Monitorar remetente": o MM/AAAA do vencimento vira "{mês}". */
export function modeloDaDescricao(descricao: string, vencimento: string | null): string {
    if (!vencimento) return descricao;
    const [ano, mes] = vencimento.split('-');
    return descricao.split(`${mes}/${ano}`).join('{mês}');
}

const textoVazio = (v: string | null | undefined) => v == null || String(v).trim() === '';
const idVazio = (v: string | null | undefined) => v == null || v === '';

/**
 * Patch com o que o padrão do remetente preenche — SÓ campos vazios. O patch
 * nunca tem `null`; `campos` diz o que veio do padrão (vai para a auditoria e
 * para a releitura poder trocar pelo valor do PDF).
 */
export function aplicarPadroesDoRemetente(
    boleto: CamposParaPadroes,
    padroes: Partial<PadroesRemetente>,
    dataEmail: string,
): { patch: PatchDosPadroes; campos: Array<keyof CamposParaPadroes> } {
    const patch: PatchDosPadroes = {};

    if (!boleto.vencimento && padroes.padrao_dia_vencimento) {
        patch.vencimento = vencimentoPeloDia(padroes.padrao_dia_vencimento, dataEmail);
    }
    if ((boleto.valor == null || Number(boleto.valor) === 0) && padroes.padrao_valor != null && Number(padroes.padrao_valor) > 0) {
        patch.valor = Number(padroes.padrao_valor);
    }
    // Multa e juros são um GRUPO: se o PDF trouxe qualquer um, o padrão não entra.
    if (boleto.multa == null && boleto.multa_percentual == null && boleto.juros_dia == null) {
        if (padroes.padrao_multa != null) patch.multa = Number(padroes.padrao_multa);
        if (padroes.padrao_multa_percentual != null) patch.multa_percentual = Number(padroes.padrao_multa_percentual);
        if (padroes.padrao_juros_dia != null) {
            patch.juros_dia = Number(padroes.padrao_juros_dia);
            patch.juros_dia_tipo = padroes.padrao_juros_dia_tipo ?? 'valor';
        }
    }
    if (textoVazio(boleto.descricao) && !textoVazio(padroes.padrao_descricao)) {
        patch.descricao = descricaoComMes(padroes.padrao_descricao!.trim(), patch.vencimento ?? boleto.vencimento, dataEmail);
    }
    if (textoVazio(boleto.observacoes) && !textoVazio(padroes.padrao_observacoes)) {
        patch.observacoes = padroes.padrao_observacoes!.trim();
    }
    if (idVazio(boleto.project_id) && padroes.padrao_project_id) patch.project_id = padroes.padrao_project_id;
    if (idVazio(boleto.cost_center_id) && padroes.padrao_cost_center_id) patch.cost_center_id = padroes.padrao_cost_center_id;
    if (idVazio(boleto.plano_de_contas_id) && padroes.padrao_plano_de_contas_id) patch.plano_de_contas_id = padroes.padrao_plano_de_contas_id;
    if (idVazio(boleto.category_id) && padroes.padrao_category_id) patch.category_id = padroes.padrao_category_id;

    return { patch, campos: Object.keys(patch) as Array<keyof CamposParaPadroes> };
}

const GRUPO_MULTA_JUROS: Array<keyof CamposParaPadroes> = ['multa', 'multa_percentual', 'juros_dia', 'juros_dia_tipo'];

function normalizado(v: unknown): unknown {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    return s !== '' && !Number.isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
}

/**
 * Dos campos que a captura gravou pelo padrão, quais o usuário NÃO alterou — a
 * releitura do PDF (senha cadastrada depois) pode trocá-los pelo valor real.
 * Multa e juros andam juntos: mexeu em um, o grupo é do usuário.
 */
export function camposDoPadraoIntactos(
    atual: Partial<CamposParaPadroes>,
    gravado: PatchDosPadroes,
): Array<keyof CamposParaPadroes> {
    const chaves = Object.keys(gravado) as Array<keyof CamposParaPadroes>;
    const igual = (k: keyof CamposParaPadroes) => normalizado(atual[k]) === normalizado(gravado[k]);
    const intactos = chaves.filter(k => !GRUPO_MULTA_JUROS.includes(k) && igual(k));
    if (chaves.some(k => GRUPO_MULTA_JUROS.includes(k)) && GRUPO_MULTA_JUROS.every(igual)) {
        intactos.push(...chaves.filter(k => GRUPO_MULTA_JUROS.includes(k)));
    }
    return intactos;
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
    /** O que veio do PADRÃO do remetente, não do PDF (16/10/2026): nunca autoriza
     *  importação automática — `vencimento` acima continua sendo só o do PDF. */
    doPadrao?: { vencimento?: boolean; valor?: boolean };
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
    if (!e.vencimento) motivos.push(e.doPadrao?.vencimento ? MOTIVO_VENCIMENTO_DO_PADRAO : 'Vencimento ausente ou implausível.');
    if (e.doPadrao?.valor) motivos.push(MOTIVO_VALOR_DO_PADRAO);

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
