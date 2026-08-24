// components/empreendimento/VinculacoesTab.tsx
//
// Aba Vinculações do Empreendimento: tudo que está pendurado nele — Obra(s),
// Orçamento, Planejamento, Áreas NBR 12721, Planta IA / Viabilidade, Contratos e
// Financeiro — com navegação para o módulo de destino e gestão do vínculo.
//
// UI: docs/ui_ux_guia_unificado.md §8 (badge = texto colorido),
// §9.2 (ActionIconButton), §11/§12 (loading/empty), §14 (useConfirm), §16 (radius).
import React from 'react';
import {
  Building2, Calculator, CalendarRange, Ruler, LayoutGrid,
  FileSignature, Wallet, AlertCircle, RefreshCw, Plus, Search, HardHat, Coins,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { useStore } from '../../store/useStore';
import { Empreendimento, EmpreendimentoTower } from '../../types';
import { onlyObras } from '../../utils/projectClassification';
import { projectService } from '../../services/projectService';
import { empreendimentoService } from '../../services/empreendimentoService';
import {
  empreendimentoLinksService, EmpreendimentoLinksSnapshot, EmpreendimentoLink,
} from '../../services/empreendimentoLinksService';
import CriarObraDoEmpreendimento, { CriarObraTarget } from './CriarObraDoEmpreendimento';

interface Props {
  empreendimento: Empreendimento;
  organizationId: string;
  /** `handleLoadProject` — único caminho que abre um projeto já carregado. */
  onOpenProject?: (projectId: string, targetView?: string | null) => void | Promise<void>;
  onChangeView?: (view: string) => void;
  /** Avisa o pai que um vínculo mudou (o detalhe precisa recarregar o empreendimento). */
  onLinksChanged?: () => void;
}

const formatMoney = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Linha crua de `projects` como o `projectService.listProjects` devolve. */
type ClassifiableProjectRow = {
  id?: string;
  name: string;
  code?: string | null;
  organization_id?: string | null;
  settings?: Record<string, unknown> | null;
};

/** Obra candidata ao vínculo, já resolvida (organização + vínculo existente). */
interface LinkableObra {
  id: string;
  name: string;
  code: string | null;
  organizationId: string | null;
  /** Preenchido quando a obra já pertence a OUTRO empreendimento. */
  linkedEmpreendimentoId: string | null;
  linkedEmpreendimentoName: string | null;
}

// Situação de contrato / lançamento — texto colorido puro (§8).
const STATUS_COLORS: Record<string, string> = {
  ATIVO: 'text-emerald-700',
  VIGENTE: 'text-emerald-700',
  RASCUNHO: 'text-gray-600',
  ENCERRADO: 'text-slate-500',
  CANCELADO: 'text-red-600',
  SUSPENSO: 'text-amber-700',
  REALIZADO: 'text-emerald-700',
  PREVISTO: 'text-blue-700',
  VENCIDO: 'text-red-600',
};

/** Uma linha de vínculo. A ação "Abrir" é texto azul; desvincular é ícone (§9). */
const LinkRow: React.FC<{
  link: EmpreendimentoLink;
  onOpen?: () => void;
  onUnlink?: () => void;
  unlinkTitle?: string;
  busy?: boolean;
  right?: React.ReactNode;
}> = ({ link, onOpen, onUnlink, unlinkTitle, busy, right }) => (
  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-blue-50/50 transition-colors">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-normal text-gray-700 truncate">{link.label}</p>
      <div className="flex items-center gap-2">
        {link.sublabel && <span className="text-sm font-normal text-gray-400 truncate">{link.sublabel}</span>}
        {link.missing && (
          <span className="text-sm font-normal text-amber-600">vínculo quebrado</span>
        )}
      </div>
    </div>

    {right}

    <div className="flex items-center gap-1.5 shrink-0">
      {onOpen && !link.missing && (
        <button
          onClick={onOpen}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
        >
          Abrir
        </button>
      )}
      {onUnlink && (
        <ActionIconButton
          kind="delete"
          title={unlinkTitle || 'Desvincular'}
          disabled={busy}
          onClick={onUnlink}
        />
      )}
    </div>
  </div>
);

/** Seção-card por tipo de vínculo, com contador em texto colorido (§8). */
const LinkSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  count: number;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyHint: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, icon, count, emptyIcon, emptyTitle, emptyHint, action, children }) => (
  <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
      <span className="text-gray-400">{icon}</span>
      <h3 className="text-xs font-semibold text-gray-500 flex-1">{title}</h3>
      <span className={`text-sm font-normal ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{count}</span>
      {action}
    </div>
    {count === 0 ? (
      <div className="text-center py-12">
        <span className="inline-block text-gray-300 mb-4">{emptyIcon}</span>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{emptyTitle}</h3>
        <p className="text-sm text-gray-500">{emptyHint}</p>
      </div>
    ) : children}
  </div>
);

export const VinculacoesTab: React.FC<Props> = ({
  empreendimento: emp, organizationId, onOpenProject, onChangeView, onLinksChanged,
}) => {
  // `organizations` = todas as organizações de que o usuário é membro — usado para
  // rotular a obra no painel de vínculo (a obra pode ser de outra org que não a SPE).
  const { organizations } = useStore();
  const confirm = useConfirm();

  const [snapshot, setSnapshot] = React.useState<EmpreendimentoLinksSnapshot | null>(null);
  const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [linkSheetOpen, setLinkSheetOpen] = React.useState(false);
  const [linkTarget, setLinkTarget] = React.useState<{ towerId: string | null; towerName: string | null }>({ towerId: null, towerName: null });
  // Criar obra a partir daqui — abre o ProjectModal pré-preenchido pelo empreendimento.
  const [creatingObra, setCreatingObra] = React.useState<CriarObraTarget | null>(null);
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // "Todas as organizações" não bloqueia a leitura — a org sai da própria
  // entidade aberta (CLAUDE.md regra #5).
  const effectiveOrgId = organizationId || emp.organization_id || null;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snap, tws] = await Promise.all([
        empreendimentoLinksService.getSnapshot(emp, effectiveOrgId),
        empreendimentoService.listTowers(emp.id),
      ]);
      setSnapshot(snap);
      setTowers(tws);
    } catch (err: any) {
      console.error('[VinculacoesTab] erro ao carregar vínculos:', err);
      setError(err?.message || 'Não foi possível carregar os vínculos.');
    } finally {
      setLoading(false);
    }
  }, [emp, effectiveOrgId]);

  React.useEffect(() => { load(); }, [load]);

  // ── Obras candidatas ao vínculo ────────────────────────────────────────────
  // NÃO sai de `useStore().projects`: aquela lista já vem recortada pelo seletor
  // de organização do topo, e o empreendimento costuma ser uma SPE própria
  // enquanto as obras vivem na organização do grupo — a interseção dava zero e a
  // tela dizia "nenhuma obra disponível" com obras cadastradas. Aqui a busca é
  // sem filtro de org: a RLS recorta pelas organizações de que o usuário é
  // membro (mesmo precedente do dropdown de Corretor).
  const [linkableObras, setLinkableObras] = React.useState<LinkableObra[]>([]);
  const [linkableLoading, setLinkableLoading] = React.useState(false);
  const [linkableError, setLinkableError] = React.useState<string | null>(null);
  // §3: busca persistida. Não é zerada ao reabrir o painel de propósito — o termo
  // continua visível no campo, então o recorte nunca fica escondido do usuário.
  const [obraSearch, setObraSearch] = usePersistedState<string>('vinculacoes:obraSearch', '');

  const loadLinkableObras = React.useCallback(async () => {
    setLinkableLoading(true);
    setLinkableError(null);
    try {
      const [rows, empByProject] = await Promise.all([
        projectService.listProjects(undefined, undefined, true),
        // Mapa obra → empreendimento: é o que permite dizer "já vinculada a X"
        // em vez de afirmar em branco que todas já estão vinculadas.
        empreendimentoService.mapObrasToEmpreendimentos(undefined),
      ]);
      const obras = onlyObras(rows as ClassifiableProjectRow[]);
      setLinkableObras(obras
        .filter((p): p is ClassifiableProjectRow & { id: string } => !!p.id)
        .map(p => {
          const vinculo = empByProject[p.id];
          return {
            id: p.id,
            name: p.name,
            code: p.code ?? (p.settings as { code?: string } | null)?.code ?? null,
            organizationId: p.organization_id ?? (p.settings as { organizationId?: string } | null)?.organizationId ?? null,
            linkedEmpreendimentoId: vinculo?.id ?? null,
            linkedEmpreendimentoName: vinculo?.name ?? null,
          };
        }));
    } catch (err: any) {
      console.error('[VinculacoesTab] erro ao carregar obras vinculáveis:', err);
      setLinkableError(err?.message || 'Não foi possível carregar as obras.');
      setLinkableObras([]);
    } finally {
      setLinkableLoading(false);
    }
  }, []);

  const orgLabel = React.useCallback(
    (id?: string | null) => (id ? (organizations.find(o => o.id === id)?.name ?? 'Organização desconhecida') : 'Sem organização'),
    [organizations],
  );

  const availableObras = React.useMemo(() => {
    // Obras já vinculadas a ESTE empreendimento saem da lista; as vinculadas a
    // OUTRO ficam visíveis, porém desabilitadas e com o motivo à mostra.
    const used = new Set(snapshot?.obras.map(o => o.id) ?? []);
    const term = obraSearch.trim().toLowerCase();
    return linkableObras
      .filter(o => !used.has(o.id))
      .filter(o => !term
        || o.name.toLowerCase().includes(term)
        || (o.code ?? '').toLowerCase().includes(term)
        || orgLabel(o.organizationId).toLowerCase().includes(term))
      .sort((a, b) => {
        // Organização do empreendimento primeiro — é o caso normal.
        const aSame = a.organizationId === effectiveOrgId ? 0 : 1;
        const bSame = b.organizationId === effectiveOrgId ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return a.name.localeCompare(b.name);
      });
  }, [linkableObras, snapshot, obraSearch, effectiveOrgId, orgLabel]);

  const openProject = (projectId: string, view: string) => {
    if (!onOpenProject) {
      notify('Navegação indisponível nesta tela.', 'error');
      return;
    }
    void onOpenProject(projectId, view);
  };

  const handleUnlinkObra = async (link: EmpreendimentoLink) => {
    const ok = await confirm({
      title: 'Desvincular obra?',
      message: link.missing
        ? 'Este vínculo aponta para uma obra que não existe mais. Remover a referência?'
        : 'A obra continua existindo com todo o histórico financeiro e de contratos — só o vínculo com o empreendimento é removido.',
      variant: 'warning',
      confirmLabel: 'Desvincular',
    });
    if (!ok) return;

    setBusyId(link.id);
    try {
      if (link.towerId) {
        await empreendimentoLinksService.linkTowerObra(link.towerId, null);
      } else {
        await empreendimentoLinksService.setObraPrincipal(emp.id, null);
      }
      notify('Vínculo removido.');
      await load();
      onLinksChanged?.();
    } catch (err: any) {
      notify(`Erro ao desvincular: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleLinkObra = async (projectId: string) => {
    setBusyId(projectId);
    try {
      if (linkTarget.towerId) {
        await empreendimentoLinksService.linkTowerObra(linkTarget.towerId, projectId);
      } else {
        await empreendimentoLinksService.setObraPrincipal(emp.id, projectId);
      }
      setLinkSheetOpen(false);
      notify('Obra vinculada.');
      await load();
      onLinksChanged?.();
    } catch (err: any) {
      notify(`Erro ao vincular: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnlinkStudy = async (kind: 'PLANTA_IA' | 'ESTUDO_VIABILIDADE') => {
    const isPlanta = kind === 'PLANTA_IA';
    const ok = await confirm({
      title: isPlanta ? 'Desvincular o estudo da Planta IA?' : 'Desvincular o estudo de viabilidade?',
      message: 'As torres e unidades já materializadas continuam no empreendimento. O que para é a sincronização com o estudo.',
      variant: 'warning',
      confirmLabel: 'Desvincular',
    });
    if (!ok) return;

    setBusyId(kind);
    try {
      const ctx = { empreendimentoId: emp.id, organizationId: effectiveOrgId };
      if (isPlanta) await empreendimentoLinksService.linkPlantaStudy(null, ctx);
      else await empreendimentoLinksService.linkImovibStudy(null, ctx);
      notify('Vínculo removido.');
      await load();
      onLinksChanged?.();
    } catch (err: any) {
      notify(`Erro ao desvincular: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnlinkArea = async (areaProjectId: string) => {
    const ok = await confirm({
      title: 'Desvincular os quadros NBR 12721?',
      message: 'O projeto de áreas continua existindo — só deixa de estar associado a este empreendimento.',
      variant: 'warning',
      confirmLabel: 'Desvincular',
    });
    if (!ok) return;

    setBusyId(areaProjectId);
    try {
      await empreendimentoLinksService.linkAreaProject(areaProjectId, null, {
        empreendimentoId: emp.id,
        organizationId: effectiveOrgId,
      });
      notify('Vínculo removido.');
      await load();
      onLinksChanged?.();
    } catch (err: any) {
      notify(`Erro ao desvincular: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  // ── Centro de custo ────────────────────────────────────────────────────────
  // O vínculo é 1:1 (`uidx_cost_center_por_empreendimento`): o painel some assim
  // que existe um, e volta quando o usuário desvincula.
  const [ccSheetOpen, setCcSheetOpen] = React.useState(false);
  const [ccMode, setCcMode] = React.useState<'list' | 'create'>('list');
  const [ccOptions, setCcOptions] = React.useState<
    { id: string; code: string; name: string; grupo: string | null; organizationId: string | null }[]
  >([]);
  const [ccGroups, setCcGroups] = React.useState<{ id: string; code: string; name: string }[]>([]);
  const [ccLoading, setCcLoading] = React.useState(false);
  const [ccError, setCcError] = React.useState<string | null>(null);
  const [ccSearch, setCcSearch] = usePersistedState<string>('vinculacoes:ccSearch', '');
  const [ccForm, setCcForm] = React.useState<{ name: string; parentId: string; description: string }>(
    { name: '', parentId: '', description: '' },
  );

  const loadCostCenterOptions = React.useCallback(async () => {
    setCcLoading(true);
    setCcError(null);
    try {
      const [opts, groups] = await Promise.all([
        empreendimentoLinksService.listLinkableCostCenters(effectiveOrgId),
        // Sem organização resolvida não há onde criar — a lista de grupos fica
        // vazia e o formulário se explica em vez de gravar na org errada (regra #5).
        effectiveOrgId
          ? empreendimentoLinksService.listCostCenterGroups(effectiveOrgId)
          : Promise.resolve([]),
      ]);
      setCcOptions(opts);
      setCcGroups(groups);
    } catch (err: any) {
      console.error('[VinculacoesTab] erro ao carregar centros de custo:', err);
      setCcError(err?.message || 'Não foi possível carregar os centros de custo.');
      setCcOptions([]);
    } finally {
      setCcLoading(false);
    }
  }, [effectiveOrgId]);

  const openCostCenterSheet = (mode: 'list' | 'create') => {
    setCcMode(mode);
    setCcForm({ name: emp.name || '', parentId: '', description: '' });
    setCcSheetOpen(true);
    void loadCostCenterOptions();
  };

  const availableCostCenters = React.useMemo(() => {
    const term = ccSearch.trim().toLowerCase();
    if (!term) return ccOptions;
    return ccOptions.filter(c =>
      c.name.toLowerCase().includes(term)
      || c.code.toLowerCase().includes(term)
      || (c.grupo ?? '').toLowerCase().includes(term));
  }, [ccOptions, ccSearch]);

  const handleLinkCostCenter = async (costCenterId: string) => {
    setBusyId(costCenterId);
    try {
      await empreendimentoLinksService.linkCostCenter(costCenterId, {
        empreendimentoId: emp.id,
        organizationId: effectiveOrgId,
      });
      setCcSheetOpen(false);
      notify('Centro de custo vinculado.');
      await load();
      onLinksChanged?.();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateCostCenter = async () => {
    const name = ccForm.name.trim();
    if (!name) { notify('Informe o nome do centro de custo.', 'error'); return; }
    if (!effectiveOrgId) { notify('Selecione uma organização para criar o centro de custo.', 'error'); return; }

    setBusyId('CENTRO_CUSTO_NOVO');
    try {
      const criado = await empreendimentoLinksService.createCostCenter({
        empreendimentoId: emp.id,
        organizationId: effectiveOrgId,
        name,
        parentId: ccForm.parentId || null,
        description: ccForm.description.trim() || null,
      });
      setCcSheetOpen(false);
      notify(`Centro de custo "${criado.code} · ${criado.name}" criado e vinculado.`);
      await load();
      onLinksChanged?.();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnlinkCostCenter = async (link: EmpreendimentoLink) => {
    const ok = await confirm({
      title: 'Desvincular o centro de custo?',
      message: 'O centro de custo continua existindo com todos os lançamentos — só deixa de representar o caixa deste empreendimento.',
      variant: 'warning',
      confirmLabel: 'Desvincular',
    });
    if (!ok) return;

    setBusyId(link.id);
    try {
      await empreendimentoLinksService.unlinkCostCenter(link.id, {
        empreendimentoId: emp.id,
        organizationId: effectiveOrgId,
      });
      notify('Vínculo removido.');
      await load();
      onLinksChanged?.();
    } catch (err: any) {
      notify(`Erro ao desvincular: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const openLinkSheet = (towerId: string | null, towerName: string | null) => {
    setLinkTarget({ towerId, towerName });
    setLinkSheetOpen(true);
    void loadLinkableObras();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-[10px] p-4 flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
        <p className="text-sm font-normal text-red-700 flex-1">{error || 'Vínculos indisponíveis.'}</p>
        <button
          onClick={load}
          className="text-red-700 hover:text-red-900 text-sm font-medium p-1.5 hover:bg-red-100 rounded-lg transition-all"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const semObra = snapshot.obras.length === 0;
  // Torres multi-torre sem obra própria: o vínculo por torre é o correto nesse caso.
  const towersSemObra = towers.filter(t => !t.project_id);

  return (
    <div className="space-y-6">
      {/* Obras */}
      <LinkSection
        title="Obras"
        icon={<Building2 className="w-4 h-4" />}
        count={snapshot.obras.length}
        emptyIcon={<Building2 className="w-12 h-12" />}
        emptyTitle="Nenhuma obra vinculada"
        emptyHint="Vincule uma obra para ver orçamento, planejamento, contratos e financeiro aqui."
        action={
          <div className="flex items-center gap-2">
            {/* Secundário: a obra ainda não existe. Primário continua sendo vincular. */}
            <button
              onClick={() => setCreatingObra({ kind: 'EMPREENDIMENTO' })}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
            >
              <HardHat className="w-[15px] h-[15px]" />
              Criar obra
            </button>
            <button
              onClick={() => openLinkSheet(null, null)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
            >
              <Plus className="w-[15px] h-[15px]" />
              Vincular obra
            </button>
          </div>
        }
      >
        {snapshot.obras.map(o => (
          <LinkRow
            key={o.id}
            link={o}
            busy={busyId === o.id}
            onOpen={() => openProject(o.id, 'project-overview')}
            onUnlink={() => handleUnlinkObra(o)}
          />
        ))}
      </LinkSection>

      {/* Torres sem obra — só faz sentido em empreendimento multi-torre. */}
      {towersSemObra.length > 0 && towers.length > 1 && (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <span className="text-gray-400"><LayoutGrid className="w-4 h-4" /></span>
            <h3 className="text-xs font-semibold text-gray-500 flex-1">Torres sem obra própria</h3>
            <span className="text-sm font-normal text-amber-600">{towersSemObra.length}</span>
          </div>
          {towersSemObra.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-blue-50/50 transition-colors">
              <p className="text-sm font-normal text-gray-700 flex-1 truncate">Torre {t.name}</p>
              <button
                onClick={() => setCreatingObra({ kind: 'TORRE', towerId: t.id, towerName: t.name })}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium p-1.5 hover:bg-gray-100 rounded-lg transition-all"
              >
                Criar obra
              </button>
              <button
                onClick={() => openLinkSheet(t.id, t.name)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
              >
                Vincular obra
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Orçamento */}
      <LinkSection
        title="Orçamento"
        icon={<Calculator className="w-4 h-4" />}
        count={snapshot.orcamentos.length}
        emptyIcon={<Calculator className="w-12 h-12" />}
        emptyTitle="Nenhum orçamento vinculado"
        emptyHint={semObra
          ? 'Vincule uma obra primeiro — o orçamento se pendura nela.'
          : 'A obra vinculada ainda não tem orçamento associado.'}
      >
        {snapshot.orcamentos.map(o => (
          <LinkRow key={o.id} link={o} onOpen={() => openProject(o.id, 'analytic')} />
        ))}
      </LinkSection>

      {/* Planejamento */}
      <LinkSection
        title="Planejamento"
        icon={<CalendarRange className="w-4 h-4" />}
        count={snapshot.planejamentos.length}
        emptyIcon={<CalendarRange className="w-12 h-12" />}
        emptyTitle="Nenhum planejamento vinculado"
        emptyHint={semObra
          ? 'Vincule uma obra primeiro — o planejamento se pendura nela.'
          : 'A obra vinculada ainda não tem planejamento associado.'}
      >
        {snapshot.planejamentos.map(p => (
          <LinkRow key={p.id} link={p} onOpen={() => openProject(p.id, 'planning-view')} />
        ))}
      </LinkSection>

      {/* Áreas NBR 12721 */}
      <LinkSection
        title="Áreas NBR 12721"
        icon={<Ruler className="w-4 h-4" />}
        count={snapshot.areas.length}
        emptyIcon={<Ruler className="w-12 h-12" />}
        emptyTitle="Nenhum projeto de áreas"
        emptyHint="Crie os quadros NBR 12721 pelo módulo de Áreas para vê-los aqui."
      >
        {snapshot.areas.map(a => (
          <LinkRow
            key={a.id}
            link={a}
            busy={busyId === a.id}
            onOpen={onChangeView ? () => onChangeView('area-engine') : undefined}
            onUnlink={() => handleUnlinkArea(a.id)}
          />
        ))}
      </LinkSection>

      {/* Planta IA e Viabilidade */}
      <LinkSection
        title="Planta IA e Viabilidade"
        icon={<LayoutGrid className="w-4 h-4" />}
        count={snapshot.plantaIA.length + snapshot.viabilidade.length}
        emptyIcon={<LayoutGrid className="w-12 h-12" />}
        emptyTitle="Nenhum estudo vinculado"
        emptyHint="Vincule um estudo da Planta IA ou da Viabilidade na edição do empreendimento."
      >
        {snapshot.plantaIA.map(s => (
          <LinkRow
            key={s.id}
            link={s}
            busy={busyId === 'PLANTA_IA'}
            onOpen={onChangeView ? () => onChangeView('planta-ai') : undefined}
            onUnlink={() => handleUnlinkStudy('PLANTA_IA')}
          />
        ))}
        {snapshot.viabilidade.map(s => (
          <LinkRow
            key={s.id}
            link={s}
            busy={busyId === 'ESTUDO_VIABILIDADE'}
            onOpen={onChangeView ? () => onChangeView('imovib') : undefined}
            onUnlink={() => handleUnlinkStudy('ESTUDO_VIABILIDADE')}
          />
        ))}
      </LinkSection>

      {/* Contratos */}
      <LinkSection
        title="Contratos"
        icon={<FileSignature className="w-4 h-4" />}
        count={snapshot.contratos.length}
        emptyIcon={<FileSignature className="w-12 h-12" />}
        emptyTitle="Nenhum contrato"
        emptyHint={semObra
          ? 'Vincule uma obra primeiro — os contratos chegam por ela.'
          : 'As obras vinculadas ainda não têm contratos.'}
      >
        {snapshot.contratos.slice(0, 10).map(c => (
          <LinkRow
            key={c.id}
            link={c}
            // Não há como abrir UM contrato hoje (o shell de Contratos não expõe
            // seleção por id) — a navegação leva à lista escopada na obra.
            onOpen={c.parentObraId ? () => openProject(c.parentObraId as string, 'supplies-contracts') : undefined}
            right={
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-sm font-normal ${STATUS_COLORS[String(c.meta?.status ?? '')] || 'text-gray-600'}`}>
                  {String(c.meta?.status ?? '—')}
                </span>
                <span className="text-sm font-medium text-gray-800">{formatMoney(Number(c.meta?.valor) || 0)}</span>
              </div>
            }
          />
        ))}
        {snapshot.contratos.length > 10 && (
          <p className="px-4 py-2.5 text-sm font-normal text-gray-400">
            + {snapshot.contratos.length - 10} contrato(s). Abra a obra para ver a lista completa.
          </p>
        )}
      </LinkSection>

      {/* Centro de Custo — a âncora contábil do empreendimento (1:1). */}
      <LinkSection
        title="Centro de Custo"
        icon={<Coins className="w-4 h-4" />}
        count={snapshot.centrosCusto.length}
        emptyIcon={<Coins className="w-12 h-12" />}
        emptyTitle="Nenhum centro de custo vinculado"
        emptyHint="Vincule um centro de custo para segregar o caixa deste empreendimento — ou crie um novo já vinculado."
        action={snapshot.centrosCusto.length === 0 ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openCostCenterSheet('create')}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
            >
              <Plus className="w-[15px] h-[15px]" />
              Criar centro de custo
            </button>
            <button
              onClick={() => openCostCenterSheet('list')}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
            >
              <Plus className="w-[15px] h-[15px]" />
              Vincular centro de custo
            </button>
          </div>
        ) : undefined}
      >
        {snapshot.centrosCusto.map(c => (
          <LinkRow
            key={c.id}
            link={c}
            busy={busyId === c.id}
            onUnlink={() => handleUnlinkCostCenter(c)}
            unlinkTitle="Desvincular centro de custo"
          />
        ))}
      </LinkSection>

      {/* Financeiro */}
      <LinkSection
        title="Financeiro"
        icon={<Wallet className="w-4 h-4" />}
        count={snapshot.financeiro.rows.length}
        emptyIcon={<Wallet className="w-12 h-12" />}
        emptyTitle="Nenhum lançamento"
        emptyHint={semObra
          ? 'Vincule uma obra primeiro — os lançamentos chegam por ela.'
          : 'As obras vinculadas ainda não têm lançamentos financeiros.'}
      >
        <div className="flex items-center gap-6 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <span className="text-sm font-normal text-gray-500">
            Entradas <span className="font-medium text-emerald-700">{formatMoney(snapshot.financeiro.totalCredit)}</span>
          </span>
          <span className="text-sm font-normal text-gray-500">
            Saídas <span className="font-medium text-red-600">{formatMoney(snapshot.financeiro.totalDebit)}</span>
          </span>
        </div>
        {snapshot.financeiro.rows.map(t => (
          <LinkRow
            key={t.id}
            link={t}
            onOpen={t.parentObraId ? () => openProject(t.parentObraId as string, 'project-financial') : undefined}
            right={
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-sm font-normal ${STATUS_COLORS[String(t.meta?.businessStatus ?? '')] || 'text-gray-600'}`}>
                  {String(t.meta?.businessStatus ?? '—')}
                </span>
                <span className={`text-sm font-medium ${t.meta?.direction === 'CREDIT' ? 'text-emerald-700' : 'text-gray-800'}`}>
                  {formatMoney(Number(t.meta?.valor) || 0)}
                </span>
              </div>
            }
          />
        ))}
      </LinkSection>

      <div className="flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 h-9 px-3.5 text-gray-500 hover:text-gray-700 rounded-[6px] hover:bg-gray-100 font-medium text-[13px] transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar vínculos
        </button>
      </div>

      {/* Vincular obra — painel lateral (UI_PATTERNS: Sheet, não modal). */}
      <Sheet open={linkSheetOpen} onClose={() => setLinkSheetOpen(false)} size="lg">
        <SheetHeader onClose={() => setLinkSheetOpen(false)}>
          <SheetTitle>
            {linkTarget.towerId ? `Vincular obra à torre ${linkTarget.towerName}` : 'Vincular obra principal'}
          </SheetTitle>
          <SheetDescription>
            {linkTarget.towerId
              ? 'A obra da torre é o vínculo correto em empreendimento multi-torre.'
              : 'A obra principal é usada quando o empreendimento tem uma obra só.'}
          </SheetDescription>
        </SheetHeader>
        {/* p-6: o SheetPanel não traz padding próprio — sem isso a busca cola na borda. */}
        <SheetPanel className="p-6 space-y-4">
          {/* Busca — a lista cobre todas as organizações do usuário, então pode ser longa. */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={obraSearch}
              onChange={e => setObraSearch(e.target.value)}
              placeholder="Buscar por nome, código ou organização..."
              className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          {linkableError && (
            <div className="bg-red-50 border border-red-100 rounded-[10px] p-4 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-sm font-normal text-red-700 flex-1">{linkableError}</p>
              <button
                onClick={() => void loadLinkableObras()}
                className="text-red-700 hover:text-red-900 text-sm font-medium p-1.5 hover:bg-red-100 rounded-lg transition-all"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {linkableLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Carregando obras...</p>
            </div>
          ) : availableObras.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma obra disponível</h3>
              {/* A mensagem distingue os três casos reais — antes afirmava "todas já
                  vinculadas" sem saber, porque só conhecia os vínculos DESTE empreendimento. */}
              <p className="text-sm text-gray-500">
                {obraSearch.trim()
                  ? 'Nenhuma obra corresponde à busca.'
                  : linkableObras.length === 0
                    ? 'Você ainda não tem obras cadastradas nas suas organizações.'
                    : 'Todas as suas obras já estão vinculadas a este empreendimento.'}
              </p>
              {!obraSearch.trim() && (
                <button
                  onClick={() => {
                    setLinkSheetOpen(false);
                    setCreatingObra(linkTarget.towerId
                      ? { kind: 'TORRE', towerId: linkTarget.towerId, towerName: linkTarget.towerName ?? '' }
                      : { kind: 'EMPREENDIMENTO' });
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                >
                  <HardHat className="w-[15px] h-[15px]" />
                  Criar obra
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-[10px] border border-gray-100 overflow-hidden">
              {availableObras.map(p => {
                // Uma obra em dois empreendimentos deixaria o mapa obra→empreendimento
                // ambíguo (quem lê depois vê só um dos dois) — por isso é bloqueio, não aviso.
                const jaVinculada = !!p.linkedEmpreendimentoId;
                const outraOrg = p.organizationId !== effectiveOrgId;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleLinkObra(p.id)}
                    disabled={busyId === p.id || jaVinculada}
                    title={jaVinculada ? `Já vinculada a "${p.linkedEmpreendimentoName}"` : undefined}
                    className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-blue-50/50 transition-colors text-left disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal text-gray-700 truncate">
                        {p.name}{p.code ? ` · ${p.code}` : ''}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-normal text-gray-400 truncate">{orgLabel(p.organizationId)}</span>
                        {outraOrg && <span className="text-sm font-normal text-amber-600 shrink-0">outra organização</span>}
                      </div>
                    </div>
                    <span className={`text-sm font-medium shrink-0 ${jaVinculada ? 'text-gray-400' : 'text-blue-600'}`}>
                      {busyId === p.id
                        ? 'Vinculando...'
                        : jaVinculada
                          ? `Em "${p.linkedEmpreendimentoName}"`
                          : 'Vincular'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </SheetPanel>
      </Sheet>

      {/* Centro de custo — vincular um existente ou criar um novo já vinculado. */}
      <Sheet open={ccSheetOpen} onClose={() => setCcSheetOpen(false)} size="lg">
        <SheetHeader onClose={() => setCcSheetOpen(false)}>
          <SheetTitle>
            {ccMode === 'create' ? 'Criar centro de custo' : 'Vincular centro de custo'}
          </SheetTitle>
          <SheetDescription>
            {ccMode === 'create'
              ? 'O centro de custo nasce já vinculado a este empreendimento. O código é gerado automaticamente.'
              : 'A despesa lançada neste centro de custo passa a ser do caixa deste empreendimento.'}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="p-6 space-y-4">
          {ccError && (
            <div className="bg-red-50 border border-red-100 rounded-[10px] p-4 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-sm font-normal text-red-700 flex-1">{ccError}</p>
              <button
                onClick={() => void loadCostCenterOptions()}
                className="text-red-700 hover:text-red-900 text-sm font-medium p-1.5 hover:bg-red-100 rounded-lg transition-all"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {ccMode === 'create' ? (
            <>
              {!effectiveOrgId && (
                <div className="bg-amber-50 border border-amber-100 rounded-[10px] p-4 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm font-normal text-amber-700">
                    Este empreendimento está sem organização. Escolha uma organização no seletor do topo para criar o centro de custo.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nome</label>
                <input
                  value={ccForm.name}
                  onChange={e => setCcForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Residencial Bella Vista"
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Grupo</label>
                <select
                  value={ccForm.parentId}
                  onChange={e => setCcForm(f => ({ ...f, parentId: e.target.value }))}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                >
                  <option value="">Empreendimentos (criado se não existir)</option>
                  {ccGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.code} · {g.name}</option>
                  ))}
                </select>
                {/* O grupo não é enfeite: a árvore tem 2 níveis e só o filho recebe
                    lançamento — solto no nível 1, o centro de custo viraria família de despesa. */}
                <p className="mt-1.5 text-sm font-normal text-gray-400">
                  O centro de custo fica dentro de um grupo — é o nível que recebe lançamento.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Descrição</label>
                <input
                  value={ccForm.description}
                  onChange={e => setCcForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Opcional"
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCcMode('list')}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                >
                  Vincular um existente
                </button>
                <button
                  onClick={() => void handleCreateCostCenter()}
                  disabled={busyId === 'CENTRO_CUSTO_NOVO' || !effectiveOrgId}
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-[15px] h-[15px]" />
                  {busyId === 'CENTRO_CUSTO_NOVO' ? 'Criando...' : 'Criar e vincular'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={ccSearch}
                  onChange={e => setCcSearch(e.target.value)}
                  placeholder="Buscar por código, nome ou grupo..."
                  className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {ccLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Carregando centros de custo...</p>
                </div>
              ) : availableCostCenters.length === 0 ? (
                <div className="text-center py-12">
                  <Coins className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum centro de custo disponível</h3>
                  <p className="text-sm text-gray-500">
                    {ccSearch.trim()
                      ? 'Nenhum centro de custo corresponde à busca.'
                      : 'Só aparecem aqui os centros de custo dentro de um grupo e ainda sem empreendimento.'}
                  </p>
                  {!ccSearch.trim() && (
                    <button
                      onClick={() => setCcMode('create')}
                      className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                      <Plus className="w-[15px] h-[15px]" />
                      Criar centro de custo
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="rounded-[10px] border border-gray-100 overflow-hidden">
                    {availableCostCenters.map(c => (
                      <button
                        key={c.id}
                        onClick={() => void handleLinkCostCenter(c.id)}
                        disabled={busyId === c.id}
                        className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-blue-50/50 transition-colors text-left disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      >
                        <Coins className="w-4 h-4 text-gray-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-normal text-gray-700 truncate">{c.code} · {c.name}</p>
                          <span className="text-sm font-normal text-gray-400 truncate">{c.grupo || 'Sem grupo'}</span>
                        </div>
                        <span className="text-sm font-medium text-blue-600 shrink-0">
                          {busyId === c.id ? 'Vinculando...' : 'Vincular'}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => setCcMode('create')}
                      className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
                    >
                      <Plus className="w-[15px] h-[15px]" />
                      Criar um novo
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </SheetPanel>
      </Sheet>

      {creatingObra && (
        <CriarObraDoEmpreendimento
          empreendimento={emp}
          target={creatingObra}
          onClose={() => setCreatingObra(null)}
          onCreated={async (_, projectName) => {
            setCreatingObra(null);
            notify(`Obra "${projectName}" criada e vinculada.`);
            await load();
            onLinksChanged?.();
          }}
          onError={message => { setCreatingObra(null); notify(message, 'error'); }}
        />
      )}

      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default VinculacoesTab;
