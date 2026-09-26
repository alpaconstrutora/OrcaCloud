// hooks/useBlueprintReurb.ts
//
// REURB (A5): os dados do núcleo (neste navegador, por estudo — são os campos
// do cabeçalho das peças, não cadastro) e os ocupantes de cada lote, lidos do
// Empreendimento ligado só quando o relatório abre.

import { useCallback, useEffect, useState } from 'react';
import { usePersistedState } from '../components/ui/TableUtils';
import { blueprintReurbService } from '../services/blueprintReurbService';
import type { DadosDaReurb } from '../utils/blueprintReurb';
import type { OcupantesNoPainel } from '../components/blueprint/PainelReurb';

export function useBlueprintReurb(studyId: string, nomePadrao: string, ativo: boolean) {
  const [dados, setDados] = usePersistedState<DadosDaReurb>(`blueprint:reurb:${studyId}`, { nome: nomePadrao, modalidade: 'REURB-S' });
  const [ocupantes, setOcupantes] = useState<OcupantesNoPainel>({ estado: 'CARREGANDO', empreendimento: null, lotesComUnidade: 0, porLoteUid: {} });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    setOcupantes((o) => ({ ...o, estado: 'CARREGANDO', erro: null }));
    blueprintReurbService
      .ocupantesDoEstudo(studyId)
      .then((r) => {
        if (vivo) setOcupantes({ estado: 'PRONTO', ...r });
      })
      .catch((e) => {
        if (vivo) setOcupantes({ estado: 'ERRO', erro: e instanceof Error ? e.message : String(e), empreendimento: null, lotesComUnidade: 0, porLoteUid: {} });
      });
    return () => {
      vivo = false;
    };
  }, [studyId, ativo, versao]);

  const atualizarDados = useCallback((patch: Partial<DadosDaReurb>) => setDados((d) => ({ ...d, ...patch })), [setDados]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, atualizarDados, ocupantes, recarregar };
}
