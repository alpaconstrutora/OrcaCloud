import React from 'react';
import { Lock } from 'lucide-react';
import type {
    ItemControlado, NivelSiac, ProcedimentoResumo, RegistroTreinamento, TipoItemControlado,
} from '../../types/qualidadeSiac';
import { qualidadeSiacService } from '../../services/qualidadeSiacService';
import {
    errorMessage, forEachTargetOrg, partialFailureNote, useOrgContext, useOrgWriteTarget, type WriteTarget,
} from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { usePersistedState } from '../ui/TableUtils';
import { TabsBar } from '../ui/TabsBar';
import { MOTIVO_SEM_EDICAO_QUALIDADE } from '../../utils/permissaoQualidadeSiac';
import { PainelDoNivel } from './PainelDoNivel';
import { ListaControlada } from './ListaControlada';

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

/** O que Task 6 (Sheet do item) consome: item aberto, ou item novo já com o alvo resolvido. */
export type EdicaoDoItem =
    | { modo: 'editar'; item: ItemControlado }
    | { modo: 'novo'; tipo: TipoItemControlado; alvo: WriteTarget };

interface Props {
    /** `podeEditarQualidadeSiac` resolvido no `AppRouter`. Falso = só leitura, com o motivo visível. */
    podeEditar: boolean;
}

const QualidadeModule: React.FC<Props> = ({ podeEditar }) => {
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const { showToast, localToast } = useToast();
    const organizations = useStore(s => s.organizations);

    const [aba, setAba] = usePersistedState<Aba>('qualidade:aba', 'lista');
    const abaEfetiva: Aba = ABAS.some(a => a.id === aba) ? aba : 'lista';
    const [tipo, setTipo] = usePersistedState<TipoItemControlado>('qualidade:lista:tipo', 'SERVICO');
    const tipoEfetivo: TipoItemControlado = SUB_ABAS.some(t => t.id === tipo) ? tipo : 'SERVICO';

    const [itens, setItens] = React.useState<ItemControlado[]>([]);
    const [niveisGravados, setNiveisGravados] = React.useState<Record<string, NivelSiac>>({});
    const [procedimentos, setProcedimentos] = React.useState<Record<string, ProcedimentoResumo>>({});
    const [treinamentos, setTreinamentos] = React.useState<Record<string, RegistroTreinamento[]>>({});
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [, setEdicao] = React.useState<EdicaoDoItem | null>(null);

    // ── Carga (sem `if (!orgId) return`: em "Todas" a tela carrega tudo o que a RLS deixa) ──
    const seq = React.useRef(0);
    const carregar = React.useCallback(async () => {
        const minha = ++seq.current;
        setCarregando(true);
        setErro(null);
        try {
            const [lista, niveis] = await Promise.all([
                qualidadeSiacService.listarItens(orgId),
                qualidadeSiacService.listarNiveis(orgId),
            ]);
            const docs = [...new Set(lista.map(i => i.procedure_document_id).filter((x): x is string => !!x))];
            const cursos = [...new Set(lista.map(i => i.training_course_id).filter((x): x is string => !!x))];
            const [procs, treinos] = await Promise.all([
                qualidadeSiacService.resumirProcedimentos(docs),
                qualidadeSiacService.listarTreinamentos(cursos),
            ]);
            if (minha !== seq.current) return;
            setItens(lista); setNiveisGravados(niveis); setProcedimentos(procs); setTreinamentos(treinos);
        } catch (e) {
            if (minha !== seq.current) return;
            setItens([]); setNiveisGravados({}); setProcedimentos({}); setTreinamentos({});
            setErro(errorMessage(e, 'erro desconhecido'));
        } finally {
            if (minha === seq.current) setCarregando(false);
        }
    }, [orgId]);
    React.useEffect(() => { void carregar(); }, [carregar]);

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

    // ── Gravações (recarregam a lista: o painel conta pelo que está no banco) ──
    const carregarLista = async () => {
        const alvo = await resolveWriteOrg('all-allowed');
        if (!alvo) return;
        const carga = tipoEfetivo === 'SERVICO'
            ? (org: string) => qualidadeSiacService.carregarAnexo4(org)
            : (org: string) => qualidadeSiacService.carregarSugestaoMateriais(org);
        const { ok, failed } = await forEachTargetOrg(alvo, carga);
        const oque = tipoEfetivo === 'SERVICO' ? 'Lista mínima do Anexo 4 carregada' : 'Sugestão de materiais carregada';
        if (ok === 0) {
            showToast(`Não foi possível carregar: ${errorMessage(failed[0]?.error, 'erro desconhecido')}`, 'error');
        } else {
            const nota = partialFailureNote(failed);
            const onde = ok > 1 ? ` em ${ok} organizações` : '';
            showToast(`${oque}${onde}${nota ? ` (${nota})` : ''}.`, 'success');
        }
        await carregar();
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
        await carregar();
    };

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

            {abaEfetiva === 'lista' && (
                <div>
                    {!carregando && !erro && (
                        <PainelDoNivel itens={itens} niveis={niveis} procedimentos={procedimentos} nomesDasOrgs={nomesDasOrgs}
                            podeEditar={podeEditar} onNivel={(org, n) => void definirNivel(org, n)} />
                    )}
                    <ListaControlada tipo={tipoEfetivo} itens={itens} procedimentos={procedimentos} treinamentos={treinamentos}
                        podeEditar={podeEditar} carregando={carregando} nomesDasOrgs={nomesDasOrgs}
                        onCarregar={() => void carregarLista()} onNovo={() => void novoItem()}
                        onAbrir={item => setEdicao({ modo: 'editar', item })}
                        abas={<TabsBar<TipoItemControlado> tabs={SUB_ABAS} value={tipoEfetivo} onChange={setTipo} bare />} />
                </div>
            )}

            {/* Por obra: a visão por obra entra na Task 8 do plano de implementação (PorObra). */}
            {abaEfetiva === 'por-obra' && <section aria-label="Qualidade por obra" />}

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

export default QualidadeModule;
