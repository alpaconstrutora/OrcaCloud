/**
 * Diretoria (ÒPURA CEO) — cadastro dos responsáveis por área e de "quem responde a quem".
 * Plano: docs/planos/2026-11-17-opura-ceo.md (decisões 1 e 4).
 *
 *  - Responsável da área: quem responde por um grupo quando o próprio dado não aponta pessoa
 *    (Financeiro, Comercial, Suprimentos, RH, Obras). "Ninguém" remove.
 *  - Quem responde a quem: o chefe de cada pessoa. A lista de chefes não oferece a própria
 *    pessoa nem ninguém da equipe abaixo dela (seria ciclo — o banco também recusa).
 *
 * Gaveta (`Sheet`, §26 — nunca `size="full"`). As escolhas ficam pendentes até "Salvar"
 * (Sheet com `dirty`, e o X/Fechar perguntam antes de descartar — §25). Salvar grava e a gaveta
 * continua aberta, com os valores relidos do banco.
 *
 * Organização (REGRA #5): quem grava é a casca (`onSalvar`). Com organização no topo, grava
 * nela; em "Todas", a casca pergunta (`useOrgWriteTarget`, 'all-allowed') e replica. Aqui, em
 * "Todas", cada campo mostra o valor comum às organizações — ou "Varia por organização", com o
 * valor de cada uma escrito embaixo.
 */
import React from 'react';
import { Briefcase, Lock, Network } from 'lucide-react';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import { AREAS, equipe, nomeDe, type Area } from '../../utils/diretoria';
import { MOTIVO_SEM_EDICAO_DIRETORIA } from '../../utils/permissaoDiretoria';
import { useDiretoria } from './DiretoriaContexto';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, ROTULO, plural } from './diretoriaUi';

export type MudancaCadastro =
    | { tipo: 'area'; area: Area; userId: string | null }
    | { tipo: 'chefe'; userId: string; chefeId: string | null };

interface Props {
    onClose: () => void;
    /** Grava as mudanças (a casca resolve a organização). `false` = cancelou a escolha da organização. */
    onSalvar: (mudancas: MudancaCadastro[]) => Promise<boolean>;
}

/** Valor de select que não é pessoa: as organizações discordam (só em "Todas"). */
const VARIA = '__varia__';

export const ResponsaveisSheet: React.FC<Props> = ({ onClose, onSalvar }) => {
    const d = useDiretoria();
    const confirm = useConfirm();
    const { painel, orgDoTopo, chefes } = d;
    const id = React.useId();
    const [areasNovas, setAreasNovas] = React.useState<Partial<Record<Area, string>>>({});
    const [chefesNovos, setChefesNovos] = React.useState<Record<string, string>>({});
    const [gravando, setGravando] = React.useState(false);

    const podeEditar = orgDoTopo ? d.podeEditarOrg(orgDoTopo) : d.podeEditarAlguma;
    const motivo = podeEditar ? null : MOTIVO_SEM_EDICAO_DIRETORIA;
    const orgsDoPainel = orgDoTopo ? painel.orgs.filter(o => o.id === orgDoTopo) : painel.orgs;

    const pessoas = React.useMemo(() => painel.pessoas
        .filter(p => !orgDoTopo || (p.orgs ?? []).includes(orgDoTopo))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [painel.pessoas, orgDoTopo]);

    /** Valor atual da área: a pessoa, '' (ninguém) ou VARIA, e o texto por organização quando varia. */
    const atualDaArea = React.useCallback((area: Area): { valor: string; porOrg: string | null } => {
        const valores = orgsDoPainel.map(o => ({
            org: o.nome,
            user: painel.areas.find(a => a.area === area && a.organization_id === o.id)?.user_id ?? '',
        }));
        const distintos = new Set(valores.map(v => v.user));
        if (distintos.size <= 1) return { valor: valores.find(() => true)?.user ?? '', porOrg: null };
        return { valor: VARIA, porOrg: valores.map(v => `${v.org}: ${v.user ? nomeDe(v.user, painel.pessoas) : 'ninguém'}`).join(' · ') };
    }, [orgsDoPainel, painel.areas, painel.pessoas]);

    const mudancas = React.useMemo<MudancaCadastro[]>(() => [
        ...(Object.entries(areasNovas) as [Area, string][])
            .filter(([area, v]) => v !== atualDaArea(area).valor && v !== VARIA)
            .map(([area, v]) => ({ tipo: 'area' as const, area, userId: v || null })),
        ...Object.entries(chefesNovos)
            .filter(([u, c]) => c !== (chefes.get(u) ?? ''))
            .map(([u, c]) => ({ tipo: 'chefe' as const, userId: u, chefeId: c || null })),
    ], [areasNovas, chefesNovos, atualDaArea, chefes]);
    const dirty = mudancas.length > 0;

    /** Chefes com o rascunho aplicado — para não oferecer um chefe que fecharia um ciclo. */
    const chefesComRascunho = React.useMemo(() => {
        const m = new Map(chefes);
        for (const [u, c] of Object.entries(chefesNovos)) { if (c) m.set(u, c); else m.delete(u); }
        return m;
    }, [chefes, chefesNovos]);

    const fechar = async () => {
        if (dirty) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
                variant: 'warning',
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        onClose();
    };

    const salvar = async () => {
        if (!dirty || motivo) return;
        setGravando(true);
        try {
            if (await onSalvar(mudancas)) { setAreasNovas({}); setChefesNovos({}); }
        } finally {
            setGravando(false);
        }
    };

    const motivoSalvar = motivo ?? (dirty ? null : 'Nada mudou: escolha outra pessoa num campo para poder salvar.');

    return (
        <Sheet open onClose={onClose} size="lg" dirty={dirty}>
            <SheetHeader onClose={() => void fechar()}>
                <SheetTitle>Responsáveis e hierarquia</SheetTitle>
                <SheetDescription>
                    {orgDoTopo
                        ? `Vale para ${d.nomeDaOrg(orgDoTopo)}.`
                        : 'O topo está em "Todas as organizações": ao salvar, você escolhe em qual organização gravar — ou em todas em que pode editar.'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                {motivo && (
                    <p className="flex items-start gap-1.5 text-sm text-gray-700">
                        <Lock className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" aria-hidden="true" /> {motivo}
                    </p>
                )}

                <section className="space-y-4">
                    <SecaoTitulo icon={Briefcase} titulo="Responsável por área" resumo="quando o próprio dado não aponta pessoa" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {(Object.entries(AREAS) as [Area, string][]).map(([area, nome]) => {
                            const atual = atualDaArea(area);
                            const valor = areasNovas[area] ?? atual.valor;
                            const campo = `${id}-area-${area}`;
                            return (
                                <div key={area} className="space-y-1.5 min-w-0">
                                    <label htmlFor={campo} className={ROTULO}>{nome}</label>
                                    <select id={campo} value={valor} disabled={!!motivo}
                                        onChange={e => setAreasNovas(x => ({ ...x, [area]: e.target.value }))} className={CAMPO}>
                                        {valor === VARIA && <option value={VARIA} disabled>Varia por organização</option>}
                                        <option value="">Ninguém</option>
                                        {pessoas.map(p => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}
                                    </select>
                                    {atual.porOrg && <p className="text-xs text-gray-500">{atual.porOrg}</p>}
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="space-y-4">
                    <SecaoTitulo icon={Network} titulo="Quem responde a quem" resumo={plural(pessoas.length, 'pessoa', 'pessoas')} />
                    <p className="text-sm text-gray-600">
                        Escolha o chefe de cada pessoa. É o que soma a equipe na visão "Por responsável".
                        {!orgDoTopo && ' Em "Todas", se a mesma pessoa tem chefes diferentes em organizações diferentes, vale o registro mais recente.'}
                    </p>
                    {pessoas.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhuma pessoa com conta nesta organização.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            {pessoas.map(p => {
                                const valor = chefesNovos[p.user_id] ?? chefes.get(p.user_id) ?? '';
                                const proibidos = new Set(equipe(p.user_id, chefesComRascunho));
                                const campo = `${id}-chefe-${p.user_id}`;
                                return (
                                    <div key={p.user_id} className="space-y-1.5 min-w-0">
                                        <label htmlFor={campo} className={`${ROTULO} truncate`} title={p.cargo ? `${p.nome} · ${p.cargo}` : p.nome}>{p.nome}</label>
                                        <select id={campo} value={valor} disabled={!!motivo}
                                            onChange={e => setChefesNovos(x => ({ ...x, [p.user_id]: e.target.value }))} className={CAMPO}>
                                            <option value="">Ninguém (topo da hierarquia)</option>
                                            {pessoas.filter(c => !proibidos.has(c.user_id) || c.user_id === valor).map(c => (
                                                <option key={c.user_id} value={c.user_id}>Responde a {c.nome}</option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </SheetPanel>

            <SheetFooter>
                <span className="mr-auto text-xs text-gray-500">
                    {dirty ? `${plural(mudancas.length, 'alteração', 'alterações')} por salvar` : 'Tudo salvo'}
                </span>
                <button type="button" onClick={() => void fechar()} className={BOTAO_SECUNDARIO}>Fechar</button>
                <span className="inline-flex" title={motivoSalvar ?? undefined}>
                    <button type="button" onClick={() => void salvar()} disabled={!!motivoSalvar || gravando} className={BOTAO_PRIMARIO}>
                        {gravando ? 'Salvando…' : 'Salvar'}
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default ResponsaveisSheet;
