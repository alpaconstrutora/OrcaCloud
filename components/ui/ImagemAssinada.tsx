import React from 'react';
import { useUrlAssinada } from '../../hooks/useUrlAssinada';

/**
 * `<img>`/`<video>` de arquivo em bucket PRIVADO (`documents`,
 * `organization-assets`). Recebe o valor GRAVADO (caminho ou a URL pública
 * antiga) e assina antes de exibir — ver hooks/useUrlAssinada.ts.
 *
 * Enquanto assina (ou se a assinatura for recusada) ocupa o mesmo espaço com um
 * fundo neutro, para a grade não pular.
 */
type ImagemProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
    bucket: string;
    valor: string | null | undefined;
};

export const ImagemAssinada: React.FC<ImagemProps> = ({ bucket, valor, className, alt, ...resto }) => {
    const src = useUrlAssinada(bucket, valor);
    if (!src) return <span aria-hidden="true" className={`${className ?? ''} block bg-gray-100`} />;
    return <img src={src} alt={alt ?? ''} className={className} {...resto} />;
};

type VideoProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
    bucket: string;
    valor: string | null | undefined;
};

export const VideoAssinado: React.FC<VideoProps> = ({ bucket, valor, className, ...resto }) => {
    const src = useUrlAssinada(bucket, valor);
    if (!src) return <span aria-hidden="true" className={`${className ?? ''} block bg-gray-100`} />;
    return <video src={src} className={className} {...resto} />;
};

export default ImagemAssinada;
