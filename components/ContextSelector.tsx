// components/ContextSelector.tsx
//
// Seletor de contexto do topo, como accordion multi-nível com ícone nos nós-pai:
//
//   Organização (N1, selecionável)
//     └ Empreendimento (N2, só agrupa)
//          └ Obra (N3, selecionável)
//     └ Sem empreendimento (N2) → obras sem vínculo
//     └ Empresas (N2) → empresas da organização (N3, selecionáveis)
//
// Antes disto o painel era uma lista PLANA de três blocos soltos (organizações,
// "sair da obra", empresas) dentro do `Layout.tsx` — e as obras não apareciam:
// dava para SAIR de uma obra pelo topo, nunca para ENTRAR nela.
//
// O empreendimento é apenas agrupador: não existe "empreendimento ativo" no
// sistema e este componente não cria um. Só organização, empresa e obra são
// contexto de verdade (`store/useStore.ts`).
//
// UI: docs/ui_ux_guia_unificado.md §3 (busca persistida), §11/§12 (loading/vazio),
// §16 (radius).
import React from 'react';
import {
  Building2, Landmark, HardHat, Briefcase, FolderOpen, Layers,
  ChevronRight, Search, Loader2, AlertCircle,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { usePersistedState } from './ui/TableUtils';
import { useContextTree, ContextOrgNode, ContextObraNode } from '../hooks/useContextTree';

interface Props {
  /** Nome da obra carregada, para o rótulo do botão. Vem do Layout. */
  projectName?: string;
  className?: string;
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ContextSelector: React.FC<Props> = ({ projectName, className }) => {
  const organizations = useStore(s => s.organizations);
  const activeOrganizationId = useStore(s => s.activeOrganizationId);
  const setActiveOrganizationId = useStore(s => s.setActiveOrganizationId);
  const companies = useStore(s => s.companies);
  const activeEmpresaId = useStore(s => s.activeEmpresaId);
  const setActiveEmpresaId = useStore(s => s.setActiveEmpresaId);
  const projectId = useStore(s => s.projectId);
  const setProjectId = useStore(s => s.setProjectId);

  const [isOpen, setIsOpen] = React.useState(false);
  // A árvore custa quatro queries; só vale carregar para quem abre o seletor.
  const [everOpened, setEverOpened] = React.useState(false);
  const { orgs, loading, error } = useContextTree(everOpened);

  // §3: busca persistida. O campo fica no topo do painel, sempre visível, então
  // um termo que sobrevive ao fechamento nunca esconde o recorte do usuário.
  const [search, setSearch] = usePersistedState<string>('contextSelector:search', '');
  const [expanded, setExpanded] = usePersistedState<Record<string, boolean>>('contextSelector:expanded', {});
  const rootRef = React.useRef<HTMLDivElement>(null);

  const activeOrg = organizations.find(o => o.id === activeOrganizationId) ?? null;
  const activeEmpresaFromStore = companies.find(c => c.id === activeEmpresaId) ?? null;
  // Escolher empresa de outra organização dispara um novo fetchCompanies; até ele
  // voltar, `companies` ainda é o da org anterior. A árvore cobre esse intervalo
  // para o rótulo não piscar "Todas as organizações" no meio da troca.
  const activeEmpresaFromTree = React.useMemo(() => {
    if (!activeEmpresaId || activeEmpresaFromStore) return null;
    for (const org of orgs) {
      const found = org.empresas.find(e => e.id === activeEmpresaId);
      if (found) return found;
    }
    return null;
  }, [activeEmpresaId, activeEmpresaFromStore, orgs]);

  const empresaLabel = activeEmpresaFromStore?.nome_fantasia
    ?? activeEmpresaFromStore?.razao_social
    ?? activeEmpresaFromTree?.name;
  const empresaCor = activeEmpresaFromStore?.cor_sistema ?? activeEmpresaFromTree?.cor ?? null;

  const toggle = React.useCallback((key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, [setExpanded]);

  // Fechar ao clicar fora e no Escape — o painel antigo não fazia nem um nem outro.
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Ao abrir, revela o caminho do contexto ativo: a organização e, se há obra
  // carregada, o empreendimento dela. Sem isso o usuário abre o painel e não vê
  // onde está.
  React.useEffect(() => {
    if (!isOpen || orgs.length === 0) return;
    setExpanded(prev => {
      const next = { ...prev };
      if (activeOrganizationId) next[`org:${activeOrganizationId}`] = true;
      if (projectId) {
        for (const org of orgs) {
          const emp = org.empreendimentos.find(e => e.obras.some(o => o.id === projectId));
          if (emp) { next[`org:${org.id}`] = true; next[`emp:${emp.id}`] = true; break; }
          if (org.obrasSemEmpreendimento.some(o => o.id === projectId)) {
            next[`org:${org.id}`] = true; next[`org:${org.id}:sem-emp`] = true; break;
          }
        }
      }
      return next;
    });
  }, [isOpen, orgs, activeOrganizationId, projectId, setExpanded]);

  // ── Filtro de busca ────────────────────────────────────────────────────────
  // Casa em qualquer nível; um nó-pai sobrevive se ele mesmo casa (levando todos
  // os filhos junto) ou se algum descendente casa.
  const termo = normalize(search.trim());
  const filteredOrgs = React.useMemo<ContextOrgNode[]>(() => {
    if (!termo) return orgs;
    const hit = (s: string) => normalize(s).includes(termo);
    return orgs.reduce<ContextOrgNode[]>((acc, org) => {
      const orgHit = hit(org.name);
      const empreendimentos = org.empreendimentos
        .map(e => (hit(e.name) ? e : { ...e, obras: e.obras.filter(o => hit(o.name)) }))
        .filter(e => hit(e.name) || e.obras.length > 0);
      const obrasSemEmpreendimento = org.obrasSemEmpreendimento.filter(o => hit(o.name));
      const empresas = org.empresas.filter(e => hit(e.name));
      if (orgHit) { acc.push(org); return acc; }
      if (empreendimentos.length || obrasSemEmpreendimento.length || empresas.length) {
        acc.push({ ...org, empreendimentos, obrasSemEmpreendimento, empresas });
      }
      return acc;
    }, []);
  }, [orgs, termo]);

  // Com busca ativa tudo aparece aberto, senão o usuário veria só os nós-pai e
  // teria de expandir um a um para achar o que ele acabou de procurar.
  const isExpanded = (key: string) => (termo ? true : !!expanded[key]);

  // ── Ações ──────────────────────────────────────────────────────────────────
  const close = () => setIsOpen(false);

  const selectOrg = (id: string | null) => { setActiveOrganizationId(id); close(); };

  // Escolher um filho fixa o ancestral: a obra foi clicada DENTRO de um nó de
  // organização, então as duas coisas passam a valer. (Isso não contradiz
  // `useOrgContext`, onde a obra não DERIVA a organização — aqui as duas são
  // definidas explicitamente pelo clique.) A ordem importa:
  // `setActiveOrganizationId` zera a empresa ativa, então ele vem primeiro.
  const selectObra = (orgId: string, obraId: string) => {
    if (orgId !== activeOrganizationId) setActiveOrganizationId(orgId);
    setProjectId(obraId);
    close();
  };

  const selectEmpresa = (orgId: string, empresaId: string) => {
    if (orgId !== activeOrganizationId) setActiveOrganizationId(orgId);
    setActiveEmpresaId(empresaId);
    close();
  };

  const sairDaObra = () => { setProjectId(null); close(); };

  // ── Blocos de render ───────────────────────────────────────────────────────
  const obraRow = (org: ContextOrgNode, obra: ContextObraNode) => {
    // A torre só vira sufixo quando acrescenta informação: obra chamada
    // "Torre A" não precisa da etiqueta "Torre A" ao lado dela.
    const torre = obra.towerName
      && !normalize(obra.name).includes(normalize(obra.towerName))
      ? obra.towerName : null;
    return (
      <button
        key={obra.id}
        type="button"
        role="menuitem"
        onClick={() => selectObra(org.id, obra.id)}
        className={`flex w-full items-center gap-2 py-2 pl-3 pr-3 text-left text-sm hover:bg-slate-50 ${obra.id === projectId ? 'bg-slate-100 text-slate-950 font-medium' : 'text-slate-700'}`}
        title={obra.towerName ? `${obra.name} — Torre ${obra.towerName}` : obra.name}
      >
        <HardHat className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate">{obra.name}</span>
        {torre && <span className="shrink-0 text-xs text-slate-400">Torre {torre}</span>}
      </button>
    );
  };

  /** Linha-guia dos filhos de um nó de 2º nível, no molde do menu lateral. */
  const childrenWrap = (children: React.ReactNode) => (
    <div className="ml-9 border-l border-slate-100">{children}</div>
  );

  const groupRow = (
    key: string, label: string, Icon: React.ElementType, count: number, children: React.ReactNode,
  ) => (
    <div key={key}>
      <button
        type="button"
        onClick={() => toggle(key)}
        aria-expanded={isExpanded(key)}
        className="flex w-full items-center gap-2 py-2 pl-7 pr-3 text-left text-sm text-slate-700 hover:bg-slate-50"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isExpanded(key) ? 'rotate-90' : ''}`} />
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs text-slate-400">{count}</span>
      </button>
      {isExpanded(key) && childrenWrap(children)}
    </div>
  );

  const orgBlock = (org: ContextOrgNode) => {
    const orgKey = `org:${org.id}`;
    const temFilhos = org.empreendimentos.length > 0
      || org.obrasSemEmpreendimento.length > 0
      || org.empresas.length > 0;
    return (
      <div key={org.id} className="border-b border-slate-100 last:border-b-0">
        <div className={`flex w-full items-center ${org.id === activeOrganizationId ? 'bg-slate-100' : ''}`}>
          <button
            type="button"
            onClick={() => toggle(orgKey)}
            aria-expanded={isExpanded(orgKey)}
            aria-label={isExpanded(orgKey) ? `Recolher ${org.name}` : `Expandir ${org.name}`}
            disabled={!temFilhos}
            className="flex h-9 w-7 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded(orgKey) ? 'rotate-90' : ''}`} />
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => selectOrg(org.id)}
            className={`flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 text-left text-sm hover:bg-slate-50 ${org.id === activeOrganizationId ? 'text-slate-950 font-medium' : 'text-slate-700'}`}
            title={`Usar ${org.name} como contexto`}
          >
            <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
          </button>
        </div>
        {isExpanded(orgKey) && (
          <div className="pb-1">
            {org.empreendimentos.map(emp => groupRow(
              `emp:${emp.id}`, emp.name, Landmark, emp.obras.length,
              emp.obras.length > 0
                ? <>{emp.obras.map(o => obraRow(org, o))}</>
                : <div className="py-2 pl-3 pr-3 text-xs text-slate-400">Nenhuma obra vinculada</div>,
            ))}
            {org.obrasSemEmpreendimento.length > 0 && groupRow(
              `${orgKey}:sem-emp`, 'Sem empreendimento', FolderOpen, org.obrasSemEmpreendimento.length,
              <>{org.obrasSemEmpreendimento.map(o => obraRow(org, o))}</>,
            )}
            {org.empresas.length > 0 && groupRow(
              `${orgKey}:empresas`, 'Empresas', Briefcase, org.empresas.length,
              <>{org.empresas.map(c => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  onClick={() => selectEmpresa(org.id, c.id)}
                  className={`flex w-full items-center gap-2 py-2 pl-3 pr-3 text-left text-sm hover:bg-slate-50 ${c.id === activeEmpresaId ? 'bg-slate-100 text-slate-950 font-medium' : 'text-slate-700'}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.cor ?? '#2563EB' }} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </button>
              ))}</>,
            )}
            {!temFilhos && (
              <div className="py-2 pl-12 pr-3 text-xs text-slate-400">
                Nenhum empreendimento, obra ou empresa
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => { setIsOpen(o => !o); setEverOpened(true); }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 hover:bg-slate-50"
        title="Organização, empreendimento, empresa ou obra ativa"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: empresaCor ?? '#2563EB' }}
        />
        <span className="min-w-0 flex-1 truncate">
          {/* Do mais específico para o mais amplo. Sem nenhuma seleção e
              sem org ativa, o contexto REAL é "Todas as organizações" —
              dizer isso é melhor que o genérico "Contexto atual". */}
          {/* A OBRA vem depois da organização, não antes: com uma obra
              aberta, escolher "Todas as organizações" mostrava o nome
              da obra ("Coronel Lambert 345") e o usuário não via que a
              escolha tinha valido — parecia que o clique não funcionou.
              A obra continua visível na linha "Obra" do dropdown. */}
          {empresaLabel
            ?? activeOrg?.name
            ?? (organizations.length > 1 ? 'Todas as organizações' : undefined)
            ?? (projectId ? projectName : undefined)
            ?? 'Contexto atual'}
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {/* O painel tem largura mínima maior que a do botão em telas estreitas;
          ancorado à esquerda ele vazava para fora da viewport no celular, então
          abaixo de `sm` ele cresce a partir da borda direita do botão. */}
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-full min-w-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl sm:left-0 sm:right-auto"
        >
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar organização ou obra"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {organizations.length > 1 && (
              // Visão consolidada: activeOrganizationId null (sentinela 'TODAS' no
              // localStorage). As telas que leem por org deixam a RLS decidir.
              <button
                type="button"
                role="menuitem"
                onClick={() => selectOrg(null)}
                className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${!activeOrganizationId ? 'bg-slate-100 text-slate-950 font-medium' : 'text-slate-700'}`}
              >
                <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">Todas as organizações</span>
              </button>
            )}

            {/* Saída da obra. Antes do "Coronel Lambert 345" ficar preso na
                tela, o `projectId` só era limpo em três lugares: um botão
                dentro de UMA tela, o excluir-obra (destrutivo) e um caminho
                interno de sincronização. Como ele é persistido em
                localStorage, quem abrisse uma obra ficava nela para sempre —
                e telas como a Gestão Financeira mostram conteúdo
                completamente diferente conforme esse estado invisível. */}
            {projectId && (
              <button
                type="button"
                role="menuitem"
                onClick={sairDaObra}
                className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                title="Sai da obra e volta à visão consolidada, sem apagar nada"
              >
                <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">Consolidado (sair da obra)</span>
              </button>
            )}

            {loading && orgs.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando contexto...
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 px-3 py-4 text-sm text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {!loading && !error && filteredOrgs.length === 0 && (
              <div className="px-3 py-4 text-sm text-slate-500">
                {termo ? 'Nada encontrado para esta busca.' : 'Nenhuma organização disponível.'}
              </div>
            )}
            {filteredOrgs.map(orgBlock)}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContextSelector;
