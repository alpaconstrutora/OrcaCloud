import React from 'react';
import { useWritableOrganizations } from '../../hooks/useOrgContext';
import { empreendimentoService } from '../../services/empreendimentoService';
import type { Empreendimento } from '../../types/empreendimento';
import type { CreditRoomEscopo } from '../../types/creditRoom';
import type { ParametrosCapacidade } from '../../utils/creditCapacity';

/** Classes de campo/rótulo do formulário do Credit Room (h-9, rótulo sem caixa alta). */
export const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
export const rotulo = 'text-xs font-semibold text-slate-500';

const checkbox = 'w-4 h-4 rounded border-gray-300 text-blue-600';
const itemCheck = 'flex items-center gap-2 text-sm text-gray-700';

export interface EscopoCapacidade {
    escopo: CreditRoomEscopo;
    grupoOrganizationIds: string[];
    empreendimentoIds: string[];
    parametrosCapacidade: ParametrosCapacidade;
}

/**
 * Empreendimentos efetivamente gravados: `[]` = "todos do escopo". Ids que
 * saíram do escopo (organização desmarcada) são descartados, e marcar todos
 * também vira `[]` — assim a capacidade acompanha empreendimento novo.
 */
export function normalizarEmpreendimentos(ids: string[], lista: Empreendimento[]): string[] {
    const noEscopo = new Set(lista.map(e => e.id));
    const validos = ids.filter(id => noEscopo.has(id));
    return validos.length === 0 || validos.length === noEscopo.size ? [] : validos;
}

interface Props extends EscopoCapacidade {
    /** Só carrega os empreendimentos com o painel aberto (o Sheet fica montado). */
    ativo: boolean;
    /** Organização dona da operação (a da sala; a ativa no topo numa sala nova). `null` = ainda não definida ("Todas"). */
    ownerOrgId: string | null;
    onChange: (patch: Partial<EscopoCapacidade>) => void;
    /** Lista de empreendimentos do escopo atual, para o pai normalizar ao salvar (`null` = ainda não carregou). */
    onListaCarregada: (lista: Empreendimento[] | null) => void;
}

/**
 * Seções "Escopo da renda", "Empreendimentos" e "Parâmetros da capacidade" do
 * formulário do Credit Room. Só cadastro — a conta da capacidade roda ao
 * congelar a versão.
 */
export default function CreditRoomFormCapacidade({
    escopo, grupoOrganizationIds, empreendimentoIds, parametrosCapacidade: p,
    ativo, ownerOrgId, onChange, onListaCarregada,
}: Props) {
    // Organizações de que o usuário é MEMBRO (mesma lista dos formulários de cadastro).
    const orgsMembro = useWritableOrganizations();
    const [lista, setLista] = React.useState<Empreendimento[] | null>(null);
    const [erroLista, setErroLista] = React.useState<string | null>(null);

    const grupo = escopo === 'GRUPO';

    // Orgs que entram na capacidade: o grupo marcado, ou só a dona.
    // Sem dona definida ("Todas" no topo) o escopo EMPRESA lê o que a RLS deixar ver.
    const orgsDoEscopo: (string | undefined)[] = grupo
        ? grupoOrganizationIds
        : [ownerOrgId ?? undefined];
    const chaveEscopo = grupo ? `G:${[...grupoOrganizationIds].sort().join(',')}` : `E:${ownerOrgId ?? ''}`;

    React.useEffect(() => {
        if (!ativo) return;
        let vivo = true;
        setLista(null);
        setErroLista(null);
        onListaCarregada(null);
        if (orgsDoEscopo.length === 0) {
            setLista([]);
            onListaCarregada([]);
            return;
        }
        Promise.allSettled(orgsDoEscopo.map(o => empreendimentoService.list(o))).then(res => {
            if (!vivo) return;
            const ok = res.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
            const falhas = res.filter(r => r.status === 'rejected').length;
            setLista(ok);
            setErroLista(falhas > 0 ? `Não foi possível carregar os empreendimentos de ${falhas} organização(ões).` : null);
            // Lista incompleta não normaliza nada: devolve null para o pai não descartar ids por engano.
            onListaCarregada(falhas > 0 ? null : ok);
        });
        return () => { vivo = false; };
        // `orgsDoEscopo` é derivado de `chaveEscopo`; `onListaCarregada` é estável no pai.
    }, [ativo, chaveEscopo]); // eslint-disable-line react-hooks/exhaustive-deps

    const nomeOrg = (id: string) => orgsMembro.find(o => o.id === id)?.name ?? id;

    // ── Escopo ───────────────────────────────────────────────────────────────
    const escolherEscopo = (novo: CreditRoomEscopo) => {
        if (novo === escopo) return;
        if (novo === 'GRUPO') {
            const base = grupoOrganizationIds.length ? grupoOrganizationIds : [];
            onChange({
                escopo: novo,
                grupoOrganizationIds: ownerOrgId && !base.includes(ownerOrgId) ? [ownerOrgId, ...base] : base,
            });
        } else {
            onChange({ escopo: novo });
        }
    };

    const alternarOrg = (id: string, marcado: boolean) =>
        onChange({
            grupoOrganizationIds: marcado
                ? [...grupoOrganizationIds, id]
                : grupoOrganizationIds.filter(x => x !== id),
        });

    // ── Empreendimentos ──────────────────────────────────────────────────────
    const todosMarcados = empreendimentoIds.length === 0;
    const marcado = (id: string) => todosMarcados || empreendimentoIds.includes(id);
    const qtdMarcados = lista ? lista.filter(e => marcado(e.id)).length : 0;

    const alternarEmp = (id: string, marcar: boolean) => {
        if (!lista) return;
        const atuais = lista.filter(e => marcado(e.id)).map(e => e.id);
        const novos = marcar ? [...atuais, id] : atuais.filter(x => x !== id);
        // [] = todos: marcar todos grava vazio (empreendimento novo entra sozinho).
        onChange({ empreendimentoIds: novos.length === lista.length ? [] : novos });
    };

    // ── Parâmetros ───────────────────────────────────────────────────────────
    const setP = <K extends keyof ParametrosCapacidade>(k: K, v: ParametrosCapacidade[K]) =>
        onChange({ parametrosCapacidade: { ...p, [k]: v } });
    const num = (v: string) => (v === '' ? 0 : Number(v));

    return (
        <>
            {/* Escopo da renda */}
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Escopo da renda</h3>
                <div className="flex flex-wrap gap-4">
                    <label className={itemCheck}>
                        <input type="radio" name="credit-room-escopo" checked={!grupo} onChange={() => escolherEscopo('EMPRESA')} className={checkbox} />
                        Empresa tomadora
                    </label>
                    <label className={itemCheck}>
                        <input type="radio" name="credit-room-escopo" checked={grupo} onChange={() => escolherEscopo('GRUPO')} className={checkbox} />
                        Grupo inteiro
                    </label>
                </div>
                {grupo && (
                    <div className="space-y-1.5">
                        <label className={rotulo}>Organizações do grupo (só as de que você é membro)</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                            {orgsMembro.map(o => {
                                const dona = o.id === ownerOrgId;
                                return (
                                    <label
                                        key={o.id}
                                        className={itemCheck}
                                        title={dona ? 'Organização dona da operação — sempre faz parte do grupo.' : undefined}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={dona || grupoOrganizationIds.includes(o.id)}
                                            disabled={dona}
                                            onChange={e => alternarOrg(o.id, e.target.checked)}
                                            className={`${checkbox} disabled:opacity-60`}
                                        />
                                        {o.name}
                                        {dona && <span className="text-xs text-gray-500">(dona da operação)</span>}
                                    </label>
                                );
                            })}
                        </div>
                        {!ownerOrgId && (
                            <p className="text-xs text-gray-500">
                                Com &quot;Todas as organizações&quot; no topo, a organização dona é escolhida ao criar — marque-a também aqui.
                            </p>
                        )}
                        {grupoOrganizationIds.length === 0 && (
                            <p className="text-xs text-red-600">Marque ao menos uma organização para o grupo.</p>
                        )}
                    </div>
                )}
            </section>

            {/* Empreendimentos */}
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Empreendimentos na capacidade</h3>
                {lista === null ? (
                    <p className="text-sm text-gray-500">Carregando empreendimentos...</p>
                ) : lista.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum empreendimento nas organizações do escopo.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                        {lista.map(e => {
                            const ultimo = marcado(e.id) && qtdMarcados === 1;
                            return (
                                <label
                                    key={e.id}
                                    className={itemCheck}
                                    title={ultimo ? 'Ao menos um empreendimento precisa ficar marcado.' : undefined}
                                >
                                    <input
                                        type="checkbox"
                                        checked={marcado(e.id)}
                                        disabled={ultimo}
                                        onChange={ev => alternarEmp(e.id, ev.target.checked)}
                                        className={`${checkbox} disabled:opacity-60`}
                                    />
                                    {e.name}
                                    {grupo && <span className="text-xs text-gray-500">· {nomeOrg(e.organization_id)}</span>}
                                </label>
                            );
                        })}
                    </div>
                )}
                {erroLista && <p className="text-xs text-red-600">{erroLista}</p>}
                <p className="text-xs text-gray-500">Todos marcados = a capacidade acompanha empreendimentos novos do escopo.</p>
            </section>

            {/* Parâmetros da capacidade */}
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Parâmetros da capacidade</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                        <label className={rotulo}>DSCR mínimo</label>
                        <input type="number" min={0} step={0.05} value={p.dscr_minimo} onChange={e => setP('dscr_minimo', num(e.target.value))} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Taxa mensal (%)</label>
                        <input type="number" min={0} step={0.01} value={p.taxa_mensal_pct} onChange={e => setP('taxa_mensal_pct', num(e.target.value))} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Prazo (meses)</label>
                        <input type="number" min={1} value={p.prazo_meses} onChange={e => setP('prazo_meses', num(e.target.value))} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Carência (meses)</label>
                        <input type="number" min={0} value={p.carencia_meses} onChange={e => setP('carencia_meses', num(e.target.value))} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Sistema de amortização</label>
                        <select value={p.sistema} onChange={e => setP('sistema', e.target.value as ParametrosCapacidade['sistema'])} className={campo}>
                            <option value="PRICE">Price</option>
                            <option value="SAC">SAC</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Horizonte</label>
                        <select value={p.horizonte_meses} onChange={e => setP('horizonte_meses', Number(e.target.value))} className={campo}>
                            <option value={24}>24 meses</option>
                            <option value={36}>36 meses</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Haircut do estoque (%)</label>
                        <input type="number" min={0} max={100} value={p.haircut_estoque_pct} onChange={e => setP('haircut_estoque_pct', num(e.target.value))} className={campo} />
                    </div>
                </div>
                <label className={itemCheck}>
                    <input type="checkbox" checked={p.despesa_operacional} onChange={e => setP('despesa_operacional', e.target.checked)} className={checkbox} />
                    Descontar despesa operacional dos aluguéis
                </label>
            </section>
        </>
    );
}
