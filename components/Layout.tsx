import React from 'react';
import { LayoutDashboard, Calculator, PieChart, Settings, FolderOpen, LogOut, Loader2, Cloud, FileText, FileSpreadsheet, Building2, Menu, X, User, Users, Database, BookOpen, Calendar, Sun, ChevronLeft, ChevronRight, DollarSign, TrendingUp, TrendingDown, Shield, Truck, Package, Bell, Zap, Briefcase, Trophy, MessageSquare, BarChart3, Activity, Link2, Clock, Target, Percent, Receipt, ClipboardList, Search, Moon, MoonStar, SunMoon, Contrast, Layers, CheckSquare, UtensilsCrossed, Gift, Palette, Hammer, Warehouse, Brain, ArrowRightLeft, Banknote, LineChart, Workflow, HelpCircle, Command, Plus, ArrowUpDown, Columns3, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import NotificationPanel from './NotificationPanel';
import PreferencesSheet, { type ThemeMode } from './PreferencesSheet';
import { notificationService } from '../services/notificationService';
import { taskService } from '../services/taskService';
import { viewUrl } from '../lib/tabRouter';

const ThemeModeIcon = ({ mode, className }: { mode: ThemeMode; className?: string }) => {
  if (mode === 'light') return <Sun className={className} />;
  if (mode === 'dark') return <Moon className={className} />;
  if (mode === 'midnight') return <MoonStar className={className} />;
  return <SunMoon className={className} />;
};

// ── Nav context ───────────────────────────────────────────────────────────────
// Defining NavItem/DropdownItem etc. inside Layout creates a new function type
// on every render, causing React to unmount+remount all nav children and reset
// the nav's scrollTop to 0. Moving them to module level gives stable references.
type NavTheme = Record<string, string>;
interface NavCtxValue {
  activeView: string;
  isCollapsed: boolean;
  t: NavTheme;
  onChangeView: (view: string) => void;
  setIsMobileMenuOpen: (open: boolean) => void;
}
const NavContext = React.createContext<NavCtxValue | null>(null);
const useNavCtx = () => React.useContext(NavContext)!;

const NavItem = ({ id, icon: Icon, label, badge, forceFull, onClickOverride }: {
  id: string; icon: React.ElementType; label: string; badge?: number;
  forceFull?: boolean; onClickOverride?: () => void;
}) => {
  const { activeView, isCollapsed, t, onChangeView, setIsMobileMenuOpen } = useNavCtx();
  const isActive = activeView === id;
  const effectivelyCollapsed = isCollapsed && !forceFull;
  const href = onClickOverride ? undefined : viewUrl(id);
  const handleClick = (e: React.MouseEvent) => {
    if (!onClickOverride && (e.button !== 0 || e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (onClickOverride) { onClickOverride(); } else { onChangeView(id); }
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
        <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-orange-500/20 text-orange-500'}`}>{badge}</span>
      )}
      {effectivelyCollapsed && badge !== undefined && (
        <div className={`absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full border-2 ${t.badgeBgRing}`} />
      )}
    </>
  );
  return href ? <a href={href} {...commonProps}>{content}</a> : <button type="button" {...commonProps}>{content}</button>;
};

const NavGroup = ({ label, forceFull }: { label: string; forceFull?: boolean }) => {
  const { isCollapsed, t } = useNavCtx();
  if (isCollapsed && !forceFull) return <div className={`h-px ${t.divider} my-4 mx-4`} />;
  return <div className="px-3 mt-4 mb-1.5"><span className={`text-xs font-semibold uppercase tracking-wider ${t.groupLabel}`}>{label}</span></div>;
};

const NavDropdown = ({ label, icon: Icon, isOpen, onToggle, children, hasActiveChild }: {
  label: string; icon: React.ElementType; isOpen: boolean; onToggle: () => void;
  children: React.ReactNode; hasActiveChild?: boolean;
}) => {
  const { isCollapsed, t } = useNavCtx();
  return (
    <div className="mb-1">
      <button onClick={onToggle} className={`flex items-center w-full px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-lg justify-between group ${hasActiveChild ? t.itemActive : `${t.itemText} ${t.itemHover}`} ${isCollapsed ? 'justify-center' : ''}`}>
        <div className="flex items-center">
          <Icon className={`w-4 h-4 mr-3 transition-colors ${hasActiveChild ? t.itemIconActive : t.itemIcon} ${isCollapsed ? 'mr-0' : ''}`} strokeWidth={2} />
          {!isCollapsed && <span>{label}</span>}
        </div>
        {!isCollapsed && <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />}
      </button>
      {isOpen && !isCollapsed && <div className={`mt-1 ml-4 pl-4 border-l ${t.dropdownBorder} space-y-0.5`}>{children}</div>}
    </div>
  );
};

const DropdownItem = ({ id, label, icon: Icon, badge, isActiveOverride, onClickOverride }: {
  id: string; label: string; icon?: React.ElementType; badge?: number;
  isActiveOverride?: boolean; onClickOverride?: () => void;
}) => {
  const { activeView, t, onChangeView, setIsMobileMenuOpen } = useNavCtx();
  const isActive = isActiveOverride ?? activeView === id;
  const href = onClickOverride ? undefined : viewUrl(id);
  const handleClick = (e: React.MouseEvent) => {
    if (!onClickOverride && (e.button !== 0 || e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (onClickOverride) { onClickOverride(); } else { onChangeView(id); }
    setIsMobileMenuOpen(false);
  };
  const className = `flex items-center w-full px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-lg ${isActive ? t.itemActive : `${t.itemText} ${t.itemHover}`}`;
  const content = (
    <>
      {Icon && <Icon className="w-4 h-4 mr-3 shrink-0" strokeWidth={2} />}
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ml-1 ${isActive ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'}`}>{badge}</span>}
    </>
  );
  return href
    ? <a href={href} onClick={handleClick} className={className}>{content}</a>
    : <button type="button" onClick={handleClick} className={className}>{content}</button>;
};

const DropdownGroupLabel = ({ label }: { label: string }) => {
  const { t } = useNavCtx();
  return <div className="px-4 pt-3 pb-1"><span className={`text-[9px] font-black uppercase tracking-[0.15em] ${t.dropdownGroupLabel}`}>{label}</span></div>;
};


type CommandItem = {
  id: string;
  label: string;
  group: string;
  icon: React.ElementType;
  shortcut?: string;
};
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
  const { logout, companies, activeEmpresaId, setActiveEmpresaId, managementTab, setManagementTab } = useStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isEmpresaDropdownOpen, setIsEmpresaDropdownOpen] = React.useState(false);
  const [isHeaderEmpresaDropdownOpen, setIsHeaderEmpresaDropdownOpen] = React.useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);
  const activeEmpresa = companies.find(c => c.id === activeEmpresaId) ?? null;

  // Obter organização e membros para calcular permissões dinâmicas
  const { organizations, activeOrganizationId } = useStore();
  const activeOrg = organizations.find(o => o.id === activeOrganizationId);
  
  const currentMember = React.useMemo(() => {
    if (!activeOrg?.members || !profile.email) return null;
    return activeOrg.members.find(m => m.email.toLowerCase() === profile.email?.toLowerCase()) || null;
  }, [activeOrg, profile.email]);
  const userName = React.useMemo(() => {
    const localPart = profile.email?.split('@')[0];
    if (!localPart) return 'Usuario';
    return localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }, [profile.email]);
  const userInitial = (profile.email?.[0] ?? userName[0] ?? 'U').toUpperCase();
  const DEV_EMAIL = 'altair.rosa@alpaconstrutora.com.br';
  const isDevEmail = profile.email?.toLowerCase() === DEV_EMAIL;
  const activeContextLabel = activeEmpresa?.nome_fantasia ?? activeEmpresa?.razao_social ?? activeOrg?.name ?? projectName ?? 'Contexto atual';
  const roleLabel = currentMember?.role === 'admin'
    ? 'Admin da organizacao'
    : profile.group === 'DESENVOLVEDOR'
      ? 'Desenvolvedor'
      : profile.role;
  const canManageOrganization = profile.group === 'DESENVOLVEDOR'
    || currentMember?.role === 'admin'
    || currentMember?.permissions?.canManageUsers
    || currentMember?.permissions?.canViewSettings;

  // Módulos habilitados e visibilidade calculada por cargo/usuário
  const allowedMods = React.useMemo(() => {
    const baseMods = activeEmpresa?.modulos_habilitados || {
      obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: false, offices: false, reformas: false
    };

    if (profile.group === 'DESENVOLVEDOR' || isDevEmail) {
      return {
        obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: true, offices: true, reformas: true, quality: true, compliance: true
      };
    }

    if (!currentMember) return { ...baseMods, compliance: false };

    if (currentMember.role === 'admin') {
      return {
        obras: true, compras: true, financeiro: true, fiscal: true, rh: true, incorporacao: true, crm: true, estoque: true, broker_portal: true, pro: true, offices: true, reformas: true, quality: true, compliance: true
      };
    }

    const roleId = currentMember.customRoleId || currentMember.role;
    const matrix = activeOrg?.settings?.module_visibility || {};

    // Suporte à nova estrutura por produto (platform | pro | offices)
    // Retrocompatível: se não houver dimensão de produto, trata como 'platform'
    const productCtx = (currentMember as any).productContext || 'platform';
    let productMatrix: Record<string, Record<string, boolean>>;
    if ((matrix as any).platform !== undefined || (matrix as any).pro !== undefined || (matrix as any).offices !== undefined) {
      productMatrix = ((matrix as any)[productCtx] as Record<string, Record<string, boolean>>) || {};
    } else {
      productMatrix = matrix as Record<string, Record<string, boolean>>;
    }
    const roleConfig = productMatrix[roleId] || {};

    const checkModule = (layoutKey: string, userPermKey: string, matrixKey: string): boolean => {
      // O tipo UserPermissions é estendido com canView*
      const userPerm = currentMember.permissions ? (currentMember.permissions as any)[userPermKey] : undefined;
      if (userPerm !== undefined) {
        return !!userPerm;
      }
      if (roleConfig[matrixKey] !== undefined) {
        return !!roleConfig[matrixKey];
      }
      return !!baseMods[layoutKey as keyof typeof baseMods];
    };

    // Para usuários Pro: somente módulo pro habilitado por padrão
    if (productCtx === 'pro') {
      return {
        obras: false, compras: false, rh: false, financeiro: false, fiscal: false,
        incorporacao: false, crm: false, estoque: false, broker_portal: false,
        reformas: false, quality: false,
        offices: false,
        pro: checkModule('pro', 'canViewPro', 'pro'),
        compliance: false,
      };
    }

    // Para usuários Offices: somente módulos offices e crm de serviços
    if (productCtx === 'offices') {
      return {
        obras: false, compras: false, rh: false, financeiro: false, fiscal: false,
        incorporacao: false, estoque: false, broker_portal: false, reformas: false,
        quality: false, pro: false,
        offices: checkModule('offices', 'canViewOffices', 'offices'),
        crm: checkModule('crm', 'canViewSales', 'crm'),
        compliance: false,
      };
    }

    return {
      obras: checkModule('obras', 'canViewBudget', 'obras'),
      compras: checkModule('compras', 'canViewOrders', 'compras'),
      rh: checkModule('rh', 'canViewLabor', 'rh'),
      offices: checkModule('offices', 'canViewOffices', 'offices'),
      pro: checkModule('pro', 'canViewPro', 'pro'),
      crm: checkModule('crm', 'canViewSales', 'crm'),
      incorporacao: checkModule('incorporacao', 'canViewImovib', 'incorporacao'),
      fiscal: checkModule('fiscal', 'canViewFiscal', 'fiscal'),
      quality: checkModule('quality', 'canViewQuality', 'quality'),
      compliance: checkModule('compliance', 'canViewCompliance', 'compliance'),
      
      financeiro: baseMods.financeiro !== false,
      reformas: baseMods.reformas !== false,
      estoque: baseMods.estoque !== false,
      broker_portal: baseMods.broker_portal !== false
    };
  }, [activeEmpresa, profile.group, currentMember, activeOrg, activeOrganizationId, isDevEmail]);

  const mod = allowedMods;
  const isDev = profile.group === 'DESENVOLVEDOR' || isDevEmail;
  // Tema do sidebar: 'light' | 'dark' (sidebar escuro, janelas claras) |
  // 'midnight' (Escuro Total: sidebar + janelas escuros) | 'auto' (segue o SO).
  const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'auto', 'midnight'];
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('sidebar_theme');
    if (stored === 'light' || stored === 'dark' || stored === 'midnight' || stored === 'auto') return stored;
    return 'dark';
  });
  React.useEffect(() => {
    localStorage.setItem('sidebar_theme', themeMode);
  }, [themeMode]);

  // Preferência de cor do SO, usada quando themeMode === 'auto'.
  const [osPrefersDark, setOsPrefersDark] = React.useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setOsPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Modo efetivo já resolvido (Auto vira 'light' ou 'dark' conforme o SO).
  const resolvedThemeMode: 'light' | 'dark' | 'midnight' =
    themeMode === 'auto' ? (osPrefersDark ? 'dark' : 'light') : themeMode;

  // "Escuro total": aplica .theme-midnight na raiz do documento para que o
  // override global de conteúdo (index.css) alcance TODAS as telas, inclusive
  // modais/toasts renderizados em portal fora da árvore do Layout.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-midnight', resolvedThemeMode === 'midnight');
    return () => { root.classList.remove('theme-midnight'); };
  }, [resolvedThemeMode]);

  // Alto contraste: texto e bordas mais fortes para acessibilidade, também
  // aplicado na raiz do documento para alcançar modais/toasts em portal.
  const [highContrast, setHighContrast] = React.useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('high_contrast') === 'true'
  );
  React.useEffect(() => {
    localStorage.setItem('high_contrast', String(highContrast));
    const root = document.documentElement;
    root.classList.toggle('high-contrast', highContrast);
    return () => { root.classList.remove('high-contrast'); };
  }, [highContrast]);

  const cycleTheme = React.useCallback(() => {
    setThemeMode(prev => THEME_ORDER[(THEME_ORDER.indexOf(prev) + 1) % THEME_ORDER.length]);
  }, []);
  const isDarkMode = resolvedThemeMode !== 'light'; // sidebar escuro nos modos escuros
  const isMidnight = resolvedThemeMode === 'midnight';
  const themeLabel = themeMode === 'light'
    ? 'Tema claro'
    : themeMode === 'dark'
      ? 'Tema escuro'
      : themeMode === 'midnight'
        ? 'Escuro total'
        : `Automático (${resolvedThemeMode === 'dark' ? 'escuro' : 'claro'})`;

  const [isPreferencesOpen, setIsPreferencesOpen] = React.useState(false);

  // Tema das "janelas" (área de conteúdo + topo). Só escurece no modo Escuro Total.
  const w = isMidnight
    ? {
        shell: 'bg-[#0f1117]',
        header: 'bg-[#15171e] border-white/5',
        headerIcon: 'text-gray-300',
        main: 'text-gray-200',
      }
    : {
        shell: 'bg-gray-50',
        header: 'bg-white border-gray-200',
        headerIcon: 'text-gray-600',
        main: '',
      };

  const sidebarDark = {
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
  };
  const sidebarMidnight = {
    shell: 'bg-[#0b0d12] text-white border-indigo-500/10',
    searchWrap: 'bg-[#161922] border-transparent focus-within:border-indigo-400/20',
    searchText: 'text-gray-200 placeholder:text-gray-500',
    searchIcon: 'text-gray-500',
    itemText: 'text-gray-300',
    itemHover: 'hover:text-white hover:bg-indigo-500/10',
    itemActive: 'bg-indigo-500/20 text-white',
    itemIcon: 'text-gray-400 group-hover:text-indigo-200',
    itemIconActive: 'text-indigo-200',
    groupLabel: 'text-gray-500',
    divider: 'bg-indigo-500/10',
    dropdownBorder: 'border-indigo-500/10',
    dropdownGroupLabel: 'text-gray-600',
    footerBorder: 'border-indigo-500/10',
    userName: 'text-white',
    userEmail: 'text-gray-500',
    signOut: 'text-gray-400 hover:text-white hover:bg-indigo-500/10',
    toggleTrack: 'bg-indigo-500',
    badgeBgRing: 'border-[#0b0d12]',
    sunIcon: 'text-gray-500',
    moonIcon: 'text-indigo-300',
  };
  const sidebarLight = {
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
  const t = resolvedThemeMode === 'light' ? sidebarLight : resolvedThemeMode === 'midnight' ? sidebarMidnight : sidebarDark;
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isPortalsOpen, setIsPortalsOpen] = React.useState(false);
  const [isVendasOpen, setIsVendasOpen] = React.useState(false);
  const [isDesenvolvimentoImobOpen, setIsDesenvolvimentoImobOpen] = React.useState(false);
  const [isInteligenciaNegociosOpen, setIsInteligenciaNegociosOpen] = React.useState(false);
  const [isCommandOpen, setIsCommandOpen] = React.useState(false);
  const [commandQuery, setCommandQuery] = React.useState('');
  const commandInputRef = React.useRef<HTMLInputElement>(null);
  const engViews = ['dashboard','eng-obras','eng-orcamentos','measure-ai','estrutural','explorer','eng-planejamento','reports','project-settings','eng-obra-types','org-type-templates','area-engine'];
  const [isEngenhariaOpen, setIsEngenhariaOpen] = React.useState(() => engViews.includes(activeView) || activeView.startsWith('eng-'));
  React.useEffect(() => { if (engViews.includes(activeView) || activeView.startsWith('eng-')) setIsEngenhariaOpen(true); }, [activeView]);
  const [isOrganizacaoOpen, setIsOrganizacaoOpen] = React.useState(() => activeView === 'organization');
  React.useEffect(() => { if (activeView === 'organization') setIsOrganizacaoOpen(true); }, [activeView]);
  const especialidadesViews = ['pro-dashboard','offices-dashboard','reformas-dashboard','opura-cno','compliance-dashboard'];
  const [isEspecialidadesOpen, setIsEspecialidadesOpen] = React.useState(() => especialidadesViews.includes(activeView));
  React.useEffect(() => { if (especialidadesViews.includes(activeView)) setIsEspecialidadesOpen(true); }, [activeView]);
  const operacionalViews = ['operacional','project-diary'];
  const [isOperacionalOpen, setIsOperacionalOpen] = React.useState(() => operacionalViews.includes(activeView));
  React.useEffect(() => { if (operacionalViews.includes(activeView)) setIsOperacionalOpen(true); }, [activeView]);
  const qualidadeViews = ['quality','pos-obra'];
  const [isQualidadeOpen, setIsQualidadeOpen] = React.useState(() => qualidadeViews.includes(activeView));
  React.useEffect(() => { if (qualidadeViews.includes(activeView)) setIsQualidadeOpen(true); }, [activeView]);
  const suprimentosViews = ['fluxo-p2p','supplies-contracts','supplies-quotations','supplies-orders','supplies-receipts','plano-aquisicoes','almoxarifado'];
  const [isSuprimentosOpen, setIsSuprimentosOpen] = React.useState(() => suprimentosViews.includes(activeView));
  React.useEffect(() => { if (suprimentosViews.includes(activeView)) setIsSuprimentosOpen(true); }, [activeView]);
  const financeiroViews = ['financial-dashboard','contas-a-receber','client-charges','financial-boletos','boletos-pagar','extrato-bancario','bank-reconciliation','financial-approval','financial-calendar','dunning','financial-intelligence','project-financial', 'fpa-module'];
  const [isFinanceiroOpen, setIsFinanceiroOpen] = React.useState(() => financeiroViews.includes(activeView));
  React.useEffect(() => { if (financeiroViews.includes(activeView)) setIsFinanceiroOpen(true); }, [activeView]);
  const systemConfigViews = ['settings','master-data'];
  const [isSystemConfigOpen, setIsSystemConfigOpen] = React.useState(() => systemConfigViews.includes(activeView));
  React.useEffect(() => { if (systemConfigViews.includes(activeView)) setIsSystemConfigOpen(true); }, [activeView]);
  const [isLaborOpen, setIsLaborOpen] = React.useState(() => activeView.startsWith('labor-'));
  React.useEffect(() => { if (activeView.startsWith('labor-')) setIsLaborOpen(true); }, [activeView]);

  // Preserva o scroll do sidebar entre re-renders E remounts (via sessionStorage)
  const navRef = React.useRef<HTMLElement>(null);
  const NAV_SCROLL_KEY = 'orca_nav_scroll';
  const handleNavScroll = React.useCallback((e: React.UIEvent<HTMLElement>) => {
    sessionStorage.setItem(NAV_SCROLL_KEY, String(e.currentTarget.scrollTop));
  }, []);
  React.useLayoutEffect(() => {
    if (!navRef.current) return;
    const saved = parseInt(sessionStorage.getItem(NAV_SCROLL_KEY) ?? '0', 10);
    if (saved > 0) navRef.current.scrollTop = saved;
  });

  const commandItems = React.useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { id: 'dashboard', label: 'Dashboard', group: 'Geral', icon: LayoutDashboard },
      { id: 'tarefas', label: 'Minhas tarefas', group: 'Geral', icon: CheckSquare, shortcut: 'N' },
      { id: 'notifications-center', label: 'Notificações', group: 'Geral', icon: Bell },
      { id: 'eng-obras', label: 'Obras', group: 'Engenharia', icon: Building2 },
      { id: 'eng-orcamentos', label: 'Orcamentos', group: 'Engenharia', icon: FolderOpen },
      { id: 'eng-planejamento', label: 'Planejamento', group: 'Engenharia', icon: Calendar },
      { id: 'measure-ai', label: 'Medição inteligente', group: 'Engenharia', icon: Calculator },
      { id: 'supplies-contracts', label: 'Contratos', group: 'Suprimentos', icon: FileText },
      { id: 'supplies-quotations', label: 'Cotações', group: 'Suprimentos', icon: FileText },
      { id: 'supplies-orders', label: 'Pedidos', group: 'Suprimentos', icon: Package },
      { id: 'financial-dashboard', label: 'Dashboard financeiro', group: 'Financeiro', icon: DollarSign },
      { id: 'project-financial', label: 'Contas a pagar', group: 'Financeiro', icon: DollarSign },
      { id: 'contas-a-receber', label: 'Contas a receber', group: 'Financeiro', icon: TrendingUp },
      { id: 'sales', label: 'Vendas de ativos', group: 'Comercial', icon: Building2 },
      { id: 'empreendimentos', label: 'Empreendimentos', group: 'Comercial', icon: Building2 },
      { id: 'imovib', label: 'Estudos de viabilidade', group: 'Comercial', icon: BarChart3 },
      { id: 'opura-docs', label: 'Documentos', group: 'Corporativo', icon: FolderOpen },
      { id: 'opura-assets', label: 'Ativos', group: 'Corporativo', icon: Package },
      { id: 'opura-processos', label: 'Processos', group: 'Corporativo', icon: ClipboardList },
      { id: 'settings', label: 'Configurações', group: 'Sistema', icon: Settings },
      { id: 'master-data', label: 'Cadastros', group: 'Sistema', icon: Database },
      { id: 'action-new-record', label: 'Novo registro', group: 'Ação rápida', icon: Plus, shortcut: 'N' },
      { id: 'action-focus-filters', label: 'Abrir filtros da lista', group: 'Ação rápida', icon: Filter },
      { id: 'action-config-columns', label: 'Configurar colunas', group: 'Ação rápida', icon: Columns3 },
      { id: 'action-sort', label: 'Ordenar dados', group: 'Ação rápida', icon: ArrowUpDown },
    ];

    return items;
  }, []);

  const activeCommand = React.useMemo(
    () => commandItems.find(item => item.id === activeView),
    [activeView, commandItems]
  );

  const filteredCommands = React.useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return commandItems.slice(0, 12);
    return commandItems
      .filter(item => `${item.label} ${item.group}`.toLowerCase().includes(q))
      .slice(0, 18);
  }, [commandItems, commandQuery]);

  const openCommandPalette = React.useCallback(() => {
    setIsCommandOpen(true);
    setCommandQuery('');
    window.setTimeout(() => commandInputRef.current?.focus(), 0);
  }, []);

  const runCommand = React.useCallback((item: CommandItem) => {
    if (item.id.startsWith('action-')) {
      setToast({
        title: item.label,
        message: 'Use a toolbar do módulo atual para executar esta ação quando disponível.'
      });
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToast(null), 4500);
    } else {
      onChangeView(item.id);
    }
    setIsCommandOpen(false);
  }, [onChangeView]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandPalette();
      } else if (event.key === '/' && !isTyping) {
        event.preventDefault();
        openCommandPalette();
      } else if (event.key === 'Escape') {
        setIsCommandOpen(false);
        setIsMobileMenuOpen(false);
        setIsProfileMenuOpen(false);
        setIsHeaderEmpresaDropdownOpen(false);
        setIsEmpresaDropdownOpen(false);
      } else if (!isTyping && event.key.toLowerCase() === 'n') {
        const quick = commandItems.find(item => item.id === 'action-new-record');
        if (quick) runCommand(quick);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandItems, openCommandPalette, runCommand]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [openTaskCount, setOpenTaskCount] = React.useState(0);
  const [toast, setToast] = React.useState<{ title: string; message: string } | null>(null);
  const toastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMenuToast = React.useCallback((title: string, message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ title, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4500);
    setIsProfileMenuOpen(false);
  }, []);

  const handleProfileNavigate = React.useCallback((view: string, tab?: 'organizations' | 'settings' | 'users') => {
    if (tab) setManagementTab(tab);
    onChangeView(view);
    setIsProfileMenuOpen(false);
  }, [onChangeView, setManagementTab]);

  const handleSignOut = React.useCallback(() => {
    setIsProfileMenuOpen(false);
    supabase.auth.signOut().finally(() => logout());
  }, [logout]);

  React.useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isProfileMenuOpen]);
  React.useEffect(() => {
    taskService.openCount().then(setOpenTaskCount).catch(() => {});
    // Atualiza ao navegar para manter o badge sincronizado
  }, [activeView]);

  const fetchUnreadCount = React.useCallback(async () => {
    if (!profile.email && !isDev) return;
    const emailToFilter = isDev ? undefined : profile.email;

    try {
      const notifications = await notificationService.listNotifications(emailToFilter);
      const count = notifications.filter(n => !n.isRead).length;
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  }, [profile.email, isDev]);

  React.useEffect(() => {
    if (!profile.email && !isDev) return;

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

  // ── Alertas de Tarefas (in-app + browser push) ─────────────────────────────
  const ALERTED_KEY = 'orca_alerted_tasks'; // IDs já notificados nesta sessão
  const alertedRef = React.useRef<Set<string>>(
    new Set(JSON.parse(sessionStorage.getItem(ALERTED_KEY) ?? '[]'))
  );

  const showTaskAlert = React.useCallback((title: string, body: string) => {
    // Browser Notification (se permitido)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`🔔 ${title}`, { body, icon: '/favicon.ico' });
    }
    // Toast in-app (sempre)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ title: `🔔 ${title}`, message: body });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 10000);
  }, []);

  React.useEffect(() => {
    // Solicita permissão para notificações do browser
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const checkAlerts = async () => {
      try {
        const now = new Date().toISOString();
        const { data } = await supabase
          .from('tasks')
          .select('id, title, description, alert_at, due_date')
          .lte('alert_at', now)
          .is('alert_sent_at', null)
          .neq('status', 'done')
          .limit(10);

        if (!data) return;
        for (const task of data) {
          if (alertedRef.current.has(task.id)) continue;
          alertedRef.current.add(task.id);
          sessionStorage.setItem(ALERTED_KEY, JSON.stringify([...alertedRef.current]));

          const alertTime = new Date(task.alert_at).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          });
          showTaskAlert(
            task.title,
            task.description
              ? `${task.description.slice(0, 80)}${task.description.length > 80 ? '…' : ''}`
              : `Alerta agendado para ${alertTime}`,
          );
        }
      } catch {
        // silencioso — não bloqueia a UI
      }
    };

    checkAlerts();
    const alertInterval = setInterval(checkAlerts, 60_000);
    return () => clearInterval(alertInterval);
  }, []); // executa uma vez ao montar; o interval cuida do restante

  return (
    <NavContext.Provider value={{ activeView, isCollapsed, t, onChangeView, setIsMobileMenuOpen }}>
    <div className={`flex h-screen overflow-hidden font-sans relative ${w.shell}`}>
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col border-r shadow-2xl relative z-20 transition-all duration-300 ease-in-out ${t.shell} ${isCollapsed ? 'w-[68px]' : 'w-[260px]'}`}>
        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-9 w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-md hover:bg-slate-700 transition-colors z-30"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Header Logo */}
        <div className={`flex items-center h-[60px] relative overflow-hidden ${isCollapsed ? 'justify-center' : 'px-4'}`}>
          {isCollapsed ? (
            <div className="w-9 h-9 rounded-lg bg-[#0F172A] flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg" style={{ fontFamily: 'Inter, sans-serif' }}>O</span>
            </div>
          ) : (
            <img
              src="/opura-logo.svg"
              alt="Opura"
              className="h-9 w-auto"
              style={isDarkMode ? { filter: 'brightness(0) invert(1)' } : undefined}
            />
          )}
        </div>

        {/* Global Search */}
        {!isCollapsed && (
          <div className="px-3 pt-2 pb-2">
            <button
              type="button"
              onClick={openCommandPalette}
              className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left ${t.searchWrap}`}
              title="Busca global (Ctrl/Cmd+K)"
            >
              <Search className={`w-4 h-4 ${t.searchIcon}`} strokeWidth={2} />
              <span className={`flex-1 text-sm ${t.searchText}`}>Buscar no Opura...</span>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${t.groupLabel}`}>Ctrl K</span>
            </button>
          </div>
        )}
        {/* Navigation */}
        <nav ref={navRef} onScroll={handleNavScroll} className={`flex-1 overflow-y-auto scrollbar-hide ${isCollapsed ? 'px-2' : 'px-3'} py-2`}>
          {(profile.group === 'USUARIO' || profile.group === 'DESENVOLVEDOR' || isDevEmail) && (
            <>
              <NavItem id="central" icon={LayoutDashboard} label="Central de Controle" forceFull />

              <NavDropdown
                label="Especialidades"
                icon={Briefcase}
                isOpen={isEspecialidadesOpen}
                onToggle={() => {
                  if (isCollapsed) { onChangeView('pro-dashboard'); }
                  else { setIsEspecialidadesOpen(o => !o); }
                }}
                hasActiveChild={especialidadesViews.includes(activeView)}
              >
                {(mod.pro       || isDev) && <DropdownItem id="pro-dashboard"      label="ÒPURA Pro"      icon={Briefcase} />}
                {(mod.offices   || isDev) && <DropdownItem id="offices-dashboard"  label="ÒPURA Offices"  icon={Palette} />}
                {(mod.reformas  || isDev) && <DropdownItem id="reformas-dashboard" label="ÒPURA Reformas" icon={Hammer} />}
                {(mod.compliance || isDev) && <DropdownItem id="opura-cno" label="ÒPURA CNO e Previdência" icon={Calculator} />}
                {(mod.compliance || isDev) && <DropdownItem id="compliance-dashboard" label="ÒPURA Compliance" icon={Shield} />}
              </NavDropdown>

              <NavItem id="tarefas" icon={CheckSquare} label="Minhas Tarefas" badge={openTaskCount || undefined} />
              <NavItem id="notifications-center" icon={Bell} label="Notificações" badge={unreadCount > 0 ? unreadCount : undefined} />

              <NavGroup label="Inteligência de Negócios" />
              <NavDropdown
                label="Análises e Dados"
                icon={Search}
                isOpen={isInteligenciaNegociosOpen}
                onToggle={() => {
                  if (isCollapsed) { onChangeView('bi-executivo'); }
                  else { setIsInteligenciaNegociosOpen(o => !o); }
                }}
                hasActiveChild={['bi-executivo','opura-reports','opura-central-obra','opura-central-cliente','opura-central-fornecedor','opura-market','opura-governance'].includes(activeView)}
              >
                <DropdownItem id="bi-executivo" label="BI Executivo" icon={BarChart3} />
                <DropdownItem id="opura-reports" label="ÒPURA Relatórios" icon={BarChart3} />
                <DropdownItem id="opura-central-obra" label="Central de Obras" icon={Building2} />
                <DropdownItem id="opura-central-cliente" label="Central de Clientes" icon={Users} />
                <DropdownItem id="opura-central-fornecedor" label="Central de Fornecedores" icon={Truck} />
                <DropdownItem id="opura-market" label="ÒPURA Market" icon={Search} />
                {(mod.compliance || isDev) && <DropdownItem id="opura-governance" label="Governança Corporativa" icon={Shield} />}
              </NavDropdown>

              <NavGroup label="Operacional" />

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
                            <div className={`text-xs truncate ${t.userEmail}`}>
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

              <NavDropdown
                label="Minha Organização"
                icon={Building2}
                isOpen={isOrganizacaoOpen}
                onToggle={() => {
                  if (isCollapsed) { onChangeView('organization'); }
                  else { setIsOrganizacaoOpen(o => !o); }
                }}
                hasActiveChild={activeView === 'organization'}
              >
                {([
                  { id: 'organizations', label: 'Organização', icon: Building2 },
                  { id: 'empresas_grupo', label: 'Grupo', icon: Building2 },
                  { id: 'clients', label: 'Clientes', icon: Users },
                  { id: 'investors', label: 'Investidores', icon: TrendingUp },
                  { id: 'suppliers', label: 'Fornecedores', icon: Truck },
                  { id: 'users', label: 'Usuários', icon: Users },
                  { id: 'accounts', label: 'Contas', icon: DollarSign },
                  { id: 'cost_centers', label: 'Centros', icon: Filter },
                ] as const).map(tab => (
                  <DropdownItem
                    key={tab.id}
                    id={`organization-${tab.id}`}
                    label={tab.label}
                    icon={tab.icon}
                    isActiveOverride={activeView === 'organization' && managementTab === tab.id}
                    onClickOverride={() => { setManagementTab(tab.id); onChangeView('organization'); }}
                  />
                ))}
              </NavDropdown>
              <NavItem id="opura-assets" icon={Package} label="Gestão de Ativos" />
              <NavItem id="opura-docs" icon={FolderOpen} label="Gestão de Documentos" />
              <NavItem id="opura-processos" icon={ClipboardList} label="Processos" />

              {(mod.obras || isDev) && (
                <>
                  <NavDropdown
                    label="Engenharia"
                    icon={Hammer}
                    isOpen={isEngenhariaOpen}
                    onToggle={() => {
                      if (isCollapsed) { onChangeView('eng-obras'); }
                      else { setIsEngenhariaOpen(o => !o); }
                    }}
                    hasActiveChild={engViews.includes(activeView) || activeView.startsWith('eng-')}
                  >
                    <DropdownItem id="dashboard" label="Dashboard" icon={LayoutDashboard} />
                    <DropdownItem id="eng-obras" label="Obras" icon={Building2} />
                    <DropdownItem id="org-type-templates" label="Templates de Obra" icon={Layers} />
                    <DropdownItem id="eng-orcamentos" label="Orçamentos" icon={FolderOpen} />
                    <DropdownItem id="explorer" label="Composições" icon={BookOpen} />
                    <DropdownItem id="eng-planejamento" label="Planejamento" icon={Calendar} />
                    <DropdownItem id="reports" label="Relatórios" icon={FileText} />
                    <DropdownItem id="measure-ai" label="Medição Inteligente" icon={Calculator} />
                    <DropdownItem id="estrutural" label="Ferragem & Aço" icon={Layers} />
                    <DropdownItem id="project-settings" label="Dados Técnicos" icon={Calculator} />
                    <DropdownItem id="eng-obra-types" label="Tipos de Obra" icon={Layers} />
                    <DropdownItem id="area-engine" label="Áreas NBR 12721" icon={FileSpreadsheet} />
                  </NavDropdown>

                  <NavDropdown
                    label="Operacional"
                    icon={ClipboardList}
                    isOpen={isOperacionalOpen}
                    onToggle={() => {
                      if (isCollapsed) { onChangeView('operacional'); }
                      else { setIsOperacionalOpen(o => !o); }
                    }}
                    hasActiveChild={operacionalViews.includes(activeView)}
                  >
                    <DropdownItem id="operacional" label="Controle Operacional" icon={ClipboardList} />
                    <DropdownItem id="project-diary" label="Diário de Obra" icon={BookOpen} />
                  </NavDropdown>

                  <NavDropdown
                    label="Qualidade"
                    icon={Activity}
                    isOpen={isQualidadeOpen}
                    onToggle={() => {
                      if (isCollapsed) { onChangeView('quality'); }
                      else { setIsQualidadeOpen(o => !o); }
                    }}
                    hasActiveChild={qualidadeViews.includes(activeView)}
                  >
                    <DropdownItem id="quality" label="Qualidade e Entrega" icon={Activity} />
                    <DropdownItem id="pos-obra" label="Pós obra e garantia" icon={Shield} />
                  </NavDropdown>
                </>
              )}

              {(mod.rh || isDev) && (
                <NavDropdown
                  label="Recursos Humanos"
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
                  <DropdownItem id="labor-cargos" label="Cargos & Funções" icon={Briefcase} />
                  <DropdownItem id="labor-teams" label="Equipes" icon={Shield} />
                  <DropdownItem id="labor-ats" label="Recrutamento" icon={Briefcase} />
                  <DropdownItem id="labor-termination" label="Desligamentos" icon={TrendingDown} />

                  <DropdownGroupLabel label="Financeiro" />
                  <DropdownItem id="labor-costs" label="Custos" icon={DollarSign} />
                  <DropdownItem id="labor-payroll" label="Folha" icon={Calculator} />
                  <DropdownItem id="labor-allocations" label="Alocações" icon={Target} />
                  <DropdownItem id="labor-encargos" label="Encargos Sociais" icon={Percent} />
                  <DropdownItem id="labor-vale-refeicao" label="Vale Refeição" icon={UtensilsCrossed} />
                  <DropdownItem id="labor-esocial" label="eSocial" icon={FileText} />
                  <DropdownItem id="labor-remuneracao-societaria" label="Remuneração Societária" icon={Banknote} />

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

                  <DropdownGroupLabel label="Estratégico" />
                  <DropdownItem id="labor-incentivos" label="Incentivos & Produtividade" icon={Gift} />
                  <DropdownItem id="labor-evaluation" label="Avaliação 360°" icon={Trophy} />
                  <DropdownItem id="labor-bi-analytics" label="BI Analytics RH" icon={BarChart3} />
                  <DropdownItem id="labor-comunicacao" label="Comunicação" icon={MessageSquare} />
                  <DropdownItem id="labor-portal" label="Portal Colaborador" icon={Layers} />

                  <DropdownGroupLabel label="Configurações" />
                  <DropdownItem id="labor-fiscal" label="Config. Fiscais" icon={Settings} />
                  <DropdownItem id="labor-rubrics" label="Rubricas" icon={Shield} />
                </NavDropdown>
              )}

              {(mod.compras || isDev) && (
                <>
                  <NavDropdown
                    label="Suprimentos"
                    icon={Truck}
                    isOpen={isSuprimentosOpen}
                    onToggle={() => {
                      if (isCollapsed) { onChangeView('supplies-contracts'); }
                      else { setIsSuprimentosOpen(o => !o); }
                    }}
                    hasActiveChild={suprimentosViews.includes(activeView)}
                  >
                    <DropdownItem id="fluxo-p2p" label="Fluxo Integrado (P2P)" icon={Workflow} />
                    <DropdownItem id="plano-aquisicoes" label="Plano de Aquisições" icon={ClipboardList} />
                    <DropdownItem id="supplies-contracts" label="Contratos" icon={FileText} />
                    <DropdownItem id="supplies-quotations" label="Cotações" icon={FileText} />
                    <DropdownItem id="supplies-orders" label="Pedidos" icon={Package} />
                    <DropdownItem id="supplies-receipts" label="Recebimento" icon={Truck} />
                    <DropdownItem id="almoxarifado" label="Almoxarifado" icon={Warehouse} />
                  </NavDropdown>
                </>
              )}

              {(mod.financeiro || mod.fiscal || mod.compliance || isDev) && (
                <>
                  <NavDropdown
                    label="Financeiro"
                    icon={DollarSign}
                    isOpen={isFinanceiroOpen}
                    onToggle={() => {
                      if (isCollapsed) { onChangeView('project-financial'); }
                      else { setIsFinanceiroOpen(o => !o); }
                    }}
                    hasActiveChild={financeiroViews.includes(activeView)}
                  >
                    {(mod.financeiro || isDev) && (
                      <>
                        <DropdownItem id="financial-dashboard" label="Dashboard" icon={LayoutDashboard} />
                        <DropdownItem id="fpa-module" label="FP&A" icon={Calculator} />
                        <DropdownItem id="contas-a-receber" label="Contas a Receber" icon={TrendingUp} />
                        <DropdownItem id="financial-boletos" label="Boletos ao Cliente" icon={Receipt} />
                        <DropdownItem id="project-financial" label="Contas a Pagar" icon={DollarSign} />
                        <DropdownItem id="boletos-pagar" label="Captura de Boletos" icon={Banknote} />
                        <DropdownItem id="extrato-bancario" label="Extrato Bancário" icon={FileText} />
                        <DropdownItem id="bank-reconciliation" label="Conciliação Bancária" icon={ArrowRightLeft} />
                        <DropdownItem id="financial-calendar" label="Calendário" icon={Calendar} />
                        <DropdownItem id="dunning" label="Cobrança Auto." icon={Bell} />
                        <DropdownItem id="financial-approval" label="Aprovações" icon={Shield} />
                        <DropdownItem id="financial-intelligence" label="Inteligência" icon={Brain} />
                      </>
                    )}
                  </NavDropdown>
                </>
              )}

              {(mod.crm || isDev) && (
                <>
                  <NavDropdown
                    label="Comercial"
                    icon={TrendingUp}
                    isOpen={isVendasOpen}
                    onToggle={() => setIsVendasOpen(o => !o)}
                    hasActiveChild={['gestao-vendas','sales','rentals','services-commercial','service-contracts','broker-proposals','broker-leads','broker-commissions','broker-materials','broker-ranking','broker-training','broker-events','broker-chat','broker-analytics','broker-health','broker-integrations'].includes(activeView)}
                  >
                    <DropdownItem id="sales" label="Vendas de Ativos" icon={Building2} />
                    <DropdownItem id="rentals" label="Locações" icon={Building2} />
                    <DropdownItem id="service-contracts" label="Contratos de Serviço" icon={FileText} />
                    <DropdownItem id="services-commercial" label="CRM Serviços" icon={Briefcase} />
                  </NavDropdown>
                </>
              )}

              {(mod.incorporacao || isDev) && (
                <>
                  <NavDropdown
                    label="Desenvolvimento Imobiliário"
                    icon={Building2}
                    isOpen={isDesenvolvimentoImobOpen}
                    onToggle={() => setIsDesenvolvimentoImobOpen(o => !o)}
                    hasActiveChild={['opportunities','opura-market','planta-ai','imovib','empreendimentos','area-engine','investor-portal'].includes(activeView)}
                  >
                    <DropdownGroupLabel label="Desenvolvimento de Negócios" />
                    <DropdownItem id="opportunities" label="Oportunidades" icon={Building2} />
                    <DropdownItem id="opura-market" label="Inteligência de Mercado" icon={Search} />
                    <DropdownItem id="planta-ai" label="Estudo de Massa (Planta AI)" icon={Brain} />
                    <DropdownItem id="imovib" label="Estudos de Viabilidade" icon={BarChart3} />

                    <DropdownGroupLabel label="Incorporação Imobiliária" />
                    <DropdownItem id="empreendimentos" label="Empreendimentos" icon={Building2} />
                    <DropdownItem id="area-engine" label="Áreas NBR 12721" icon={FileSpreadsheet} />
                    <DropdownItem id="investor-portal" label="Portal do Investidor / SPE" icon={TrendingUp} />
                  </NavDropdown>
                </>
              )}

              {(isDev || canManageOrganization) ? (
                <>
                  <NavDropdown
                    label="Portais"
                    icon={Shield}
                    isOpen={isPortalsOpen}
                    onToggle={() => setIsPortalsOpen(o => !o)}
                    hasActiveChild={['client-properties','investor-portal','supplier-area','partner-workspaces-admin','broker-area'].includes(activeView)}
                  >
                    <DropdownItem id="client-properties" label="Portal do Cliente" icon={Building2} />
                    <DropdownItem id="investor-portal" label="Portal do Investidor" icon={TrendingUp} />
                    <DropdownItem id="supplier-area" label="Portal do Fornecedor" icon={Truck} />
                    <DropdownItem id="partner-workspaces-admin" label="Portal de Parceiros" icon={Users} />
                    {(mod.broker_portal || isDev) && (
                      <DropdownItem id="broker-area" label="Portal do Corretor" icon={Briefcase} />
                    )}
                  </NavDropdown>
                </>
              ) : (
                <>
                  <NavItem id="client-area" icon={User} label="Visão do Cliente" />
                </>
              )}

              {(mod.fiscal || isDev) && (
                <>
                  <NavItem id="fiscal-nfe" icon={Receipt} label="Fiscal e NF-e" />
                  <NavItem id="automation" icon={Zap} label="Automação" />
                </>
              )}

              <NavItem id="controladoria" icon={BarChart3} label="Controladoria" />
            </>
          )}

          {profile.group === 'CLIENTE' && (
            <>
              <NavGroup label="Minha Área" />
              <NavItem id="dashboard" icon={Building2} label={profile.role === 'ALUGUEL' ? 'Minhas Locações' : 'Meus Imóveis'} />
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
          <NavDropdown
            label="Configurações"
            icon={Settings}
            isOpen={isSystemConfigOpen}
            onToggle={() => {
              if (isCollapsed) { onChangeView('settings'); }
              else { setIsSystemConfigOpen(o => !o); }
            }}
            hasActiveChild={systemConfigViews.includes(activeView)}
          >
            <DropdownItem id="settings" icon={Settings} label="Configurações" />
            <DropdownItem id="master-data" icon={Database} label="Cadastros" />
          </NavDropdown>
        </nav>

        {/* Footer discreto: contexto ativo + alternância de tema */}
        <div className={`border-t px-3 py-2.5 ${t.footerBorder}`}>
          <div className="flex items-center justify-between gap-2">
            {!isCollapsed && (
              <div className="min-w-0 flex-1" title={activeContextLabel}>
                <div className={`truncate text-xs font-medium ${t.itemText}`}>{activeContextLabel}</div>
              </div>
            )}
            <button
              type="button"
              onClick={cycleTheme}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${t.itemHover} ${t.itemIcon} ${isCollapsed ? 'mx-auto' : ''}`}
              title={themeLabel}
              aria-label={themeLabel}
            >
              <ThemeModeIcon mode={themeMode} className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Sidebar - Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className={`relative flex flex-col w-[280px] h-full shadow-2xl animate-in slide-in-from-left duration-300 ${t.shell}`}>
            <div className={`flex items-center justify-between h-[60px] px-4 border-b ${t.footerBorder}`}>
              <div className="flex items-center">
                <img
                  src="/opura-logo.svg"
                  alt="Opura"
                  className="h-9 w-auto"
                  style={isDarkMode ? { filter: 'brightness(0) invert(1)' } : undefined}
                />
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className={`p-2 transition-colors ${t.signOut}`}
                aria-label="Fechar menu"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex-1 py-6 px-4 overflow-y-auto">
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" forceFull />

              <div className="space-y-1 mb-4">
                <div className="px-4 py-2 text-xs font-black text-gray-500 uppercase tracking-widest">Especialidades</div>
                {(mod.pro       || isDev) && <NavItem id="pro-dashboard"      icon={Briefcase} label="ÒPURA Pro"      forceFull />}
                {(mod.offices   || isDev) && <NavItem id="offices-dashboard"  icon={Palette}   label="ÒPURA Offices"  forceFull />}
                {(mod.reformas  || isDev) && <NavItem id="reformas-dashboard" icon={Hammer}    label="ÒPURA Reformas" forceFull />}
                {(mod.compliance || isDev) && <NavItem id="opura-cno" icon={Calculator} label="ÒPURA CNO e Previdência" forceFull />}
                {(mod.compliance || isDev) && <NavItem id="compliance-dashboard" icon={Shield} label="ÒPURA Compliance" forceFull />}
              </div>

              <NavItem id="tarefas" icon={CheckSquare} label="Minhas Tarefas" badge={openTaskCount || undefined} forceFull />
              <NavItem id="notifications-center" icon={Bell} label="Notificações" badge={unreadCount > 0 ? unreadCount : undefined} forceFull />
              {(profile.group === 'DESENVOLVEDOR' || isDevEmail || canManageOrganization) ? (
                <div className="space-y-1 mb-4">
                  <div className="px-4 py-2 text-xs font-black text-gray-500 uppercase tracking-widest">Portais</div>
                  <NavItem id="client-properties" icon={Building2} label="Meus Imóveis" forceFull />
                  <NavItem id="investor-area" icon={TrendingUp} label="Área do Investidor" forceFull />
                  <NavItem id="supplier-area" icon={Truck} label="Portal do Fornecedor" forceFull />
                  <NavItem id="broker-area" icon={Briefcase} label="Portal do Corretor" forceFull />
                  <NavItem id="partner-workspaces-admin" icon={Users} label="Portal de Parceiros" forceFull />
                </div>
              ) : (
                <NavItem id="client-area" icon={User} label="Área do Cliente" forceFull />
              )}

              <NavGroup label="Inteligência de Negócios" />
              <NavItem id="imovib" icon={TrendingUp} label="Estudos de Viabilidade" forceFull />
              <NavItem id="planta-ai" icon={Brain} label="ÒPURA Planta AI" forceFull />
              <NavItem id="opura-market" icon={Search} label="ÒPURA Market" forceFull />

              <NavItem id="quality" icon={Activity} label="Qualidade & Entrega" forceFull />

              {(mod.compliance || isDev) && (
                <NavItem id="opura-governance" icon={Shield} label="Governança Corporativa" forceFull />
              )}
              <NavItem id="opura-assets" icon={Package} label="Gestão de Ativos" forceFull />
              <NavItem id="opura-docs" icon={FolderOpen} label="Gestão de Documentos" forceFull />

              <NavGroup label="Suprimentos" />
              <NavItem id="fluxo-p2p" icon={Workflow} label="Fluxo Integrado (P2P)" forceFull />
              <NavItem id="plano-aquisicoes" icon={ClipboardList} label="Plano de Aquisições" forceFull />
              <NavItem id="supplies-orders" icon={Package} label="Pedidos" forceFull />
              <NavItem id="supplies-receipts" icon={Truck} label="Recebimento" forceFull />
              <NavItem id="almoxarifado" icon={Warehouse} label="Almoxarifado" forceFull />
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
        {/* Utility Header */}
        <header className={`flex h-[60px] border-b items-center gap-3 px-4 md:px-6 shrink-0 sticky top-0 z-30 ${w.header}`}>
          <button className="md:hidden rounded-lg p-2 hover:bg-slate-100" onClick={() => setIsMobileMenuOpen(true)} title="Abrir menu">
            <Menu className={`w-5 h-5 ${w.headerIcon}`} />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 hidden sm:block">
              <div className="truncate text-sm font-semibold text-slate-900">
                {activeCommand?.label ?? 'Opura'}
              </div>
              <div className="truncate text-xs text-slate-500">
                {activeCommand?.group ?? profile.role}
              </div>
            </div>

            <div className="relative hidden min-w-[180px] max-w-[320px] flex-1 lg:block">
              <button
                type="button"
                onClick={() => { setIsHeaderEmpresaDropdownOpen(o => !o); setIsProfileMenuOpen(false); }}
                className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                title="Empresa ou obra ativa"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: activeEmpresa?.cor_sistema ?? '#2563EB' }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {activeEmpresa?.nome_fantasia ?? activeEmpresa?.razao_social ?? projectName ?? 'Contexto atual'}
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isHeaderEmpresaDropdownOpen ? 'rotate-90' : ''}`} />
              </button>
              {isHeaderEmpresaDropdownOpen && companies.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  {companies.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setActiveEmpresaId(c.id); setIsHeaderEmpresaDropdownOpen(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${c.id === activeEmpresaId ? 'bg-slate-100 text-slate-950' : 'text-slate-700'}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.cor_sistema ?? '#2563EB' }} />
                      <span className="min-w-0 flex-1 truncate">{c.nome_fantasia ?? c.razao_social}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-10 w-[280px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 hover:border-slate-300 hover:bg-white md:flex xl:w-[360px]"
            title="Busca global (Ctrl/Cmd+K)"
          >
            <Search className="h-4 w-4 text-slate-400" />
            <span className="flex-1 truncate">Buscar contratos, obras, fornecedores...</span>
            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Ctrl K</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openCommandPalette}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
              title="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Ajuda e atalhos"
              onClick={openCommandPalette}
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Notificações"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}
            </button>

            {activeView === 'analytic' && (
              <button
                onClick={onSaveProject}
                disabled={isSaving}
                className="flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                <span className="hidden sm:inline">{isSaving ? 'Salvando' : 'Salvar'}</span>
              </button>
            )}

            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => { setIsProfileMenuOpen(o => !o); setIsHeaderEmpresaDropdownOpen(false); }}
                className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-left hover:bg-slate-50"
                title={profile.email ?? profile.role}
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  {userInitial}
                </span>
                <span className="hidden min-w-0 lg:block">
                  <span className="block max-w-[140px] truncate text-sm font-semibold text-slate-900">{userName}</span>
                  <span className="block max-w-[140px] truncate text-xs text-slate-500">{roleLabel}</span>
                </span>
                <ChevronRight className={`hidden h-4 w-4 shrink-0 text-slate-400 transition-transform sm:block ${isProfileMenuOpen ? 'rotate-90' : ''}`} />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-full z-[1000] mt-2 w-[300px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" role="menu">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                        {userInitial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">{userName}</div>
                        <div className="truncate text-xs text-slate-500">{profile.email ?? roleLabel}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-b border-slate-100 p-2">
                    <button
                      type="button"
                      onClick={() => showMenuToast('Minha conta', 'Tela dedicada de conta ainda nao esta disponivel.')}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                    >
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="flex-1">Minha conta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsProfileMenuOpen(false); setIsPreferencesOpen(true); }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                    >
                      <ThemeModeIcon mode={themeMode} className="h-4 w-4 text-slate-400" />
                      <span className="flex-1">Preferências</span>
                      <span className="text-xs text-slate-400">{themeLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => showMenuToast('Seguranca', 'Tela de senha e seguranca sera conectada ao perfil do usuario.')}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                    >
                      <Shield className="h-4 w-4 text-slate-400" />
                      <span className="flex-1">Seguranca</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProfileNavigate('notifications-center')}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                    >
                      <Bell className="h-4 w-4 text-slate-400" />
                      <span className="flex-1">Notificacoes</span>
                      {unreadCount > 0 && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">{unreadCount}</span>}
                    </button>
                  </div>

                  <div className="border-b border-slate-100 p-2">
                    <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contexto</div>
                    <div className="mx-3 mb-1 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" title={activeContextLabel}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: activeEmpresa?.cor_sistema ?? '#2563EB' }} />
                      <span className="min-w-0 flex-1 truncate">{activeContextLabel}</span>
                    </div>
                    {companies.length > 1 && companies.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setActiveEmpresaId(c.id); setIsProfileMenuOpen(false); }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${c.id === activeEmpresaId ? 'text-slate-950' : 'text-slate-600'}`}
                        role="menuitem"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.cor_sistema ?? '#2563EB' }} />
                        <span className="min-w-0 flex-1 truncate">{c.nome_fantasia ?? c.razao_social}</span>
                        {c.id === activeEmpresaId && <span className="text-xs font-semibold text-slate-400">Atual</span>}
                      </button>
                    ))}
                    {canManageOrganization && (
                      <button
                        type="button"
                        onClick={() => handleProfileNavigate('organization', 'settings')}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        role="menuitem"
                      >
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <span className="flex-1">Configuracoes da organizacao</span>
                      </button>
                    )}
                  </div>

                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() => { setIsProfileMenuOpen(false); openCommandPalette(); }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                    >
                      <HelpCircle className="h-4 w-4 text-slate-400" />
                      <span className="flex-1">Ajuda e comandos</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                      role="menuitem"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="flex-1">Sair</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        {/* Content Body */}
        <main className={`flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide relative ${w.main}`}>
          {children}
        </main>
      </div>

      {/* Command Palette */}
      {isCommandOpen && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setIsCommandOpen(false)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4">
              <Command className="h-5 w-5 text-slate-400" />
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                className="h-full flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Buscar modulo, obra, contrato ou comando..."
              />
              <button
                type="button"
                onClick={() => setIsCommandOpen(false)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Fechar"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="text-sm font-semibold text-slate-900">Nenhum resultado encontrado.</div>
                  <div className="mt-1 text-sm text-slate-500">Tente buscar por modulo, rotina ou acao.</div>
                </div>
              ) : (
                filteredCommands.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => runCommand(item)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-100"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{item.label}</span>
                        <span className="block truncate text-xs text-slate-500">{item.group}</span>
                      </span>
                      {item.shortcut && <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{item.shortcut}</span>}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
              <span>Ctrl/Cmd K busca global</span>
              <span>/ foca busca</span>
              <span>Esc fecha</span>
            </div>
          </div>
        </div>
      )}
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

      <PreferencesSheet
        open={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        resolvedThemeMode={resolvedThemeMode}
        highContrast={highContrast}
        setHighContrast={setHighContrast}
      />
    </div>
    </NavContext.Provider>
  );
};

export default Layout;
