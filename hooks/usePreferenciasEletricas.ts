import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { preferenciasKeys } from '../lib/queryKeys';
import { preferenciasService } from '../services/preferenciasService';
import { useToast } from './useToast';
import {
  chaveDoItem,
  type AlvoDaPreferencia,
  type ItemEletrico,
} from '../utils/preferencias/catalogo';
import {
  exibicaoEletricaDaPrancha,
  exibicaoEletricaDaTela,
  type EscopoDaPreferencia,
  type ExibicaoEletrica,
  type LinhaDePreferencia,
} from '../utils/preferencias/resolver';

/**
 * Preferências da planta elétrica para quem DESENHA (canvas, prancha/PDF) e para a tela de
 * Preferências. Plano docs/planos/2026-10-22-preferencias-planta-eletrica.md, seção 3.
 *
 *  - A leitura da TELA roda SEMPRE (REGRA #5: nunca bloquear leitura por falta de organização);
 *    a da PRANCHA só com `organizationId` (a chave da query inclui a organização e o estudo, então
 *    trocar o seletor do topo recarrega a prancha da nova organização).
 *  - Leitura que falha NUNCA deixa a planta em branco: `tela`/`prancha` caem no padrão, `erro` vem
 *    preenchido e um aviso diz que as preferências não carregaram.
 *  - `alterar` é otimista: o desenho muda na hora; na falha só ESSA linha volta ao que era (outras
 *    escolhas feitas no meio-tempo ficam) e um aviso diz o motivo.
 */

const SEM_LINHAS: readonly LinhaDePreferencia[] = Object.freeze([]);

/** Põe (ou, com `nova` nula, tira) a linha de (escopo, chave) — sem mexer nas demais. */
function comLinha(
  linhas: readonly LinhaDePreferencia[],
  escopo: EscopoDaPreferencia,
  chave: string,
  nova: LinhaDePreferencia | null,
): LinhaDePreferencia[] {
  const resto = linhas.filter((l) => !(l.escopo === escopo && l.chave === chave));
  return nova ? [...resto, nova] : resto;
}

function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function usePreferenciasEletricas({
  organizationId,
  studyId,
}: {
  organizationId: string | null;
  studyId?: string | null;
}): {
  tela: ExibicaoEletrica;
  prancha: ExibicaoEletrica;
  linhasDaTela: LinhaDePreferencia[];
  linhasDaPrancha: LinhaDePreferencia[];
  carregando: boolean;
  erro: string | null;
  alterar(
    alvo: AlvoDaPreferencia,
    item: ItemEletrico,
    valor: boolean | null,
    escopo: EscopoDaPreferencia,
  ): Promise<void>;
} {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const chaveDaTela = preferenciasKeys.usuario();
  const chaveDaPrancha = preferenciasKeys.prancha(organizationId, studyId);

  const daTela = useQuery({
    queryKey: chaveDaTela,
    queryFn: () => preferenciasService.listarDoUsuario(),
  });
  const daPrancha = useQuery({
    queryKey: chaveDaPrancha,
    // Sem organização (ex.: "Todas as organizações") não há prancha a ler: devolve vazio em vez de
    // desligar a query (REGRA #5) — o padrão do sistema vale e a tela nunca fica à espera.
    queryFn: () => (organizationId ? preferenciasService.listarDaPrancha(organizationId, studyId) : Promise.resolve([])),
  });

  const linhasDaTela = (daTela.data ?? SEM_LINHAS) as LinhaDePreferencia[];
  const linhasDaPrancha = (daPrancha.data ?? SEM_LINHAS) as LinhaDePreferencia[];
  const tela = useMemo(() => exibicaoEletricaDaTela(linhasDaTela), [linhasDaTela]);
  const prancha = useMemo(() => exibicaoEletricaDaPrancha(linhasDaPrancha), [linhasDaPrancha]);

  const erro = daTela.error ? mensagemDe(daTela.error) : daPrancha.error ? mensagemDe(daPrancha.error) : null;
  useEffect(() => {
    if (erro) {
      showToast(`Não foi possível carregar as preferências da planta: ${erro}. O desenho usa os padrões.`, 'error');
    }
  }, [erro, showToast]);

  const alterar = useCallback(
    async (
      alvo: AlvoDaPreferencia,
      item: ItemEletrico,
      valor: boolean | null,
      escopo: EscopoDaPreferencia,
    ): Promise<void> => {
      const chave = chaveDoItem(alvo, item);
      try {
        if (escopo === 'ORGANIZACAO' && !organizationId) {
          throw new Error('escolha uma organização para mudar o padrão da prancha.');
        }
        if (escopo === 'ESTUDO' && !studyId) throw new Error('falta o estudo (planta) para ajustar a prancha.');
      } catch (e) {
        showToast(`Não foi possível salvar a preferência: ${mensagemDe(e)}`, 'error');
        return;
      }

      const chaveDoCache = escopo === 'USUARIO' ? chaveDaTela : chaveDaPrancha;
      const dono =
        escopo === 'USUARIO'
          ? {}
          : escopo === 'ORGANIZACAO'
            ? { organizationId: organizationId as string }
            : { studyId: studyId as string };

      // Otimista só quando a lista já está no cache: sem ela, escrever agora a deixaria com UMA linha
      // e esconderia as demais; nesse caso grava e recarrega no fim.
      const antes = queryClient.getQueryData<LinhaDePreferencia[]>(chaveDoCache);
      const linhaAnterior = antes?.find((l) => l.escopo === escopo && l.chave === chave) ?? null;
      if (antes) {
        await queryClient.cancelQueries({ queryKey: chaveDoCache });
        queryClient.setQueryData<LinhaDePreferencia[]>(chaveDoCache, (atual) =>
          comLinha(atual ?? [], escopo, chave, valor === null ? null : { escopo, chave, valor }),
        );
      }

      try {
        await preferenciasService.gravar(escopo, dono, chave, valor);
      } catch (e) {
        if (antes) {
          queryClient.setQueryData<LinhaDePreferencia[]>(chaveDoCache, (atual) =>
            comLinha(atual ?? [], escopo, chave, linhaAnterior),
          );
        }
        showToast(`Não foi possível salvar a preferência: ${mensagemDe(e)}`, 'error');
        return;
      }

      if (!antes) {
        await queryClient.invalidateQueries({ queryKey: chaveDoCache });
      } else if (escopo === 'ORGANIZACAO') {
        // O padrão da empresa vale para a prancha de qualquer estudo dela: marca as outras como
        // velhas (sem refazer agora); recarregam quando alguém usar.
        const estudoAtual = studyId ?? 'sem-estudo';
        await queryClient.invalidateQueries({
          queryKey: ['preferencias', 'prancha', organizationId as string],
          predicate: (q) => q.queryKey[3] !== estudoAtual,
          refetchType: 'none',
        });
      }
    },
    [queryClient, showToast, organizationId, studyId, chaveDaTela, chaveDaPrancha],
  );

  return {
    tela,
    prancha,
    linhasDaTela,
    linhasDaPrancha,
    carregando: daTela.isLoading || daPrancha.isLoading,
    erro,
    alterar,
  };
}
