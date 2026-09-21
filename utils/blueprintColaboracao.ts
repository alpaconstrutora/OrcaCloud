/**
 * MULTIUSUÁRIO (20/09/2026, roadmap E10.1) — a parte PURA da colaboração em
 * tempo real: quem está no ramo (presença), a TRAVA por elemento (o que a
 * outra pessoa tem selecionado está em edição por ela), a mensagem de comando
 * que viaja pelo canal e a aplicação do comando remoto no histórico local.
 *
 * ─── POR QUE SEM CRDT ───────────────────────────────────────────────────────
 *
 * Todo comando do kernel é determinístico e validado por invariante: dois
 * clientes que partem do mesmo modelo e aplicam a mesma sequência chegam ao
 * mesmo hash. Então basta difundir o `Command` e o hash esperado; quem recebe
 * aplica, confere o hash e, se divergiu, avisa com o autor e oferece
 * recarregar. A trava por elemento (seleção = edição) evita a maioria dos
 * conflitos ANTES de acontecerem; o hash pega o resto.
 *
 * ─── PERMISSÕES POR ESTUDO E MENÇÕES ────────────────────────────────────────
 *
 * Também aqui, por serem regras puras: quem é LEITOR de um estudo não edita
 * (a tela trava e a RLS recusa a gravação), e `@nome`/`@email` num comentário
 * vira menção para um membro da organização.
 */
import type { BlueprintModel, Command, ModelHistory } from './blueprintKernel';

// ── Participantes e cores ───────────────────────────────────────────────────

export interface Participante {
  /** `auth.uid()`. É a chave da presença: a mesma pessoa em duas abas conta uma vez. */
  userId: string;
  email: string;
  nome: string;
  cor: string;
  /** Pavimento em que a pessoa está. */
  levelId: string | null;
  /** O que a pessoa tem SELECIONADO — e, portanto, em edição (a trava). */
  selecionados: string[];
  /** Abas/conexões: a mesma pessoa em duas abas aparece uma vez, com 2 aqui. */
  conexoes: number;
}

/** Paleta estável por chave — a mesma pessoa tem a mesma cor em todas as máquinas. */
export const PALETA_DE_PARTICIPANTES: readonly string[] = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f', '#ea580c', '#0f766e'];

export function corDoParticipante(chave: string): string {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  return PALETA_DE_PARTICIPANTES[h % PALETA_DE_PARTICIPANTES.length];
}

export function iniciais(nomeOuEmail: string): string {
  const base = nomeOuEmail.includes('@') ? nomeOuEmail.split('@')[0].replace(/[._-]+/g, ' ') : nomeOuEmail;
  const partes = base.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** O que cada aba publica na presença; o hook agrega por `userId`. */
export interface EstadoDePresenca {
  userId: string;
  email: string;
  nome: string;
  levelId: string | null;
  selecionados: string[];
}

/** Agrega os estados brutos da presença (um por aba) em um participante por pessoa, sem a própria. */
export function agregarPresenca(estados: EstadoDePresenca[], meuUserId: string | null): Participante[] {
  const porPessoa = new Map<string, Participante>();
  for (const e of estados) {
    if (!e || !e.userId || e.userId === meuUserId) continue;
    const atual = porPessoa.get(e.userId);
    if (atual) {
      atual.conexoes += 1;
      for (const id of e.selecionados ?? []) if (!atual.selecionados.includes(id)) atual.selecionados.push(id);
      if (!atual.levelId && e.levelId) atual.levelId = e.levelId;
    } else {
      porPessoa.set(e.userId, { userId: e.userId, email: e.email ?? '', nome: e.nome || e.email || 'alguém', cor: corDoParticipante(e.userId), levelId: e.levelId ?? null, selecionados: [...(e.selecionados ?? [])], conexoes: 1 });
    }
  }
  return [...porPessoa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ── Travas por elemento ─────────────────────────────────────────────────────

/** id do elemento → quem o tem selecionado (o primeiro a chegar na lista). */
export function travasDe(participantes: readonly Participante[]): Map<string, Participante> {
  const m = new Map<string, Participante>();
  for (const p of participantes) for (const id of p.selecionados) if (!m.has(id)) m.set(id, p);
  return m;
}

/**
 * Os ids que um comando TOCA: todo campo `…Id` (string) e `…Ids` (string[]),
 * menos `levelId` (o pavimento não é elemento editável — quem desenha uma
 * parede nova num pavimento em que outra pessoa está não conflita com ela).
 * Comandos de criação (`AddWall`, `AddLevel`…) não tocam em nada existente.
 */
export function idsTocadosPeloComando(cmd: Command): string[] {
  const ids: string[] = [];
  for (const [k, v] of Object.entries(cmd as unknown as Record<string, unknown>)) {
    if (k === 'levelId' || k === 'type') continue;
    if (/Id$/.test(k) && typeof v === 'string' && v) ids.push(v);
    else if (/Ids$/.test(k) && Array.isArray(v)) for (const x of v) if (typeof x === 'string' && x) ids.push(x);
  }
  return ids;
}

export interface Trava {
  id: string;
  por: Participante;
}

/** A primeira trava de outra pessoa que o comando (ou lote) esbarra; `null` = livre. */
export function travaDoComando(comandos: readonly Command[], travas: ReadonlyMap<string, Participante>): Trava | null {
  for (const c of comandos) for (const id of idsTocadosPeloComando(c)) {
    const por = travas.get(id);
    if (por) return { id, por };
  }
  return null;
}

// ── Difusão de comandos ─────────────────────────────────────────────────────

export interface MensagemDeComando {
  /** Único por lote; serve de idempotência no `ModelHistory.apply`. */
  id: string;
  autorId: string;
  autorNome: string;
  comandos: Command[];
  /** O hash do modelo do autor DEPOIS de aplicar — a prova de que os dois lados convergiram. */
  hashDepois: string;
  enviadoEm: string;
}

export interface ResultadoRemoto {
  ok: boolean;
  /** Mensagem de recusa do kernel (invariante), quando `ok` é falso. */
  erro: string | null;
  /** Aplicou, mas o hash local não bate com o do autor: os modelos divergiram. */
  divergiu: boolean;
  hashLocal: string;
}

/**
 * Aplica um lote remoto no histórico local, comando a comando com id de
 * idempotência (a mesma mensagem duas vezes não aplica duas vezes). Um comando
 * recusado interrompe o lote; o que já entrou fica — e o hash vai acusar.
 */
export function aplicarRemoto(history: ModelHistory, msg: MensagemDeComando): ResultadoRemoto {
  for (let i = 0; i < msg.comandos.length; i++) {
    try {
      history.apply(msg.comandos[i], `${msg.id}:${i}`);
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e), divergiu: history.hash !== msg.hashDepois, hashLocal: history.hash };
    }
  }
  const hashLocal = history.hash;
  return { ok: true, erro: null, divergiu: hashLocal !== msg.hashDepois, hashLocal };
}

export function novaMensagem(autorId: string, autorNome: string, comandos: Command[], hashDepois: string): MensagemDeComando {
  return { id: `${autorId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, autorId, autorNome, comandos, hashDepois, enviadoEm: new Date().toISOString() };
}

// ── Permissões por estudo ───────────────────────────────────────────────────

export type PapelNoEstudo = 'EDITOR' | 'LEITOR';
export interface PermissaoDoEstudo {
  studyId: string;
  email: string;
  papel: PapelNoEstudo;
}

/** Sem linha = EDITOR (o comportamento de sempre para membros da organização). */
export function papelNoEstudo(permissoes: readonly PermissaoDoEstudo[], studyId: string, email: string | null | undefined): PapelNoEstudo {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return 'EDITOR';
  return permissoes.find((p) => p.studyId === studyId && p.email.toLowerCase() === e)?.papel ?? 'EDITOR';
}

// ── Menções em comentários ──────────────────────────────────────────────────

export interface MembroMencionavel {
  email: string;
  nome: string;
}

/**
 * `@email` ou `@primeiro-nome` (único entre os membros) viram menções. A busca
 * é sem acento e sem maiúscula; `@joão` acha "João Silva". Devolve e-mails
 * únicos, na ordem em que aparecem.
 */
export function mencoesDoTexto(texto: string, membros: readonly MembroMencionavel[]): string[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out: string[] = [];
  const re = /@([\w.+-]+@[\w.-]+\.\w+|[\p{L}\p{N}._-]+)/gu;
  for (const m of texto.matchAll(re)) {
    const alvo = norm(m[1]);
    let achado: MembroMencionavel | undefined;
    if (alvo.includes('@')) achado = membros.find((x) => norm(x.email) === alvo);
    else {
      const candidatos = membros.filter((x) => norm(x.email.split('@')[0]) === alvo || norm(x.nome).split(/\s+/)[0] === alvo || norm(x.nome).replace(/\s+/g, '') === alvo);
      if (candidatos.length === 1) achado = candidatos[0];
    }
    if (achado && !out.includes(achado.email)) out.push(achado.email);
  }
  return out;
}

/** Sugestões para o autocompletar depois de um `@` parcial. */
export function sugerirMencoes(parcial: string, membros: readonly MembroMencionavel[], limite = 6): MembroMencionavel[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const p = norm(parcial);
  return membros.filter((m) => !p || norm(m.nome).includes(p) || norm(m.email).includes(p)).slice(0, limite);
}

// ── Travas EXPLÍCITAS (21/09/2026, backlog P2 "lock fino") ─────────────────
//
// A trava por seleção (acima) é efêmera: some com a presença. A explícita é
// PEDIDA — "estou mexendo na elétrica do térreo até amanhã" — e fica no banco
// (`blueprint_element_locks`) até quem pediu soltar, alguém forçar ou o prazo
// vencer. Três escopos: ELEMENTOS (uids), PAVIMENTO (uid do nível — bloqueia
// tudo nele, inclusive criar) e DISCIPLINA (ELETRICA/HIDRAULICA/MECANICA —
// trechos, pontos, quadros e circuitos dela, inclusive criar).

export const ESCOPOS_DE_TRAVA = ['ELEMENTOS', 'PAVIMENTO', 'DISCIPLINA'] as const;
export type EscopoDeTrava = (typeof ESCOPOS_DE_TRAVA)[number];
export const ROTULO_DO_ESCOPO_DE_TRAVA: Record<EscopoDeTrava, string> = { ELEMENTOS: 'Elementos', PAVIMENTO: 'Pavimento', DISCIPLINA: 'Disciplina' };
export const VALIDADES_DE_TRAVA_H = [2, 8, 24, 72] as const;
export const MAX_NOTA_DE_TRAVA = 200;

export interface TravaExplicita {
  id: string;
  branchId: string;
  escopo: EscopoDeTrava;
  /** ELEMENTOS: uids · PAVIMENTO: uid do nível · DISCIPLINA: nome da disciplina. */
  alvos: string[];
  holderUserId: string;
  holderEmail: string;
  holderNome: string;
  nota: string;
  createdAt: string;
  expiresAt: string;
}

/** Só as que ainda valem. */
export function travasVigentes(travas: readonly TravaExplicita[], agora = new Date()): TravaExplicita[] {
  const t = agora.getTime();
  return travas.filter((x) => new Date(x.expiresAt).getTime() > t);
}

interface PecaIndexada {
  uid: string;
  levelId: string | null;
  disciplina: string | null;
}

/** id → (uid, pavimento, disciplina) de toda peça do modelo; níveis também (uid do nível pelo id). */
export function indiceDePecas(model: BlueprintModel): Map<string, PecaIndexada> {
  const m = new Map<string, PecaIndexada>();
  const nivelDaParede = new Map(model.walls.map((w) => [w.id, w.levelId]));
  for (const lista of Object.values(model as unknown as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue;
    for (const x of lista as { id?: string; uid?: string; levelId?: string; wallId?: string; disciplina?: string }[]) {
      if (!x || typeof x !== 'object' || !x.id || !x.uid) continue;
      m.set(x.id, { uid: x.uid, levelId: x.levelId ?? (x.wallId ? nivelDaParede.get(x.wallId) ?? null : null), disciplina: typeof x.disciplina === 'string' ? x.disciplina : null });
    }
  }
  // Ambientes não têm uid próprio: a identidade é a da ETIQUETA (`labelUid`), como no canônico.
  for (const s of model.spaces) if (s.labelUid) m.set(s.id, { uid: s.labelUid, levelId: s.levelId, disciplina: null });
  // Circuitos não têm `disciplina`; são sempre elétricos.
  for (const c of model.circuitos ?? []) if (c.id && c.uid) m.set(c.id, { uid: c.uid, levelId: null, disciplina: 'ELETRICA' });
  return m;
}

export interface Bloqueio {
  trava: TravaExplicita;
  motivo: string;
}

/**
 * A primeira trava explícita de OUTRA pessoa que o lote esbarra; `null` = livre.
 * Diferente da trava por seleção, PAVIMENTO e DISCIPLINA bloqueiam também a
 * CRIAÇÃO (parede nova no pavimento travado; ponto novo na disciplina travada).
 */
export function bloqueioDasTravas(comandos: readonly Command[], travas: readonly TravaExplicita[], model: BlueprintModel, meuUserId: string | null): Bloqueio | null {
  const vigentes = travasVigentes(travas).filter((t) => t.holderUserId !== meuUserId);
  if (vigentes.length === 0) return null;
  const indice = indiceDePecas(model);
  const uidDoNivel = new Map(model.levels.map((l) => [l.id, l.uid]));
  const quem = (t: TravaExplicita) => `${t.holderNome || t.holderEmail}${t.nota ? ` ("${t.nota}")` : ''}`;
  for (const c of comandos) {
    const cmd = c as unknown as Record<string, unknown>;
    const tocados = idsTocadosPeloComando(c).map((id) => ({ id, peca: indice.get(id) ?? null }));
    const niveisDoComando = new Set<string>();
    if (typeof cmd.levelId === 'string') niveisDoComando.add(cmd.levelId);
    for (const t of tocados) if (t.peca?.levelId) niveisDoComando.add(t.peca.levelId);
    const disciplinasDoComando = new Set<string>();
    if (typeof cmd.disciplina === 'string') disciplinasDoComando.add(cmd.disciplina);
    for (const t of tocados) if (t.peca?.disciplina) disciplinasDoComando.add(t.peca.disciplina);
    if (/Circuito/.test(c.type) || /circuitoId/.test(Object.keys(cmd).join(','))) disciplinasDoComando.add('ELETRICA');
    for (const trava of vigentes) {
      if (trava.escopo === 'ELEMENTOS') {
        const alvo = tocados.find((t) => t.peca && trava.alvos.includes(t.peca.uid));
        if (alvo) return { trava, motivo: `"${alvo.id}" está travado por ${quem(trava)} até ${dataHoraBr(trava.expiresAt)}.` };
      } else if (trava.escopo === 'PAVIMENTO') {
        for (const lv of niveisDoComando) {
          const uid = uidDoNivel.get(lv);
          if (uid && trava.alvos.includes(uid)) return { trava, motivo: `O pavimento "${model.levels.find((l) => l.id === lv)?.name ?? lv}" está travado por ${quem(trava)} até ${dataHoraBr(trava.expiresAt)}.` };
        }
      } else {
        for (const d of disciplinasDoComando) if (trava.alvos.includes(d)) return { trava, motivo: `A disciplina ${d} está travada por ${quem(trava)} até ${dataHoraBr(trava.expiresAt)}.` };
      }
    }
  }
  return null;
}

/** Os ids (do modelo atual) que uma trava de ELEMENTOS cobre — para o crachá no canvas. */
export function idsTravados(travas: readonly TravaExplicita[], model: BlueprintModel): { id: string; trava: TravaExplicita }[] {
  const porUid = new Map<string, TravaExplicita>();
  for (const t of travasVigentes(travas)) if (t.escopo === 'ELEMENTOS') for (const u of t.alvos) if (!porUid.has(u)) porUid.set(u, t);
  if (porUid.size === 0) return [];
  const saida: { id: string; trava: TravaExplicita }[] = [];
  for (const [id, p] of indiceDePecas(model)) {
    const t = porUid.get(p.uid);
    if (t) saida.push({ id, trava: t });
  }
  return saida;
}

export function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Resumo de uma trava para a tela: "3 elemento(s)", "Pavimento Térreo", "Disciplina ELETRICA". */
export function rotuloDaTrava(t: TravaExplicita, model: BlueprintModel | null): string {
  if (t.escopo === 'ELEMENTOS') return `${t.alvos.length} elemento(s)`;
  if (t.escopo === 'PAVIMENTO') return `Pavimento ${model?.levels.find((l) => l.uid === t.alvos[0])?.name ?? t.alvos[0]}`;
  return `Disciplina ${t.alvos.join(', ')}`;
}
