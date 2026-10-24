import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { preferenciasKeys } from '../lib/queryKeys';
import { useStore } from '../store/useStore';
import { preferenciasService } from '../services/preferenciasService';
import { useToast } from './useToast';
import {
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
 *  - Setter otimista (como `useState`: aceita valor ou função): muda a tela na hora, grava
 *    `planta.exibir.<item>`, e ao fim (sucesso ou falha) relê a chave do usuário — dois cliques
 *    rápidos terminam iguais ao banco. Falha → volta ao que era e avisa. Só grava quando o valor
 *    MUDA por ação (nunca por render).
 *  - Espelha o valor efetivo no `localStorage` (`chaveAntiga`): é o que mantém a escolha sem
 *    sessão/offline e o que a migração lê.
 *  - Sem sessão: muda local (estado + navegador) e não chama o serviço.
 *  - Leitura do banco que falha NUNCA deixa a planta em branco: vale o navegador/padrão.
 *
 * A leitura usa a MESMA chave e o MESMO `queryFn` de `usePreferenciasEletricas` (uma leitura só).
 * Não depende de organização (escopo USUARIO) — REGRA #5.
 */

/** Última mensagem de falha de leitura já avisada: o hook é montado ~37× no editor (um por item). */
let ultimoAvisoDeLeitura: string | null = null;

/** Usuários cuja migração do navegador já rodou nesta carga da página. */
const migracaoJaFeita = new Set<string>();

const SEM_LINHAS: readonly LinhaDePreferencia[] = Object.freeze([]);

function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function definicaoDe(item: string): ItemDeExibicao {
  const def = ITENS_DE_EXIBICAO.find((i) => i.item === item);
  if (!def) throw new Error(`Item de exibição da planta desconhecido: "${item}" (não está em ITENS_DE_EXIBICAO).`);
  return def;
}

/** O valor cabe no tipo/opções do item? (reusa a validação do catálogo.) */
function ehValido(item: string, valor: unknown): valor is ValorDeExibicao {
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
  const chave = preferenciasKeys.usuario(userId);
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
  const noBanco = useMemo(() => valorDeExibicao(linhas, item), [linhas, item]);
  // Item 'automatico' (terreno 3D): "Automático" = SEM linha. Com a leitura do banco bem-sucedida e sem
  // linha, vale o padrão do catálogo, não o navegador (um `true` antigo daqui não desfaz o Automático
  // escolhido noutro aparelho). Leitura ainda em voo/falha ou sem sessão: segue o navegador.
  const automaticoSemLinha = def.tipo === 'automatico' && !!userId && consulta.isSuccess;
  const semEscolhaNoBanco = automaticoSemLinha ? def.padrao : local;
  const valor = (noBanco !== undefined ? noBanco : semEscolhaNoBanco) as T;

  // Valor mais recente, para o setter ler "o de agora" (função de atualização e cliques seguidos).
  const valorRef = useRef<ValorDeExibicao>(valor);
  valorRef.current = valor;

  // Aviso de leitura (deduplicado entre as instâncias); zera quando a leitura volta a dar certo.
  const erro = consulta.error ? mensagemDe(consulta.error) : null;
  useEffect(() => {
    if (!erro) return;
    if (ultimoAvisoDeLeitura === erro) return;
    ultimoAvisoDeLeitura = erro;
    showToast(
      `Não foi possível carregar as suas preferências de exibição da planta: ${erro}. Vale o que está salvo neste navegador.`,
      'error',
    );
  }, [erro, showToast]);
  useEffect(() => {
    if (consulta.isSuccess) ultimoAvisoDeLeitura = null;
  }, [consulta.isSuccess]);

  // Espelho no navegador: o valor que está valendo (banco, local ou padrão).
  useEffect(() => {
    espelharNoNavegador(def.chaveAntiga, valor);
  }, [def.chaveAntiga, valor]);

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

      // Otimista no cache só quando a lista já está lá: sem ela, escrever agora a deixaria com UMA
      // linha e esconderia as demais; nesse caso o valor local já mostra a escolha e a releitura fecha.
      const antes = queryClient.getQueryData<LinhaDePreferencia[]>(chaveDaQuery);
      const linhaAnterior = antes?.find((l) => l.escopo === 'USUARIO' && l.chave === chave) ?? null;
      if (antes) {
        // Cancela uma leitura em voo (ela devolveria o valor velho por cima do novo) e escreve no cache
        // NA MESMA hora — o cancelamento começa de forma síncrona, então a tela não pisca.
        void queryClient.cancelQueries({ queryKey: chaveDaQuery });
        queryClient.setQueryData<LinhaDePreferencia[]>(chaveDaQuery, (atual) =>
          // `null` (terreno 3D "Automático") = SEM linha: remove em vez de pôr `{ valor: null }`.
          comLinha(
            atual ?? [],
            chave,
            proximo === null ? null : ({ escopo: 'USUARIO', chave, valor: proximo } as LinhaDePreferencia),
          ),
        );
      }

      void (async () => {
        try {
          // `null` (só o terreno 3D, "Automático") APAGA a linha: a coluna é NOT NULL.
          await preferenciasService.gravar('USUARIO', {}, chave, proximo);
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
        }
        // Ao fim de TODA gravação (sucesso ou falha) a chave é relida: o banco é a verdade.
        await queryClient.invalidateQueries({ queryKey: chaveDaQuery });
      })();
    },
    [item, chave, userId, queryClient, chaveDaQuery, showToast],
  );

  return [valor, setValor];
}

/**
 * Migração ÚNICA do navegador para o banco, montada uma vez no editor. Depois da 1ª leitura
 * bem-sucedida, `linhasParaMigrar` (só o que difere do padrão e ainda não tem linha) → UM
 * `gravarVarios`, UMA vez por usuário por carga da página (guarda em módulo: re-render, nova aba do
 * editor ou 2ª montagem não regravam). Falha não avisa nem trava: o navegador segue com a escolha e
 * a próxima carga tenta de novo.
 */
export function useMigracaoDaExibicaoDaPlanta(): void {
  const queryClient = useQueryClient();
  const { userId, chave, consulta } = useLinhasDoUsuario();
  const { isSuccess, data } = consulta;

  useEffect(() => {
    if (!userId || !isSuccess || !data) return;
    if (migracaoJaFeita.has(userId)) return;
    migracaoJaFeita.add(userId);

    const aGravar = linhasParaMigrar(data as LinhaDePreferencia[], lerDoNavegador);
    if (aGravar.length === 0) return;

    void preferenciasService
      .gravarVarios(aGravar)
      .then(() => queryClient.invalidateQueries({ queryKey: chave }))
      .catch((e) => {
        console.warn('[usePreferenciaDaPlanta] migração das escolhas do navegador falhou:', e);
      });
  }, [userId, isSuccess, data, chave, queryClient]);
}
