/**
 * ACABAMENTOS DO AMBIENTE (19/09/2026, roadmap E7.2) — a parte PURA do piso,
 * forro e rodapé: presets legíveis, sugestão por tipo de ambiente, resumo de
 * uma linha e a conta "quantos ambientes ainda não declararam".
 *
 * O dado mora na etiqueta (`SpaceLabel.acabamentos`, kernel 0.43.0); a medida
 * mora no quantitativo (`QuantidadeAmbiente.piso/forro/rodapeDeclarado`,
 * `totais.porAcabamento`); o orçamento lê `gerarLancamentosDeAcabamentos`.
 * Aqui não há geometria nem banco — só o vocabulário que a gaveta usa.
 *
 * Os PRESETS trazem `itemCode` VAZIO de propósito: o código é do catálogo da
 * organização (SINAPI ou base própria) e este módulo não o conhece. Eles dão
 * a composição típica com espessuras reais; o material se escolhe por camada,
 * ou se salva um tipo (família PISO/FORRO em `blueprint_element_types`).
 */
import type { AcabamentosDoAmbiente, CamadaParede, Forro, Rodape, TipoDeAmbiente } from './blueprintKernel';

export interface PresetDeAcabamento {
  id: string;
  rotulo: string;
  escopo: 'PISO' | 'FORRO';
  /** Piso: de baixo para cima. Forro: de cima para baixo. */
  camadas: CamadaParede[];
  /** Só no forro. */
  rebaixoMm?: number;
  /** Só no piso: o rodapé que costuma acompanhar. `null` = sem rodapé. */
  rodape?: Rodape | null;
  ajuda: string;
}

const c = (espessuraMm: number, descricao: string, funcao: CamadaParede['funcao']): CamadaParede => ({ espessuraMm, itemCode: '', descricao, funcao });

export const PRESETS_DE_ACABAMENTO: readonly PresetDeAcabamento[] = [
  { id: 'PISO_CERAMICO', escopo: 'PISO', rotulo: 'Cerâmica sobre contrapiso', camadas: [c(40, 'Contrapiso', 'REVESTIMENTO'), c(5, 'Argamassa colante', 'REVESTIMENTO'), c(8, 'Cerâmica', 'ACABAMENTO')], rodape: { alturaMm: 70, itemCode: '', descricao: 'Rodapé cerâmico' }, ajuda: 'Áreas secas e molhadas; 53 mm no total.' },
  { id: 'PISO_PORCELANATO', escopo: 'PISO', rotulo: 'Porcelanato sobre contrapiso', camadas: [c(40, 'Contrapiso', 'REVESTIMENTO'), c(5, 'Argamassa colante', 'REVESTIMENTO'), c(10, 'Porcelanato', 'ACABAMENTO')], rodape: { alturaMm: 70, itemCode: '', descricao: 'Rodapé de porcelanato' }, ajuda: 'Salas e dormitórios; 55 mm.' },
  { id: 'PISO_LAMINADO', escopo: 'PISO', rotulo: 'Laminado sobre contrapiso', camadas: [c(40, 'Contrapiso', 'REVESTIMENTO'), c(2, 'Manta acústica', 'ISOLAMENTO'), c(8, 'Laminado', 'ACABAMENTO')], rodape: { alturaMm: 100, itemCode: '', descricao: 'Rodapé de MDF' }, ajuda: 'Dormitórios; 50 mm. Não usar em área molhada.' },
  { id: 'PISO_CIMENTADO', escopo: 'PISO', rotulo: 'Cimentado liso', camadas: [c(30, 'Cimentado desempenado', 'REVESTIMENTO')], rodape: null, ajuda: 'Garagem e serviço; sem rodapé.' },
  { id: 'PISO_BANHEIRO', escopo: 'PISO', rotulo: 'Cerâmica de banheiro (azulejo até o chão)', camadas: [c(40, 'Contrapiso com caimento', 'REVESTIMENTO'), c(5, 'Argamassa colante', 'REVESTIMENTO'), c(8, 'Cerâmica antiderrapante', 'ACABAMENTO')], rodape: null, ajuda: 'Parede azulejada dispensa rodapé.' },
  { id: 'FORRO_GESSO', escopo: 'FORRO', rotulo: 'Forro de gesso acartonado', camadas: [c(13, 'Placa de gesso acartonado', 'ACABAMENTO'), c(1, 'Pintura', 'ACABAMENTO')], rebaixoMm: 300, ajuda: 'Rebaixo de 30 cm para luminária e dutos.' },
  { id: 'FORRO_PVC', escopo: 'FORRO', rotulo: 'Forro de PVC', camadas: [c(8, 'Régua de PVC', 'ACABAMENTO')], rebaixoMm: 200, ajuda: 'Área de serviço e banheiro; 20 cm.' },
  { id: 'FORRO_LAJE', escopo: 'FORRO', rotulo: 'Pintura na laje (sem forro)', camadas: [c(3, 'Massa corrida e pintura', 'ACABAMENTO')], rebaixoMm: 0, ajuda: 'Sem rebaixo: pé-direito inteiro.' },
];

export function presetDeAcabamento(id: string): PresetDeAcabamento | undefined {
  return PRESETS_DE_ACABAMENTO.find((p) => p.id === id);
}

/** Aplica um preset por cima do que o ambiente tem — só o escopo do preset muda. */
export function aplicarPreset(atual: AcabamentosDoAmbiente | undefined, preset: PresetDeAcabamento): AcabamentosDoAmbiente {
  const out: AcabamentosDoAmbiente = {
    ...(atual?.piso ? { piso: atual.piso.map((x) => ({ ...x })) } : {}),
    ...(atual?.forro ? { forro: { camadas: atual.forro.camadas.map((x) => ({ ...x })), rebaixoMm: atual.forro.rebaixoMm } } : {}),
    ...(atual && atual.rodape !== undefined ? { rodape: atual.rodape ? { ...atual.rodape } : null } : {}),
  };
  if (preset.escopo === 'PISO') {
    out.piso = preset.camadas.map((x) => ({ ...x }));
    if (preset.rodape !== undefined) out.rodape = preset.rodape ? { ...preset.rodape } : null;
  } else {
    out.forro = { camadas: preset.camadas.map((x) => ({ ...x })), rebaixoMm: preset.rebaixoMm ?? 0 };
  }
  return out;
}

/**
 * O preset que o TIPO do ambiente (NBR 5410) pede — banheiro azulejado sem
 * rodapé, cozinha/serviço cerâmica + PVC, sala/dormitório porcelanato + gesso.
 * É sugestão de partida; o nome não decide (ver a nota de `TipoDeAmbiente`).
 */
export function presetsSugeridos(tipo: TipoDeAmbiente | null | undefined): { piso: PresetDeAcabamento; forro: PresetDeAcabamento } {
  const p = (id: string) => presetDeAcabamento(id)!;
  switch (tipo) {
    case 'BANHEIRO':
      return { piso: p('PISO_BANHEIRO'), forro: p('FORRO_PVC') };
    case 'COZINHA_SERVICO':
      return { piso: p('PISO_CERAMICO'), forro: p('FORRO_PVC') };
    case 'VARANDA':
      return { piso: p('PISO_CERAMICO'), forro: p('FORRO_LAJE') };
    case 'SALA_DORMITORIO':
      return { piso: p('PISO_PORCELANATO'), forro: p('FORRO_GESSO') };
    default:
      return { piso: p('PISO_CERAMICO'), forro: p('FORRO_LAJE') };
  }
}

const cm = (mm: number) => `${(mm / 10).toFixed(mm % 10 === 0 ? 0 : 1).replace('.', ',')} cm`;

/** "Piso: porcelanato (55 mm) · Forro: gesso, rebaixo 30 cm · Rodapé: 7 cm" — ou "—". */
export function resumirAcabamentos(a: AcabamentosDoAmbiente | undefined, alturaDaPoliticaMm?: number): string {
  if (!a) return alturaDaPoliticaMm != null ? `sem declaração · rodapé pela política (${cm(alturaDaPoliticaMm)})` : 'sem declaração';
  const partes: string[] = [];
  if (a.piso) {
    const topo = a.piso[a.piso.length - 1];
    partes.push(`Piso: ${topo.descricao || topo.funcao.toLowerCase()} (${a.piso.reduce((s, x) => s + x.espessuraMm, 0)} mm)`);
  }
  if (a.forro) {
    const face = a.forro.camadas[0];
    partes.push(`Forro: ${face.descricao || face.funcao.toLowerCase()}${a.forro.rebaixoMm ? `, rebaixo ${cm(a.forro.rebaixoMm)}` : ', colado'}`);
  }
  if (a.rodape === null) partes.push('Rodapé: sem');
  else if (a.rodape) partes.push(`Rodapé: ${a.rodape.descricao || 'declarado'} ${cm(a.rodape.alturaMm)}`);
  else if (alturaDaPoliticaMm != null) partes.push(`Rodapé: pela política (${cm(alturaDaPoliticaMm)})`);
  return partes.join(' · ');
}

/** Quantas camadas (piso + forro) e rodapés declarados ainda estão sem código de catálogo. */
export function semMaterial(a: AcabamentosDoAmbiente | undefined): number {
  if (!a) return 0;
  let n = 0;
  for (const x of a.piso ?? []) if (!x.itemCode) n++;
  for (const x of a.forro?.camadas ?? []) if (!x.itemCode) n++;
  if (a.rodape && !a.rodape.itemCode) n++;
  return n;
}

export interface ResumoDosAcabamentos {
  ambientes: number;
  declarados: number;
  semPiso: number;
  semForro: number;
  semMaterial: number;
}

export function resumirAcabamentosDoNivel(lista: { acabamentos?: AcabamentosDoAmbiente }[]): ResumoDosAcabamentos {
  return {
    ambientes: lista.length,
    declarados: lista.filter((x) => x.acabamentos).length,
    semPiso: lista.filter((x) => !x.acabamentos?.piso).length,
    semForro: lista.filter((x) => !x.acabamentos?.forro).length,
    semMaterial: lista.reduce((s, x) => s + semMaterial(x.acabamentos), 0),
  };
}

/** Pé-direito útil = pé-direito − espessura do piso − rebaixo − espessura do forro. */
export function peDireitoUtilMm(peDireitoMm: number, a: AcabamentosDoAmbiente | undefined): number {
  const piso = (a?.piso ?? []).reduce((s, x) => s + x.espessuraMm, 0);
  const forro = a?.forro ? a.forro.rebaixoMm + a.forro.camadas.reduce((s, x) => s + x.espessuraMm, 0) : 0;
  return Math.max(0, peDireitoMm - piso - forro);
}

export type { Forro };
