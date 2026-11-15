/** Nome de arquivo sem espaço nem caractere proibido no Windows (exportações do Imovib). */
export const nomeDeArquivo = (nome: string) =>
    (nome || 'Estudo').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
