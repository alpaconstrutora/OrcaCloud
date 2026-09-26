import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintRegularizacaoService, type DadosDoCar } from '../services/blueprintRegularizacaoService';
import type { DadosDaReurb } from '../utils/blueprintReurb';
import type { BiomaDaReservaLegal } from '../utils/blueprintCar';

/**
 * Dados da REURB e do CAR de um estudo, gravados em
 * `blueprint_study_regularizacao` (antes da migration 20270926000050 ficavam
 * no navegador). Mesmo desenho do `useBlueprintSigef`: estado local que
 * responde na hora, gravação com respiro, e degradação sem a tabela (fica só
 * nesta aba, e a tela diz).
 *
 * ADOÇÃO: o que a A5 deixou no localStorage (`blueprint:reurb:<estudo>`,
 * `blueprint:carBioma:<estudo>`) vale quando o banco ainda não tem a coluna —
 * é gravado no banco e só então apagado do navegador.
 */
export type EstadoDaGravacao = 'CARREGANDO' | 'SALVO' | 'SALVANDO' | 'INDISPONIVEL';

export interface RegularizacaoNoEditor {
  reurb: DadosDaReurb;
  alterarReurb: (patch: Partial<DadosDaReurb>) => void;
  bioma: BiomaDaReservaLegal;
  alterarBioma: (b: BiomaDaReservaLegal) => void;
  estado: EstadoDaGravacao;
}

export const chaveAntigaDaReurb = (studyId: string) => `blueprint:reurb:${studyId}`;
export const chaveAntigaDoBioma = (studyId: string) => `blueprint:carBioma:${studyId}`;

function lerAntigo<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}

function apagarAntigo(chave: string) {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* navegador sem storage: nada a apagar */
  }
}

const vazio = (o: object | null | undefined) => !o || Object.keys(o).length === 0;

export function useBlueprintRegularizacao(studyId: string, organizationId: string, nomePadrao: string): RegularizacaoNoEditor {
  const padrao: DadosDaReurb = { nome: nomePadrao, modalidade: 'REURB-S' };
  const [reurb, setReurb] = useState<DadosDaReurb>(padrao);
  const [bioma, setBioma] = useState<BiomaDaReservaLegal>('DEMAIS_REGIOES');
  const [estado, setEstado] = useState<EstadoDaGravacao>('CARREGANDO');
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indisponivel = useRef(false);

  const falhou = useCallback((e: unknown) => {
    console.warn('[regularizacao] sem persistência:', e);
    indisponivel.current = true;
    setEstado('INDISPONIVEL');
  }, []);

  useEffect(() => {
    let vivo = true;
    indisponivel.current = false;
    setEstado('CARREGANDO');
    (async () => {
      try {
        const lida = await blueprintRegularizacaoService.get(studyId);
        if (!vivo) return;
        const antigaReurb = lerAntigo<DadosDaReurb>(chaveAntigaDaReurb(studyId));
        const antigoBioma = lerAntigo<BiomaDaReservaLegal>(chaveAntigaDoBioma(studyId));
        const reurbFinal: DadosDaReurb = !vazio(lida?.reurb) ? { ...padrao, ...lida!.reurb } : antigaReurb ? { ...padrao, ...antigaReurb } : padrao;
        const biomaFinal: BiomaDaReservaLegal = lida?.car?.bioma ?? antigoBioma ?? 'DEMAIS_REGIOES';
        setReurb(reurbFinal);
        setBioma(biomaFinal);
        // Adoção: o banco não tinha, o navegador tinha → grava e só então apaga.
        if (vazio(lida?.reurb) && antigaReurb) {
          await blueprintRegularizacaoService.salvarReurb(studyId, organizationId, reurbFinal);
          apagarAntigo(chaveAntigaDaReurb(studyId));
        }
        if (!lida?.car?.bioma && antigoBioma) {
          await blueprintRegularizacaoService.salvarCar(studyId, organizationId, { ...(lida?.car ?? {}), bioma: antigoBioma });
          apagarAntigo(chaveAntigaDoBioma(studyId));
        }
        if (vivo) setEstado('SALVO');
      } catch (e) {
        if (vivo) falhou(e);
      }
    })();
    return () => {
      vivo = false;
    };
    // `padrao` deriva de `nomePadrao`; recarregar só quando o estudo troca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, organizationId]);

  const alterarReurb = useCallback(
    (patch: Partial<DadosDaReurb>) => {
      setReurb((atual) => {
        const proxima = { ...atual, ...patch };
        if (!indisponivel.current) {
          setEstado('SALVANDO');
          if (gravacao.current) clearTimeout(gravacao.current);
          gravacao.current = setTimeout(() => {
            blueprintRegularizacaoService
              .salvarReurb(studyId, organizationId, proxima)
              .then(() => setEstado('SALVO'))
              .catch(falhou);
          }, 600);
        }
        return proxima;
      });
    },
    [studyId, organizationId, falhou],
  );

  const alterarBioma = useCallback(
    (b: BiomaDaReservaLegal) => {
      setBioma(b);
      if (indisponivel.current) return;
      setEstado('SALVANDO');
      const car: DadosDoCar = { bioma: b };
      blueprintRegularizacaoService
        .salvarCar(studyId, organizationId, car)
        .then(() => setEstado('SALVO'))
        .catch(falhou);
    },
    [studyId, organizationId, falhou],
  );

  return { reurb, alterarReurb, bioma, alterarBioma, estado };
}

