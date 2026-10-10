import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintReferenciasService } from '../services/blueprintReferenciasService';
import { chaveDasReferencias, lerReferencias, type ReferenciaExterna } from '../utils/blueprintReferenciaExterna';

/**
 * As REFERÊNCIAS EXTERNAS do 3D, no ESTUDO (10/10/2026, pendência da E10.4b).
 * Mesmo desenho de `useBlueprintClimatizacao`: estado local que responde na
 * hora, gravação atrás com respiro de 500 ms.
 *
 * A lista morava só no navegador de quem a montou (`blueprint:referenciasExternas:<estudo>`).
 * A passagem:
 *  - o estudo tem linha → vale a linha;
 *  - não tem → adota a lista que ESTE navegador já tinha e grava no estudo
 *    (quem montou primeiro não perde o que montou);
 *  - sem a tabela (migration ausente) → segue no navegador, como antes, e a tela diz.
 */
export interface ReferenciasDoEstudo {
  referencias: ReferenciaExterna[];
  setReferencias: (r: ReferenciaExterna[]) => void;
  carregando: boolean;
  /** `true` = a lista vale só neste navegador (a tabela não respondeu). */
  soNoNavegador: boolean;
}

function doNavegador(studyId: string): ReferenciaExterna[] {
  try {
    const bruto = localStorage.getItem(chaveDasReferencias(studyId));
    return bruto ? lerReferencias(JSON.parse(bruto)) : [];
  } catch {
    return [];
  }
}

function gravarNoNavegador(studyId: string, r: ReferenciaExterna[]) {
  try {
    localStorage.setItem(chaveDasReferencias(studyId), JSON.stringify(r));
  } catch {
    /* navegador sem armazenamento: vale só na sessão */
  }
}

export function useBlueprintReferencias(studyId: string, organizationId: string): ReferenciasDoEstudo {
  const [referencias, setLocal] = useState<ReferenciaExterna[]>(() => doNavegador(studyId));
  const [carregando, setCarregando] = useState(true);
  const [soNoNavegador, setSoNoNavegador] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintReferenciasService.get(studyId);
        if (!vivo) return;
        if (row) {
          setLocal(lerReferencias(row.referencias));
        } else {
          const adotadas = doNavegador(studyId);
          setLocal(adotadas);
          if (adotadas.length > 0) {
            blueprintReferenciasService.save(studyId, organizationId, adotadas).catch((e) => console.warn('[referências] não gravou a lista adotada do navegador:', e));
          }
        }
      } catch (e) {
        if (!vivo) return;
        setSoNoNavegador(true);
        console.warn('[referências] sem persistência no estudo (migration ausente?) — a lista segue no navegador:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId, organizationId]);

  const setReferencias = useCallback(
    (r: ReferenciaExterna[]) => {
      const lidas = lerReferencias(r);
      setLocal(lidas);
      if (soNoNavegador) {
        gravarNoNavegador(studyId, lidas);
        return;
      }
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintReferenciasService.save(studyId, organizationId, lidas).catch((e) => console.warn('[referências] não gravou a lista:', e));
      }, 500);
    },
    [studyId, organizationId, soNoNavegador],
  );

  return { referencias, setReferencias, carregando, soNoNavegador };
}
