// components/empreendimento/EmpreendimentoForm.tsx
import React from 'react';
import { X, Loader2, Building2, HardHat, Link2, AlertCircle } from 'lucide-react';
import CityStateSelect from '../CityStateSelect';
import { empreendimentoService } from '../../services/empreendimentoService';
import { empreendimentoTypeService, EmpreendimentoTypeRecord } from '../../services/empreendimentoTypeService';
import { imovibService } from '../../services/imovibService';
import { organizationService } from '../../services/organizationService';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store/useStore';
import { useConfirm } from '../ui/confirm';
import {
  Empreendimento, EmpreendimentoStatus, EmpreendimentoTipo, EmpreendimentoInsert, EmpreendimentoTower, ImovibStudy, Organization,
} from '../../types';
import { PlantStudy } from '../../types/plantaAi';

interface Props {
  /** Vazio quando o usuário está com "Todas as organizações" — o modal pede a org num seletor. */
  organizationId: string;
  editing?: Empreendimento | null;
  onClose: () => void;
  onSaved: (e: Empreendimento) => void;
}

const STATUS_OPTIONS: { value: EmpreendimentoStatus; label: string }[] = [
  { value: 'PLANEJAMENTO', label: 'Planejamento' },
  { value: 'LANCAMENTO', label: 'Lançamento' },
  { value: 'EM_OBRAS', label: 'Em Obras' },
  { value: 'ENTREGUE', label: 'Entregue' },
  { value: 'ENCERRADO', label: 'Encerrado' },
];

// Fallback só usado se o catálogo (Configurações do Sistema → Tipos de Empreendimento)
// ainda não carregou ou está vazio — mesmo padrão de ProjectModal.tsx com obraTypeService.
const FALLBACK_TIPO_OPTIONS: { value: EmpreendimentoTipo; label: string }[] = [
  { value: 'VERTICAL', label: 'Vertical' },
  { value: 'HORIZONTAL', label: 'Horizontal' },
  { value: 'MISTO', label: 'Misto' },
  { value: 'COND_LOGISTICO', label: 'Condomínio Logístico' },
  { value: 'COND_INDUSTRIAL', label: 'Condomínio Industrial' },
];

export const EmpreendimentoForm: React.FC<Props> = ({ organizationId, editing, onClose, onSaved }) => {
  // `projects` do store já vem só com obras reais (sem projeto de sistema, sem
  // orçamento/planejamento/diário) — ver CLAUDE.md regras #2 e #3.
  const { projects } = useStore();
  const confirm = useConfirm();
  const [saving, setSaving] = React.useState(false);
  const [studies, setStudies] = React.useState<ImovibStudy[]>([]);
  const [plantStudies, setPlantStudies] = React.useState<PlantStudy[]>([]);
  const [empreendimentoTypes, setEmpreendimentoTypes] = React.useState<EmpreendimentoTypeRecord[]>([]);
  // Torres do empreendimento — só existem depois de criado. O vínculo de obra por torre
  // (multi-torre) mora aqui no modal, junto do vínculo de obra principal (project_id).
  const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
  const [towerLinkBusyId, setTowerLinkBusyId] = React.useState<string | null>(null);
  // Org efetiva do registro. Vem da prop quando há uma org ativa específica;
  // com "Todas as organizações" a prop chega vazia e o usuário escolhe aqui. Ao editar, o
  // campo continua visível (e editável) — antes só aparecia ao criar sem org de contexto,
  // então não tinha como ver nem corrigir a organização de um empreendimento já existente.
  const [orgId, setOrgId] = React.useState<string>(editing?.organization_id || organizationId || '');
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };
  const [form, setForm] = React.useState({
    name: editing?.name ?? '',
    code: editing?.code ?? '',
    status: (editing?.status ?? 'PLANEJAMENTO') as EmpreendimentoStatus,
    tipo: (editing?.tipo ?? '') as EmpreendimentoTipo | '',
    imovib_study_id: editing?.imovib_study_id ?? '',
    planta_ai_study_id: editing?.planta_ai_study_id ?? '',
    project_id: editing?.project_id ?? '',
    matricula: editing?.matricula ?? '',
    construtora: editing?.construtora ?? '',
    responsavel_tecnico: editing?.responsavel_tecnico ?? '',
    crea_cau: editing?.crea_cau ?? '',
    numero_processo: editing?.numero_processo ?? '',
    endereco_street: editing?.endereco_street ?? '',
    endereco_number: editing?.endereco_number ?? '',
    endereco_neighborhood: editing?.endereco_neighborhood ?? '',
    endereco_city: editing?.endereco_city ?? '',
    endereco_state: editing?.endereco_state ?? '',
    endereco_zip_code: editing?.endereco_zip_code ?? '',
    spe_razao_social: editing?.spe_razao_social ?? '',
    spe_cnpj: editing?.spe_cnpj ?? '',
    spe_nome_fantasia: editing?.spe_nome_fantasia ?? '',
    developer_name: editing?.developer_name ?? '',
    manager: editing?.manager ?? '',
    launch_date: editing?.launch_date ?? '',
    expected_delivery_date: editing?.expected_delivery_date ?? '',
    terreno_area: editing?.terreno_area?.toString() ?? '',
    vgv_total: editing?.vgv_total?.toString() ?? '',
  });

  React.useEffect(() => {
    organizationService.listOrganizations().then(setOrganizations).catch(() => setOrganizations([]));
  }, []);

  // Trocar a organização de um empreendimento JÁ EXISTENTE não desfaz vínculos (obra,
  // estudos, torres continuam com o mesmo id salvo) — só pode fazer esses registros
  // pararem de aparecer nos seletores, se pertencerem à organização anterior. Por isso
  // avisa antes. Ao criar do zero, nada foi salvo ainda: pode trocar livremente.
  const handleOrgChange = async (newOrgId: string) => {
    if (editing && newOrgId !== orgId) {
      const ok = await confirm({
        title: 'Trocar a organização do empreendimento?',
        message: 'Obra vinculada, estudos de Viabilidade/Arquitetura e torres continuam apontando para os mesmos registros. Se algum deles pertencer à organização atual (não à nova), ele deixa de aparecer nos seletores até você revincular ou corrigir a organização dele também.',
        confirmLabel: 'Trocar mesmo assim',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setOrgId(newOrgId);
    if (!editing) {
      // Criando do zero: nada foi salvo ainda, então invalida seleções tentativas da org anterior.
      setForm(prev => ({ ...prev, imovib_study_id: '', planta_ai_study_id: '', project_id: '' }));
    }
  };

  React.useEffect(() => {
    // Os vínculos (Imovib / Planta IA) são por organização: sem org escolhida não há o que listar.
    if (!orgId) { setStudies([]); setPlantStudies([]); return; }
    imovibService.getStudies(orgId).then(setStudies).catch(() => setStudies([]));
    // Estudos de arquitetura (Planta IA) — vínculo direto, independente do Imovib.
    supabase
      .from('plant_studies')
      .select('id, organization_id, name, status, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('name')
      .then(({ data }) => setPlantStudies((data || []) as PlantStudy[]));
  }, [orgId]);

  React.useEffect(() => {
    if (!editing) { setTowers([]); return; }
    empreendimentoService.listTowers(editing.id).then(setTowers).catch(() => setTowers([]));
  }, [editing]);

  React.useEffect(() => {
    empreendimentoTypeService.list(orgId || undefined).then(setEmpreendimentoTypes).catch(() => setEmpreendimentoTypes([]));
  }, [orgId]);

  // Obras da org escolhida. Sem org (ainda escolhendo), não há o que oferecer.
  // organization_id (coluna nativa) tem precedência sobre settings.organizationId: obra
  // vinculada a uma empresa/grupo só carrega a org ali (sincronizada por trigger a partir
  // de empresa_id) — settings.organizationId nunca é preenchido nesse caso, e o filtro
  // ficava cego para essas obras (reportado em Empreendimento > Obra Vinculada).
  const orgProjects = React.useMemo(
    () => projects.filter(p => !orgId || (p.organization_id ?? (p.settings as any)?.organizationId) === orgId),
    [projects, orgId],
  );

  // A coluna não tem FK (deadlock de DDL no módulo — ver a migration): a obra vinculada pode
  // ter sido excluída, ou ser de outra org. Nesse caso o id não some do formulário sem aviso.
  const orphanProjectId = form.project_id && !orgProjects.some(p => p.id === form.project_id)
    ? form.project_id
    : '';

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleLinkTowerObra = async (tower: EmpreendimentoTower, projectId: string) => {
    if (!projectId) return;
    if (towers.some(t => t.id !== tower.id && t.project_id === projectId)) {
      const ok = await confirm({
        title: 'Obra já vinculada',
        message: 'Esta obra já está vinculada a outra torre. Deseja vincular mesmo assim?',
        confirmLabel: 'Vincular',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setTowerLinkBusyId(tower.id);
    try {
      await empreendimentoService.linkTowerToObra(tower.id, projectId);
      setTowers(prev => prev.map(t => t.id === tower.id ? { ...t, project_id: projectId } : t));
    } catch (err: any) {
      notify(`Erro ao vincular obra: ${err.message}`, 'error');
    } finally {
      setTowerLinkBusyId(null);
    }
  };

  const handleCreateTowerObra = async (tower: EmpreendimentoTower) => {
    if (!orgId) { notify('Selecione uma organização específica para criar a obra.', 'error'); return; }
    const ok = await confirm({
      title: 'Criar obra?',
      message: `Uma nova obra será criada e vinculada à torre "${tower.name}".`,
      confirmLabel: 'Criar',
      variant: 'default',
    });
    if (!ok) return;
    setTowerLinkBusyId(tower.id);
    try {
      const projectId = await empreendimentoService.createObraForTower(tower.id, orgId, tower.name);
      setTowers(prev => prev.map(t => t.id === tower.id ? { ...t, project_id: projectId } : t));
    } catch (err: any) {
      notify(`Erro ao criar obra: ${err.message}`, 'error');
    } finally {
      setTowerLinkBusyId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { notify('Informe o nome do empreendimento.', 'error'); return; }
    if (!orgId) { notify('Selecione a organização do empreendimento.', 'error'); return; }
    setSaving(true);
    try {
      const payload: Partial<EmpreendimentoInsert> = {
        organization_id: orgId,
        name: form.name.trim(),
        code: form.code || undefined,
        status: form.status,
        tipo: form.tipo || null,
        imovib_study_id: form.imovib_study_id || null,
        planta_ai_study_id: form.planta_ai_study_id || null,
        project_id: form.project_id || null,
        matricula: form.matricula || undefined,
        construtora: form.construtora || undefined,
        responsavel_tecnico: form.responsavel_tecnico || undefined,
        crea_cau: form.crea_cau || undefined,
        numero_processo: form.numero_processo || undefined,
        endereco_street: form.endereco_street || undefined,
        endereco_number: form.endereco_number || undefined,
        endereco_neighborhood: form.endereco_neighborhood || undefined,
        endereco_city: form.endereco_city || undefined,
        endereco_state: form.endereco_state || undefined,
        endereco_zip_code: form.endereco_zip_code || undefined,
        spe_razao_social: form.spe_razao_social || undefined,
        spe_cnpj: form.spe_cnpj || undefined,
        spe_nome_fantasia: form.spe_nome_fantasia || undefined,
        developer_name: form.developer_name || undefined,
        manager: form.manager || undefined,
        launch_date: form.launch_date || undefined,
        expected_delivery_date: form.expected_delivery_date || undefined,
        terreno_area: form.terreno_area ? Number(form.terreno_area) : undefined,
        vgv_total: form.vgv_total ? Number(form.vgv_total) : undefined,
      };

      const saved = editing
        ? await empreendimentoService.update(editing.id, payload)
        : await empreendimentoService.create(payload as EmpreendimentoInsert);
      onSaved(saved);
    } catch (err: any) {
      notify(`Erro ao salvar empreendimento: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all';
  const labelCls = 'text-xs font-semibold text-slate-500 mb-1 block';
  const sectionCls = 'text-xs font-semibold text-gray-500 mb-3';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[10px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-[10px]">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            {editing ? 'Editar Empreendimento' : 'Novo Empreendimento'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-[6px] hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Identificação */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Organização *</label>
              <select
                className={inputCls}
                value={orgId}
                onChange={e => handleOrgChange(e.target.value)}
              >
                <option value="">— Selecione —</option>
                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {editing && (
                <p className="text-[10px] text-gray-400 font-medium mt-1">
                  Obra, estudos e torres vinculados usam essa organização para aparecer nos seletores.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Nome *</label>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Código</label>
              <input className={inputCls} value={form.code} onChange={e => set('code', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select className={inputCls} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="">— Selecione —</option>
                {empreendimentoTypes.length > 0
                  ? empreendimentoTypes.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)
                  : FALLBACK_TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                }
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Estudo de Viabilidade (Imovib)</label>
              <select className={inputCls} value={form.imovib_study_id} onChange={e => set('imovib_study_id', e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {studies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Estudo de Arquitetura (Planta IA)</label>
              <select className={inputCls} value={form.planta_ai_study_id} onChange={e => set('planta_ai_study_id', e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {plantStudies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 font-medium mt-1">
                Vínculo direto, independente do Imovib. Habilita o sync de torres/unidades a partir do cenário selecionado.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Obra Vinculada</label>
              <select className={inputCls} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {orphanProjectId && <option value={orphanProjectId}>Obra não encontrada (vínculo antigo)</option>}
                {orgProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 font-medium mt-1">
                {towers.length > 1
                  ? 'Obra principal do empreendimento. Cada torre pode ter a sua própria obra — vincule abaixo.'
                  : 'Obra do empreendimento.'}
              </p>
            </div>
          </div>

          {/* Torres & Obras — só existe depois do empreendimento criado, e só faz sentido
              mostrar por torre quando há mais de uma (torre única já usa "Obra Vinculada" acima). */}
          {editing && towers.length > 1 && (
            <div>
              <h3 className={sectionCls}>Obra por Torre</h3>
              <div className="space-y-2">
                {towers.map(tower => {
                  const linkedObra = orgProjects.find(p => p.id === tower.project_id);
                  const busy = towerLinkBusyId === tower.id;
                  return (
                    <div key={tower.id} className="flex items-center gap-2.5 flex-wrap px-3 py-2 border border-gray-100 rounded-[10px]">
                      <span className="text-sm font-semibold text-gray-700 min-w-[8rem]">{tower.name}</span>
                      {linkedObra ? (
                        <span className="text-xs font-semibold px-2.5 h-9 inline-flex items-center rounded-[6px] bg-emerald-50 text-emerald-600 gap-1.5">
                          <HardHat className="w-3.5 h-3.5" /> {linkedObra.name}
                        </span>
                      ) : (
                        <>
                          <select
                            defaultValue=""
                            disabled={busy}
                            onChange={e => handleLinkTowerObra(tower, e.target.value)}
                            className="h-9 px-2.5 border border-gray-200 rounded-[6px] text-sm font-normal text-gray-600 bg-white outline-none"
                          >
                            <option value="">Vincular obra…</option>
                            {orgProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleCreateTowerObra(tower)}
                            className="h-9 px-2.5 rounded-[6px] bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Criar obra
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dados Gerais / Regularização */}
          <div>
            <h3 className={sectionCls}>Dados Gerais</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Matrícula</label>
                <input className={inputCls} value={form.matricula} onChange={e => set('matricula', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Nº do Processo</label>
                <input className={inputCls} value={form.numero_processo} onChange={e => set('numero_processo', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Construtora</label>
                <input className={inputCls} value={form.construtora} onChange={e => set('construtora', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Responsável Técnico</label>
                <input className={inputCls} value={form.responsavel_tecnico} onChange={e => set('responsavel_tecnico', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>CREA/CAU</label>
                <input className={inputCls} value={form.crea_cau} onChange={e => set('crea_cau', e.target.value)} />
              </div>
            </div>
          </div>

          {/* SPE */}
          <div>
            <h3 className={sectionCls}>SPE</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Razão Social</label>
                <input className={inputCls} value={form.spe_razao_social} onChange={e => set('spe_razao_social', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>CNPJ</label>
                <input className={inputCls} value={form.spe_cnpj} onChange={e => set('spe_cnpj', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Nome Fantasia</label>
                <input className={inputCls} value={form.spe_nome_fantasia} onChange={e => set('spe_nome_fantasia', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Incorporadora</label>
                  <input className={inputCls} value={form.developer_name} onChange={e => set('developer_name', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Gestor</label>
                  <input className={inputCls} value={form.manager} onChange={e => set('manager', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Endereço de divulgação / oficial */}
          <div>
            <h3 className={sectionCls}>Endereço do Empreendimento</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Logradouro</label>
                <input className={inputCls} value={form.endereco_street} onChange={e => set('endereco_street', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Número</label>
                <input className={inputCls} value={form.endereco_number} onChange={e => set('endereco_number', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Bairro</label>
                <input className={inputCls} value={form.endereco_neighborhood} onChange={e => set('endereco_neighborhood', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <CityStateSelect
                  cep={form.endereco_zip_code || undefined}
                  stateCode={form.endereco_state || undefined}
                  cityName={form.endereco_city || undefined}
                  onChange={({ cep, stateCode, cityName }) => setForm(prev => ({
                    ...prev,
                    endereco_zip_code: cep ?? '',
                    endereco_state: stateCode ?? '',
                    endereco_city: cityName ?? '',
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Terreno — só a área (endereço do terreno foi removido por duplicar o
              bloco "Endereço do Empreendimento" acima; os campos terreno_* de
              endereço continuam existindo no banco para não perder dado histórico,
              só não são mais editados aqui). */}
          <div>
            <h3 className={sectionCls}>Terreno</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Área do Terreno (m²)</label>
                <input type="number" step="0.01" className={inputCls} value={form.terreno_area} onChange={e => set('terreno_area', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Comercial / datas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>VGV Total (R$)</label>
              <input type="number" step="0.01" className={inputCls} value={form.vgv_total} onChange={e => set('vgv_total', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Lançamento</label>
              <input type="date" className={inputCls} value={form.launch_date} onChange={e => set('launch_date', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Previsão de Entrega</label>
              <input type="date" className={inputCls} value={form.expected_delivery_date} onChange={e => set('expected_delivery_date', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>

      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default EmpreendimentoForm;
