// utils/historicoGrupos.ts
//
// "Agrupar" da aba Histórico do Empreendimento (guia de UI §6.12) — pedido de 21/11/2026,
// docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md. A tela passa o `leitor` com o
// MESMO texto que cada célula mostra; o grupo é recorte de exibição sobre os eventos já carregados.
import { agruparLinhas, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';

export type CampoAgruparHistorico = 'dia' | 'entidade' | 'acao' | 'origem' | 'usuario';

export const OPCOES_AGRUPAR_HISTORICO: { value: CampoAgruparHistorico; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'entidade', label: 'Entidade' },
  { value: 'acao', label: 'Ação' },
  { value: 'origem', label: 'Origem' },
  { value: 'usuario', label: 'Usuário' },
];

export interface LeitorDoHistorico<T> {
  data: (l: T) => string;
  entidade: (l: T) => string;
  acao: (l: T) => string;
  origem: (l: T) => string;
  usuario: (l: T) => string;
}

/** Dia LOCAL do evento ('AAAA-MM-DD', rótulo 'dd/mm/aaaa') — a coluna Data/hora mostra a hora local. */
export function chavePorDia(iso: string | null | undefined): ChaveDeGrupo {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { key: `${d.getFullYear()}-${mm}-${dd}`, label: `${dd}/${mm}/${d.getFullYear()}` };
}

export function agruparHistorico<T>(
  linhas: T[],
  campo: CampoAgruparHistorico,
  direcao: DirecaoGrupos,
  leitor: LeitorDoHistorico<T>,
): Grupo<T>[] {
  if (campo === 'dia') {
    return agruparLinhas(linhas, { chave: l => chavePorDia(leitor.data(l)), semRotulo: 'Sem data', ordem: 'chave', direcao });
  }
  const texto = leitor[campo];
  return agruparLinhas(linhas, {
    chave: l => chavePorNome(texto(l)),
    semRotulo: campo === 'usuario' ? 'Sem usuário' : campo === 'origem' ? 'Sem origem' : campo === 'acao' ? 'Sem ação' : 'Sem entidade',
    ordem: 'rotulo',
    direcao,
  });
}
