import React from 'react';
import {
    AlertTriangle,
    Calculator,
    CheckCircle2,
    FileSpreadsheet,
    Lock,
    Plus,
    RefreshCw,
    ShieldCheck,
} from 'lucide-react';
import Button from './ui/Button';
import { areaEngineService } from '../services/areaEngineService';
import type {
    AreaEngineRpcResult,
    AreaProject,
    AreaQuadroIIRow,
    AreaQuadroIRow,
    AreaQuadroIVBRow,
    AreaVersion,
    AreaVersionStructure,
} from '../types/areaEngine';

interface AreaEngineModuleProps {
    organizationId?: string;
}

type TableView = 'estrutura' | 'quadro_i' | 'quadro_ii' | 'quadro_ivb';

const statusLabel: Record<string, string> = {
    draft: 'Rascunho',
    calculated: 'Calculada',
    technically_approved: 'Aprov. tecnica',
    legally_approved: 'Aprov. juridica',
    locked: 'Travada',
    superseded: 'Substituida',
    cancelled: 'Cancelada',
};

function formatNumber(value: unknown, digits = 2): string {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '-';
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(n);
}

function shortHash(hash?: string | null): string {
    if (!hash) return '-';
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function statusTone(status?: string): string {
    if (status === 'locked') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'calculated' || status === 'legally_approved' || status === 'technically_approved') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'cancelled' || status === 'superseded') return 'bg-slate-100 text-slate-500 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
}

function RpcFeedback({ result }: { result: AreaEngineRpcResult | null }) {
    if (!result) return null;
    const errors = result.blocking_errors || [];
    const success = result.status === 'success';

    return (
        <div className={`border rounded-lg px-4 py-3 text-sm ${success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <div className="flex items-center gap-2 font-bold">
                {success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span>Status: {result.status}</span>
            </div>
            {errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {errors.map((err, idx) => (
                        <li key={`${err.code}-${idx}`}>
                            <span className="font-mono font-bold">{err.code}</span> - {err.message}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="border border-dashed border-slate-200 rounded-lg bg-white px-5 py-8 text-center text-sm text-slate-500">
            {message}
        </div>
    );
}

export default function AreaEngineModule({ organizationId }: AreaEngineModuleProps) {
    const [projects, setProjects] = React.useState<AreaProject[]>([]);
    const [versions, setVersions] = React.useState<AreaVersion[]>([]);
    const [selectedProjectId, setSelectedProjectId] = React.useState<string>('');
    const [selectedVersionId, setSelectedVersionId] = React.useState<string>('');
    const [structure, setStructure] = React.useState<AreaVersionStructure>({ blocks: [], floors: [], units: [], spaces: [] });
    const [quadroI, setQuadroI] = React.useState<AreaQuadroIRow[]>([]);
    const [quadroII, setQuadroII] = React.useState<AreaQuadroIIRow[]>([]);
    const [quadroIVB, setQuadroIVB] = React.useState<AreaQuadroIVBRow[]>([]);
    const [activeTable, setActiveTable] = React.useState<TableView>('estrutura');
    const [loading, setLoading] = React.useState(false);
    const [actionLoading, setActionLoading] = React.useState<string | null>(null);
    const [feedback, setFeedback] = React.useState<AreaEngineRpcResult | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = React.useState(false);
    const [newProjectName, setNewProjectName] = React.useState('');
    const [newProjectType, setNewProjectType] = React.useState<'vertical' | 'mixed' | 'commercial' | 'residential' | 'horizontal' | 'other'>('vertical');
    const [newVersionLabel, setNewVersionLabel] = React.useState('Versao inicial');
    const [isStructureOpen, setIsStructureOpen] = React.useState(false);
    const [structureUnit1Code, setStructureUnit1Code] = React.useState('Unidade 01');
    const [structureUnit2Code, setStructureUnit2Code] = React.useState('Unidade 02');
    const [structureUnit1Area, setStructureUnit1Area] = React.useState('50');
    const [structureUnit2Area, setStructureUnit2Area] = React.useState('50');
    const [structureCommonArea, setStructureCommonArea] = React.useState('20');

    const selectedVersion = versions.find(v => v.id === selectedVersionId) || null;

    const loadProjects = React.useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setError(null);
        try {
            const rows = await areaEngineService.listProjects(organizationId);
            setProjects(rows);
            setSelectedProjectId(prev => prev || rows[0]?.id || '');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar projetos de area.');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    const loadVersions = React.useCallback(async (projectId: string) => {
        if (!projectId) {
            setVersions([]);
            setSelectedVersionId('');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const rows = await areaEngineService.listVersions(projectId);
            setVersions(rows);
            setSelectedVersionId(prev => rows.some(v => v.id === prev) ? prev : rows[0]?.id || '');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar versoes de area.');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadResults = React.useCallback(async (versionId: string) => {
        if (!versionId) {
            setQuadroI([]);
            setQuadroII([]);
            setQuadroIVB([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [structureData, qi, qii, qivb] = await Promise.all([
                areaEngineService.getStructure(versionId),
                areaEngineService.listQuadroI(versionId),
                areaEngineService.listQuadroII(versionId),
                areaEngineService.listQuadroIVB(versionId),
            ]);
            setStructure(structureData);
            setQuadroI(qi);
            setQuadroII(qii);
            setQuadroIVB(qivb);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar quadros.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { void loadProjects(); }, [loadProjects]);
    React.useEffect(() => { void loadVersions(selectedProjectId); }, [selectedProjectId, loadVersions]);
    React.useEffect(() => { void loadResults(selectedVersionId); }, [selectedVersionId, loadResults]);

    async function runAction(action: string, fn: () => Promise<AreaEngineRpcResult>) {
        setActionLoading(action);
        setError(null);
        try {
            const result = await fn();
            setFeedback(result);
            if (selectedProjectId) await loadVersions(selectedProjectId);
            if (selectedVersionId) await loadResults(selectedVersionId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao executar acao.');
        } finally {
            setActionLoading(null);
        }
    }

    async function createAreaProject(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!organizationId) return;

        const name = newProjectName.trim();
        const versionLabel = newVersionLabel.trim() || 'Versao inicial';
        if (!name) {
            setError('Informe o nome do projeto de area.');
            return;
        }

        setActionLoading('create-project');
        setError(null);
        setFeedback(null);
        try {
            const project = await areaEngineService.createProject({
                organization_id: organizationId,
                name,
                normative_reference: 'ABNT NBR 12721:2006',
                normative_valid_from: '2007-01-21',
                project_type: newProjectType,
                status: 'active',
            });

            const version = await areaEngineService.createVersion({
                area_project_id: project.id,
                version_number: 1,
                version_label: versionLabel,
            });

            const rows = await areaEngineService.listProjects(organizationId);
            setProjects(rows);
            setSelectedProjectId(project.id);
            setVersions([version]);
            setSelectedVersionId(version.id);
            setQuadroI([]);
            setQuadroII([]);
            setQuadroIVB([]);
            setNewProjectName('');
            setNewVersionLabel('Versao inicial');
            setNewProjectType('vertical');
            setIsCreateOpen(false);
            setIsStructureOpen(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar projeto de area.');
        } finally {
            setActionLoading(null);
        }
    }

    async function createMinimalStructure(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedVersionId) return;

        const unit1Area = Number(structureUnit1Area.replace(',', '.'));
        const unit2Area = Number(structureUnit2Area.replace(',', '.'));
        const commonArea = Number(structureCommonArea.replace(',', '.'));
        if (![unit1Area, unit2Area, commonArea].every(value => Number.isFinite(value) && value > 0)) {
            setError('Informe areas maiores que zero para unidades e area comum.');
            return;
        }

        setActionLoading('create-structure');
        setError(null);
        setFeedback(null);
        try {
            await areaEngineService.createMinimalStructure(selectedVersionId, {
                unit1Code: structureUnit1Code.trim() || 'Unidade 01',
                unit1Area,
                unit2Code: structureUnit2Code.trim() || 'Unidade 02',
                unit2Area,
                commonArea,
            });
            const result = await areaEngineService.calculateVersion(selectedVersionId);
            setFeedback(result);
            await loadResults(selectedVersionId);
            if (selectedProjectId) await loadVersions(selectedProjectId);
            setIsStructureOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar estrutura minima.');
        } finally {
            setActionLoading(null);
        }
    }

    const privateAreaTotal = structure.spaces.filter(space => space.use_class === 'private').reduce((sum, space) => sum + Number(space.real_area_m2_raw || 0), 0);
    const commonAreaTotal = structure.spaces.filter(space => space.use_class === 'common').reduce((sum, space) => sum + Number(space.real_area_m2_raw || 0), 0);

    const coefficientSum = quadroII.reduce((sum, row) => sum + Number(row.qii_31_proportionality_coefficient_raw || 0), 0);
    const realTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_37_unit_real_total_raw || 0), 0);
    const equivalentTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_38_unit_equivalent_total_raw || 0), 0);

    if (!organizationId) {
        return <EmptyState message="Selecione uma organizacao para acessar o motor de areas." />;
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6 space-y-5">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-widest text-blue-600">NBR 12721</p>
                    <h1 className="text-2xl font-black text-slate-900">Motor de areas</h1>
                    <p className="text-sm text-slate-500 mt-1">Quadros I, II e IV-B com rastreabilidade de calculo, aprovacao e lock.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setIsCreateOpen(true)} disabled={!!actionLoading}>
                        <Plus className="w-4 h-4" /> Novo projeto
                    </Button>
                    <Button variant="secondary" onClick={() => setIsStructureOpen(true)} disabled={!selectedVersionId || !!actionLoading}>
                        <Plus className="w-4 h-4" /> Estrutura
                    </Button>
                    <Button variant="secondary" onClick={loadProjects} disabled={loading}>
                        <RefreshCw className="w-4 h-4" /> Atualizar
                    </Button>
                    <Button
                        onClick={() => selectedVersionId && runAction('calculate', () => areaEngineService.calculateVersion(selectedVersionId))}
                        disabled={!selectedVersionId || !!actionLoading}
                    >
                        <Calculator className="w-4 h-4" /> Calcular
                    </Button>
                </div>
            </header>

            {error && (
                <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm font-medium">
                    {error}
                </div>
            )}

            {isCreateOpen && (
                <form onSubmit={createAreaProject} className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Novo projeto de areas</h2>
                            <p className="text-xs text-slate-500 mt-1">Cria o projeto e a primeira versao de calculo.</p>
                        </div>
                        <button type="button" onClick={() => setIsCreateOpen(false)} className="text-sm font-bold text-slate-500 hover:text-slate-800">
                            Fechar
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_220px] gap-3">
                        <label className="space-y-1">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Nome</span>
                            <input
                                value={newProjectName}
                                onChange={event => setNewProjectName(event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                placeholder="Ex.: Torre Residencial A"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Tipo</span>
                            <select
                                value={newProjectType}
                                onChange={event => setNewProjectType(event.target.value as typeof newProjectType)}
                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="vertical">Vertical</option>
                                <option value="mixed">Misto</option>
                                <option value="commercial">Comercial</option>
                                <option value="residential">Residencial</option>
                                <option value="horizontal">Horizontal</option>
                                <option value="other">Outro</option>
                            </select>
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Versao</span>
                            <input
                                value={newVersionLabel}
                                onChange={event => setNewVersionLabel(event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                placeholder="Versao inicial"
                            />
                        </label>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={actionLoading === 'create-project'}>
                            <Plus className="w-4 h-4" /> Criar
                        </Button>
                    </div>
                </form>
            )}

            {isStructureOpen && (
                <form onSubmit={createMinimalStructure} className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Estrutura minima</h2>
                            <p className="text-xs text-slate-500 mt-1">Gera 1 bloco, 1 pavimento, 2 unidades e 1 area comum proporcional.</p>
                        </div>
                        <button type="button" onClick={() => setIsStructureOpen(false)} className="text-sm font-bold text-slate-500 hover:text-slate-800">
                            Fechar
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <label className="space-y-1 md:col-span-2">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Unidade 1</span>
                            <input value={structureUnit1Code} onChange={event => setStructureUnit1Code(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Area 1</span>
                            <input value={structureUnit1Area} onChange={event => setStructureUnit1Area(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 md:col-span-2">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Unidade 2</span>
                            <input value={structureUnit2Code} onChange={event => setStructureUnit2Code(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Area 2</span>
                            <input value={structureUnit2Area} onChange={event => setStructureUnit2Area(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 md:col-span-2">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Area comum proporcional</span>
                            <input value={structureCommonArea} onChange={event => setStructureCommonArea(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsStructureOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={!selectedVersionId || actionLoading === 'create-structure'}>
                            <Plus className="w-4 h-4" /> Gerar e calcular
                        </Button>
                    </div>
                </form>
            )}

            <section className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
                <aside className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Projetos</h2>
                            <span className="text-xs text-slate-400">{projects.length}</span>
                        </div>
                        {projects.length === 0 ? (
                            <EmptyState message="Nenhum projeto de area encontrado." />
                        ) : (
                            <div className="space-y-2">
                                {projects.map(project => (
                                    <button
                                        key={project.id}
                                        onClick={() => setSelectedProjectId(project.id)}
                                        className={`w-full text-left border rounded-lg px-3 py-2 transition ${selectedProjectId === project.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                    >
                                        <div className="font-bold text-sm text-slate-800 truncate">{project.name}</div>
                                        <div className="text-xs text-slate-500">{project.normative_reference}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Versoes</h2>
                            <span className="text-xs text-slate-400">{versions.length}</span>
                        </div>
                        {versions.length === 0 ? (
                            <EmptyState message="Nenhuma versao para o projeto selecionado." />
                        ) : (
                            <div className="space-y-2">
                                {versions.map(version => (
                                    <button
                                        key={version.id}
                                        onClick={() => setSelectedVersionId(version.id)}
                                        className={`w-full text-left border rounded-lg px-3 py-2 transition ${selectedVersionId === version.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold text-sm text-slate-800 truncate">v{version.version_number} - {version.version_label}</span>
                                            <span className={`shrink-0 border rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusTone(version.status)}`}>
                                                {statusLabel[version.status] || version.status}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">Payload: {shortHash(version.version_payload_hash)}</div>
                                        <div className="text-xs text-slate-500">Identidade: {shortHash(version.version_identity_hash)}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                <main className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <p className="text-xs uppercase tracking-widest font-black text-slate-500">Coeficiente</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{formatNumber(coefficientSum, 12)}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <p className="text-xs uppercase tracking-widest font-black text-slate-500">Area real total</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{formatNumber(realTotal)} m2</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <p className="text-xs uppercase tracking-widest font-black text-slate-500">Area equivalente</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{formatNumber(equivalentTotal)} m2</p>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Ciclo de vida</h2>
                                <p className="text-xs text-slate-500 mt-1">Versao selecionada: {selectedVersion?.version_label || '-'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('validate', () => areaEngineService.validateVersion(selectedVersionId))} disabled={!selectedVersionId || !!actionLoading}>
                                    <ShieldCheck className="w-4 h-4" /> Validar
                                </Button>
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('technical', () => areaEngineService.approveVersion(selectedVersionId, 'technical', 'Aprovacao via app'))} disabled={!selectedVersionId || !!actionLoading}>
                                    <CheckCircle2 className="w-4 h-4" /> Tecnica
                                </Button>
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('legal', () => areaEngineService.approveVersion(selectedVersionId, 'legal', 'Aprovacao via app'))} disabled={!selectedVersionId || !!actionLoading}>
                                    <CheckCircle2 className="w-4 h-4" /> Juridica
                                </Button>
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('lock', () => areaEngineService.lockVersion(selectedVersionId))} disabled={!selectedVersionId || !!actionLoading}>
                                    <Lock className="w-4 h-4" /> Lock
                                </Button>
                            </div>
                        </div>
                        <RpcFeedback result={feedback} />
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Quadros calculados</h2>
                            </div>
                            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
                                {([
                                    ['quadro_i', 'Quadro I'],
                                    ['quadro_ii', 'Quadro II'],
                                    ['quadro_ivb', 'IV-B'],
                                ] as const).map(([id, label]) => (
                                    <button
                                        key={id}
                                        onClick={() => setActiveTable(id)}
                                        className={`h-8 px-3 rounded-md text-xs font-black uppercase tracking-widest ${activeTable === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeTable === 'estrutura' && (
                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <StructureMetric label="Blocos" value={structure.blocks.length} />
                                    <StructureMetric label="Pavimentos" value={structure.floors.length} />
                                    <StructureMetric label="Unidades" value={structure.units.length} />
                                    <StructureMetric label="Espacos" value={structure.spaces.length} />
                                </div>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    <StructureList
                                        title="Unidades"
                                        empty="Nenhuma unidade cadastrada."
                                        headers={['Codigo', 'Tipo', 'Tipologia']}
                                        rows={structure.units.map(unit => [unit.code, unit.unit_type, unit.typology_code || '-'])}
                                    />
                                    <StructureList
                                        title="Espacos"
                                        empty="Nenhum espaco cadastrado."
                                        headers={['Codigo', 'Uso', 'Area', 'Coef.']}
                                        rows={structure.spaces.map(space => [space.code || '-', space.use_class === 'private' ? 'Privativa' : 'Comum', `${formatNumber(space.real_area_m2_raw)} m2`, formatNumber(space.coefficient_value ?? 1, 6)])}
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Area privativa cadastrada</p>
                                        <p className="text-lg font-black text-slate-900 mt-1">{formatNumber(privateAreaTotal)} m2</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Area comum cadastrada</p>
                                        <p className="text-lg font-black text-slate-900 mt-1">{formatNumber(commonAreaTotal)} m2</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTable === 'quadro_i' && (
                            <ResultTable
                                empty="Calcule a versao para gerar o Quadro I."
                                headers={['Pavimento', 'Area real', 'Area equivalente']}
                                rows={quadroI.map(row => [row.floor_label, `${formatNumber(row.qi_17_floor_real_total_raw)} m2`, `${formatNumber(row.qi_18_floor_equivalent_total_raw)} m2`])}
                            />
                        )}
                        {activeTable === 'quadro_ii' && (
                            <ResultTable
                                empty="Calcule a versao para gerar o Quadro II."
                                headers={['Unidade', 'Coeficiente', 'Area real', 'Area equivalente']}
                                rows={quadroII.map(row => [row.unit_label, formatNumber(row.qii_31_proportionality_coefficient_raw, 12), `${formatNumber(row.qii_37_unit_real_total_raw)} m2`, `${formatNumber(row.qii_38_unit_equivalent_total_raw)} m2`])}
                            />
                        )}
                        {activeTable === 'quadro_ivb' && (
                            <ResultTable
                                empty="Calcule a versao para gerar o Quadro IV-B."
                                headers={['Unidade', 'Area real', 'Coeficiente', 'Fracao']}
                                rows={quadroIVB.map(row => [row.unit_label, `${formatNumber(row.qivb_f_real_total_area_raw)} m2`, formatNumber(row.qivb_g_proportionality_coefficient_raw, 12), formatNumber(row.fraction_decimal_raw, 12)])}
                            />
                        )}
                    </div>
                </main>
            </section>
        </div>
    );
}

function StructureMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-xl font-black text-slate-900 mt-1">{value}</p>
        </div>
    );
}

function StructureList({ title, headers, rows, empty }: { title: string; headers: string[]; rows: string[][]; empty: string }) {
    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">{title}</h3>
            </div>
            {rows.length === 0 ? (
                <div className="p-4"><EmptyState message={empty} /></div>
            ) : (
                <ResultTable headers={headers} rows={rows} empty={empty} />
            )}
        </div>
    );
}
function ResultTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
    if (rows.length === 0) {
        return <div className="p-4"><EmptyState message={empty} /></div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                    <tr>
                        {headers.map(header => (
                            <th key={header} className="px-4 py-3 text-left font-black whitespace-nowrap">{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                            {row.map((cell, cellIdx) => (
                                <td key={`${idx}-${cellIdx}`} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}






