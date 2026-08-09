import { useCallback, useEffect, useState } from 'react';
import {
  formaDaLinha,
  lancamentosDeMedicao,
  listarMedicoes,
  regravarPontos,
  removerMedicao,
  salvarMedicao,
  type MedicaoRow,
} from '../services/blueprintMedicaoService';
import { resolverItens } from '../services/blueprintBudgetService';
import { aplicarNoProjeto } from '../services/blueprintBudgetService';
import {
  formaValida,
  transformarPorRecalibracao,
  type FormaMedida,
  type TipoMedida,
} from '../utils/blueprintMedicoes';
import type { Underlay } from '../utils/blueprintUnderlay';
import type { Point } from '../utils/blueprintKernel';

const CORES = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#dc2626'];

/**
 * Estado das formas medidas de um nível.
 *
 * Separado do editor, como a planta de fundo: medição NÃO é geometria e não
 * entra no histórico de desfazer do desenho. Misturar faria "Desfazer" apagar um
 * levantamento — e o levantamento é justamente o que não se recupera sozinho,
 * porque não é derivado de nada.
 */
export function useBlueprintMedicoes(
  studyId: string,
  organizationId: string,
  levelId: string | null,
  /** Prancha ativa: a forma nasce ligada a ela, e o filtro se apoia nisso. */
  underlayId: string | null,
  /** Camada em que as formas novas nascem. */
  camada = 'Geral',
) {
  const [linhas, setLinhas] = useState<MedicaoRow[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const formas: FormaMedida[] = linhas.map(formaDaLinha);

  const recarregar = useCallback(async () => {
    try {
      setLinhas(await listarMedicoes(studyId, levelId));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [studyId, levelId]);

  useEffect(() => {
    if (studyId) void recarregar();
  }, [studyId, recarregar]);

  const criar = useCallback(
    async (tipo: TipoMedida, pontos: Point[]) => {
      const nova: FormaMedida = {
        id: 'nova',
        tipo,
        pontos,
        nome: '',
        itemCode: null,
        underlayId,
        camada,
        cor: CORES[linhas.length % CORES.length],
      };
      // Forma degenerada é recusada AQUI, antes de virar linha no banco: uma
      // medição de zero fica na lista e alguém vai tentar entender de onde veio.
      if (!formaValida(nova)) return;

      setOcupado(true);
      try {
        const salva = await salvarMedicao({
          study_id: studyId,
          organization_id: organizationId,
          level_id: levelId,
          forma: nova,
        });
        // §22 do guia: atualiza o array local, sem recarregar a lista inteira.
        setLinhas((atual) => [...atual, salva]);
        setSelecionada(salva.id);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(false);
      }
    },
    [studyId, organizationId, levelId, linhas.length],
  );

  const atualizar = useCallback(
    async (
      id: string,
      campos: Partial<
        Pick<FormaMedida, 'nome' | 'itemCode' | 'itemNome' | 'itemPreco' | 'camada'>
      >,
    ) => {
      const linha = linhas.find((l) => l.id === id);
      if (!linha) return;

      // Otimista: digitar nome não pode piscar a lista a cada tecla.
      setLinhas((atual) =>
        atual.map((l) =>
          l.id === id
            ? {
                ...l,
                nome: campos.nome ?? l.nome,
                item_code: campos.itemCode !== undefined ? campos.itemCode : l.item_code,
                item_nome: campos.itemNome !== undefined ? campos.itemNome : l.item_nome,
                item_preco: campos.itemPreco !== undefined ? campos.itemPreco : l.item_preco,
                camada: campos.camada ?? l.camada,
              }
            : l,
        ),
      );

      try {
        await salvarMedicao({
          id,
          study_id: linha.study_id,
          organization_id: linha.organization_id,
          level_id: linha.level_id,
          forma: { ...formaDaLinha(linha), ...campos },
        });
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
        void recarregar();
      }
    },
    [linhas, recarregar],
  );

  const remover = useCallback(async (id: string) => {
    setOcupado(true);
    try {
      await removerMedicao(id);
      setLinhas((atual) => atual.filter((l) => l.id !== id));
      setSelecionada((s) => (s === id ? null : s));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }, []);

  /**
   * Reposiciona TODAS as formas quando a planta de fundo é recalibrada.
   *
   * Sem isto, corrigir a escala deixa cada contorno flutuando fora do que foi
   * traçado, e o número medido vira ficção — sem nada na tela denunciando.
   */
  const reposicionar = useCallback(
    async (antes: Underlay, depois: Underlay, prancha: string | null) => {
      // SÓ as formas daquela prancha. Antes de haver várias, transformar tudo
      // era inofensivo; agora recalibrar a cobertura moveria o que foi traçado
      // no térreo — em coordenadas que só fazem sentido sob a outra aferição.
      const alvo = linhas.filter((l) => l.underlay_id === prancha);
      if (alvo.length === 0) return;
      setOcupado(true);
      try {
        const movidas = transformarPorRecalibracao(alvo.map(formaDaLinha), antes, depois);
        await regravarPontos(movidas.map((f) => ({ id: f.id, pontos: f.pontos })));
        setLinhas((atual) =>
          atual.map((l) => ({
            ...l,
            pontos: movidas.find((m) => m.id === l.id)?.pontos ?? l.pontos,
          })),
        );
        setAviso(`${movidas.length} medição(ões) reposicionada(s) pela nova escala.`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(false);
      }
    },
    [linhas],
  );

  const enviarAoOrcamento = useCallback(
    async (
      projectId: string | null,
      studyName: string,
      underlaySha256: string | null,
      mmPorPixel: number | null,
    ) => {
      if (!projectId) {
        setErro('Esta planta não está vinculada a uma obra — não há orçamento onde aplicar.');
        return;
      }
      setOcupado(true);
      setErro(null);
      setAviso(null);
      try {
        const codigos = formas.map((f) => f.itemCode).filter((c): c is string => !!c);
        const itens = await resolverItens(codigos);

        const { entries, semCatalogo } = lancamentosDeMedicao(formas, itens, {
          studyId,
          studyName,
          underlaySha256,
          mmPorPixel,
        });

        if (entries.length === 0) {
          setErro('Nenhuma medição pronta para o orçamento: ligue um item de catálogo ou informe nome e preço.');
          return;
        }

        const r = await aplicarNoProjeto(projectId, entries, {
          studyId,
          studyName,
          snapshotId: '',
          snapshotHash: underlaySha256 ?? '',
          revision: 0,
        });

        setAviso(
          `${r.adicionadas} linha(s) no orçamento` +
            (r.removidas > 0 ? `, substituindo ${r.removidas} desta planta.` : '.') +
            (semCatalogo.length > 0
              ? ` ${semCatalogo.length} medição(ões) com código inexistente no catálogo ficaram de fora.`
              : ''),
        );
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(false);
      }
    },
    [formas, studyId],
  );

  return {
    formas,
    selecionada,
    setSelecionada,
    ocupado,
    erro,
    aviso,
    criar,
    atualizar,
    remover,
    reposicionar,
    enviarAoOrcamento,
  };
}
