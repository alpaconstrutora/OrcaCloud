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
// `operacoesDoGestor` (A4); a fase B (síndico) passa a implementação da porta
// dele — a tela não sabe quem conduz. A regra (estado, R3, R6–R9) é do BANCO:
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
//   • organização de upload = orgDoCondominio(e) (catraca orgDoCondominioGuard).
//
// Ordem das seções: Identificação · Edital e ata · Pauta · Apuração · Unidades. A
// lista de Unidades é a única TABELA e vem por último — nada abaixo de tabela (§6.14).

import React from 'react';
import {
    ArrowLeft, Loader2, AlertCircle, Megaphone, Gavel, CheckSquare, FileDown, FileText, XCircle, Users, UserCheck,
    Ban, Smartphone,
} from 'lucide-react';
import Breadcrumb from '../ui/Breadcrumb';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import SecaoTitulo from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import { identidadeDoCondominio, nomeDoCondominioNosDocumentos } from '../../utils/condominioIdentidade';
import { orgDoCondominio } from '../../utils/orgDoCondominio';
import {
    dataHoraBrasilia, montarAta, montarEdital, percentualDoTotal, rotuloOpcao, ROTULO_STATUS, ROTULO_TIPO,
} from '../../utils/assembleiaTextos';
import { baixarEditalPdf, gerarAtaPdf } from '../../services/assembleiaPdf';
import { condominioComunicacaoService } from '../../services/condominioComunicacaoService';
import { empreendimentoService } from '../../services/empreendimentoService';
import type {
    Apuracao, Assembleia, AssembleiaCarregada, DadosInstalacao, ImpedimentoUnidade, ItemAssembleia, OpcaoVoto,
    OperacoesAssembleia, PresencaAssembleia, Retrato, UnidadeNaAssembleia,
} from '../../services/condominioAssembleiaService';
import type { Empreendimento } from '../../types/empreendimento';
import UnidadeSheet from './assembleia/UnidadeSheet';
import { CancelarSheet, ConvocarSheet, EncerrarSheet, InstalarSheet } from './assembleia/ConducaoSheets';
import { ApuracaoSecao, EditalAtaSecao, IdentificacaoSecao, PautaSecao } from './assembleia/SecoesDaAssembleia';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, COR_STATUS, diaBrasilia, presentesAptos, temMetade } from './assembleia/comum';

interface Props {
    assembleiaId: string;
    empreendimento: Empreendimento;
    ops: OperacoesAssembleia;
    /** Volta para a aba Assembleias do condomínio. */
    onVoltar: () => void;
    /** Volta para a LISTA de condomínios — o primeiro salto da migalha. */
    onVoltarParaLista?: () => void;
}

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

const AssembleiaDetalheView: React.FC<Props> = ({ assembleiaId, empreendimento: e, ops, onVoltar, onVoltarParaLista }) => {
    const confirm = useConfirm();
    // A org da OPERAÇÃO do condomínio (pode ser própria — 21/10/2026).
    const orgId = orgDoCondominio(e);
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

    const [gaveta, setGaveta] = React.useState<Gaveta>(null);
    const [gravando, setGravando] = React.useState(false);
    const [erroGaveta, setErroGaveta] = React.useState<string | null>(null);
    const [unidadeAberta, setUnidadeAberta] = React.useState<string | null>(null);
    const [fora, setFora] = React.useState<string[] | null>(null);
    const [erroFora, setErroFora] = React.useState<string | null>(null);

    const [ata, setAta] = React.useState<{ gerando: boolean; erro: string | null }>({ gerando: false, erro: null });
    // Upload que deu certo mas o vínculo falhou: refaz só o vínculo (sem 2º PDF em Documentos).
    const ataEnviada = React.useRef<string | null>(null);

    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
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
                condominioComunicacaoService.listAvisos(e.id)
                    .then(avisos => setLeituras(avisos.find(av => av.id === d.assembleia.avisoId)?._leituras ?? 0))
                    .catch(() => setLeituras(null));
            }
        } catch (err) {
            if (g === geracao.current) setErro(msg(err, 'Erro ao carregar a assembleia.'));
        } finally {
            if (!silencioso) setCarregando(false);
        }
    }, [ops, assembleiaId, atualizarApuracao, e.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const a = dados?.assembleia ?? null;
    const itens = dados?.itens ?? [];
    const unidades = dados?.unidades ?? [];
    const votos = dados?.votos ?? [];
    const impedidas = React.useMemo(() => new Map(impedimentos.map(i => [i.unitId, i.motivo])), [impedimentos]);
    const presentes = React.useMemo(
        () => presentesAptos(unidades, votos, new Set(impedidas.keys())), [unidades, votos, impedidas]);

    // Situação da unidade. Em ENCERRADA vale o que ficou CONGELADO na instalação (retrato /
    // quorum_instalacao) — ops.impedimentos é o "agora" e só existe com a assembleia viva.
    // Em CANCELADA (sempre antes de instalar) não há situação gravada: a coluna sai.
    const congelada = a?.status === 'ENCERRADA' || a?.status === 'CANCELADA';
    const impedidasNaInstalacao = React.useMemo(() => {
        const lista = a?.retrato?.impedidasNaInstalacao?.length ? a.retrato.impedidasNaInstalacao
            : (a?.quorumInstalacao?.impedidas ?? a?.retrato?.cabecalho.quorumInstalacao?.impedidas ?? []);
        return new Map(lista.map(i => [i.unitId, i.motivo]));
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
        try {
            // Mesmo rótulo do banco: "Torre — Unidade".
            const todas = await empreendimentoService.listAllUnitsForEmpreendimento(e.id);
            setFora(todas.filter(u => !(Number(u.fracao_ideal_decimal) > 0)).map(u => `${u._tower_name} — ${u.name}`));
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
                const doc = await condominioComunicacaoService.uploadDocumento(arquivo, {
                    empreendimento_id: e.id,
                    organization_id: orgId,
                    titulo: `${modelo.titulo} — ${assembleia.titulo}`,
                    categoria: 'ATA',
                    visivel_portal: true,
                });
                documentoId = doc.id;
                ataEnviada.current = doc.id;
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
            const docs = await condominioComunicacaoService.listDocumentos(e.id);
            const doc = docs.find(d => d.id === a.ataDocumentoId);
            if (!doc) throw new Error('A ata não está entre os documentos deste condomínio.');
            const url = await condominioComunicacaoService.abrirDocumento(doc);
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
                    const doc = await condominioComunicacaoService.uploadDocumento(p.arquivo, {
                        empreendimento_id: e.id,
                        organization_id: orgId,
                        titulo: `Procuração — ${unidade.unidadeRotulo ?? 'unidade'} — ${a.titulo}`,
                        categoria: 'OUTRO',
                        visivel_portal: false,
                    });
                    procuracaoId = doc.id;
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
    const motivoImpedida = (u: UnidadeNaAssembleia) => (congelada ? null : impedidas.get(u.unitId) ?? null);
    const situacao = (u: UnidadeNaAssembleia): { impedida: boolean; texto: string } => {
        if (congelada) {
            const m = impedidasNaInstalacao.get(u.unitId) ?? (u.impedidaNaInstalacao ? 'cota condominial vencida' : null);
            return m ? { impedida: true, texto: `Impedida na instalação: ${m}` } : { impedida: false, texto: 'Apta na instalação' };
        }
        const m = impedidas.get(u.unitId);
        return m ? { impedida: true, texto: `Impedida: ${m}` } : { impedida: false, texto: 'Apta' };
    };

    const portalVotaram = React.useMemo(
        () => new Set(votos.filter(v => v.origem === 'PORTAL').map(v => v.unitId)).size, [votos]);

    if (carregando) {
        return (
            <div className="text-center py-16">
                <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
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
                        { label: 'Condomínios', onClick: onVoltarParaLista ?? onVoltar },
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
                                <button type="button" onClick={acao.onClick} disabled={acao.desligada} className={BOTAO_PRIMARIO}>
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
                    {(a.status === 'CONVOCADA' || a.status === 'INSTALADA') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                            <KpiCard label="Unidades na assembleia" value={unidades.length}
                                sub="com fração ideal, congeladas na convocação" icon={<Users className="w-4 h-4" />} color="blue" />
                            <KpiCard label="Presentes aptos agora" value={percentualDoTotal(presentes.fracao, presentes.total)}
                                sub={`${presentes.unidades} de ${presentes.totalUnidades} unidades${temMetade(presentes) ? ' · metade atingida' : ''}`}
                                icon={<UserCheck className="w-4 h-4" />} color={temMetade(presentes) ? 'emerald' : 'amber'} />
                            <KpiCard label="Impedidas agora" value={impedimentos.length} sub="cota condominial vencida"
                                icon={<Ban className="w-4 h-4" />} color={impedimentos.length ? 'red' : 'gray'} />
                            <KpiCard label="Votaram pelo portal" value={portalVotaram} sub="unidades com ao menos um voto"
                                icon={<Smartphone className="w-4 h-4" />} color="indigo" />
                        </div>
                    )}

                    <IdentificacaoSecao assembleia={a} />
                    <EditalAtaSecao assembleia={a} ata={ata} />
                    <PautaSecao assembleia={a} itens={itens} onVoltarParaEditar={onVoltar} />
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
                        onConvocar={convocar} />
                    <InstalarSheet open={gaveta === 'instalar'} onClose={fecharGaveta} assembleia={a} presentes={presentes}
                        impedidas={impedimentos.length} leituras={leituras} gravando={gravando} erro={erroGaveta}
                        onInstalar={instalar} />
                    <EncerrarSheet open={gaveta === 'encerrar'} onClose={fecharGaveta} assembleia={a} itens={itens}
                        gravando={gravando} erro={erroGaveta} onEncerrar={encerrar} />
                    <CancelarSheet open={gaveta === 'cancelar'} onClose={fecharGaveta} assembleia={a}
                        gravando={gravando} erro={erroGaveta} onCancelar={cancelar} />
                    <UnidadeSheet open={!!unidade} onClose={() => setUnidadeAberta(null)} status={a.status} unidade={unidade}
                        total={presentes.total} itens={itens}
                        votos={unidade ? votos.filter(v => v.unitId === unidade.unitId) : []}
                        impedimento={unidade ? motivoImpedida(unidade) : null} gravando={gravando}
                        onRegistrarPresenca={registrarPresenca} onLancarVoto={lancarVoto} />
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
