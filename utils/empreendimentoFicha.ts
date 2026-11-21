// utils/empreendimentoFicha.ts
//
// A ficha do empreendimento como formulário: de onde ele nasce (`fichaDe`) e o que vai ao banco
// (`payloadDaFicha` / `mudancasDaFicha`). Um caminho só para os dois lugares que a editam: o
// painel lateral (Novo / Duplicar) e a aba Visão Geral (editar, desde 21/11/2026 —
// docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md).
import type { Empreendimento, EmpreendimentoInsert, EmpreendimentoObjetivo, EmpreendimentoStatus, EmpreendimentoTipo } from '../types/empreendimento';
import { objetivoDe } from './empreendimentoObjetivo';

export interface FichaDoEmpreendimento {
  name: string;
  company_id: string;
  code: string;
  status: EmpreendimentoStatus;
  tipo: EmpreendimentoTipo | '';
  objetivo: EmpreendimentoObjetivo;
  imovib_study_id: string;
  blueprint_study_id: string;
  project_id: string;
  matricula: string;
  construtora: string;
  responsavel_tecnico: string;
  crea_cau: string;
  numero_processo: string;
  endereco_street: string;
  endereco_number: string;
  endereco_neighborhood: string;
  endereco_city: string;
  endereco_state: string;
  endereco_zip_code: string;
  spe_razao_social: string;
  spe_cnpj: string;
  spe_nome_fantasia: string;
  developer_name: string;
  manager: string;
  launch_date: string;
  expected_delivery_date: string;
  terreno_area: string;
  vgv_total: string;
}

/**
 * O formulário a partir de um registro. Duplicando: o nome ganha "(cópia)", o status volta ao
 * começo do ciclo e ficam vazios os identificadores únicos do original (código, matrícula,
 * CNPJ, processo, datas) e os vínculos vivos — dois empreendimentos no mesmo estudo/obra fariam
 * o sync de um sobrescrever o outro.
 */
export function fichaDe(base: Empreendimento | null | undefined, opcoes: { duplicar?: boolean } = {}): FichaDoEmpreendimento {
  const dup = !!opcoes.duplicar;
  const s = (v: string | null | undefined) => v ?? '';
  return {
    name: dup && base ? `${base.name} (cópia)` : s(base?.name),
    company_id: s(base?.company_id),
    code: dup ? '' : s(base?.code),
    status: (dup ? 'PLANEJAMENTO' : (base?.status ?? 'PLANEJAMENTO')) as EmpreendimentoStatus,
    tipo: (base?.tipo ?? '') as EmpreendimentoTipo | '',
    objetivo: objetivoDe(base?.objetivo),
    imovib_study_id: dup ? '' : s(base?.imovib_study_id),
    blueprint_study_id: dup ? '' : s(base?.blueprint_study_id),
    project_id: dup ? '' : s(base?.project_id),
    matricula: dup ? '' : s(base?.matricula),
    construtora: s(base?.construtora),
    responsavel_tecnico: s(base?.responsavel_tecnico),
    crea_cau: s(base?.crea_cau),
    numero_processo: dup ? '' : s(base?.numero_processo),
    endereco_street: s(base?.endereco_street),
    endereco_number: s(base?.endereco_number),
    endereco_neighborhood: s(base?.endereco_neighborhood),
    endereco_city: s(base?.endereco_city),
    endereco_state: s(base?.endereco_state),
    endereco_zip_code: s(base?.endereco_zip_code),
    spe_razao_social: s(base?.spe_razao_social),
    spe_cnpj: dup ? '' : s(base?.spe_cnpj),
    spe_nome_fantasia: s(base?.spe_nome_fantasia),
    developer_name: s(base?.developer_name),
    manager: s(base?.manager),
    launch_date: dup ? '' : s(base?.launch_date),
    expected_delivery_date: dup ? '' : s(base?.expected_delivery_date),
    terreno_area: base?.terreno_area?.toString() ?? '',
    vgv_total: base?.vgv_total?.toString() ?? '',
  };
}

/**
 * O que a ficha grava. Campo vazio vira `null`: com `undefined` o update ignorava o campo e o
 * valor apagado voltava depois de salvar. Os tipos do registro não declaram `null` em todo
 * campo, mas as colunas são opcionais no banco.
 */
export function payloadDaFicha(f: FichaDoEmpreendimento, organizationId: string): Partial<EmpreendimentoInsert> {
  const t = (v: string) => (v.trim() === '' ? null : v.trim()) as string | undefined;
  const n = (v: string) => (v.trim() === '' ? null : Number(v)) as number | undefined;
  return {
    organization_id: organizationId,
    company_id: f.company_id || null,
    name: f.name.trim(),
    code: t(f.code),
    status: f.status,
    tipo: f.tipo || null,
    objetivo: f.objetivo,
    imovib_study_id: f.imovib_study_id || null,
    blueprint_study_id: f.blueprint_study_id || null,
    project_id: f.project_id || null,
    matricula: t(f.matricula),
    construtora: t(f.construtora),
    responsavel_tecnico: t(f.responsavel_tecnico),
    crea_cau: t(f.crea_cau),
    numero_processo: t(f.numero_processo),
    endereco_street: t(f.endereco_street),
    endereco_number: t(f.endereco_number),
    endereco_neighborhood: t(f.endereco_neighborhood),
    endereco_city: t(f.endereco_city),
    endereco_state: t(f.endereco_state),
    endereco_zip_code: t(f.endereco_zip_code),
    spe_razao_social: t(f.spe_razao_social),
    spe_cnpj: t(f.spe_cnpj),
    spe_nome_fantasia: t(f.spe_nome_fantasia),
    developer_name: t(f.developer_name),
    manager: t(f.manager),
    launch_date: t(f.launch_date),
    expected_delivery_date: t(f.expected_delivery_date),
    terreno_area: n(f.terreno_area),
    vgv_total: n(f.vgv_total),
  };
}

/** Para criar: sem as chaves vazias, que ficam com o padrão do banco. */
export function semVazios<T extends Record<string, unknown>>(p: T): Partial<T> {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

/**
 * Para editar: só o que mudou em relação ao registro aberto. Assim salvar a Visão Geral não
 * reescreve com o valor velho o que outra aba (Vinculações, Terreno, Sincronização) gravou
 * enquanto o formulário estava aberto, e o Histórico registra só a alteração de fato.
 */
export function mudancasDaFicha(
  antes: Partial<EmpreendimentoInsert>,
  depois: Partial<EmpreendimentoInsert>,
): Partial<EmpreendimentoInsert> {
  const igual = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  return Object.fromEntries(
    (Object.keys(depois) as (keyof EmpreendimentoInsert)[])
      .filter(k => !igual(antes[k], depois[k]))
      .map(k => [k, depois[k]]),
  ) as Partial<EmpreendimentoInsert>;
}
