/**
 * Procurar um trecho de texto DENTRO do arquivo IFC gerado.
 *
 * ⚠️ String de STEP é ASCII: desde 07/09/2026 todo acento sai escapado como
 * `\X2\00E9\X0\`, e não mais como os bytes UTF-8 crus (o que fazia um receptor
 * de terceiro TRUNCAR a string no primeiro byte não-ASCII, em silêncio). Quem
 * busca no arquivo tem de buscar na mesma moeda.
 *
 * A alternativa seria afrouxar as asserções para não olhar o acento — e aí elas
 * deixariam de provar justamente o que passou a ser delicado.
 */
import { escaparParaStep } from '../../utils/blueprintIfc';

/** O trecho como ele aparece dentro do arquivo. */
export const noIfc = (texto: string): string => escaparParaStep(texto);

/** O mesmo, pronto para entrar numa expressão regular. */
export const noIfcRegex = (texto: string): string =>
  escaparParaStep(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
