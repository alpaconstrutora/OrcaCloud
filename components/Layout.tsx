import React from 'react';
import { LayoutDashboard, Calculator, PieChart, Settings, FolderOpen, LogOut, Loader2, Cloud, FileText, Table2, Building2, Menu, X, Save, Trash2, User, Users, Database, BookOpen, Calendar, Sun, ChevronLeft, ChevronRight, DollarSign, TrendingUp, TrendingDown, Shield, Truck, Package, Bell, Zap, Briefcase, Trophy, MessageSquare, BarChart3, Activity, Link2, Clock, Target, Percent, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import NotificationPanel from './NotificationPanel';
import { notificationService } from '../services/notificationService';

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
  const { logout } = useStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(true); // Default to dark for sidebar aesthetic
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isPortalsOpen, setIsPortalsOpen] = React.useState(false);
  const [isLaborOpen, setIsLaborOpen] = React.useState(() => activeView.startsWith('labor-'));
  React.useEffect(() => { if (activeView.startsWith('labor-')) setIsLaborOpen(true); }, [activeView]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [toast, setToast] = React.useState<{ title: string; message: string } | null>(null);

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
          setToast({ title: newNotif.title, message: newNotif.message });
          setTimeout(() => setToast(null), 8000);
        }
      }
    }, emailToFilter);

    return () => {
      window.removeEventListener('notifications_updated', handleLocalUpdate);
      clearInterval(pollInterval);
      unsubscribe();
    };
  }, [profile.email, profile.group, fetchUnreadCount]);

  const NavItem = ({ id, icon: Icon, label, badge, forceFull, onClickOverride }: { id: string, icon: React.ElementType, label: string, badge?: number, forceFull?: boolean, onClickOverride?: () => void }) => {
    const isActive = activeView === id;
    const effectivelyCollapsed = isCollapsed && !forceFull;

    return (
      <button
        onClick={() => {
          if (onClickOverride) {
            onClickOverride();
          } else {
            onChangeView(id);
          }
          setIsMobileMenuOpen(false);
        }}
        className={`flex items-center w-full py-2.5 text-sm font-semibold transition-all duration-200 rounded-xl mb-1 group relative
          ${isActive
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
            : 'text-gray-400 hover:text-white hover:bg-white/5'}
          ${effectivelyCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}
        title={effectivelyCollapsed ? label : undefined}
      >
        <div className={`flex items-center ${effectivelyCollapsed ? 'justify-center' : ''}`}>
          <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-400'} ${!effectivelyCollapsed ? 'mr-3' : ''}`} />
          {!effectivelyCollapsed && <span>{label}</span>}
        </div>
        {!effectivelyCollapsed && badge !== undefined && (
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${isActive ? 'bg-white text-blue-600' : 'bg-blue-600/20 text-blue-400'}`}>
            {badge}
          </span>
        )}
        {effectivelyCollapsed && badge !== undefined && (
          <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#0B1727]" />
        )}
      </button>
    );
  };

  const NavGroup = ({ label, forceFull }: { label: string, forceFull?: boolean }) => {
    if (isCollapsed && !forceFull) return <div className="h-px bg-white/5 my-4 mx-4" />;

    return (
      <div className="px-4 mt-6 mb-2">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{label}</span>
      </div>
    );
  };

  const NavDropdown = ({ label, icon: Icon, isOpen, onToggle, children, hasActiveChild }: { label: string, icon: React.ElementType, isOpen: boolean, onToggle: () => void, children: React.ReactNode, hasActiveChild?: boolean }) => {
    return (
      <div className="mb-1">
        <button
          onClick={onToggle}
          className={`flex items-center w-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 rounded-xl justify-between group
            ${hasActiveChild
              ? 'text-white bg-white/8 hover:bg-white/10'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
            }
            ${isCollapsed ? 'justify-center' : ''}`}
        >
          <div className="flex items-center">
            <Icon className={`w-5 h-5 mr-3 transition-colors ${hasActiveChild ? 'text-blue-400' : 'text-gray-500 group-hover:text-blue-400'} ${isCollapsed ? 'mr-0' : ''}`} />
            {!isCollapsed && <span>{label}</span>}
          </div>
          {!isCollapsed && (
            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
          )}
        </button>
        {isOpen && !isCollapsed && (
          <div className="mt-1 ml-4 pl-4 border-l border-white/5 space-y-0.5">
            {children}
          </div>
        )}
      </div>
    );
  };

  const DropdownItem = ({ id, label, icon: Icon, badge }: { id: string, label: string, icon?: React.ElementType, badge?: number }) => {
    const isActive = activeView === id;
    return (
      <button
        onClick={() => { onChangeView(id); setIsMobileMenuOpen(false); }}
        className={`flex items-center w-full px-4 py-2 text-xs font-bold transition-all duration-200 rounded-lg
          ${isActive ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
      >
        {Icon && <Icon className="w-3.5 h-3.5 mr-2 shrink-0" />}
        <span className="flex-1 text-left">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ml-1 ${isActive ? 'bg-blue-400/20 text-blue-300' : 'bg-red-500/80 text-white'}`}>{badge}</span>
        )}
      </button>
    );
  };

  const DropdownGroupLabel = ({ label }: { label: string }) => (
    <div className="px-4 pt-3 pb-1">
      <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.15em]">{label}</span>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans relative">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col bg-[#0B1727] text-white border-r border-white/5 shadow-2xl relative z-20 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-72'}`}>
        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-30"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Header Logo */}
        <div className={`flex items-center h-20 relative overflow-hidden group ${isCollapsed ? 'justify-center' : 'px-8'}`}>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className={`bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 relative z-10 transition-all duration-300 group-hover:scale-110 ${isCollapsed ? 'w-10 h-10' : 'w-10 h-10 mr-3'}`}>
            <Building2 className="w-6 h-6 text-white" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col relative z-10 text-nowrap">
              <span className="text-xl font-black tracking-tight text-white leading-none">OrçaCloud</span>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">SaaS Pro</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto scrollbar-hide ${isCollapsed ? 'px-2' : 'px-4'} py-4`}>
          {(profile.group === 'USUARIO' || profile.group === 'DESENVOLVEDOR') && (
            <>
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />

              <NavGroup label="Inteligência de Negócios" />
              <NavItem id="imovib" icon={TrendingUp} label="Estudos de Viabilidade" />

              <NavGroup label="Corporativo" />
              <NavItem id="organization" icon={Building2} label="Minha Organização" />

              <NavGroup label="Engenharia" />
              <NavItem id="eng-obras" icon={Building2} label="Obras" />
              <NavItem id="eng-orcamentos" icon={FolderOpen} label="Orçamentos" />
              <NavItem id="quality" icon={Activity} label="Qualidade & Entrega" />
              <NavItem id="explorer" icon={BookOpen} label="Composições" />
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

                <DropdownGroupLabel label="Pessoas" />
                <DropdownItem id="labor-employees" label="Colaboradores" icon={Users} />
                <DropdownItem id="labor-teams" label="Equipes" icon={Shield} />
                <DropdownItem id="labor-allocations" label="Alocações" icon={Target} />

                <DropdownGroupLabel label="Operacional" />
                <DropdownItem id="labor-timetracking" label="Ponto" icon={Clock} />
                <DropdownItem id="labor-productivity" label="Produtividade" icon={Target} />
                <DropdownItem id="labor-documents" label="Documentos" icon={FileText} />

                <DropdownGroupLabel label="Financeiro" />
                <DropdownItem id="labor-costs" label="Custos" icon={DollarSign} />
                <DropdownItem id="labor-payroll" label="Folha" icon={Calculator} />
                <DropdownItem id="labor-rubrics" label="Rubricas" icon={Shield} />
                <DropdownItem id="labor-encargos" label="Encargos Sociais" icon={Percent} />

                <DropdownGroupLabel label="Configurações" />
                <DropdownItem id="labor-fiscal" label="Config. Fiscais" icon={Settings} />
              </NavDropdown>
              <NavItem id="eng-planejamento" icon={Calendar} label="Planejamento" />
              <NavItem id="project-diary" icon={BookOpen} label="Diário de Obra" />
              <NavItem id="reports" icon={FileText} label="Relatórios" />
              <NavItem id="project-settings" icon={Calculator} label="Dados Técnicos" />

              <NavGroup label="Suprimentos" />
              <NavItem id="supplies-contracts" icon={FileText} label="Contratos" />
              <NavItem id="supplies-quotations" icon={FileText} label="Cotações" />
              <NavItem id="supplies-orders" icon={Package} label="Pedidos" />
              <NavItem id="supplies-receipts" icon={Truck} label="Recebimento" />

              <NavGroup label="Financeiro" />
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
              <NavItem id="financial-boletos" icon={FileText} label="Boletos" />
              <NavItem id="contas-a-pagar" icon={TrendingDown} label="Contas a Pagar" />
              <NavItem id="fiscal-nfe" icon={Receipt} label="Fiscal & NF-e" />
              <NavItem id="automation" icon={Zap} label="Automação" />

              <NavGroup label="Comercial" />
              <NavItem id="sales" icon={TrendingUp} label="Vendas" />
              <NavItem id="rentals" icon={Building2} label="Aluguéis" />

              <NavGroup label="Portais" />
              {profile.group === 'DESENVOLVEDOR' ? (
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
                <NavItem id="client-area" icon={User} label="Visão do Cliente" />
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
          <NavItem id="settings" icon={Settings} label="Configurações" />
        </nav>

        {/* Footer Actions */}
        <div className={`p-6 bg-black/20 border-t border-white/5 space-y-4 ${isCollapsed ? 'p-2' : ''}`}>
          {!isCollapsed && (
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <Sun className={`w-4 h-4 transition-colors ${!isDarkMode ? 'text-blue-400' : 'text-gray-500'}`} />
                <span className="text-xs font-bold text-gray-400">Modo Escuro</span>
              </div>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-10 h-5 rounded-full relative transition-colors duration-300 focus:outline-none ${isDarkMode ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${isDarkMode ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          )}

          <button
            onClick={() => {
              supabase.auth.signOut().finally(() => logout());
            }}
            className={`w-full group flex items-center justify-center gap-3 p-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl transition-all duration-300 border border-white/5 hover:border-white/10 ${isCollapsed ? 'px-0 py-4' : ''}`}
            title={isCollapsed ? "Sair da Conta" : undefined}
          >
            <LogOut className={`w-4 h-4 transition-transform group-hover:-translate-x-1 ${isCollapsed ? 'w-5 h-5' : ''}`} />
            {!isCollapsed && <span className="text-sm font-black uppercase tracking-widest">Sair da Conta</span>}
          </button>
        </div>
      </aside>

      {/* Sidebar - Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className="relative flex flex-col w-72 bg-[#0B1727] h-full shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="flex items-center justify-between h-20 px-8 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-black text-white">OrçaCloud</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
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