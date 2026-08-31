// hooks/useBlueprintEditor.ts
//
// Estado do editor de plantas (épico E3).
//
// Separa três coisas que costumam virar uma só e depois não se desemaranham:
//
//   • MODELO   — geometria canônica, só o kernel altera, sempre por comando.
//   • HISTÓRICO— pilha de estados para desfazer/refazer.
//   • RASCUNHO — o que está gravado no banco. Nem todo estado do histórico vira
//                rascunho: o autosave é debounced, senão cada gesto viraria uma
//                escrita.
//
// ADR-01 do PRD: o renderer não é o modelo. O canvas emite intenção
// ("adicionar parede daqui até ali"); quem valida e transforma é o kernel.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KERNEL_VERSION,
  KernelError,
  ModelHistory,
  type BlueprintModel,
  type Command,
  applyCommand,
  emptyModel,
  snapshotHash,
} from '../utils/blueprintKernel';
import {
  getBranch,
  loadBranchModel,
  getSnapshotIdentity,
  publishSnapshot,
  saveDraft,
} from '../services/blueprintService';
import { BlueprintRevisionConflict } from '../types/blueprint';

/** Intervalo do autosave. RNF-004 exige reconhecimento em até 2 s. */
const AUTOSAVE_MS = 1500;

export type BlueprintTool =
  | 'selecionar'
  | 'parede'
  /** Contorno fechado de N lados iguais, criado num gesto só. */
  | 'poligono'
  /** Retângulo pelos dois cantos opostos — o gesto de fazer um cômodo. */
  | 'retangulo'
  | 'abertura'
  /**
   * Juntar duas pontas soltas num canto. NÃO desenha: leva cada ponta ao
   * cruzamento dos próprios eixos, movendo vértice. Por isso não tem prévia de
   * parede nova nem espessura própria — nada nasce, duas pontas se encontram.
   */
  | 'juntar'
  | 'calibrar'
  /** Formas MEDIDAS — afirmadas à mão, não derivadas do arranjo planar. */
  | 'medir-area'
  | 'medir-linha'
  | 'contar'
  /**
   * Contorno do LOTE. Os dois desenham limites (`Boundary`), não paredes — lote
   * é divisa jurídica, não construção, e não pode virar linha de alvenaria no
   * orçamento. A diferença entre eles é só o gesto e a prévia: `terreno` mostra
   * o lado de fechamento e a área se formando; `divisa` mostra só o lado em
   * curso. Os dois fecham voltando ao primeiro vértice.
   */
  | 'terreno'
  | 'divisa'
  /**
   * ESTRUTURA — pilar, viga, laje, estaca, bloco de coroamento, viga de
   * fundação.
   *
   * UM valor para os seis, e não seis valores. O tipo escolhido é estado da
   * BARRA (`tipoEstrutural` em `BlueprintEditor`), exatamente como
   * `tipoAbertura` já é para porta/janela/vão livre/correr — que também são
   * quatro coisas atrás de uma ferramenta só. Seis valores aqui obrigariam todo
   * `switch` de gesto no canvas a enumerá-los, e o sétimo tipo nasceria faltando
   * em metade deles.
   *
   * O gesto muda com a FORMA, não com o tipo: um clique no `PONTO`, dois na
   * `LINHA`, contorno que fecha na `AREA` — e a forma sai de `FORMA_ESTRUTURAL`,
   * que é fonte única.
   */
  | 'estrutural';

export type SaveState = 'limpo' | 'pendente' | 'salvando' | 'salvo' | 'erro';

export interface UseBlueprintEditor {
  model: BlueprintModel;
  loading: boolean;
  tool: BlueprintTool;
  setTool: (t: BlueprintTool) => void;
  /**
   * A seleção. Guarda ids HETEROGÊNEOS: parede, abertura ou medição — quem
   * consome desambigua por lookup, como sempre foi.
   */
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  /**
   * A seleção quando ela tem exatamente UM item; `null` caso contrário.
   *
   * Derivado, não estado. É o que mantém intactas as operações de cardinalidade
   * 1 — painel da parede, dividir, unir, espessura, esticar: todas continuam
   * lendo um id só, e com N selecionados simplesmente somem da tela, em vez de
   * agirem sobre um item arbitrário do conjunto.
   */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  /** Aplica um comando. Devolve os ids CRIADOS — vazio se o kernel recusou. */
  run: (command: Command) => string[];
  /** Vários comandos, UM passo de histórico. Devolve os ids criados no lote. */
  runBatch: (commands: Command[]) => string[];
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  saveState: SaveState;
  lastError: string | null;
  /** `true` quando o erro atual é conflito de revisão — a UI oferece recarregar. */
  hasConflict: boolean;
  clearError: () => void;
  reload: () => void;

  baseRevision: number;
  publishing: boolean;
  publish: (notes?: string) => Promise<void>;
  publishedHash: string | null;
  /** `true` quando há mudança não publicada em relação ao último snapshot. */
  dirtySincePublish: boolean;
}

export function useBlueprintEditor(branchId: string | null): UseBlueprintEditor {
  const historyRef = useRef<ModelHistory>(new ModelHistory(emptyModel()));
  const [model, setModel] = useState<BlueprintModel>(historyRef.current.current);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<BlueprintTool>('parede');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);

  const [saveState, setSaveState] = useState<SaveState>('limpo');
  const [lastError, setLastError] = useState<string | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishedHash, setPublishedHash] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const [, force] = useState(0);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Carregar ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!branchId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [carregado, branch] = await Promise.all([
          loadBranchModel(branchId),
          getBranch(branchId),
        ]);
        if (cancelado) return;

        // A referência do "já publicado" é o hash do SNAPSHOT, buscado do banco.
        //
        // DEFEITO REAL, encontrado em uso: aqui estava `snapshotHash(inicial)`,
        // e `inicial` é o RASCUNHO. O editor comparava o desenho consigo mesmo,
        // concluía "sem alterações" e DESABILITAVA o botão Publicar — deixando
        // o usuário sem nenhuma forma de publicar o que tinha desenhado, e ainda
        // afirmando que já estava publicado. Três paredes ficaram presas no
        // rascunho por causa desta linha.
        const publicado = branch?.parent_snapshot_id
          ? await getSnapshotIdentity(branch.parent_snapshot_id)
          : null;
        if (cancelado) return;

        // Planta sem nivel nao aceita parede — o kernel recusa. Criar o padrao
        // aqui, ANTES do historico existir, e o que impede que ele vire um passo
        // desfazivel: o usuario nunca pediu esse nivel, entao desfaze-lo nao faz
        // sentido. Quando isso era um comando, "Desfazer" numa planta nova
        // apagava o nivel, `levelId` virava nulo e desenhar parede passava a nao
        // fazer NADA, em silencio.
        let inicial = carregado ?? emptyModel();
        if (inicial.levels.length === 0) {
          inicial = applyCommand(inicial, {
            type: 'AddLevel',
            name: 'Térreo',
            elevationMm: 0,
            defaultHeightMm: 2800,
          }).model;
        }
        historyRef.current = new ModelHistory(inicial);
        setModel(inicial);
        setBaseRevision(branch?.base_revision ?? 0);
        // Kernel diferente = hash INCOMPARÁVEL. O payload canônico mudou de
        // formato entre versões do kernel, então o hash gravado sob 0.2.0 nunca
        // vai bater com o que o 0.3.0 calcula, mesmo para a mesma geometria.
        //
        // Nesse caso o certo é `null` — "não sei se está publicado" — que deixa
        // o botão Publicar HABILITADO. Errar para o lado de oferecer publicar é
        // recuperável; errar para o lado de esconder o botão prende o trabalho
        // do usuário, que foi o defeito que isto corrige.
        setPublishedHash(
          publicado && publicado.kernel_version === KERNEL_VERSION ? publicado.hash : null,
        );
        setSaveState('limpo');
        setHasConflict(false);
      } catch (e) {
        if (!cancelado) setLastError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [branchId, recarga]);

  // ── Autosave ──────────────────────────────────────────────────────────────
  const agendarAutosave = useCallback(
    (atual: BlueprintModel) => {
      if (!branchId) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

      setSaveState('pendente');
      autosaveTimer.current = setTimeout(async () => {
        setSaveState('salvando');
        try {
          await saveDraft(branchId, atual);
          setSaveState('salvo');
        } catch (e) {
          setSaveState('erro');
          setLastError(e instanceof Error ? e.message : String(e));
        }
      }, AUTOSAVE_MS);
    },
    [branchId],
  );

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

  // ── Comandos ──────────────────────────────────────────────────────────────
  //
  // O RETORNO É OS IDS CRIADOS, e isso não é conveniência.
  //
  // Quem precisa do id do que acabou de criar não pode ler `model` depois de
  // chamar: `model` é estado de React e, dentro do mesmo tratador de evento, ele
  // ainda é o modelo ANTERIOR. Foi assim que "fechar vão com porta" ficou sem
  // porta — a parede era criada, a leitura seguinte devolvia `undefined` e o
  // comando da abertura simplesmente não acontecia, sem erro nenhum na tela.
  const aplicar = useCallback(
    (executar: () => { model: BlueprintModel; diff: { created: string[] } }): string[] => {
      try {
        const resultado = executar();
        setModel(resultado.model);
        setLastError(null);
        agendarAutosave(resultado.model);
        force((n) => n + 1);
        return resultado.diff.created;
      } catch (e) {
        // KernelError é recusa esperada (parede degenerada, abertura fora da
        // parede). Vira mensagem, não quebra a tela.
        setLastError(
          e instanceof KernelError ? e.message : e instanceof Error ? e.message : String(e),
        );
        force((n) => n + 1);
        return [];
      }
    },
    [agendarAutosave],
  );

  const run = useCallback(
    (command: Command) => aplicar(() => historyRef.current.apply(command)),
    [aplicar],
  );

  const runBatch = useCallback(
    (commands: Command[]) =>
      commands.length === 0 ? [] : aplicar(() => historyRef.current.applyMany(commands)),
    [aplicar],
  );

  const undo = useCallback(() => {
    if (!historyRef.current.canUndo) return;
    const atual = historyRef.current.undo();
    setModel(atual);
    setSelectedIds([]);
    agendarAutosave(atual);
    force((n) => n + 1);
  }, [agendarAutosave]);

  const redo = useCallback(() => {
    if (!historyRef.current.canRedo) return;
    const atual = historyRef.current.redo();
    setModel(atual);
    setSelectedIds([]);
    agendarAutosave(atual);
    force((n) => n + 1);
  }, [agendarAutosave]);

  // ── Publicar ──────────────────────────────────────────────────────────────
  const publish = useCallback(
    async (notes?: string) => {
      if (!branchId) return;
      setPublishing(true);
      setLastError(null);

      // Escrever o rascunho antes de publicar evita perder o que ainda estava
      // no debounce se a publicação falhar.
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

      try {
        await saveDraft(branchId, model);
        await publishSnapshot({ branchId, baseRevision, model, notes });

        const branch = await getBranch(branchId);
        setBaseRevision(branch?.base_revision ?? baseRevision + 1);
        setPublishedHash(snapshotHash(model));
        setSaveState('salvo');
      } catch (e) {
        if (e instanceof BlueprintRevisionConflict) {
          setHasConflict(true);
          setLastError(
            `${e.message} Outra pessoa publicou neste estudo enquanto você editava.`,
          );
        } else {
          setLastError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setPublishing(false);
      }
    },
    [branchId, baseRevision, model],
  );

  const hashAtual = model.walls.length || model.boundaries.length ? snapshotHash(model) : null;

  return {
    model,
    loading,
    tool,
    setTool,
    selectedIds,
    setSelectedIds,
    selectedId,
    setSelectedId,
    run,
    runBatch,
    undo,
    redo,
    canUndo: historyRef.current.canUndo,
    canRedo: historyRef.current.canRedo,
    saveState,
    lastError,
    hasConflict,
    clearError: () => {
      setLastError(null);
      setHasConflict(false);
    },
    // Recarrega do banco. Descarta o que estava em edição — por isso a UI só
    // oferece isso no conflito, onde continuar editando por cima do desatualizado
    // é que seria o caminho perigoso.
    reload: () => {
      setHasConflict(false);
      setLastError(null);
      setRecarga((n) => n + 1);
    },
    baseRevision,
    publishing,
    publish,
    publishedHash,
    dirtySincePublish: hashAtual !== null && hashAtual !== publishedHash,
  };
}
