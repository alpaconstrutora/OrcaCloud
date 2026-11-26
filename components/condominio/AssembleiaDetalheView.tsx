// components/condominio/AssembleiaDetalheView.tsx
// Tela de UMA assembleia do condomínio — o gestor convoca, registra presença
// (inclusive por procurador), instala, lança o voto da sala e encerra, gerando a
// ata em PDF que vai para Documentos. Plano:
// docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R1–R10, Task A7).
//
// TELA, não painel (como RateioDetalheView): quem monta é o CondominioDetail, que
// faz o early return — a tela substitui o condomínio inteiro, cabeçalho e abas.
//
// A condução entra por `ops: OperacoesAssembleia`. O gestor passa
// `operacoesDoGestor` (A4); o síndico, no Portal do Síndico, passa
// `operacoesDoSindico` (B2) — a tela não sabe quem conduz. Por isso ela não chama
// serviço nenhum por fora: unidades sem fração, leituras do aviso, upload e abertura
// de documento também são `ops` (B2). A regra (estado, R3, R6–R9) é do BANCO:
// aqui só se diz o motivo de um botão desligado antes de errar.
//
// Decisões que moram aqui:
//   • deliberação só entra pelo Encerrar (ops.encerrar) — nunca gravando o item em
//     INSTALADA (trava/deadlock com a apuração);
//   • voto na sala sobre voto do PORTAL pede confirmação (R7) antes de ir ao banco;
//   • a tela não fica velha durante a reunião: abrir Instalar, abrir a unidade e
//     "Atualizar apuração" RECARREGAM votos e unidades (o voto do portal chega com a
//     tela aberta); se mesmo assim o banco disser que o voto da sala substituiu um voto
//     do portal que a tela não conhecia, a tela avisa;
//   • a ata sai do RETRATO devolvido pelo encerrar; upload falho deixa "Gerar ata
//     novamente", que refaz do mesmo retrato (e não encerra de novo);
//   • a org do upload é de quem implementa `ops` (gestor: orgDoCondominio; síndico: a
//     Edge Function, pela org do condomínio no banco). A tela fixa SÓ a natureza do
//     documento: ata = ATA visível no portal; procuração = OUTRO, NUNCA visível no portal;
//   • A10: sem cota cobrada pelo app (ops.cotasConferidas = false), aviso — que não bloqueia
//     nada — no Convocar, no Instalar e no topo de Unidades; o gestor marca a impedida à mão
//     na gaveta da unidade (ops.marcarImpedida). A situação diz a origem: "Impedida (marcada
//     à mão): …" × "Impedida: <cota vencida>" — "à mão" porque o síndico também marca (B2).
//
// Ordem das seções: Identificação · Edital e ata · Pauta · Apuração · Unidades. A
// lista de Unidades é a única TABELA e vem por último — nada abaixo de tabela (§6.14).
//
// §24 (tela compartilhada app × portal): `accent` 'indigo' (padrão, gestor) ou 'portal'
// (Portal do Síndico, coral) — muda a cor de identidade (ação, foco, marcação, link) e a
// faixa de KPIs (KpiCard × KpiStrip do kit); cor que significa algo não muda. No portal o
// aviso sai pelo `notify` da casca (toast no topo), não pelo toast desta tela.

import React from 'react';
import {
    ArrowLeft, Loader2, AlertCircle, Megaphone, Gavel, CheckSquare, FileDown, FileText, XCircle, Users, UserCheck,
    Ban, Smartphone,
} from 'lucide-react';
import Breadcrumb from '../ui/Breadcrumb';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import { KpiStrip } from '../portal/PortalKit';
import SecaoTitulo from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import { identidadeDoCondominio, nomeDoCondominioNosDocumentos } from '../../utils/condominioIdentidade';
import {
    dataHoraBrasilia, montarAta, montarEdital, percentualDoTotal, rotuloOpcao, ROTULO_STATUS, ROTULO_TIPO,
} from '../../utils/assembleiaTextos';
import { baixarEditalPdf, gerarAtaPdf } from '../../services/assembleiaPdf';
import type {
    Apuracao, Assembleia, AssembleiaCarregada, DadosInstalacao, DocumentoDaAssembleia, ImpedimentoUnidade,
    ItemAssembleia, OpcaoVoto, OperacoesAssembleia, PresencaAssembleia, Retrato, UnidadeNaAssembleia,
} from '../../services/condominioAssembleiaService';
import type { Empreendimento } from '../../types/empreendimento';
import UnidadeSheet from './assembleia/UnidadeSheet';
import {
    AvisoCotasNaoConferidas, CancelarSheet, ConvocarSheet, EncerrarSheet, InstalarSheet,
} from './assembleia/ConducaoSheets';
import { ApuracaoSecao, EditalAtaSecao, IdentificacaoSecao, PautaSecao } from './assembleia/SecoesDaAssembleia';
import {
    ACCENTS, BOTAO_SECUNDARIO, COR_STATUS, diaBrasilia, presentesAptos, temMetade, textoImpedimento,
    type AcentoDaAssembleia, type ImpedimentoAgora,
} from './assembleia/comum';

/** O que a tela usa do condomínio: identidade e o nome nos documentos. O Portal do Síndico monta isto. */
export type CondominioDaAssembleia = Pick<Empreendimento, 'id' | 'name' | 'code' | 'condominio_razao_social' | 'condominio_cnpj'>;

interface Props {
    assembleiaId: string;
    empreendimento: CondominioDaAssembleia;
    ops: OperacoesAssembleia;
    /** Volta para a aba Assembleias do condomínio. */
    onVoltar: () => void;
    /** Volta para a LISTA de condomínios — o primeiro salto da migalha. */
    onVoltarParaLista?: () => void;
    /** Primeiro salto da migalha (padrão "Condomínios"; no Portal do Síndico, "Assembleias"). */
    rotuloDaLista?: string;
    /** §24: 'portal' no Portal do Síndico; padrão 'indigo' (app). */
    accent?: AcentoDaAssembleia;
    /** Aviso da casca (Portal do Síndico); sem ele, a tela mostra o próprio toast. */
    notify?: (message: string, type: TipoDeAviso) => void;
    /**
     * Algo que outras abas mostram mudou: o aviso da convocação/cancelamento (Avisos) ou um
     * documento (ata, procuração — Documentos). O Portal do Síndico relê o payload dele.
     */
    onAlterado?: () => void;
}

type TipoDeAviso = 'success' | 'error' | 'warning';

/** A natureza de cada documento é da TELA, não de quem implementa `ops` (B1/B2). */
const DOC_ATA: Omit<DocumentoDaAssembleia, 'titulo'> = { categoria: 'ATA', visivelPortal: true };
/** Procuração é documento pessoal: NUNCA visível no portal. */
const DOC_PROCURACAO: Omit<DocumentoDaAssembleia, 'titulo'> = { categoria: 'OUTRO', visivelPortal: false };

type Gaveta = 'convocar' | 'instalar' | 'encerrar' | 'cancelar' | null;

const msg = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

const COLUNAS_UNIDADES: StandardTableColumn[] = [
    { key: 'unidade', label: 'Unidade', sortable: true, width: 170 },
    { key: 'proprietario', label: 'Proprietário', sortable: true, width: 200 },
    { key: 'peso', label: 'Peso', sortable: true, width: 90, align: 'right' },
    { key: 'presenca', label: 'Presença', sortable: true, width: 200 },
    { key: 'situacao', label: 'Situação', sortable: true, width: 220 },
    { key: 'votos', label: 'Votos', sortable: true, width: 160 },
];

const AssembleiaDetalheView: React.FC<Props> = ({
    assembleiaId, empreendimento: e, ops, onVoltar, onVoltarParaLista, rotuloDaLista = 'Condomínios',
    accent = 'indigo', notify: notifyDaCasca, onAlterado,
}) => {
    const confirm = useConfirm();
    const ac = ACCENTS[accent];
    const identidade = identidadeDoCondominio(e.name, e.code);
    // Edital e ata com o MESMO nome: o banco congela este critério no retrato (encerrar).
    const condominio = React.useMemo(
        () => ({ nome: nomeDoCondominioNosDocumentos(e.condominio_razao_social, e.name), cnpj: e.condominio_cnpj ?? null }),
        [e.condominio_razao_social, e.name, e.condominio_cnpj]);

    const [dados, setDados] = React.useState<AssembleiaCarregada | null>(null);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [impedimentos, setImpedimentos] = React.useState<ImpedimentoUnidade[]>([]);
    const [apuracao, setApuracao] = React.useState<Apuracao | null>(null);
    const [erroApuracao, setErroApuracao] = React.useState<string | null>(null);
    const [atualizandoApuracao, setAtualizandoApuracao] = React.useState(false);
    const [leituras, setLeituras] = React.useState<number | null>(null);
    // A10: o condomínio tem cota cobrada pelo app? false = avisa (null = não conferido ainda).
    const [cotasConferidas, setCotasConferidas] = React.useState<boolean | null>(null);

    const [gaveta, setGaveta] = React.useState<Gaveta>(null);
    const [gravando, setGravando] = React.useState(false);
    const [erroGaveta, setErroGaveta] = React.useState<string | null>(null);
    const [unidadeAberta, setUnidadeAberta] = React.useState<string | null>(null);
    const [fora, setFora] = React.useState<string[] | null>(null);
    const [erroFora, setErroFora] = React.useState<string | null>(null);

    const [ata, setAta] = React.useState<{ gerando: boolean; erro: string | null }>({ gerando: false, erro: null });
    // Upload que deu certo mas o vínculo falhou: refaz só o vínculo (sem 2º PDF em Documentos).
    const ataEnviada = React.useRef<string | null>(null);

    const [notification, setNotification] = React.useState<{ message: string; type: TipoDeAviso } | null>(null);
    const notify = (message: string, type: TipoDeAviso = 'success') => {
        if (notifyDaCasca) { notifyDaCasca(message, type); return; }
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // ── carregamento ─────────────────────────────────────────────────────
    const atualizarApuracao = React.useCallback(async (a: Assembleia) => {
        if (a.status === 'ENCERRADA') { setApuracao(a.retrato); return; }
        if (a.status !== 'CONVOCADA' && a.status !== 'INSTALADA') { setApuracao(null); return; }
        setAtualizandoApuracao(true);
        try {
            const [ap, imp] = await Promise.all([ops.apuracao(a.id), ops.impedimentos(a.id)]);
            setApuracao(ap);
            setImpedimentos(imp);
            setErroApuracao(null);
        } catch (err) {
            setErroApuracao(msg(err, 'erro desconhecido'));
        } finally {
            setAtualizandoApuracao(false);
        }
    }, [ops]);

    // Geração da leitura: só a leitura MAIS NOVA aplica o resultado, e toda costura local
    // (presença, voto, encerrar, ata) invalida a leitura em curso — senão uma recarga que
    // saiu antes do voto chegaria depois e apagaria o voto recém-lançado da tela.
    const geracao = React.useRef(0);
    const costurar = (f: (d: AssembleiaCarregada | null) => AssembleiaCarregada | null) => {
        geracao.current += 1;
        setDados(f);
    };

    const carregar = React.useCallback(async (silencioso = false) => {
        const g = ++geracao.current;
        if (!silencioso) setCarregando(true);
        setErro(null);
        try {
            const d = await ops.carregar(assembleiaId);
            if (g !== geracao.current) return; // outra leitura ou uma gravação local veio depois
            setDados(d);
            await atualizarApuracao(d.assembleia);
            if (d.assembleia.avisoId) {
                // Só informação (R4): leitura não trava nada, e falhar aqui não derruba a tela.
                ops.leiturasDoAviso(d.assembleia.id)
                    .then(n => setLeituras(n))
                    .catch(() => setLeituras(null));
            }
        } catch (err) {
            if (g === geracao.current) setErro(msg(err, 'Erro ao carregar a assembleia.'));
        } finally {
            if (!silencioso) setCarregando(false);
        }
    }, [ops, assembleiaId, atualizarApuracao]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const a = dados?.assembleia ?? null;
    const itens = dados?.itens ?? [];
    const unidades = dados?.unidades ?? [];
    const votos = dados?.votos ?? [];
    // Impedimento AGORA (só com a assembleia viva). A marca do gestor (A10) vem da própria
    // linha da unidade — a costura local a mostra na hora —; o resto, do banco
    // (ops.impedimentos: regra automática, e a marca de outro gestor).
    const impedidas = React.useMemo(() => {
        const m = new Map<string, ImpedimentoAgora>(impedimentos.map(i => [i.unitId, { motivo: i.motivo, origem: i.origem }]));
        for (const u of unidades) {
            if (u.impedimentoManual) m.set(u.unitId, { motivo: u.impedimentoManual, origem: 'MANUAL' });
        }
        return m;
    }, [impedimentos, unidades]);
    const presentes = React.useMemo(
        () => presentesAptos(unidades, votos, new Set(impedidas.keys())), [unidades, votos, impedidas]);

    // A10: só antes de encerrar faz sentido avisar (Convocar, Instalar, presença).
    const statusAtual = dados?.assembleia.status;
    React.useEffect(() => {
        if (!statusAtual || !['RASCUNHO', 'CONVOCADA', 'INSTALADA'].includes(statusAtual)) return;
        let vivo = true;
        ops.cotasConferidas(assembleiaId)
            .then(c => { if (vivo) setCotasConferidas(c); })
            // Falhar aqui não derruba a tela: sem a resposta, não se afirma nada.
            .catch(() => { if (vivo) setCotasConferidas(null); });
        return () => { vivo = false; };
    }, [ops, assembleiaId, statusAtual]);

    // Situação da unidade. Em ENCERRADA vale o que ficou CONGELADO na instalação (retrato /
    // quorum_instalacao) — ops.impedimentos é o "agora" e só existe com a assembleia viva.
    // Em CANCELADA (sempre antes de instalar) não há situação gravada: a coluna sai.
    const congelada = a?.status === 'ENCERRADA' || a?.status === 'CANCELADA';
    const impedidasNaInstalacao = React.useMemo(() => {
        const lista = a?.retrato?.impedidasNaInstalacao?.length ? a.retrato.impedidasNaInstalacao
            : (a?.quorumInstalacao?.impedidas ?? a?.retrato?.cabecalho.quorumInstalacao?.impedidas ?? []);
        return new Map<string, ImpedimentoAgora>(lista.map(i => [i.unitId, { motivo: i.motivo, origem: i.origem }]));
    }, [a?.retrato, a?.quorumInstalacao]);
    const mostrarSituacao = !(a?.status === 'CANCELADA' && !a.quorumInstalacao);
    const colunasUnidades = React.useMemo(
        () => (mostrarSituacao ? COLUNAS_UNIDADES : COLUNAS_UNIDADES.filter(c => c.key !== 'situacao')), [mostrarSituacao]);

    const fecharGaveta = () => { setGaveta(null); setErroGaveta(null); };
    // HINT 'estado': outro gestor (ou um duplo clique) já mudou o estado — mostra o estado real.
    const seOutroAgiu = (err: unknown) => {
        if ((err as { hint?: string })?.hint === 'estado') carregar(true);
    };

    // ── convocar (R1, R4) ────────────────────────────────────────────────
    const abrirConvocar = async () => {
        setGaveta('convocar');
        setFora(null);
        setErroFora(null);
        if (!a) return;
        try {
            // Mesmo rótulo e ordem do banco: "Torre — Unidade".
            setFora(await ops.unidadesFora(a.id));
        } catch (err) {
            setErroFora(msg(err, 'erro desconhecido'));
        }
    };

    const convocar = async (corpo: string) => {
        if (!a) return;
        setGravando(true);
        setErroGaveta(null);
        try {
            const r = await ops.convocar(a.id, corpo);
            fecharGaveta();
            onAlterado?.(); // o aviso da convocação está no mural
            notify(`Assembleia convocada: ${r.unidades} ${r.unidades === 1 ? 'unidade participa' : 'unidades participam'}`
                + `${r.fora.length ? `; fora (sem fração ideal): ${r.fora.join(', ')}` : ''}. Aviso publicado no mural.`);
            // As unidades nasceram no banco (lista congelada, R1): recarrega.
            await carregar(true);
        } catch (err) {
            setErroGaveta(msg(err, 'Erro ao convocar.'));
            seOutroAgiu(err);
        } finally { setGravando(false); }
    };

    // ── instalar (R4, R6) ────────────────────────────────────────────────
    // Recarrega ao abrir: o voto do portal que chegou com a tela aberta conta como presença
    // (R6) — sem isso a 1ª convocação ficaria desligada quando o banco aceitaria.
    const abrirInstalar = () => {
        setGaveta('instalar');
        carregar(true);
    };

    const instalar = async (d: DadosInstalacao) => {
        if (!a) return;
        setGravando(true);
        setErroGaveta(null);
        try {
            const q = await ops.instalar(a.id, d);
            fecharGaveta();
            notify(`Assembleia instalada em ${q.convocacao}ª convocação com ${percentualDoTotal(q.presentesFracao, q.total)} das frações.`);
            // O banco grava quórum, impedidas e autoria no instante: recarrega.
            await carregar(true);
        } catch (err) {
            setErroGaveta(msg(err, 'Erro ao instalar.'));
            seOutroAgiu(err);
        } finally { setGravando(false); }
    };

    // ── ata (R9) ─────────────────────────────────────────────────────────
    const gerarAta = async (retrato: Retrato, assembleia: Assembleia) => {
        setAta({ gerando: true, erro: null });
        try {
            let documentoId = ataEnviada.current;
            if (!documentoId) {
                const modelo = montarAta(retrato, assembleia, condominio);
                const pdf = await gerarAtaPdf(modelo);
                const dia = diaBrasilia(retrato.cabecalho.encerradaEm ?? assembleia.encerradaEm ?? new Date());
                const arquivo = new File([pdf], `ata-${dia}.pdf`, { type: 'application/pdf' });
                const doc = await ops.enviarDocumento(assembleia.id, arquivo,
                    { ...DOC_ATA, titulo: `${modelo.titulo} — ${assembleia.titulo}` });
                documentoId = doc.documentoId;
                ataEnviada.current = doc.documentoId;
                onAlterado?.(); // a ata está em Documentos
            }
            const v = await ops.vincularAta(assembleia.id, documentoId);
            ataEnviada.current = null;
            costurar(d => (d ? { ...d, assembleia: { ...d.assembleia, ataDocumentoId: v.ataDocumentoId } } : d));
            setAta({ gerando: false, erro: null });
            notify('Assembleia encerrada e ata vinculada.');
        } catch (err) {
            const texto = msg(err, 'Erro ao gravar a ata.');
            setAta({ gerando: false, erro: texto });
            notify(`A ata não foi gravada: ${texto}`, 'error');
        }
    };

    // ── encerrar (R9) ────────────────────────────────────────────────────
    const encerrar = async (deliberacoes: Record<string, string | null>, observacao: string | null) => {
        if (!a) return;
        setGravando(true);
        setErroGaveta(null);
        let retrato: Retrato;
        try {
            retrato = await ops.encerrar(a.id, deliberacoes, observacao);
        } catch (err) {
            setErroGaveta(msg(err, 'Erro ao encerrar.'));
            setGravando(false);
            seOutroAgiu(err); // "já foi encerrada" (outro gestor, duplo clique)
            return;
        }
        setGravando(false);
        fecharGaveta();
        const encerrada: Assembleia = {
            ...a, status: 'ENCERRADA', retrato, encerradaEm: retrato.cabecalho.encerradaEm, observacaoGeral: observacao,
        };
        costurar(d => (d ? {
            ...d, assembleia: encerrada,
            itens: d.itens.map(i => ({ ...i, deliberacao: retrato.deliberacoes?.[i.id] ?? null })),
        } : d));
        setApuracao(retrato);
        await gerarAta(retrato, encerrada);
    };

    // ── cancelar (R10) ───────────────────────────────────────────────────
    const cancelar = async (motivo: string, corpo: string) => {
        if (!a) return;
        setGravando(true);
        setErroGaveta(null);
        try {
            await ops.cancelar(a.id, motivo, corpo);
            fecharGaveta();
            onAlterado?.(); // o aviso de cancelamento está no mural
            notify('Assembleia cancelada. O aviso de cancelamento foi publicado no mural.');
            await carregar(true);
        } catch (err) {
            setErroGaveta(msg(err, 'Erro ao cancelar.'));
            seOutroAgiu(err);
        } finally { setGravando(false); }
    };

    // ── edital (R4) e ata gravada ────────────────────────────────────────
    const baixarEdital = async () => {
        if (!a) return;
        try {
            await baixarEditalPdf(montarEdital(a, itens, condominio));
        } catch (err) {
            notify(msg(err, 'Erro ao gerar o edital.'), 'error');
        }
    };

    /**
     * A URL da ata é assinada na hora (duas idas ao servidor), e `window.open` DEPOIS de
     * um `await` é bloqueado como pop-up — a aba nasce no clique, em branco, e só depois
     * recebe o endereço (mesmo caminho do DocumentosTab).
     */
    const abrirAta = async () => {
        if (!a?.ataDocumentoId) return;
        const janela = window.open('', '_blank');
        try {
            const url = await ops.abrirDocumento(a.id, a.ataDocumentoId);
            if (janela) janela.location.href = url;
            else window.open(url, '_blank', 'noopener');
        } catch (err) {
            janela?.close();
            notify(msg(err, 'Não foi possível abrir a ata.'), 'error');
        }
    };

    // ── presença e voto na sala (R7) ─────────────────────────────────────
    const unidade = unidades.find(u => u.unitId === unidadeAberta) ?? null;

    const registrarPresenca = async (p: { presenca: PresencaAssembleia | null; procurador: string | null; arquivo: File | null }) => {
        if (!a || !unidade) return;
        setGravando(true);
        try {
            let procuracaoId: string | null = null;
            if (p.presenca === 'PROCURADOR') {
                procuracaoId = unidade.procuracaoDocumentoId;
                if (p.arquivo) {
                    const doc = await ops.enviarDocumento(a.id, p.arquivo,
                        { ...DOC_PROCURACAO, titulo: `Procuração — ${unidade.unidadeRotulo ?? 'unidade'} — ${a.titulo}` });
                    procuracaoId = doc.documentoId;
                    onAlterado?.(); // a procuração está em Documentos (interna)
                }
            }
            const r = await ops.registrarPresenca(a.id, unidade.unitId, p.presenca, p.procurador, procuracaoId);
            // §22 — costura local.
            costurar(d => (d ? {
                ...d,
                unidades: d.unidades.map(u => (u.unitId === r.unitId ? {
                    ...u, presenca: r.presenca, procuradorNome: r.procurador, procuracaoDocumentoId: r.procuracaoDocumentoId,
                    presencaEm: r.presenca ? new Date().toISOString() : null,
                } : u)),
            } : d));
            notify(r.presenca ? `Presença registrada: ${unidade.unidadeRotulo ?? 'unidade'}.` : 'Presença removida.');
            atualizarApuracao(a);
        } catch (err) {
            notify(msg(err, 'Erro ao registrar a presença.'), 'error');
        } finally { setGravando(false); }
    };

    const lancarVoto = async (item: ItemAssembleia, opcao: OpcaoVoto) => {
        if (!a || !unidade) return;
        const atual = votos.find(v => v.itemId === item.id && v.unitId === unidade.unitId);
        if (atual?.origem === 'PRESENCIAL' && atual.opcao === opcao) return;
        if (atual?.origem === 'PORTAL') {
            const ok = await confirm({
                title: 'Substituir o voto do portal?',
                message: `Esta unidade votou ${rotuloOpcao(atual.opcao)} pelo portal em ${dataHoraBrasilia(atual.votadoEm)}. Substituir?`,
                variant: 'warning',
                confirmLabel: 'Substituir',
                cancelLabel: 'Manter o voto do portal',
            });
            if (!ok) return;
        }
        setGravando(true);
        try {
            const r = await ops.lancarVoto(item.id, unidade.unitId, opcao);
            const agora = new Date().toISOString();
            // R7: o banco devolve o voto que foi substituído. Se era do PORTAL e não é o que a
            // tela mostrou na confirmação (chegou depois da última leitura), o gestor fica sabendo.
            const ant = r.anterior;
            const conhecido = !!ant && atual?.origem === 'PORTAL' && atual.opcao === ant.opcao
                && new Date(atual.votadoEm).getTime() === new Date(ant.votadoEm).getTime();
            if (ant?.origem === 'PORTAL' && !conhecido) {
                notify(`Esta unidade tinha votado ${rotuloOpcao(ant.opcao)} pelo portal em ${dataHoraBrasilia(ant.votadoEm)}; `
                    + `o voto da sala (${rotuloOpcao(r.opcao)}) substituiu.`, 'warning');
            }
            costurar(d => {
                if (!d) return d;
                const outros = d.votos.filter(v => !(v.itemId === r.itemId && v.unitId === r.unitId));
                return { ...d, votos: [...outros, {
                    id: r.votoId, assembleiaId: a.id, itemId: r.itemId, unitId: r.unitId, opcao: r.opcao,
                    origem: 'PRESENCIAL', clientId: null, lancadoPor: null, votadoEm: agora,
                }] };
            });
            atualizarApuracao(a);
        } catch (err) {
            notify(msg(err, 'Erro ao lançar o voto.'), 'error');
        } finally { setGravando(false); }
    };

    // ── impedimento marcado à mão (A10, R3) ──────────────────────────────
    // Marcar impede presença e voto daqui em diante; voto já lançado continua valendo e o
    // quórum gravado na instalação não muda — a regra é do banco.
    const marcarImpedida = async (motivo: string | null) => {
        if (!a || !unidade) return;
        setGravando(true);
        try {
            const r = await ops.marcarImpedida(a.id, unidade.unitId, motivo);
            costurar(d => (d ? {
                ...d,
                unidades: d.unidades.map(u => (u.unitId === r.unitId
                    ? { ...u, impedimentoManual: r.motivo, impedimentoManualEm: r.em } : u)),
            } : d));
            // Desmarcada, some a marca; a regra automática (se houver) volta pela releitura abaixo.
            setImpedimentos(lista => lista.filter(i => !(i.unitId === r.unitId && i.origem === 'MANUAL')));
            notify(r.motivo
                ? `Unidade marcada como impedida: ${unidade.unidadeRotulo ?? 'unidade'}.`
                : `Marca de impedimento retirada: ${unidade.unidadeRotulo ?? 'unidade'}.`);
            atualizarApuracao(a);
        } catch (err) {
            notify(msg(err, 'Erro ao marcar o impedimento.'), 'error');
        } finally { setGravando(false); }
    };

    // ── cabeçalho ────────────────────────────────────────────────────────
    const acao: { label: string; icone: React.ReactNode; onClick: () => void; desligada?: boolean } | null = !a ? null
        : a.status === 'RASCUNHO' ? { label: 'Convocar', icone: <Megaphone className="w-[15px] h-[15px]" />, onClick: abrirConvocar }
            : a.status === 'CONVOCADA' ? { label: 'Instalar', icone: <Gavel className="w-[15px] h-[15px]" />, onClick: abrirInstalar }
                : a.status === 'INSTALADA' ? { label: 'Encerrar', icone: <CheckSquare className="w-[15px] h-[15px]" />, onClick: () => setGaveta('encerrar') }
                    : a.status === 'ENCERRADA' && !a.ataDocumentoId && a.retrato
                        ? { label: ata.gerando ? 'Gerando a ata...' : 'Gerar ata novamente', icone: <FileText className="w-[15px] h-[15px]" />,
                            onClick: () => a.retrato && gerarAta(a.retrato, a), desligada: ata.gerando }
                        : null;

    const titulo = a?.titulo ?? 'Assembleia';

    // ── unidades: linhas da tabela ───────────────────────────────────────
    const votosPorUnidade = React.useMemo(() => {
        const m = new Map<string, { portal: number; sala: number }>();
        for (const v of votos) {
            const c = m.get(v.unitId) ?? { portal: 0, sala: 0 };
            if (v.origem === 'PORTAL') c.portal += 1; else c.sala += 1;
            m.set(v.unitId, c);
        }
        return m;
    }, [votos]);

    const textoPresenca = (u: UnidadeNaAssembleia) => {
        if (u.presenca === 'PROCURADOR') return `Procurador: ${u.procuradorNome ?? 'nome não informado'}`;
        if (u.presenca === 'PRESENCIAL') return 'Na sala';
        return (votosPorUnidade.get(u.unitId)?.portal ?? 0) > 0 ? 'Pelo portal' : 'Ausente';
    };
    const textoVotos = (u: UnidadeNaAssembleia) => {
        const c = votosPorUnidade.get(u.unitId);
        const n = (c?.portal ?? 0) + (c?.sala ?? 0);
        if (!n) return `0 de ${itens.length}`;
        const origem = [c?.portal ? `${c.portal} portal` : '', c?.sala ? `${c.sala} sala` : ''].filter(Boolean).join(', ');
        return `${n} de ${itens.length} (${origem})`;
    };
    /** Impedimento AGORA (só com a assembleia viva) — é o que trava presença e voto. */
    const impedimentoAgora = (u: UnidadeNaAssembleia) => (congelada ? null : impedidas.get(u.unitId) ?? null);
    const situacao = (u: UnidadeNaAssembleia): { impedida: boolean; texto: string } => {
        if (congelada) {
            const m = impedidasNaInstalacao.get(u.unitId)
                ?? (u.impedidaNaInstalacao ? { motivo: 'cota condominial vencida', origem: 'AUTOMATICA' as const } : null);
            return m
                ? { impedida: true, texto: `Impedida na instalação${m.origem === 'MANUAL' ? ' (marcada à mão)' : ''}: ${m.motivo}` }
                : { impedida: false, texto: 'Apta na instalação' };
        }
        const m = impedidas.get(u.unitId);
        return m ? { impedida: true, texto: textoImpedimento(m) } : { impedida: false, texto: 'Apta' };
    };

    const portalVotaram = React.useMemo(
        () => new Set(votos.filter(v => v.origem === 'PORTAL').map(v => v.unitId)).size, [votos]);

    if (carregando) {
        return (
            <div className="text-center py-16">
                <Loader2 className={`w-8 h-8 ${ac.spinner} mx-auto animate-spin`} />
                <p className="mt-2 text-gray-500">Carregando a assembleia...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* §23 — Condomínios → condomínio → assembleia: dois saltos, todos clicáveis. */}
            <div>
                <Breadcrumb
                    className="mb-1.5"
                    items={[
                        { label: rotuloDaLista, onClick: onVoltarParaLista ?? onVoltar },
                        { label: identidade, onClick: onVoltar },
                        { label: titulo },
                    ]}
                />
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <button type="button" onClick={onVoltar} title="Voltar para as assembleias do condomínio"
                            aria-label="Voltar para as assembleias do condomínio"
                            className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{titulo}</h1>
                            <p className="text-gray-500 text-sm mt-1.5 font-medium">
                                {identidade}
                                {a && <>{' · '}{ROTULO_TIPO[a.tipo]}{' · '}<span className={COR_STATUS[a.status]}>{ROTULO_STATUS[a.status]}</span></>}
                            </p>
                        </div>
                    </div>
                    {a && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {a.status === 'CONVOCADA' && (
                                <button type="button" onClick={() => setGaveta('cancelar')} className={BOTAO_SECUNDARIO}>
                                    <XCircle className="w-[15px] h-[15px]" /> Cancelar assembleia
                                </button>
                            )}
                            {/* R4: o edital baixa a qualquer momento depois de convocar — cancelada inclusive. */}
                            {a.status !== 'RASCUNHO' && (
                                <button type="button" onClick={baixarEdital} className={BOTAO_SECUNDARIO}>
                                    <FileDown className="w-[15px] h-[15px]" /> Baixar edital
                                </button>
                            )}
                            {a.status === 'ENCERRADA' && a.ataDocumentoId && (
                                <button type="button" onClick={abrirAta} className={BOTAO_SECUNDARIO}>
                                    <FileText className="w-[15px] h-[15px]" /> Abrir ata
                                </button>
                            )}
                            {/* §17 — a ação do ESTADO, o único azul sólido da tela. */}
                            {acao && (
                                <button type="button" onClick={acao.onClick} disabled={acao.desligada} className={ac.primario}>
                                    {acao.icone}{acao.label}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">
                    {erro}{' '}
                    <button type="button" onClick={() => carregar()} className="font-medium underline">Tentar de novo</button>
                </div>
            )}

            {a && (
                <>
                    {(a.status === 'CONVOCADA' || a.status === 'INSTALADA') && accent === 'portal' && (
                        // §24: no portal a faixa é a do kit (card único, sem ícone).
                        <KpiStrip items={[
                            { label: 'Unidades na assembleia', value: String(unidades.length), hint: 'com fração ideal, congeladas na convocação' },
                            { label: 'Presentes aptos agora', value: percentualDoTotal(presentes.fracao, presentes.total),
                                hint: `${presentes.unidades} de ${presentes.totalUnidades} unidades${temMetade(presentes) ? ' · metade atingida' : ''}` },
                            { label: 'Impedidas agora', value: String(impedidas.size), hint: 'cota vencida ou marcada à mão' },
                            { label: 'Votaram pelo portal', value: String(portalVotaram), hint: 'unidades com ao menos um voto' },
                        ]} />
                    )}
                    {(a.status === 'CONVOCADA' || a.status === 'INSTALADA') && accent === 'indigo' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                            <KpiCard label="Unidades na assembleia" value={unidades.length}
                                sub="com fração ideal, congeladas na convocação" icon={<Users className="w-4 h-4" />} color="blue" />
                            <KpiCard label="Presentes aptos agora" value={percentualDoTotal(presentes.fracao, presentes.total)}
                                sub={`${presentes.unidades} de ${presentes.totalUnidades} unidades${temMetade(presentes) ? ' · metade atingida' : ''}`}
                                icon={<UserCheck className="w-4 h-4" />} color={temMetade(presentes) ? 'emerald' : 'amber'} />
                            <KpiCard label="Impedidas agora" value={impedidas.size} sub="cota vencida ou marcada à mão"
                                icon={<Ban className="w-4 h-4" />} color={impedidas.size ? 'red' : 'gray'} />
                            <KpiCard label="Votaram pelo portal" value={portalVotaram} sub="unidades com ao menos um voto"
                                icon={<Smartphone className="w-4 h-4" />} color="indigo" />
                        </div>
                    )}

                    <IdentificacaoSecao assembleia={a} accent={accent} />
                    <EditalAtaSecao assembleia={a} ata={ata} />
                    <PautaSecao assembleia={a} itens={itens} onVoltarParaEditar={onVoltar} accent={accent} />
                    {a.status !== 'RASCUNHO' && a.status !== 'CANCELADA' && (
                        <ApuracaoSecao assembleia={a} itens={itens} apuracao={apuracao} totalUnidades={unidades.length}
                            erro={erroApuracao} atualizando={atualizandoApuracao} onAtualizar={() => carregar(true)} />
                    )}

                    {/* Unidades — ÚLTIMA seção: é a única tabela da tela (§6.14). */}
                    <div className="space-y-3">
                        <SecaoTitulo icon={Users} titulo="Unidades"
                            resumo={a.status === 'RASCUNHO' ? undefined : `${unidades.length} na assembleia`} />
                        {a.status === 'RASCUNHO' ? (
                            <p className="text-sm text-gray-600">
                                As unidades entram ao convocar: as que têm fração ideal, com a fração congelada naquele instante.
                            </p>
                        ) : (
                            <>
                                {/* A10: aviso ACIMA da tabela (nada abaixo de tabela — §6.14). */}
                                {cotasConferidas === false && (a.status === 'CONVOCADA' || a.status === 'INSTALADA') && (
                                    <AvisoCotasNaoConferidas />
                                )}
                                {a.avisoId && (
                                    <p className="text-sm text-gray-700">
                                        {leituras === null
                                            ? 'Confirmações de leitura do aviso de convocação: não disponíveis agora.'
                                            // A leitura é registrada por PESSOA (condômino), não por unidade.
                                            : `Aviso de convocação: ${leituras} ${leituras === 1 ? 'condômino que leu' : 'condôminos que leram'}`
                                                + ' — só informação: a leitura não é exigida para instalar.'}
                                    </p>
                                )}
                                <StandardTable<UnidadeNaAssembleia>
                                    storageKey="condominio:assembleia:unidades"
                                    searchScope={a.id}
                                    columns={colunasUnidades}
                                    rows={unidades}
                                    rowKey={u => u.unitId}
                                    searchText={u => `${u.unidadeRotulo ?? ''} ${u.proprietarioNome ?? ''} ${u.procuradorNome ?? ''}`}
                                    searchPlaceholder="Buscar unidade, proprietário ou procurador..."
                                    // §9.1 — abrir a gaveta é a única ação da linha: o clique (ou Enter) na linha.
                                    // Recarrega ao abrir: a confirmação da R7 precisa do voto do portal de agora.
                                    onRowClick={u => { setUnidadeAberta(u.unitId); carregar(true); }}
                                    rowLabel={u => `${u.unidadeRotulo ?? 'Unidade'}: abrir presença e votos`}
                                    sortValue={(key, u) => key === 'unidade' ? u.unidadeRotulo
                                        : key === 'proprietario' ? u.proprietarioNome
                                            : key === 'peso' ? u.fracao
                                                : key === 'presenca' ? textoPresenca(u)
                                                    : key === 'situacao' ? situacao(u).texto
                                                        : (votosPorUnidade.get(u.unitId)?.portal ?? 0) + (votosPorUnidade.get(u.unitId)?.sala ?? 0)}
                                    renderCell={(key, u) => {
                                        if (key === 'unidade') return <span className="block truncate text-sm font-normal text-gray-700" title={u.unidadeRotulo ?? ''}>{u.unidadeRotulo ?? '—'}</span>;
                                        if (key === 'proprietario') return <span className="block truncate text-sm font-normal text-gray-700" title={u.proprietarioNome ?? ''}>{u.proprietarioNome ?? 'Sem proprietário vigente'}</span>;
                                        if (key === 'peso') return <span className="text-sm font-normal text-gray-600">{percentualDoTotal(u.fracao, presentes.total)}</span>;
                                        if (key === 'presenca') {
                                            const t = textoPresenca(u);
                                            return <span className={`block truncate text-sm font-normal ${t === 'Ausente' ? 'text-gray-600' : 'text-emerald-700'}`} title={t}>{t}</span>;
                                        }
                                        if (key === 'situacao') {
                                            const s = situacao(u);
                                            return <span className={`block truncate text-sm font-normal ${s.impedida ? 'text-red-600' : 'text-gray-700'}`} title={s.texto}>{s.texto}</span>;
                                        }
                                        return <span className="text-sm font-normal text-gray-600">{textoVotos(u)}</span>;
                                    }}
                                    empty={{ title: 'Nenhuma unidade na assembleia', subtitle: 'Nenhuma unidade tinha fração ideal na convocação.' }}
                                />
                            </>
                        )}
                    </div>

                    <ConvocarSheet open={gaveta === 'convocar'} onClose={fecharGaveta} assembleia={a} itens={itens}
                        condominioNome={condominio.nome} fora={fora} erroFora={erroFora} gravando={gravando} erro={erroGaveta}
                        cotasConferidas={cotasConferidas} onConvocar={convocar} accent={accent} />
                    <InstalarSheet open={gaveta === 'instalar'} onClose={fecharGaveta} assembleia={a} presentes={presentes}
                        impedidas={impedidas.size} leituras={leituras} gravando={gravando} erro={erroGaveta}
                        cotasConferidas={cotasConferidas} onInstalar={instalar} accent={accent} />
                    <EncerrarSheet open={gaveta === 'encerrar'} onClose={fecharGaveta} assembleia={a} itens={itens}
                        gravando={gravando} erro={erroGaveta} onEncerrar={encerrar} accent={accent} />
                    <CancelarSheet open={gaveta === 'cancelar'} onClose={fecharGaveta} assembleia={a}
                        gravando={gravando} erro={erroGaveta} onCancelar={cancelar} accent={accent} />
                    <UnidadeSheet open={!!unidade} onClose={() => setUnidadeAberta(null)} status={a.status} unidade={unidade}
                        total={presentes.total} itens={itens}
                        votos={unidade ? votos.filter(v => v.unitId === unidade.unitId) : []}
                        impedimento={unidade ? impedimentoAgora(unidade) : null} gravando={gravando}
                        onRegistrarPresenca={registrarPresenca} onLancarVoto={lancarVoto}
                        onMarcarImpedida={marcarImpedida} accent={accent} />
                </>
            )}

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white'
                        : notification.type === 'warning' ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default AssembleiaDetalheView;
