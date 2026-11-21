// utils/zonaRegulatoriaGrupos.ts
//
// "Agrupar" da tabela de zonas do Mapa Regulatório (guia de UI §6.12) — pedido de 21/11/2026,
// docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md. A mesma tabela serve o
// Empreendimento, a Planta Inteligente e o cadastro de mapas por cidade.
import { agruparLinhas, chavePorNome, type DirecaoGrupos, type Grupo } from './agruparLinhas';

export type CampoAgruparZona = 'macroarea' | 'zona' | 'uso_permitido' | 'nivel_confianca';

export const OPCOES_AGRUPAR_ZONA: { value: CampoAgruparZona; label: string }[] = [
  { value: 'macroarea', label: 'Macroárea' },
  { value: 'zona', label: 'Zona' },
  { value: 'uso_permitido', label: 'Uso permitido' },
  { value: 'nivel_confianca', label: 'Nível de confiança' },
];

const SEM_ROTULO: Record<CampoAgruparZona, string> = {
  macroarea: 'Sem macroárea',
  zona: 'Sem zona',
  uso_permitido: 'Sem uso permitido',
  nivel_confianca: 'Sem nível de confiança',
};

/**
 * Agrupa pelo texto da célula (o select/campo mostra o valor gravado). Nível de confiança vai na
 * ordem da escala (Baixo → Validado na prefeitura), não alfabética; o resto, A→Z.
 */
export function agruparZonas<T extends Partial<Record<CampoAgruparZona, string | undefined>>>(
  zonas: T[],
  campo: CampoAgruparZona,
  direcao: DirecaoGrupos,
  escalaDeConfianca: readonly string[] = [],
): Grupo<T>[] {
  return agruparLinhas(zonas, {
    chave: z => chavePorNome(z[campo]),
    semRotulo: SEM_ROTULO[campo],
    ordem: campo === 'nivel_confianca' ? escalaDeConfianca.map(n => n.toLowerCase()) : 'rotulo',
    direcao,
  });
}
