import React from 'react';
import { Lock, Plus } from 'lucide-react';
import type { ProjectRisk, RiskAction, RiskCatalogItem, RiskCategoryRow, RiskMatrixConfig } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import { fichaDoCatalogo, riskService } from '../../services/riskService';
import { errorMessage, targetOrgIds, useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { usePersistedState } from '../ui/TableUtils';
import { TabsBar } from '../ui/TabsBar';
import { faixasDe, hojeLocalISO, riscosComPlano, type ContextoRecorte, type RecorteRisco } from '../../utils/riskPainel';
import { MOTIVO_SEM_EDICAO_RISCOS } from '../../utils/permissaoRiscos';
import { RISK_MATRIZ_PADRAO } from '../../utils/riskScoring';
import { BOTAO_PRIMARIO, useObrasDaOrg } from './riscosUi';
import { RiscoFicha, fichaVazia, type AberturaFicha, type ContratoCurto, type EmpreendimentoCurto, type SecaoFicha } from './RiscoFicha';
import { RiscosRegistro, type FiltrosRegistro } from './RiscosRegistro';
import { RiscosPainel } from './RiscosPainel';
import { RiscosMatriz } from './RiscosMatriz';
import { RiscosAcoesAba, type FiltrosAcoes } from './RiscosAcoesAba';
import { CatalogoItemSheet, RiscoProprioSheet, RiscosCatalogo } from './RiscosCatalogo';

/**
 * Módulo ÒPURA Riscos — casca da tela (F1.4–F1.9 de docs/planos/2026-11-13-modulo-riscos.md).
 *
 * Anatomia (guia §19/§20): título → abas → (KPIs no Painel) → toolbar acoplada → tabela.
 * Um componente só é dono do título, das abas e dos dados (§19.3, "alternativa que
 * o Extrato usa"); cada aba é um filho que recebe a lista já carregada.
 *
 * Organização (REGRA #5): lê SÓ `useOrgContext()`. `null` = "Todas" e a tela
 * carrega assim mesmo (a RLS recorta). Criar risco ou risco próprio pergunta a
 * organização só em "Todas" (`useOrgWriteTarget`, modo `single`: o risco é de UMA
 * organização) — ANTES de abrir a ficha, porque a ficha precisa da organização
 * para oferecer as obras e os membros dela.
 *
 * §22: criar/editar/excluir atualiza o array local; nada recarrega a lista inteira.
 */
type Aba = 'painel' | 'registro' | 'matriz' | 'acoes' | 'catalogo';

const ABAS: { id: Aba; label: string }[] = [
    { id: 'painel', label: 'Painel' },
    { id: 'registro', label: 'Registro' },
    { id: 'matriz', label: 'Matriz' },
    { id: 'acoes', label: 'Ações' },
    { id: 'catalogo', label: 'Catálogo' },
];

/** §19.1/§20: o título muda com a aba — cada aba troca o assunto da tela. */
const CABECALHO: Record<Aba, { titulo: string; subtitulo: string }> = {
    painel: { titulo: 'Riscos', subtitulo: 'O que pede atenção agora: críticos, sem plano, tratamentos atrasados e revisões vencidas.' },
    registro: { titulo: 'Registro de riscos', subtitulo: 'Todos os riscos do empreendimento, da obra e do contrato, com dono, nível e próxima revisão.' },
    matriz: { titulo: 'Matriz de riscos', subtitulo: 'Probabilidade × impacto dos riscos ativos, na avaliação inerente ou residual.' },
    acoes: { titulo: 'Ações de tratamento', subtitulo: 'O plano de tratamento de todos os riscos: responsável, prazo, custo e eficácia.' },
    catalogo: { titulo: 'Catálogo de riscos', subtitulo: 'A biblioteca de riscos da construção civil e os riscos próprios da sua organização.' },
};

const FILTROS_REGISTRO_VAZIOS: FiltrosRegistro = { busca: '', status: '', nivel: '', obra: '', recorte: '' };
const FILTROS_ACOES_VAZIOS: FiltrosAcoes = { busca: '', status: '', prazo: '' };

interface Props {
    /** `canEditRisks` resolvido no `AppRouter` (utils/permissaoRiscos.ts). Falso = tela só de leitura, com o motivo visível. */
    podeEditar: boolean;
}

const RiscosModule: React.FC<Props> = ({ podeEditar }) => {
    const { orgId, isAllOrgs } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const { showToast, localToast } = useToast();
    const organizations = useStore(s => s.organizations);
    const viewFocus = useStore(s => s.viewFocus);
    const setViewFocus = useStore(s => s.setViewFocus);
    const email = useStore(s => s.currentProfile.email)?.toLowerCase();
    const userId = useStore(s => s.session?.user?.id);
    const obrasTodas = useObrasDaOrg(null);

    const [aba, setAba] = usePersistedState<Aba>('riscos:aba', 'painel');
    const abaEfetiva: Aba = ABAS.some(a => a.id === aba) ? aba : 'painel';
    const [filtrosRegistroSalvos, setFiltrosRegistro] = usePersistedState<FiltrosRegistro>('riscos:registro:filtros', FILTROS_REGISTRO_VAZIOS);
    const [filtrosAcoesSalvos, setFiltrosAcoes] = usePersistedState<FiltrosAcoes>('riscos:acoes:filtros', FILTROS_ACOES_VAZIOS);
    // Completa com os campos vazios: um valor salvo de versão anterior não pode deixar campo `undefined`.
    const filtrosRegistro = React.useMemo(() => ({ ...FILTROS_REGISTRO_VAZIOS, ...filtrosRegistroSalvos }), [filtrosRegistroSalvos]);
    const filtrosAcoes = React.useMemo(() => ({ ...FILTROS_ACOES_VAZIOS, ...filtrosAcoesSalvos }), [filtrosAcoesSalvos]);

    const [riscos, setRiscos] = React.useState<ProjectRisk[]>([]);
    const [acoes, setAcoes] = React.useState<RiskAction[]>([]);
    const [faixasPorOrg, setFaixasPorOrg] = React.useState<Record<string, RiskMatrixConfig>>({});
    const [categorias, setCategorias] = React.useState<RiskCategoryRow[]>([]);
    const [empreendimentos, setEmpreendimentos] = React.useState<EmpreendimentoCurto[]>([]);
    const [contratos, setContratos] = React.useState<ContratoCurto[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);

    const [catalogo, setCatalogo] = React.useState<RiskCatalogItem[]>([]);
    const [carregandoCatalogo, setCarregandoCatalogo] = React.useState(false);
    const [erroCatalogo, setErroCatalogo] = React.useState<string | null>(null);

    const [ficha, setFicha] = React.useState<AberturaFicha | null>(null);
    const [itemCatalogo, setItemCatalogo] = React.useState<RiskCatalogItem | null>(null);
    const [proprioOrg, setProprioOrg] = React.useState<string | null>(null);
    const seqFicha = React.useRef(0);

    // ── Carga (sem `if (!orgId) return`: em "Todas" a tela carrega tudo o que a RLS deixa) ──
    const seq = React.useRef(0);
    const carregar = React.useCallback(async () => {
        const minha = ++seq.current;
        setCarregando(true);
        setErro(null);
        try {
            const [rs, as, fx, cats] = await Promise.all([
                riskService.listarRiscos(orgId),
                riskService.listarAcoes({ organizationId: orgId }),
                riskService.listarFaixasPorOrg(orgId).catch(() => ({} as Record<string, RiskMatrixConfig>)),
                riskService.listarCategorias().catch(() => [] as RiskCategoryRow[]),
            ]);
            if (minha !== seq.current) return;
            setRiscos(rs); setAcoes(as); setFaixasPorOrg(fx); setCategorias(cats);
        } catch (e) {
            if (minha !== seq.current) return;
            setRiscos([]); setAcoes([]);
            setErro(errorMessage(e, 'Não foi possível carregar os riscos.'));
        } finally {
            if (minha === seq.current) setCarregando(false);
        }
        // Contexto (nomes de empreendimento e contrato): não segura a lista e falha sozinho.
        Promise.all([
            riskService.listarEmpreendimentos(orgId).catch(() => [] as EmpreendimentoCurto[]),
            riskService.listarContratos(orgId).catch(() => [] as ContratoCurto[]),
        ]).then(([emps, cts]) => { if (minha === seq.current) { setEmpreendimentos(emps); setContratos(cts); } });
    }, [orgId]);
    React.useEffect(() => { void carregar(); }, [carregar]);

    const carregarCatalogo = React.useCallback(async () => {
        setCarregandoCatalogo(true);
        setErroCatalogo(null);
        try {
            setCatalogo(await riskService.listarCatalogo(orgId));
        } catch (e) {
            setErroCatalogo(errorMessage(e, 'erro desconhecido'));
        } finally {
            setCarregandoCatalogo(false);
        }
    }, [orgId]);
    // O catálogo (312 itens com textos longos) só carrega quando a aba abre — uma vez por
    // organização do topo. Falhou: a aba mostra o erro com "Tentar de novo" (sem laço de repetição).
    const catalogoPedido = React.useRef<string | null | undefined>(undefined);
    React.useEffect(() => {
        if (abaEfetiva !== 'catalogo' || catalogoPedido.current === orgId) return;
        catalogoPedido.current = orgId;
        void carregarCatalogo();
    }, [abaEfetiva, orgId, carregarCatalogo]);

    // ── Rótulos e contexto compartilhados pelas abas (estáveis: a paginação zera pela identidade) ──
    const hoje = hojeLocalISO();
    const ctx = React.useMemo<ContextoRecorte>(() => ({ hoje, faixasPorOrg, comPlano: riscosComPlano(acoes) }), [hoje, faixasPorOrg, acoes]);
    const nomeObra = React.useMemo(() => new Map(obrasTodas.map(o => [o.id, o.name])), [obrasTodas]);
    const nomeEmp = React.useMemo(() => new Map(empreendimentos.map(e => [e.id, e.name])), [empreendimentos]);
    const nomeContrato = React.useMemo(() => new Map(contratos.map(c => [c.id, [c.number, c.title].filter(Boolean).join(' · ') || 'Contrato sem número'])), [contratos]);
    const catPorId = React.useMemo(() => new Map(categorias.map(c => [c.id, c])), [categorias]);
    const rotuloEscopo = React.useCallback((r: ProjectRisk) => {
        switch (r.escopo) {
            case 'obra': return `Obra · ${(r.project_id && nomeObra.get(r.project_id)) || 'obra fora da lista'}`;
            case 'empreendimento': return `Empreendimento · ${(r.empreendimento_id && nomeEmp.get(r.empreendimento_id)) || '—'}`;
            case 'contrato': return `Contrato · ${(r.contract_id && nomeContrato.get(r.contract_id)) || '—'}`;
            default: return RISK_ROTULO.escopo.corporativo;
        }
    }, [nomeObra, nomeEmp, nomeContrato]);
    const nomeCategoria = React.useCallback((id: string | null) => {
        const c = id ? catPorId.get(id) : null;
        return c ? `${c.codigo} · ${c.nome}` : 'Sem categoria';
    }, [catPorId]);
    const nomeOrg = React.useCallback((id: string) => organizations.find(o => o.id === id)?.name ?? '—', [organizations]);
    const obrasDosRiscos = React.useMemo(() => {
        const ids = [...new Set(riscos.map(r => r.project_id).filter((x): x is string => !!x))];
        return ids.map(id => ({ id, name: nomeObra.get(id) ?? 'Obra fora da lista' })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [riscos, nomeObra]);
    const riscosPorId = React.useMemo(() => new Map(riscos.map(r => [r.id, r])), [riscos]);

    // ── Ficha ──
    const abrirRisco = React.useCallback((r: ProjectRisk, secao?: SecaoFicha) => {
        setItemCatalogo(null);
        setFicha({ modo: 'editar', risco: r, secao });
    }, []);

    /** "Eu" na organização do risco — dono sugerido de um risco novo (pode trocar). */
    const donoSugerido = (org: string) => {
        const m = organizations.find(o => o.id === org)?.members?.find(x => !!x.userId && (x.userId === userId || (!!email && x.email?.toLowerCase() === email)));
        return { owner_user_id: m?.userId ?? '', owner_nome: m?.name ?? null };
    };

    const novoRisco = async () => {
        const alvo = await resolveWriteOrg('single');
        if (!alvo) return;
        const org = targetOrgIds(alvo)[0];
        seqFicha.current++;
        setFicha({ modo: 'novo', orgId: org, seq: seqFicha.current, inicial: fichaVazia(donoSugerido(org)) });
    };

    const usarDoCatalogo = async (item: RiskCatalogItem) => {
        setItemCatalogo(null);   // fecha a leitura ANTES de abrir a ficha: nunca dois painéis (UI_PATTERNS §4.4)
        // Risco próprio é da organização que o cadastrou; item do sistema serve a qualquer uma.
        let org = item.organization_id;
        if (!org) {
            const alvo = await resolveWriteOrg('single');
            if (!alvo) return;
            org = targetOrgIds(alvo)[0];
        }
        seqFicha.current++;
        setFicha({
            modo: 'novo', orgId: org, seq: seqFicha.current,
            inicial: fichaDoCatalogo(item, { escopo: 'obra', proxima_revisao: '', data_identificacao: hojeLocalISO(), ...donoSugerido(org) }),
        });
    };

    const novoProprio = async () => {
        const alvo = await resolveWriteOrg('single');
        if (!alvo) return;
        setProprioOrg(targetOrgIds(alvo)[0]);
    };

    // §22: atualiza o array local.
    const riscoSalvo = React.useCallback((r: ProjectRisk) => {
        setRiscos(prev => (prev.some(x => x.id === r.id) ? prev.map(x => (x.id === r.id ? r : x)) : [r, ...prev]));
    }, []);
    const riscoExcluido = React.useCallback((r: ProjectRisk) => {
        setRiscos(prev => prev.filter(x => x.id !== r.id));
        setAcoes(prev => prev.filter(a => a.project_risk_id !== r.id));
    }, []);
    const acoesDoRisco = React.useCallback((riskId: string, lista: RiskAction[]) => {
        setAcoes(prev => [...prev.filter(a => a.project_risk_id !== riskId), ...lista].sort((a, b) => a.prazo.localeCompare(b.prazo)));
    }, []);

    // ── Foco vindo de aviso (`/riscos?riskId=` → `RISCO`, utils/linkNotificacao.ts) ──
    const riscosRef = React.useRef(riscos);
    riscosRef.current = riscos;
    React.useEffect(() => {
        if (viewFocus?.source !== 'RISCO') return;
        const id = viewFocus.ref;
        setViewFocus(null);   // consumido uma vez: não reabre ao voltar à tela
        setAba('registro');
        const local = riscosRef.current.find(r => r.id === id);
        if (local) { abrirRisco(local); return; }
        riskService.obterRisco(id)
            .then(r => { if (r) abrirRisco(r); else showToast('O risco do aviso não foi encontrado (excluído, ou de uma organização que você não acessa).', 'error'); })
            .catch(e => showToast(errorMessage(e, 'Não foi possível abrir o risco do aviso.'), 'error'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewFocus]);

    // ── Painel → recortes (CA11: o número do cartão É o tamanho da lista que ele abre) ──
    const abrirRecorte = (recorte: RecorteRisco) => {
        setFiltrosRegistro({ ...FILTROS_REGISTRO_VAZIOS, recorte });
        setAba('registro');
    };
    const abrirAcoesEmAtraso = () => {
        setFiltrosAcoes({ ...FILTROS_ACOES_VAZIOS, prazo: 'atraso' });
        setAba('acoes');
    };
    const setFiltroRegistro = <K extends keyof FiltrosRegistro>(k: K, v: FiltrosRegistro[K]) => setFiltrosRegistro(prev => ({ ...prev, [k]: v }));
    const setFiltroAcoes = <K extends keyof FiltrosAcoes>(k: K, v: FiltrosAcoes[K]) => setFiltrosAcoes(prev => ({ ...prev, [k]: v }));

    const cab = CABECALHO[abaEfetiva];
    const motivo = MOTIVO_SEM_EDICAO_RISCOS;
    const acaoPrimaria = abaEfetiva === 'catalogo'
        ? { rotulo: 'Novo risco próprio', onClick: novoProprio }
        : abaEfetiva === 'registro' || abaEfetiva === 'painel'
            ? { rotulo: 'Novo risco', onClick: novoRisco }
            : null;

    return (
        <div className="space-y-6 pb-20">
            {/* §20 — título solto, muda com a aba */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{cab.titulo}</h1>
                <p className="text-gray-500 text-sm mt-1.5 font-medium">{cab.subtitulo}</p>
                {!podeEditar && (
                    <p className="flex items-center gap-1.5 text-sm text-gray-700 mt-2">
                        <Lock className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" /> {motivo}
                    </p>
                )}
            </div>

            {/* §19.1 — abas; ação primária §17 à direita */}
            <TabsBar<Aba> tabs={ABAS} value={abaEfetiva} onChange={setAba}>
                {acaoPrimaria && (
                    <span className="inline-flex" title={podeEditar ? undefined : motivo}>
                        <button type="button" onClick={() => void acaoPrimaria.onClick()} disabled={!podeEditar} className={BOTAO_PRIMARIO}>
                            <Plus className="w-[15px] h-[15px]" /> {acaoPrimaria.rotulo}
                        </button>
                    </span>
                )}
            </TabsBar>

            {/* §5.2 — erro de carga fica FORA do card acoplado */}
            {erro && abaEfetiva !== 'catalogo' && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                    <span>Não foi possível carregar os riscos: {erro}</span>
                    <button type="button" onClick={() => void carregar()} className="font-medium text-red-700 underline">Tentar de novo</button>
                </div>
            )}

            {abaEfetiva === 'painel' && (
                <RiscosPainel riscos={riscos} acoes={acoes} ctx={ctx} faixasPorOrg={faixasPorOrg} carregando={carregando}
                    rotuloEscopo={rotuloEscopo} nomeCategoria={nomeCategoria}
                    onRecorte={abrirRecorte} onAcoesEmAtraso={abrirAcoesEmAtraso} onAbrir={r => abrirRisco(r)} />
            )}
            {abaEfetiva === 'registro' && (
                <RiscosRegistro riscos={riscos} carregando={carregando} filtros={filtrosRegistro} setFiltro={setFiltroRegistro}
                    limparFiltros={() => setFiltrosRegistro(FILTROS_REGISTRO_VAZIOS)} ctx={ctx} faixasPorOrg={faixasPorOrg}
                    rotuloEscopo={rotuloEscopo} nomeCategoria={nomeCategoria} nomeOrg={nomeOrg} mostrarOrg={isAllOrgs}
                    obrasDosRiscos={obrasDosRiscos} podeEditar={podeEditar} onAbrir={abrirRisco} />
            )}
            {abaEfetiva === 'matriz' && (
                <RiscosMatriz riscos={riscos} carregando={carregando} faixasDoMapa={orgId ? faixasDe(faixasPorOrg, orgId) : RISK_MATRIZ_PADRAO}
                    faixasPorOrg={faixasPorOrg} emTodas={isAllOrgs} rotuloEscopo={rotuloEscopo} onAbrir={r => abrirRisco(r)} />
            )}
            {abaEfetiva === 'acoes' && (
                <RiscosAcoesAba acoes={acoes} riscosPorId={riscosPorId} carregando={carregando} hoje={hoje}
                    filtros={filtrosAcoes} setFiltro={setFiltroAcoes} onAbrir={r => abrirRisco(r, 'acoes')} />
            )}
            {abaEfetiva === 'catalogo' && (
                <RiscosCatalogo itens={catalogo} categorias={categorias} carregando={carregandoCatalogo} erro={erroCatalogo}
                    onTentarDeNovo={() => void carregarCatalogo()} onAbrir={setItemCatalogo} onUsar={i => void usarDoCatalogo(i)}
                    podeEditar={podeEditar} motivoSemEdicao={motivo} />
            )}

            <RiscoFicha abertura={ficha} onClose={() => setFicha(null)} podeEditar={podeEditar} motivoSemEdicao={motivo}
                categorias={categorias} empreendimentos={empreendimentos} contratos={contratos} faixasPorOrg={faixasPorOrg}
                onSalvo={riscoSalvo} onExcluido={riscoExcluido} onAcoesDoRisco={acoesDoRisco} />

            <CatalogoItemSheet item={itemCatalogo} categorias={categorias} podeEditar={podeEditar} motivoSemEdicao={motivo}
                onClose={() => setItemCatalogo(null)} onUsar={i => void usarDoCatalogo(i)} />

            {proprioOrg && (
                <RiscoProprioSheet orgId={proprioOrg} categorias={categorias} onClose={() => setProprioOrg(null)}
                    onCriado={item => setCatalogo(prev => [...prev, item].sort((a, b) => a.codigo.localeCompare(b.codigo)))} />
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

export default RiscosModule;
