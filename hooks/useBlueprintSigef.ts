import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintSigefService } from '../services/blueprintSigefService';
import { IDENTIFICACAO_VAZIA, type IdentificacaoSigef } from '../utils/geo/sigef';

/**
 * A identificação SIGEF do imóvel (A4): uma linha por estudo em
 * `blueprint_study_sigef`. Mesmo desenho dos outros hooks de premissa: estado
 * local que responde na hora, gravação com respiro, e degradação sem a
 * migration (fica só nesta aba, e a tela diz).
 */
export interface SigefDoEstudo {
  identificacao: IdentificacaoSigef;
  alterar: (patch: Partial<IdentificacaoSigef>) => void;
  estado: 'CARREGANDO' | 'SALVO' | 'SALVANDO' | 'INDISPONIVEL';
}


export function useBlueprintSigef(studyId: string, organizationId: string): SigefDoEstudo {
  const [identificacao, setIdentificacao] = useState<IdentificacaoSigef>(IDENTIFICACAO_VAZIA);
  const [estado, setEstado] = useState<SigefDoEstudo['estado']>('CARREGANDO');
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indisponivel = useRef(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lida = await blueprintSigefService.get(studyId);
        if (!vivo) return;
        if (lida) setIdentificacao(lida);
        setEstado('SALVO');
      } catch (e) {
        if (!vivo) return;
        indisponivel.current = true;
        setEstado('INDISPONIVEL');
        console.warn('[sigef] identificação sem persistência:', e);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  const alterar = useCallback(
    (patch: Partial<IdentificacaoSigef>) => {
      setIdentificacao((atual) => {
        const proxima = { ...atual, ...patch };
        if (!indisponivel.current) {
          setEstado('SALVANDO');
          if (gravacao.current) clearTimeout(gravacao.current);
          gravacao.current = setTimeout(() => {
            blueprintSigefService
              .save(studyId, organizationId, proxima)
              .then(() => setEstado('SALVO'))
              .catch((e) => {
                console.warn('[sigef] não gravou:', e);
                indisponivel.current = true;
                setEstado('INDISPONIVEL');
              });
          }, 600);
        }
        return proxima;
      });
    },
    [studyId, organizationId],
  );

  return { identificacao, alterar, estado };
}
