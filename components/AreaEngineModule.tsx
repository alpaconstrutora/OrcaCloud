import React from 'react';
import {
    AlertTriangle,
    Calculator,
    CheckCircle2,
    FileSpreadsheet,
    FileText,
    Lock,
    Pencil,
    Plus,
    RefreshCw,
    ShieldCheck,
    Trash2,
} from 'lucide-react';
import Button from './ui/Button';
import { areaEngineService } from '../services/areaEngineService';
import { areaEngineExportService } from '../services/areaEngineExportService';
import type {
    AreaEngineRpcResult,
    AreaFractionIdeal,
    AreaProject,
    AreaQuadroIIRow,
    AreaQuadroIRow,
    AreaQuadroIVBRow,
    AreaVersion,
    AreaVersionApproval,
    AreaVersionAuditLog,
    AreaVersionStructure,
} from '../types/areaEngine';

interface AreaEngineModuleProps {
    organizationId?: string;
}

type TableView = 'estrutura' | 'quadro_i' | 'quadro_ii' | 'quadro_ivb';
type StructureEditKind = 'block' | 'floor' | 'unit' | 'space';

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
    const warnings = result.warnings || [];
    const success = result.status === 'success';
    const hasErrors = errors.length > 0;
    const hasWarnings = warnings.length > 0;

    return (
        <div className={`border rounded-lg px-4 py-3 text-sm ${hasErrors ? 'bg-red-50 border-red-200 text-red-800' : success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 font-bold">
                    {hasErrors ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Status: {result.status}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-widest">
                    <span className="rounded-full bg-white/70 px-2 py-1">Bloqueios: {errors.length}</span>
                    <span className="rounded-full bg-white/70 px-2 py-1">Alertas: {warnings.length}</span>
                </div>
            </div>
            {hasErrors && (
                <IssueList title="Erros bloqueantes" issues={errors} tone="error" />
            )}
            {hasWarnings && (
                <IssueList title="Alertas" issues={warnings} tone="warning" />
            )}
            {!hasErrors && !hasWarnings && (
                <p className="mt-2 text-xs font-semibold">Nenhum erro bloqueante ou alerta retornado pelo motor.</p>
            )}
        </div>
    );
}

function IssueList({ title, issues, tone }: { title: string; issues: AreaEngineRpcResult['blocking_errors']; tone: 'error' | 'warning' }) {
    const rows = issues || [];
    if (rows.length === 0) return null;
    return (
        <div className="mt-3 rounded-lg border border-white/70 bg-white/60 p-3">
            <p className={`text-xs font-black uppercase tracking-widest ${tone === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{title}</p>
            <ul className="mt-2 space-y-1">
                {rows.map((issue, idx) => (
                    <li key={`${issue.code}-${idx}`} className="flex flex-col gap-0.5 md:flex-row md:items-center md:gap-2">
                        <span className="font-mono text-xs font-black">{issue.code}</span>
                        <span>{issue.message}</span>
                        {typeof issue.count === 'number' && <span className="text-xs font-bold opacity-70">({issue.count})</span>}
                    </li>
                ))}
            </ul>
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
    const [approvals, setApprovals] = React.useState<AreaVersionApproval[]>([]);
    const [auditLogs, setAuditLogs] = React.useState<AreaVersionAuditLog[]>([]);
    const [areaFractions, setAreaFractions] = React.useState<AreaFractionIdeal[]>([]);
    const [quadroI, setQuadroI] = React.useState<AreaQuadroIRow[]>([]);
    const [quadroII, setQuadroII] = React.useState<AreaQuadroIIRow[]>([]);
    const [quadroIVB, setQuadroIVB] = React.useState<AreaQuadroIVBRow[]>([]);
    const [activeTable, setActiveTable] = React.useState<TableView>('estrutura');
    const [loading, setLoading] = React.useState(false);
    const [actionLoading, setActionLoading] = React.useState<string | null>(null);
    const [exportLoading, setExportLoading] = React.useState<'pdf' | 'xlsx' | null>(null);
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
    const [editorBlockCode, setEditorBlockCode] = React.useState('T1');
    const [editorBlockName, setEditorBlockName] = React.useState('Torre 1');
    const [editorFloorBlockId, setEditorFloorBlockId] = React.useState('');
    const [editorFloorCode, setEditorFloorCode] = React.useState('PAV');
    const [editorFloorName, setEditorFloorName] = React.useState('Pavimento');
    const [editorFloorType, setEditorFloorType] = React.useState('type');
    const [editorUnitBlockId, setEditorUnitBlockId] = React.useState('');
    const [editorUnitFloorId, setEditorUnitFloorId] = React.useState('');
    const [editorUnitCode, setEditorUnitCode] = React.useState('Unidade');
    const [editorUnitType, setEditorUnitType] = React.useState('apartment');
    const [editorUnitTypology, setEditorUnitTypology] = React.useState('Tipo A');
    const [editorSpaceUseClass, setEditorSpaceUseClass] = React.useState<'private' | 'common'>('private');
    const [editorSpaceBlockId, setEditorSpaceBlockId] = React.useState('');
    const [editorSpaceFloorId, setEditorSpaceFloorId] = React.useState('');
    const [editorSpaceUnitId, setEditorSpaceUnitId] = React.useState('');
    const [editorSpaceCode, setEditorSpaceCode] = React.useState('');
    const [editorSpaceName, setEditorSpaceName] = React.useState('Area');
    const [editorSpaceArea, setEditorSpaceArea] = React.useState('10');
    const [editorSpaceCoverage, setEditorSpaceCoverage] = React.useState('covered_standard');
    const [editorSpaceDivision, setEditorSpaceDivision] = React.useState<'proportional' | 'non_proportional'>('proportional');
    const [editorSpaceCoefficient, setEditorSpaceCoefficient] = React.useState('1');
    const [editorSpaceScope, setEditorSpaceScope] = React.useState<'global' | 'block'>('global');
    const [editingStructure, setEditingStructure] = React.useState<{ kind: StructureEditKind; id: string } | null>(null);

    const selectedVersion = versions.find(v => v.id === selectedVersionId) || null;
    const technicalApproval = approvals.find(approval => approval.approval_type === 'technical');
    const legalApproval = approvals.find(approval => approval.approval_type === 'legal');
    const canApproveTechnical = selectedVersion?.status === 'calculated';
    const canApproveLegal = selectedVersion?.status === 'technically_approved';
    const canLockVersion = selectedVersion?.status === 'legally_approved';

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
            setStructure({ blocks: [], floors: [], units: [], spaces: [] });
            setApprovals([]);
            setAuditLogs([]);
            setAreaFractions([]);
            setQuadroI([]);
            setQuadroII([]);
            setQuadroIVB([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [structureData, approvalRows, auditRows, fractionRows, qi, qii, qivb] = await Promise.all([
                areaEngineService.getStructure(versionId),
                areaEngineService.listApprovals(versionId),
                areaEngineService.listAuditLogs(versionId),
                areaEngineService.listFractions(versionId),
                areaEngineService.listQuadroI(versionId),
                areaEngineService.listQuadroII(versionId),
                areaEngineService.listQuadroIVB(versionId),
            ]);
            setStructure(structureData);
            setApprovals(approvalRows);
            setAuditLogs(auditRows);
            setAreaFractions(fractionRows);
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
    React.useEffect(() => {
        const firstBlockId = structure.blocks[0]?.id || '';
        const firstFloorId = structure.floors[0]?.id || '';
        const firstUnitId = structure.units[0]?.id || '';
        setEditorFloorBlockId(prev => prev || firstBlockId);
        setEditorUnitBlockId(prev => prev || firstBlockId);
        setEditorUnitFloorId(prev => prev || firstFloorId);
        setEditorSpaceBlockId(prev => prev || firstBlockId);
        setEditorSpaceFloorId(prev => prev || firstFloorId);
        setEditorSpaceUnitId(prev => prev || firstUnitId);
    }, [structure.blocks, structure.floors, structure.units]);

    async function createRevisionFromSelectedVersion() {
        if (!selectedVersion || !selectedProjectId) return;
        setActionLoading('create-revision');
        setError(null);
        setFeedback(null);
        try {
            const revision = await areaEngineService.createRevisionFromVersion(selectedVersion.id);
            const rows = await areaEngineService.listVersions(selectedProjectId);
            setVersions(rows);
            setSelectedVersionId(revision.id);
            setActiveTable('estrutura');
            await loadResults(revision.id);
            setFeedback({ status: 'success', warnings: [], blocking_errors: [], message: `Revisao v${revision.version_number} criada.` });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar revisao da versao.');
        } finally {
            setActionLoading(null);
        }
    }
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

    async function runValidatedCalculation() {
        if (!selectedVersionId) return;
        setActionLoading('calculate');
        setError(null);
        setFeedback(null);
        try {
            const validation = await areaEngineService.validateVersion(selectedVersionId);
            const blockingErrors = validation.blocking_errors || [];
            if (blockingErrors.length > 0 || validation.status === 'failed') {
                setFeedback(validation);
                return;
            }

            const result = await areaEngineService.calculateVersion(selectedVersionId);
            setFeedback(result);
            if (selectedProjectId) await loadVersions(selectedProjectId);
            await loadResults(selectedVersionId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao validar e calcular.');
        } finally {
            setActionLoading(null);
        }
    }
    function exportPackagePayload() {
        const project = projects.find(row => row.id === selectedProjectId);
        return {
            projectName: project?.name || 'Projeto de areas',
            version: selectedVersion,
            structure,
            quadroI,
            quadroII,
            quadroIVB,
            fractions: areaFractions,
            approvals,
            auditLogs,
        };
    }

    async function exportAreaPackage(kind: 'pdf' | 'xlsx') {
        if (!selectedVersionId) return;
        if (quadroI.length === 0 && quadroII.length === 0 && quadroIVB.length === 0) {
            setError('Calcule a versao antes de exportar os quadros.');
            return;
        }
        setExportLoading(kind);
        setError(null);
        try {
            const payload = exportPackagePayload();
            if (kind === 'xlsx') {
                areaEngineExportService.exportXlsx(payload);
            } else {
                await areaEngineExportService.exportPdf(payload);
            }
            await areaEngineService.recordExportAudit(selectedVersionId, kind, {
                projectName: payload.projectName,
                versionId: selectedVersionId,
                payloadHash: selectedVersion?.version_payload_hash || null,
                identityHash: selectedVersion?.version_identity_hash || null,
                quadroIRows: quadroI.length,
                quadroIIRows: quadroII.length,
                quadroIVBRows: quadroIVB.length,
            });
            await loadResults(selectedVersionId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao exportar pacote de areas.');
        } finally {
            setExportLoading(null);
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
            const validation = await areaEngineService.validateVersion(selectedVersionId);
            if ((validation.blocking_errors || []).length > 0 || validation.status === 'failed') {
                setFeedback(validation);
                return;
            }
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


    function versionIsEditable(): boolean {
        if (!selectedVersionId || !selectedVersion) {
            setError('Selecione uma versao para editar a estrutura.');
            return false;
        }
        if (['locked', 'superseded', 'cancelled'].includes(selectedVersion.status)) {
            setError('Esta versao esta bloqueada para edicao. Crie uma nova versao para alterar a estrutura.');
            return false;
        }
        return true;
    }

    function parsePositiveArea(value: string, label: string): number | null {
        const parsed = Number(value.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed <= 0) {
            setError(`Informe um valor maior que zero para ${label}.`);
            return null;
        }
        return parsed;
    }

    function cancelStructureEdit() {
        setEditingStructure(null);
        setError(null);
    }

    function beginStructureEdit(kind: StructureEditKind, id: string) {
        if (!versionIsEditable()) return;
        setError(null);
        setEditingStructure({ kind, id });

        if (kind === 'block') {
            const block = structure.blocks.find(item => item.id === id);
            if (!block) return;
            setEditorBlockCode(block.code || '');
            setEditorBlockName(block.name || '');
            return;
        }

        if (kind === 'floor') {
            const floor = structure.floors.find(item => item.id === id);
            if (!floor) return;
            setEditorFloorBlockId(floor.block_id || '');
            setEditorFloorCode(floor.code || '');
            setEditorFloorName(floor.name || '');
            setEditorFloorType(floor.floor_type || 'other');
            return;
        }

        if (kind === 'unit') {
            const unit = structure.units.find(item => item.id === id);
            if (!unit) return;
            setEditorUnitBlockId(unit.block_id || '');
            setEditorUnitFloorId(unit.primary_floor_id || '');
            setEditorUnitCode(unit.code || '');
            setEditorUnitType(unit.unit_type || 'apartment');
            setEditorUnitTypology(unit.typology_code || '');
            return;
        }

        const space = structure.spaces.find(item => item.id === id);
        if (!space) return;
        setEditorSpaceUseClass(space.use_class === 'common' ? 'common' : 'private');
        setEditorSpaceBlockId(space.block_id || '');
        setEditorSpaceFloorId(space.floor_id || '');
        setEditorSpaceUnitId(space.unit_id || '');
        setEditorSpaceCode(space.code || '');
        setEditorSpaceName(space.name || '');
        setEditorSpaceArea(String(space.real_area_m2_raw || ''));
        setEditorSpaceCoverage(space.coverage_class || 'covered_standard');
        setEditorSpaceDivision(space.common_division_class === 'non_proportional' ? 'non_proportional' : 'proportional');
        setEditorSpaceCoefficient(space.coefficient_value === null || space.coefficient_value === undefined ? '' : String(space.coefficient_value));
    }
    async function addBlock(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!versionIsEditable()) return;
        const name = editorBlockName.trim();
        if (!name) { setError('Informe o nome do bloco.'); return; }
        const isEditing = editingStructure?.kind === 'block';
        setActionLoading(isEditing ? 'edit-block' : 'add-block');
        setError(null);
        try {
            if (isEditing && editingStructure) {
                const block = structure.blocks.find(item => item.id === editingStructure.id);
                await areaEngineService.updateBlock(editingStructure.id, {
                    code: editorBlockCode.trim() || undefined,
                    name,
                    sortOrder: block?.sort_order ?? structure.blocks.length + 1,
                });
            } else {
                await areaEngineService.createBlock(selectedVersionId, {
                    code: editorBlockCode.trim() || undefined,
                    name,
                    sortOrder: structure.blocks.length + 1,
                });
            }
            await loadResults(selectedVersionId);
            setEditorBlockCode('');
            setEditorBlockName('');
            setEditingStructure(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar bloco.');
        } finally {
            setActionLoading(null);
        }
    }

    async function addFloor(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!versionIsEditable()) return;
        const blockId = editorFloorBlockId || structure.blocks[0]?.id;
        const name = editorFloorName.trim();
        if (!blockId) { setError('Cadastre um bloco antes de criar pavimentos.'); return; }
        if (!name) { setError('Informe o nome do pavimento.'); return; }
        const isEditing = editingStructure?.kind === 'floor';
        setActionLoading(isEditing ? 'edit-floor' : 'add-floor');
        setError(null);
        try {
            if (isEditing && editingStructure) {
                const floor = structure.floors.find(item => item.id === editingStructure.id);
                await areaEngineService.updateFloor(editingStructure.id, {
                    blockId,
                    code: editorFloorCode.trim() || undefined,
                    name,
                    floorType: editorFloorType,
                    sortOrder: floor?.sort_order ?? structure.floors.length + 1,
                });
            } else {
                await areaEngineService.createFloor(selectedVersionId, {
                    blockId,
                    code: editorFloorCode.trim() || undefined,
                    name,
                    floorType: editorFloorType,
                    sortOrder: structure.floors.length + 1,
                });
            }
            await loadResults(selectedVersionId);
            setEditorFloorCode('');
            setEditorFloorName('');
            setEditingStructure(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar pavimento.');
        } finally {
            setActionLoading(null);
        }
    }

    async function addUnit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!versionIsEditable()) return;
        const blockId = editorUnitBlockId || structure.blocks[0]?.id;
        const code = editorUnitCode.trim();
        if (!blockId) { setError('Cadastre um bloco antes de criar unidades.'); return; }
        if (!code) { setError('Informe o codigo da unidade.'); return; }
        const isEditing = editingStructure?.kind === 'unit';
        setActionLoading(isEditing ? 'edit-unit' : 'add-unit');
        setError(null);
        try {
            if (isEditing && editingStructure) {
                const unit = structure.units.find(item => item.id === editingStructure.id);
                await areaEngineService.updateUnit(editingStructure.id, {
                    blockId,
                    primaryFloorId: editorUnitFloorId || null,
                    code,
                    unitType: editorUnitType,
                    typologyCode: editorUnitTypology.trim() || undefined,
                    materializedIndex: Number(unit?.materialized_index ?? structure.units.length + 1),
                });
            } else {
                await areaEngineService.createUnit(selectedVersionId, {
                    blockId,
                    primaryFloorId: editorUnitFloorId || null,
                    code,
                    unitType: editorUnitType,
                    typologyCode: editorUnitTypology.trim() || undefined,
                    materializedIndex: structure.units.length + 1,
                });
            }
            await loadResults(selectedVersionId);
            setEditorUnitCode('');
            setEditingStructure(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar unidade.');
        } finally {
            setActionLoading(null);
        }
    }

    async function addSpace(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!versionIsEditable()) return;
        const blockId = editorSpaceBlockId || structure.blocks[0]?.id;
        const isPrivate = editorSpaceUseClass === 'private';
        const unitId = editorSpaceUnitId || structure.units[0]?.id;
        const name = editorSpaceName.trim();
        const realArea = parsePositiveArea(editorSpaceArea, 'area do espaco');
        const coefficient = editorSpaceCoefficient.trim() === '' ? null : Number(editorSpaceCoefficient.replace(',', '.'));
        if (!blockId) { setError('Cadastre um bloco antes de criar espacos.'); return; }
        if (isPrivate && !unitId) { setError('Espaco privativo precisa de uma unidade.'); return; }
        if (!name) { setError('Informe o nome do espaco.'); return; }
        if (realArea === null) return;
        if (coefficient !== null && (!Number.isFinite(coefficient) || coefficient <= 0)) { setError('Coeficiente deve ser vazio ou maior que zero.'); return; }
        const isEditing = editingStructure?.kind === 'space';
        setActionLoading(isEditing ? 'edit-space' : 'add-space');
        setError(null);
        try {
            if (isEditing && editingStructure) {
                const space = structure.spaces.find(item => item.id === editingStructure.id);
                await areaEngineService.updateSpace(editingStructure.id, {
                    blockId,
                    floorId: editorSpaceFloorId || null,
                    unitId: isPrivate ? unitId : null,
                    code: editorSpaceCode.trim() || undefined,
                    name,
                    useClass: editorSpaceUseClass,
                    realArea,
                    coverageClass: editorSpaceCoverage,
                    commonDivisionClass: editorSpaceDivision,
                    coefficientValue: coefficient,
                    materializedIndex: Number(space?.materialized_index ?? structure.spaces.length + 1),
                    distributionScope: editorSpaceScope,
                });
            } else {
                await areaEngineService.createSpace(selectedVersionId, {
                    blockId,
                    floorId: editorSpaceFloorId || null,
                    unitId: isPrivate ? unitId : null,
                    code: editorSpaceCode.trim() || undefined,
                    name,
                    useClass: editorSpaceUseClass,
                    realArea,
                    coverageClass: editorSpaceCoverage,
                    commonDivisionClass: editorSpaceDivision,
                    coefficientValue: coefficient,
                    materializedIndex: structure.spaces.length + 1,
                    distributionScope: editorSpaceScope,
                });
            }
            await loadResults(selectedVersionId);
            setEditorSpaceCode('');
            setEditorSpaceName('Area');
            setEditorSpaceArea('10');
            setEditingStructure(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar espaco.');
        } finally {
            setActionLoading(null);
        }
    }

    async function deleteStructureRecord(kind: 'block' | 'floor' | 'unit' | 'space', id: string) {
        if (!versionIsEditable()) return;
        setActionLoading(`delete-${kind}`);
        setError(null);
        try {
            if (kind === 'block') await areaEngineService.deleteBlock(id);
            if (kind === 'floor') await areaEngineService.deleteFloor(id);
            if (kind === 'unit') await areaEngineService.deleteUnit(id);
            if (kind === 'space') await areaEngineService.deleteSpace(id);
            await loadResults(selectedVersionId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao remover registro da estrutura.');
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
                    <Button variant="secondary" onClick={createRevisionFromSelectedVersion} disabled={!selectedVersionId || !!actionLoading}>
                        <Plus className="w-4 h-4" /> Nova revisao
                    </Button>
                    <Button variant="secondary" onClick={loadProjects} disabled={loading}>
                        <RefreshCw className="w-4 h-4" /> Atualizar
                    </Button>
                    <Button
                        onClick={runValidatedCalculation}
                        disabled={!selectedVersionId || !!actionLoading}
                    >
                        <Calculator className="w-4 h-4" /> Calcular
                    </Button>
                    <Button variant="secondary" onClick={() => void exportAreaPackage('xlsx')} disabled={!selectedVersionId || !!exportLoading || (quadroI.length === 0 && quadroII.length === 0 && quadroIVB.length === 0)}>
                        <FileSpreadsheet className="w-4 h-4" /> XLSX
                    </Button>
                    <Button variant="secondary" onClick={() => void exportAreaPackage('pdf')} disabled={!selectedVersionId || !!exportLoading || (quadroI.length === 0 && quadroII.length === 0 && quadroIVB.length === 0)}>
                        <FileText className="w-4 h-4" /> PDF
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

                    <AreaQaPanel
                        quadroI={quadroI}
                        quadroII={quadroII}
                        quadroIVB={quadroIVB}
                        fractions={areaFractions}
                    />

                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Ciclo de vida</h2>
                                <p className="text-xs text-slate-500 mt-1">Versao selecionada: {selectedVersion?.version_label || '-'}</p>
                                <p className="text-xs text-slate-500 mt-1">O botao Calcular executa validacao tecnica antes do calculo oficial.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('validate', () => areaEngineService.validateVersion(selectedVersionId))} disabled={!selectedVersionId || !!actionLoading}>
                                    <ShieldCheck className="w-4 h-4" /> Validar
                                </Button>
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('technical', () => areaEngineService.approveVersion(selectedVersionId, 'technical', 'Aprovacao via app'))} disabled={!selectedVersionId || !!actionLoading || !canApproveTechnical}>
                                    <CheckCircle2 className="w-4 h-4" /> Tecnica
                                </Button>
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('legal', () => areaEngineService.approveVersion(selectedVersionId, 'legal', 'Aprovacao via app'))} disabled={!selectedVersionId || !!actionLoading || !canApproveLegal}>
                                    <CheckCircle2 className="w-4 h-4" /> Juridica
                                </Button>
                                <Button variant="secondary" onClick={() => selectedVersionId && runAction('lock', () => areaEngineService.lockVersion(selectedVersionId))} disabled={!selectedVersionId || !!actionLoading || !canLockVersion}>
                                    <Lock className="w-4 h-4" /> Lock
                                </Button>
                            </div>
                        </div>
                        <LifecycleAuditPanel
                            version={selectedVersion}
                            technicalApproval={technicalApproval}
                            legalApproval={legalApproval}
                            auditLogs={auditLogs}
                        />
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
                                    ['estrutura', 'Estrutura'],
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
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Editor granular</h3>
                                            <p className="text-xs text-slate-500 mt-1">Cadastre blocos, pavimentos, unidades e espacos reais da versao.</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {editingStructure && (
                                                <Button type="button" variant="secondary" size="sm" onClick={cancelStructureEdit} disabled={!!actionLoading}>Cancelar edicao</Button>
                                            )}
                                            {selectedVersion && ['locked', 'superseded', 'cancelled'].includes(selectedVersion.status) && (
                                                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-700">Somente leitura</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        <form onSubmit={addBlock} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Bloco</h4>
                                            <div className="grid grid-cols-[120px_1fr] gap-2">
                                                <input value={editorBlockCode} onChange={event => setEditorBlockCode(event.target.value)} placeholder="Codigo" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <input value={editorBlockName} onChange={event => setEditorBlockName(event.target.value)} placeholder="Nome do bloco" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                            </div>
                                            <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'block' ? 'Salvar bloco' : 'Adicionar bloco'}</Button>
                                        </form>

                                        <form onSubmit={addFloor} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Pavimento</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                                <select value={editorFloorBlockId} onChange={event => setEditorFloorBlockId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                                                    <option value="">Bloco</option>
                                                    {structure.blocks.map(block => <option key={block.id} value={block.id}>{block.code || block.name}</option>)}
                                                </select>
                                                <input value={editorFloorCode} onChange={event => setEditorFloorCode(event.target.value)} placeholder="Codigo" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <input value={editorFloorName} onChange={event => setEditorFloorName(event.target.value)} placeholder="Nome" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <select value={editorFloorType} onChange={event => setEditorFloorType(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                                                    <option value="ground">Terreo</option>
                                                    <option value="type">Tipo</option>
                                                    <option value="basement">Subsolo</option>
                                                    <option value="technical">Tecnico</option>
                                                    <option value="roof">Cobertura</option>
                                                    <option value="other">Outro</option>
                                                </select>
                                            </div>
                                            <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'floor' ? 'Salvar pavimento' : 'Adicionar pavimento'}</Button>
                                        </form>

                                        <form onSubmit={addUnit} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Unidade</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                                <select value={editorUnitBlockId} onChange={event => setEditorUnitBlockId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                                                    <option value="">Bloco</option>
                                                    {structure.blocks.map(block => <option key={block.id} value={block.id}>{block.code || block.name}</option>)}
                                                </select>
                                                <select value={editorUnitFloorId} onChange={event => setEditorUnitFloorId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                                                    <option value="">Pavimento</option>
                                                    {structure.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.code || floor.name}</option>)}
                                                </select>
                                                <input value={editorUnitCode} onChange={event => setEditorUnitCode(event.target.value)} placeholder="Codigo" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <input value={editorUnitTypology} onChange={event => setEditorUnitTypology(event.target.value)} placeholder="Tipologia" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <select value={editorUnitType} onChange={event => setEditorUnitType(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">
                                                    <option value="apartment">Apartamento</option>
                                                    <option value="office">Sala</option>
                                                    <option value="store">Loja</option>
                                                    <option value="parking">Garagem</option>
                                                    <option value="other">Outro</option>
                                                </select>
                                            </div>
                                            <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'unit' ? 'Salvar unidade' : 'Adicionar unidade'}</Button>
                                        </form>

                                        <form onSubmit={addSpace} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Espaco</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                                <select value={editorSpaceUseClass} onChange={event => setEditorSpaceUseClass(event.target.value as 'private' | 'common')} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="private">Privativo</option><option value="common">Comum</option></select>
                                                <select value={editorSpaceBlockId} onChange={event => setEditorSpaceBlockId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Bloco</option>{structure.blocks.map(block => <option key={block.id} value={block.id}>{block.code || block.name}</option>)}</select>
                                                <select value={editorSpaceFloorId} onChange={event => setEditorSpaceFloorId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Pavimento</option>{structure.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.code || floor.name}</option>)}</select>
                                                <select value={editorSpaceUnitId} onChange={event => setEditorSpaceUnitId(event.target.value)} disabled={editorSpaceUseClass === 'common'} className="h-9 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-100"><option value="">Unidade</option>{structure.units.map(unit => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</select>
                                                <input value={editorSpaceCode} onChange={event => setEditorSpaceCode(event.target.value)} placeholder="Codigo" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <input value={editorSpaceName} onChange={event => setEditorSpaceName(event.target.value)} placeholder="Nome" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <input value={editorSpaceArea} onChange={event => setEditorSpaceArea(event.target.value)} placeholder="Area m2" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <input value={editorSpaceCoefficient} onChange={event => setEditorSpaceCoefficient(event.target.value)} placeholder="Coef." className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <select value={editorSpaceCoverage} onChange={event => setEditorSpaceCoverage(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="covered_standard">Coberta padrao</option><option value="covered_different">Coberta diferente</option><option value="uncovered">Descoberta</option></select>
                                                <select value={editorSpaceDivision} onChange={event => setEditorSpaceDivision(event.target.value as 'proportional' | 'non_proportional')} disabled={editorSpaceUseClass === 'private'} className="h-9 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-100"><option value="proportional">Comum proporcional</option><option value="non_proportional">Comum nao proporcional</option></select>
                                                <select value={editorSpaceScope} onChange={event => setEditorSpaceScope(event.target.value as 'global' | 'block')} disabled={editorSpaceUseClass === 'private'} className="h-9 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-100"><option value="global">Escopo global</option><option value="block">Escopo bloco</option></select>
                                            </div>
                                            <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'space' ? 'Salvar espaco' : 'Adicionar espaco'}</Button>
                                        </form>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        <StructureAdminList title="Blocos" empty="Nenhum bloco cadastrado." rows={structure.blocks.map(block => ({ id: block.id, label: `${block.code || '-'} - ${block.name}`, detail: `Ordem ${block.sort_order || 0}` }))} onEdit={id => beginStructureEdit('block', id)} onDelete={id => deleteStructureRecord('block', id)} disabled={!!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')} />
                                        <StructureAdminList title="Pavimentos" empty="Nenhum pavimento cadastrado." rows={structure.floors.map(floor => ({ id: floor.id, label: `${floor.code || '-'} - ${floor.name}`, detail: floor.floor_type }))} onEdit={id => beginStructureEdit('floor', id)} onDelete={id => deleteStructureRecord('floor', id)} disabled={!!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')} />
                                        <StructureAdminList title="Unidades" empty="Nenhuma unidade cadastrada." rows={structure.units.map(unit => ({ id: unit.id, label: unit.code, detail: `${unit.unit_type} ${unit.typology_code || ''}`.trim() }))} onEdit={id => beginStructureEdit('unit', id)} onDelete={id => deleteStructureRecord('unit', id)} disabled={!!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')} />
                                        <StructureAdminList title="Espacos" empty="Nenhum espaco cadastrado." rows={structure.spaces.map(space => ({ id: space.id, label: `${space.code || '-'} - ${space.name}`, detail: `${space.use_class === 'private' ? 'Privativo' : 'Comum'} - ${formatNumber(space.real_area_m2_raw)} m2` }))} onEdit={id => beginStructureEdit('space', id)} onDelete={id => deleteStructureRecord('space', id)} disabled={!!actionLoading || ['locked', 'superseded', 'cancelled'].includes(selectedVersion?.status || '')} />
                                    </div>
                                </div>
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

function nearlyEqual(a: number, b: number, tolerance = 0.000001): boolean {
    return Math.abs(a - b) <= tolerance;
}

function AreaQaPanel({ quadroI, quadroII, quadroIVB, fractions }: { quadroI: AreaQuadroIRow[]; quadroII: AreaQuadroIIRow[]; quadroIVB: AreaQuadroIVBRow[]; fractions: AreaFractionIdeal[] }) {
    const coefficientSum = quadroII.reduce((sum, row) => sum + Number(row.qii_31_proportionality_coefficient_raw || 0), 0);
    const fractionSum = fractions.reduce((sum, row) => sum + Number(row.fraction_decimal_raw || 0), 0);
    const qiiRealTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_37_unit_real_total_raw || 0), 0);
    const qivbRealTotal = quadroIVB.reduce((sum, row) => sum + Number(row.qivb_f_real_total_area_raw || 0), 0);
    const qiiEquivalentTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_38_unit_equivalent_total_raw || 0), 0);
    const qiEquivalentTotal = quadroI.reduce((sum, row) => sum + Number(row.qi_18_floor_equivalent_total_raw || 0), 0);
    const uniqueQiiUnits = new Set(quadroII.map(row => row.unit_id)).size;
    const uniqueQivbUnits = new Set(quadroIVB.map(row => row.unit_id)).size;
    const hasRows = quadroI.length > 0 || quadroII.length > 0 || quadroIVB.length > 0;

    const checks = [
        { label: 'Soma dos coeficientes = 1', ok: hasRows && nearlyEqual(coefficientSum, 1, 0.000001), value: formatNumber(coefficientSum, 12) },
        { label: 'Soma das fracoes = 1', ok: hasRows && nearlyEqual(fractionSum, 1, 0.000001), value: formatNumber(fractionSum, 12) },
        { label: 'Quadro II real = IV-B real', ok: hasRows && nearlyEqual(qiiRealTotal, qivbRealTotal, 0.000001), value: `${formatNumber(qiiRealTotal)} / ${formatNumber(qivbRealTotal)}` },
        { label: 'Quadro II equivalente = Quadro I equivalente', ok: hasRows && nearlyEqual(qiiEquivalentTotal, qiEquivalentTotal, 0.000001), value: `${formatNumber(qiiEquivalentTotal)} / ${formatNumber(qiEquivalentTotal)}` },
        { label: 'Sem duplicidade de unidades', ok: hasRows && uniqueQiiUnits === quadroII.length && uniqueQivbUnits === quadroIVB.length, value: `${quadroII.length} QII / ${quadroIVB.length} IV-B` },
    ];

    const failed = checks.filter(check => !check.ok).length;

    return (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">QA tecnico</h2>
                    <p className="text-xs text-slate-500 mt-1">Fechamentos calculados a partir dos Quadros gerados.</p>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${failed === 0 && hasRows ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {hasRows ? `${checks.length - failed}/${checks.length} ok` : 'Aguardando calculo'}
                </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {checks.map(check => (
                    <div key={check.label} className={`rounded-lg border p-3 ${check.ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-2">
                            {check.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                            <p className="text-xs font-black uppercase tracking-widest text-slate-600">{check.label}</p>
                        </div>
                        <p className="mt-2 text-sm font-black text-slate-900">{check.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
function formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(date);
}

function approvalLabel(approval?: AreaVersionApproval): string {
    if (!approval) return 'Pendente';
    if (approval.status === 'approved') return 'Aprovada';
    if (approval.status === 'rejected') return 'Rejeitada';
    return 'Pendente';
}

function LifecycleAuditPanel({ version, technicalApproval, legalApproval, auditLogs }: { version: AreaVersion | null; technicalApproval?: AreaVersionApproval; legalApproval?: AreaVersionApproval; auditLogs: AreaVersionAuditLog[] }) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.2fr] gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Hashes documentais</p>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <div><span className="font-black">Payload:</span> <span className="font-mono">{shortHash(version?.version_payload_hash)}</span></div>
                    <div><span className="font-black">Identidade:</span> <span className="font-mono">{shortHash(version?.version_identity_hash)}</span></div>
                    <div><span className="font-black">Locked at:</span> {formatDateTime(version?.locked_at)}</div>
                </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Aprovacoes</p>
                <div className="mt-2 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between gap-3"><span className="font-black">Tecnica</span><span>{approvalLabel(technicalApproval)}</span></div>
                    <div className="text-[11px] text-slate-500">{technicalApproval?.approval_hash ? shortHash(technicalApproval.approval_hash) : formatDateTime(technicalApproval?.reviewed_at)}</div>
                    <div className="flex items-center justify-between gap-3"><span className="font-black">Juridica</span><span>{approvalLabel(legalApproval)}</span></div>
                    <div className="text-[11px] text-slate-500">{legalApproval?.approval_hash ? shortHash(legalApproval.approval_hash) : formatDateTime(legalApproval?.reviewed_at)}</div>
                </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Auditoria recente</p>
                {auditLogs.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Nenhum evento registrado.</p>
                ) : (
                    <div className="mt-2 space-y-2">
                        {auditLogs.slice(0, 4).map(log => (
                            <div key={log.id} className="flex items-center justify-between gap-3 text-xs">
                                <div className="min-w-0">
                                    <p className="truncate font-black uppercase text-slate-700">{log.action}</p>
                                    <p className="truncate text-slate-500">{log.entity_type}</p>
                                </div>
                                <span className="shrink-0 text-slate-500">{formatDateTime(log.performed_at)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
function StructureAdminList({ title, rows, empty, disabled, onEdit, onDelete }: { title: string; rows: { id: string; label: string; detail: string }[]; empty: string; disabled: boolean; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">{title}</h4>
            </div>
            {rows.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">{empty}</div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {rows.map(row => (
                        <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-800">{row.label}</p>
                                <p className="truncate text-xs text-slate-500">{row.detail}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(row.id)} disabled={disabled} className="text-slate-600 hover:text-blue-700">
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(row.id)} disabled={disabled} className="text-red-600 hover:text-red-700">
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
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
