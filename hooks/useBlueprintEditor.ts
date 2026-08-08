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
  KernelError,
  ModelHistory,
  type BlueprintModel,
  type Command,
  emptyModel,
  snapshotHash,
} from '../utils/blueprintKernel';
import {
  getBranch,
  loadBranchModel,
  publishSnapshot,
  saveDraft,
} from '../services/blueprintService';
import { BlueprintRevisionConflict } from '../types/blueprint';

/** Intervalo do autosave. RNF-004 exige reconhecimento em até 2 s. */
const AUTOSAVE_MS = 1500;

export type BlueprintTool = 'selecionar' | 'parede';

export type SaveState = 'limpo' | 'pendente' | 'salvando' | 'salvo' | 'erro';

export interface UseBlueprintEditor {
  model: BlueprintModel;
  loading: boolean;
  tool: BlueprintTool;
  setTool: (t: BlueprintTool) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  run: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  saveState: SaveState;
  lastError: string | null;
  clearError: () => void;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>('limpo');
  const [lastError, setLastError] = useState<string | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishedHash, setPublishedHash] = useState<string | null>(null);

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

        const inicial = carregado ?? emptyModel();
        historyRef.current = new ModelHistory(inicial);
        setModel(inicial);
        setBaseRevision(branch?.base_revision ?? 0);
        // Se o ramo já publicou, o hash do snapshot é a referência do "limpo".
        setPublishedHash(branch?.parent_snapshot_id ? snapshotHash(inicial) : null);
        setSaveState('limpo');
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
  }, [branchId]);

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
  const run = useCallback(
    (command: Command) => {
      try {
        const resultado = historyRef.current.apply(command);
        setModel(resultado.model);
        setLastError(null);
        agendarAutosave(resultado.model);
      } catch (e) {
        // KernelError é recusa esperada (parede degenerada, abertura fora da
        // parede). Vira mensagem, não quebra a tela.
        setLastError(
          e instanceof KernelError ? e.message : e instanceof Error ? e.message : String(e),
        );
      }
      force((n) => n + 1);
    },
    [agendarAutosave],
  );

  const undo = useCallback(() => {
    if (!historyRef.current.canUndo) return;
    const atual = historyRef.current.undo();
    setModel(atual);
    setSelectedId(null);
    agendarAutosave(atual);
    force((n) => n + 1);
  }, [agendarAutosave]);

  const redo = useCallback(() => {
    if (!historyRef.current.canRedo) return;
    const atual = historyRef.current.redo();
    setModel(atual);
    setSelectedId(null);
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
    selectedId,
    setSelectedId,
    run,
    undo,
    redo,
    canUndo: historyRef.current.canUndo,
    canRedo: historyRef.current.canRedo,
    saveState,
    lastError,
    clearError: () => setLastError(null),
    baseRevision,
    publishing,
    publish,
    publishedHash,
    dirtySincePublish: hashAtual !== null && hashAtual !== publishedHash,
  };
}
