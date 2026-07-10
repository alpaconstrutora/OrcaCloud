import React from 'react';
import {
    ArrowLeftRight,
    Building2,
    Calculator,
    CheckCircle2,
    FileSpreadsheet,
    FileText,
    Lock,
    Plus,
    RefreshCw,
    ShieldCheck,
} from 'lucide-react';
import Button from './ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import {
    statusLabel,
    formatNumber,
    shortHash,
    statusTone,
    isVersionStructureEditable,
    EmptyState,
    RpcFeedback,
    AreaQaPanel,
    LifecycleAuditPanel,
    StructureAdminList,
    ResultTable,
} from './area-engine/AreaEngineShared';
import { areaEngineService } from '../services/areaEngineService';
import type { AreaImportReport, AreaWriteBackReport } from '../services/areaEngineService';
import { areaEngineExportService } from '../services/areaEngineExportService';
import { empreendimentoService } from '../services/empreendimentoService';
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

type TableView = 'resumo' | 'estrutura' | 'quadro_i' | 'quadro_ii' | 'quadro_ivb' | 'aprovacoes';
type StructureEditKind = 'block' | 'floor' | 'unit' | 'space';

export default function AreaEngineModule({ organizationId }: AreaEngineModuleProps) {
    const [projects, setProjects] = React.useState<AreaProject[]>([]);
    const [versions, setVersions] = React.useState<AreaVersion[]>([]);
    const [selectedProjectId, setSelectedProjectId] = React.useState<string>('');
    const [selectedVersionId, setSelectedVersionId] = React.useState<string>('');
    const [structure, setStructure] = React.useState<AreaVersionStructure>({ blocks: [], floors: [], units: [], spaces: [], commonDistributionScopes: [], accessoryLinks: [], commonAllocations: [] });
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
    const [isImportOpen, setIsImportOpen] = React.useState(false);
    const [empreendimentos, setEmpreendimentos] = React.useState<{ id: string; name: string }[]>([]);
    const [selectedEmpreendimentoId, setSelectedEmpreendimentoId] = React.useState('');
    const [importReport, setImportReport] = React.useState<AreaImportReport | null>(null);
    const [writeBackReport, setWriteBackReport] = React.useState<AreaWriteBackReport | null>(null);
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
    const [accessoryParentUnitId, setAccessoryParentUnitId] = React.useState('');
    const [accessoryUnitId, setAccessoryUnitId] = React.useState('');
    const [accessoryLinkType, setAccessoryLinkType] = React.useState<'parking' | 'storage' | 'box' | 'exclusive_area' | 'other'>('parking');
    const [accessoryAffectsPrivateArea, setAccessoryAffectsPrivateArea] = React.useState(true);
    const [accessoryAffectsCoefficient, setAccessoryAffectsCoefficient] = React.useState(true);
    const [accessoryLegalNote, setAccessoryLegalNote] = React.useState('');
    const [allocationCommonSpaceId, setAllocationCommonSpaceId] = React.useState('');
    const [allocationTargetUnitId, setAllocationTargetUnitId] = React.useState('');
    const [allocationMethod, setAllocationMethod] = React.useState<'fixed_area' | 'percentage'>('fixed_area');
    const [allocationValue, setAllocationValue] = React.useState('');
    const [allocationJustification, setAllocationJustification] = React.useState('');
    const [editingStructure, setEditingStructure] = React.useState<{ kind: StructureEditKind; id: string } | null>(null);
    const [structureSubTab, setStructureSubTab] = React.useState<StructureEditKind>('block');
    // Edicao em lote de espacos privativos (Camada B)
    const [selectedSpaceIds, setSelectedSpaceIds] = React.useState<Set<string>>(new Set());
    const [bulkCoverageClass, setBulkCoverageClass] = React.useState('covered_different');
    const [bulkCoefficientValue, setBulkCoefficientValue] = React.useState('0.75');
    // Assistente de vaga/deposito (Camada B)
    const [isVagaWizardOpen, setIsVagaWizardOpen] = React.useState(false);
    const [vagaParentUnitId, setVagaParentUnitId] = React.useState('');
    const [vagaQuantity, setVagaQuantity] = React.useState('1');
    const [vagaCodePrefix, setVagaCodePrefix] = React.useState('VG');
    const [vagaArea, setVagaArea] = React.useState('12');
    const [vagaLinkType, setVagaLinkType] = React.useState<'parking' | 'storage' | 'box' | 'exclusive_area' | 'other'>('parking');
    const [vagaAffectsPrivateArea, setVagaAffectsPrivateArea] = React.useState(true);
    const [vagaAffectsCoefficient, setVagaAffectsCoefficient] = React.useState(true);

    const selectedVersion = versions.find(v => v.id === selectedVersionId) || null;
    const technicalApproval = approvals.find(approval => approval.approval_type === 'technical');
    const legalApproval = approvals.find(approval => approval.approval_type === 'legal');
    const canApproveTechnical = selectedVersion?.status === 'calculated';
    const canApproveLegal = selectedVersion?.status === 'technically_approved';
    const canLockVersion = selectedVersion?.status === 'legally_approved';
    const structureIsEditable = isVersionStructureEditable(selectedVersion?.status);
    const canWriteBack = !!selectedVersion && !['draft', 'superseded', 'cancelled'].includes(selectedVersion.status);

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
            setStructure({ blocks: [], floors: [], units: [], spaces: [], commonDistributionScopes: [], accessoryLinks: [], commonAllocations: [] });
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
        setAccessoryParentUnitId(prev => prev || firstUnitId);
        setAccessoryUnitId(prev => prev || structure.units.find(unit => unit.id !== firstUnitId)?.id || '');
        setAllocationTargetUnitId(prev => prev || firstUnitId);
        setAllocationCommonSpaceId(prev => prev || structure.spaces.find(space => space.use_class === 'common' && space.common_division_class === 'non_proportional')?.id || '');
    }, [structure.blocks, structure.floors, structure.units, structure.spaces]);

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

    async function openImport() {
        setIsImportOpen(true);
        setImportReport(null);
        if (empreendimentos.length === 0 && organizationId) {
            try {
                const rows = await empreendimentoService.list(organizationId);
                const mapped = rows.map(row => ({ id: row.id, name: row.name }));
                setEmpreendimentos(mapped);
                setSelectedEmpreendimentoId(prev => prev || mapped[0]?.id || '');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erro ao carregar empreendimentos.');
            }
        }
    }

    async function runImport(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!organizationId || !selectedEmpreendimentoId) {
            setError('Selecione um empreendimento para importar.');
            return;
        }
        setActionLoading('import');
        setError(null);
        setFeedback(null);
        setImportReport(null);
        try {
            const report = await areaEngineService.importFromEmpreendimento(selectedEmpreendimentoId, organizationId);
            const rows = await areaEngineService.listProjects(organizationId);
            setProjects(rows);
            setSelectedProjectId(report.projectId);
            const versionRows = await areaEngineService.listVersions(report.projectId);
            setVersions(versionRows);
            setSelectedVersionId(report.versionId);
            setActiveTable('estrutura');
            await loadResults(report.versionId);
            setImportReport(report);
            setIsImportOpen(false);
            setFeedback({
                status: 'success',
                warnings: report.warnings.map((message, idx) => ({ code: `IMPORT_${idx + 1}`, message })),
                blocking_errors: [],
                message: report.isNewProject
                    ? `Importado: ${report.blocks} bloco(s), ${report.units} unidade(s), ${report.privateSpaces} area(s) privativa(s), ${report.commonSpaces} comum(ns).`
                    : `Re-sincronizado como versao v${report.versionNumber}.`,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao importar do empreendimento.');
        } finally {
            setActionLoading(null);
        }
    }

    async function runWriteBack() {
        if (!selectedVersionId) return;
        setActionLoading('write-back');
        setError(null);
        setFeedback(null);
        setWriteBackReport(null);
        try {
            const report = await areaEngineService.writeBackFractionsToEmpreendimento(selectedVersionId);
            setWriteBackReport(report);
            setFeedback({
                status: 'success',
                warnings: report.warnings.map((message, idx) => ({ code: `WRITEBACK_${idx + 1}`, message })),
                blocking_errors: [],
                message: `Fracao ideal escrita em ${report.unitsUpdated} unidade(s) do Empreendimento.`,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao escrever fracao ideal no Empreendimento.');
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
        if (!isVersionStructureEditable(selectedVersion.status)) {
            setError('Esta versao nao permite edicao estrutural. Crie uma nova revisao para alterar a estrutura.');
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
        setStructureSubTab(kind);

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
        const scope = structure.commonDistributionScopes.find(item => item.common_space_id === space.id);
        setEditorSpaceScope(scope?.distribution_scope === 'block' ? 'block' : 'global');
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
            if (selectedProjectId) await loadVersions(selectedProjectId);
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
            if (selectedProjectId) await loadVersions(selectedProjectId);
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
            if (selectedProjectId) await loadVersions(selectedProjectId);
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
            if (selectedProjectId) await loadVersions(selectedProjectId);
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
            if (selectedProjectId) await loadVersions(selectedProjectId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao remover registro da estrutura.');
        } finally {
            setActionLoading(null);
        }
    }

    async function addAccessoryLink(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!versionIsEditable()) return;
        if (!accessoryParentUnitId || !accessoryUnitId) { setError('Selecione a unidade principal e a unidade acessoria.'); return; }
        if (accessoryParentUnitId === accessoryUnitId) { setError('A unidade acessoria deve ser diferente da unidade principal.'); return; }
        setActionLoading('add-accessory-link');
        setError(null);
        try {
            await areaEngineService.createAccessoryUnitLink(selectedVersionId, {
                parentUnitId: accessoryParentUnitId,
                accessoryUnitId,
                linkType: accessoryLinkType,
                affectsPrivateArea: accessoryAffectsPrivateArea,
                affectsCoefficient: accessoryAffectsCoefficient,
                legalNote: accessoryLegalNote,
            });
            await loadResults(selectedVersionId);
            if (selectedProjectId) await loadVersions(selectedProjectId);
            setAccessoryLegalNote('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar vinculo acessorio.');
        } finally {
            setActionLoading(null);
        }
    }

    async function deleteAccessoryLink(id: string) {
        if (!versionIsEditable()) return;
        setActionLoading('delete-accessory-link');
        setError(null);
        try {
            await areaEngineService.deleteAccessoryLink(id);
            await loadResults(selectedVersionId);
            if (selectedProjectId) await loadVersions(selectedProjectId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao remover vinculo acessorio.');
        } finally {
            setActionLoading(null);
        }
    }

    async function addCommonAllocation(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!versionIsEditable()) return;
        if (!allocationCommonSpaceId || !allocationTargetUnitId) { setError('Selecione a area comum e a unidade alvo.'); return; }
        const numericValue = Number(allocationValue.replace(',', '.'));
        if (!Number.isFinite(numericValue) || numericValue <= 0) { setError('Informe um valor maior que zero para a alocacao.'); return; }
        if (allocationMethod === 'percentage' && numericValue > 1) { setError('Percentual deve ser informado em decimal entre 0 e 1. Exemplo: 0,25.'); return; }
        setActionLoading('add-common-allocation');
        setError(null);
        try {
            await areaEngineService.createCommonAllocation(selectedVersionId, {
                commonSpaceId: allocationCommonSpaceId,
                targetUnitId: allocationTargetUnitId,
                allocationMethod,
                allocatedRealArea: allocationMethod === 'fixed_area' ? numericValue : null,
                percentage: allocationMethod === 'percentage' ? numericValue : null,
                justification: allocationJustification,
            });
            await loadResults(selectedVersionId);
            if (selectedProjectId) await loadVersions(selectedProjectId);
            setAllocationValue('');
            setAllocationJustification('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar alocacao comum.');
        } finally {
            setActionLoading(null);
        }
    }

    async function deleteCommonAllocation(id: string) {
        if (!versionIsEditable()) return;
        setActionLoading('delete-common-allocation');
        setError(null);
        try {
            await areaEngineService.deleteCommonAllocation(id);
            await loadResults(selectedVersionId);
            if (selectedProjectId) await loadVersions(selectedProjectId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao remover alocacao comum.');
        } finally {
            setActionLoading(null);
        }
    }
    // ── Edicao em lote de espacos privativos (Camada B) ──────────────────────
    const privateSpacesList = structure.spaces.filter(space => space.use_class === 'private');

    function toggleSpaceSelection(id: string) {
        setSelectedSpaceIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function toggleSelectAllPrivateSpaces() {
        setSelectedSpaceIds(prev => prev.size === privateSpacesList.length
            ? new Set()
            : new Set(privateSpacesList.map(space => space.id)));
    }

    async function applyBulkSpaceEdit() {
        if (!versionIsEditable() || selectedSpaceIds.size === 0) return;
        const coefficient = Number(bulkCoefficientValue.replace(',', '.'));
        if (!Number.isFinite(coefficient) || coefficient <= 0) { setError('Informe um coeficiente maior que zero.'); return; }
        setActionLoading('bulk-edit-spaces');
        setError(null);
        try {
            const targets = structure.spaces.filter(space => selectedSpaceIds.has(space.id));
            await Promise.all(targets.map(space => areaEngineService.updateSpace(space.id, {
                blockId: space.block_id,
                floorId: space.floor_id || null,
                unitId: space.unit_id || null,
                code: space.code || undefined,
                name: space.name,
                useClass: space.use_class as 'private' | 'common',
                realArea: Number(space.real_area_m2_raw),
                coverageClass: bulkCoverageClass,
                commonDivisionClass: space.common_division_class === 'non_proportional' ? 'non_proportional' : 'proportional',
                coefficientValue: coefficient,
                materializedIndex: Number(space.materialized_index ?? 0),
                distributionScope: structure.commonDistributionScopes.find(item => item.common_space_id === space.id)?.distribution_scope === 'block' ? 'block' : 'global',
            })));
            await loadResults(selectedVersionId);
            if (selectedProjectId) await loadVersions(selectedProjectId);
            setSelectedSpaceIds(new Set());
            setFeedback({ status: 'success', warnings: [], blocking_errors: [], message: `${targets.length} espaco(s) atualizado(s) em lote.` });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao aplicar edicao em lote.');
        } finally {
            setActionLoading(null);
        }
    }

    // ── Assistente de vaga/deposito (Camada B) ───────────────────────────────
    async function createVagasWizard(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!versionIsEditable()) return;
        const blockId = structure.units.find(unit => unit.id === vagaParentUnitId)?.block_id || structure.blocks[0]?.id;
        if (!vagaParentUnitId) { setError('Selecione a unidade principal.'); return; }
        if (!blockId) { setError('Cadastre um bloco antes de criar vagas.'); return; }
        const qty = Math.max(1, Math.round(Number(vagaQuantity) || 1));
        const area = parsePositiveArea(vagaArea, 'area da vaga/deposito');
        if (area === null) return;
        setActionLoading('create-vaga');
        setError(null);
        setFeedback(null);
        try {
            for (let i = 0; i < qty; i++) {
                const code = qty > 1 ? `${vagaCodePrefix}-${i + 1}` : vagaCodePrefix;
                const unit = await areaEngineService.createUnit(selectedVersionId, {
                    blockId,
                    code,
                    unitType: vagaLinkType === 'storage' ? 'storage' : 'parking',
                    materializedIndex: structure.units.length + i + 1,
                });
                await areaEngineService.createSpace(selectedVersionId, {
                    blockId,
                    unitId: unit.id,
                    code: `${code}-PRIV`,
                    name: `Area privativa ${code}`,
                    useClass: 'private',
                    realArea: area,
                    coverageClass: 'covered_standard',
                    coefficientValue: 1,
                    materializedIndex: structure.spaces.length + i + 1,
                });
                await areaEngineService.createAccessoryUnitLink(selectedVersionId, {
                    parentUnitId: vagaParentUnitId,
                    accessoryUnitId: unit.id,
                    linkType: vagaLinkType,
                    affectsPrivateArea: vagaAffectsPrivateArea,
                    affectsCoefficient: vagaAffectsCoefficient,
                });
            }
            await loadResults(selectedVersionId);
            if (selectedProjectId) await loadVersions(selectedProjectId);
            setIsVagaWizardOpen(false);
            setFeedback({ status: 'success', warnings: [], blocking_errors: [], message: `${qty} vaga(s)/deposito(s) criado(s) e vinculado(s).` });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar vaga/deposito.');
        } finally {
            setActionLoading(null);
        }
    }

    const commonNonProportionalSpaces = structure.spaces.filter(space => space.use_class === 'common' && space.common_division_class === 'non_proportional');
    const accessoryCandidateUnits = structure.units.filter(unit => ['parking', 'storage', 'technical', 'other'].includes(unit.unit_type));
    const privateAreaTotal = structure.spaces.filter(space => space.use_class === 'private').reduce((sum, space) => sum + Number(space.real_area_m2_raw || 0), 0);
    const commonAreaTotal = structure.spaces.filter(space => space.use_class === 'common').reduce((sum, space) => sum + Number(space.real_area_m2_raw || 0), 0);

    const coefficientSum = quadroII.reduce((sum, row) => sum + Number(row.qii_31_proportionality_coefficient_raw || 0), 0);
    const realTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_37_unit_real_total_raw || 0), 0);
    const equivalentTotal = quadroII.reduce((sum, row) => sum + Number(row.qii_38_unit_equivalent_total_raw || 0), 0);

    // ── Checklist de pendencias (Camada B) — espelha as regras bloqueantes do
    // motor client-side, para dar atalho direto de edicao por item. Sem chamada
    // de RPC: recalcula a cada mudanca da estrutura ja carregada.
    const structureChecklist = React.useMemo(() => {
        const items: { id: string; kind: 'space' | 'unit'; severity: 'error' | 'warning'; message: string }[] = [];
        for (const space of structure.spaces) {
            const label = space.code || space.name;
            if (space.coverage_class !== 'covered_standard' && (space.coefficient_value === null || space.coefficient_value === undefined)) {
                items.push({ id: space.id, kind: 'space', severity: 'error', message: `Espaco "${label}": area nao padrao sem coeficiente (MOTOR_007).` });
            } else if (space.coverage_class !== 'covered_standard' && Number(space.coefficient_value) === 1) {
                items.push({ id: space.id, kind: 'space', severity: 'warning', message: `Espaco "${label}": coeficiente ainda no padrao (1) para area nao padrao — revisar equivalencia real.` });
            }
            if (space.use_class === 'common' && space.common_division_class === 'not_applicable') {
                items.push({ id: space.id, kind: 'space', severity: 'error', message: `Area comum "${label}": sem tipo de divisao (MOTOR_012).` });
            }
            if (space.use_class === 'common' && space.common_division_class === 'proportional') {
                const hasScope = structure.commonDistributionScopes.some(scope => scope.common_space_id === space.id);
                if (!hasScope) items.push({ id: space.id, kind: 'space', severity: 'error', message: `Area comum "${label}": proporcional sem escopo de distribuicao (COM_PROP_VAL_001).` });
            }
        }
        for (const unit of structure.units) {
            if (!['parking', 'storage'].includes(unit.unit_type)) continue;
            const hasOwnSpace = structure.spaces.some(space => space.unit_id === unit.id);
            const isAccessoryTarget = structure.accessoryLinks.some(link => link.accessory_unit_id === unit.id);
            if (!hasOwnSpace && !isAccessoryTarget) {
                items.push({ id: unit.id, kind: 'unit', severity: 'warning', message: `Unidade "${unit.code}" (${unit.unit_type}): sem area propria nem vinculo acessorio.` });
            }
        }
        return items;
    }, [structure]);

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
                    <Button variant="secondary" onClick={openImport} disabled={!!actionLoading}>
                        <Building2 className="w-4 h-4" /> Importar de Empreendimento
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
                    <Button variant="secondary" onClick={runWriteBack} disabled={!canWriteBack || actionLoading === 'write-back'}>
                        <ArrowLeftRight className="w-4 h-4" /> Fracao ideal → Empreendimento
                    </Button>
                </div>
            </header>

            {error && (
                <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm font-medium">
                    {error}
                </div>
            )}

            <Sheet open={isCreateOpen} onClose={() => setIsCreateOpen(false)} size="md">
                <SheetHeader onClose={() => setIsCreateOpen(false)}>
                    <SheetTitle>Novo projeto de areas</SheetTitle>
                    <SheetDescription>Cria o projeto e a primeira versao de calculo.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    <form id="area-create-form" onSubmit={createAreaProject} className="space-y-4">
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Nome</span>
                            <input
                                value={newProjectName}
                                onChange={event => setNewProjectName(event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                placeholder="Ex.: Torre Residencial A"
                            />
                        </label>
                        <label className="space-y-1 block">
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
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Versao</span>
                            <input
                                value={newVersionLabel}
                                onChange={event => setNewVersionLabel(event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                placeholder="Versao inicial"
                            />
                        </label>
                    </form>
                </SheetPanel>
                <SheetFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                    <Button type="submit" form="area-create-form" disabled={actionLoading === 'create-project'}>
                        <Plus className="w-4 h-4" /> Criar
                    </Button>
                </SheetFooter>
            </Sheet>

            <Sheet open={isImportOpen} onClose={() => setIsImportOpen(false)} size="md">
                <SheetHeader onClose={() => setIsImportOpen(false)}>
                    <SheetTitle>Importar de Empreendimento</SheetTitle>
                    <SheetDescription>Gera projeto + versao inicial com torres, pavimentos, unidades e areas privativas/comuns. Se o empreendimento ja foi importado, cria uma NOVA versao (re-sincronizacao) com relatorio de mudancas — a versao anterior e preservada. Coeficientes, coberturas e vagas sao revisados no editor antes de calcular.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    <form id="area-import-form" onSubmit={runImport} className="space-y-4">
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Empreendimento</span>
                            <select
                                value={selectedEmpreendimentoId}
                                onChange={event => setSelectedEmpreendimentoId(event.target.value)}
                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            >
                                {empreendimentos.length === 0 && <option value="">Nenhum empreendimento encontrado</option>}
                                {empreendimentos.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                            </select>
                        </label>
                    </form>
                </SheetPanel>
                <SheetFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsImportOpen(false)}>Cancelar</Button>
                    <Button type="submit" form="area-import-form" disabled={!selectedEmpreendimentoId || actionLoading === 'import'}>
                        <Building2 className="w-4 h-4" /> Importar
                    </Button>
                </SheetFooter>
            </Sheet>

            {importReport && (
                <div className="border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg px-4 py-3 text-sm">
                    <p className="font-bold">
                        {importReport.isNewProject ? 'Importacao concluida' : `Re-sincronizacao concluida (versao v${importReport.versionNumber})`}
                    </p>
                    <p className="mt-1 text-xs">
                        {importReport.blocks} bloco(s) · {importReport.floors} pavimento(s) · {importReport.units} unidade(s) · {importReport.privateSpaces} area(s) privativa(s) · {importReport.commonSpaces} area(s) comum(ns).
                    </p>
                    {(importReport.skippedUnitsNoArea > 0 || importReport.skippedCommonsNoArea > 0) && (
                        <p className="mt-1 text-xs text-amber-700">
                            Ignorados: {importReport.skippedUnitsNoArea} unidade(s) sem area, {importReport.skippedCommonsNoArea} comum(ns) sem metragem.
                        </p>
                    )}
                    {importReport.drift && (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-white/70 p-2 text-xs">
                            <p className="font-bold uppercase tracking-widest text-[10px] text-emerald-700">Mudancas vs versao anterior</p>
                            {(importReport.drift.unitsAdded.length + importReport.drift.unitsRemoved.length + importReport.drift.unitsAreaChanged.length + importReport.drift.blocksAdded.length + importReport.drift.blocksRemoved.length) === 0 ? (
                                <p className="mt-1">Nenhuma mudanca estrutural.</p>
                            ) : (
                                <ul className="mt-1 space-y-0.5">
                                    {importReport.drift.blocksAdded.length > 0 && <li>Blocos novos: {importReport.drift.blocksAdded.join(', ')}</li>}
                                    {importReport.drift.blocksRemoved.length > 0 && <li>Blocos removidos: {importReport.drift.blocksRemoved.join(', ')}</li>}
                                    {importReport.drift.unitsAdded.length > 0 && <li>Unidades novas ({importReport.drift.unitsAdded.length}): {importReport.drift.unitsAdded.slice(0, 12).join(', ')}{importReport.drift.unitsAdded.length > 12 ? '…' : ''}</li>}
                                    {importReport.drift.unitsRemoved.length > 0 && <li>Unidades removidas ({importReport.drift.unitsRemoved.length}): {importReport.drift.unitsRemoved.slice(0, 12).join(', ')}{importReport.drift.unitsRemoved.length > 12 ? '…' : ''}</li>}
                                    {importReport.drift.unitsAreaChanged.length > 0 && (
                                        <li>
                                            Areas privativas alteradas ({importReport.drift.unitsAreaChanged.length}):{' '}
                                            {importReport.drift.unitsAreaChanged.slice(0, 8).map(c => `${c.code} ${formatNumber(c.before)}→${formatNumber(c.after)}`).join('; ')}{importReport.drift.unitsAreaChanged.length > 8 ? '…' : ''}
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {writeBackReport && (
                <div className="border border-blue-200 bg-blue-50 text-blue-800 rounded-lg px-4 py-3 text-sm">
                    <p className="font-bold">Fracao ideal escrita no Empreendimento</p>
                    <p className="mt-1 text-xs">
                        {writeBackReport.unitsUpdated} unidade(s) atualizada(s).
                        {writeBackReport.unitsWithoutSource > 0 && ` ${writeBackReport.unitsWithoutSource} unidade(s) sem proveniencia do Empreendimento nao foram atualizadas.`}
                    </p>
                </div>
            )}

            <Sheet open={isVagaWizardOpen} onClose={() => setIsVagaWizardOpen(false)} size="md">
                <SheetHeader onClose={() => setIsVagaWizardOpen(false)}>
                    <SheetTitle>Assistente de vaga/deposito</SheetTitle>
                    <SheetDescription>Cria N unidades acessorias (vaga/deposito), 1 espaco privativo cada e o vinculo com a unidade principal, em um unico passo.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    <form id="area-vaga-form" onSubmit={createVagasWizard} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="space-y-1 block md:col-span-2">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Unidade principal</span>
                            <select value={vagaParentUnitId} onChange={event => setVagaParentUnitId(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                                <option value="">Selecione</option>
                                {structure.units.map(unit => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Quantidade</span>
                            <input value={vagaQuantity} onChange={event => setVagaQuantity(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Prefixo do codigo</span>
                            <input value={vagaCodePrefix} onChange={event => setVagaCodePrefix(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Area cada (m2)</span>
                            <input value={vagaArea} onChange={event => setVagaArea(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Tipo</span>
                            <select value={vagaLinkType} onChange={event => setVagaLinkType(event.target.value as typeof vagaLinkType)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                                <option value="parking">Vaga</option>
                                <option value="storage">Deposito</option>
                                <option value="box">Box</option>
                                <option value="exclusive_area">Area exclusiva</option>
                                <option value="other">Outro</option>
                            </select>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                            <input type="checkbox" checked={vagaAffectsPrivateArea} onChange={event => setVagaAffectsPrivateArea(event.target.checked)} /> Afeta area privativa
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                            <input type="checkbox" checked={vagaAffectsCoefficient} onChange={event => setVagaAffectsCoefficient(event.target.checked)} /> Afeta coeficiente
                        </label>
                    </form>
                </SheetPanel>
                <SheetFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsVagaWizardOpen(false)}>Cancelar</Button>
                    <Button type="submit" form="area-vaga-form" disabled={!selectedVersionId || !vagaParentUnitId || actionLoading === 'create-vaga'}>
                        <Plus className="w-4 h-4" /> Criar
                    </Button>
                </SheetFooter>
            </Sheet>

            <Sheet open={isStructureOpen} onClose={() => setIsStructureOpen(false)} size="md">
                <SheetHeader onClose={() => setIsStructureOpen(false)}>
                    <SheetTitle>Estrutura minima</SheetTitle>
                    <SheetDescription>Gera 1 bloco, 1 pavimento, 2 unidades e 1 area comum proporcional.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    <form id="area-structure-form" onSubmit={createMinimalStructure} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Unidade 1</span>
                            <input value={structureUnit1Code} onChange={event => setStructureUnit1Code(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Area 1</span>
                            <input value={structureUnit1Area} onChange={event => setStructureUnit1Area(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Unidade 2</span>
                            <input value={structureUnit2Code} onChange={event => setStructureUnit2Code(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Area 2</span>
                            <input value={structureUnit2Area} onChange={event => setStructureUnit2Area(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="space-y-1 block md:col-span-2">
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Area comum proporcional</span>
                            <input value={structureCommonArea} onChange={event => setStructureCommonArea(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </label>
                    </form>
                </SheetPanel>
                <SheetFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsStructureOpen(false)}>Cancelar</Button>
                    <Button type="submit" form="area-structure-form" disabled={!selectedVersionId || actionLoading === 'create-structure'}>
                        <Plus className="w-4 h-4" /> Gerar e calcular
                    </Button>
                </SheetFooter>
            </Sheet>

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
                                            <span className={`shrink-0 text-sm font-normal ${statusTone(version.status)}`}>
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
                    <Tabs value={activeTable} onValueChange={value => setActiveTable(value as TableView)}>
                        <TabsList className="flex-wrap">
                            <TabsTrigger value="resumo">
                                Resumo{structureChecklist.length > 0 ? ` (${structureChecklist.length})` : ''}
                            </TabsTrigger>
                            <TabsTrigger value="estrutura">Estrutura</TabsTrigger>
                            <TabsTrigger value="quadro_i">Quadro I</TabsTrigger>
                            <TabsTrigger value="quadro_ii">Quadro II</TabsTrigger>
                            <TabsTrigger value="quadro_ivb">IV-B</TabsTrigger>
                            <TabsTrigger value="aprovacoes">Aprovacoes</TabsTrigger>
                        </TabsList>

                        <TabsContent value="resumo" className="mt-5 space-y-5">
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

                            {structureChecklist.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Checklist de pendencias</h2>
                                        <span className="text-xs text-slate-400">{structureChecklist.length} item(ns)</span>
                                    </div>
                                    <div className="space-y-1">
                                        {structureChecklist.map((item, idx) => (
                                            <div key={`${item.kind}-${item.id}-${idx}`} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-semibold ${item.severity === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                                <span>{item.message}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => { setActiveTable('estrutura'); beginStructureEdit(item.kind, item.id); }}
                                                    className="shrink-0 font-black uppercase tracking-widest underline hover:no-underline"
                                                >
                                                    Editar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <AreaQaPanel
                                quadroI={quadroI}
                                quadroII={quadroII}
                                quadroIVB={quadroIVB}
                                fractions={areaFractions}
                                coefficientSum={coefficientSum}
                            />

                            <RpcFeedback result={feedback} />
                        </TabsContent>

                        <TabsContent value="aprovacoes" className="mt-5">
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
                            </div>
                        </TabsContent>

                        <TabsContent value="estrutura" className="mt-5">
                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
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
                                            {selectedVersion && !structureIsEditable && (
                                                <span className="text-sm font-normal text-amber-700">Somente leitura</span>
                                            )}
                                        </div>
                                    </div>

                                    <Tabs value={structureSubTab} onValueChange={value => setStructureSubTab(value as StructureEditKind)}>
                                        <TabsList>
                                            <TabsTrigger value="block">Blocos ({structure.blocks.length})</TabsTrigger>
                                            <TabsTrigger value="floor">Pavimentos ({structure.floors.length})</TabsTrigger>
                                            <TabsTrigger value="unit">Unidades ({structure.units.length})</TabsTrigger>
                                            <TabsTrigger value="space">Espacos ({structure.spaces.length})</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="block" className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                                            <form onSubmit={addBlock} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Bloco</h4>
                                                <div className="grid grid-cols-[120px_1fr] gap-2">
                                                    <input value={editorBlockCode} onChange={event => setEditorBlockCode(event.target.value)} placeholder="Codigo" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                    <input value={editorBlockName} onChange={event => setEditorBlockName(event.target.value)} placeholder="Nome do bloco" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                </div>
                                                <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || !structureIsEditable}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'block' ? 'Salvar bloco' : 'Adicionar bloco'}</Button>
                                            </form>
                                            <StructureAdminList title="Blocos cadastrados" empty="Nenhum bloco cadastrado." rows={structure.blocks.map(block => ({ id: block.id, label: `${block.code || '-'} - ${block.name}`, detail: `Ordem ${block.sort_order || 0}` }))} onEdit={id => beginStructureEdit('block', id)} onDelete={id => deleteStructureRecord('block', id)} disabled={!!actionLoading || !structureIsEditable} />
                                        </TabsContent>

                                        <TabsContent value="floor" className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                                                <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || !structureIsEditable}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'floor' ? 'Salvar pavimento' : 'Adicionar pavimento'}</Button>
                                            </form>
                                            <StructureAdminList title="Pavimentos cadastrados" empty="Nenhum pavimento cadastrado." rows={structure.floors.map(floor => ({ id: floor.id, label: `${floor.code || '-'} - ${floor.name}`, detail: floor.floor_type }))} onEdit={id => beginStructureEdit('floor', id)} onDelete={id => deleteStructureRecord('floor', id)} disabled={!!actionLoading || !structureIsEditable} />
                                        </TabsContent>

                                        <TabsContent value="unit" className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                                                <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || !structureIsEditable}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'unit' ? 'Salvar unidade' : 'Adicionar unidade'}</Button>
                                            </form>
                                            <StructureAdminList title="Unidades cadastradas" empty="Nenhuma unidade cadastrada." rows={structure.units.map(unit => ({ id: unit.id, label: unit.code, detail: `${unit.unit_type} ${unit.typology_code || ''}`.trim() }))} onEdit={id => beginStructureEdit('unit', id)} onDelete={id => deleteStructureRecord('unit', id)} disabled={!!actionLoading || !structureIsEditable} />
                                        </TabsContent>

                                        <TabsContent value="space" className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                                                <Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || !structureIsEditable}><Plus className="w-4 h-4" /> {editingStructure?.kind === 'space' ? 'Salvar espaco' : 'Adicionar espaco'}</Button>
                                            </form>
                                            <StructureAdminList title="Espacos cadastrados" empty="Nenhum espaco cadastrado." rows={structure.spaces.map(space => {
                                                const scope = structure.commonDistributionScopes.find(item => item.common_space_id === space.id);
                                                const useLabel = space.use_class === 'private' ? 'Privativo' : `Comum ${scope?.distribution_scope === 'block' ? 'bloco' : 'global'}`;
                                                return { id: space.id, label: `${space.code || '-'} - ${space.name}`, detail: `${useLabel} - ${formatNumber(space.real_area_m2_raw)} m2` };
                                            })} onEdit={id => beginStructureEdit('space', id)} onDelete={id => deleteStructureRecord('space', id)} disabled={!!actionLoading || !structureIsEditable} />
                                        </TabsContent>
                                    </Tabs>

                                    {privateSpacesList.length > 0 && (
                                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Edicao em lote — espacos privativos</h4>
                                                <button type="button" onClick={toggleSelectAllPrivateSpaces} className="text-xs font-bold text-blue-600 hover:underline" disabled={!structureIsEditable}>
                                                    {selectedSpaceIds.size === privateSpacesList.length ? 'Limpar selecao' : 'Selecionar todos'}
                                                </button>
                                            </div>
                                            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                                                {privateSpacesList.map(space => (
                                                    <label key={space.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                                        <input type="checkbox" checked={selectedSpaceIds.has(space.id)} onChange={() => toggleSpaceSelection(space.id)} disabled={!structureIsEditable} />
                                                        <span className="truncate">{space.code || space.name} — {formatNumber(space.real_area_m2_raw)} m2, coef {formatNumber(space.coefficient_value ?? 1, 4)}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                                                <label className="space-y-1">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cobertura</span>
                                                    <select value={bulkCoverageClass} onChange={event => setBulkCoverageClass(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm">
                                                        <option value="covered_standard">Coberta padrao</option>
                                                        <option value="covered_different">Coberta diferente</option>
                                                        <option value="uncovered">Descoberta</option>
                                                    </select>
                                                </label>
                                                <label className="space-y-1">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Coeficiente</span>
                                                    <input value={bulkCoefficientValue} onChange={event => setBulkCoefficientValue(event.target.value)} placeholder="0,75" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
                                                </label>
                                                <Button type="button" size="sm" onClick={applyBulkSpaceEdit} disabled={selectedSpaceIds.size === 0 || !structureIsEditable || !!actionLoading}>
                                                    Aplicar em {selectedSpaceIds.size || 0} espaco(s)
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Vinculos acessorios</h4>
                                                <Button type="button" variant="secondary" size="sm" onClick={() => setIsVagaWizardOpen(true)} disabled={!structureIsEditable || !!actionLoading}>
                                                    <Plus className="w-3 h-3" /> Assistente de vaga/deposito
                                                </Button>
                                            </div>
                                            <form onSubmit={addAccessoryLink} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                <select value={accessoryParentUnitId} onChange={event => setAccessoryParentUnitId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Unidade principal</option>{structure.units.map(unit => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</select>
                                                <select value={accessoryUnitId} onChange={event => setAccessoryUnitId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Unidade acessoria</option>{(accessoryCandidateUnits.length > 0 ? accessoryCandidateUnits : structure.units).map(unit => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</select>
                                                <select value={accessoryLinkType} onChange={event => setAccessoryLinkType(event.target.value as 'parking' | 'storage' | 'box' | 'exclusive_area' | 'other')} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="parking">Vaga</option><option value="storage">Deposito</option><option value="box">Box</option><option value="exclusive_area">Area exclusiva</option><option value="other">Outro</option></select>
                                                <input value={accessoryLegalNote} onChange={event => setAccessoryLegalNote(event.target.value)} placeholder="Nota legal" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={accessoryAffectsPrivateArea} onChange={event => setAccessoryAffectsPrivateArea(event.target.checked)} /> Afeta area privativa</label>
                                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={accessoryAffectsCoefficient} onChange={event => setAccessoryAffectsCoefficient(event.target.checked)} /> Afeta coeficiente</label>
                                                <div className="md:col-span-2"><Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || !structureIsEditable}><Plus className="w-4 h-4" /> Adicionar vinculo</Button></div>
                                            </form>
                                            <StructureAdminList title="Vinculos cadastrados" empty="Nenhum vinculo acessorio." rows={structure.accessoryLinks.map(link => {
                                                const parent = structure.units.find(unit => unit.id === link.parent_unit_id);
                                                const accessory = structure.units.find(unit => unit.id === link.accessory_unit_id);
                                                return { id: link.id, label: `${parent?.code || '-'} -> ${accessory?.code || '-'}`, detail: `${link.link_type} | area ${link.affects_private_area ? 'sim' : 'nao'} | coef ${link.affects_coefficient ? 'sim' : 'nao'}` };
                                            })} onDelete={deleteAccessoryLink} disabled={!!actionLoading || !structureIsEditable} />
                                        </div>

                                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">Alocacoes comuns nao proporcionais</h4>
                                            <form onSubmit={addCommonAllocation} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                <select value={allocationCommonSpaceId} onChange={event => setAllocationCommonSpaceId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Area comum</option>{commonNonProportionalSpaces.map(space => <option key={space.id} value={space.id}>{space.code || space.name}</option>)}</select>
                                                <select value={allocationTargetUnitId} onChange={event => setAllocationTargetUnitId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Unidade alvo</option>{structure.units.map(unit => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</select>
                                                <select value={allocationMethod} onChange={event => setAllocationMethod(event.target.value as 'fixed_area' | 'percentage')} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="fixed_area">Area fixa</option><option value="percentage">Percentual decimal</option></select>
                                                <input value={allocationValue} onChange={event => setAllocationValue(event.target.value)} placeholder={allocationMethod === 'fixed_area' ? 'Area m2' : '0,25'} className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                                                <input value={allocationJustification} onChange={event => setAllocationJustification(event.target.value)} placeholder="Justificativa" className="h-9 rounded-lg border border-slate-200 px-3 text-sm md:col-span-2" />
                                                <div className="md:col-span-2"><Button type="submit" size="sm" disabled={!selectedVersionId || !!actionLoading || !structureIsEditable || commonNonProportionalSpaces.length === 0}><Plus className="w-4 h-4" /> Adicionar alocacao</Button></div>
                                            </form>
                                            <StructureAdminList title="Alocacoes cadastradas" empty="Nenhuma alocacao comum." rows={structure.commonAllocations.map(allocation => {
                                                const space = structure.spaces.find(item => item.id === allocation.common_space_id);
                                                const unit = structure.units.find(item => item.id === allocation.target_unit_id);
                                                const value = allocation.allocation_method === 'percentage' ? formatNumber(allocation.percentage, 12) : `${formatNumber(allocation.allocated_real_area_m2_raw)} m2`;
                                                return { id: allocation.id, label: `${space?.code || space?.name || '-'} -> ${unit?.code || '-'}`, detail: `${allocation.allocation_method} | ${value}` };
                                            })} onDelete={deleteCommonAllocation} disabled={!!actionLoading || !structureIsEditable} />
                                        </div>
                                    </div>
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
                            </div>
                        </TabsContent>

                        <TabsContent value="quadro_i" className="mt-5">
                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                <ResultTable
                                    empty="Calcule a versao para gerar o Quadro I."
                                    headers={['Pavimento', 'Area real', 'Area equivalente']}
                                    rows={quadroI.map(row => [row.floor_label, `${formatNumber(row.qi_17_floor_real_total_raw)} m2`, `${formatNumber(row.qi_18_floor_equivalent_total_raw)} m2`])}
                                />
                            </div>
                        </TabsContent>
                        <TabsContent value="quadro_ii" className="mt-5">
                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                <ResultTable
                                    empty="Calcule a versao para gerar o Quadro II."
                                    headers={['Unidade', 'Coeficiente', 'Area real', 'Area equivalente']}
                                    rows={quadroII.map(row => [row.unit_label, formatNumber(row.qii_31_proportionality_coefficient_raw, 12), `${formatNumber(row.qii_37_unit_real_total_raw)} m2`, `${formatNumber(row.qii_38_unit_equivalent_total_raw)} m2`])}
                                />
                            </div>
                        </TabsContent>
                        <TabsContent value="quadro_ivb" className="mt-5">
                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                <ResultTable
                                    empty="Calcule a versao para gerar o Quadro IV-B."
                                    headers={['Unidade', 'Area real', 'Coeficiente', 'Fracao']}
                                    rows={quadroIVB.map(row => [row.unit_label, `${formatNumber(row.qivb_f_real_total_area_raw)} m2`, formatNumber(row.qivb_g_proportionality_coefficient_raw, 12), formatNumber(row.fraction_decimal_raw, 12)])}
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                </main>
            </section>
        </div>
    );
}
