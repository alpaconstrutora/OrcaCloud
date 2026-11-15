import React from 'react';
import { CheckCircle2, ClipboardList, Flame, HardHat, ListChecks, Sparkles, XCircle } from 'lucide-react';
import type { ProjectRisk, RiskCatalogItem, RiskTipologia } from '../../types/risk';
import { RISK_ROTULO, RISK_TIPOLOGIAS } from '../../types/risk';
import { fichaDoCatalogo, riskService } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { ROTULO_CONDICAO, sugerirDoCatalogo, tipologiaDaObra, type SugestaoDoCatalogo } from '../../utils/riskFase2';
import { hojeLocalISO } from '../../utils/riskPainel';
import { useConfirm } from '../ui/confirm';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import {
    BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ErroDoCampo, ROTULO, diasAPartirDeHoje, useEuNaOrg, useMembrosComConta, useObrasDaOrg,
} from './riscosUi';

/**
 * Assistente "Sugerir riscos" (F2.4 de docs/planos/2026-11-13-modulo-riscos.md).
 *
 * (a) obra da organização já resolvida pelo módulo (topo; em "Todas", `resolveWriteOrg('single')`,
 * como na criação — REGRA #5); (b) tipologia pré-preenchida pelo perfil salvo da obra ou por
 * `tipologiaDaObra`, editável; (c) condições (`ROTULO_CONDICAO`); (d) os itens do catálogo da
 * tipologia, ordenados pelas condições que citam (`sugerirDoCatalogo`), sem os já usados na obra;
 * (e) dono e próxima revisão comuns. "Criar N riscos" cria um risco por item (CA02: cada um copia
 * os textos do catálogo) e guarda o perfil da obra para a próxima vez.
 *
 * Painel lateral aberto pelo módulo (não dentro da ficha): sem drawer aninhado. A busca na lista
 * de sugestões é transitória (§3.1 — filtra o assistente, não a tela).
 */
interface Props {
    orgId: string;
    /** Riscos já carregados no módulo — de onde sai "já usado na obra" (não duplica item do catálogo). */
    riscos: ProjectRisk[];
    onClose: () => void;
    onCriados: (criados: ProjectRisk[]) => void;
}

const COLUNAS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 90 },
    { key: 'evento', label: 'Evento', sortable: true, width: 300 },
    { key: 'motivo', label: 'Por que', sortable: true, width: 200 },
];

const rotulosDasCondicoes = (cs: string[]) => cs.map(c => ROTULO_CONDICAO[c] ?? c).join(', ');

export const RiscosSugerirSheet: React.FC<Props> = ({ orgId, riscos, onClose, onCriados }) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const organizations = useStore(s => s.organizations);
    const projects = useStore(s => s.projects);
    const obras = useObrasDaOrg(orgId);
    const membros = useMembrosComConta(orgId);
    const eu = useEuNaOrg(orgId);

    const [obraId, setObraId] = React.useState('');
    const [tipologia, setTipologia] = React.useState<RiskTipologia | ''>('');
    const [origemTipologia, setOrigemTipologia] = React.useState<'perfil' | 'obra' | null>(null);
    const [condicoes, setCondicoes] = React.useState<string[]>([]);
    const [carregandoPerfil, setCarregandoPerfil] = React.useState(false);

    const [catalogo, setCatalogo] = React.useState<RiskCatalogItem[]>([]);
    const [carregandoCatalogo, setCarregandoCatalogo] = React.useState(true);
    const [erroCatalogo, setErroCatalogo] = React.useState<string | null>(null);

    const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
    // §3.1: busca dentro do assistente — transitória, zera ao fechar.
    const [busca, setBusca] = React.useState('');
    const [dono, setDono] = React.useState('');
    const [proxima, setProxima] = React.useState(() => diasAPartirDeHoje(30));
    const [erros, setErros] = React.useState<{ obra?: string; dono?: string; proxima?: string; itens?: string }>({});
    const [criando, setCriando] = React.useState(false);
    const [resultado, setResultado] = React.useState<{ criados: ProjectRisk[]; falhas: { titulo: string; erro: string }[]; perfilFalhou: string | null } | null>(null);

    React.useEffect(() => { if (!dono && eu) setDono(eu.userId); }, [eu, dono]);

    const carregarCatalogo = React.useCallback(async () => {
        setCarregandoCatalogo(true);
        setErroCatalogo(null);
        try {
            // Itens do sistema + os próprios DESTA organização (a obra é dela).
            setCatalogo(await riskService.listarCatalogo(orgId));
        } catch (e) {
            setErroCatalogo(errorMessage(e, 'erro desconhecido'));
        } finally {
            setCarregandoCatalogo(false);
        }
    }, [orgId]);
    React.useEffect(() => { void carregarCatalogo(); }, [carregarCatalogo]);

    // (b) Ao escolher a obra: perfil salvo primeiro; sem perfil, a tipologia da própria obra.
    const seqPerfil = React.useRef(0);
    const escolherObra = (id: string) => {
        setObraId(id);
        setSelecionados(new Set());
        setErros(p => ({ ...p, obra: undefined, itens: undefined }));
        const minha = ++seqPerfil.current;
        const obra = projects.find(p => p.id === id);
        const daObra = obra ? tipologiaDaObra((obra as { tipo_obra?: string | null }).tipo_obra ?? obra.settings?.tipoObra, obra.settings?.modalidade) : null;
        setTipologia(daObra ?? '');
        setOrigemTipologia(daObra ? 'obra' : null);
        setCondicoes([]);
        if (!id) return;
        setCarregandoPerfil(true);
        riskService.obterPerfilObra(id)
            .then(perfil => {
                if (minha !== seqPerfil.current || !perfil) return;
                if (perfil.tipologia) { setTipologia(perfil.tipologia); setOrigemTipologia('perfil'); }
                setCondicoes(perfil.condicoes ?? []);
            })
            .catch(() => undefined)   // sem perfil (ou tabela indisponível): fica a tipologia da obra
            .finally(() => { if (minha === seqPerfil.current) setCarregandoPerfil(false); });
    };

    const jaUsadosNaObra = React.useMemo(
        () => new Set(riscos.filter(r => r.project_id === obraId && r.catalog_id).map(r => r.catalog_id as string)),
        [riscos, obraId],
    );
    const sugestoes = React.useMemo<SugestaoDoCatalogo[]>(
        () => (obraId ? sugerirDoCatalogo(catalogo, tipologia || null, condicoes, jaUsadosNaObra) : []),
        [catalogo, tipologia, condicoes, jaUsadosNaObra, obraId],
    );
    const porId = React.useMemo(() => new Map(sugestoes.map(s => [s.item.id, s])), [sugestoes]);
    // Seleção só vale para o que ainda está na lista (trocar tipologia pode tirar item).
    const escolhidos = React.useMemo(() => sugestoes.filter(s => selecionados.has(s.item.id)), [sugestoes, selecionados]);
    const queCitam = React.useMemo(() => sugestoes.filter(s => s.condicoesQueBatem.length > 0), [sugestoes]);

    const alternarCondicao = (c: string, marcada: boolean) => setCondicoes(prev => (marcada ? [...prev, c] : prev.filter(x => x !== c)));

    const criar = async () => {
        const e: typeof erros = {};
        if (!obraId) e.obra = 'Escolha a obra.';
        if (!dono) e.dono = 'Escolha o dono dos riscos.';
        if (!proxima) e.proxima = 'Informe a data da próxima revisão.';
        if (!escolhidos.length) e.itens = 'Marque pelo menos um risco da lista.';
        setErros(e);
        const primeiro = (['obra', 'itens', 'dono', 'proxima'] as const).find(k => e[k]);
        if (primeiro) { document.getElementById(`rs-${primeiro}`)?.focus(); return; }
        const membro = membros.find(m => m.userId === dono);
        setCriando(true);
        try {
            const hoje = hojeLocalISO();
            const fichas = escolhidos.map(s => fichaDoCatalogo(s.item, {
                escopo: 'obra', project_id: obraId, owner_user_id: dono, owner_nome: membro?.name ?? null,
                proxima_revisao: proxima, data_identificacao: hoje,
            }));
            const r = await riskService.criarEmLote(orgId, fichas);
            let perfilFalhou: string | null = null;
            try {
                await riskService.salvarPerfilObra({ project_id: obraId, organization_id: orgId, tipologia: tipologia || null, condicoes });
            } catch (err) {
                perfilFalhou = errorMessage(err, 'erro desconhecido');
            }
            if (r.criados.length) onCriados(r.criados);
            setSelecionados(new Set());
            setResultado({ ...r, perfilFalhou });
            if (r.criados.length && !r.falhas.length) showToast(`${r.criados.length} risco${r.criados.length === 1 ? '' : 's'} criado${r.criados.length === 1 ? '' : 's'}. Abra cada um para registrar a avaliação inerente.`);
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível criar os riscos.'), 'error');
        } finally {
            setCriando(false);
        }
    };

    const orgNome = organizations.find(o => o.id === orgId)?.name;
    const n = escolhidos.length;
    const motivoCriar = !obraId ? 'Escolha a obra primeiro.' : !n ? 'Marque pelo menos um risco da lista.' : null;
    const dirty = !resultado && n > 0;
    // O X do cabeçalho e o "Cancelar" não passam pelo `requestClose` do Sheet (§25): guarda própria.
    const fechar = async () => {
        if (dirty && !(await confirm({
            title: 'Sair sem criar?',
            message: `${n} risco${n === 1 ? ' marcado não será criado' : 's marcados não serão criados'}.`,
            variant: 'warning', confirmLabel: 'Sair sem criar', cancelLabel: 'Continuar aqui',
        }))) return;
        onClose();
    };

    return (
        <Sheet open onClose={onClose} size="2xl" dirty={dirty}>
            <SheetHeader onClose={() => void fechar()}>
                <SheetTitle>Sugerir riscos para uma obra</SheetTitle>
                <SheetDescription>
                    Os riscos do catálogo que valem para a tipologia e as condições da obra{orgNome ? ` · ${orgNome}` : ''}.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-5">
                {resultado ? (
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <SecaoTitulo icon={ListChecks} titulo="Resultado" />
                        {resultado.criados.length > 0 && (
                            <div className="space-y-1.5">
                                <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                                    {resultado.criados.length} risco{resultado.criados.length === 1 ? ' criado' : 's criados'} na obra.
                                </p>
                                <ul className="text-sm text-gray-700 space-y-0.5 pl-6 list-disc">
                                    {resultado.criados.map(c => <li key={c.id}>{c.codigo} · {c.titulo}</li>)}
                                </ul>
                                <p className="text-sm text-gray-600">Eles já estão no Registro. Abra cada um para registrar a avaliação inerente.</p>
                            </div>
                        )}
                        {resultado.falhas.length > 0 && (
                            <div className="space-y-1.5">
                                <p className="flex items-center gap-1.5 text-sm text-red-700">
                                    <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                                    {resultado.falhas.length} não {resultado.falhas.length === 1 ? 'foi criado' : 'foram criados'}:
                                </p>
                                <ul className="text-sm text-gray-700 space-y-0.5 pl-6 list-disc">
                                    {resultado.falhas.map((f, i) => <li key={i}>{f.titulo} — <span className="text-red-700">{f.erro}</span></li>)}
                                </ul>
                            </div>
                        )}
                        {resultado.perfilFalhou && (
                            <p className="text-sm text-amber-700">O perfil da obra (tipologia e condições) não foi guardado: {resultado.perfilFalhou}. Da próxima vez, marque de novo.</p>
                        )}
                    </div>
                ) : (
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                        {/* (a) + (b) */}
                        <div className="space-y-4">
                            <SecaoTitulo icon={HardHat} titulo="Obra" />
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="rs-obra">Obra</label>
                                    <select id="rs-obra" className={`${CAMPO} ${erros.obra ? COM_ERRO : ''}`} value={obraId} aria-invalid={!!erros.obra}
                                        onChange={e => escolherObra(e.target.value)}>
                                        <option value="">Escolha a obra…</option>
                                        {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                    <ErroDoCampo id="rs-obra-erro" erro={erros.obra} />
                                    {obras.length === 0 && <p className="text-xs text-gray-600">Esta organização não tem obra cadastrada.</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="rs-tipologia">Tipologia</label>
                                    <select id="rs-tipologia" className={CAMPO} value={tipologia} disabled={!obraId}
                                        title={!obraId ? 'Escolha a obra primeiro.' : undefined}
                                        onChange={e => { setTipologia(e.target.value as RiskTipologia | ''); setOrigemTipologia(null); }}>
                                        <option value="">Todas as tipologias</option>
                                        {RISK_TIPOLOGIAS.map(t => <option key={t} value={t}>{RISK_ROTULO.tipologia[t]}</option>)}
                                    </select>
                                    <p className="text-xs text-gray-600">
                                        {!obraId ? 'Escolha a obra primeiro.'
                                            : carregandoPerfil ? 'Procurando o perfil salvo desta obra…'
                                            : origemTipologia === 'perfil' ? 'Veio do perfil salvo da última sugestão nesta obra.'
                                            : origemTipologia === 'obra' ? 'Veio do tipo da obra (cadastro da obra).'
                                            : 'Sem tipologia, a lista traz o catálogo inteiro.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* (c) */}
                        <div className="space-y-4">
                            <SecaoTitulo icon={ClipboardList} titulo="Condições da obra" resumo="o que a obra tem — os riscos que citam a condição sobem na lista" />
                            <fieldset disabled={!obraId} className="min-w-0">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                                    {Object.entries(ROTULO_CONDICAO).map(([c, rotulo]) => (
                                        <label key={c} className={`inline-flex items-center gap-2 text-sm text-gray-800 ${obraId ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                                checked={condicoes.includes(c)} onChange={e => alternarCondicao(c, e.target.checked)} />
                                            {rotulo}
                                        </label>
                                    ))}
                                </div>
                                {!obraId && <p className="text-xs text-gray-600 mt-2">Escolha a obra primeiro.</p>}
                            </fieldset>
                        </div>

                        {/* (d) */}
                        <div className="space-y-4">
                            <SecaoTitulo icon={Sparkles} titulo="Riscos sugeridos"
                                resumo={obraId ? `${sugestoes.length} do catálogo${jaUsadosNaObra.size ? ` · ${jaUsadosNaObra.size} já usado${jaUsadosNaObra.size === 1 ? '' : 's'} na obra ficaram de fora` : ''}` : undefined} />
                            {erroCatalogo ? (
                                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                                    <span>Não foi possível carregar o catálogo: {erroCatalogo}</span>
                                    <button type="button" onClick={() => void carregarCatalogo()} className="font-medium text-red-700 underline">Tentar de novo</button>
                                </div>
                            ) : !obraId ? (
                                <p className="text-sm text-gray-600">Escolha a obra para ver as sugestões.</p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="inline-flex" title={queCitam.length ? undefined : 'Nenhum risco da lista cita as condições marcadas.'}>
                                            <button type="button" disabled={!queCitam.length}
                                                onClick={() => setSelecionados(prev => new Set([...prev, ...queCitam.map(s => s.item.id)]))}
                                                className={BOTAO_SECUNDARIO}>
                                                <ListChecks className="w-[15px] h-[15px]" /> Marcar os {queCitam.length} que citam as condições
                                            </button>
                                        </span>
                                        {!queCitam.length && <p className="text-xs text-gray-600">{condicoes.length ? 'Nenhum risco da lista cita as condições marcadas.' : 'Marque condições da obra para os riscos que as citam subirem na lista.'}</p>}
                                        <span className="text-sm text-gray-700 ml-auto">{n} marcado{n === 1 ? '' : 's'}</span>
                                    </div>
                                    <StandardTable<SugestaoDoCatalogo>
                                        storageKey="riscos:sugerir:tabela"
                                        columns={COLUNAS}
                                        rows={sugestoes}
                                        rowKey={s => s.item.id}
                                        loading={carregandoCatalogo}
                                        dense
                                        maxHeight="45vh"
                                        search={busca}
                                        onSearchChange={setBusca}
                                        searchText={s => `${s.item.codigo} ${s.item.evento} ${rotulosDasCondicoes(s.condicoesQueBatem)}`}
                                        searchPlaceholder="Buscar por código ou evento..."
                                        selection={{ selected: selecionados, onChange: next => { setSelecionados(next); setErros(p => ({ ...p, itens: undefined })); } }}
                                        sortValue={(k, s) => (k === 'codigo' ? s.item.codigo : k === 'motivo' ? s.condicoesQueBatem.length : s.item.evento)}
                                        renderCell={(k, s) => {
                                            switch (k) {
                                                case 'codigo': return <span className="whitespace-nowrap text-sm font-normal text-gray-600">{s.item.codigo}</span>;
                                                case 'evento': return (
                                                    <span className="flex items-center gap-1.5 min-w-0">
                                                        {s.item.gatilho_critico && <Flame className="w-3.5 h-3.5 shrink-0 text-red-700" aria-label="Gatilho crítico" />}
                                                        <span className="block truncate text-sm font-normal text-gray-700" title={s.item.evento}>{s.item.evento}</span>
                                                    </span>
                                                );
                                                case 'motivo': {
                                                    const t = s.condicoesQueBatem.length ? `cita: ${rotulosDasCondicoes(s.condicoesQueBatem)}` : s.item.gatilho_critico ? 'gatilho crítico' : '—';
                                                    return <span className={`block truncate text-sm font-normal ${s.condicoesQueBatem.length ? 'text-blue-700' : 'text-gray-600'}`} title={t}>{t}</span>;
                                                }
                                                default: return null;
                                            }
                                        }}
                                        empty={{ icon: <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum risco para sugerir',
                                            subtitle: catalogo.length ? 'Todos os itens desta tipologia já estão na obra, ou a busca não achou nada.' : 'O catálogo está vazio.' }}
                                    />
                                    <span id="rs-itens" tabIndex={-1} className="sr-only">Lista de riscos sugeridos</span>
                                    <ErroDoCampo id="rs-itens-erro" erro={erros.itens} />
                                </>
                            )}
                        </div>

                        {/* (e) */}
                        <div className="space-y-4">
                            <SecaoTitulo icon={CheckCircle2} titulo="Para todos os riscos criados" />
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="rs-dono">Dono dos riscos</label>
                                    <select id="rs-dono" className={`${CAMPO} ${erros.dono ? COM_ERRO : ''}`} value={dono} aria-invalid={!!erros.dono}
                                        onChange={e => { setDono(e.target.value); setErros(p => ({ ...p, dono: undefined })); }}>
                                        <option value="">Escolha…</option>
                                        {membros.map(m => <option key={m.userId} value={m.userId}>{m.name}{eu?.userId === m.userId ? ' (você)' : ''}</option>)}
                                    </select>
                                    <ErroDoCampo id="rs-dono-erro" erro={erros.dono} />
                                    {membros.length === 0 && <p className="text-xs text-gray-600">Nenhum membro desta organização tem conta de acesso — convite sem conta não pode ser dono.</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="rs-proxima">Próxima revisão</label>
                                    <input id="rs-proxima" type="date" className={`${CAMPO} ${erros.proxima ? COM_ERRO : ''}`} value={proxima} aria-invalid={!!erros.proxima}
                                        onChange={e => { setProxima(e.target.value); setErros(p => ({ ...p, proxima: undefined })); }} />
                                    <ErroDoCampo id="rs-proxima-erro" erro={erros.proxima} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </SheetPanel>

            <SheetFooter>
                {resultado ? (
                    <>
                        <button type="button" onClick={() => setResultado(null)} className={BOTAO_SECUNDARIO}>Sugerir mais</button>
                        <button type="button" onClick={onClose} className={BOTAO_PRIMARIO}>Concluir</button>
                    </>
                ) : (
                    <>
                        {motivoCriar && <p className="text-xs text-gray-600 mr-auto">{motivoCriar}</p>}
                        <button type="button" onClick={() => void fechar()} className={BOTAO_SECUNDARIO}>Cancelar</button>
                        <span className="inline-flex" title={motivoCriar ?? undefined}>
                            <button type="button" onClick={() => void criar()} disabled={criando || !!motivoCriar} className={BOTAO_PRIMARIO}>
                                {criando ? 'Criando…' : `Criar ${n} risco${n === 1 ? '' : 's'}`}
                            </button>
                        </span>
                    </>
                )}
            </SheetFooter>
        </Sheet>
    );
};

export default RiscosSugerirSheet;
