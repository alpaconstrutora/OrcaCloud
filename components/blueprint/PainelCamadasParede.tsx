import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Layers, Plus, Search } from 'lucide-react';
import type { CamadaParede, FuncaoCamada, QuantidadeCamada, Wall } from '../../utils/blueprintKernel';
import { somaDasCamadas } from '../../utils/blueprintKernel';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import DatabasePickerModal from '../DatabasePickerModal';
import { CampoMedida } from './PainelParedeSelecionada';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg } from '../../hooks/useOrgContext';
import {
  listWallTypes,
  saveWallType,
  type TipoDeParede,
} from '../../services/blueprintWallTypeService';

/**
 * Editor da COMPOSIÇÃO da parede selecionada.
 *
 * ─── POR QUE ARQUIVO PRÓPRIO ────────────────────────────────────────────────
 *
 * `PainelParedeSelecionada.tsx` já passa de 500 linhas cuidando de parede E
 * abertura. A composição é um editor inteiro — lista reordenável, catálogo,
 * quantitativo por linha —, e enfiá-la lá dentro faria o arquivo virar duas
 * telas empilhadas. `PainelEstruturaSelecionada.tsx` já estabeleceu o
 * precedente de painéis irmãos.
 *
 * ─── A ESPESSURA É DERIVADA, E O CAMPO MOSTRA ISSO ──────────────────────────
 *
 * Com composição, `thicknessMm` é a SOMA das camadas — o kernel recusa
 * `SetThickness` numa parede que as tem. Por isso o total aparece em modo
 * leitura, no rodapé: um campo editável ali prometeria uma edição que o kernel
 * não aceita, e "não faz nada ao digitar" é pior do que não existir.
 *
 * ─── UM COMANDO POR GESTO ───────────────────────────────────────────────────
 *
 * Toda ação daqui — adicionar, excluir, duplicar, reordenar, mudar espessura ou
 * material — monta a lista NOVA inteira e chama `aoMudar` uma vez. O kernel
 * recebe um `SetWallLayers`, valida o conjunto e grava um único passo de
 * desfazer. É a razão de não haver comando granular: os estados intermediários
 * de uma edição (tirar uma camada antes de engrossar outra) violam o invariante
 * da soma, e passariam pelo validador se fossem comandos separados.
 */

/** Rótulo de cada função construtiva. Ordem = a que aparece no seletor. */
const FUNCOES: { valor: FuncaoCamada; rotulo: string; ajuda: string }[] = [
  { valor: 'VEDACAO', rotulo: 'Vedação', ajuda: 'Bloco, tijolo — o corpo da parede.' },
  { valor: 'ESTRUTURAL', rotulo: 'Estrutural', ajuda: 'Concreto ou alvenaria estrutural.' },
  { valor: 'REVESTIMENTO', rotulo: 'Revestimento', ajuda: 'Chapisco, emboço, reboco, gesso.' },
  { valor: 'ACABAMENTO', rotulo: 'Acabamento', ajuda: 'Cerâmica, pintura, papel.' },
  { valor: 'ISOLAMENTO', rotulo: 'Isolamento', ajuda: 'Lã, EPS, manta acústica ou térmica.' },
  { valor: 'CAMARA_AR', rotulo: 'Câmara de ar', ajuda: 'Vazio entre folhas. Ocupa espessura, não é material.' },
];

const ROTULO_FUNCAO = new Map(FUNCOES.map((f) => [f.valor, f.rotulo]));

/** As mesmas cores do desenho — a legenda tem de bater com o que está na tela. */
const COR_FUNCAO: Record<FuncaoCamada, string> = {
  ESTRUTURAL: '#94a3b8',
  VEDACAO: '#cbd5e1',
  REVESTIMENTO: '#e2e8f0',
  ISOLAMENTO: '#fde68a',
  ACABAMENTO: '#f1f5f9',
  CAMARA_AR: '#ffffff',
};

/** Espessura de uma camada nova, em mm. Reboco é o caso mais comum. */
const ESPESSURA_NOVA_MM = 25;

interface Props {
  parede: Wall;
  /**
   * As camadas já MEDIDAS, na ordem da composição. Vem de fora porque o cálculo
   * é do quantitativo do modelo inteiro (`computeQuantities`), que o editor já
   * roda ao vivo — refazer a conta aqui seria uma segunda fórmula de área de
   * face, e a primeira a divergir quando o desconto de vão mudar.
   */
  medidas: QuantidadeCamada[];
  /** `null` devolve a parede ao estado homogêneo, preservando a espessura. */
  aoMudar: (camadas: CamadaParede[] | null) => void;
}

export default function PainelCamadasParede({ parede, medidas, aoMudar }: Props) {
  const confirm = useConfirm();
  const [escolhendoItemDe, setEscolhendoItemDe] = useState<number | null>(null);

  const camadas = parede.camadas ?? null;
  const total = camadas ? somaDasCamadas(camadas) : parede.thicknessMm;

  // ── Tipos de parede salvos ───────────────────────────────────────────────
  //
  // ⚠️ REGRA #5: `orgId` vem do CONTEXTO, nunca de prop, e `null` ("Todas") NÃO
  // bloqueia a leitura — a lista simplesmente traz o que a RLS deixar ver.
  const { orgId } = useOrgContext();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const [tipos, setTipos] = useState<TipoDeParede[]>([]);
  const [avisoTipo, setAvisoTipo] = useState<string | null>(null);

  const carregarTipos = useCallback(() => {
    listWallTypes(orgId)
      .then(setTipos)
      // Falhar em carregar o catálogo não pode derrubar o editor de camadas: os
      // tipos são conveniência, e a composição se monta à mão sem eles.
      .catch(() => setTipos([]));
  }, [orgId]);

  useEffect(() => {
    carregarTipos();
  }, [carregarTipos]);

  /**
   * Nome em digitação. `null` = o campo não está aberto.
   *
   * Campo inline, e não `window.prompt`: o diálogo nativo é o mesmo problema que
   * a §14 do guia resolve para o `confirm` — quebra a identidade visual, não é
   * estilizável e some do fluxo da tela.
   */
  const [nomeDoTipo, setNomeDoTipo] = useState<string | null>(null);

  async function salvarComoTipo(nome: string) {
    if (!camadas?.length || !nome.trim()) return;
    setNomeDoTipo(null);

    // O topo manda: com organização escolhida, não pergunta nada. Em "Todas",
    // `resolveWriteOrg` decide (e replica), conforme a REGRA #5.
    const target = await resolveWriteOrg('all-allowed');
    if (!target) return;

    const { ok, failed } = await forEachTargetOrg(target, (org) =>
      saveWallType(org, nome.trim(), camadas),
    );
    setAvisoTipo(
      failed.length === 0
        ? ok > 1
          ? `Tipo salvo em ${ok} organizações.`
          : 'Tipo salvo.'
        : `Salvo em ${ok}; ${failed.length} falharam.`,
    );
    carregarTipos();
  }

  function aplicarTipo(id: string) {
    const tipo = tipos.find((t) => t.id === id);
    if (!tipo?.camadas?.length) return;
    // Cópia, e não o array do catálogo: editar a composição da parede depois de
    // aplicar não pode reescrever o tipo salvo por referência compartilhada.
    aoMudar(tipo.camadas.map((c) => ({ ...c })));
  }

  const sensores = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Chave estável por posição, para o dnd-kit.
   *
   * `CamadaParede` não tem id — é dado de valor dentro do payload canônico, e
   * dar um id a ela o levaria para o hash do desenho sem descrever nada dele.
   * O índice serve porque a lista é curta e a reordenação reescreve o array
   * inteiro de uma vez.
   */
  const ids = useMemo(() => (camadas ?? []).map((_, i) => `camada-${i}`), [camadas]);

  function trocar(indice: number, campos: Partial<CamadaParede>) {
    if (!camadas) return;
    aoMudar(camadas.map((c, i) => (i === indice ? { ...c, ...campos } : c)));
  }

  function adicionar() {
    const nova: CamadaParede = {
      espessuraMm: ESPESSURA_NOVA_MM,
      itemCode: '',
      descricao: '',
      funcao: 'REVESTIMENTO',
    };
    aoMudar([...(camadas ?? []), nova]);
  }

  function duplicar(indice: number) {
    if (!camadas) return;
    const copia = { ...camadas[indice] };
    aoMudar([...camadas.slice(0, indice + 1), copia, ...camadas.slice(indice + 1)]);
  }

  async function excluir(indice: number) {
    if (!camadas) return;
    const c = camadas[indice];
    const ok = await confirm({
      title: 'Excluir esta camada?',
      message:
        `A parede vai de ${total} mm para ${total - c.espessuraMm} mm, e a face traçada ` +
        `fica onde está. Dá para desfazer com Ctrl+Z.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    const restantes = camadas.filter((_, i) => i !== indice);
    // Tirar a ÚLTIMA camada não deixa uma lista vazia — o kernel recusa isso
    // (`EMPTY_LAYERS`). O que ela significa é "esta parede voltou a ser
    // homogênea", e é isso que se manda.
    aoMudar(restantes.length === 0 ? null : restantes);
  }

  function mover(indice: number, direcao: -1 | 1) {
    if (!camadas) return;
    const destino = indice + direcao;
    if (destino < 0 || destino >= camadas.length) return;
    aoMudar(arrayMove(camadas, indice, destino));
  }

  function aoSoltar(evento: DragEndEvent) {
    if (!camadas) return;
    const { active, over } = evento;
    if (!over || active.id === over.id) return;
    const de = ids.indexOf(String(active.id));
    const para = ids.indexOf(String(over.id));
    if (de < 0 || para < 0) return;
    aoMudar(arrayMove(camadas, de, para));
  }

  async function voltarAHomogenea() {
    const ok = await confirm({
      title: 'Voltar a parede homogênea?',
      message:
        `A composição é descartada e a parede fica com os ${total} mm que tem agora. ` +
        `O quantitativo volta a medir um volume de alvenaria só, sem separar material.`,
      variant: 'warning',
      confirmLabel: 'Voltar a homogênea',
    });
    if (ok) aoMudar(null);
  }

  // ── Parede ainda homogênea ─────────────────────────────────────────────────
  if (!camadas) {
    return (
      <div className="mt-3 rounded-[10px] border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-slate-400" />
          <p className="text-xs font-semibold text-slate-500">Composição</p>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Parede homogênea de {parede.thicknessMm} mm. Em camadas, cada material ganha área e
          volume próprios no quantitativo — e a espessura passa a ser a soma delas.
        </p>
        <button
          type="button"
          onClick={() =>
            aoMudar([
              {
                espessuraMm: parede.thicknessMm,
                itemCode: '',
                descricao: '',
                funcao: 'VEDACAO',
              },
            ])
          }
          className="mt-2.5 flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95"
        >
          <Layers className="h-[15px] w-[15px]" />
          Dividir em camadas
        </button>
      </div>
    );
  }

  // ── Parede com composição ──────────────────────────────────────────────────
  return (
    <div className="mt-3 rounded-[10px] border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-slate-400" />
          <p className="text-xs font-semibold text-slate-500">
            Composição · {camadas.length} {camadas.length === 1 ? 'camada' : 'camadas'}
          </p>
        </div>
        <button
          type="button"
          onClick={adicionar}
          title="Acrescenta uma camada de 25 mm no fim da composição"
          className="flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95"
        >
          <Plus className="h-[15px] w-[15px]" />
          Camada
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-400">
        Da face esquerda para a direita, no sentido em que a parede foi desenhada.
      </p>

      {/* TIPOS SALVOS — aplicar e salvar. Fica no topo porque aplicar um tipo
          substitui a lista inteira: é a decisão que vem ANTES de mexer camada a
          camada, não depois. */}
      <div className="mt-2 flex items-center gap-1.5">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) aplicarTipo(e.target.value);
          }}
          disabled={tipos.length === 0}
          aria-label="Aplicar um tipo de parede salvo"
          title={
            tipos.length === 0
              ? 'Nenhum tipo salvo ainda nesta organização'
              : 'Substitui a composição desta parede pela do tipo escolhido'
          }
          className="h-8 min-w-0 flex-1 rounded-[6px] border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">
            {tipos.length === 0 ? 'Nenhum tipo salvo' : 'Aplicar tipo…'}
          </option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} ({somaDasCamadas(t.camadas)} mm)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setNomeDoTipo(`Parede ${total} mm`)}
          title="Guarda esta composição para reaplicar em outras paredes"
          className="h-8 shrink-0 rounded-[6px] border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600 active:scale-95"
        >
          Salvar tipo
        </button>
      </div>

      {nomeDoTipo !== null && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            autoFocus
            value={nomeDoTipo}
            onChange={(e) => setNomeDoTipo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void salvarComoTipo(nomeDoTipo);
              if (e.key === 'Escape') setNomeDoTipo(null);
            }}
            aria-label="Nome do tipo de parede"
            placeholder="Externa 190"
            className="h-8 min-w-0 flex-1 rounded-[6px] border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            type="button"
            onClick={() => void salvarComoTipo(nomeDoTipo)}
            disabled={!nomeDoTipo.trim()}
            className="h-8 shrink-0 rounded-[6px] bg-blue-600 px-2.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setNomeDoTipo(null)}
            className="h-8 shrink-0 px-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            Cancelar
          </button>
        </div>
      )}

      {avisoTipo && <p className="mt-1.5 text-[11px] text-emerald-700">{avisoTipo}</p>}

      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="mt-2 space-y-1.5">
            {camadas.map((camada, i) => (
              <LinhaDeCamada
                key={ids[i]}
                id={ids[i]}
                camada={camada}
                indice={i}
                total={camadas.length}
                medida={medidas[i] ?? null}
                onEspessura={(mm) => trocar(i, { espessuraMm: mm })}
                onFuncao={(funcao) => trocar(i, { funcao })}
                onEscolherItem={() => setEscolhendoItemDe(i)}
                onLimparItem={() => trocar(i, { itemCode: '', descricao: '' })}
                onDuplicar={() => duplicar(i)}
                onExcluir={() => excluir(i)}
                onMover={(d) => mover(i, d)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* O TOTAL, em leitura. Ver o cabeçalho: com composição a espessura é
          derivada, e um campo editável aqui prometeria o que o kernel recusa. */}
      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <span className="text-xs font-semibold text-slate-500">Espessura total</span>
        <span className="text-sm font-medium text-slate-800">
          {total} mm
          <span className="ml-1.5 text-[11px] font-normal text-slate-400">soma das camadas</span>
        </span>
      </div>

      <button
        type="button"
        onClick={voltarAHomogenea}
        className="mt-2 text-[11px] font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
      >
        Voltar a parede homogênea
      </button>

      <DatabasePickerModal
        isOpen={escolhendoItemDe !== null}
        onClose={() => setEscolhendoItemDe(null)}
        title="Material da camada"
        subtitle="SINAPI ou base própria. A unidade do item decide se a camada entra no orçamento por volume (m³) ou por área de face (m²)."
        onSelect={(item) => {
          if (escolhendoItemDe !== null) {
            trocar(escolhendoItemDe, { itemCode: item.code, descricao: item.description });
          }
          setEscolhendoItemDe(null);
        }}
      />

      {/* Modal de escolha de organização, exigido pela REGRA #5 quando o topo
          está em "Todas" e o usuário é membro de mais de uma. */}
      {orgTargetModal}
    </div>
  );
}

function LinhaDeCamada({
  id,
  camada,
  indice,
  total,
  medida,
  onEspessura,
  onFuncao,
  onEscolherItem,
  onLimparItem,
  onDuplicar,
  onExcluir,
  onMover,
}: {
  id: string;
  camada: CamadaParede;
  indice: number;
  total: number;
  medida: QuantidadeCamada | null;
  onEspessura: (mm: number) => void;
  onFuncao: (funcao: FuncaoCamada) => void;
  onEscolherItem: () => void;
  onLimparItem: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
  onMover: (direcao: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const estilo: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={estilo}
      className="rounded-[6px] border border-slate-200 bg-white p-2"
    >
      {/* TRÊS FAIXAS, e não uma linha só.
          O painel da parede tem ~270 px no app real (conferido em 01/09/2026
          com a sidebar aberta, `<main>` a 1340 px). Numa linha única, o campo de
          espessura era EMPURRADO PARA FORA da borda: sobrava um "mm" cortado, e
          a medida — que é o campo mais editado desta tela — ficava inalcançável.
          Nenhum harness pegou isso, porque harness não tem sidebar. */}

      {/* Faixa 1 — identidade e ações: alça, cor, função, mover, duplicar, excluir. */}
      <div className="flex items-center gap-1">
        {/* Alça DEDICADA, não a linha inteira: a linha tem campos que se arrasta
            para selecionar texto, e um arraste de seleção virando reordenação é
            o defeito clássico dessa combinação. Mesmo padrão de `BudgetRow`. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Arrastar para reordenar"
          className="shrink-0 cursor-grab text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Amostra da cor — a mesma do desenho, para a lista e a planta se
            lerem juntas. Quadrado com borda, não pílula (§8). */}
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-slate-300"
          style={{ backgroundColor: COR_FUNCAO[camada.funcao] }}
        />

        <select
          value={camada.funcao}
          onChange={(e) => onFuncao(e.target.value as FuncaoCamada)}
          aria-label={`Função da camada ${indice + 1}`}
          className="h-8 min-w-0 flex-1 rounded-[6px] border border-slate-200 bg-white px-1.5 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {FUNCOES.map((f) => (
            <option key={f.valor} value={f.valor} title={f.ajuda}>
              {f.rotulo}
            </option>
          ))}
        </select>

        {/* AÇÕES — sempre visíveis (§9), nunca em hover. */}
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onMover(-1)}
            disabled={indice === 0}
            title="Mover para fora (uma posição acima)"
            aria-label={`Mover camada ${indice + 1} para cima`}
            className="rounded-[4px] p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            disabled={indice === total - 1}
            title="Mover para dentro (uma posição abaixo)"
            aria-label={`Mover camada ${indice + 1} para baixo`}
            className="rounded-[4px] p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <ActionIconButton kind="duplicate" size="sm" onClick={onDuplicar} />
        <ActionIconButton kind="delete" size="sm" onClick={onExcluir} />
      </div>

      {/* Faixa 2 — a medida: espessura editável à esquerda, o que ela dá à direita. */}
      <div className="mt-1 flex items-center justify-between gap-2 pl-5 [&>label]:mt-0">
        <CampoMedida
          rotulo=""
          valor={camada.espessuraMm}
          casas={0}
          sufixo="mm"
          chave={`${id}:${camada.espessuraMm}`}
          aoAplicar={(mm) => onEspessura(Math.round(mm))}
          ariaLabel={`Espessura da camada ${indice + 1}, em milímetros`}
        />
        {/* O QUE ESTA CAMADA DÁ. Sem isto, escolher espessura é chute: o número
            que interessa (quanto de material) só apareceria na aba de
            quantitativos, longe de onde a decisão é tomada. */}
        {medida && (
          <p className="min-w-0 truncate text-right text-[11px] text-slate-500">
            {medida.volumeM3.toFixed(3).replace('.', ',')} m³
            <span className="text-slate-400"> · {medida.areaFaceM2.toFixed(2).replace('.', ',')} m²</span>
          </p>
        )}
      </div>

      {/* Faixa 3 — o material, com a largura inteira do painel: é o campo com o
          texto mais longo (código + descrição do SINAPI), e espremê-lo ao lado
          de outra coisa devolve "Escolher ma…". */}
      <div className="mt-1 flex items-center gap-1.5 pl-5">
        <button
          type="button"
          onClick={onEscolherItem}
          title={
            camada.itemCode
              ? `Trocar o material (hoje: ${camada.itemCode} · ${camada.descricao})`
              : 'Escolher o item no catálogo SINAPI ou na base própria'
          }
          className={`flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] border px-2 text-left text-sm transition-all ${
            camada.itemCode
              ? 'border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-300'
              : 'border-dashed border-slate-300 bg-white text-slate-400 hover:border-blue-300 hover:text-blue-600'
          }`}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          {/* `block truncate` — sem o `block`, `truncate` não faz nada em
              elemento inline e o texto atravessa a borda (§6.1.2 do guia). */}
          <span className="block truncate" title={camada.descricao || undefined}>
            {camada.itemCode
              ? `${camada.itemCode} · ${camada.descricao || 'sem descrição'}`
              : 'Escolher material…'}
          </span>
        </button>
        {camada.itemCode && (
          <button
            type="button"
            onClick={onLimparItem}
            title="Desvincular o material (a camada continua no desenho)"
            className="shrink-0 px-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            limpar
          </button>
        )}
      </div>
    </li>
  );
}

export { ROTULO_FUNCAO };
