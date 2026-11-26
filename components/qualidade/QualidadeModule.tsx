import React from 'react';
import { Info, Lock } from 'lucide-react';
import type {
    InspecaoAprovada, ItemControlado, NivelSiac, ProcedimentoResumo, RegistroTreinamento, TipoItemControlado,
} from '../../types/qualidadeSiac';
import { qualidadeSiacService } from '../../services/qualidadeSiacService';
import {
    errorMessage, forEachTargetOrg, partialFailureNote, useOrgContext, useOrgWriteTarget,
} from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { useConfirm } from '../ui/confirm';
import { usePersistedState } from '../ui/TableUtils';
import { TabsBar } from '../ui/TabsBar';
import { MOTIVO_SEM_EDICAO_QUALIDADE, podeEditarQualidadeSiacNoContexto } from '../../utils/permissaoQualidadeSiac';
import { vinculosDoUsuario } from '../../utils/modulosPermitidos';
import { contarAplicados } from '../../utils/qualidadeSiac';
import { PainelDoNivel } from './PainelDoNivel';
import { ListaControlada } from './ListaControlada';
import { PorObra } from './PorObra';
import { ItemControladoSheet, type EdicaoDoItem } from './ItemControladoSheet';
import { RegistrarTreinamentoSheet } from './RegistrarTreinamentoSheet';

/**
 * Módulo Qualidade (SiAC/PBQP-H), fase 1 — casca da tela
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)").
 *
 * Anatomia (guia §19/§20): título → abas → painel do nível (acima da tabela, §6.14) → tabela com as
 * sub-abas Serviços | Materiais acopladas no topo do card.
 *
 * Organização (REGRA #5): lê SÓ `useOrgContext()`. `null` = "Todas" e a tela carrega assim mesmo
 * (a RLS recorta). "Carregar" e "Novo" usam `resolveWriteOrg('all-allowed')`: em "Todas" pergunta, e
 * mantida "Todas" replica em cada organização (`forEachTargetOrg`) — a chave padrão única
 * (`organization_id, chave_padrao`) faz a carga repetida não duplicar. O nível alvo é por organização:
 * o painel grava na organização da própria linha.
 *
 * Fase 2 — organização dona do sistema da qualidade (SGQ, desenho "Organização dona do sistema da
 * qualidade"): com UMA organização no topo, a tela pergunta ao banco qual é o SGQ dela
 * (`sgqDaOrganizacao`). Se for outra (SPE que usa o da construtora), só a faixa e a configuração
 * aparecem — a lista e o painel são os da organização dona, e não há o que editar aqui. Em "Todas"
 * nada disso aparece (o SGQ é por organização). O painel conta pelas inspeções aprovadas
 * (`inspecoesAprovadas` de cada organização do painel, que é o SGQ dos próprios itens).
 */
type Aba = 'lista' | 'por-obra';

const ABAS: { id: Aba; label: string }[] = [
    { id: 'lista', label: 'Lista controlada' },
    { id: 'por-obra', label: 'Por obra' },
];

const SUB_ABAS: { id: TipoItemControlado; label: string }[] = [
    { id: 'SERVICO', label: 'Serviços' },
    { id: 'MATERIAL', label: 'Materiais' },
];

/** §19.1/§20: o título muda com a aba. */
const CABECALHO: Record<Aba, { titulo: string; subtitulo: string }> = {
    lista: {
        titulo: 'Qualidade',
        subtitulo: 'Serviços e materiais controlados do SiAC: procedimento escrito, treinamento e quanto falta para o nível alvo.',
    },
    'por-obra': {
        titulo: 'Qualidade por obra',
        subtitulo: 'O que se aplica em cada obra: todos os itens ativos aplicam, salvo a exceção registrada com motivo.',
    },
};

/** Item aberto no Sheet, ou item novo já com o alvo resolvido (o tipo mora no Sheet). */
export type { EdicaoDoItem };

interface Props {
    /**
     * Grupo DESENVOLVEDOR ou e-mail de acesso total — a única parte da permissão que não depende da
     * organização, resolvida no `AppRouter`. O resto é decidido AQUI, pela organização do `useOrgContext()`.
     */
    acessoTotal: boolean;
}

const QualidadeModule: React.FC<Props> = ({ acessoTotal }) => {
    const { orgId, isAllOrgs } = useOrgContext();
    const confirm = useConfirm();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const { showToast, localToast } = useToast();
    const organizations = useStore(s => s.organizations);
    const email = useStore(s => s.session?.user?.email ?? null);

    /**
     * Quem edita (REGRA #5 item 5): pela MESMA organização que a tela mostra. Com empresa no topo o
     * `activeOrganizationId` cru é null, mas `orgId` já é a organização dona dela — decidir pelo cru
     * caía em "Todas" e deixava só leitura quem é visitante em outra organização.
     */
    const podeEditar = React.useMemo(() => podeEditarQualidadeSiacNoContexto({
        orgId, isAllOrgs, vinculos: vinculosDoUsuario(organizations, email), acessoTotal,
    }), [orgId, isAllOrgs, organizations, email, acessoTotal]);

    const [aba, setAba] = usePersistedState<Aba>('qualidade:aba', 'lista');
    const abaEfetiva: Aba = ABAS.some(a => a.id === aba) ? aba : 'lista';
    const [tipo, setTipo] = usePersistedState<TipoItemControlado>('qualidade:lista:tipo', 'SERVICO');
    const tipoEfetivo: TipoItemControlado = SUB_ABAS.some(t => t.id === tipo) ? tipo : 'SERVICO';

    const [itens, setItens] = React.useState<ItemControlado[]>([]);
    const [niveisGravados, setNiveisGravados] = React.useState<Record<string, NivelSiac>>({});
    const [procedimentos, setProcedimentos] = React.useState<Record<string, ProcedimentoResumo>>({});
    const [treinamentos, setTreinamentos] = React.useState<Record<string, RegistroTreinamento[]>>({});
    const [inspecoes, setInspecoes] = React.useState<InspecaoAprovada[]>([]);
    const [erroInspecoes, setErroInspecoes] = React.useState<string | null>(null);
    /** SGQ da organização do topo, com a organização a que se refere (`null` em "Todas"): troca de topo não usa o da anterior. */
    const [sgqDoTopo, setSgqDoTopo] = React.useState<{ org: string; sgq: string } | null>(null);
    const [gravandoSgq, setGravandoSgq] = React.useState(false);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [edicao, setEdicao] = React.useState<EdicaoDoItem | null>(null);
    /** Item pedido pelo "Registrar treinamento em obra" do Sheet do item: abre o registro por cima dele. */
    const [treinoEmObra, setTreinoEmObra] = React.useState<ItemControlado | null>(null);

    // ── Carga (sem `if (!orgId) return`: em "Todas" a tela carrega tudo o que a RLS deixa) ──
    const seq = React.useRef(0);
    const carregar = React.useCallback(async () => {
        const minha = ++seq.current;
        setCarregando(true);
        setErro(null);
        try {
            const [lista, niveis, sgqLido] = await Promise.all([
                qualidadeSiacService.listarItens(orgId),
                qualidadeSiacService.listarNiveis(orgId),
                orgId ? qualidadeSiacService.sgqDaOrganizacao(orgId) : Promise.resolve(null),
            ]);
            const docs = [...new Set(lista.map(i => i.procedure_document_id).filter((x): x is string => !!x))];
            const cursos = [...new Set(lista.map(i => i.training_course_id).filter((x): x is string => !!x))];
            // Cada organização do painel é o SGQ dos próprios itens: as inspeções contam as OEs dela e das
            // SPEs que apontam para ela. Falha aqui não derruba a lista: o painel diz que não contou.
            const orgsDoPainel = [...new Set([...(orgId ? [orgId] : []), ...lista.map(i => i.organization_id)])];
            const [procs, treinos, insp] = await Promise.all([
                qualidadeSiacService.resumirProcedimentos(docs),
                qualidadeSiacService.listarTreinamentos(cursos),
                Promise.all(orgsDoPainel.map(o => qualidadeSiacService.inspecoesAprovadas(o)))
                    .then(l => ({ lista: l.flat(), erro: null as string | null }))
                    .catch((e: unknown) => ({ lista: [] as InspecaoAprovada[], erro: errorMessage(e, 'erro desconhecido') })),
            ]);
            if (minha !== seq.current) return;
            setItens(lista); setNiveisGravados(niveis); setProcedimentos(procs); setTreinamentos(treinos);
            setInspecoes(insp.lista); setErroInspecoes(insp.erro); setSgqDoTopo(orgId && sgqLido ? { org: orgId, sgq: sgqLido } : null);
        } catch (e) {
            if (minha !== seq.current) return;
            setItens([]); setNiveisGravados({}); setProcedimentos({}); setTreinamentos({});
            setInspecoes([]); setErroInspecoes(null); setSgqDoTopo(null);
            setErro(errorMessage(e, 'erro desconhecido'));
        } finally {
            if (minha === seq.current) setCarregando(false);
        }
    }, [orgId]);
    React.useEffect(() => { void carregar(); }, [carregar]);
    /**
     * A recarga DEPOIS de uma gravação usa o `carregar` de agora, não o do render do clique: se o topo
     * trocou de organização enquanto a gravação andava, recarregar a organização velha descartaria a
     * resposta da nova (o `seq` é dela) e mostraria a lista de outra organização (REGRA #5).
     */
    const carregarRef = React.useRef(carregar);
    carregarRef.current = carregar;

    /** Org sem linha em `quality_settings` = B. Com uma organização no topo, ela sempre tem linha no painel. */
    const niveis = React.useMemo<Record<string, NivelSiac>>(() => {
        const mapa: Record<string, NivelSiac> = { ...niveisGravados };
        if (orgId && !mapa[orgId]) mapa[orgId] = 'B';
        for (const i of itens) if (!mapa[i.organization_id]) mapa[i.organization_id] = 'B';
        return mapa;
    }, [niveisGravados, itens, orgId]);

    const nomesDasOrgs = React.useMemo(
        () => Object.fromEntries(organizations.map(o => [o.id, o.name])) as Record<string, string>,
        [organizations],
    );

    /** "x de y" da inspeção aprovada mais recente de cada serviço (qualquer procedimento: é a linha). */
    const executoresPorItem = React.useMemo(
        () => (erroInspecoes ? {} : contarAplicados(inspecoes, itens).porItem),
        [inspecoes, itens, erroInspecoes],
    );

    /** Topo numa organização cujo SGQ é outra: lista e painel são os de lá. */
    const sgq = sgqDoTopo && sgqDoTopo.org === orgId ? sgqDoTopo.sgq : null;
    const usaOutroSgq = !!orgId && !isAllOrgs && sgq !== null && sgq !== orgId;

    // ── Gravações (recarregam a lista: o painel conta pelo que está no banco) ──
    const carregarLista = async () => {
        const alvo = await resolveWriteOrg('all-allowed');
        if (!alvo) return;
        const servico = tipoEfetivo === 'SERVICO';
        // O serviço devolve quantos itens ENTRARAM (o que já existia não é sobrescrito): soma por organização.
        let incluidos = 0;
        const { ok, failed } = await forEachTargetOrg(alvo, async (org: string) => {
            const n = servico ? await qualidadeSiacService.carregarAnexo4(org) : await qualidadeSiacService.carregarSugestaoMateriais(org);
            incluidos += n;
        });
        if (ok === 0) {
            showToast(`Não foi possível carregar: ${errorMessage(failed[0]?.error, 'erro desconhecido')}`, 'error');
        } else {
            const nota = partialFailureNote(failed);
            const onde = ok > 1 ? ` em ${ok} organizações` : '';
            const oque = incluidos === 0
                ? 'Nada novo: a lista já estava carregada'
                : servico
                    ? `${incluidos} ${incluidos === 1 ? 'serviço incluído' : 'serviços incluídos'}${onde}`
                    : `${incluidos} ${incluidos === 1 ? 'material incluído' : 'materiais incluídos'}${onde}`;
            showToast(`${oque}${nota ? ` (${nota})` : ''}.`, 'success');
        }
        await carregarRef.current();
    };

    const novoItem = async () => {
        const alvo = await resolveWriteOrg('all-allowed');
        if (!alvo) return;
        setEdicao({ modo: 'novo', tipo: tipoEfetivo, alvo });
    };

    const definirNivel = async (org: string, nivel: NivelSiac) => {
        try {
            await qualidadeSiacService.definirNivel(org, nivel);
            showToast(`Nível alvo de ${nomesDasOrgs[org] ?? 'organização'}: ${nivel}.`, 'success');
        } catch (e) {
            showToast(`Não foi possível gravar o nível: ${errorMessage(e, 'erro desconhecido')}`, 'error');
        }
        await carregarRef.current();
    };

    /**
     * Aponta (ou desfaz) a organização dona do SGQ da organização do topo. Apontar para outra pede
     * confirmação (a lista daqui deixa de aparecer); voltar ao próprio, não. O banco decide quem pode
     * (dono/admin das duas, 42501) e recusa destino que já usa o de outra (22023): o erro vai no aviso.
     */
    const definirSgq = async (org: string, destino: string | null) => {
        const nome = destino ? nomesDasOrgs[destino] ?? 'outra organização' : null;
        if (destino && !(await confirm({
            title: `Usar o sistema da qualidade de ${nome}?`,
            message: `A lista controlada desta organização deixa de aparecer aqui. As OEs das obras desta organização passam a escolher o serviço controlado na lista de ${nome}, com a ficha, o procedimento e os treinados de lá, e contam no painel de lá.`,
            variant: 'warning', confirmLabel: `Usar o de ${nome}`, cancelLabel: 'Cancelar',
        }))) return;
        setGravandoSgq(true);
        try {
            await qualidadeSiacService.definirSgq(org, destino);
            showToast(destino
                ? `Esta organização passou a usar o sistema da qualidade de ${nome}.`
                : 'Esta organização voltou a usar o próprio sistema da qualidade.', 'success');
        } catch (e) {
            showToast(`Não foi possível gravar o sistema da qualidade: ${errorMessage(e, 'erro desconhecido')}`, 'error');
        } finally {
            setGravandoSgq(false);
        }
        await carregarRef.current();
    };

    /** O registro em obra já gravou (numa transação só): avisa quantos entraram e recarrega a organização de AGORA. */
    const registrosGravados = (n: number) => {
        showToast(`${n} ${n === 1 ? 'registro de treinamento gravado' : 'registros de treinamento gravados'}.`, 'success');
        void carregarRef.current();
    };

    /**
     * O Sheet mostra o item como veio da ÚLTIMA recarga que o trouxe (procedimento, curso e códigos gravam
     * na hora e a recarga traz o estado novo). Recarga sem o item (outra organização no topo, erro de carga)
     * não o faz voltar ao de quando foi aberto: fica o último recarregado, e as gravações continuam na
     * organização DELE.
     */
    React.useEffect(() => {
        setEdicao(e => {
            if (e?.modo !== 'editar') return e;
            const fresco = itens.find(i => i.id === e.item.id);
            return fresco && fresco !== e.item ? { modo: 'editar', item: fresco } : e;
        });
    }, [itens]);
    const edicaoAtual = edicao;
    const itemAberto = edicaoAtual?.modo === 'editar' ? edicaoAtual.item : null;

    const cab = CABECALHO[abaEfetiva];

    return (
        <div className="space-y-6 pb-20">
            {/* §20 — título solto, muda com a aba */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{cab.titulo}</h1>
                <p className="text-gray-500 text-sm mt-1.5 font-medium">{cab.subtitulo}</p>
                {!podeEditar && (
                    <p className="flex items-center gap-1.5 text-sm text-gray-700 mt-2">
                        <Lock className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" /> {MOTIVO_SEM_EDICAO_QUALIDADE}
                    </p>
                )}
            </div>

            <TabsBar<Aba> tabs={ABAS} value={abaEfetiva} onChange={setAba} />

            {/* §5.2 — erro de carga fica FORA do card acoplado */}
            {erro && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                    <span>Não foi possível carregar a lista controlada: {erro}</span>
                    <button type="button" onClick={() => void carregar()} className="font-medium text-red-700 underline">Tentar de novo</button>
                </div>
            )}

            {/* Com erro de carga, só a faixa: a lista vazia ofereceria carregar o que talvez já exista. */}
            {abaEfetiva === 'lista' && !erro && (
                <div>
                    {/* SGQ: só com UMA organização no topo (em "Todas" nada de novo) e já carregado. */}
                    {!carregando && orgId && !isAllOrgs && (usaOutroSgq || podeEditar) && (
                        <SistemaDaQualidade orgId={orgId} sgq={sgq ?? orgId} organizations={organizations} nomesDasOrgs={nomesDasOrgs}
                            podeEditar={podeEditar} gravando={gravandoSgq} onDefinir={destino => void definirSgq(orgId, destino)} />
                    )}
                    {/* SGQ de outra organização: nada a editar aqui (a lista e o painel são os de lá). */}
                    {!usaOutroSgq && (
                        <>
                            {!carregando && (
                                <PainelDoNivel itens={itens} niveis={niveis} procedimentos={procedimentos} nomesDasOrgs={nomesDasOrgs}
                                    inspecoes={inspecoes} erroInspecoes={erroInspecoes}
                                    podeEditar={podeEditar} onNivel={(org, n) => void definirNivel(org, n)} />
                            )}
                            {/* `key` por sub-aba: "Mostrar arquivados" de Serviços não vaza para Materiais. */}
                            <ListaControlada key={tipoEfetivo} tipo={tipoEfetivo} itens={itens} procedimentos={procedimentos} treinamentos={treinamentos}
                                podeEditar={podeEditar} carregando={carregando} nomesDasOrgs={nomesDasOrgs}
                                executoresPorItem={executoresPorItem}
                                onCarregar={() => void carregarLista()} onNovo={() => void novoItem()}
                                onAbrir={item => setEdicao({ modo: 'editar', item })}
                                abas={<TabsBar<TipoItemControlado> tabs={SUB_ABAS} value={tipoEfetivo} onChange={setTipo} bare />} />
                        </>
                    )}
                </div>
            )}

            {/* Por obra: itens ativos da organização de cada obra, com a exceção "não se aplica" e o motivo.
                Só aparece com a lista carregada: sem ela a tabela mostraria "nenhum item ativo" por engano. */}
            {abaEfetiva === 'por-obra' && !erro && !carregando && <PorObra itens={itens} podeEditar={podeEditar} />}

            <ItemControladoSheet edicao={edicaoAtual}
                itensDaOrg={itemAberto ? itens.filter(i => i.organization_id === itemAberto.organization_id) : []}
                procedimento={itemAberto?.procedure_document_id ? procedimentos[itemAberto.procedure_document_id] ?? null : null}
                treinamentos={itemAberto?.training_course_id ? treinamentos[itemAberto.training_course_id] ?? [] : []}
                podeEditar={podeEditar}
                onClose={() => setEdicao(null)}
                onSaved={() => carregarRef.current()}
                onRegistrarTreinamento={i => setTreinoEmObra(i)} />

            {/* Por cima do Sheet do item. Gravar avisa e recarrega: os Treinados do item vêm da recarga. */}
            {treinoEmObra && (
                <RegistrarTreinamentoSheet open item={treinoEmObra}
                    onClose={() => setTreinoEmObra(null)}
                    onSaved={registrosGravados} />
            )}

            {orgTargetModal}

            {/* §13 — com o ToastProvider na raiz, `localToast` vem null e o aviso sai pelo provider;
                sem provider (teste, render isolado), ele aparece aqui. Nunca fica mudo. */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

/**
 * "Sistema da qualidade desta organização" — acima do painel (guia §6.14). Mostra a faixa quando o SGQ é
 * outra organização (para todos) e o seletor para quem edita (também para desfazer). Escolher grava
 * na hora (como o nível alvo); as opções são as outras organizações do usuário.
 */
const SistemaDaQualidade: React.FC<{
    orgId: string;
    sgq: string;
    organizations: Array<{ id: string; name: string }>;
    nomesDasOrgs: Record<string, string>;
    podeEditar: boolean;
    gravando: boolean;
    onDefinir(destino: string | null): void;
}> = ({ orgId, sgq, organizations, nomesDasOrgs, podeEditar, gravando, onDefinir }) => {
    const usaOutro = sgq !== orgId;
    const outras = organizations.filter(o => o.id !== orgId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const valor = usaOutro ? sgq : '';
    const motivo = gravando ? 'Aguarde: a gravação anterior ainda não terminou.' : undefined;
    return (
        <section aria-label="Sistema da qualidade" className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 mb-3 space-y-3">
            {usaOutro && (
                <div className="flex items-start gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-[8px] px-3 py-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                        <p className="font-medium">Esta organização usa o sistema da qualidade de {nomesDasOrgs[sgq] ?? 'outra organização'}.</p>
                        <p>A lista controlada, a ficha, o procedimento e os treinados são os de lá; as OEs das obras daqui contam no painel de lá.</p>
                    </div>
                </div>
            )}
            {podeEditar && (
                <div className="flex flex-col md:flex-row md:items-end gap-3">
                    <div className="space-y-1.5">
                        <label htmlFor="qualidade-sgq" className="block text-xs font-semibold text-slate-500">Sistema da qualidade desta organização</label>
                        <span className="inline-flex" title={motivo}>
                            <select id="qualidade-sgq" value={valor} disabled={gravando}
                                onChange={e => onDefinir(e.target.value || null)}
                                className="w-72 max-w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed transition-all">
                                <option value="">Usa o próprio sistema da qualidade</option>
                                {usaOutro && !outras.some(o => o.id === sgq) && <option value={sgq}>Organização fora da lista</option>}
                                {outras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </span>
                    </div>
                    <p className="text-xs text-gray-600 md:pb-2.5">
                        Para uma SPE: escolha a organização cujo sistema da qualidade vale para ela. Só o dono ou um administrador das duas organizações pode mudar.
                    </p>
                </div>
            )}
        </section>
    );
};

export default QualidadeModule;
