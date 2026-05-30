import React from 'react';
import { LayoutDashboard, Calculator, PieChart, Settings, FolderOpen, LogOut, Loader2, Cloud, FileText, Table2, Building2, Menu, X, Save, Trash2, User, Users, Database, BookOpen, Calendar, Sun, ChevronLeft, ChevronRight, DollarSign, TrendingUp, TrendingDown, Shield, Truck, Package, Bell, Zap, Briefcase, Trophy, MessageSquare, BarChart3, Activity, Link2, Clock, Target, Percent, Receipt, ClipboardList, Search, Moon, Layers, CheckSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import NotificationPanel from './NotificationPanel';
import { notificationService } from '../services/notificationService';
import { viewUrl } from '../lib/tabRouter';

interface LayoutProps {
  children: React.ReactNode;
  activeView: string;
  onChangeView: (view: string) => void;
  projectName: string;
  onEditProject: () => void;
  onSaveProject: () => void;
  onDeleteProject: () => void;
  isSaving?: boolean;
  profile?: { group: string; role: string; email?: string };
  onNavigate?: (link: string) => void;
  isNotificationOpen?: boolean;
  setIsNotificationOpen?: (isOpen: boolean) => void;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  activeView,
  onChangeView,
  projectName,
  onEditProject,
  onSaveProject,
  onDeleteProject,
  isSaving,
  profile = { group: 'USUARIO', role: 'ADMINISTRADOR' },
  onNavigate,
  isNotificationOpen = false,
  setIsNotificationOpen = () => { }
}) => {
  const { logout, companies, activeEmpresaId, setActiveEmpresaId } = useStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isEmpresaDropdownOpen, setIsEmpresaDropdownOpen] = React.useState(false);
  const activeEmpresa = companies.find(c => c.id === activeEmpresaId) ?? null;

  // Módulos habilitados para a empresa ativa.
  // Fallback: tudo true quando não há empresa selecionada (compatibilidade).
  const mod = React.useMemo(() => {
    const m = activeEmpresa?.modulos_habilitados;
    if (!m) return { obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true };
    return m;
  }, [activeEmpresa]);
  const isDev = profile.group === 'DESENVOLVEDOR';
  const [isDarkMode, setIsDarkMode] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('sidebar_theme');
    return stored ? stored === 'dark' : true;
  });
  React.useEffect(() => {
    localStorage.setItem('sidebar_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const t = isDarkMode
    ? {
        shell: 'bg-[#1a1a1a] text-white border-white/5',
        searchWrap: 'bg-[#262626] border-transparent focus-within:border-white/10',
        searchText: 'text-gray-200 placeholder:text-gray-500',
        searchIcon: 'text-gray-500',
        itemText: 'text-gray-300',
        itemHover: 'hover:text-white hover:bg-white/5',
        itemActive: 'bg-white/10 text-white',
        itemIcon: 'text-gray-400 group-hover:text-gray-200',
        itemIconActive: 'text-white',
        groupLabel: 'text-gray-500',
        divider: 'bg-white/5',
        dropdownBorder: 'border-white/5',
        dropdownGroupLabel: 'text-gray-600',
        footerBorder: 'border-white/5',
        userName: 'text-white',
        userEmail: 'text-gray-500',
        signOut: 'text-gray-400 hover:text-white hover:bg-white/5',
        toggleTrack: 'bg-orange-500',
        badgeBgRing: 'border-[#1a1a1a]',
        sunIcon: 'text-gray-500',
        moonIcon: 'text-orange-400',
      }
    : {
        shell: 'bg-white text-gray-800 border-gray-200',
        searchWrap: 'bg-gray-100 border-transparent focus-within:border-gray-300',
        searchText: 'text-gray-800 placeholder:text-gray-400',
        searchIcon: 'text-gray-400',
        itemText: 'text-gray-700',
        itemHover: 'hover:text-gray-900 hover:bg-gray-100',
        itemActive: 'bg-gray-200/70 text-gray-900',
        itemIcon: 'text-gray-500 group-hover:text-gray-700',
        itemIconActive: 'text-gray-900',
        groupLabel: 'text-gray-400',
        divider: 'bg-gray-200',
        dropdownBorder: 'border-gray-200',
        dropdownGroupLabel: 'text-gray-400',
        footerBorder: 'border-gray-200',
        userName: 'text-gray-900',
        userEmail: 'text-gray-500',
        signOut: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
        toggleTrack: 'bg-orange-500',
        badgeBgRing: 'border-white',
        sunIcon: 'text-orange-400',
        moonIcon: 'text-gray-400',
      };
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isPortalsOpen, setIsPortalsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isLaborOpen, setIsLaborOpen] = React.useState(() => activeView.startsWith('labor-'));
  React.useEffect(() => { if (activeView.startsWith('labor-')) setIsLaborOpen(true); }, [activeView]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [toast, setToast] = React.useState<{ title: string; message: string } | null>(null);
  const toastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUnreadCount = React.useCallback(async () => {
    if (!profile.email && profile.group !== 'DESENVOLVEDOR') return;
    const isDev = profile.group === 'DESENVOLVEDOR';
    const emailToFilter = isDev ? undefined : profile.email;

    try {
      const notifications = await notificationService.listNotifications(emailToFilter);
      const count = notifications.filter(n => !n.isRead).length;
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  }, [profile.email, profile.group]);

  React.useEffect(() => {
    if (!profile.email && profile.group !== 'DESENVOLVEDOR') return;

    fetchUnreadCount();

    // Listen to local updates for immediate sync
    const handleLocalUpdate = () => {
      fetchUnreadCount();
    };
    window.addEventListener('notifications_updated', handleLocalUpdate);

    // Periodic fallback polling (every 1 minute)
    const pollInterval = setInterval(() => {
      fetchUnreadCount();
    }, 60000);

    const isDev = profile.group === 'DESENVOLVEDOR';
    const emailToFilter = isDev ? undefined : profile.email;

    // Subscribe to changes (Supabase Realtime)
    const unsubscribe = notificationService.subscribeToNotifications((payload) => {
      fetchUnreadCount();

      // If it's a new notification (INSERT), show toast
      if (payload?.eventType === 'INSERT') {
        const newNotif = payload.new;
        if (newNotif) {
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          setToast({ title: newNotif.title, message: newNotif.message });
          toastTimeoutRef.current = setTimeout(() => setToast(null), 8000);
        }
      }
    }, emailToFilter);

    return () => {
      window.removeEventListener('notifications_updated', handleLocalUpdate);
      clearInterval(pollInterval);
      unsubscribe();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [profile.email, profile.group, fetchUnreadCount]);

  const NavItem = ({ id, icon: Icon, label, badge, forceFull, onClickOverride }: { id: string, icon: React.ElementType, label: string, badge?: number, forceFull?: boolean, onClickOverride?: () => void }) => {
    const isActive = activeView === id;
    const effectivelyCollapsed = isCollapsed && !forceFull;
    const href = onClickOverride ? undefined : viewUrl(id);

    const handleClick = (e: React.MouseEvent) => {
      // Allow middle-click and Ctrl/Cmd+click to open in a new tab via the href.
      if (!onClickOverride && (e.button !== 0 || e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (onClickOverride) {
        onClickOverride();
      } else {
        onChangeView(id);
      }
      setIsMobileMenuOpen(false);
    };

    const commonProps = {
      onClick: handleClick,
      className: `flex items-center w-full py-2 text-sm font-medium transition-colors duration-150 rounded-lg mb-0.5 group relative
        ${isActive ? t.itemActive : `${t.itemText} ${t.itemHover}`}
        ${effectivelyCollapsed ? 'justify-center px-0' : 'justify-between px-3'}`,
      title: effectivelyCollapsed ? label : undefined,
    };

    const content = (
      <>
        <div className={`flex items-center ${effectivelyCollapsed ? 'justify-center' : ''}`}>
          <Icon className={`w-4 h-4 transition-colors ${isActive ? t.itemIconActive : t.itemIcon} ${!effectivelyCollapsed ? 'mr-3' : ''}`} strokeWidth={2} />
          {!effectivelyCollapsed && <span>{label}</span>}
        </div>
        {!effectivelyCollapsed && badge !== undefined && (
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-orange-500/20 text-orange-500'}`}>
            {badge}
          </span>
        )}
        {effectivelyCollapsed && badge !== undefined && (
          <div className={`absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full border-2 ${t.badgeBgRing}`} />
        )}
      </>
    );

    return href
      ? <a href={href} {...commonProps}>{content}</a>
      : <button type="button" {...commonProps}>{content}</button>;
  };

  const NavGroup = ({ label, forceFull }: { label: string, forceFull?: boolean }) => {
    if (isCollapsed && !forceFull) return <div className={`h-px ${t.divider} my-4 mx-4`} />;

    return (
      <div className="px-3 mt-4 mb-1.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${t.groupLabel}`}>{label}</span>
      </div>
    );
  };

  const NavDropdown = ({ label, icon: Icon, isOpen, onToggle, children, hasActiveChild }: { label: string, icon: React.ElementType, isOpen: boolean, onToggle: () => void, children: React.ReactNode, hasActiveChild?: boolean }) => {
    return (
      <div className="mb-1">
        <button
          onClick={onToggle}
          className={`flex items-center w-full px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-lg justify-between group
            ${hasActiveChild ? t.itemActive : `${t.itemText} ${t.itemHover}`}
            ${isCollapsed ? 'justify-center' : ''}`}
        >
          <div className="flex items-center">
            <Icon className={`w-4 h-4 mr-3 transition-colors ${hasActiveChild ? t.itemIconActive : t.itemIcon} ${isCollapsed ? 'mr-0' : ''}`} strokeWidth={2} />
            {!isCollapsed && <span>{label}</span>}
          </div>
          {!isCollapsed && (
            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
          )}
        </button>
        {isOpen && !isCollapsed && (
          <div className={`mt-1 ml-4 pl-4 border-l ${t.dropdownBorder} space-y-0.5`}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const DropdownItem = ({ id, label, icon: Icon, badge }: { id: string, label: string, icon?: React.ElementType, badge?: number }) => {
    const isActive = activeView === id;
    const handleClick = (e: React.MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      onChangeView(id);
      setIsMobileMenuOpen(false);
    };
    return (
      <a
        href={viewUrl(id)}
        onClick={handleClick}
        className={`flex items-center w-full px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-lg
          ${isActive ? t.itemActive : `${t.itemText} ${t.itemHover}`}`}
      >
        {Icon && <Icon className="w-4 h-4 mr-3 shrink-0" strokeWidth={2} />}
        <span className="flex-1 text-left">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ml-1 ${isActive ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'}`}>{badge}</span>
        )}
      </a>
    );
  };

  const DropdownGroupLabel = ({ label }: { label: string }) => (
    <div className="px-4 pt-3 pb-1">
      <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${t.dropdownGroupLabel}`}>{label}</span>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans relative">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col border-r shadow-2xl relative z-20 transition-all duration-300 ease-in-out ${t.shell} ${isCollapsed ? 'w-20' : 'w-72'}`}>
        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-30"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Header Logo */}
        <div className={`flex items-center h-16 relative overflow-hidden ${isCollapsed ? 'justify-center' : 'px-4 pt-4'}`}>
          <div className={`bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20 relative z-10 ${isCollapsed ? 'w-9 h-9' : 'w-8 h-8 mr-2.5'}`}>
            <Building2 className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          {!isCollapsed && (
            <span className={`text-base font-semibold tracking-tight ${t.userName}`}>OrçaCloud</span>
          )}
        </div>

        {/* Search */}
        {!isCollapsed && (
          <div className="px-3 pt-3 pb-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${t.searchWrap}`}>
              <Search className={`w-4 h-4 ${t.searchIcon}`} strokeWidth={2} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`flex-1 bg-transparent outline-none text-sm ${t.searchText}`}
                placeholder="Buscar..."
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto scrollbar-hide ${isCollapsed ? 'px-2' : 'px-3'} py-2`}>
          {(profile.group === 'USUARIO' || profile.group === 'DESENVOLVEDOR') && (
            <>
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem id="tarefas" icon={CheckSquare} label="Minhas Tarefas" />

              <NavGroup label="Inteligência de Negócios" />
              <NavItem id="bi-executivo" icon={BarChart3} label="BI Executivo" />
              {(mod.incorporacao || isDev) && (
                <NavItem id="imovib" icon={TrendingUp} label="Estudos de Viabilidade" />
              )}

              <NavGroup label="Corporativo" />

              {/* Seletor de empresa ativa */}
              {companies.length > 1 && (
                <div className="relative mb-1">
                  <button
                    onClick={() => setIsEmpresaDropdownOpen(o => !o)}
                    className={`flex items-center w-full py-2 text-sm font-medium transition-colors duration-150 rounded-lg group
                      ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'}
                      ${t.itemText} ${t.itemHover}`}
                    title={isCollapsed ? (activeEmpresa?.razao_social ?? 'Empresa') : undefined}
                  >
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 mr-3"
                        style={{ backgroundColor: activeEmpresa?.cor_sistema ?? '#2563EB' }}
                      />
                      {!isCollapsed && (
                        <span className="truncate">
                          {activeEmpresa?.nome_fantasia ?? activeEmpresa?.razao_social ?? 'Empresa'}
                        </span>
                      )}
                    </div>
                    {!isCollapsed && (
                      <ChevronRight className={`w-3 h-3 transition-transform ${isEmpresaDropdownOpen ? 'rotate-90' : ''} ${t.itemIcon}`} />
                    )}
                  </button>

                  {isEmpresaDropdownOpen && !isCollapsed && (
                    <div className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border shadow-xl overflow-hidden ${t.shell} ${t.dropdownBorder}`}>
                      {companies.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setActiveEmpresaId(c.id); setIsEmpresaDropdownOpen(false); }}
                          className={`flex items-center gap-2 w-full px-3 py-2.5 text-xs text-left transition-colors
                            ${c.id === activeEmpresaId ? t.itemActive : `${t.itemText} ${t.itemHover}`}`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: c.cor_sistema }} />
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-semibold">
                              {c.nome_fantasia ?? c.razao_social}
                            </div>
                            <div className={`text-[10px] truncate ${t.userEmail}`}>
                              {c.cnpj ?? c.tipo}
                            </div>
                          </div>
                          {c.is_headquarters && (
                            <span className={`text-[9px] font-bold uppercase ${t.groupLabel}`}>sede</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <NavItem id="organization" icon={Building2} label="Minha Organização" />
              <NavItem id="org-type-templates" icon={Layers} label="Templates de Obra" />

              {(mod.obras || mod.rh || isDev) && <NavGroup label="Engenharia" />}
              {(mod.obras || isDev) && (
                <>
                  <NavItem id="eng-obras" icon={Building2} label="Obras" />
                  <NavItem id="eng-orcamentos" icon={FolderOpen} label="Orçamentos" />
                  <NavItem id="operacional" icon={ClipboardList} label="Controle Operacional" />
                  <NavItem id="estrutural" icon={Layers} label="Ferragem & Aço" />
                  <NavItem id="quality" icon={Activity} label="Qualidade & Entrega" />
                  <NavItem id="pos-obra" icon={Shield} label="Pós-Obra & Garantia" />
                  <NavItem id="explorer" icon={BookOpen} label="Composições" />
                </>
              )}
              {(mod.rh || isDev) && (
                <NavDropdown
                  label="Gestão de Mão de Obra"
                  icon={Users}
                  isOpen={isLaborOpen}
                  onToggle={() => {
                    if (isCollapsed) { onChangeView('labor-dashboard'); }
                    else { setIsLaborOpen(o => !o); }
                  }}
                  hasActiveChild={activeView.startsWith('labor-')}
                >
                  <DropdownGroupLabel label="Visão Geral" />
                  <DropdownItem id="labor-dashboard" label="Dashboard" icon={BarChart3} />
                  <DropdownItem id="labor-cost-dashboard" label="Custo por Obra" icon={TrendingUp} />
                  <DropdownItem id="labor-rh-dashboard" label="Dashboard RH" icon={Activity} />

                  <DropdownGroupLabel label="Pessoas" />
                  <DropdownItem id="labor-employees" label="Colaboradores" icon={Users} />
                  <DropdownItem id="labor-teams" label="Equipes" icon={Shield} />
                  <DropdownItem id="labor-allocations" label="Alocações" icon={Target} />
                  <DropdownItem id="labor-ats" label="Recrutamento" icon={Briefcase} />
                  <DropdownItem id="labor-termination" label="Desligamentos" icon={TrendingDown} />

                  <DropdownGroupLabel label="Operacional" />
                  <DropdownItem id="labor-timetracking" label="Ponto" icon={Clock} />
                  <DropdownItem id="labor-timebank" label="Banco de Horas" icon={Clock} />
                  <DropdownItem id="labor-productivity" label="Produtividade" icon={Target} />
                  <DropdownItem id="labor-absences" label="Férias e Ausências" icon={Calendar} />
                  <DropdownItem id="labor-trainings" label="Treinamentos" icon={BookOpen} />
                  <DropdownItem id="labor-epis" label="EPIs" icon={Shield} />
                  <DropdownItem id="labor-sst" label="SST" icon={Shield} />
                  <DropdownItem id="labor-documents" label="Documentos" icon={FileText} />
                  <DropdownItem id="labor-diary" label="Diário de Obra" icon={BookOpen} />
                  <DropdownItem id="labor-contractors" label="Empreiteiros" icon={Truck} />

                  <DropdownGroupLabel label="Financeiro" />
                  <DropdownItem id="labor-costs" label="Custos" icon={DollarSign} />
                  <DropdownItem id="labor-payroll" label="Folha" icon={Calculator} />
                  <DropdownItem id="labor-rubrics" label="Rubricas" icon={Shield} />
                  <DropdownItem id="labor-encargos" label="Encargos Sociais" icon={Percent} />
                  <DropdownItem id="labor-esocial" label="eSocial" icon={FileText} />

                  <DropdownGroupLabel label="Estratégico" />
                  <DropdownItem id="labor-evaluation" label="Avaliação 360°" icon={Trophy} />
                  <DropdownItem id="labor-bi-analytics" label="BI Analytics RH" icon={BarChart3} />
                  <DropdownItem id="labor-comunicacao" label="Comunicação" icon={MessageSquare} />
                  <DropdownItem id="labor-portal" label="Portal Colaborador" icon={Layers} />

                  <DropdownGroupLabel label="Configurações" />
                  <DropdownItem id="labor-fiscal" label="Config. Fiscais" icon={Settings} />
                </NavDropdown>
              )}
              {(mod.obras || isDev) && (
                <>
                  <NavItem id="eng-planejamento" icon={Calendar} label="Planejamento" />
                  <NavItem id="project-diary" icon={BookOpen} label="Diário de Obra" />
                  <NavItem id="reports" icon={FileText} label="Relatórios" />
                  <NavItem id="project-settings" icon={Calculator} label="Dados Técnicos" />
                </>
              )}

              {(mod.compras || isDev) && (
                <>
                  <NavGroup label="Suprimentos" />
                  <NavItem id="supplies-contracts" icon={FileText} label="Contratos" />
                  <NavItem id="supplies-quotations" icon={FileText} label="Cotações" />
                  <NavItem id="supplies-orders" icon={Package} label="Pedidos" />
                  <NavItem id="supplies-receipts" icon={Truck} label="Recebimento" />
                </>
              )}

              {(mod.financeiro || mod.fiscal || isDev) && <NavGroup label="Financeiro" />}
              {(mod.financeiro || isDev) && (
                <>
                  <NavItem
                    id="project-financial"
                    icon={DollarSign}
                    label="Financeiro"
                    onClickOverride={() => {
                      const { setProjectId } = useStore.getState();
                      setProjectId(null);
                      onChangeView('project-financial');
                    }}
                  />
                  <NavItem id="financial-dre"        icon={BarChart3}    label="DRE" />
                  <NavItem id="financial-cashflow"   icon={TrendingUp}   label="Fluxo de Caixa" />
                  <NavItem id="financial-boletos"    icon={FileText}     label="Boletos" />
                  <NavItem id="contas-a-pagar"       icon={TrendingDown} label="Contas a Pagar" />
                  <NavItem id="bank-reconciliation"  icon={Receipt}      label="Conciliação Bancária" />
                  <NavItem id="financial-categories" icon={Layers}       label="Categorias" />
                </>
              )}
              {(mod.fiscal || isDev) && (
                <>
                  <NavItem id="fiscal-nfe" icon={Receipt} label="Fiscal & NF-e" />
                  <NavItem id="automation" icon={Zap} label="Automação" />
                </>
              )}

              {(mod.crm || isDev) && (
                <>
                  <NavGroup label="Comercial" />
                  <NavItem id="services-commercial" icon={Briefcase} label="CRM Serviços" />
                  <NavItem id="sales" icon={TrendingUp} label="Vendas" />
                  <NavItem id="rentals" icon={Building2} label="Aluguéis" />
                </>
              )}

              <NavGroup label="Portais" />
              {isDev ? (
                <NavDropdown
                  label="Portais"
                  icon={Shield}
                  isOpen={isPortalsOpen}
                  onToggle={() => setIsPortalsOpen(!isPortalsOpen)}
                >
                  <DropdownItem id="client-properties" label="Portal do Cliente" icon={Building2} />
                  <DropdownItem id="investor-area" label="Área do Investidor" icon={TrendingUp} />
                  <DropdownItem id="supplier-area" label="Portal do Fornecedor" icon={Truck} />
                  <DropdownItem id="broker-area" label="Portal do Corretor" icon={Briefcase} />
                </NavDropdown>
              ) : (
                <>
                  <NavItem id="client-area" icon={User} label="Visão do Cliente" />
                  {mod.broker_portal && (
                    <NavItem id="broker-area" icon={Briefcase} label="Portal do Corretor" />
                  )}
                </>
              )}
            </>
          )}

          {profile.group === 'CLIENTE' && (
            <>
              <NavGroup label="Minha Área" />
              <NavItem id="dashboard" icon={Building2} label={profile.role === 'ALUGUEL' ? 'Meus Aluguéis' : 'Meus Imóveis'} />
              <NavItem id="documentos" icon={FileText} label="Documentos" />
            </>
          )}

          {profile.group === 'SUPPLIER' && (
            <>
              <NavGroup label="Meu Painel" />
              <NavItem id="supplier-area" icon={Truck} label="Negociações" />
              <NavItem id="orders" icon={Package} label="Pedidos" />
            </>
          )}

          {profile.group === 'CORRETOR' && (
            <>
              <NavGroup label="Meu Portal" />
              <NavItem id="broker-area" icon={Briefcase} label="Estoque" />
              <NavItem id="broker-proposals" icon={FileText} label="Propostas" />
              <NavItem id="broker-leads" icon={Users} label="Leads" />
              <NavItem id="broker-commissions" icon={DollarSign} label="Comissões" />
              <NavItem id="broker-materials" icon={FolderOpen} label="Materiais" />
              <NavGroup label="Engajamento" />
              <NavItem id="broker-ranking" icon={Trophy} label="Ranking" />
              <NavItem id="broker-training" icon={BookOpen} label="Treinamento" />
              <NavItem id="broker-events" icon={Calendar} label="Agenda" />
              <NavItem id="broker-chat" icon={MessageSquare} label="Chat" />
              <NavGroup label="Inteligência" />
              <NavItem id="broker-analytics" icon={BarChart3} label="Analytics" />
              <NavItem id="broker-health" icon={Activity} label="Saúde" />
              <NavItem id="broker-integrations" icon={Link2} label="Integrações" />
            </>
          )}

          {profile.group === 'INVESTIDOR' && (
            <>
              <NavGroup label="Investimentos" />
              <NavItem id="dashboard" icon={TrendingUp} label="Evolução" />
              <NavItem id="holdings" icon={PieChart} label="Minhas Cotas" />
              <NavItem id="opportunities" icon={Building2} label="Oportunidades" />
              <NavItem id="reports" icon={FileText} label="Relatórios" />
            </>
          )}

          <NavGroup label="Sistema" />
          <NavItem id="notifications-center" icon={Bell} label="Notificações" badge={unreadCount > 0 ? unreadCount : undefined} />
          <NavItem id="settings" icon={Settings} label="Configurações" />
        </nav>

        {/* Footer - User profile */}
        <div className={`border-t ${t.footerBorder} ${isCollapsed ? 'p-2' : 'px-3 py-3'}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-200 to-amber-500" />
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`p-2 rounded-lg transition-colors ${t.signOut}`}
                title={isDarkMode ? 'Tema claro' : 'Tema escuro'}
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => supabase.auth.signOut().finally(() => logout())}
                className={`p-2 rounded-lg transition-colors ${t.signOut}`}
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-200 to-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold truncate ${t.userName}`}>
                      {profile.email?.split('@')[0] ?? 'Usuário'}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-500 text-white px-1.5 py-0.5 rounded">PRO</span>
                  </div>
                  <div className={`text-xs truncate ${t.userEmail}`}>{profile.email ?? profile.role}</div>
                </div>
                <button
                  onClick={() => supabase.auth.signOut().finally(() => logout())}
                  className={`p-2 rounded-lg transition-colors shrink-0 ${t.signOut}`}
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors ${t.signOut}`}
                title="Alternar tema"
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  {isDarkMode ? 'Tema escuro' : 'Tema claro'}
                </span>
                <span className={`w-8 h-4 rounded-full relative transition-colors ${t.toggleTrack}`}>
                  <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isDarkMode ? 'left-4' : 'left-0.5'}`} />
                </span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Sidebar - Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className={`relative flex flex-col w-72 h-full shadow-2xl animate-in slide-in-from-left duration-300 ${t.shell}`}>
            <div className={`flex items-center justify-between h-16 px-4 border-b ${t.footerBorder}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                </div>
                <span className={`text-base font-semibold ${t.userName}`}>OrçaCloud</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className={`p-2 transition-colors ${t.signOut}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex-1 py-6 px-4 overflow-y-auto">
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" forceFull />
              {profile.group === 'DESENVOLVEDOR' ? (
                <div className="space-y-1 mb-4">
                  <div className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">Portais</div>
                  <NavItem id="client-properties" icon={Building2} label="Meus Imóveis" forceFull />
                  <NavItem id="investor-area" icon={TrendingUp} label="Área do Investidor" forceFull />
                  <NavItem id="supplier-area" icon={Truck} label="Portal do Fornecedor" forceFull />
                  <NavItem id="broker-area" icon={Briefcase} label="Portal do Corretor" forceFull />
                </div>
              ) : (
                <NavItem id="client-area" icon={User} label="Área do Cliente" forceFull />
              )}

              <NavGroup label="Inteligência de Negócios" />
              <NavItem id="imovib" icon={TrendingUp} label="Estudos de Viabilidade" forceFull />

              <NavItem id="quality" icon={Activity} label="Qualidade & Entrega" forceFull />

              <NavGroup label="Suprimentos" />
              <NavItem id="supplies-orders" icon={Package} label="Pedidos" forceFull />
              <NavItem id="supplies-receipts" icon={Truck} label="Recebimento" forceFull />
              <NavItem id="planning-list" icon={Calendar} label="Planejamento" forceFull />
              <NavItem id="projects" icon={FolderOpen} label="Orçamentos" forceFull />
              <NavItem id="reports" icon={FileText} label="Relatórios" forceFull />
              <NavItem id="project-settings" icon={Calculator} label="Dados Técnicos" forceFull />
              <NavItem id="settings" icon={Settings} label="Configurações" forceFull />
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header with Project Actions */}
        <header className="flex h-16 bg-white border-b border-gray-200 items-center justify-between px-4 md:px-8 shrink-0 relative z-30">
          <div className="flex items-center gap-4 flex-1">
            <button className="md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="w-6 h-6 text-gray-600" />
            </button>

            {(activeView === 'analytic' || activeView === 'abc-curve' || activeView === 'parametric' || activeView === 'project-settings' || activeView === 'reports') && (
              <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100/50">
                {(() => {
                  const childProps = React.isValidElement(children) ? (children.props as Record<string, unknown>) : {};
                  const childSettings = childProps?.settings as Record<string, unknown> | undefined;
                  const classification = childSettings?.classification as string | undefined;
                  return (
                    <>
                      <span className="text-[10px] md:text-xs font-bold text-blue-500 uppercase tracking-tighter">
                        {classification === 'OBRA' ? 'Obra Atual' : 'Orçamento Atual'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 truncate max-w-[120px] md:max-w-xs">{projectName}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onChangeView(classification === 'OBRA' ? 'project-overview' : 'dashboard')}
                            className="p-1 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors"
                            title="Central do Projeto"
                          >
                            <LayoutDashboard className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onChangeView('project-settings')}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                            title={classification === 'OBRA' ? 'Configurações da Obra' : 'Configurações do Orçamento'}
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsNotificationOpen(!isNotificationOpen);
              }}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all relative group/bell"
              title="Notificações"
            >
              <Bell className="w-5 h-5 group-hover/bell:scale-110 transition-transform" />
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white z-10" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-400 rounded-full animate-ping" />
                </>
              )}
            </button>

            {activeView === 'analytic' && (
              <button
                onClick={onSaveProject}
                disabled={isSaving}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                ) : (
                  <Cloud className="w-4 h-4" />
                )}
                <span className="text-xs font-bold uppercase hidden sm:inline">{isSaving ? 'Salvando...' : 'Salvar'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide relative">
          {children}
        </main>
      </div>

      {/* Notification Toast Portal-like position */}
      {toast && (
        <div className="fixed top-24 right-8 z-[500] max-w-xs animate-in slide-in-from-right-full duration-500">
          <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl shadow-indigo-900/50 border border-indigo-500 flex items-start gap-4">
            <div className="p-2 bg-white/20 rounded-xl">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-black uppercase tracking-tight mb-1 truncate">{toast.title}</h4>
              <p className="text-xs font-medium text-indigo-100 leading-relaxed">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Notification Panel Overlay */}
      {isNotificationOpen && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-all animate-in fade-in duration-300"
            onClick={(e) => {
              e.stopPropagation();
              setIsNotificationOpen(false);
            }}
          />
          <NotificationPanel
            email={profile.group === 'DESENVOLVEDOR' ? undefined : profile.email}
            onClose={() => setIsNotificationOpen(false)}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
};

export default Layout;