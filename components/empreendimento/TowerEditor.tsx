// components/empreendimento/TowerEditor.tsx
//
// Torres & Unidades do Empreendimento. Usa o primitivo compartilhado <TorreCard> — a mesma
// casca visual da Viabilidade e (futuramente) do Planta IA. O miolo aqui é FloorEditor +
// UnitEditor (unidade individual real); nos outros módulos o miolo difere, a casca não.
//
// Estrutura (desde 14/10/2026 — "confuso com campos sem uma ordem, sem separação clara"):
//   Terreno   — título §30 + 5 campos rotulados + "Salvar terreno"
//   Torres    — título §30 + "Nova torre" (painel lateral) + cards
//     └ card  — Pavimentos (FloorEditor) · Unidades (UnitEditor)
// Plano e decisões: docs/planos/2026-10-14-torres-unidades-reorganizacao.md.
import React from 'react';
import { Plus, Loader2, Building, HardHat, Check, X, BarChart2, MapPin } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import { terrenoDaPlantaVinculada, type TerrenoDaPlanta } from '../../services/blueprintTerrenoDaPlanta';
import { compararComFicha, type SituacaoDoCampo } from '../../utils/blueprintTerrenoDaFicha';
import { pontoCardeal, ROTULO_DO_PONTO_CARDEAL } from '../../utils/blueprintGrafoEspacial';
import ActionIconButton from '../ui/ActionIconButton';
import Button from '../ui/Button';
import SecaoTitulo from '../ui/SecaoTitulo';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useStore } from '../../store/useStore';
import {
  Empreendimento, EmpreendimentoTower, EmpreendimentoTowerInsert, EmpreendimentoUnit, EmpreendimentoFloor,
} from '../../types';
import UnitEditor from './UnitEditor';
import FloorEditor, { fmtElevacao, lerElevacao, lerPeDireito } from './FloorEditor';
import { TorreCard, TorreEmpty, TorreTotais, TorreTotalMetric } from '../torres/TorreCard';
import { isObra } from '../../utils/projectClassification';

interface Props {
  empreendimentoId: string;
  organizationId: string;
  /**
   * Dados atuais do empreendimento. Sem ele a seção Terreno NÃO aparece: as telas de
   * estudo (Viabilidade, Planta IA) montam este editor sem o empreendimento, e antes a
   * seção aparecia em branco lá, como se o terreno não estivesse cadastrado.
   */
  empreendimento?: Empreendimento;
  /** Chamado depois de salvar o Terreno, para o pai recarregar o empreendimento (Visão Geral usa os mesmos campos). */
  onTerrenoSaved?: () => void;
  /**
   * Motivo do modo só leitura. Usado pela Viabilidade (EstudoTorresUnidades): sem
   * canEditImovib as torres aparecem e expandem, mas não editam (decisão de
   * 2026-10-12). Ausente: editável, como no módulo Empreendimentos.
   */
  somenteLeitura?: string;
}

const TERRENO_TIPO_OPTIONS = ['Regular (Retangular)', 'Irregular (Geometria complexa)'];

const terrenoDe = (e?: Empreendimento) => ({
  terreno_tipo: e?.terreno_tipo ?? '',
  terreno_area: e?.terreno_area?.toString() ?? '',
  terreno_frente: e?.terreno_frente?.toString() ?? '',
  terreno_fundos: e?.terreno_fundos?.toString() ?? '',
  terreno_profundidade: e?.terreno_profundidade?.toString() ?? '',
  // 26/10/2026: a orientação e as coordenadas, para a Planta criar o lote virado e georreferenciado.
  terreno_frente_azimute: e?.terreno_frente_azimute?.toString() ?? '',
  terreno_latitude: e?.terreno_latitude?.toString() ?? '',
  terreno_longitude: e?.terreno_longitude?.toString() ?? '',
});

/** Faixa de cada campo de orientação/coordenada; fora dela o terreno não salva (e diz por quê). */
const FAIXA_DA_LOCALIZACAO = {
  terreno_frente_azimute: { min: 0, max: 360, rotulo: 'Frente voltada para (°)' },
  terreno_latitude: { min: -90, max: 90, rotulo: 'Latitude' },
  terreno_longitude: { min: -180, max: 180, rotulo: 'Longitude' },
} as const;
type CampoDaLocalizacao = keyof typeof FAIXA_DA_LOCALIZACAO;

/** O que está errado na orientação/coordenadas digitadas; `null` = pode salvar. */
export function problemaDaLocalizacao(f: Record<CampoDaLocalizacao, string>): string | null {
  for (const k of Object.keys(FAIXA_DA_LOCALIZACAO) as CampoDaLocalizacao[]) {
    const t = f[k].trim();
    if (t === '') continue;
    const v = Number(t.replace(',', '.'));
    const { min, max, rotulo } = FAIXA_DA_LOCALIZACAO[k];
    if (!Number.isFinite(v) || v < min || v > max) return `${rotulo}: informe um número entre ${min} e ${max}.`;
  }
  if ((f.terreno_latitude.trim() === '') !== (f.terreno_longitude.trim() === '')) return 'Informe latitude e longitude juntas (uma sem a outra não localiza o terreno).';
  return null;
}
type TerrenoForm = ReturnType<typeof terrenoDe>;
// Inclui o tipo desde 22/10/2026: a Planta deduz Regular/Irregular do desenho.
type CampoDoTerreno = keyof TerrenoForm;

/** Cor da linha "Planta: …" sob cada campo (§8: texto colorido, sem pílula). */
const COR_DA_SITUACAO: Record<SituacaoDoCampo, string> = {
  IGUAL: 'text-gray-500',
  DIFERENTE: 'text-amber-700',
  SO_PLANTA: 'text-blue-700',
  SO_FICHA: 'text-gray-500',
  NENHUM: 'text-gray-500',
};
const metros = (v: number | string) => (typeof v === 'string' ? v : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// Pé-direito padrão (27/10/2026): metros, opcional — vale para os pavimentos sem pé-direito próprio e para a torre
// sem cadastro de pavimentos (a massa da Planta lê os dois).
// Elevação do térreo (27/10/2026): a referência das elevações dos pavimentos (+0,00 ou a cota altimétrica); vazio = 0.
const emptyTorreForm = () => ({ name: '', floors_count: '', units_per_floor: '', pe_direito_padrao_m: '', elevacao_terreo_m: '' });
const MSG_PE_DIREITO_TORRE = 'Pé-direito padrão entre 2,00 e 15,00 m (ou vazio).';
const MSG_ELEVACAO_TORRE = 'Elevação do térreo em metros, ex.: +0,00 ou 745,30 (ou vazio, para 0).';

export const TowerEditor: React.FC<Props> = ({ empreendimentoId, organizationId, empreendimento, onTerrenoSaved, somenteLeitura }) => {
  const travado = !!somenteLeitura;
  const { projects } = useStore();
  const confirm = useConfirm();
  const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState(emptyTorreForm());
  const [unitsByTower, setUnitsByTower] = React.useState<Record<string, EmpreendimentoUnit[]>>({});
  const [floorsByTower, setFloorsByTower] = React.useState<Record<string, EmpreendimentoFloor[]>>({});
  const { showToast } = useToast();
  const notify = (msg: string, type: 'success' | 'error' = 'success') => showToast(msg, type);

  // ── Nova torre (painel lateral) ─────────────────────────────────────────────
  const [novaTorreAberta, setNovaTorreAberta] = React.useState(false);
  const [form, setForm] = React.useState(emptyTorreForm());
  const [erroNomeTorre, setErroNomeTorre] = React.useState<string | undefined>();
  const novaTorre = useUnsavedChanges();
  const abrirNovaTorre = () => { setForm(emptyTorreForm()); setErroNomeTorre(undefined); novaTorre.markSaved(); setNovaTorreAberta(true); };
  const fecharNovaTorre = () => { setNovaTorreAberta(false); setErroNomeTorre(undefined); novaTorre.markSaved(); };
  const pedirFecharNovaTorre = async () => { if (await novaTorre.confirmDiscard()) fecharNovaTorre(); };
  const patchTorre = (patch: Partial<ReturnType<typeof emptyTorreForm>>) => {
    setForm(p => ({ ...p, ...patch }));
    if ('name' in patch) setErroNomeTorre(undefined);
    novaTorre.markDirty();
  };

  // ── Terreno ─────────────────────────────────────────────────────────────────
  // O formulário acompanha o empreendimento: depois de salvar, o pai recarrega o
  // registro e os campos se realinham (antes ficavam no valor da 1ª montagem).
  const terrenoSalvo = React.useMemo(() => terrenoDe(empreendimento), [
    empreendimento?.terreno_tipo, empreendimento?.terreno_area, empreendimento?.terreno_frente,
    empreendimento?.terreno_fundos, empreendimento?.terreno_profundidade,
    empreendimento?.terreno_frente_azimute, empreendimento?.terreno_latitude, empreendimento?.terreno_longitude,
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  const [terrenoForm, setTerrenoForm] = React.useState<TerrenoForm>(terrenoSalvo);
  React.useEffect(() => { setTerrenoForm(terrenoSalvo); }, [terrenoSalvo]);
  const terrenoDirty = (Object.keys(terrenoSalvo) as (keyof TerrenoForm)[]).some(k => terrenoForm[k] !== terrenoSalvo[k]);

  // ── Terreno × Planta vinculada (21/10/2026) ─────────────────────────────────
  // Pedido: "devem ser sincronizadas com planta inteligente > terreno > dados do lote". Decisão do
  // usuário: os dois lados mostram o número do outro e a pessoa escolhe — aqui o que está VAZIO
  // na ficha já vem preenchido no formulário com o valor da Planta (não grava: confira e salve).
  // Plano: docs/planos/2026-10-21-terreno-ficha-planta.md.
  const [daPlanta, setDaPlanta] = React.useState<TerrenoDaPlanta | null>(null);
  React.useEffect(() => {
    if (!empreendimento) { setDaPlanta(null); return; }
    let vivo = true;
    terrenoDaPlantaVinculada(empreendimento)
      .then(r => { if (vivo) setDaPlanta(r); })
      .catch(err => { if (vivo) setDaPlanta({ ok: false, motivo: `Não foi possível ler a planta vinculada: ${err instanceof Error ? err.message : String(err)}` }); });
    return () => { vivo = false; };
  }, [empreendimento?.id, empreendimento?.organization_id, empreendimento?.blueprint_study_id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Amarrada aos VALORES salvos, não à identidade do objeto: o efeito abaixo só pode repreencher
  // quando a ficha gravada (ou a planta) muda — nunca um campo que a pessoa acabou de apagar.
  const comparacao = React.useMemo(
    () => (daPlanta?.ok ? compararComFicha(daPlanta.medidas, empreendimento ?? null) : null),
    [daPlanta, empreendimento?.terreno_tipo, empreendimento?.terreno_area, empreendimento?.terreno_frente, empreendimento?.terreno_fundos, empreendimento?.terreno_profundidade], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const valorDaPlanta = (key: CampoDoTerreno) => comparacao?.find(l => l.campo === key)?.planta ?? null;
  /** Campos que entraram no formulário vindos da Planta (estavam vazios na ficha). */
  const [veioDaPlanta, setVeioDaPlanta] = React.useState<Set<CampoDoTerreno>>(new Set());
  React.useEffect(() => {
    if (!comparacao || travado) { setVeioDaPlanta(new Set()); return; }
    const vindos = new Set<CampoDoTerreno>();
    for (const l of comparacao) if (l.planta !== null && terrenoSalvo[l.campo as CampoDoTerreno] === '') vindos.add(l.campo as CampoDoTerreno);
    if (vindos.size === 0) { setVeioDaPlanta(vindos); return; }
    setTerrenoForm(prev => {
      const next = { ...prev };
      for (const k of vindos) if (prev[k] === '') next[k] = String(valorDaPlanta(k));
      return next;
    });
    setVeioDaPlanta(vindos);
  }, [comparacao, terrenoSalvo, travado]); // eslint-disable-line react-hooks/exhaustive-deps
  const diferentesDaPlanta = (comparacao ?? []).filter(l => l.planta !== null && terrenoForm[l.campo as CampoDoTerreno] !== String(l.planta));
  const usarValoresDaPlanta = () => {
    setTerrenoForm(prev => {
      const next = { ...prev };
      for (const l of comparacao ?? []) if (l.planta !== null) next[l.campo as CampoDoTerreno] = String(l.planta);
      return next;
    });
  };
  /** A linha sob o campo: "Planta: …" (âmbar se difere) ou, se veio dela, "Da Planta — confira e salve". */
  const dicaDaPlanta = (key: CampoDoTerreno) => {
    const linha = comparacao?.find(l => l.campo === key) ?? null;
    if (!linha || linha.planta === null) return null;
    const unidade = key === 'terreno_tipo' ? '' : key === 'terreno_area' ? ' m²' : ' m';
    const daPlantaNoCampo = veioDaPlanta.has(key) && terrenoForm[key] === String(linha.planta);
    return (
      <p className={`text-xs ${daPlantaNoCampo ? 'text-blue-700' : COR_DA_SITUACAO[linha.situacao]}`} data-testid={`planta-${key}`}>
        {daPlantaNoCampo
          ? 'Da Planta — confira e salve'
          : `Planta: ${metros(linha.planta)}${unidade}${linha.situacao === 'DIFERENTE' ? ' · diferente' : ''}`}
      </p>
    );
  };
  const [savingTerreno, setSavingTerreno] = React.useState(false);

  const handleSaveTerreno = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = problemaDaLocalizacao(terrenoForm);
    if (problema) {
      notify(problema, 'error');
      return;
    }
    setSavingTerreno(true);
    // Campo apagado vira NULL (limpa a coluna). Com `undefined` o update ignorava o
    // campo e o valor antigo voltava depois de salvar. Os tipos do registro não
    // declaram `null`, mas as colunas são opcionais no banco.
    const n = (s: string) => (s.trim() === '' ? null : Number(s)) as number | undefined;
    try {
      await empreendimentoService.update(empreendimentoId, {
        terreno_tipo: (terrenoForm.terreno_tipo || null) as string | undefined,
        terreno_area: n(terrenoForm.terreno_area),
        terreno_frente: n(terrenoForm.terreno_frente),
        terreno_fundos: n(terrenoForm.terreno_fundos),
        terreno_profundidade: n(terrenoForm.terreno_profundidade),
        terreno_frente_azimute: n(terrenoForm.terreno_frente_azimute.replace(',', '.')),
        terreno_latitude: n(terrenoForm.terreno_latitude.replace(',', '.')),
        terreno_longitude: n(terrenoForm.terreno_longitude.replace(',', '.')),
      });
      notify('Terreno salvo.');
      onTerrenoSaved?.();
    } catch (err: any) {
      notify(`Erro ao salvar terreno: ${err.message}`, 'error');
    } finally {
      setSavingTerreno(false);
    }
  };

  const handleUnitsChange = React.useCallback((towerId: string, units: EmpreendimentoUnit[]) => {
    setUnitsByTower(prev => ({ ...prev, [towerId]: units }));
  }, []);

  const handleFloorsChange = React.useCallback((towerId: string, floors: EmpreendimentoFloor[]) => {
    setFloorsByTower(prev => ({ ...prev, [towerId]: floors }));
  }, []);

  // organization_id (coluna nativa) tem precedência sobre settings.organizationId — ver
  // mesma nota em EmpreendimentoForm.tsx.
  const orgProjects = React.useMemo(() => projects.filter(p => {
    const s: any = p.settings || {};
    const projOrgId = p.organization_id ?? s.organizationId;
    return isObra({ settings: s }) && (!organizationId || projOrgId === organizationId);
  }), [projects, organizationId]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setTowers(await empreendimentoService.listTowers(empreendimentoId));
    } catch (err) {
      console.error('[TowerEditor] erro ao carregar torres:', err);
    } finally {
      setLoading(false);
    }
  }, [empreendimentoId]);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErroNomeTorre('Informe o nome da torre ou bloco.'); return; }
    const peDireito = lerPeDireito(form.pe_direito_padrao_m);
    if (peDireito === false) { notify(MSG_PE_DIREITO_TORRE, 'error'); return; }
    const elevacao = lerElevacao(form.elevacao_terreo_m);
    if (elevacao === false) { notify(MSG_ELEVACAO_TORRE, 'error'); return; }
    setSaving(true);
    try {
      const payload: EmpreendimentoTowerInsert = {
        empreendimento_id: empreendimentoId,
        name: form.name.trim(),
        floors_count: form.floors_count ? Number(form.floors_count) : undefined,
        units_per_floor: form.units_per_floor ? Number(form.units_per_floor) : undefined,
        pe_direito_padrao_m: peDireito,
        elevacao_terreo_m: elevacao,
        sort_order: towers.length,
      };
      const created = await empreendimentoService.createTower(payload);
      setTowers(prev => [...prev, created]);   // §22 — sem recarregar a lista
      // Próximo passo natural é cadastrar os pavimentos: a torre nova já abre.
      setExpandedId(created.id);
      notify(`Torre cadastrada: ${created.name}.`);
      fecharNovaTorre();
    } catch (err: any) {
      notify(`Erro ao adicionar torre: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tower: EmpreendimentoTower) => {
    setEditingId(tower.id);
    setEditForm({
      name: tower.name,
      floors_count: tower.floors_count?.toString() ?? '',
      units_per_floor: tower.units_per_floor?.toString() ?? '',
      pe_direito_padrao_m: tower.pe_direito_padrao_m != null ? Number(tower.pe_direito_padrao_m).toFixed(2).replace('.', ',') : '',
      elevacao_terreo_m: tower.elevacao_terreo_m != null ? fmtElevacao(Number(tower.elevacao_terreo_m)) : '',
    });
  };

  const handleSaveEdit = async (tower: EmpreendimentoTower) => {
    if (!editForm.name.trim()) { notify('Informe o nome da torre.', 'error'); return; }
    const peDireito = lerPeDireito(editForm.pe_direito_padrao_m);
    if (peDireito === false) { notify(MSG_PE_DIREITO_TORRE, 'error'); return; }
    const elevacao = lerElevacao(editForm.elevacao_terreo_m);
    if (elevacao === false) { notify(MSG_ELEVACAO_TORRE, 'error'); return; }
    try {
      await empreendimentoService.updateTower(tower.id, {
        name: editForm.name.trim(),
        floors_count: editForm.floors_count ? Number(editForm.floors_count) : undefined,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
        pe_direito_padrao_m: peDireito,
        elevacao_terreo_m: elevacao,
      });
      setTowers(prev => prev.map(t => t.id === tower.id ? {
        ...t,
        name: editForm.name.trim(),
        floors_count: editForm.floors_count ? Number(editForm.floors_count) : undefined,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
        pe_direito_padrao_m: peDireito,
        elevacao_terreo_m: elevacao,
      } : t));
      setEditingId(null);
    } catch (err: any) {
      notify(`Erro ao salvar torre: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (tower: EmpreendimentoTower) => {
    const ok = await confirm({
      title: 'Excluir torre?',
      message: `A torre "${tower.name}" e todas as suas unidades serão excluídas. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await empreendimentoService.deleteTower(tower.id);
      setTowers(prev => prev.filter(t => t.id !== tower.id));
    } catch (err: any) {
      notify(`Erro ao excluir torre: ${err.message}`, 'error');
    }
  };

  const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
  const rotuloCls = 'text-xs font-semibold text-slate-500';
  const editInputCls = 'h-9 px-2.5 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:border-blue-500 bg-white';
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  const terrenoCampos: { key: Exclude<keyof TerrenoForm, 'terreno_tipo' | CampoDaLocalizacao>; label: string }[] = [
    { key: 'terreno_area', label: 'Área total (m²)' },
    { key: 'terreno_frente', label: 'Testada / frente (m)' },
    { key: 'terreno_fundos', label: 'Fundos (m)' },
    { key: 'terreno_profundidade', label: 'Profundidade (m)' },
  ];

  return (
    <div className="space-y-8">
      {/* Terreno — dado do empreendimento (não de uma torre), 1 por empreendimento.
          Só com o empreendimento em mãos: nas telas de estudo ele não vem e a seção
          mostraria campos vazios como se não houvesse terreno cadastrado. */}
      {empreendimento && (
        <section className="space-y-4">
          <SecaoTitulo icon={MapPin} titulo="Terreno" />
          <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 p-0 m-0">
            {/* items-start: a linha "Planta: …" sob alguns campos não pode desalinhar os campos entre si. */}
            <form onSubmit={handleSaveTerreno} className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-4 items-start">
              <div className="space-y-1.5">
                <label htmlFor="terreno-tipo" className={rotuloCls}>Tipo de terreno</label>
                <select id="terreno-tipo" className={inputCls} value={terrenoForm.terreno_tipo}
                  onChange={e => setTerrenoForm(p => ({ ...p, terreno_tipo: e.target.value }))}>
                  <option value="">—</option>
                  {TERRENO_TIPO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {dicaDaPlanta('terreno_tipo')}
              </div>
              {terrenoCampos.map(({ key, label }) => {
                return (
                  <div key={key} className="space-y-1.5">
                    <label htmlFor={`terreno-${key}`} className={rotuloCls}>{label}</label>
                    <input id={`terreno-${key}`} className={inputCls} type="number" step="0.01" min="0" value={terrenoForm[key]}
                      onChange={e => setTerrenoForm(p => ({ ...p, [key]: e.target.value }))} />
                    {dicaDaPlanta(key)}
                  </div>
                );
              })}
              {/* Orientação e coordenadas (26/10/2026): a Planta cria o lote da ficha virado para cá e georreferenciado. */}
              <div className="space-y-1.5">
                <label htmlFor="terreno-terreno_frente_azimute" className={rotuloCls}>Frente voltada para (°)</label>
                <input id="terreno-terreno_frente_azimute" className={inputCls} type="number" step="1" min="0" max="360" placeholder="0 = norte, 90 = leste"
                  value={terrenoForm.terreno_frente_azimute} onChange={e => setTerrenoForm(p => ({ ...p, terreno_frente_azimute: e.target.value }))} />
                {terrenoForm.terreno_frente_azimute.trim() !== '' && Number.isFinite(Number(terrenoForm.terreno_frente_azimute)) && (
                  <p className="text-xs text-gray-500" data-testid="terreno-ponto-cardeal">
                    Frente voltada para o {ROTULO_DO_PONTO_CARDEAL[pontoCardeal(Number(terrenoForm.terreno_frente_azimute))]}
                  </p>
                )}
              </div>
              {(['terreno_latitude', 'terreno_longitude'] as const).map(key => (
                <div key={key} className="space-y-1.5">
                  <label htmlFor={`terreno-${key}`} className={rotuloCls}>{FAIXA_DA_LOCALIZACAO[key].rotulo} (graus decimais)</label>
                  <input id={`terreno-${key}`} className={inputCls} type="number" step="any" placeholder={key === 'terreno_latitude' ? 'ex.: −19,9191 (sul é negativo)' : 'ex.: −43,9386 (oeste é negativo)'}
                    value={terrenoForm[key]} onChange={e => setTerrenoForm(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <span title={!terrenoDirty && !travado ? 'Altere algum campo do terreno para salvar.' : undefined} className="col-span-2 md:col-span-1 space-y-1.5">
                {/* Ocupa a altura do rótulo dos campos, para o botão ficar na linha deles. */}
                <span aria-hidden="true" className={`${rotuloCls} hidden md:block invisible`}>.</span>
                <Button type="submit" disabled={savingTerreno || !terrenoDirty} className="w-full">
                  {savingTerreno ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-[15px] h-[15px]" />}
                  Salvar terreno
                </Button>
              </span>
            </form>
          </fieldset>
          {/* A planta vinculada: de onde vêm os números "Planta: …", ou por que não há. */}
          {daPlanta && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3" data-testid="terreno-da-planta">
              <p className="text-xs text-gray-500">
                {daPlanta.ok
                  ? `Planta vinculada: ${daPlanta.plantaNome} — medidas do desenho; profundidade é a média das laterais.`
                  : daPlanta.motivo}
              </p>
              {daPlanta.ok && !travado && (
                <span title={diferentesDaPlanta.length === 0 ? 'O formulário já tem os números da Planta.' : undefined}>
                  <Button type="button" variant="secondary" size="sm" disabled={diferentesDaPlanta.length === 0} onClick={usarValoresDaPlanta}>
                    Usar valores da Planta
                  </Button>
                </span>
              )}
            </div>
          )}
        </section>
      )}

      <section className="space-y-4">
        <SecaoTitulo
          icon={Building}
          titulo="Torres"
          resumo={towers.length > 0 ? `${towers.length} ${towers.length === 1 ? 'torre' : 'torres'}` : undefined}
          acoes={
            <span title={somenteLeitura}>
              <Button onClick={abrirNovaTorre} disabled={travado}>
                <Plus className="w-[15px] h-[15px]" /> Nova torre
              </Button>
            </span>
          }
        />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : towers.length === 0 ? (
        <TorreEmpty icon={Building} text="Nenhuma torre ou bloco cadastrado. Comece por &quot;Nova torre&quot;." />
      ) : (
        <div className="space-y-2.5">
          {towers.map(tower => {
            const linkedObra = orgProjects.find(p => p.id === tower.project_id);
            const isOpen = expandedId === tower.id;
            const isEditing = editingId === tower.id;
            const towerUnits = unitsByTower[tower.id] ?? [];
            const towerPriv = towerUnits.reduce((s, u) => s + (u.private_area ?? 0), 0);
            const towerComum = towerUnits.reduce((s, u) => s + (u.common_area ?? 0), 0);

            const subtitle = (
              <>
                {tower.floors_count ? `${tower.floors_count} pav.` : 'sem pavimentos'}
                {tower.units_per_floor ? ` · ${tower.units_per_floor} un/pav` : ''}
                {tower.pe_direito_padrao_m != null ? ` · pé-direito ${Number(tower.pe_direito_padrao_m).toFixed(2).replace('.', ',')} m` : ''}
                {tower.elevacao_terreo_m != null ? ` · térreo em ${fmtElevacao(Number(tower.elevacao_terreo_m))} m` : ''}
                {towerUnits.length > 0 && (
                  <>
                    {' · '}<span className="text-gray-500">{towerUnits.length} unid.</span>
                    {towerPriv > 0 && <> · <span className="text-blue-500">{fmt(towerPriv)} m² priv.</span></>}
                    {towerComum > 0 && <> · <span className="text-violet-500">{fmt(towerComum)} m² comum</span></>}
                  </>
                )}
              </>
            );

            const editHeader = (
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <input className={editInputCls} placeholder="Nome da torre" value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                <input className={`${editInputCls} w-28`} placeholder="Nº pav." type="number" value={editForm.floors_count}
                  onChange={e => setEditForm(p => ({ ...p, floors_count: e.target.value }))} />
                <input className={`${editInputCls} w-32`} placeholder="Un./pav." type="number" value={editForm.units_per_floor}
                  onChange={e => setEditForm(p => ({ ...p, units_per_floor: e.target.value }))} />
                <input className={`${editInputCls} w-36`} placeholder="Pé-direito (m)" inputMode="decimal" aria-label="Pé-direito padrão (m)"
                  value={editForm.pe_direito_padrao_m} onChange={e => setEditForm(p => ({ ...p, pe_direito_padrao_m: e.target.value }))} />
                <input className={`${editInputCls} w-40`} placeholder="Elevação térreo (m)" inputMode="decimal" aria-label="Elevação do térreo (m)"
                  value={editForm.elevacao_terreo_m} onChange={e => setEditForm(p => ({ ...p, elevacao_terreo_m: e.target.value }))} />
                <button onClick={() => handleSaveEdit(tower)} className="h-9 w-9 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingId(null)} className="h-9 w-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );

            const actions = (
              <>
                {linkedObra ? (
                  <span className="text-xs font-semibold px-2.5 h-9 inline-flex items-center rounded-[6px] bg-emerald-50 text-emerald-600 gap-1.5">
                    <HardHat className="w-3.5 h-3.5" /> {linkedObra.name}
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2.5 h-9 inline-flex items-center text-gray-400">
                    Sem obra — vincule em Editar Empreendimento
                  </span>
                )}
                <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 p-0 m-0 inline-flex items-center gap-1">
                  <ActionIconButton kind="edit" title="Editar torre" onClick={() => startEdit(tower)} />
                  <ActionIconButton kind="delete" onClick={() => handleDelete(tower)} />
                </fieldset>
              </>
            );

            return (
              <TorreCard
                key={tower.id}
                icon={Building}
                tint="blue"
                title={tower.name}
                subtitle={subtitle}
                actions={actions}
                headerOverride={isEditing ? editHeader : undefined}
                expandable
                isOpen={isOpen}
                onToggle={() => setExpandedId(isOpen ? null : tower.id)}
              >
                {/* Cada seção no seu bloco (27/10/2026, "separar cada seção para melhorar a organização"). */}
                <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 m-0 p-4 space-y-4">
                  <section className="rounded-[10px] border border-gray-200 bg-white p-4" aria-label="Pavimentos" data-testid="secao-pavimentos">
                    <FloorEditor tower={tower} onFloorsChange={handleFloorsChange} />
                  </section>
                  <section className="rounded-[10px] border border-gray-200 bg-white p-4" aria-label="Unidades" data-testid="secao-unidades">
                    <UnitEditor tower={tower} floors={floorsByTower[tower.id]} onUnitsChange={handleUnitsChange} />
                  </section>
                </fieldset>
              </TorreCard>
            );
          })}
        </div>
      )}

      {/* Totais gerais — só quando há pelo menos 1 torre com unidades */}
      {Object.keys(unitsByTower).length > 0 && (() => {
        const allUnits = Object.values(unitsByTower).flat();
        if (allUnits.length === 0) return null;
        const totalPriv = allUnits.reduce((s, u) => s + (u.private_area ?? 0), 0);
        const totalComum = allUnits.reduce((s, u) => s + (u.common_area ?? 0), 0);
        const totalArea = totalPriv + totalComum;
        return (
          <TorreTotais>
            <div className="flex items-center gap-2 text-gray-500">
              <BarChart2 className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-black uppercase tracking-widest">Total geral</span>
            </div>
            <TorreTotalMetric label="Unidades" value={String(allUnits.length)} />
            <TorreTotalMetric label="Área privativa" value={totalPriv > 0 ? `${fmt(totalPriv)} m²` : '—'} color="text-blue-600" />
            <TorreTotalMetric label="Área comum" value={totalComum > 0 ? `${fmt(totalComum)} m²` : '—'} color="text-violet-600" />
            {totalArea > 0 && <TorreTotalMetric label="Área total" value={`${fmt(totalArea)} m²`} />}
          </TorreTotais>
        );
      })()}

      </section>

      {/* Painel: Nova torre. O conteúdo só existe aberto — o Sheet fechado mantém os
          filhos no DOM, e campos invisíveis ainda recebem Tab e leitor de tela. */}
      <Sheet open={novaTorreAberta} onClose={fecharNovaTorre} size="md" dirty={novaTorre.dirty}>
        {novaTorreAberta && <>
        <SheetHeader onClose={pedirFecharNovaTorre}>
          <SheetTitle>Nova torre</SheetTitle>
          {empreendimento && <SheetDescription>{empreendimento.name}</SheetDescription>}
        </SheetHeader>
        <form onSubmit={handleAdd} className="flex-1 flex flex-col min-h-0">
          <SheetPanel className="p-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1.5 col-span-2">
                <label htmlFor="nova-torre-nome" className={rotuloCls}>Nome *</label>
                <input id="nova-torre-nome" className={`${inputCls} ${erroNomeTorre ? 'border-red-300' : ''}`}
                  placeholder="ex: Torre A, Bloco 1" value={form.name}
                  onChange={e => patchTorre({ name: e.target.value })}
                  aria-invalid={!!erroNomeTorre} />
                {erroNomeTorre && <p className="text-xs text-red-600">{erroNomeTorre}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-pav" className={rotuloCls}>Nº de pavimentos</label>
                <input id="nova-torre-pav" className={inputCls} type="number" min="0" value={form.floors_count}
                  onChange={e => patchTorre({ floors_count: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-upf" className={rotuloCls}>Unidades por pavimento</label>
                <input id="nova-torre-upf" className={inputCls} type="number" min="0" value={form.units_per_floor}
                  onChange={e => patchTorre({ units_per_floor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-pd" className={rotuloCls}>Pé-direito padrão (m)</label>
                <input id="nova-torre-pd" className={inputCls} inputMode="decimal" placeholder="ex: 3,00" value={form.pe_direito_padrao_m}
                  onChange={e => patchTorre({ pe_direito_padrao_m: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-elev" className={rotuloCls}>Elevação do térreo (m)</label>
                <input id="nova-torre-elev" className={inputCls} inputMode="decimal" placeholder="+0,00" value={form.elevacao_terreo_m}
                  onChange={e => patchTorre({ elevacao_terreo_m: e.target.value })} />
              </div>
              <p className="col-span-2 text-xs text-gray-500">
                Depois de criar, cadastre os pavimentos e as unidades dentro do card da torre.
              </p>
            </div>
          </SheetPanel>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={pedirFecharNovaTorre}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Salvar torre
            </Button>
          </SheetFooter>
        </form>
        </>}
      </Sheet>
    </div>
  );
};

export default TowerEditor;
