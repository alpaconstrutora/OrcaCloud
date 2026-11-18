/**
 * Diretoria (ÒPURA CEO) — casca da tela. Plano: docs/planos/2026-11-17-opura-ceo.md (Tarefa 6).
 *
 * Três jeitos de ler o MESMO painel, escolhidos num seletor de visão (`TabsBar`, §19.1) e
 * lembrados por usuário (`preferencias` → `diretoria.visao`):
 *   Fila de exceções (A) · Por responsável (B) · Reunião da semana (C).
 * Anatomia (§20/§19.1/§4): título → visões → KPIs (os mesmos nas três) → conteúdo da visão.
 *
 * Organização (REGRA #5): lê SÓ `useOrgContext()`. `null` = "Todas" e a tela carrega assim
 * mesmo — o banco devolve a união das organizações em que a pessoa tem a permissão. Recarrega
 * quando o topo muda e, sem esqueleto, depois de cada gravação.
 *   - cobrar / virar determinação a partir de um grupo: a organização é a DO GRUPO, sem perguntar;
 *   - determinação criada à mão: a do topo; em "Todas", `useOrgWriteTarget` modo `single`;
 *   - áreas e hierarquia: a do topo; em "Todas", 'all-allowed' + `forEachTargetOrg`, só nas
 *     organizações em que a pessoa pode editar (decisão 4 do plano).
 * Quem pode gravar em cada organização vem do banco (`orgs[].pode_editar`) — sem ele, os botões
 * de gravar desligam com o motivo (§9.2). "É barulho" é preferência pessoal: não depende disso.
 */
import React from 'react';
import { AlertTriangle, CalendarX2, Gavel, Info, ListChecks, Lock, Plus, UserX, Users } from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { Sheet, SheetDescription, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { forEachTargetOrg, targetOrgIds, useOrgContext, useOrgWriteTarget, type WriteTarget } from '../../hooks/useOrgContext';
import { diretoriaService, type VisaoDiretoria } from '../../services/diretoriaService';
import {
    TIPOS, chefesEfetivos, filtrarSilenciados, kpisDoPainel, nomeDe, tituloDoGrupo,
    type Determinacao, type GrupoExcecao, type PainelDiretoria, type TipoExcecao,
} from '../../utils/diretoria';
import { MOTIVO_SEM_EDICAO_DIRETORIA } from '../../utils/permissaoDiretoria';
import { DiretoriaProvider, type Diretoria, type NovaDeterminacao } from './DiretoriaContexto';
import { DeterminacaoForm, type InicialDeterminacao } from './DeterminacaoForm';
import { ResponsaveisSheet, type MudancaCadastro } from './ResponsaveisSheet';
import { SilenciadosPopover } from './SilenciadosPopover';
import { VisaoFila } from './VisaoFila';
import { VisaoPorResponsavel } from './VisaoPorResponsavel';
import { VisaoReuniao } from './VisaoReuniao';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, mensagemDeErro, plural } from './diretoriaUi';

const VISOES: TabsBarItem<VisaoDiretoria>[] = [
    { id: 'fila', label: 'Fila de exceções' },
    { id: 'responsavel', label: 'Por responsável' },
    { id: 'reuniao', label: 'Reunião da semana' },
];

/** §19.1/§20 — o título é o do módulo nas três visões; o subtítulo diz o que a visão mostra. */
const SUBTITULO: Record<VisaoDiretoria, string> = {
    fila: 'O que está fora do trilho nos módulos, por gravidade, e as determinações em aberto. Cada linha diz de onde veio.',
    responsavel: 'Quem responde a quem, e o que está fora do trilho em cada pessoa e na equipe abaixo dela.',
    reuniao: 'A pauta da semana: o que pede decisão, as determinações e o quadro para acompanhar na reunião.',
};

interface Props {
    /** Troca de tela (`setActiveView` do AppRouter) — "Abrir em Contas a pagar" etc. */
    onNavigate: (view: string) => void;
}

interface ErroDeCarga { code?: string; message: string }

const DiretoriaModule: React.FC<Props> = ({ onNavigate }) => {
    const { orgId } = useOrgContext();
    // Empresa e obra do topo: o painel NÃO recorta por elas (decisão de 18/11) — só avisa. A org
    // continua vindo só de useOrgContext (REGRA #5); aqui é apenas o nome para o aviso.
    const activeEmpresaId = useStore(s => s.activeEmpresaId);
    const companies = useStore(s => s.companies);
    const projectId = useStore(s => s.projectId);
    const projects = useStore(s => s.projects);
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const { showToast, localToast } = useToast();

    const [painel, setPainel] = React.useState<PainelDiretoria | null>(null);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<ErroDeCarga | null>(null);
    /** null até as preferências chegarem: a tela abre direto na visão gravada, sem piscar a fila. */
    const [visao, setVisao] = React.useState<VisaoDiretoria | null>(null);
    const [silenciados, setSilenciados] = React.useState<TipoExcecao[]>([]);
    const [resumoSemanal, setResumoSemanal] = React.useState(false);
    const [cadastroAberto, setCadastroAberto] = React.useState(false);
    const [formulario, setFormulario] = React.useState<{ orgId: string | null; inicial?: InicialDeterminacao; n: number } | null>(null);
    // Trocou a organização do topo: a gaveta aberta era da org anterior — fecha (revisão de 17/11).
    React.useEffect(() => { setFormulario(null); }, [orgId]);

    // ── Preferências (visão + silenciados): uma vez; falhar não segura a tela ──
    React.useEffect(() => {
        let vivo = true;
        diretoriaService.preferencias()
            .then(p => { if (vivo) { setVisao(p.visao ?? 'fila'); setSilenciados(p.silenciados); setResumoSemanal(p.resumoSemanal); } })
            .catch(() => { if (vivo) setVisao('fila'); });
        return () => { vivo = false; };
    }, []);

    // ── Painel (sem `if (!orgId) return`: em "Todas" o banco devolve a união) ──
    const seq = React.useRef(0);
    const carregar = React.useCallback(async (silencioso = false) => {
        const minha = ++seq.current;
        if (!silencioso) { setCarregando(true); setPainel(null); setErro(null); }
        try {
            const p = await diretoriaService.painel(orgId);
            if (minha !== seq.current) return;
            setPainel(p);
            setErro(null);
        } catch (e) {
            if (minha !== seq.current) return;
            if (silencioso) {
                showToast(mensagemDeErro(e, 'Gravado, mas não foi possível reler o painel. Atualize a tela.'), 'error');
            } else {
                setPainel(null);
                setErro({ code: (e as { code?: string } | null)?.code, message: mensagemDeErro(e, 'Não foi possível carregar o painel.') });
            }
        } finally {
            if (minha === seq.current) setCarregando(false);
        }
    }, [orgId, showToast]);

    React.useEffect(() => { void carregar(); }, [carregar]);
    const reler = React.useCallback(() => { void carregar(true); }, [carregar]);

    // ── Derivados ──
    const excecoes = React.useMemo(() => (painel ? filtrarSilenciados(painel.excecoes, silenciados) : []), [painel, silenciados]);
    const chefes = React.useMemo(() => chefesEfetivos(painel?.hierarquia ?? []), [painel]);
    const editaveis = React.useMemo(() => new Set((painel?.orgs ?? []).filter(o => o.pode_editar).map(o => o.id)), [painel]);
    const podeEditarOrg = React.useCallback((id: string) => editaveis.has(id), [editaveis]);
    const podeEditarAlguma = orgId ? editaveis.has(orgId) : editaveis.size > 0;
    const nomeDaOrg = React.useCallback((id: string) => painel?.orgs.find(o => o.id === id)?.nome ?? 'Organização fora do painel', [painel]);
    const semPermissao = erro?.code === '42501' || (!!painel && painel.orgs.length === 0);
    const visaoAtual: VisaoDiretoria = visao ?? 'fila';

    // ── Preferências pessoais ──
    const trocarVisao = (v: VisaoDiretoria) => {
        setVisao(v);
        diretoriaService.gravarVisao(v).catch(() => showToast('Não foi possível lembrar a visão escolhida; ela vale até sair da tela.', 'error'));
    };

    const gravarSilenciados = (novos: TipoExcecao[], desfazer: () => void, aviso: string) => {
        setSilenciados(novos);
        diretoriaService.gravarSilenciados(novos)
            .then(() => showToast(aviso))
            .catch(e => { desfazer(); showToast(mensagemDeErro(e, 'Não foi possível gravar a preferência.'), 'error'); });
    };
    const silenciar = (tipo: TipoExcecao) => {
        if (silenciados.includes(tipo)) return;
        gravarSilenciados([...silenciados, tipo], () => setSilenciados(s => s.filter(t => t !== tipo)),
            `"${TIPOS[tipo].nome}" saiu da sua tela. Para trazer de volta: "Silenciados".`);
    };
    const reativar = (tipo: TipoExcecao) => {
        gravarSilenciados(silenciados.filter(t => t !== tipo), () => setSilenciados(s => (s.includes(tipo) ? s : [...s, tipo])),
            `"${TIPOS[tipo].nome}" voltou para a tela.`);
    };

    // ── Resumo por e-mail (preferência da pessoa; vale em todas as organizações dela) ──
    const alternarResumoSemanal = (ligado: boolean) => {
        setResumoSemanal(ligado);
        diretoriaService.gravarResumoSemanal(ligado)
            .then(() => showToast(ligado
                ? 'Pronto: o resumo chega no seu e-mail toda segunda às 07:00.'
                : 'Você não recebe mais o resumo por e-mail.'))
            .catch(e => { setResumoSemanal(!ligado); showToast(mensagemDeErro(e, 'Não foi possível gravar a preferência.'), 'error'); });
    };
    const enviarPrevia = async () => {
        try {
            const n = await diretoriaService.enviarPrevia();
            showToast(n > 0 ? 'Prévia enviada para o seu e-mail.' : 'A prévia não saiu: confira se você tem a permissão Diretoria e um e-mail cadastrado.', n > 0 ? 'success' : 'error');
        } catch (e) {
            showToast(mensagemDeErro(e, 'A prévia não saiu.'), 'error');
        }
    };

    // ── Gravações (sempre seguidas de uma releitura sem esqueleto) ──
    const avisoDaCobranca = (criadas: number, jaAbertas: number, ignorados = 0) => {
        // Quem saiu da organização (aprovador antigo, responsável de área) o banco deixa de fora.
        const fora = ignorados > 0
            ? ` ${plural(ignorados, 'pessoa não é mais da organização e ficou de fora', 'pessoas não são mais da organização e ficaram de fora')}.`
            : '';
        if (criadas === 0) {
            return (jaAbertas > 0 ? 'Nada novo: quem responde já tinha cobrança aberta.' : 'Ninguém foi cobrado.') + fora;
        }
        const parte = `${plural(criadas, 'tarefa criada', 'tarefas criadas')} na agenda de quem responde`;
        return (jaAbertas > 0 ? `${parte}; ${plural(jaAbertas, 'pessoa já tinha', 'pessoas já tinham')} cobrança aberta.` : `Cobrança enviada: ${parte}.`) + fora;
    };

    const cobrar = async (g: GrupoExcecao) => {
        try {
            const r = await diretoriaService.cobrar({
                orgId: g.org_id, chave: g.familia, tipo: g.tipo, titulo: tituloDoGrupo(g),
                responsaveis: g.responsaveis, tela: TIPOS[g.tipo].tela,
            });
            showToast(avisoDaCobranca(r?.criadas ?? 0, r?.ja_abertas ?? 0, r?.ignorados ?? 0), (r?.criadas ?? 0) + (r?.ja_abertas ?? 0) > 0 ? 'success' : 'error');
            reler();
        } catch (e) {
            showToast(mensagemDeErro(e, 'Não foi possível cobrar.'), 'error');
        }
    };

    const cobrarTodos = async (gs: GrupoExcecao[]) => {
        let criadas = 0, jaAbertas = 0, ignorados = 0;
        const falhas: unknown[] = [];
        for (const g of gs) {
            try {
                const r = await diretoriaService.cobrar({
                    orgId: g.org_id, chave: g.familia, tipo: g.tipo, titulo: tituloDoGrupo(g),
                    responsaveis: g.responsaveis, tela: TIPOS[g.tipo].tela,
                });
                criadas += r?.criadas ?? 0;
                jaAbertas += r?.ja_abertas ?? 0;
                ignorados += r?.ignorados ?? 0;
            } catch (e) { falhas.push(e); }
        }
        if (falhas.length) {
            showToast(`${avisoDaCobranca(criadas, jaAbertas, ignorados)} ${plural(falhas.length, 'grupo não foi cobrado', 'grupos não foram cobrados')}: ${mensagemDeErro(falhas[0], 'erro desconhecido')}`, criadas ? 'success' : 'error');
        } else {
            showToast(avisoDaCobranca(criadas, jaAbertas, ignorados));
        }
        reler();
    };

    const determinar = async (n: NovaDeterminacao): Promise<boolean> => {
        let org = n.orgId;
        if (!org) {
            // Determinação é de UMA organização por natureza (REGRA #5, item 4): modo 'single'.
            const alvo = await resolveWriteOrg('single');
            if (!alvo) return false;
            org = alvo.kind === 'org' ? alvo.orgId : null;
            if (!org) return false;
        }
        if (!editaveis.has(org)) { showToast(MOTIVO_SEM_EDICAO_DIRETORIA, 'error'); return false; }
        const pessoa = painel?.pessoas.find(p => p.user_id === n.responsavelId);
        if (!pessoa || !(pessoa.orgs ?? []).includes(org)) {
            showToast(`${nomeDe(n.responsavelId, painel?.pessoas ?? [])} não é membro de ${nomeDaOrg(org)}: escolha outra pessoa ou outra organização.`, 'error');
            return false;
        }
        try {
            await diretoriaService.determinar({ ...n, orgId: org });
            showToast(`Determinação registrada. A tarefa foi para a agenda de ${pessoa.nome}.`);
            reler();
            return true;
        } catch (e) {
            showToast(mensagemDeErro(e, 'Não foi possível registrar a determinação.'), 'error');
            return false;
        }
    };

    const atualizar = async (d: Determinacao, texto: string): Promise<boolean> => {
        try {
            await diretoriaService.atualizar(d.id, texto);
            showToast('Atualização registrada.');
            reler();
            return true;
        } catch (e) {
            showToast(mensagemDeErro(e, 'Não foi possível registrar a atualização.'), 'error');
            return false;
        }
    };

    const concluir = async (d: Determinacao) => {
        try {
            await diretoriaService.concluir(d.id);
            showToast(`Determinação concluída. A tarefa de ${nomeDe(d.responsavel_user_id, painel?.pessoas ?? [])} foi fechada junto.`);
            reler();
        } catch (e) {
            showToast(mensagemDeErro(e, 'Não foi possível concluir a determinação.'), 'error');
        }
    };

    const salvarCadastro = async (mudancas: MudancaCadastro[]): Promise<boolean> => {
        let alvo: WriteTarget | null = orgId ? { kind: 'org', orgId } : await resolveWriteOrg('all-allowed');
        if (!alvo) return false;
        // "Todas as organizações" no modal = as do usuário; aqui, só as em que ele pode editar a Diretoria.
        if (alvo.kind === 'all') alvo = { kind: 'all', orgIds: alvo.orgIds.filter(id => editaveis.has(id)) };
        const destino = targetOrgIds(alvo);
        if (destino.length === 0) { showToast(MOTIVO_SEM_EDICAO_DIRETORIA, 'error'); return false; }

        const orgsComFalha = new Map<string, unknown>();
        for (const m of mudancas) {
            const r = await forEachTargetOrg(alvo, org => (m.tipo === 'area'
                ? diretoriaService.definirArea(org, m.area, m.userId)
                : diretoriaService.definirChefe(org, m.userId, m.chefeId)));
            for (const f of r.failed) if (!orgsComFalha.has(f.orgId)) orgsComFalha.set(f.orgId, f.error);
        }
        const k = orgsComFalha.size;
        if (k === 0) {
            showToast(destino.length > 1 ? `Responsáveis gravados em ${destino.length} organizações.` : 'Responsáveis gravados.');
        } else {
            const [primeira] = orgsComFalha;
            const nomes = [...orgsComFalha.keys()].map(nomeDaOrg).join(', ');
            showToast(
                `${k === destino.length ? 'Nada foi gravado' : `Gravado em ${destino.length - k} de ${destino.length} organizações`}. `
                + `${plural(k, 'organização não aceitou', 'organizações não aceitaram')} (${nomes}): ${mensagemDeErro(primeira[1], 'erro desconhecido')}`,
                k === destino.length ? 'error' : 'success',
            );
        }
        reler();
        return true;
    };

    // Montado a cada render, de propósito: as ações leem o estado do render atual (organização do
    // topo, silenciados, painel). Os consumidores são filhos desta tela e já re-renderizam com ela.
    const ctx: Diretoria | null = painel ? {
        painel, excecoes, silenciados, orgDoTopo: orgId, chefes,
        podeEditarOrg, podeEditarAlguma, nomeDaOrg, mostrarOrg: painel.orgs.length > 1,
        cobrar, cobrarTodos,
        virarDeterminacao: g => setFormulario({
            orgId: g.org_id, n: Date.now(),
            inicial: { titulo: tituloDoGrupo(g), responsavelId: g.responsaveis[0] ?? null, origem: TIPOS[g.tipo].nome, excecaoChave: g.familia },
        }),
        silenciar,
        abrirCadastro: () => setCadastroAberto(true),
        navegar: onNavigate,
        determinar, atualizar, concluir,
        resumoSemanal, alternarResumoSemanal, enviarPrevia,
    } : null;

    const k = painel ? kpisDoPainel(excecoes, painel.determinacoes, painel.hoje) : null;
    const abertas = painel ? painel.determinacoes.filter(x => x.status !== 'concluida').length : 0;
    const errosDeLeitura = painel ? Object.keys(painel.erros) : [];
    const pronto = !!painel && !!ctx && !semPermissao && visao !== null;
    const empresaDoTopo = activeEmpresaId ? companies.find(c => c.id === activeEmpresaId) : undefined;
    const obraDoTopo = projectId ? projects.find(p => p.id === projectId) : undefined;
    const recorteDoTopo = empresaDoTopo ? `a empresa ${empresaDoTopo.nome_fantasia || empresaDoTopo.razao_social}`
        : obraDoTopo ? `a obra ${obraDoTopo.name}` : null;

    return (
        <div className="space-y-6 pb-20">
            {/* §20 — título solto */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Diretoria</h1>
                <p className="text-gray-500 text-sm mt-1.5 font-medium">{SUBTITULO[visaoAtual]}</p>
                {pronto && !podeEditarAlguma && (
                    <p className="flex items-start gap-1.5 text-sm text-gray-700 mt-2">
                        <Lock className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" aria-hidden="true" /> {MOTIVO_SEM_EDICAO_DIRETORIA}
                    </p>
                )}
                {pronto && recorteDoTopo && (
                    <p className="flex items-start gap-1.5 text-sm text-gray-700 mt-2">
                        <Info className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" aria-hidden="true" />
                        <span>
                            {orgId ? 'Mostrando a organização inteira' : 'Mostrando as organizações inteiras'}: a Diretoria não recorta por empresa nem por obra (no topo está {recorteDoTopo}).
                        </span>
                    </p>
                )}
                {pronto && errosDeLeitura.length > 0 && (
                    <p className="flex items-start gap-1.5 text-sm text-amber-800 mt-2"
                        title={errosDeLeitura.map(t => `${TIPOS[t as TipoExcecao]?.nome ?? t}: ${painel!.erros[t]}`).join('\n')}>
                        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" aria-hidden="true" />
                        <span>
                            Não foi possível ler: {errosDeLeitura.map(t => TIPOS[t as TipoExcecao]?.nome ?? t).join(', ')}. O resto do painel está completo.
                        </span>
                    </p>
                )}
            </div>

            {/* §19.1 — seletor de visão; à direita, Silenciados, Responsáveis e a ação primária da fila (§17) */}
            <TabsBar<VisaoDiretoria> tabs={VISOES} value={visaoAtual} onChange={trocarVisao}>
                {pronto && (
                    <>
                        <SilenciadosPopover silenciados={silenciados} onReativar={reativar} />
                        <button type="button" onClick={() => setCadastroAberto(true)} className={BOTAO_SECUNDARIO}
                            title="Responsáveis por área e quem responde a quem">
                            <Users className="w-[15px] h-[15px]" aria-hidden="true" /> Responsáveis
                        </button>
                        {visaoAtual === 'fila' && (
                            <span className="inline-flex" title={podeEditarAlguma ? undefined : MOTIVO_SEM_EDICAO_DIRETORIA}>
                                <button type="button" disabled={!podeEditarAlguma} className={BOTAO_PRIMARIO}
                                    onClick={() => setFormulario({ orgId, n: Date.now() })}>
                                    <Plus className="w-[15px] h-[15px]" aria-hidden="true" /> Nova determinação
                                </button>
                            </span>
                        )}
                    </>
                )}
            </TabsBar>

            {carregando || (visao === null && !erro) ? (
                // §11
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando o painel…</p>
                </div>
            ) : semPermissao ? (
                <div className="text-center py-12 px-4 bg-white rounded-[10px] border border-gray-100 shadow-sm">
                    <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
                    <h2 className="text-lg font-bold text-gray-900 mb-2">
                        Você não tem a permissão "Diretoria (CEO)"{orgId ? ' nesta organização' : ' em nenhuma das suas organizações'}
                    </h2>
                    <p className="text-sm text-gray-500 max-w-[60ch] mx-auto">
                        O painel só mostra as organizações em que você tem essa permissão. Peça a um administrador da organização
                        que a ligue em Minha organização › Usuários › Permissões detalhadas › Diretoria (CEO).
                    </p>
                </div>
            ) : erro ? (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                    <span>Não foi possível carregar o painel: {erro.message}</span>
                    <button type="button" onClick={() => void carregar()} className="font-medium text-red-700 underline">Tentar de novo</button>
                </div>
            ) : pronto && k && ctx ? (
                <DiretoriaProvider value={ctx}>
                    {/* §4 — os mesmos KPIs nas três visões, sobre as exceções já sem os silenciados */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                        <KpiCard label="Pedem decisão" value={k.pedemDecisao} icon={<AlertTriangle />} color="red"
                            sub={k.pedemDecisao ? 'grupos na faixa mais grave' : 'nada na faixa mais grave'} />
                        <KpiCard label="Fora do trilho" value={k.foraDoTrilho} sub={plural(k.itens, 'item', 'itens')} icon={<ListChecks />} color="amber" />
                        <KpiCard label="Determinações vencidas" value={k.determinacoesVencidas} sub={`${abertas} em aberto`} icon={<CalendarX2 />} color="orange" />
                        <KpiCard label="Sem responsável" value={k.semResponsavel} icon={<UserX />} color="violet"
                            sub={k.semResponsavel ? 'clique para cadastrar' : 'todos os grupos têm quem responda'}
                            onClick={() => setCadastroAberto(true)} title="Abrir o cadastro de responsáveis" />
                    </div>

                    {visaoAtual === 'fila' && <VisaoFila />}
                    {visaoAtual === 'responsavel' && <VisaoPorResponsavel />}
                    {visaoAtual === 'reuniao' && <VisaoReuniao />}

                    {cadastroAberto && <ResponsaveisSheet onClose={() => setCadastroAberto(false)} onSalvar={salvarCadastro} />}

                    {formulario && (
                        <Sheet open onClose={() => setFormulario(null)} size="lg">
                            <SheetHeader onClose={() => setFormulario(null)}>
                                <SheetTitle>Nova determinação</SheetTitle>
                                <SheetDescription>
                                    {formulario.inicial?.excecaoChave
                                        ? 'A partir de uma exceção: a organização é a dela, e a determinação fica ligada ao grupo.'
                                        : 'Uma decisão da diretoria, com responsável e prazo.'}
                                </SheetDescription>
                            </SheetHeader>
                            <SheetPanel className="px-6 py-5">
                                <DeterminacaoForm key={formulario.n} orgId={formulario.orgId} inicial={formulario.inicial}
                                    onGravado={() => setFormulario(null)} onCancelar={() => setFormulario(null)} />
                            </SheetPanel>
                        </Sheet>
                    )}
                </DiretoriaProvider>
            ) : null}

            {orgTargetModal}

            {/* §13 — com o ToastProvider na raiz, `localToast` vem null e o aviso sai pelo provider;
                sem provider (teste, render isolado), ele aparece aqui. Nunca fica mudo. */}
            {localToast && (
                <div role="status" className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {localToast.type === 'success' ? <Gavel className="w-4 h-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />}
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default DiretoriaModule;
