/**
 * REURB — Regularização Fundiária Urbana (Lei 13.465/2017) (A5, 26/09/2026).
 *
 * Sobre o que as fases anteriores já fazem — quadras e lotes vetorizados
 * (B1, sobre a ortofoto da A3), o memorial de cada lote (B4), as pranchas por
 * lote (B4) e o vínculo lote ↔ unidade do Empreendimento (B3) — a REURB
 * acrescenta os OCUPANTES: quem está em cada lote, lido das ocupações da
 * unidade (`unit_occupancies`) no Empreendimento ligado ao estudo.
 *
 *  - memorial REURB por lote: a identificação do núcleo e da modalidade, o
 *    memorial descritivo do lote e os ocupantes com documento;
 *  - listagem de ocupantes para o cartório e a prefeitura (quadra, lote, área,
 *    testada, ocupante, CPF/CNPJ, vínculo);
 *  - pendências: lote sem ocupante, sem documento, memorial incompleto.
 *
 * O software não instaura nem decide a REURB: gera as peças para o
 * responsável técnico e a comissão municipal.
 */
import type { BlueprintModel, Lote } from './blueprintKernel';
import { memorialDeLote, numeroBr, type DadosDoLoteamento } from './blueprintMemorialLote';
import { rotuloDoLote } from './blueprintLoteamento';

export interface OcupanteDoLote {
  nome: string;
  documento: string | null;
  /** PROPRIETARIO, MORADOR, INQUILINO, RESPONSAVEL_FINANCEIRO — o vínculo cadastrado. */
  papel: string;
}

export type ModalidadeDaReurb = 'REURB-S' | 'REURB-E';

export interface DadosDaReurb extends DadosDoLoteamento {
  /** Núcleo urbano informal: "Núcleo Vila Esperança". Vai no lugar do nome do loteamento. */
  modalidade: ModalidadeDaReurb;
}

export const ROTULO_DA_MODALIDADE: Record<ModalidadeDaReurb, string> = {
  'REURB-S': 'REURB-S — interesse social',
  'REURB-E': 'REURB-E — interesse específico',
};

const ROTULO_DO_PAPEL: Record<string, string> = {
  PROPRIETARIO: 'proprietário(a)',
  MORADOR: 'ocupante (morador)',
  INQUILINO: 'ocupante (locatário)',
  RESPONSAVEL_FINANCEIRO: 'responsável financeiro',
};

function lotesDoNucleo(model: BlueprintModel): Lote[] {
  return (model.lotes ?? []).filter((l) => l.tipo === 'LOTE');
}

export interface MemorialReurb {
  loteUid: string;
  titulo: string;
  texto: string;
  avisos: string[];
}

export function memorialReurb(model: BlueprintModel, lote: Lote, ocupantes: OcupanteDoLote[], dados: DadosDaReurb): MemorialReurb {
  const m = memorialDeLote(model, lote, dados);
  const avisos = [...m.avisos];
  if (ocupantes.length === 0) avisos.push('Lote sem ocupante cadastrado — a listagem do cartório precisa de quem está no lote.');
  for (const o of ocupantes) if (!o.documento) avisos.push(`Ocupante "${o.nome}" sem CPF/CNPJ.`);
  const onde = [dados.municipio, dados.uf].filter(Boolean).join(' - ');
  const pessoas =
    ocupantes.length === 0
      ? 'OCUPANTE(S): não cadastrado(s).'
      : `OCUPANTE(S): ${ocupantes.map((o) => `${o.nome}${o.documento ? `, inscrito(a) sob o nº ${o.documento}` : ''}, ${ROTULO_DO_PAPEL[o.papel] ?? o.papel.toLowerCase()}`).join('; ')}.`;
  const texto = [
    'REGULARIZAÇÃO FUNDIÁRIA URBANA — Lei nº 13.465/2017',
    `${ROTULO_DA_MODALIDADE[dados.modalidade]} · ${dados.nome || 'Núcleo urbano informal'}${onde ? ` · ${onde}` : ''}`,
    dados.matricula ? `Matrícula de origem: ${dados.matricula}${dados.cartorio ? ` · ${dados.cartorio}` : ''}` : 'Matrícula de origem: a informar.',
    '',
    `${m.titulo.toUpperCase()} — ÁREA ${numeroBr(m.areaM2)} m² · TESTADA ${numeroBr(m.testadaM)} m · PERÍMETRO ${numeroBr(m.perimetroM)} m`,
    '',
    m.texto,
    '',
    pessoas,
    '',
    dados.responsavelTecnico ? `Responsável técnico: ${dados.responsavelTecnico}${dados.registroDoConselho ? ` (${dados.registroDoConselho})` : ''}` : 'Responsável técnico: a informar.',
  ].join('\n');
  return { loteUid: lote.uid, titulo: m.titulo, texto, avisos };
}

export function memoriaisReurb(model: BlueprintModel, ocupantesPorLote: Record<string, OcupanteDoLote[]>, dados: DadosDaReurb): MemorialReurb[] {
  return lotesDoNucleo(model).map((l) => memorialReurb(model, l, ocupantesPorLote[l.uid] ?? [], dados));
}

/** A listagem para cartório e prefeitura: uma linha por ocupante (lote sem ocupante sai com "—"). */
export function listagemDeOcupantes(model: BlueprintModel, ocupantesPorLote: Record<string, OcupanteDoLote[]>): (string | number)[][] {
  const linhas: (string | number)[][] = [['Quadra', 'Lote', 'Área (m²)', 'Testada (m)', 'Ocupante', 'CPF/CNPJ', 'Vínculo']];
  for (const l of lotesDoNucleo(model)) {
    const m = memorialDeLote(model, l);
    const q = l.quadraId != null ? (model.quadras ?? []).find((x) => x.id === l.quadraId)?.nome ?? '' : '';
    const ocupantes = ocupantesPorLote[l.uid] ?? [];
    const base = [q, l.numero, Math.round(m.areaM2 * 100) / 100, Math.round(m.testadaM * 100) / 100];
    if (ocupantes.length === 0) linhas.push([...base, '—', '—', '—']);
    for (const o of ocupantes) linhas.push([...base, o.nome, o.documento ?? '—', ROTULO_DO_PAPEL[o.papel] ?? o.papel]);
  }
  return linhas;
}

export interface PendenciaDaReurb {
  rotulo: string;
  texto: string;
}

export function pendenciasDaReurb(model: BlueprintModel, ocupantesPorLote: Record<string, OcupanteDoLote[]>, dados: DadosDaReurb): PendenciaDaReurb[] {
  const p: PendenciaDaReurb[] = [];
  if (!dados.nome.trim()) p.push({ rotulo: 'Núcleo', texto: 'Nome do núcleo urbano em branco.' });
  if (!dados.responsavelTecnico?.trim()) p.push({ rotulo: 'Núcleo', texto: 'Responsável técnico em branco.' });
  for (const l of lotesDoNucleo(model)) {
    for (const a of memorialReurb(model, l, ocupantesPorLote[l.uid] ?? [], dados).avisos) p.push({ rotulo: rotuloDoLote(model, l), texto: a });
  }
  return p;
}
