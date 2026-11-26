/**
 * O que do ENTORNO DA MAQUETE vai para o 3D (26/11/2026): árvores (ESA WorldCover) e prédios do entorno
 * (OpenStreetMap) ganharam cada um a sua linha em Camadas › Terreno e no Exibir do 3D — antes só saíam
 * trocando o estilo do 3D, e a Maquete inteira ia junto.
 *
 * O entorno continua CALCULADO inteiro (as árvores desviam dos prédios mesmo com os prédios ocultos — ligar
 * e desligar não muda onde as árvores nascem); aqui só se escolhe o que se desenha.
 */
export interface EntornoDaMaquete<P, A> {
  predios: P[];
  arvores: A[];
  /** Muda quando a cena tem de ser refeita. */
  chave: string;
}

export function entornoAVista<P, A>(
  entorno: EntornoDaMaquete<P, A> | null,
  mostrar: { arvores: boolean; predios: boolean },
): EntornoDaMaquete<P, A> | null {
  if (!entorno) return null;
  const predios = mostrar.predios ? entorno.predios : [];
  const arvores = mostrar.arvores ? entorno.arvores : [];
  if (predios.length === 0 && arvores.length === 0) return null;
  return { predios, arvores, chave: `${entorno.chave}|${mostrar.predios ? 'P' : '-'}${mostrar.arvores ? 'A' : '-'}` };
}
