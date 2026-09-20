// utils/blueprintConflitoStatus.ts
//
// STATUS DO CONFLITO (20/09/2026, backlog P2 do roadmap): ABERTO ou ACEITO.
//
// ─── A LISTA CONTINUA DERIVADA; O QUE SE GRAVA É A DECISÃO ───────────────────
//
// `PainelConflitos` nasceu sem "resolver" de propósito: conflito se resolve
// mudando o desenho, e um botão de dispensar criaria um estado que sobrevive à
// mudança que o eliminou. Isto aqui NÃO é dispensar: é ACEITAR, com
// justificativa e autor — "o pilar dentro do shaft fica; o shaft será refeito
// na etapa 2" —, por (estudo, par de uids). A lista some quando o desenho muda
// (a derivação manda); a decisão fica para quando o mesmo par voltar.
//
// Dois cuidados para a lista não mentir:
//   1. O aceite guarda a MEDIDA do encontro. Se o encontro CRESCEU além de uma
//      folga (`cresceuAlemDoAceito`), o conflito volta a contar como ABERTO,
//      com a nota "cresceu desde o aceite" — aceitar 50 mm de raspão não é
//      aceitar 400 mm de viga dentro da caixa.
//   2. O aceite é por PAR DE UIDS (a identidade estável do elemento), a mesma
//      chave do tópico BCF — o que se aceita aqui vai como `Closed` no BCF.

import type { Conflito, ConflitoArquitetonico } from './blueprintKernel';

export type StatusDoConflito = 'ABERTO' | 'ACEITO';

/** Um aceite gravado (linha de `blueprint_conflict_acceptances`). */
export interface AceiteDeConflito {
  id: string;
  studyId: string;
  chave: string;
  classe: string;
  medidaMm: number;
  justificativa: string;
  acceptedEmail: string | null;
  createdAt: string;
}

/** O conflito com o status resolvido — o que a tela lista e conta. */
export interface ConflitoComStatus<T> {
  conflito: T;
  chave: string;
  classe: string;
  medidaMm: number;
  status: StatusDoConflito;
  aceite: AceiteDeConflito | null;
  /** `true` quando havia aceite mas o encontro cresceu além da folga — volta a ABERTO. */
  cresceu: boolean;
}

/** Acima disto (relativo + absoluto) o encontro "cresceu" e o aceite não vale mais. */
export const FOLGA_DO_ACEITE = { relativa: 0.25, absolutaMm: 20 };

export function chaveDoConflitoMep(c: Conflito): string {
  return `${c.trechoUid}:${c.outroUid}`;
}

export function chaveDoConflitoArq(c: ConflitoArquitetonico): string {
  return `${c.pecaUid}:${c.outroUid}`;
}

/** A medida que se compara: o comprimento por dentro (MEP) ou a medida da classe (arquitetônico). */
export function medidaDoConflitoMep(c: Conflito): number {
  return Math.round(c.comprimentoDentroMm);
}

export function cresceuAlemDoAceito(medidaAgoraMm: number, medidaAceitaMm: number): boolean {
  return medidaAgoraMm > medidaAceitaMm * (1 + FOLGA_DO_ACEITE.relativa) + FOLGA_DO_ACEITE.absolutaMm;
}

function resolver<T>(conflito: T, chave: string, classe: string, medidaMm: number, aceites: ReadonlyMap<string, AceiteDeConflito>): ConflitoComStatus<T> {
  const aceite = aceites.get(chave) ?? null;
  const cresceu = aceite ? cresceuAlemDoAceito(medidaMm, aceite.medidaMm) : false;
  return { conflito, chave, classe, medidaMm, status: aceite && !cresceu ? 'ACEITO' : 'ABERTO', aceite, cresceu };
}

export function indexarAceites(aceites: readonly AceiteDeConflito[]): Map<string, AceiteDeConflito> {
  return new Map(aceites.map((a) => [a.chave, a]));
}

export function classificarMep(conflitos: readonly Conflito[], aceites: ReadonlyMap<string, AceiteDeConflito>): ConflitoComStatus<Conflito>[] {
  return conflitos.map((c) => resolver(c, chaveDoConflitoMep(c), c.classe, medidaDoConflitoMep(c), aceites));
}

export function classificarArq(conflitos: readonly ConflitoArquitetonico[], aceites: ReadonlyMap<string, AceiteDeConflito>): ConflitoComStatus<ConflitoArquitetonico>[] {
  return conflitos.map((c) => resolver(c, chaveDoConflitoArq(c), c.classe, c.medidaMm, aceites));
}

export interface ContagemDeConflitos {
  abertos: number;
  aceitos: number;
  /** Aceites cujo conflito cresceu — estão em `abertos`, mas merecem aviso próprio. */
  cresceram: number;
}

export function contarStatus(lista: readonly ConflitoComStatus<unknown>[]): ContagemDeConflitos {
  return {
    abertos: lista.filter((c) => c.status === 'ABERTO').length,
    aceitos: lista.filter((c) => c.status === 'ACEITO').length,
    cresceram: lista.filter((c) => c.cresceu).length,
  };
}

/** Aceites cujo par não existe mais na lista derivada — o desenho resolveu; a linha pode ir. */
export function aceitesOrfaos(aceites: readonly AceiteDeConflito[], chavesVivas: ReadonlySet<string>): AceiteDeConflito[] {
  return aceites.filter((a) => !chavesVivas.has(a.chave));
}

export function validarJustificativa(texto: string): string | null {
  const t = texto.trim();
  if (t.length < 3) return 'Diga por que o conflito é aceito (mínimo 3 caracteres).';
  if (t.length > 500) return 'Justificativa maior que 500 caracteres.';
  return null;
}
