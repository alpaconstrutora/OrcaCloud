/**
 * Boletos a Pagar › captura por e-mail — uma seção por aba (16/10/2026):
 *   caixas    → caixas conectadas + remetentes monitorados (configuração);
 *   buscas    → leituras retroativas por período;
 *   historico → cada PDF lido e o que aconteceu com ele, por período.
 * Antes eram quatro tabelas empilhadas numa aba só; três delas crescem.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 4.2 e
 * "abas na tela de captura").
 *
 * Não existe "Caixa de Entrada" separada: o boleto capturado é uma linha de
 * Boletos a Pagar (origem = e-mail) e a revisão é o filtro "Em revisão" da aba
 * Boletos.
 *
 * REGRA #5: lê de `useOrgContext` (null = "Todas"); conectar caixa pede UMA org
 * (`resolveWriteOrg('single')`) porque a caixa tem dona.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Mail, Plus, RefreshCw, KeyRound, Pause, Play, FlaskConical, Inbox, Users, History,
    CheckCircle2, Copy as CopyIcon, AlertTriangle, Loader2, CalendarSearch, ListFilter, EyeOff, UserX, FileCheck2,
} from 'lucide-react';
import { SegmentedProgress } from '../ui/SegmentedProgress';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { KpiCard } from '../ui/KpiCard';
import SecaoTitulo from '../ui/SecaoTitulo';
import { FilterPopover } from '../ui/FilterPopover';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { formatDateBR, formatDateTimeBR } from '../ui/Format';
import { supplierService } from '../../services/supplierService';
import { remetenteJaCadastrado } from '../../utils/emailCaptureRegras';
import {
    emailCaptureService,
    ROTULO_MODO,
    ROTULO_RESULTADO,
    ROTULO_STATUS_CONTA,
    ROTULO_ATALHO_PERIODO,
    periodoDoAtalho,
    type AtalhoPeriodo,
    type PeriodoHistorico,
    type ContaCaptura,
    type MensagemCaptura,
    type RemetenteCaptura,
    type RemetenteRascunho,
    type StatusConta,
    type ResultadoMensagem,
    type BuscaPeriodo,
    ROTULO_STATUS_BUSCA,
    progressoDaBusca,
} from '../../services/emailCaptureService';
import type { SecaoCaptura } from './abasBoletos';
import EmailCaptureAccountSheet from './EmailCaptureAccountSheet';
import EmailCaptureBuscaSheet from './EmailCaptureBuscaSheet';
import EmailCaptureRegraSheet from './EmailCaptureRegraSheet';
import EmailCaptureSenderSheet, { type FornecedorDaOrg, type ResultadoDosPadroes } from './EmailCaptureSenderSheet';
import type { Boleto } from '../../types';

const COR_STATUS: Record<StatusConta, string> = {
    ativa: 'text-emerald-700', pausada: 'text-gray-600', reautenticar: 'text-red-600', desconectada: 'text-gray-500',
};
const COR_RESULTADO: Record<ResultadoMensagem, string> = {
    processando: 'text-blue-600', criado: 'text-emerald-700', duplicado: 'text-gray-600', ignorado: 'text-gray-500', erro: 'text-red-600',
};

// Larguras: as tabelas somam ~1240px com "Ações" — a área útil do card com a
// sidebar aberta num viewport de 1600 (guia §6.1.1). Medido no harness em 15/10/2026:
// com as larguras anteriores (1360–1470px) as ações saíam pela borda.
const COLS_CONTAS: StandardTableColumn[] = [
    { key: 'usuario', label: 'Caixa', sortable: true, width: 220 },
    { key: 'organizacao', label: 'Organização', sortable: true, width: 142 },
    { key: 'status', label: 'Status', sortable: true, width: 110 },
    { key: 'modo', label: 'Remetentes lidos', sortable: true, width: 170 },
    { key: 'piloto', label: 'Piloto', sortable: true, width: 80 },
    { key: 'data_inicial', label: 'Lê desde', sortable: true, width: 110 },
    { key: 'last_sync_at', label: 'Última leitura', sortable: true, width: 140 },
    { key: 'ultimo_erro', label: 'Último erro', sortable: true, width: 132 },
];

const COLS_BUSCAS: StandardTableColumn[] = [
    { key: 'caixa', label: 'Caixa', sortable: true, width: 170 },
    { key: 'periodo', label: 'Período', sortable: true, width: 180 },
    { key: 'remetentes', label: 'Remetentes', sortable: true, width: 170 },
    { key: 'status', label: 'Situação', sortable: true, width: 120 },
    { key: 'progresso', label: 'Progresso', sortable: true, width: 170 },
    { key: 'resultado', label: 'Resultado', sortable: false, width: 200 },
    { key: 'pedida_por', label: 'Pedida por', sortable: true, width: 120 },
];

const COR_BUSCA: Record<BuscaPeriodo['status'], string> = {
    pendente: 'text-blue-700', em_andamento: 'text-blue-700', concluida: 'text-emerald-700', cancelada: 'text-gray-500', erro: 'text-red-600',
};
const dataBR = (d: string) => d.split('-').reverse().join('/');
/** Data LOCAL em AAAA-MM-DD — `toISOString()` é UTC e, depois das 21h em Brasília, já dá o dia seguinte. */
const hojeLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const COLS_REMETENTES: StandardTableColumn[] = [
    { key: 'nome', label: 'Remetente', sortable: true, width: 160 },
    { key: 'endereco', label: 'E-mail ou domínio', sortable: true, width: 210 },
    { key: 'fornecedor', label: 'Fornecedor', sortable: true, width: 170 },
    { key: 'caixa', label: 'Caixa', sortable: true, width: 160 },
    { key: 'palavras', label: 'Palavras-chave', sortable: true, width: 120 },
    { key: 'senha', label: 'Senha do PDF', sortable: true, width: 120 },
    { key: 'importacao', label: 'Importação', sortable: true, width: 110 },
    { key: 'ativo', label: 'Situação', sortable: true, width: 100 },
];

const COLS_MENSAGENS: StandardTableColumn[] = [
    { key: 'data', label: 'Recebido em', sortable: true, width: 140 },
    { key: 'remetente', label: 'Remetente', sortable: true, width: 190 },
    { key: 'assunto', label: 'Assunto', sortable: true, width: 190 },
    { key: 'anexo', label: 'Anexo', sortable: true, width: 150 },
    { key: 'dmarc', label: 'DMARC', sortable: true, width: 90 },
    { key: 'resultado', label: 'Resultado', sortable: true, width: 140 },
    { key: 'motivo', label: 'Detalhe', sortable: true, width: 160 },
];

/** Filtro rápido de resultado (guia §5.4) — derivado do mapa de rótulos, primeira opção = sem recorte. */
const OPCOES_RESULTADO: { value: ResultadoMensagem | ''; label: string }[] = [
    { value: '', label: 'Todos' },
    ...(Object.entries(ROTULO_RESULTADO) as [ResultadoMensagem, string][]).map(([value, label]) => ({ value, label })),
];

const MSG_DO_IGNORADO = 'Remetente salvo. Para trazer os PDFs dele que ficaram de fora, busque o período de novo na aba Buscas por período.';

interface Props {
    /** Qual aba da captura está aberta (`components/boletos/abasBoletos.ts`). */
    secao: SecaoCaptura;
    /** Abre o boleto criado a partir de uma mensagem (o pai troca para o formulário). */
    onAbrirBoleto?: (boletoId: string) => void;
    /** Algo que muda os contadores das abas aconteceu (busca, sincronização). */
    onResumoMudou?: () => void;
    /** Boletos em revisão que receberam os padrões do remetente ao salvar (16/10/2026). */
    onBoletosAtualizados?: (boletos: Boleto[]) => void;
}

const EmailCapturaConfig: React.FC<Props> = ({ secao, onAbrirBoleto, onResumoMudou, onBoletosAtualizados }) => {
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const organizations = useStore(s => s.organizations);
    const confirm = useConfirm();
    const { showToast, localToast } = useToast();

    const [contas, setContas] = useState<ContaCaptura[]>([]);
    const [remetentes, setRemetentes] = useState<RemetenteCaptura[]>([]);
    const [mensagens, setMensagens] = useState<MensagemCaptura[]>([]);
    const [buscas, setBuscas] = useState<BuscaPeriodo[]>([]);
    const [sheetBusca, setSheetBusca] = useState<{ aberto: boolean; conta: ContaCaptura | null }>({ aberto: false, conta: null });
    const [sheetRegra, setSheetRegra] = useState<ContaCaptura | null>(null);
    const [fornecedores, setFornecedores] = useState<FornecedorDaOrg[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [carregandoHistorico, setCarregandoHistorico] = useState(false);
    const [erroCarga, setErroCarga] = useState<string | null>(null);
    const [sincronizando, setSincronizando] = useState<string | null>(null);

    const [sheetConta, setSheetConta] = useState<{ aberto: boolean; orgId: string | null; reconectar: ContaCaptura | null }>({ aberto: false, orgId: null, reconectar: null });
    const [sheetRemetente, setSheetRemetente] = useState<{ aberto: boolean; remetente: RemetenteCaptura | null; prefill: Partial<RemetenteRascunho> | null; doIgnorado?: boolean }>({ aberto: false, remetente: null, prefill: null });

    // ─── histórico: período (escopo §5.3) e resultado (recorte §5.4) ──────────
    const [atalho, setAtalho] = usePersistedState<AtalhoPeriodo | 'personalizado'>('boletos:captura:historico:periodo', '30');
    const [deCustom, setDeCustom] = usePersistedState<string>('boletos:captura:historico:de', '');
    const [ateCustom, setAteCustom] = usePersistedState<string>('boletos:captura:historico:ate', '');
    const [filtroResultado, setFiltroResultado] = usePersistedState<ResultadoMensagem | ''>('boletos:captura:historico:resultado', '');

    const periodoAtalho = atalho === 'personalizado' ? null : periodoDoAtalho(atalho, hojeLocal());
    const deMostrado = atalho === 'personalizado' ? deCustom : periodoAtalho?.de ?? '';
    const ateMostrado = atalho === 'personalizado' ? ateCustom : periodoAtalho?.ate ?? '';
    const periodoInvalido = atalho === 'personalizado' && (!deCustom || !ateCustom || deCustom > ateCustom);
    /** null = todo o histórico; undefined = datas incompletas (não consulta). */
    const periodo: PeriodoHistorico | null | undefined = periodoInvalido
        ? undefined
        : atalho === 'personalizado' ? { de: deCustom, ate: ateCustom } : periodoAtalho;
    const chavePeriodo = periodo === undefined ? 'invalido' : periodo ? `${periodo.de}|${periodo.ate}` : 'tudo';

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErroCarga(null);
        try {
            const [c, r, f, b] = await Promise.all([
                emailCaptureService.listarContas(orgId),
                emailCaptureService.listarRemetentes(orgId),
                supplierService.listSuppliers(orgId ?? undefined).catch(() => []),
                // Buscas por período não podem derrubar a aba se falharem.
                emailCaptureService.listarBuscas(orgId).catch(() => [] as BuscaPeriodo[]),
            ]);
            setBuscas(b);
            setContas(c);
            setRemetentes(r);
            setFornecedores(f.map(s => ({ id: s.id, name: s.name, nickname: s.nickname, document: s.document, category: s.category, organization_id: s.organization_id ?? null })));
        } catch (e) {
            setErroCarga(e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, [orgId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Resposta fora de ordem (troca rápida de período) não sobrescreve a mais nova.
    const seqHistorico = useRef(0);
    const carregarHistorico = useCallback(async () => {
        if (secao !== 'historico' || chavePeriodo === 'invalido') return;
        const seq = ++seqHistorico.current;
        const [de, ate] = chavePeriodo === 'tudo' ? [] : chavePeriodo.split('|');
        setCarregandoHistorico(true);
        try {
            const m = await emailCaptureService.listarMensagens(orgId, de && ate ? { de, ate } : null);
            if (seq === seqHistorico.current) setMensagens(m);
        } catch (e) {
            if (seq === seqHistorico.current) setErroCarga(e instanceof Error ? e.message : String(e));
        } finally {
            if (seq === seqHistorico.current) setCarregandoHistorico(false);
        }
    }, [orgId, secao, chavePeriodo]);

    useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

    const nomeOrg = useMemo(() => Object.fromEntries((organizations ?? []).map(o => [o.id, o.name])), [organizations]);
    const nomeFornecedor = useMemo(() => Object.fromEntries(fornecedores.map(f => [f.id, f.nickname || f.name])), [fornecedores]);
    const caixaPorId = useMemo(() => Object.fromEntries(contas.map(c => [c.id, c.usuario])), [contas]);
    const contasVisiveis = useMemo(() => contas.filter(c => c.status !== 'desconectada'), [contas]);
    const contasAtivas = useMemo(() => contas.filter(c => c.status === 'ativa'), [contas]);
    // `rows` estável para a paginação (guia §6.7): o reset de página vem da identidade do array.
    const mensagensFiltradas = useMemo(
        () => (filtroResultado ? mensagens.filter(m => m.resultado === filtroResultado) : mensagens),
        [mensagens, filtroResultado],
    );

    const kpisCaixas = useMemo(() => ({
        ativas: contasAtivas.length,
        reconectar: contas.filter(c => c.status === 'reautenticar').length,
        remetentes: remetentes.length,
        remetentesAtivos: remetentes.filter(r => r.ativo).length,
        comSenha: remetentes.filter(r => r.pdf_senha_atualizada_em).length,
        semFornecedor: remetentes.filter(r => !r.supplier_id).length,
    }), [contas, contasAtivas, remetentes]);

    const kpisBuscas = useMemo(() => ({
        andamento: buscas.filter(b => b.status === 'pendente' || b.status === 'em_andamento').length,
        concluidas: buscas.filter(b => b.status === 'concluida').length,
        lidas: buscas.reduce((s, b) => s + (b.mensagens_processadas ?? 0), 0),
        criados: buscas.reduce((s, b) => s + (b.criados ?? 0), 0),
    }), [buscas]);

    const kpisHistorico = useMemo(() => ({
        criados: mensagens.filter(m => m.resultado === 'criado').length,
        duplicados: mensagens.filter(m => m.resultado === 'duplicado').length,
        ignorados: mensagens.filter(m => m.resultado === 'ignorado').length,
        falhas: mensagens.filter(m => m.resultado === 'erro').length,
    }), [mensagens]);
    const rotuloPeriodo = atalho === 'personalizado'
        ? (periodo ? `${dataBR(periodo.de)} a ${dataBR(periodo.ate)}` : 'Período incompleto')
        : ROTULO_ATALHO_PERIODO[atalho];

    // ─── ações das caixas ────────────────────────────────────────────────────
    async function conectarNova() {
        const alvo = await resolveWriteOrg('single');
        if (!alvo || alvo.kind !== 'org') return;
        setSheetConta({ aberto: true, orgId: alvo.orgId, reconectar: null });
    }

    function contaPronta(conta: ContaCaptura) {
        setContas(prev => prev.some(c => c.id === conta.id) ? prev.map(c => (c.id === conta.id ? conta : c)) : [...prev, conta]);
        showToast(`Caixa ${conta.usuario} conectada. A primeira leitura acontece em até 15 minutos — ou use "Sincronizar agora".`);
    }

    async function sincronizar(conta: ContaCaptura) {
        setSincronizando(conta.id);
        try {
            const r = await emailCaptureService.sincronizarAgora(conta.id);
            const fila = r.pendente ? ' Ainda há e-mails na fila: a leitura automática continua a cada 15 minutos.' : '';
            showToast((r.mensagens
                ? `${r.criados} boleto(s) criado(s), ${r.duplicados} duplicado(s), ${r.ignorados} ignorado(s), ${r.erros} falha(s).`
                : 'Nenhuma mensagem nova com boleto.') + fila);
            await carregar();
            onResumoMudou?.();
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        } finally {
            setSincronizando(null);
        }
    }

    function regraSalva(conta: ContaCaptura) {
        setContas(prev => prev.map(c => (c.id === conta.id ? { ...c, modo: conta.modo } : c)));
        showToast(`Regra de leitura de ${conta.usuario}: ${ROTULO_MODO[conta.modo].toLowerCase()}.`);
    }

    async function alternarPausa(conta: ContaCaptura) {
        const novo: StatusConta = conta.status === 'pausada' ? 'ativa' : 'pausada';
        try {
            await emailCaptureService.atualizarConta(conta.id, { status: novo });
            setContas(prev => prev.map(c => (c.id === conta.id ? { ...c, status: novo } : c)));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    async function sairDoPiloto(conta: ContaCaptura) {
        const ok = await confirm({
            title: conta.modo_piloto ? 'Sair do modo piloto?' : 'Voltar ao modo piloto?',
            message: conta.modo_piloto
                ? 'Boletos de remetentes com importação automática passam a nascer como rascunho com fornecedor quando TUDO confere (DMARC, linha digitável, vencimento, beneficiário = fornecedor). Os demais continuam em revisão. Nada é aprovado nem pago sozinho.'
                : 'Todo boleto capturado desta caixa volta a ir para revisão.',
            variant: 'warning',
            confirmLabel: conta.modo_piloto ? 'Sair do piloto' : 'Voltar ao piloto',
        });
        if (!ok) return;
        try {
            await emailCaptureService.atualizarConta(conta.id, { modo_piloto: !conta.modo_piloto });
            setContas(prev => prev.map(c => (c.id === conta.id ? { ...c, modo_piloto: !c.modo_piloto } : c)));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    async function desconectar(conta: ContaCaptura) {
        const ok = await confirm({
            title: 'Desconectar caixa?',
            message: `A senha de ${conta.usuario} é apagada do cofre e a caixa deixa de ser lida. Boletos já capturados e o histórico continuam.`,
            variant: 'danger',
            confirmLabel: 'Desconectar caixa',
        });
        if (!ok) return;
        try {
            await emailCaptureService.desconectar(conta.id);
            setContas(prev => prev.map(c => (c.id === conta.id ? { ...c, status: 'desconectada' } : c)));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    function buscaAtualizada(b: BuscaPeriodo) {
        setBuscas(prev => [b, ...prev.filter(x => x.id !== b.id)]);
        onResumoMudou?.();
    }

    async function fecharBusca() {
        setSheetBusca({ aberto: false, conta: null });
        onResumoMudou?.();
        // O histórico ganhou linhas durante a busca.
        await carregarHistorico();
    }

    const buscaAtivaDa = (contaId: string) => buscas.find(b => b.account_id === contaId && (b.status === 'pendente' || b.status === 'em_andamento')) ?? null;

    // "Nova busca" na aba Buscas: com UMA caixa ativa abre direto; com várias, cada
    // caixa tem o próprio botão na aba Caixas e remetentes.
    const motivoNovaBusca = contasAtivas.length === 0
        ? 'Conecte (ou reative) uma caixa de e-mail antes de buscar um período.'
        : contasAtivas.length > 1
            ? 'Há mais de uma caixa: use "Buscar e-mails de um período" na linha da caixa, na aba Caixas e remetentes.'
            : null;
    const buscaDaUnicaCaixa = contasAtivas.length === 1 ? buscaAtivaDa(contasAtivas[0].id) : null;

    // ─── ações dos remetentes ────────────────────────────────────────────────
    function remetenteSalvo(r: RemetenteCaptura, resultado?: ResultadoDosPadroes) {
        const doIgnorado = !!sheetRemetente.doIgnorado;
        setRemetentes(prev => prev.some(x => x.id === r.id) ? prev.map(x => (x.id === r.id ? r : x)) : [...prev, r]);
        if (resultado) {
            if (resultado.atualizados.length) onBoletosAtualizados?.(resultado.atualizados);
            const pulados = resultado.pulados ? ` ${resultado.pulados} ficaram de fora: foram alterados por alguém enquanto isso.` : '';
            showToast(`Remetente salvo. Padrões aplicados a ${resultado.atualizados.length} boleto(s) em revisão.${pulados}`);
            return;
        }
        showToast(doIgnorado ? MSG_DO_IGNORADO : 'Remetente salvo.');
    }

    async function excluirRemetente(r: RemetenteCaptura) {
        const ok = await confirm({
            title: 'Excluir remetente monitorado?',
            message: `${r.nome || r.email || r.dominio} deixa de ser monitorado. Boletos já capturados não mudam.`,
            variant: 'danger',
            confirmLabel: 'Excluir remetente',
        });
        if (!ok) return;
        try {
            await emailCaptureService.excluirRemetente(r.id);
            setRemetentes(prev => prev.filter(x => x.id !== r.id));
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        }
    }

    function favoritarDaMensagem(m: MensagemCaptura) {
        const email = (m.remetente?.match(/<([^>]+)>/)?.[1] ?? m.remetente ?? '').trim().toLowerCase();
        setSheetRemetente({
            aberto: true, remetente: null,
            prefill: { account_id: m.account_id, tipo: 'exato', email: email || null },
            doIgnorado: m.resultado === 'ignorado',
        });
    }

    /** "Monitorar" só para quem ainda não tem cadastro nesta caixa (cadastrar de novo esbarraria na UNIQUE). */
    const monitoravel = (m: MensagemCaptura) =>
        !!m.remetente && !remetenteJaCadastrado(m.remetente, remetentes.filter(r => r.account_id === m.account_id));

    function escolherAtalho(v: AtalhoPeriodo | 'personalizado') {
        if (v === 'personalizado') {
            // Parte das datas que estavam na tela, para o usuário só ajustar.
            setDeCustom(deMostrado || hojeLocal());
            setAteCustom(ateMostrado || hojeLocal());
        }
        setAtalho(v);
    }

    function mudarData(campo: 'de' | 'ate', valor: string) {
        // Mexer numa data vira "Personalizado", mantendo a outra que estava na tela.
        setDeCustom(campo === 'de' ? valor : deMostrado);
        setAteCustom(campo === 'ate' ? valor : ateMostrado);
        setAtalho('personalizado');
    }

    const motivoSemCaixa = contasVisiveis.length === 0 ? 'Conecte uma caixa de e-mail antes de cadastrar remetentes.' : null;

    return (
        <>
            {erroCarga && (
                <p className="rounded-[10px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Não foi possível carregar a captura por e-mail: {erroCarga}
                </p>
            )}

            {secao === 'caixas' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                        <KpiCard label="Caixas ativas" value={kpisCaixas.ativas} icon={<Mail className="w-4 h-4" />} color="blue"
                            sub={kpisCaixas.reconectar ? `${kpisCaixas.reconectar} precisa(m) reconectar` : undefined} />
                        <KpiCard label="Remetentes monitorados" value={kpisCaixas.remetentes} icon={<Users className="w-4 h-4" />} color="indigo"
                            sub={kpisCaixas.remetentes !== kpisCaixas.remetentesAtivos ? `${kpisCaixas.remetentesAtivos} ativo(s)` : undefined} />
                        <KpiCard label="Com senha de PDF" value={kpisCaixas.comSenha} icon={<KeyRound className="w-4 h-4" />} color="violet" />
                        <KpiCard label="Sem fornecedor vinculado" value={kpisCaixas.semFornecedor} icon={<UserX className="w-4 h-4" />} color="amber"
                            sub={kpisCaixas.semFornecedor ? 'O boleto chega sem fornecedor sugerido' : undefined} />
                    </div>

                    <div className="space-y-3">
                        <SecaoTitulo icon={Inbox} titulo="Caixas de e-mail" resumo={`${contasVisiveis.length} conectada(s)`}
                            acoes={(
                                <button onClick={conectarNova}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                                    <Plus className="w-[15px] h-[15px]" /> Conectar caixa
                                </button>
                            )} />
                        <StandardTable<ContaCaptura>
                            storageKey="boletos:captura:contas"
                            columns={orgId ? COLS_CONTAS.filter(c => c.key !== 'organizacao') : COLS_CONTAS}
                            rows={contasVisiveis}
                            rowKey={c => c.id}
                            loading={carregando}
                            maxHeight="40vh"
                            searchText={c => `${c.usuario} ${nomeOrg[c.organization_id] ?? ''}`}
                            searchPlaceholder="Buscar caixa..."
                            sortValue={(k, c) => k === 'organizacao' ? (nomeOrg[c.organization_id] ?? '') : k === 'piloto' ? c.modo_piloto : (c as unknown as Record<string, string | null>)[k]}
                            renderCell={(k, c) => {
                                switch (k) {
                                    case 'usuario': return <span className="block truncate text-sm font-normal text-gray-700" title={c.usuario}>{c.usuario}</span>;
                                    case 'organizacao': return <span className="block truncate text-sm font-normal text-gray-700">{nomeOrg[c.organization_id] ?? '—'}</span>;
                                    case 'status': return <span className={`text-sm font-normal ${COR_STATUS[c.status]}`}>{ROTULO_STATUS_CONTA[c.status]}</span>;
                                    case 'modo': return <span className="text-sm font-normal text-gray-700">{ROTULO_MODO[c.modo]}</span>;
                                    case 'piloto': return <span className="text-sm font-normal text-gray-600">{c.modo_piloto ? 'Sim' : 'Não'}</span>;
                                    case 'data_inicial': return <span className="text-sm font-normal text-gray-600">{formatDateBR(c.data_inicial)}</span>;
                                    case 'last_sync_at': return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{c.last_sync_at ? formatDateTimeBR(c.last_sync_at) : 'Ainda não leu'}</span>;
                                    case 'ultimo_erro': return c.ultimo_erro
                                        ? <span className="block truncate text-sm font-normal text-red-600" title={c.ultimo_erro}>{c.ultimo_erro}</span>
                                        : <span className="text-sm font-normal text-gray-400">—</span>;
                                    default: return null;
                                }
                            }}
                            actions={{
                                width: 286,
                                render: c => (
                                    <div className="flex items-center justify-end gap-1.5">
                                        <ActionIconButton kind="history"
                                            title={c.status !== 'ativa' ? 'Reative a caixa para buscar um período' : buscaAtivaDa(c.id) ? 'Ver a busca por período em andamento' : 'Buscar e-mails de um período'}
                                            icon={<CalendarSearch className="w-4 h-4" />}
                                            disabled={c.status !== 'ativa'} onClick={() => setSheetBusca({ aberto: true, conta: c })} />
                                        <ActionIconButton kind="history" title={c.status === 'ativa' ? 'Sincronizar agora' : 'Reative a caixa para sincronizar'}
                                            icon={sincronizando === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                            disabled={c.status !== 'ativa' || !!sincronizando} onClick={() => sincronizar(c)} />
                                        <ActionIconButton kind="settings" title="Regra de leitura (quais remetentes ler)"
                                            icon={<ListFilter className="w-4 h-4" />} onClick={() => setSheetRegra(c)} />
                                        <ActionIconButton kind="lock" title="Reconectar (nova senha de app)" icon={<KeyRound className="w-4 h-4" />}
                                            onClick={() => setSheetConta({ aberto: true, orgId: c.organization_id, reconectar: c })} />
                                        <ActionIconButton kind="settings" title={c.status === 'pausada' ? 'Reativar leitura' : 'Pausar leitura'}
                                            icon={c.status === 'pausada' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                            disabled={c.status === 'reautenticar'} onClick={() => alternarPausa(c)} />
                                        <ActionIconButton kind="settings" title={c.modo_piloto ? 'Sair do modo piloto' : 'Voltar ao modo piloto'}
                                            icon={<FlaskConical className="w-4 h-4" />} onClick={() => sairDoPiloto(c)} />
                                        <ActionIconButton kind="delete" title="Desconectar caixa" onClick={() => desconectar(c)} />
                                    </div>
                                ),
                            }}
                            empty={{ icon: <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma caixa conectada', subtitle: 'Conecte a caixa do Gmail que recebe os boletos dos fornecedores.' }}
                        />
                    </div>

                    <div className="space-y-3">
                        <SecaoTitulo icon={Users} titulo="Remetentes monitorados" resumo={`${remetentes.length} cadastrado(s)`}
                            acoes={(
                                <button onClick={() => setSheetRemetente({ aberto: true, remetente: null, prefill: null })}
                                    disabled={!!motivoSemCaixa} title={motivoSemCaixa ?? undefined}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-blue-600 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Plus className="w-[15px] h-[15px]" /> Novo remetente
                                </button>
                            )} />
                        <StandardTable<RemetenteCaptura>
                            storageKey="boletos:captura:remetentes"
                            columns={COLS_REMETENTES}
                            rows={remetentes}
                            rowKey={r => r.id}
                            loading={carregando}
                            maxHeight="50vh"
                            onRowClick={r => setSheetRemetente({ aberto: true, remetente: r, prefill: null })}
                            searchText={r => `${r.nome ?? ''} ${r.email ?? ''} ${r.dominio ?? ''} ${r.supplier_id ? nomeFornecedor[r.supplier_id] ?? '' : ''}`}
                            searchPlaceholder="Buscar remetente, e-mail ou fornecedor..."
                            sortValue={(k, r) => {
                                switch (k) {
                                    case 'endereco': return r.email ?? r.dominio ?? '';
                                    case 'fornecedor': return r.supplier_id ? nomeFornecedor[r.supplier_id] ?? '' : '';
                                    case 'caixa': return caixaPorId[r.account_id] ?? '';
                                    case 'palavras': return r.palavras_chave.join(', ');
                                    case 'senha': return r.pdf_senha_atualizada_em ? 1 : 0;
                                    default: return (r as unknown as Record<string, string | boolean | null>)[k] as string | boolean | null;
                                }
                            }}
                            renderCell={(k, r) => {
                                switch (k) {
                                    case 'nome': return <span className="block truncate text-sm font-normal text-gray-700" title={r.nome ?? undefined}>{r.nome || '—'}</span>;
                                    case 'endereco': return <span className="block truncate text-sm font-normal text-gray-700">{r.tipo === 'exato' ? r.email : `@${r.dominio} (domínio)`}</span>;
                                    case 'fornecedor': return <span className="block truncate text-sm font-normal text-gray-700">{r.supplier_id ? nomeFornecedor[r.supplier_id] ?? '—' : '—'}</span>;
                                    case 'caixa': return <span className="block truncate text-sm font-normal text-gray-600">{caixaPorId[r.account_id] ?? '—'}</span>;
                                    case 'palavras': return <span className="block truncate text-sm font-normal text-gray-600" title={r.palavras_chave.join(', ')}>{r.palavras_chave.join(', ') || '—'}</span>;
                                    case 'senha': return r.pdf_senha_atualizada_em
                                        ? <span className="text-sm font-normal text-emerald-700">Cadastrada</span>
                                        : <span className="text-sm font-normal text-gray-400">—</span>;
                                    case 'importacao': return <span className={`text-sm font-normal ${r.importacao === 'automatica' ? 'text-blue-700' : 'text-gray-600'}`}>{r.importacao === 'automatica' ? 'Automática' : 'Revisão'}</span>;
                                    case 'ativo': return <span className={`text-sm font-normal ${r.ativo ? 'text-emerald-700' : 'text-gray-500'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span>;
                                    default: return null;
                                }
                            }}
                            actions={{
                                width: 100,
                                render: r => (
                                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                        <ActionIconButton kind="edit" onClick={() => setSheetRemetente({ aberto: true, remetente: r, prefill: null })} />
                                        <ActionIconButton kind="delete" title="Excluir remetente" onClick={() => excluirRemetente(r)} />
                                    </div>
                                ),
                            }}
                            empty={{ icon: <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum remetente monitorado', subtitle: 'Cadastre os e-mails de cobrança dos fornecedores — ou adicione pela aba Histórico da captura.' }}
                        />
                    </div>
                </>
            )}

            {secao === 'buscas' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                        <KpiCard label="Em andamento" value={kpisBuscas.andamento} icon={<Loader2 className="w-4 h-4" />} color="blue" />
                        <KpiCard label="Concluídas" value={kpisBuscas.concluidas} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
                        <KpiCard label="E-mails lidos" value={kpisBuscas.lidas} icon={<Mail className="w-4 h-4" />} color="gray" sub="Somando todas as buscas" />
                        <KpiCard label="Boletos criados" value={kpisBuscas.criados} icon={<FileCheck2 className="w-4 h-4" />} color="indigo" sub="Somando todas as buscas" />
                    </div>

                    <div>
                        <StandardTable<BuscaPeriodo>
                            storageKey="boletos:captura:buscas"
                            columns={COLS_BUSCAS}
                            rows={buscas}
                            rowKey={b => b.id}
                            loading={carregando}
                            maxHeight="60vh"
                            searchText={b => `${caixaPorId[b.account_id] ?? ''} ${b.remetentes?.join(' ') ?? 'Todos'} ${b.pedida_por ?? ''} ${ROTULO_STATUS_BUSCA[b.status]}`}
                            searchPlaceholder="Buscar caixa, remetente ou quem pediu..."
                            toolbarRight={(
                                <button onClick={() => setSheetBusca({ aberto: true, conta: contasAtivas[0] })}
                                    disabled={!!motivoNovaBusca} title={motivoNovaBusca ?? undefined}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                                    <CalendarSearch className="w-[15px] h-[15px]" /> {buscaDaUnicaCaixa ? 'Acompanhar busca' : 'Nova busca'}
                                </button>
                            )}
                            sortValue={(k, b) => {
                                switch (k) {
                                    case 'caixa': return caixaPorId[b.account_id] ?? '';
                                    case 'periodo': return b.data_de;
                                    case 'remetentes': return b.remetentes?.join(', ') ?? '';
                                    case 'status': return ROTULO_STATUS_BUSCA[b.status];
                                    case 'progresso': return progressoDaBusca(b) ?? -1;
                                    default: return (b as unknown as Record<string, string | null>)[k];
                                }
                            }}
                            renderCell={(k, b) => {
                                switch (k) {
                                    case 'caixa': return <span className="block truncate text-sm font-normal text-gray-700">{caixaPorId[b.account_id] ?? '—'}</span>;
                                    case 'periodo': return <span className="text-sm font-normal text-gray-700 whitespace-nowrap">{dataBR(b.data_de)} a {dataBR(b.data_ate)}</span>;
                                    case 'remetentes': return b.remetentes?.length
                                        ? <span className="block truncate text-sm font-normal text-gray-700" title={b.remetentes.join(', ')}>{b.remetentes.join(', ')}</span>
                                        : <span className="text-sm font-normal text-gray-400">Todos</span>;
                                    case 'status': return <span className={`text-sm font-normal ${COR_BUSCA[b.status]}`}>{ROTULO_STATUS_BUSCA[b.status]}</span>;
                                    case 'progresso': {
                                        const pct = progressoDaBusca(b);
                                        return pct == null ? <span className="text-sm font-normal text-gray-400">Contando…</span> : <SegmentedProgress percent={pct} tone="blue" />;
                                    }
                                    case 'resultado': return (
                                        <span className="block truncate text-sm font-normal text-gray-600" title={b.ultimo_erro ?? undefined}>
                                            {b.criados} criado(s) · {b.duplicados} já existia(m){b.ignorados ? ` · ${b.ignorados} ignorado(s)` : ''}{b.erros ? ` · ${b.erros} falha(s)` : ''}
                                        </span>
                                    );
                                    case 'pedida_por': return <span className="block truncate text-sm font-normal text-gray-600" title={b.pedida_por ?? undefined}>{b.pedida_por ?? '—'}</span>;
                                    default: return null;
                                }
                            }}
                            actions={{
                                width: 110,
                                render: b => (b.status === 'pendente' || b.status === 'em_andamento') ? (
                                    <button onClick={() => setSheetBusca({ aberto: true, conta: contas.find(c => c.id === b.account_id) ?? null })}
                                        className="whitespace-nowrap text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                        Acompanhar
                                    </button>
                                ) : null,
                            }}
                            empty={{ icon: <CalendarSearch className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma busca por período', subtitle: 'Use "Nova busca" para ler e-mails de um dia, um mês ou um intervalo que já passou.' }}
                        />
                    </div>
                </>
            )}

            {secao === 'historico' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                        <KpiCard label="Boletos capturados" value={kpisHistorico.criados} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" sub={rotuloPeriodo} />
                        <KpiCard label="Duplicados evitados" value={kpisHistorico.duplicados} icon={<CopyIcon className="w-4 h-4" />} color="gray" sub={rotuloPeriodo} />
                        <KpiCard label="Ignorados" value={kpisHistorico.ignorados} icon={<EyeOff className="w-4 h-4" />} color="amber" sub="PDF sem boleto de remetente não cadastrado" />
                        <KpiCard label="Falhas" value={kpisHistorico.falhas} icon={<AlertTriangle className="w-4 h-4" />} color="red" sub={rotuloPeriodo} />
                    </div>

                    {/* Escopo (guia §5.3): qual período a tela está olhando. */}
                    <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <select aria-label="Período" value={atalho} onChange={e => escolherAtalho(e.target.value as AtalhoPeriodo | 'personalizado')}
                                className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer">
                                {(Object.keys(ROTULO_ATALHO_PERIODO) as AtalhoPeriodo[]).map(a => <option key={a} value={a}>{ROTULO_ATALHO_PERIODO[a]}</option>)}
                                <option value="personalizado">Personalizado</option>
                            </select>
                            {atalho !== 'tudo' && (
                                <div className="flex gap-1.5 items-center h-9 bg-gray-50 px-2.5 rounded-[6px] border border-gray-100">
                                    <input type="date" aria-label="De" title="De" value={deMostrado} max={hojeLocal()}
                                        onChange={e => mudarData('de', e.target.value)}
                                        className="bg-transparent border-none text-xs font-semibold text-gray-700 focus:ring-0 p-0 w-[92px]" />
                                    <div className="w-px h-5 bg-gray-200" />
                                    <input type="date" aria-label="Até" title="Até" value={ateMostrado} max={hojeLocal()}
                                        onChange={e => mudarData('ate', e.target.value)}
                                        className="bg-transparent border-none text-xs font-semibold text-gray-700 focus:ring-0 p-0 w-[92px]" />
                                </div>
                            )}
                            {periodoInvalido && <span className="text-sm text-red-600">Informe as duas datas, a inicial antes da final.</span>}
                        </div>
                        <span className="text-xs text-gray-500 px-2">Pela data do e-mail · {mensagens.length} PDF(s) no período</span>
                    </div>

                    <div>
                        <StandardTable<MensagemCaptura>
                            storageKey="boletos:captura:mensagens"
                            columns={COLS_MENSAGENS}
                            rows={mensagensFiltradas}
                            rowKey={m => m.id}
                            loading={carregando || carregandoHistorico}
                            pagination={{ defaultPageSize: 50 }}
                            searchText={m => `${m.remetente ?? ''} ${m.assunto ?? ''} ${m.documento_nome ?? ''} ${ROTULO_RESULTADO[m.resultado]} ${m.motivo ?? ''} ${m.erro ?? ''}`}
                            searchPlaceholder="Buscar remetente, assunto, anexo ou detalhe..."
                            filters={(
                                <FilterPopover<ResultadoMensagem | ''>
                                    label="Resultado"
                                    value={filtroResultado}
                                    onChange={setFiltroResultado}
                                    options={OPCOES_RESULTADO}
                                />
                            )}
                            sortValue={(k, m) => {
                                switch (k) {
                                    case 'data': return m.data_email ?? m.created_at;
                                    case 'anexo': return m.documento_nome ?? '';
                                    case 'dmarc': return m.auth_results?.dmarc ?? '';
                                    case 'resultado': return ROTULO_RESULTADO[m.resultado];
                                    case 'motivo': return m.erro ?? m.motivo ?? '';
                                    default: return (m as unknown as Record<string, string | null>)[k];
                                }
                            }}
                            renderCell={(k, m) => {
                                switch (k) {
                                    case 'data': return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{formatDateTimeBR(m.data_email ?? m.created_at)}</span>;
                                    case 'remetente': return <span className="block truncate text-sm font-normal text-gray-700" title={m.remetente ?? undefined}>{m.remetente ?? '—'}</span>;
                                    case 'assunto': return <span className="block truncate text-sm font-normal text-gray-700" title={m.assunto ?? undefined}>{m.assunto || '—'}</span>;
                                    case 'anexo': return <span className="block truncate text-sm font-normal text-gray-600" title={m.documento_nome ?? undefined}>{m.documento_nome ?? '—'}</span>;
                                    case 'dmarc': {
                                        const d = m.auth_results?.dmarc ?? 'none';
                                        return <span className={`text-sm font-normal ${d === 'pass' ? 'text-emerald-700' : d === 'none' ? 'text-gray-500' : 'text-red-600'}`}>{d === 'pass' ? 'Passou' : d === 'none' ? 'Sem dado' : 'Falhou'}</span>;
                                    }
                                    case 'resultado': return <span className={`text-sm font-normal ${COR_RESULTADO[m.resultado]}`}>{ROTULO_RESULTADO[m.resultado]}</span>;
                                    case 'motivo': {
                                        const t = m.erro ?? m.motivo;
                                        return t ? <span className={`block truncate text-sm font-normal ${m.erro ? 'text-red-600' : 'text-gray-600'}`} title={t}>{t}</span>
                                            : <span className="text-sm font-normal text-gray-400">—</span>;
                                    }
                                    default: return null;
                                }
                            }}
                            actions={{
                                width: 200,
                                render: m => (
                                    <div className="flex items-center justify-end gap-1.5">
                                        {m.boleto_id && onAbrirBoleto && (
                                            <button onClick={() => onAbrirBoleto(m.boleto_id!)}
                                                className="whitespace-nowrap text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                                Ver boleto
                                            </button>
                                        )}
                                        {monitoravel(m) && (m.resultado === 'ignorado' ? (
                                            // No ignorado é a ação que resolve: trazer o remetente para a lista.
                                            <button onClick={() => favoritarDaMensagem(m)}
                                                className="whitespace-nowrap text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                                Monitorar remetente
                                            </button>
                                        ) : (
                                            <ActionIconButton kind="annotate" title="Monitorar este remetente" icon={<Plus className="w-4 h-4" />}
                                                onClick={() => favoritarDaMensagem(m)} />
                                        ))}
                                    </div>
                                ),
                            }}
                            empty={{
                                icon: <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                                title: mensagens.length ? 'Nenhum PDF com este resultado' : 'Nada lido neste período',
                                subtitle: mensagens.length ? 'Escolha outro resultado no filtro.' : 'Amplie o período, ou aguarde a próxima leitura das caixas.',
                            }}
                        />
                    </div>
                </>
            )}

            <EmailCaptureAccountSheet
                open={sheetConta.aberto}
                onClose={() => setSheetConta({ aberto: false, orgId: null, reconectar: null })}
                organizationId={sheetConta.orgId}
                reconectar={sheetConta.reconectar}
                onPronta={contaPronta}
            />
            <EmailCaptureRegraSheet
                open={!!sheetRegra}
                onClose={() => setSheetRegra(null)}
                conta={sheetRegra}
                onSalva={regraSalva}
            />
            <EmailCaptureBuscaSheet
                open={sheetBusca.aberto}
                onClose={fecharBusca}
                conta={sheetBusca.conta}
                buscaAtiva={sheetBusca.conta ? buscaAtivaDa(sheetBusca.conta.id) : null}
                onAtualizada={buscaAtualizada}
                remetentesDaCaixa={sheetBusca.conta ? remetentes.filter(r => r.account_id === sheetBusca.conta!.id && r.ativo) : []}
            />
            <EmailCaptureSenderSheet
                open={sheetRemetente.aberto}
                onClose={() => setSheetRemetente({ aberto: false, remetente: null, prefill: null })}
                contas={contasVisiveis}
                fornecedores={fornecedores}
                remetente={sheetRemetente.remetente}
                prefill={sheetRemetente.prefill}
                onSalvo={remetenteSalvo}
            />
            {orgTargetModal}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {localToast.message}
                </div>
            )}
        </>
    );
};

export default EmailCapturaConfig;
