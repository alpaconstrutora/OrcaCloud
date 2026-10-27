// components/empreendimento/UnitFormFields.tsx
//
// Os 13 campos de uma unidade do empreendimento (+ "Torre", opcional), rotulados
// e na malha do §30 do guia. Fonte ÚNICA para os dois lugares que cadastram
// unidade num painel:
//   • Torres & Unidades › torre › "Nova unidade"  (UnitEditor — a torre é a do card)
//   • Características Adicionais › "Nova Unidade"/editar (escolhe a torre)
//
// Antes eram duas cópias: a de Torres & Unidades era uma grade de 13 inputs SEM
// rótulo (só placeholder, que some ao digitar) e foi o que o usuário apontou em
// 14/10/2026 como "campos sem uma ordem". A de Características já tinha rótulo.
// Junto com o formulário, a conversão form ⇄ registro também mora aqui — as duas
// cópias divergiam (uma mandava `undefined` nos enums vazios, a outra `null`).
//
// Pavimento da lista (27/10/2026, "ao clicar na gaveta nova unidade, o campo Pavimento deve listar os pavimentos
// criados na seção Pavimentos"): com `pavimentos` (o cadastro da torre, expandido em andares), o campo vira uma lista;
// escolher grava o andar, o tipo e o vínculo (`floor_id`). Sem cadastro, continua o número digitado.

import React from 'react';
import {
  EmpreendimentoTower, EmpreendimentoUnit, EmpreendimentoUnitInsert, FloorTipo,
  UnitPositionType, UnitSunOrientation, UnitViewType,
} from '../../types';
import { POSITION_LABEL, VIEW_LABEL, SUN_LABEL } from '../../utils/empreendimentoComercial';
import type { AndarDoCadastro } from '../../utils/blueprintEstruturaDaTorre';

/** Rótulo do tipo de pavimento. Antes duplicado em UnitEditor e CaracteristicasAdicionaisTab. */
export const FLOOR_TIPO_LABEL: Record<FloorTipo, string> = {
  SUBSOLO: 'Subsolo', TERREO: 'Térreo', MEZANINO: 'Mezanino', TIPO: 'Tipo',
  COBERTURA: 'Cobertura', TECNICO: 'Técnico', GARAGEM: 'Garagem', OUTRO: 'Outro',
};

/** Estado do formulário: tudo string (o que o <input> devolve), enum vazio = ''. */
export interface UnitFormValues {
  name: string;
  floor: string;
  floor_tipo: FloorTipo | '';
  /** O pavimento cadastrado de onde veio o andar ('' = sem vínculo). */
  floor_id: string;
  typology: string;
  private_area: string;
  common_area: string;
  bedrooms: string;
  bathrooms: string;
  suites: string;
  parking_spaces: string;
  position_type: UnitPositionType | '';
  view_type: UnitViewType | '';
  sun_orientation: UnitSunOrientation | '';
}

export const emptyUnitFormValues = (): UnitFormValues => ({
  name: '', floor: '', floor_tipo: '', floor_id: '', typology: '', private_area: '', common_area: '',
  bedrooms: '', bathrooms: '', suites: '', parking_spaces: '',
  position_type: '', view_type: '', sun_orientation: '',
});

type UnitFormRecord = Pick<EmpreendimentoUnit,
  'name' | 'floor' | 'floor_tipo' | 'floor_id' | 'typology' | 'private_area' | 'common_area' | 'bedrooms'
  | 'bathrooms' | 'suites' | 'parking_spaces' | 'position_type' | 'view_type' | 'sun_orientation'>;

const str = (n: number | null | undefined) => (n ?? null) === null ? '' : String(n);

/** Registro → formulário (para editar). */
export const unitFormFromRecord = (u: UnitFormRecord): UnitFormValues => ({
  name: u.name ?? '',
  floor: str(u.floor),
  floor_tipo: u.floor_tipo ?? '',
  floor_id: u.floor_id ?? '',
  typology: u.typology ?? '',
  private_area: str(u.private_area),
  common_area: str(u.common_area),
  bedrooms: str(u.bedrooms),
  bathrooms: str(u.bathrooms),
  suites: str(u.suites),
  parking_spaces: str(u.parking_spaces),
  position_type: u.position_type ?? '',
  view_type: u.view_type ?? '',
  sun_orientation: u.sun_orientation ?? '',
});

export type UnitFormPayload = Pick<EmpreendimentoUnitInsert,
  'name' | 'floor' | 'floor_tipo' | 'floor_id' | 'typology' | 'private_area' | 'common_area' | 'total_area'
  | 'bedrooms' | 'bathrooms' | 'suites' | 'parking_spaces' | 'position_type' | 'view_type' | 'sun_orientation'>;

const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));

/**
 * Formulário → payload de `createUnit`/`updateUnit`.
 * Número vazio vira `undefined` (a coluna fica como está); enum vazio vira `null`
 * (limpa a coluna no update — `undefined` não limparia). `total_area` = privativa + comum.
 */
export function unitFormToPayload(v: UnitFormValues): UnitFormPayload {
  const priv = num(v.private_area);
  const common = num(v.common_area);
  return {
    name: v.name.trim(),
    floor: num(v.floor),
    floor_tipo: v.floor_tipo || null,
    floor_id: v.floor_id || null,
    typology: v.typology.trim() || undefined,
    private_area: priv,
    common_area: common,
    total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
    bedrooms: num(v.bedrooms),
    bathrooms: num(v.bathrooms),
    suites: num(v.suites),
    parking_spaces: num(v.parking_spaces),
    position_type: v.position_type || null,
    view_type: v.view_type || null,
    sun_orientation: v.sun_orientation || null,
  };
}

// ── Componente ───────────────────────────────────────────────────────────────

const campoCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const rotuloCls = 'text-xs font-semibold text-slate-500';

const Campo: React.FC<{ rotulo: string; htmlFor: string; className?: string; children: React.ReactNode }> = ({ rotulo, htmlFor, className = '', children }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label htmlFor={htmlFor} className={rotuloCls}>{rotulo}</label>
    {children}
  </div>
);

interface UnitFormFieldsProps {
  value: UnitFormValues;
  /** Patch parcial — quem usa faz `setForm(p => ({ ...p, ...patch }))` (e marca dirty). */
  onChange: (patch: Partial<UnitFormValues>) => void;
  /** Informado → mostra o campo "Torre *" antes de "Unidade". Só Características usa. */
  towers?: EmpreendimentoTower[];
  towerId?: string;
  onTowerChange?: (id: string) => void;
  /** Erro de validação mostrado sob "Unidade" (UI_PATTERNS §6.4 — inline, não toast). */
  erroNome?: string;
  /** Prefixo dos ids dos campos, para dois formulários na mesma página não colidirem. */
  idPrefix?: string;
  /** Os andares do cadastro de pavimentos da torre: com algum, "Pavimento" vira uma lista deles. */
  pavimentos?: AndarDoCadastro[];
}

export const UnitFormFields: React.FC<UnitFormFieldsProps> = ({
  value, onChange, towers, towerId, onTowerChange, erroNome, idPrefix = 'unidade', pavimentos = [],
}) => {
  const id = (k: string) => `${idPrefix}-${k}`;
  const numero = (k: keyof UnitFormValues, rotulo: string, step?: string) => (
    <Campo rotulo={rotulo} htmlFor={id(k)}>
      <input id={id(k)} type="number" step={step} min="0" className={campoCls}
        value={value[k]} onChange={e => onChange({ [k]: e.target.value })} />
    </Campo>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
      {towers && (
        <Campo rotulo="Torre *" htmlFor={id('torre')} className="col-span-full">
          <select id={id('torre')} className={campoCls} value={towerId ?? ''} onChange={e => onTowerChange?.(e.target.value)}>
            <option value="">Selecione a torre…</option>
            {towers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Campo>
      )}

      <Campo rotulo="Unidade (ex: 101) *" htmlFor={id('name')} className="col-span-full">
        <input id={id('name')} className={`${campoCls} ${erroNome ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
          value={value.name} onChange={e => onChange({ name: e.target.value })}
          aria-invalid={!!erroNome} aria-describedby={erroNome ? id('name-erro') : undefined} />
        {erroNome && <p id={id('name-erro')} className="text-xs text-red-600">{erroNome}</p>}
      </Campo>

      {pavimentos.length > 0 ? (
        <Campo rotulo="Pavimento" htmlFor={id('floor')}>
          <select id={id('floor')} className={campoCls} value={value.floor}
            onChange={e => {
              const andar = pavimentos.find(a => String(a.numero) === e.target.value);
              // O tipo e o vínculo vêm do cadastro: escolher o pavimento já diz os dois.
              onChange(andar ? { floor: String(andar.numero), floor_tipo: andar.tipo, floor_id: andar.floorId } : { floor: '', floor_id: '' });
            }}>
            <option value="">Selecione o pavimento…</option>
            {/* O andar que a unidade já tem e não está no cadastro continua visível (editar não o apaga). */}
            {value.floor !== '' && !pavimentos.some(a => String(a.numero) === value.floor) && (
              <option value={value.floor}>Andar {value.floor} (fora do cadastro)</option>
            )}
            {pavimentos.map(a => <option key={a.numero} value={String(a.numero)}>{a.nome} — andar {a.numero}</option>)}
          </select>
        </Campo>
      ) : (
        <Campo rotulo="Pavimento" htmlFor={id('floor')}>
          <input id={id('floor')} type="number" className={campoCls} value={value.floor}
            // Digitado à mão, o andar deixa de ser o do pavimento cadastrado que estava ligado.
            onChange={e => onChange({ floor: e.target.value, floor_id: '' })} />
        </Campo>
      )}
      <Campo rotulo="Tipo de pavimento" htmlFor={id('floor_tipo')}>
        <select id={id('floor_tipo')} className={campoCls} value={value.floor_tipo}
          onChange={e => onChange({ floor_tipo: e.target.value as FloorTipo | '' })}>
          <option value="">—</option>
          {(Object.keys(FLOOR_TIPO_LABEL) as FloorTipo[]).map(t => <option key={t} value={t}>{FLOOR_TIPO_LABEL[t]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Tipologia" htmlFor={id('typology')}>
        <input id={id('typology')} className={campoCls} placeholder="ex: 2 quartos" value={value.typology}
          onChange={e => onChange({ typology: e.target.value })} />
      </Campo>

      {numero('private_area', 'Área privativa (m²)', '0.01')}
      {numero('common_area', 'Área comum (m²)', '0.01')}
      {numero('parking_spaces', 'Vagas')}

      {numero('bedrooms', 'Dormitórios')}
      {numero('bathrooms', 'Banheiros')}
      {numero('suites', 'Suítes')}

      <Campo rotulo="Posição" htmlFor={id('position_type')}>
        <select id={id('position_type')} className={campoCls} value={value.position_type}
          onChange={e => onChange({ position_type: e.target.value as UnitPositionType | '' })}>
          <option value="">—</option>
          {(Object.keys(POSITION_LABEL) as UnitPositionType[]).map(t => <option key={t} value={t}>{POSITION_LABEL[t]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Vista" htmlFor={id('view_type')}>
        <select id={id('view_type')} className={campoCls} value={value.view_type}
          onChange={e => onChange({ view_type: e.target.value as UnitViewType | '' })}>
          <option value="">—</option>
          {(Object.keys(VIEW_LABEL) as UnitViewType[]).map(t => <option key={t} value={t}>{VIEW_LABEL[t]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Orientação solar" htmlFor={id('sun_orientation')}>
        <select id={id('sun_orientation')} className={campoCls} value={value.sun_orientation}
          onChange={e => onChange({ sun_orientation: e.target.value as UnitSunOrientation | '' })}>
          <option value="">—</option>
          {(Object.keys(SUN_LABEL) as UnitSunOrientation[]).map(t => <option key={t} value={t}>{SUN_LABEL[t]}</option>)}
        </select>
      </Campo>
    </div>
  );
};

export default UnitFormFields;
