/**
 * CONTA-GOTAS — IGUALAR PROPRIEDADES (F4 do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * Uma peça de REFERÊNCIA e N peças de destino: as escolhidas copiam o que foi
 * marcado da referência, num lote só (um Ctrl+Z desfaz tudo). É o gesto do
 * vídeo: escolher as paredes externas e aplicar nelas a parede multicamadas que
 * acabou de ser montada.
 *
 * ─── O QUE SE COPIA ─────────────────────────────────────────────────────────
 *
 * PAREDE: a COMPOSIÇÃO (camadas, ou a espessura da homogênea) e a ALTURA.
 * ABERTURA: o TIPO (porta, janela, correr, vão), o TAMANHO (largura, altura,
 * peitoril) e a ESQUADRIA (o tipo do catálogo).
 *
 * A composição segue a regra de `mudarEspessura`/`mudarCamadas` do editor: a
 * face que o usuário traçou fica PARADA — o eixo anda (`TranslateEntities` com
 * `manterJuncoes`) quando a espessura muda numa parede traçada pela face.
 *
 * ─── POR QUE CADA DESTINO É TESTADO NUM RASCUNHO ────────────────────────────
 *
 * O kernel recusa o que não cabe: porta de 1,20 numa parede de 1,00, parede
 * baixada abaixo da janela que ela tem. Num lote, UMA recusa derruba todas — e
 * a pessoa que escolheu 30 paredes ficaria sem nenhuma por causa de uma. Aqui
 * cada destino é aplicado num modelo de rascunho, na ordem: o que o kernel
 * aceita entra no lote; o que recusa vai para `ignorados` COM a mensagem dele.
 */

import {
  KernelError,
  applyBatch,
  assinaturaDasCamadas,
  clonarCamadas,
  deslocamentoParaManterFace,
  somaDasCamadas,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Opening,
  type Wall,
} from './blueprintKernel';

export type PropriedadeDaParede = 'composicao' | 'altura';
export type PropriedadeDaAbertura = 'tipo' | 'tamanho' | 'esquadria';

export interface OQueIgualar {
  parede: readonly PropriedadeDaParede[];
  abertura: readonly PropriedadeDaAbertura[];
}

export const IGUALAR_TUDO: OQueIgualar = { parede: ['composicao', 'altura'], abertura: ['tipo', 'tamanho', 'esquadria'] };

export const ROTULO_DA_PROPRIEDADE: Record<PropriedadeDaParede | PropriedadeDaAbertura, string> = {
  composicao: 'Espessura e camadas',
  altura: 'Altura',
  tipo: 'Tipo (porta, janela…)',
  tamanho: 'Largura, altura e peitoril',
  esquadria: 'Esquadria do catálogo',
};

export interface ResultadoDoIgualar {
  /** A família da referência; `null` quando ela não é parede nem abertura. */
  familia: 'parede' | 'abertura' | null;
  comandos: Command[];
  /** Destinos que mudaram. */
  aplicados: ObjectId[];
  /** Destinos que ficaram de fora, e por quê. */
  ignorados: { id: ObjectId; motivo: string }[];
}

function comandosDaParede(ref: Wall, alvo: Wall, quais: readonly PropriedadeDaParede[]): Command[] {
  const cmds: Command[] = [];
  if (quais.includes('composicao')) {
    const mesmaComposicao =
      assinaturaDasCamadas(ref.camadas) === assinaturaDasCamadas(alvo.camadas) && ref.thicknessMm === alvo.thicknessMm;
    if (!mesmaComposicao) {
      const novaEspessura = ref.camadas ? somaDasCamadas(ref.camadas) : ref.thicknessMm;
      if (ref.camadas) {
        cmds.push({ type: 'SetWallLayers', wallId: alvo.id, camadas: clonarCamadas(ref.camadas)! });
      } else {
        // Homogênea: largar as camadas do destino (preserva a espessura dele) e só
        // então trocar a espessura — `SetThickness` recusa parede com camadas.
        if (alvo.camadas) cmds.push({ type: 'SetWallLayers', wallId: alvo.id, camadas: null });
        cmds.push({ type: 'SetThickness', wallId: alvo.id, thicknessMm: ref.thicknessMm });
      }
      const delta = deslocamentoParaManterFace(alvo, novaEspessura);
      if (delta.x !== 0 || delta.y !== 0) {
        cmds.push({ type: 'TranslateEntities', wallIds: [alvo.id], boundaryIds: [], structuralIds: [], delta, manterJuncoes: true });
      }
    }
  }
  if (quais.includes('altura') && ref.heightMm !== alvo.heightMm) {
    cmds.push({ type: 'SetWallHeight', wallId: alvo.id, heightMm: ref.heightMm });
  }
  return cmds;
}

function comandosDaAbertura(ref: Opening, alvo: Opening, quais: readonly PropriedadeDaAbertura[]): Command[] {
  const cmds: Command[] = [];
  if (quais.includes('tipo') && (ref.kind !== alvo.kind || !!ref.embutida !== !!alvo.embutida)) {
    cmds.push({ type: 'SetOpeningKind', openingId: alvo.id, kind: ref.kind, ...(ref.kind === 'sliding' ? { embutida: !!ref.embutida } : {}) });
  }
  if (quais.includes('tamanho') && (ref.widthMm !== alvo.widthMm || ref.heightMm !== alvo.heightMm || ref.sillMm !== alvo.sillMm)) {
    cmds.push({ type: 'SetOpeningSize', openingId: alvo.id, widthMm: ref.widthMm, heightMm: ref.heightMm, sillMm: ref.sillMm });
  }
  if (quais.includes('esquadria') && JSON.stringify(ref.esquadria ?? null) !== JSON.stringify(alvo.esquadria ?? null)) {
    cmds.push({ type: 'SetOpeningEsquadria', openingId: alvo.id, esquadria: ref.esquadria ? { ...ref.esquadria } : null });
  }
  return cmds;
}

export function comandosParaIgualar(
  model: BlueprintModel,
  refId: ObjectId,
  alvoIds: readonly ObjectId[],
  quais: OQueIgualar = IGUALAR_TUDO,
): ResultadoDoIgualar {
  const refParede = model.walls.find((w) => w.id === refId);
  const refAbertura = refParede ? undefined : model.openings.find((o) => o.id === refId);
  const familia = refParede ? 'parede' : refAbertura ? 'abertura' : null;
  const resultado: ResultadoDoIgualar = { familia, comandos: [], aplicados: [], ignorados: [] };
  if (!familia) {
    for (const id of alvoIds) if (id !== refId) resultado.ignorados.push({ id, motivo: 'a referência não é parede nem abertura' });
    return resultado;
  }

  let rascunho = model;
  for (const id of alvoIds) {
    if (id === refId) continue;
    let cmds: Command[];
    if (refParede) {
      const alvo = rascunho.walls.find((w) => w.id === id);
      if (!alvo) {
        resultado.ignorados.push({ id, motivo: 'não é parede, como a referência' });
        continue;
      }
      cmds = comandosDaParede(refParede, alvo, quais.parede);
    } else {
      const alvo = rascunho.openings.find((o) => o.id === id);
      if (!alvo) {
        resultado.ignorados.push({ id, motivo: 'não é abertura, como a referência' });
        continue;
      }
      cmds = comandosDaAbertura(refAbertura!, alvo, quais.abertura);
    }
    if (cmds.length === 0) {
      resultado.ignorados.push({ id, motivo: 'já está igual à referência' });
      continue;
    }
    try {
      rascunho = applyBatch(rascunho, cmds).model;
      resultado.comandos.push(...cmds);
      resultado.aplicados.push(id);
    } catch (e) {
      resultado.ignorados.push({ id, motivo: e instanceof KernelError || e instanceof Error ? e.message : String(e) });
    }
  }
  return resultado;
}
