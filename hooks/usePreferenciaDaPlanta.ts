import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { preferenciasKeys } from '../lib/queryKeys';
import { useStore } from '../store/useStore';
import { preferenciasService } from '../services/preferenciasService';
import { useToast } from './useToast';
import {
  iniciarGravacao,
  limparAvisoDeLeitura,
  mensagemDeFalhaDeLeitura,
  registrarAvisoDeLeitura,
  terminarGravacao,
} from '../lib/preferenciasCompartilhado';
import {
  AUTOMATICO_NO_BANCO,
  chaveDeExibicao,
  ITENS_DE_EXIBICAO,
  linhasParaMigrar,
  valorDeExibicao,
  type ItemDeExibicao,
  type ValorDeExibicao,
} from '../utils/preferencias/catalogoExibir';
import type { LinhaDePreferencia } from '../utils/preferencias/resolver';

/**
 * O que a Planta EXIBE (menu Vista › Exibir) como preferência do USUÁRIO no banco.
 * Plano docs/planos/2026-10-24-preferencias-exibicao-da-planta.md. Substitui o
 * `usePersistedState('blueprint:…')` do editor, com a MESMA tupla `[valor, setValor]`.
 *
 *  - Valor: linha válida do banco → navegador (`chaveAntiga`, JSON) → padrão do catálogo. Valor de
 *    fora do tipo/opções do item nunca lança: vale como "sem escolha".
 *  - Terreno 3D ("automatico"): o editor vê `boolean | null`; no banco o "Automático" é o texto
 *    'AUTOMATICO' (a coluna é NOT NULL). A troca `null` <-> 'AUTOMATICO' é feita AQUI, na fronteira.
 *  - Setter otimista (como `useState`: aceita valor ou função): muda a tela na hora, grava
 *    `planta.exibir.<item>` e, quando a ÚLTIMA gravação em voo da chave termina (sucesso ou falha),
 *    relê a chave do usuário — uma rajada (aplicar template de vista) faz UMA releitura, no fim, e
 *    nenhum item volta ao valor antigo no meio. Falha → volta ao que era e avisa. Só grava quando o
 *    valor MUDA por ação (nunca por render).
 *  - Espelha o valor efetivo no `localStorage` (`chaveAntiga`) SÓ SEM SESSÃO (deslogado/offline): com
 *    sessão a fonte é o banco, e espelhar faria o próximo usuário do mesmo navegador herdar as
 *    escolhas deste. O que o navegador já tem é o que a migração lê.
 *  - Sem sessão: muda local (estado + navegador) e não chama o serviço.
 *  - Leitura do banco que falha NUNCA deixa a planta em branco: vale o navegador/padrão.
 *
 * A leitura usa a MESMA chave e o MESMO `queryFn` de `usePreferenciasEletricas` (uma leitura só, e um
 * aviso de falha só — ver `lib/preferenciasCompartilhado`). Não depende de organização (escopo
 * USUARIO) — REGRA #5.
 */

/** Usuários cuja migração do navegador já rodou (ou está em voo) nesta carga da página. */
const migracaoJaFeita = new Set<string>();

/** Marcador POR USUÁRIO, no navegador: a migração já foi resolvida para ele. */
export const chaveDoMarcadorDeMigracao = (userId: string): string => `blueprint:exibir:migrado:${userId}`;

function marcadorDeMigracaoPresente(userId: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(chaveDoMarcadorDeMigracao(userId)) === '1';
  } catch {
    return false;
  }
}

function gravarMarcadorDeMigracao(userId: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(chaveDoMarcadorDeMigracao(userId), '1');
  } catch {
    /* sem navegador: a guarda do módulo ainda impede repetir nesta carga */
  }
}

const SEM_LINHAS: readonly LinhaDePreferencia[] = Object.freeze([]);

function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function definicaoDe(item: string): ItemDeExibicao {
  const def = ITENS_DE_EXIBICAO.find((i) => i.item === item);
  if (!def) throw new Error(`Item de exibição da planta desconhecido: "${item}" (não está em ITENS_DE_EXIBICAO).`);
  return def;
}

/** Do editor para o banco: o "automático" (`null`) vira o texto 'AUTOMATICO'. */
function paraOBanco(valor: ValorDeExibicao): boolean | string {
  return valor === null ? AUTOMATICO_NO_BANCO : valor;
}

/** Do banco para o editor: o texto 'AUTOMATICO' vira `null`. */
function doBanco(valor: ValorDeExibicao): ValorDeExibicao {
  return valor === AUTOMATICO_NO_BANCO ? null : valor;
}

/** O valor (do EDITOR) cabe no tipo/opções do item? (reusa a validação do catálogo.) */
function ehValido(item: string, valor: unknown): valor is ValorDeExibicao {
  const def = definicaoDe(item);
  if (valor === null) return def.tipo === 'automatico';
  // O texto 'AUTOMATICO' é do banco: o editor entrega `null`.
  if (def.tipo === 'automatico' && typeof valor !== 'boolean') return false;
  return (
    valorDeExibicao([{ escopo: 'USUARIO', chave: chaveDeExibicao(item), valor } as LinhaDePreferencia], item) !== undefined
  );
}

/** Lê e interpreta (JSON) a chave antiga do navegador; `undefined` = sem valor / ilegível. */
function lerDoNavegador(chaveAntiga: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const guardado = localStorage.getItem(chaveAntiga);
    return guardado === null ? undefined : JSON.parse(guardado);
  } catch {
    return undefined;
  }
}

/** Navegador (se válido) ou padrão. */
function valorLocalDe(def: ItemDeExibicao): ValorDeExibicao {
  const doNavegador = lerDoNavegador(def.chaveAntiga);
  return doNavegador !== undefined && ehValido(def.item, doNavegador) ? doNavegador : def.padrao;
}

function espelharNoNavegador(chaveAntiga: string, valor: ValorDeExibicao): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(chaveAntiga, JSON.stringify(valor));
  } catch (e) {
    console.warn(`Failed to save persisted state (${chaveAntiga}):`, e);
  }
}

/** Põe (ou, com `nova` nula, tira) a linha USUARIO da chave — sem mexer nas demais. */
function comLinha(
  linhas: readonly LinhaDePreferencia[],
  chave: string,
  nova: LinhaDePreferencia | null,
): LinhaDePreferencia[] {
  const resto = linhas.filter((l) => !(l.escopo === 'USUARIO' && l.chave === chave));
  return nova ? [...resto, nova] : resto;
}

/** Leitura das linhas USUARIO — idêntica à de `usePreferenciasEletricas` (mesma chave, uma leitura só). */
function useLinhasDoUsuario() {
  const userId = useStore((s) => s.session?.user?.id) ?? null;
  // Memorizada: o setter depende dela e precisa continuar o MESMO enquanto o usuário não muda.
  const chave = useMemo(() => preferenciasKeys.usuario(userId), [userId]);
  const consulta = useQuery({
    queryKey: chave,
    // Sem sessão não há "usuário" a ler: devolve vazio em vez de desligar a query (REGRA #5).
    queryFn: () => (userId ? preferenciasService.listarDoUsuario() : Promise.resolve([])),
  });
  return { userId, chave, consulta };
}

export function usePreferenciaDaPlanta<T extends boolean | string | null>(
  item: string,
): [T, Dispatch<SetStateAction<T>>] {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { userId, chave: chaveDaQuery, consulta } = useLinhasDoUsuario();

  // O item é fixo por chamada do hook (como a `key` do usePersistedState).
  const def = useMemo(() => definicaoDe(item), [item]);
  const chave = chaveDeExibicao(item);

  // O que vale quando o banco não tem escolha: o navegador (ou o padrão). Espelha a última escolha local.
  const [local, setLocal] = useState<ValorDeExibicao>(() => valorLocalDe(def));

  const linhas = (consulta.data ?? SEM_LINHAS) as LinhaDePreferencia[];
  const noBanco = useMemo(() => {
    const lido = valorDeExibicao(linhas, item);
    return lido === undefined ? undefined : doBanco(lido);
  }, [linhas, item]);
  const valor = (noBanco !== undefined ? noBanco : local) as T;

  // Valor mais recente, para o setter ler "o de agora" (função de atualização e cliques seguidos).
  const valorRef = useRef<ValorDeExibicao>(valor);
  valorRef.current = valor;

  // Aviso de leitura (UM só, compartilhado com usePreferenciasEletricas); zera quando a leitura volta a dar certo.
  const erro = consulta.error ? mensagemDe(consulta.error) : null;
  useEffect(() => {
    if (!erro) return;
    if (!registrarAvisoDeLeitura(erro)) return;
    showToast(mensagemDeFalhaDeLeitura(erro), 'error');
  }, [erro, showToast]);
  useEffect(() => {
    if (consulta.isSuccess) limparAvisoDeLeitura();
  }, [consulta.isSuccess]);

  // Espelho no navegador SÓ SEM SESSÃO (deslogado/offline). Com sessão a fonte é o banco: espelhar
  // o valor vindo dele faria outro usuário do mesmo navegador herdá-lo na migração.
  useEffect(() => {
    if (userId) return;
    espelharNoNavegador(def.chaveAntiga, valor);
  }, [def.chaveAntiga, valor, userId]);

  const setValor = useCallback<Dispatch<SetStateAction<T>>>(
    (acao) => {
      const anterior = valorRef.current as T;
      const proximo = typeof acao === 'function' ? (acao as (atual: T) => T)(anterior) : acao;
      if (!ehValido(item, proximo)) {
        console.warn(`[usePreferenciaDaPlanta] valor ignorado para "${item}":`, proximo);
        return;
      }
      if (Object.is(proximo, anterior)) return;

      // Local primeiro (vale sem sessão e enquanto o banco não respondeu); depois o cache do banco.
      valorRef.current = proximo;
      setLocal(proximo);
      if (!userId) return;

      const valorNoBanco = paraOBanco(proximo);

      // Otimista no cache só quando a lista já está lá: sem ela, escrever agora a deixaria com UMA
      // linha e esconderia as demais; nesse caso o valor local já mostra a escolha e a releitura fecha.
      const antes = queryClient.getQueryData<LinhaDePreferencia[]>(chaveDaQuery);
      const linhaAnterior = antes?.find((l) => l.escopo === 'USUARIO' && l.chave === chave) ?? null;
      if (antes) {
        // Cancela uma leitura em voo (ela devolveria o valor velho por cima do novo) e escreve no cache
        // NA MESMA hora — o cancelamento começa de forma síncrona, então a tela não pisca.
        void queryClient.cancelQueries({ queryKey: chaveDaQuery });
        queryClient.setQueryData<LinhaDePreferencia[]>(chaveDaQuery, (atual) =>
          comLinha(atual ?? [], chave, { escopo: 'USUARIO', chave, valor: valorNoBanco } as LinhaDePreferencia),
        );
      }

      iniciarGravacao(queryClient, chaveDaQuery);
      void (async () => {
        try {
          await preferenciasService.gravar('USUARIO', {}, chave, valorNoBanco);
        } catch (e) {
          if (antes) {
            queryClient.setQueryData<LinhaDePreferencia[]>(chaveDaQuery, (atual) =>
              comLinha(atual ?? [], chave, linhaAnterior),
            );
          }
          // Só desfaz o local se ninguém escolheu outra coisa depois (clique seguinte manda).
          if (Object.is(valorRef.current, proximo)) {
            valorRef.current = anterior;
            setLocal(anterior);
          }
          showToast(`Não foi possível salvar a preferência: ${mensagemDe(e)}`, 'error');
        } finally {
          // Só a ÚLTIMA gravação em voo da chave (sucesso ou falha) relê a lista: o banco é a verdade, e
          // uma releitura no meio de uma rajada devolveria o valor antigo dos itens ainda em gravação.
          if (terminarGravacao(queryClient, chaveDaQuery)) {
            await queryClient.invalidateQueries({ queryKey: chaveDaQuery });
          }
        }
      })();
    },
    [item, chave, userId, queryClient, chaveDaQuery, showToast],
  );

  return [valor, setValor];
}

/**
 * Migração ÚNICA do navegador para o banco, montada uma vez no editor. Depois da 1ª leitura
 * bem-sucedida, `linhasParaMigrar` (só o que difere do padrão e ainda não tem linha) → UM
 * `gravarVarios`. "Uma vez" de verdade: o resultado é guardado num MARCADOR POR USUÁRIO no navegador
 * (`blueprint:exibir:migrado:<userId>`), gravado depois do `gravarVarios` bem-sucedido OU quando não há
 * nada a migrar; com o marcador, nenhuma carga seguinte migra. A guarda em módulo evita repetir dentro
 * da mesma carga (re-render, nova aba do editor ou 2ª montagem). Falha não avisa nem trava: o navegador
 * segue com a escolha, sem marcador, e a próxima carga tenta de novo.
 */
export function useMigracaoDaExibicaoDaPlanta(): void {
  const queryClient = useQueryClient();
  const { userId, chave, consulta } = useLinhasDoUsuario();
  const { isSuccess, data } = consulta;

  useEffect(() => {
    if (!userId || !isSuccess || !data) return;
    if (migracaoJaFeita.has(userId)) return;
    migracaoJaFeita.add(userId);
    if (marcadorDeMigracaoPresente(userId)) return;

    const aGravar = linhasParaMigrar(data as LinhaDePreferencia[], lerDoNavegador);
    if (aGravar.length === 0) {
      gravarMarcadorDeMigracao(userId);
      return;
    }

    void preferenciasService
      .gravarVarios(aGravar)
      .then(() => {
        gravarMarcadorDeMigracao(userId);
        return queryClient.invalidateQueries({ queryKey: chave });
      })
      .catch((e) => {
        console.warn('[usePreferenciaDaPlanta] migração das escolhas do navegador falhou:', e);
      });
  }, [userId, isSuccess, data, chave, queryClient]);
}
