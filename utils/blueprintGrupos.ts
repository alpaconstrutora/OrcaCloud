/**
 * GRUPOS COM ORIGEM (19/09/2026, roadmap E2.3) — o que a tela precisa e o
 * kernel não guarda: qual grupo a seleção toca, o comando de agrupar, a
 * descrição de uma instância e o plano de "Repetir unidade".
 *
 * "REPETIR UNIDADE" = agrupar as peças da unidade (paredes do contorno e
 * internas, estrutura dentro da caixa, etiquetas) + instanciar ESPELHADA
 * encostada num dos quatro lados (ou deslocada) + a unidade nova com as
 * etiquetas copiadas — um comando (`AddGrupo` com `instancias`), um Ctrl+Z.
 *
 * A parede que corre EXATAMENTE sobre a linha do espelho (a divisa do lado
 * escolhido) fica FORA da origem: a cópia cairia sobre ela mesma, e duas
 * paredes coincidentes dobrariam a alvenaria no quantitativo. Sem ela na
 * cópia, a parede original passa a separar as duas unidades — é a geminada
 * que a NBR 12721 mede pela metade (E2.2). O mesmo vale para o pilar sobre a
 * linha.
 */
import { medirUnidade } from './blueprintUnidades';
import type { BlueprintModel, Command, Grupo, InstanciaDeGrupo, ObjectId, Point } from './blueprintKernel';

export type ModoDeRepeticao = 'ESPELHO_DIREITA' | 'ESPELHO_ESQUERDA' | 'ESPELHO_ACIMA' | 'ESPELHO_ABAIXO' | 'DESLOCADA';

export const ROTULO_DO_MODO: Record<ModoDeRepeticao, string> = {
  ESPELHO_DIREITA: 'Espelhada à direita',
  ESPELHO_ESQUERDA: 'Espelhada à esquerda',
  ESPELHO_ACIMA: 'Espelhada acima',
  ESPELHO_ABAIXO: 'Espelhada abaixo',
  DESLOCADA: 'Deslocada',
};

/** O grupo cuja ORIGEM contém alguma das peças selecionadas, ou `null`. */
export function grupoDaSelecao(model: BlueprintModel, ids: readonly ObjectId[]): Grupo | null {
  const uids = new Set<string>();
  for (const id of ids) {
    const w = model.walls.find((x) => x.id === id);
    if (w) uids.add(w.uid);
    const s = model.structures.find((x) => x.id === id);
    if (s) uids.add(s.uid);
    const l = (model.labels ?? []).find((x) => x.id === id);
    if (l) uids.add(l.uid);
    const o = model.openings.find((x) => x.id === id);
    if (o) {
      const dona = model.walls.find((x) => x.id === o.wallId);
      if (dona) uids.add(dona.uid);
    }
  }
  return (model.grupos ?? []).find((g) => [...g.origem.walls, ...g.origem.structures, ...g.origem.labels].some((u) => uids.has(u))) ?? null;
}

export type ResultadoDeGrupo = { ok: true; comando: Command; aviso: string | null } | { ok: false; aviso: string };

/** Agrupa a seleção: paredes e estrutura do mesmo pavimento (aberturas vão com a parede). */
export function comandoDeAgrupar(model: BlueprintModel, ids: readonly ObjectId[], nome: string): ResultadoDeGrupo {
  const wallIds = ids.filter((id) => model.walls.some((w) => w.id === id));
  const structuralIds = ids.filter((id) => model.structures.some((s) => s.id === id));
  const labelIds = ids.filter((id) => (model.labels ?? []).some((l) => l.id === id));
  // Abertura selecionada leva a parede hospedeira.
  for (const id of ids) {
    const o = model.openings.find((x) => x.id === id);
    if (o && !wallIds.includes(o.wallId)) wallIds.push(o.wallId);
  }
  if (wallIds.length + structuralIds.length + labelIds.length === 0) return { ok: false, aviso: 'Selecione paredes ou peças estruturais para agrupar.' };
  const niveis = new Set([...wallIds.map((id) => model.walls.find((w) => w.id === id)!.levelId), ...structuralIds.map((id) => model.structures.find((s) => s.id === id)!.levelId)]);
  if (niveis.size > 1) return { ok: false, aviso: 'As peças da origem têm de estar no mesmo pavimento.' };
  const ignoradas = ids.length - wallIds.length - structuralIds.length - labelIds.length - ids.filter((id) => model.openings.some((o) => o.id === id)).length;
  return {
    ok: true,
    comando: { type: 'AddGrupo', nome: nome.trim() || `Grupo ${(model.grupos ?? []).length + 1}`, wallIds, structuralIds, labelIds },
    aviso: ignoradas > 0 ? `${ignoradas} peça(s) fora do grupo: só paredes, estrutura e etiquetas entram na origem.` : null,
  };
}

/** "espelho X · +6,00 m, 0 · giro 90° · Térreo" */
export function descreverInstancia(model: BlueprintModel, i: InstanciaDeGrupo): string {
  const m = (mm: number) => `${mm >= 0 ? '+' : '−'}${(Math.abs(mm) / 1000).toFixed(2).replace('.', ',')} m`;
  const partes: string[] = [];
  if (i.espelho !== 'NENHUM') partes.push(`espelho ${i.espelho}`);
  if (i.rotacaoGraus) partes.push(`giro ${i.rotacaoGraus}°`);
  if (i.translacao.x || i.translacao.y) partes.push(`${m(i.translacao.x)}, ${m(i.translacao.y)}`);
  partes.push(model.levels.find((l) => l.id === i.levelId)?.name ?? '?');
  return partes.join(' · ');
}

/** Número sugerido para a cópia: "101" → "102"; "Casa 3" → "Casa 3 B". */
export function numeroSugerido(model: BlueprintModel, numero: string): string {
  const existentes = new Set((model.unidades ?? []).map((u) => u.numero));
  const n = /^\d+$/.test(numero) ? Number(numero) : null;
  if (n !== null) {
    let k = n + 1;
    while (existentes.has(String(k))) k++;
    return String(k);
  }
  let sufixo = 'B';
  while (existentes.has(`${numero} ${sufixo}`)) sufixo = String.fromCharCode(sufixo.charCodeAt(0) + 1);
  return `${numero} ${sufixo}`.slice(0, 16);
}

/**
 * O comando que repete a unidade. Falha explicada quando a unidade não tem
 * ambientes, atravessa pavimentos (o grupo é de um pavimento) ou já é
 * origem/cópia de grupo.
 */
export function planoDeRepeticaoDaUnidade(
  model: BlueprintModel,
  unidadeId: ObjectId,
  modo: ModoDeRepeticao,
  opcoes: { deslocamento?: Point; numero?: string; nome?: string } = {},
): ResultadoDeGrupo {
  const u = (model.unidades ?? []).find((x) => x.id === unidadeId);
  if (!u) return { ok: false, aviso: 'Unidade inexistente.' };
  const med = medirUnidade(model, u);
  if (med.ambientes.length === 0) return { ok: false, aviso: `A unidade ${u.numero} não tem ambientes — componha antes de repetir.` };
  if (med.levelIds.length > 1) return { ok: false, aviso: `A unidade ${u.numero} atravessa pavimentos; o grupo é de um pavimento só.` };
  const levelId = med.levelIds[0];
  const pontos = med.ambientes.flatMap((s) => s.ring);
  const caixa = { minX: Math.min(...pontos.map((p) => p.x)), maxX: Math.max(...pontos.map((p) => p.x)), minY: Math.min(...pontos.map((p) => p.y)), maxY: Math.max(...pontos.map((p) => p.y)) };
  const dentro = (p: Point) => p.x >= caixa.minX && p.x <= caixa.maxX && p.y >= caixa.minY && p.y <= caixa.maxY;
  // Linha do espelho (x = k ou y = k) e a transformação.
  let espelho: 'NENHUM' | 'X' | 'Y' = 'NENHUM';
  let pivo: Point = { x: caixa.minX, y: caixa.minY };
  let naLinha: (p: Point) => boolean = () => false;
  if (modo === 'ESPELHO_DIREITA') {
    espelho = 'X';
    pivo = { x: caixa.maxX, y: caixa.minY };
    naLinha = (p) => p.x === caixa.maxX;
  } else if (modo === 'ESPELHO_ESQUERDA') {
    espelho = 'X';
    pivo = { x: caixa.minX, y: caixa.minY };
    naLinha = (p) => p.x === caixa.minX;
  } else if (modo === 'ESPELHO_ABAIXO') {
    espelho = 'Y';
    pivo = { x: caixa.minX, y: caixa.maxY };
    naLinha = (p) => p.y === caixa.maxY;
  } else if (modo === 'ESPELHO_ACIMA') {
    espelho = 'Y';
    pivo = { x: caixa.minX, y: caixa.minY };
    naLinha = (p) => p.y === caixa.minY;
  }
  const translacao = modo === 'DESLOCADA' ? (opcoes.deslocamento ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
  if (modo === 'DESLOCADA' && translacao.x === 0 && translacao.y === 0) return { ok: false, aviso: 'Informe o deslocamento da cópia.' };
  // Paredes: as dos lados dos ambientes (contorno e internas), menos as que correm sobre a linha do espelho.
  const idsDistintos = [...new Set(med.paredes.map((p) => p.wallId))];
  const paredes = idsDistintos.map((id) => model.walls.find((w) => w.id === id)!).filter((w) => !(naLinha(w.a) && naLinha(w.b)));
  const extrapolam = paredes.filter((w) => !dentro(w.a) || !dentro(w.b)).length;
  const estruturas = model.structures.filter((s) => s.levelId === levelId && s.pontos.every(dentro) && !s.pontos.every(naLinha));
  const etiquetas = (model.labels ?? []).filter((l) => u.etiquetaUids.includes(l.uid));
  const jaEmGrupo = (model.grupos ?? []).find((g) => paredes.some((w) => g.origem.walls.includes(w.uid)));
  if (jaEmGrupo) return { ok: false, aviso: `As paredes da unidade ${u.numero} já são origem do grupo "${jaEmGrupo.nome}": instancie por lá.` };
  const numero = (opcoes.numero ?? numeroSugerido(model, u.numero)).trim();
  return {
    ok: true,
    comando: {
      type: 'AddGrupo',
      nome: (opcoes.nome ?? `Unidade ${u.numero}`).slice(0, 40),
      wallIds: paredes.map((w) => w.id),
      structuralIds: estruturas.map((s) => s.id),
      labelIds: etiquetas.map((l) => l.id),
      pivo,
      instancias: [{ translacao, espelho, rotacaoGraus: 0, unidade: { numero, tipologia: u.tipologia ?? null, pcd: u.pcd } }],
    },
    aviso:
      [
        paredes.length < idsDistintos.length ? 'A parede sobre a linha do espelho ficou de fora: passa a ser a geminada entre as duas unidades.' : null,
        extrapolam > 0 ? `${extrapolam} parede(s) passam do contorno da unidade e vão copiadas inteiras — divida-as antes (Dividir parede) para copiar só o trecho.` : null,
      ]
        .filter(Boolean)
        .join(' ') || null,
  };
}
