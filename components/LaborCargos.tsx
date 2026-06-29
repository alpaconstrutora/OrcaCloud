import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
    Briefcase, Plus, Trash2, Pencil, X, Building2, Loader2, AlertCircle,
    Layers, DollarSign, Star, ChevronRight, Wrench, Tag, Settings, LayoutGrid, GitBranch
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { orgGovernanceService } from '../services/orgGovernanceService';
import { laborService, Employee } from '../services/laborService';
import { useConfirm } from './ui/confirm';
import { OrgRole, OrgFuncao, OrgFuncaoCategoria } from '../types';

interface LaborCargosProps { orgId: string; }
interface CompanyOption { id: string; razao_social: string; tipo: string; }

interface RoleForm {
    id?: string; nome: string; codigo: string; descricao: string;
    nivel_hierarquico: number; responsabilidades: string;
    salario_minimo: string; salario_maximo: string;
    competencias: string; proximo_cargo_id: string; funcao_id: string;
}
interface FuncaoForm { id?: string; nome: string; descricao: string; categoria_id: string; }
interface CatForm { id?: string; nome: string; cor: string; }
interface RoleNode { role: OrgRole; children: RoleNode[]; }
interface SvgLine { x1: number; y1: number; x2: number; y2: number; id: string; }

const EMPTY_ROLE: RoleForm = {
    nome: '', codigo: '', descricao: '', nivel_hierarquico: 3,
    responsabilidades: '', salario_minimo: '', salario_maximo: '',
    competencias: '', proximo_cargo_id: '', funcao_id: '',
};
const EMPTY_FUNCAO: FuncaoForm = { nome: '', descricao: '', categoria_id: '' };
const EMPTY_CAT: CatForm = { nome: '', cor: 'slate' };

const COLORS: { value: string; label: string; bg: string; text: string; border: string; dot: string }[] = [
    { value: 'slate',   label: 'Cinza',   bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',  dot: 'bg-slate-400' },
    { value: 'orange',  label: 'Laranja', bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200', dot: 'bg-orange-400' },
    { value: 'blue',    label: 'Azul',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-400' },
    { value: 'indigo',  label: 'Índigo',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200', dot: 'bg-indigo-400' },
    { value: 'emerald', label: 'Verde',   bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',dot: 'bg-emerald-400' },
    { value: 'violet',  label: 'Violeta', bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200', dot: 'bg-violet-400' },
    { value: 'rose',    label: 'Rosa',    bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',   dot: 'bg-rose-400' },
    { value: 'amber',   label: 'Âmbar',  bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-400' },
    { value: 'teal',    label: 'Teal',    bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',   dot: 'bg-teal-400' },
    { value: 'cyan',    label: 'Ciano',   bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',   dot: 'bg-cyan-400' },
];
const colorOf = (cor: string) => COLORS.find(c => c.value === cor) ?? COLORS[0];
const BRL = (v: number | null | undefined) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }) : null;

const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none text-sm";
const labelCls = "text-[10px] text-slate-500 font-black uppercase tracking-widest";

// ── Org chart tree builder ──────────────────────────────────────────────────
function buildOrgTree(roles: OrgRole[]): { trees: RoleNode[]; isolated: OrgRole[] } {
    const roleSet = new Set(roles.map(r => r.id));
    // childrenOf[X] = roles that promote INTO X
    const childrenOf = new Map<string, OrgRole[]>();
    roles.forEach(r => {
        if (r.proximo_cargo_id && roleSet.has(r.proximo_cargo_id)) {
            if (!childrenOf.has(r.proximo_cargo_id)) childrenOf.set(r.proximo_cargo_id, []);
            childrenOf.get(r.proximo_cargo_id)!.push(r);
        }
    });
    // Roots = roles with no parent in-company (top of career chain)
    const isRoot = (r: OrgRole) => !r.proximo_cargo_id || !roleSet.has(r.proximo_cargo_id);
    const treeRoots = roles.filter(r => isRoot(r) && childrenOf.has(r.id));
    const standaloneRoots = roles.filter(r => isRoot(r) && !childrenOf.has(r.id));

    // Track visited to detect cycles — unvisited roles (caught in a cycle) fall back to isolated
    const visited = new Set<string>();

    function buildNode(role: OrgRole): RoleNode {
        visited.add(role.id);
        const children = (childrenOf.get(role.id) || []).filter(c => !visited.has(c.id));
        return { role, children: children.map(buildNode) };
    }

    const trees = treeRoots.map(buildNode);
    standaloneRoots.forEach(r => visited.add(r.id));

    // Any role not yet visited (cycle or orphan) also becomes isolated
    const missed = roles.filter(r => !visited.has(r.id));

    return { trees, isolated: [...standaloneRoots, ...missed] };
}

// ── Compact org chart card ──────────────────────────────────────────────────
interface OrgCardProps {
    role: OrgRole;
    nodeRef: (el: HTMLDivElement | null) => void;
    funcaoById: Record<string, OrgFuncao>;
    catById: Record<string, OrgFuncaoCategoria>;
    employees: Employee[];
    onEdit: () => void;
    onDelete: () => void;
    isRoot?: boolean;
}
const OrgCard: React.FC<OrgCardProps> = ({ role, nodeRef, funcaoById, catById, employees, onEdit, onDelete, isRoot }) => {
    const [hovered, setHovered] = useState(false);
    const occupants = employees.filter(e => e.role_id === role.id && e.status === 'ATIVO');
    const funcao = role.funcao_id ? funcaoById[role.funcao_id] : null;
    const cat = funcao?.categoria_id ? catById[funcao.categoria_id] : null;
    const clr = cat ? colorOf(cat.cor) : null;

    return (
        <div
            ref={nodeRef}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`
                relative w-48 select-none rounded-2xl border-2 p-3 transition-all duration-200 bg-white text-left
                ${isRoot
                    ? 'border-indigo-300 shadow-lg shadow-indigo-900/10'
                    : 'border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md'}
            `}
            style={{ minHeight: 80 }}
        >
            {/* Nivel badge */}
            <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${isRoot ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                    Nível {role.nivel_hierarquico}
                </span>
                {role.codigo && (
                    <span className="text-[9px] text-slate-400 font-mono">{role.codigo}</span>
                )}
            </div>

            {/* Nome */}
            <h4 className="font-black text-[13px] text-slate-900 leading-tight">{role.nome}</h4>

            {/* Funcao chip */}
            {funcao && (
                <div className={`mt-1.5 flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md w-fit ${clr ? `${clr.bg} ${clr.text} ${clr.border} border` : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                    <Wrench className="w-2 h-2 shrink-0" />
                    <span className="truncate max-w-[90px]">{funcao.nome}</span>
                </div>
            )}

            {/* Salary */}
            {BRL(role.salario_minimo) && (
                <div className="mt-1.5 flex items-center gap-1 text-[9px] text-violet-700 font-bold">
                    <DollarSign className="w-2.5 h-2.5" />
                    {BRL(role.salario_minimo)}{role.salario_maximo ? `–${BRL(role.salario_maximo)}` : ''}
                </div>
            )}

            {/* Occupants */}
            <div className="mt-2 flex flex-wrap gap-1">
                {occupants.length === 0
                    ? <span className="text-[9px] bg-rose-50 text-rose-500 border border-rose-100 px-1.5 py-0.5 rounded-md font-bold">Vago</span>
                    : occupants.slice(0, 2).map(occ => (
                        <span key={occ.id} className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-md font-bold truncate max-w-[80px]">
                            {occ.name.split(' ')[0]}
                        </span>
                    ))
                }
                {occupants.length > 2 && (
                    <span className="text-[9px] text-slate-400 font-bold">+{occupants.length - 2}</span>
                )}
            </div>

            {/* Action buttons on hover */}
            {hovered && (
                <div className="absolute top-2 right-2 flex gap-1 bg-white/90 rounded-lg border border-slate-100 shadow-sm p-0.5">
                    <button onClick={e => { e.stopPropagation(); onEdit(); }}
                        className="text-slate-400 hover:text-indigo-600 p-1 rounded-md hover:bg-slate-50">
                        <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); onDelete(); }}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-slate-50">
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
};

// ── Recursive org tree node ─────────────────────────────────────────────────
interface OrgNodeProps {
    node: RoleNode;
    nodeRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
    funcaoById: Record<string, OrgFuncao>;
    catById: Record<string, OrgFuncaoCategoria>;
    employees: Employee[];
    onEdit: (r: OrgRole) => void;
    onDelete: (r: OrgRole) => void;
    depth?: number;
}
const OrgNode: React.FC<OrgNodeProps> = ({ node, nodeRefs, funcaoById, catById, employees, onEdit, onDelete, depth = 0 }) => (
    <div className="flex flex-col items-center" style={{ gap: 0 }}>
        <OrgCard
            role={node.role}
            nodeRef={el => { nodeRefs.current[node.role.id] = el; }}
            funcaoById={funcaoById}
            catById={catById}
            employees={employees}
            onEdit={() => onEdit(node.role)}
            onDelete={() => onDelete(node.role)}
            isRoot={depth === 0}
        />
        {node.children.length > 0 && (
            <div className="flex items-start justify-center gap-6" style={{ paddingTop: 48 }}>
                {node.children.map(child => (
                    <OrgNode
                        key={child.role.id}
                        node={child}
                        nodeRefs={nodeRefs}
                        funcaoById={funcaoById}
                        catById={catById}
                        employees={employees}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        depth={depth + 1}
                    />
                ))}
            </div>
        )}
    </div>
);

// ── Org Chart View ──────────────────────────────────────────────────────────
interface OrgChartViewProps {
    roles: OrgRole[];
    employees: Employee[];
    funcaoById: Record<string, OrgFuncao>;
    catById: Record<string, OrgFuncaoCategoria>;
    onEdit: (r: OrgRole) => void;
    onDelete: (r: OrgRole) => void;
}
const OrgChartView: React.FC<OrgChartViewProps> = ({ roles, employees, funcaoById, catById, onEdit, onDelete }) => {
    const { trees, isolated } = useMemo(() => buildOrgTree(roles), [roles]);
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [lines, setLines] = useState<SvgLine[]>([]);
    const [svgDims, setSvgDims] = useState({ w: 0, h: 0 });

    const measure = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const cRect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        const newLines: SvgLine[] = [];

        roles.forEach(role => {
            if (!role.proximo_cargo_id) return;
            const childEl = nodeRefs.current[role.id];
            const parentEl = nodeRefs.current[role.proximo_cargo_id];
            if (!childEl || !parentEl) return;
            const childRect = childEl.getBoundingClientRect();
            const parentRect = parentEl.getBoundingClientRect();
            newLines.push({
                id: `${role.id}->${role.proximo_cargo_id}`,
                x1: parentRect.left + parentRect.width / 2 - cRect.left + scrollLeft,
                y1: parentRect.bottom - cRect.top + scrollTop,
                x2: childRect.left + childRect.width / 2 - cRect.left + scrollLeft,
                y2: childRect.top - cRect.top + scrollTop,
            });
        });

        setSvgDims({ w: container.scrollWidth, h: container.scrollHeight });
        setLines(newLines);
    }, [roles]);

    useLayoutEffect(() => {
        measure();
        const ro = new ResizeObserver(measure);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, [measure]);

    if (trees.length === 0 && isolated.length === 0) {
        return (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-sm">
                Nenhum cargo cadastrado. Clique em <strong>Novo Cargo</strong> para começar.
            </div>
        );
    }

    // Render isolated roles as single-node trees alongside connected trees
    const isolatedNodes: RoleNode[] = isolated.map(r => ({ role: r, children: [] }));
    const allTrees = [...trees, ...isolatedNodes];

    return (
        <div className="space-y-6">
            <div
                ref={containerRef}
                className="relative overflow-x-auto overflow-y-visible rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white"
                style={{ minHeight: 200 }}
            >
                {/* SVG overlay for connections */}
                <svg
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
                    width={svgDims.w}
                    height={svgDims.h}
                >
                    {lines.map(line => {
                        const midY = (line.y1 + line.y2) / 2;
                        return (
                            <g key={line.id}>
                                <path
                                    d={`M ${line.x1} ${line.y1} C ${line.x1} ${midY} ${line.x2} ${midY} ${line.x2} ${line.y2}`}
                                    stroke="#e2e8f0"
                                    strokeWidth={4}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <path
                                    d={`M ${line.x1} ${line.y1} C ${line.x1} ${midY} ${line.x2} ${midY} ${line.x2} ${line.y2}`}
                                    stroke="#6366f1"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 3"
                                    fill="none"
                                    strokeLinecap="round"
                                    opacity={0.6}
                                />
                                <circle cx={line.x2} cy={line.y2} r={3} fill="#6366f1" opacity={0.5} />
                            </g>
                        );
                    })}
                </svg>

                {/* All trees (connected + isolated) side by side */}
                <div className="flex items-start justify-center gap-10 p-10 flex-wrap" style={{ minWidth: 'fit-content' }}>
                    {allTrees.map(tree => (
                        <OrgNode
                            key={tree.role.id}
                            node={tree}
                            nodeRefs={nodeRefs}
                            funcaoById={funcaoById}
                            catById={catById}
                            employees={employees}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────
const LaborCargos: React.FC<LaborCargosProps> = ({ orgId }) => {
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState<'cargos' | 'funcoes'>('cargos');
    const [cargosView, setCargosView] = useState<'organograma' | 'lista'>('organograma');
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [roles, setRoles] = useState<OrgRole[]>([]);
    const [funcoes, setFuncoes] = useState<OrgFuncao[]>([]);
    const [categorias, setCategorias] = useState<OrgFuncaoCategoria[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Cargo modal
    const [isRoleOpen, setIsRoleOpen] = useState(false);
    const [roleForm, setRoleForm] = useState<RoleForm>(EMPTY_ROLE);
    const [savingRole, setSavingRole] = useState(false);

    // Função modal
    const [isFuncaoOpen, setIsFuncaoOpen] = useState(false);
    const [funcaoForm, setFuncaoForm] = useState<FuncaoForm>(EMPTY_FUNCAO);
    const [savingFuncao, setSavingFuncao] = useState(false);

    // Categorias painel
    const [catPanelOpen, setCatPanelOpen] = useState(false);
    const [catForm, setCatForm] = useState<CatForm>(EMPTY_CAT);
    const [editingCatId, setEditingCatId] = useState<string | null>(null);
    const [savingCat, setSavingCat] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!orgId) { setLoading(false); return; }
        supabase.from('companies').select('id, razao_social, tipo').eq('org_id', orgId)
            .then(({ data, error: e }) => {
                if (cancelled) return;
                if (e) { setError(e.message); setLoading(false); return; }
                setCompanies(data || []);
                if (data && data.length > 0) setSelectedCompanyId(data[0].id);
                else setLoading(false);
            });
        return () => { cancelled = true; };
    }, [orgId]);

    useEffect(() => {
        let cancelled = false;
        if (!selectedCompanyId) { setLoading(false); return; }
        setLoading(true); setError(null);
        Promise.all([
            orgGovernanceService.listRoles(selectedCompanyId),
            orgGovernanceService.listFuncoes(selectedCompanyId),
            orgGovernanceService.listCategorias(selectedCompanyId),
            laborService.listEmployees(orgId || undefined, selectedCompanyId),
        ]).then(([r, f, c, e]) => {
            if (cancelled) return;
            setRoles(r); setFuncoes(f); setCategorias(c); setEmployees(e);
        }).catch(err => { if (!cancelled) setError((err as Error).message); })
          .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [selectedCompanyId, orgId]);

    const reloadAll = async () => {
        const [r, f, c] = await Promise.all([
            orgGovernanceService.listRoles(selectedCompanyId),
            orgGovernanceService.listFuncoes(selectedCompanyId),
            orgGovernanceService.listCategorias(selectedCompanyId),
        ]);
        setRoles(r); setFuncoes(f); setCategorias(c);
    };

    // ── Cargo ──────────────────────────────────────────────
    const openCreateRole = () => { setRoleForm(EMPTY_ROLE); setIsRoleOpen(true); };
    const openEditRole = (role: OrgRole) => {
        setRoleForm({
            id: role.id, nome: role.nome, codigo: role.codigo || '',
            descricao: role.descricao || '', nivel_hierarquico: role.nivel_hierarquico,
            responsabilidades: (role.responsabilidades || []).join('\n'),
            salario_minimo: role.salario_minimo != null ? String(role.salario_minimo) : '',
            salario_maximo: role.salario_maximo != null ? String(role.salario_maximo) : '',
            competencias: (role.competencias || []).join('\n'),
            proximo_cargo_id: role.proximo_cargo_id || '',
            funcao_id: role.funcao_id || '',
        });
        setIsRoleOpen(true);
    };
    const handleSaveRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roleForm.nome || !selectedCompanyId) return;
        setSavingRole(true);
        try {
            await orgGovernanceService.saveRole({
                id: roleForm.id, company_id: selectedCompanyId, nome: roleForm.nome,
                codigo: roleForm.codigo || null, descricao: roleForm.descricao || null,
                nivel_hierarquico: roleForm.nivel_hierarquico,
                responsabilidades: roleForm.responsabilidades.split('\n').map(s => s.trim()).filter(Boolean),
                salario_minimo: roleForm.salario_minimo ? Number(roleForm.salario_minimo) : null,
                salario_maximo: roleForm.salario_maximo ? Number(roleForm.salario_maximo) : null,
                competencias: roleForm.competencias.split('\n').map(s => s.trim()).filter(Boolean),
                proximo_cargo_id: roleForm.proximo_cargo_id || null,
                funcao_id: roleForm.funcao_id || null,
            });
            setIsRoleOpen(false); setRoleForm(EMPTY_ROLE); await reloadAll();
        } catch (err) { alert('Erro ao salvar cargo: ' + (err as Error).message); }
        finally { setSavingRole(false); }
    };
    const handleDeleteRole = async (role: OrgRole) => {
        const occ = employees.filter(e => e.role_id === role.id && e.status === 'ATIVO').length;
        const msg = occ > 0 ? `Este cargo tem ${occ} colaborador(es) ativo(s). Eles ficarão sem cargo.` : 'Isso removerá o cargo definitivamente.';
        if (!await confirm({ title: `Excluir cargo ${role.nome}?`, message: msg, variant: 'danger', confirmLabel: 'Excluir' })) return;
        try { await orgGovernanceService.deleteRole(role.id); setRoles(roles.filter(r => r.id !== role.id)); }
        catch (err) { alert('Erro: ' + (err as Error).message); }
    };

    // ── Função ─────────────────────────────────────────────
    const openCreateFuncao = () => { setFuncaoForm(EMPTY_FUNCAO); setIsFuncaoOpen(true); };
    const openEditFuncao = (f: OrgFuncao) => {
        setFuncaoForm({ id: f.id, nome: f.nome, descricao: f.descricao || '', categoria_id: f.categoria_id || '' });
        setIsFuncaoOpen(true);
    };
    const handleSaveFuncao = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!funcaoForm.nome || !selectedCompanyId) return;
        setSavingFuncao(true);
        try {
            await orgGovernanceService.saveFuncao({
                id: funcaoForm.id, company_id: selectedCompanyId,
                nome: funcaoForm.nome, descricao: funcaoForm.descricao || null,
                categoria_id: funcaoForm.categoria_id || null,
            });
            setIsFuncaoOpen(false); setFuncaoForm(EMPTY_FUNCAO); await reloadAll();
        } catch (err) { alert('Erro ao salvar função: ' + (err as Error).message); }
        finally { setSavingFuncao(false); }
    };
    const handleDeleteFuncao = async (f: OrgFuncao) => {
        const used = roles.filter(r => r.funcao_id === f.id).length;
        const msg = used > 0 ? `Esta função é usada por ${used} cargo(s). Eles ficarão sem função associada.` : 'Isso removerá a função definitivamente.';
        if (!await confirm({ title: `Excluir função ${f.nome}?`, message: msg, variant: 'danger', confirmLabel: 'Excluir' })) return;
        try {
            await orgGovernanceService.deleteFuncao(f.id);
            setFuncoes(funcoes.filter(fn => fn.id !== f.id));
            setRoles(roles.map(r => r.funcao_id === f.id ? { ...r, funcao_id: null } : r));
        } catch (err) { alert('Erro: ' + (err as Error).message); }
    };

    // ── Categoria ───────────────────────────────────────────
    const startCreateCat = () => { setCatForm(EMPTY_CAT); setEditingCatId(null); };
    const startEditCat = (c: OrgFuncaoCategoria) => { setCatForm({ id: c.id, nome: c.nome, cor: c.cor }); setEditingCatId(c.id); };
    const cancelCat = () => { setCatForm(EMPTY_CAT); setEditingCatId(null); };
    const handleSaveCat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!catForm.nome || !selectedCompanyId) return;
        setSavingCat(true);
        try {
            await orgGovernanceService.saveCategoria({ id: catForm.id, company_id: selectedCompanyId, nome: catForm.nome, cor: catForm.cor });
            setCatForm(EMPTY_CAT); setEditingCatId(null); await reloadAll();
        } catch (err) { alert('Erro ao salvar categoria: ' + (err as Error).message); }
        finally { setSavingCat(false); }
    };
    const handleDeleteCat = async (cat: OrgFuncaoCategoria) => {
        const used = funcoes.filter(f => f.categoria_id === cat.id).length;
        const msg = used > 0 ? `Esta categoria é usada por ${used} função(ões). Elas ficarão sem categoria.` : 'Isso removerá a categoria definitivamente.';
        if (!await confirm({ title: `Excluir categoria ${cat.nome}?`, message: msg, variant: 'danger', confirmLabel: 'Excluir' })) return;
        try { await orgGovernanceService.deleteCategoria(cat.id); setCategorias(categorias.filter(c => c.id !== cat.id)); }
        catch (err) { alert('Erro: ' + (err as Error).message); }
    };

    if (!orgId) return (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-800 max-w-lg mx-auto mt-10">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-amber-500" />
            <h3 className="font-black text-sm uppercase tracking-wider">Selecione uma organização</h3>
        </div>
    );

    const vacantCount = roles.filter(r => !employees.some(e => e.role_id === r.id && e.status === 'ATIVO')).length;
    const niveis = Array.from(new Set(roles.map(r => r.nivel_hierarquico))).sort((a, b) => a - b);
    const funcaoById = Object.fromEntries(funcoes.map(f => [f.id, f]));
    const catById = Object.fromEntries(categorias.map(c => [c.id, c]));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-indigo-600" /> Cargos &amp; Funções
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Estrutura de cargos e funções da empresa.</p>
                </div>
                <div className="flex items-center gap-3">
                    {companies.length > 1 && (
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)}
                                className="text-xs font-bold text-slate-600 outline-none bg-transparent min-w-[160px]">
                                {companies.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                            </select>
                        </div>
                    )}
                    <button onClick={activeTab === 'cargos' ? openCreateRole : openCreateFuncao}
                        disabled={!selectedCompanyId}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg shadow-indigo-900/20 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">
                        <Plus className="w-4 h-4" />{activeTab === 'cargos' ? 'Novo Cargo' : 'Nova Função'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                {([{ key: 'cargos', label: 'Cargos', icon: Briefcase }, { key: 'funcoes', label: 'Funções', icon: Wrench }] as const).map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Icon className="w-4 h-4" />{label}
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${activeTab === key ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                            {key === 'cargos' ? roles.length : funcoes.length}
                        </span>
                    </button>
                ))}
            </div>

            {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" /><p className="font-bold">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
            ) : companies.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-800 max-w-lg mx-auto">
                    <Building2 className="w-10 h-10 mx-auto mb-3 text-amber-500" />
                    <h3 className="font-black text-sm uppercase tracking-wider">Nenhuma empresa cadastrada</h3>
                </div>
            ) : activeTab === 'cargos' ? (
                <>
                    {/* Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Cargos', val: roles.length, icon: Briefcase, color: 'indigo' },
                            { label: 'Níveis', val: niveis.length, icon: Layers, color: 'emerald' },
                            { label: 'Vagos', val: vacantCount, icon: AlertCircle, color: 'amber' },
                            { label: 'Com Faixa Salarial', val: roles.filter(r => r.salario_minimo != null).length, icon: DollarSign, color: 'violet' },
                        ].map(({ label, val, icon: Icon, color }) => (
                            <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                    <h3 className="text-3xl font-black text-slate-900 mt-1">{val}</h3>
                                </div>
                                <div className={`p-3 bg-${color}-50 rounded-xl`}><Icon className={`w-6 h-6 text-${color}-600`} /></div>
                            </div>
                        ))}
                    </div>

                    {/* View toggle */}
                    {roles.length > 0 && (
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                                <button
                                    onClick={() => setCargosView('organograma')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${cargosView === 'organograma' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <GitBranch className="w-3.5 h-3.5" /> Organograma
                                </button>
                                <button
                                    onClick={() => setCargosView('lista')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${cargosView === 'lista' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <LayoutGrid className="w-3.5 h-3.5" /> Lista
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    {roles.length === 0 ? (
                        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-sm">
                            Nenhum cargo estruturado. Clique em <strong>Novo Cargo</strong> para começar.
                        </div>
                    ) : cargosView === 'organograma' ? (
                        <OrgChartView
                            roles={roles}
                            employees={employees}
                            funcaoById={funcaoById}
                            catById={catById}
                            onEdit={openEditRole}
                            onDelete={handleDeleteRole}
                        />
                    ) : (
                        // Lista view
                        <div className="space-y-6">
                            {niveis.map(nivel => (
                                <div key={nivel}>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Nível {nivel}</span>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {roles.filter(r => r.nivel_hierarquico === nivel).map(role => {
                                            const occupants = employees.filter(e => e.role_id === role.id && e.status === 'ATIVO');
                                            const proximo = role.proximo_cargo_id ? roles.find(r => r.id === role.proximo_cargo_id) : null;
                                            const funcao = role.funcao_id ? funcaoById[role.funcao_id] : null;
                                            const cat = funcao?.categoria_id ? catById[funcao.categoria_id] : null;
                                            const clr = cat ? colorOf(cat.cor) : null;
                                            return (
                                                <div key={role.id} className="bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md p-4 rounded-2xl transition-all flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">{role.codigo || 'S/C'}</span>
                                                            <h4 className="font-black text-sm text-slate-900">{role.nome}</h4>
                                                        </div>
                                                        {funcao && (
                                                            <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md w-fit ${clr ? `${clr.bg} ${clr.text} ${clr.border} border` : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                                                                <Wrench className="w-2.5 h-2.5" />{funcao.nome}{cat ? ` · ${cat.nome}` : ''}
                                                            </div>
                                                        )}
                                                        {role.descricao && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{role.descricao}</p>}
                                                        {BRL(role.salario_minimo) && (
                                                            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-lg w-fit font-bold">
                                                                <DollarSign className="w-3 h-3" />{BRL(role.salario_minimo)}{role.salario_maximo ? ` – ${BRL(role.salario_maximo)}` : ''}
                                                            </div>
                                                        )}
                                                        {role.competencias?.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {role.competencias.slice(0, 3).map((c, i) => (
                                                                    <span key={i} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                                                                        <Star className="w-2.5 h-2.5" />{c}
                                                                    </span>
                                                                ))}
                                                                {role.competencias.length > 3 && <span className="text-[10px] text-slate-400 px-1">+{role.competencias.length - 3}</span>}
                                                            </div>
                                                        )}
                                                        {proximo && (
                                                            <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                                                                <ChevronRight className="w-3 h-3" />Trilha: {proximo.nome}
                                                            </div>
                                                        )}
                                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                                            {occupants.length === 0
                                                                ? <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-md font-bold">Vago</span>
                                                                : occupants.map(occ => <span key={occ.id} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md font-bold">{occ.name}</span>)
                                                            }
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => openEditRole(role)} className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50"><Pencil className="w-4 h-4" /></button>
                                                        <button onClick={() => handleDeleteRole(role)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* ── FUNÇÕES TAB ─────────────────────────────────── */
                <>
                    <div className="flex items-center justify-between">
                        <div className="grid grid-cols-3 gap-4 flex-1">
                            {[
                                { label: 'Funções', val: funcoes.length, icon: Wrench, color: 'indigo' },
                                { label: 'Vinculadas a Cargos', val: funcoes.filter(f => roles.some(r => r.funcao_id === f.id)).length, icon: Briefcase, color: 'emerald' },
                                { label: 'Categorias', val: categorias.length, icon: Tag, color: 'violet' },
                            ].map(({ label, val, icon: Icon, color }) => (
                                <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                        <h3 className="text-3xl font-black text-slate-900 mt-1">{val}</h3>
                                    </div>
                                    <div className={`p-3 bg-${color}-50 rounded-xl`}><Icon className={`w-6 h-6 text-${color}-600`} /></div>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => { setCatPanelOpen(!catPanelOpen); cancelCat(); }}
                            className={`ml-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all ${catPanelOpen ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700'}`}>
                            <Settings className="w-4 h-4" /> Categorias
                        </button>
                    </div>

                    {/* Painel Categorias */}
                    {catPanelOpen && (
                        <div className="bg-white border border-violet-100 rounded-2xl p-5 space-y-4 shadow-sm">
                            <h4 className="text-sm font-black text-slate-800 flex items-center gap-2"><Tag className="w-4 h-4 text-violet-600" /> Gerenciar Categorias</h4>
                            <div className="space-y-2">
                                {categorias.map(cat => {
                                    const clr = colorOf(cat.cor);
                                    const isEditing = editingCatId === cat.id;
                                    return (
                                        <div key={cat.id} className="flex items-center gap-3">
                                            {isEditing ? (
                                                <form onSubmit={handleSaveCat} className="flex-1 flex items-center gap-2 flex-wrap">
                                                    <input autoFocus required value={catForm.nome}
                                                        onChange={e => setCatForm({ ...catForm, nome: e.target.value })}
                                                        className="flex-1 min-w-[140px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400" />
                                                    <div className="flex gap-1.5">
                                                        {COLORS.map(c => (
                                                            <button key={c.value} type="button" onClick={() => setCatForm({ ...catForm, cor: c.value })} title={c.label}
                                                                className={`w-6 h-6 rounded-full ${c.dot} transition-all ${catForm.cor === c.value ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100'}`} />
                                                        ))}
                                                    </div>
                                                    <button type="submit" disabled={savingCat} className="px-3 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700">
                                                        {savingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
                                                    </button>
                                                    <button type="button" onClick={cancelCat} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200">Cancelar</button>
                                                </form>
                                            ) : (
                                                <>
                                                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${clr.bg} ${clr.text} ${clr.border}`}>
                                                        <span className={`w-2 h-2 rounded-full ${clr.dot}`} />{cat.nome}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">{funcoes.filter(f => f.categoria_id === cat.id).length} função(ões)</span>
                                                    <div className="flex gap-1 ml-auto">
                                                        <button onClick={() => startEditCat(cat)} className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteCat(cat)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {editingCatId === null && (
                                <form onSubmit={handleSaveCat} className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                                    <input required placeholder="Nome da nova categoria..." value={catForm.nome}
                                        onChange={e => setCatForm({ ...catForm, nome: e.target.value })}
                                        className="flex-1 min-w-[160px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400" />
                                    <div className="flex gap-1.5">
                                        {COLORS.map(c => (
                                            <button key={c.value} type="button" onClick={() => setCatForm({ ...catForm, cor: c.value })} title={c.label}
                                                className={`w-6 h-6 rounded-full ${c.dot} transition-all ${catForm.cor === c.value ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100'}`} />
                                        ))}
                                    </div>
                                    <button type="submit" disabled={savingCat} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700">
                                        {savingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Adicionar</>}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Funções grid agrupado por categoria */}
                    {funcoes.length === 0 ? (
                        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-sm">
                            Nenhuma função cadastrada. Funções são categorias reutilizáveis atribuídas a múltiplos cargos.
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {categorias.map(cat => {
                                const catFuncoes = funcoes.filter(f => f.categoria_id === cat.id);
                                if (catFuncoes.length === 0) return null;
                                const clr = colorOf(cat.cor);
                                return (
                                    <div key={cat.id}>
                                        <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 mb-3 ${clr.text}`}>
                                            <span className={`w-2 h-2 rounded-full ${clr.dot}`} />{cat.nome}
                                        </span>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {catFuncoes.map(f => {
                                                const cargosCount = roles.filter(r => r.funcao_id === f.id).length;
                                                return (
                                                    <div key={f.id} className="bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md p-4 rounded-2xl transition-all flex items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${clr.bg} ${clr.text} ${clr.border}`}>{cat.nome}</span>
                                                                <h4 className="font-black text-sm text-slate-900">{f.nome}</h4>
                                                            </div>
                                                            {f.descricao && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{f.descricao}</p>}
                                                            <div className="mt-2">
                                                                {cargosCount === 0
                                                                    ? <span className="text-[10px] text-slate-400 italic">Não atribuída a nenhum cargo</span>
                                                                    : <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md font-bold">{cargosCount} cargo{cargosCount > 1 ? 's' : ''}</span>
                                                                }
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button onClick={() => openEditFuncao(f)} className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50"><Pencil className="w-4 h-4" /></button>
                                                            <button onClick={() => handleDeleteFuncao(f)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50"><Trash2 className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {funcoes.filter(f => !f.categoria_id).length > 0 && (
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">Sem categoria</span>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {funcoes.filter(f => !f.categoria_id).map(f => {
                                            const cargosCount = roles.filter(r => r.funcao_id === f.id).length;
                                            return (
                                                <div key={f.id} className="bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md p-4 rounded-2xl transition-all flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="font-black text-sm text-slate-900">{f.nome}</h4>
                                                        {f.descricao && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{f.descricao}</p>}
                                                        <div className="mt-2">
                                                            {cargosCount === 0
                                                                ? <span className="text-[10px] text-slate-400 italic">Não atribuída a nenhum cargo</span>
                                                                : <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md font-bold">{cargosCount} cargo{cargosCount > 1 ? 's' : ''}</span>
                                                            }
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => openEditFuncao(f)} className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50"><Pencil className="w-4 h-4" /></button>
                                                        <button onClick={() => handleDeleteFuncao(f)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ── Modal: Cargo ─────────────────────────────────── */}
            {isRoleOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-900">{roleForm.id ? 'Editar Cargo' : 'Novo Cargo'}</h3>
                            <button onClick={() => setIsRoleOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveRole} className="space-y-5 text-sm">
                            <div className="space-y-3">
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Identificação</p>
                                <div className="space-y-1">
                                    <label className={labelCls}>Nome do Cargo *</label>
                                    <input type="text" required autoFocus placeholder="Ex: Engenheiro Civil Pleno" value={roleForm.nome}
                                        onChange={e => setRoleForm({ ...roleForm, nome: e.target.value })} className={inputCls} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className={labelCls}>Código</label>
                                        <input type="text" placeholder="Ex: ENG_CIV_PL" value={roleForm.codigo}
                                            onChange={e => setRoleForm({ ...roleForm, codigo: e.target.value })} className={inputCls} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelCls}>Nível Hierárquico *</label>
                                        <input type="number" min={1} required value={roleForm.nivel_hierarquico}
                                            onChange={e => setRoleForm({ ...roleForm, nivel_hierarquico: Number(e.target.value) })} className={inputCls} />
                                    </div>
                                </div>
                                {funcoes.length > 0 && (
                                    <div className="space-y-1">
                                        <label className={labelCls}>Função (catálogo)</label>
                                        <select value={roleForm.funcao_id} onChange={e => setRoleForm({ ...roleForm, funcao_id: e.target.value })} className={inputCls}>
                                            <option value="">— Nenhuma —</option>
                                            {categorias.map(cat => {
                                                const cats = funcoes.filter(f => f.categoria_id === cat.id);
                                                if (cats.length === 0) return null;
                                                return (
                                                    <optgroup key={cat.id} label={cat.nome}>
                                                        {cats.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                                    </optgroup>
                                                );
                                            })}
                                            {funcoes.filter(f => !f.categoria_id).length > 0 && (
                                                <optgroup label="Sem categoria">
                                                    {funcoes.filter(f => !f.categoria_id).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                                </optgroup>
                                            )}
                                        </select>
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <label className={labelCls}>Descrição</label>
                                    <textarea placeholder="Resumo do cargo..." value={roleForm.descricao}
                                        onChange={e => setRoleForm({ ...roleForm, descricao: e.target.value })} className={inputCls + ' h-16'} />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5"><DollarSign className="w-3 h-3" /> Faixa Salarial</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className={labelCls}>Piso (R$)</label>
                                        <input type="number" min={0} step="0.01" placeholder="5000" value={roleForm.salario_minimo}
                                            onChange={e => setRoleForm({ ...roleForm, salario_minimo: e.target.value })} className={inputCls} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelCls}>Teto (R$)</label>
                                        <input type="number" min={0} step="0.01" placeholder="8000" value={roleForm.salario_maximo}
                                            onChange={e => setRoleForm({ ...roleForm, salario_maximo: e.target.value })} className={inputCls} />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5"><Star className="w-3 h-3" /> Perfil do Cargo</p>
                                <div className="space-y-1">
                                    <label className={labelCls}>Responsabilidades</label>
                                    <textarea placeholder="Uma por linha..." value={roleForm.responsabilidades}
                                        onChange={e => setRoleForm({ ...roleForm, responsabilidades: e.target.value })} className={inputCls + ' h-20'} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelCls}>Competências Requeridas</label>
                                    <textarea placeholder="Uma por linha (ex: AutoCAD, Liderança)..." value={roleForm.competencias}
                                        onChange={e => setRoleForm({ ...roleForm, competencias: e.target.value })} className={inputCls + ' h-20'} />
                                </div>
                            </div>
                            {roles.filter(r => r.id !== roleForm.id).length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5"><ChevronRight className="w-3 h-3" /> Trilha de Carreira</p>
                                    <div className="space-y-1">
                                        <label className={labelCls}>Próximo Cargo (promoção)</label>
                                        <select value={roleForm.proximo_cargo_id} onChange={e => setRoleForm({ ...roleForm, proximo_cargo_id: e.target.value })} className={inputCls}>
                                            <option value="">Nenhum / Topo da carreira</option>
                                            {roles.filter(r => r.id !== roleForm.id).map(r => (
                                                <option key={r.id} value={r.id}>{r.nome} (Nível {r.nivel_hierarquico})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                                <button type="button" onClick={() => setIsRoleOpen(false)} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all">Cancelar</button>
                                <button type="submit" disabled={savingRole} className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-60">
                                    {savingRole && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{roleForm.id ? 'Salvar' : 'Criar Cargo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: Função ─────────────────────────────────── */}
            {isFuncaoOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-900">{funcaoForm.id ? 'Editar Função' : 'Nova Função'}</h3>
                            <button onClick={() => setIsFuncaoOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-xs text-slate-500">Uma <strong>Função</strong> descreve o que a pessoa faz e pode ser usada por vários cargos.</p>
                        <form onSubmit={handleSaveFuncao} className="space-y-4 text-sm">
                            <div className="space-y-1">
                                <label className={labelCls}>Nome da Função *</label>
                                <input type="text" required autoFocus placeholder="Ex: Pedreiro, Mestre de Obras" value={funcaoForm.nome}
                                    onChange={e => setFuncaoForm({ ...funcaoForm, nome: e.target.value })} className={inputCls} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelCls}>Categoria</label>
                                <select value={funcaoForm.categoria_id} onChange={e => setFuncaoForm({ ...funcaoForm, categoria_id: e.target.value })} className={inputCls}>
                                    <option value="">— Sem categoria —</option>
                                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelCls}>Descrição</label>
                                <textarea placeholder="O que faz quem exerce essa função..." value={funcaoForm.descricao}
                                    onChange={e => setFuncaoForm({ ...funcaoForm, descricao: e.target.value })} className={inputCls + ' h-20'} />
                            </div>
                            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                                <button type="button" onClick={() => setIsFuncaoOpen(false)} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all">Cancelar</button>
                                <button type="submit" disabled={savingFuncao} className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-60">
                                    {savingFuncao && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{funcaoForm.id ? 'Salvar' : 'Criar Função'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaborCargos;
