// components/empreendimento/UnidadeUnicaEditor.tsx
//
// A aba de unidades do empreendimento de UNIDADE ÚNICA (09/11/2026). Pedido: "quando o empreendimento
// for um lote a unidade é o próprio lote. torres unidades deve ser adaptada" — e Chácara e Casa
// Residencial seguem a mesma regra. Quem decide é o Tipo do empreendimento (`empreendimento_types.estrutura`).
//
//   Terreno  — a MESMA seção do TowerEditor (TerrenoSecao)
//   Lote     — LOTE: identificação, quadra e nº; área e testada SÃO as do terreno (salvar o terreno
//              leva os dois à unidade)
//   Unidade  — IMOVEL_UNICO: os campos da unidade sem pavimento/posição (UnitFormFields semPavimento)
//   Só a Unidade — UNIDADE_AUTONOMA (13/11/2026, Apartamento Residencial): o mesmo formulário do
//              IMOVEL_UNICO, SEM a seção Terreno (o terreno é do prédio, não do empreendimento).
//
// Por baixo continua uma torre (implícita) com uma unidade — Espelho de Vendas, Comercial, Condomínio
// e Portal leem unidade dentro de torre. Preço e status ficam no Espelho de Vendas/Locações, como em
// qualquer unidade. Tipo trocado depois do cadastro (mais de 1 torre ou unidade) → Torres & Unidades
// como antes, com o motivo. Plano: docs/planos/2026-11-09-empreendimento-unidade-unica.md.
import React from 'react';
import { Loader2, Check, Home, LandPlot, Info } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import Button from '../ui/Button';
import SecaoTitulo from '../ui/SecaoTitulo';
import { useToast } from '../../hooks/useToast';
import { Empreendimento, EmpreendimentoTower, EmpreendimentoUnit } from '../../types';
import TerrenoSecao, { type TerrenoGravado } from './TerrenoSecao';
import TowerEditor from './TowerEditor';
import UnitFormFields, { emptyUnitFormValues, unitFormFromRecord, unitFormToPayload, type UnitFormValues } from './UnitFormFields';
import { camposDoLote, foraDoMolde, nomeDaTorreImplicita, temTerrenoProprio, type EstruturaUnidadeUnica } from '../../utils/empreendimentoUnidadeUnica';
import { UNIT_STATUS_LABEL } from '../../utils/empreendimentoComercial';
import { formatCurrency } from '../../utils/financialMath';

interface Props {
  empreendimentoId: string;
  organizationId: string;
  empreendimento: Empreendimento;
  estrutura: EstruturaUnidadeUnica;
  /** Nome do tipo ("Lote", "Chácara", "Casa Residencial") — nome da torre implícita e tipologia padrão. */
  nomeDoTipo?: string;
  /** Depois de salvar o Terreno (ver TowerEditor). */
  onTerrenoSaved?: () => void;
  /** Abre o Espelho de Vendas, onde ficam preço e status. */
  onAbrirEspelho?: () => void;
}

/** O que o formulário do Lote edita; área e testada vêm do terreno. */
interface LoteForm { name: string; quadra: string; lote: string }

const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
const rotuloCls = 'text-xs font-semibold text-slate-500';
const blocoCls = 'rounded-[10px] border border-gray-200 bg-white p-5 space-y-4';
const m = (v: number | null | undefined, sufixo: string) =>
  v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sufixo}`;

export const UnidadeUnicaEditor: React.FC<Props> = ({
  empreendimentoId, organizationId, empreendimento, estrutura, nomeDoTipo, onTerrenoSaved, onAbrirEspelho,
}) => {
  const { showToast } = useToast();
  const notify = (msg: string, type: 'success' | 'error' = 'success') => showToast(msg, type);
  const ehLote = estrutura === 'LOTE';
  const criar = {
    nomeDaTorre: nomeDaTorreImplicita(estrutura, nomeDoTipo),
    nomeDaUnidade: empreendimento.name,
    tipologia: nomeDaTorreImplicita(estrutura, nomeDoTipo),
  };

  const [loading, setLoading] = React.useState(true);
  const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
  const [units, setUnits] = React.useState<EmpreendimentoUnit[]>([]);
  const unit = units[0] ?? null;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const ts = await empreendimentoService.listTowers(empreendimentoId);
      const us = (await Promise.all(ts.map(t => empreendimentoService.listUnits(t.id)))).flat();
      setTowers(ts);
      setUnits(us);
    } catch (err) {
      console.error('[UnidadeUnicaEditor] erro ao carregar a unidade:', err);
    } finally {
      setLoading(false);
    }
  }, [empreendimentoId]);
  React.useEffect(() => { load(); }, [load]);

  // ── Formulários. Sem unidade, já vêm preenchidos com o que o app sabe (nome e tipo). ──
  const loteSalvo = React.useMemo<LoteForm>(() => ({
    name: unit?.name ?? empreendimento.name, quadra: unit?.quadra ?? '', lote: unit?.lote ?? '',
  }), [unit, empreendimento.name]);
  const imovelSalvo = React.useMemo<UnitFormValues>(
    () => (unit ? unitFormFromRecord(unit) : { ...emptyUnitFormValues(), name: empreendimento.name, typology: criar.tipologia }),
    [unit, empreendimento.name], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // A edição guarda de qual "salvo" partiu: quando o salvo muda (unidade chegou do banco,
  // ou acabou de ser gravada), o formulário volta a ele NO MESMO render. Antes era um
  // useEffect que copiava depois — havia um render com o salvo novo e o form velho, e o
  // "Salvar unidade" piscava ligado (o CI do #298 pegou esse quadro).
  const [loteEdicao, setLoteEdicao] = React.useState<{ de: LoteForm; form: LoteForm } | null>(null);
  const [imovelEdicao, setImovelEdicao] = React.useState<{ de: UnitFormValues; form: UnitFormValues } | null>(null);
  const loteForm = loteEdicao?.de === loteSalvo ? loteEdicao.form : loteSalvo;
  const imovelForm = imovelEdicao?.de === imovelSalvo ? imovelEdicao.form : imovelSalvo;
  const setLoteForm = (f: (p: LoteForm) => LoteForm) => setLoteEdicao({ de: loteSalvo, form: f(loteForm) });
  const setImovelForm = (f: (p: UnitFormValues) => UnitFormValues) => setImovelEdicao({ de: imovelSalvo, form: f(imovelForm) });
  const [erroNome, setErroNome] = React.useState<string | undefined>();
  const [saving, setSaving] = React.useState(false);

  // Sem unidade, salvar é o que a cria — o botão vale mesmo sem mexer em nada.
  const dirty = !unit || (ehLote
    ? (Object.keys(loteSalvo) as (keyof LoteForm)[]).some(k => loteForm[k] !== loteSalvo[k])
    : (Object.keys(imovelSalvo) as (keyof UnitFormValues)[]).some(k => imovelForm[k] !== imovelSalvo[k]));

  const gravar = async (campos: Parameters<typeof empreendimentoService.salvarUnidadeUnica>[2]) => {
    const r = await empreendimentoService.salvarUnidadeUnica(empreendimentoId, criar, campos);
    setTowers([r.tower]);       // §22 — sem recarregar
    setUnits([r.unit]);
    return r.unit;
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = (ehLote ? loteForm.name : imovelForm.name).trim();
    if (!nome) { setErroNome('Informe a identificação da unidade.'); return; }
    setSaving(true);
    try {
      const salva = await gravar(ehLote
        ? { name: nome, quadra: loteForm.quadra.trim() || null, lote: loteForm.lote.trim() || null, ...camposDoLote(empreendimento) }
        // Sem pavimento: floor/floor_tipo/posição vão vazios (unitFormToPayload limpa os enums).
        : unitFormToPayload(imovelForm));
      notify(unit ? `Unidade ${salva.name} salva.` : `Unidade ${salva.name} cadastrada — já aparece no Espelho de Vendas.`);
    } catch (err: any) {
      notify(`Erro ao salvar a unidade: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  /** LOTE: a unidade é o terreno — salvar o terreno leva área e testada a ela (e a cria, se faltar). */
  const levarTerrenoAoLote = async (t: TerrenoGravado) => {
    try {
      await gravar(camposDoLote(t));
    } catch (err: any) {
      notify(`Terreno salvo, mas a unidade do lote não acompanhou: ${err.message}`, 'error');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }

  if (foraDoMolde(towers.length, units.length)) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-amber-700" data-testid="unidade-unica-fora-do-molde">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          O tipo deste empreendimento ({nomeDoTipo ?? 'unidade única'}) tem uma só unidade, mas já há {towers.length} torre(s) e {units.length} unidade(s)
          cadastradas. Elas aparecem abaixo como antes — nada foi apagado. Para a tela de unidade única, deixe uma torre com uma unidade.
        </p>
        <TowerEditor empreendimentoId={empreendimentoId} organizationId={organizationId} empreendimento={empreendimento} onTerrenoSaved={onTerrenoSaved} />
      </div>
    );
  }

  const status = unit ? (
    <p className="text-sm text-gray-700" data-testid="unidade-unica-status">
      Venda: {UNIT_STATUS_LABEL[unit.status] ?? unit.status}
      {unit.price ? ` · ${formatCurrency(unit.price)}` : ' · sem preço'}
      {' — preço e status no '}
      {onAbrirEspelho
        ? <button type="button" onClick={onAbrirEspelho} className="text-blue-600 hover:underline">Espelho de Vendas</button>
        : 'Espelho de Vendas'}.
    </p>
  ) : (
    <p className="text-sm text-gray-700" data-testid="unidade-unica-status">
      A unidade ainda não está cadastrada. Salve para ela aparecer no Espelho de Vendas{ehLote ? ' (salvar o terreno também a cadastra)' : ''}.
    </p>
  );

  return (
    <div className="space-y-6">
      {temTerrenoProprio(estrutura) && (
        <TerrenoSecao
          empreendimentoId={empreendimentoId}
          empreendimento={empreendimento}
          onTerrenoSaved={onTerrenoSaved}
          onSalvo={ehLote ? levarTerrenoAoLote : undefined}
        />
      )}

      <section className={blocoCls} aria-label={ehLote ? 'Lote' : 'Unidade'} data-testid="secao-unidade-unica">
        <SecaoTitulo icon={ehLote ? LandPlot : Home} titulo={ehLote ? 'Lote' : 'Unidade'} />
        {status}
        <form onSubmit={handleSalvar} className="space-y-4">
          {ehLote ? (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-4 items-start">
              <div className="space-y-1.5 col-span-2">
                <label htmlFor="lote-nome" className={rotuloCls}>Identificação *</label>
                <input id="lote-nome" className={`${inputCls} ${erroNome ? 'border-red-300' : ''}`} value={loteForm.name}
                  aria-invalid={!!erroNome}
                  onChange={e => { setLoteForm(p => ({ ...p, name: e.target.value })); setErroNome(undefined); }} />
                {erroNome && <p className="text-xs text-red-600">{erroNome}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lote-quadra" className={rotuloCls}>Quadra</label>
                <input id="lote-quadra" className={inputCls} placeholder="ex: A" value={loteForm.quadra}
                  onChange={e => setLoteForm(p => ({ ...p, quadra: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lote-numero" className={rotuloCls}>Nº do lote</label>
                <input id="lote-numero" className={inputCls} placeholder="ex: 12" value={loteForm.lote}
                  onChange={e => setLoteForm(p => ({ ...p, lote: e.target.value }))} />
              </div>
              {/* Área e testada SÃO as do terreno: mostradas como valor (§32), editadas no Terreno acima. */}
              <div className="space-y-1.5" title="A área do lote é a do Terreno — edite acima.">
                <span className={rotuloCls}>Área do lote</span>
                <p className="h-9 flex items-center text-sm text-gray-900" data-testid="lote-area">{m(empreendimento.terreno_area, 'm²')}</p>
              </div>
              <div className="space-y-1.5" title="A testada do lote é a frente do Terreno — edite acima.">
                <span className={rotuloCls}>Testada</span>
                <p className="h-9 flex items-center text-sm text-gray-900" data-testid="lote-testada">{m(empreendimento.terreno_frente, 'm')}</p>
              </div>
            </div>
          ) : (
            <UnitFormFields
              idPrefix="unidade-unica"
              value={imovelForm}
              onChange={patch => { setImovelForm(p => ({ ...p, ...patch })); if ('name' in patch) setErroNome(undefined); }}
              erroNome={erroNome}
              semPavimento
              rotuloDoNome="Identificação *"
            />
          )}
          <div className="flex justify-end">
            <span title={!dirty ? 'Altere algum campo da unidade para salvar.' : undefined}>
              <Button type="submit" disabled={saving || !dirty}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-[15px] h-[15px]" />}
                {unit ? 'Salvar unidade' : 'Cadastrar unidade'}
              </Button>
            </span>
          </div>
        </form>
      </section>
    </div>
  );
};

export default UnidadeUnicaEditor;
