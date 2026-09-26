// hooks/useBlueprintReurb.ts
//
// REURB (A5): os ocupantes de cada lote, lidos do Empreendimento ligado só
// quando o relatório abre. Os dados do núcleo moram em
// `useBlueprintRegularizacao` (tabela `blueprint_study_regularizacao`).

import { useCallback, useEffect, useState } from 'react';
import { blueprintReurbService } from '../services/blueprintReurbService';
import type { OcupantesNoPainel } from '../components/blueprint/PainelReurb';

export function useBlueprintReurb(studyId: string, ativo: boolean) {
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

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { ocupantes, recarregar };
}
