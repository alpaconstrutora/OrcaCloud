import React from 'react';
import { X } from 'lucide-react';
import { OpuraDocument } from '../../types';

export interface DocumentQrLabelModalProps {
  doc: OpuraDocument;
  onClose: () => void;
}

/**
 * Etiqueta QR Code para identificação física de um documento — extraída de
 * `OpuraDocsModule.tsx` (GED) para ser compartilhada com o Portal do Parceiro.
 * Puramente client-side: a imagem do QR vem de uma API pública de geração de
 * QR Code (sem escrita no banco), e o texto codificado é uma URL de validação
 * pública (`/publico/validar-planta/:id`) — por isso não depende de sessão
 * nem de permissão especial, ao contrário de Bloquear/Anotar.
 */
export const DocumentQrLabelModal: React.FC<DocumentQrLabelModalProps> = ({ doc, onClose }) => {
  const publicValidationUrl = `${window.location.origin}/publico/validar-planta/${doc.id}?v=${doc.active_version?.version_number || 1}`;
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(publicValidationUrl)}`;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[10px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="font-black text-slate-800 text-lg">Etiqueta QR Code</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Identificação e validação física</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex flex-col items-center">
          {/* Visualização de Impressão */}
          <div id="printable-qr-label" className="w-full border-2 border-dashed border-slate-200 rounded-[10px] p-6 bg-slate-50/50 flex flex-col items-center text-center space-y-4">
            <div className="bg-white p-4 rounded-[6px] border border-slate-100 shadow-sm">
              <img
                src={qrCodeImageUrl}
                alt="QR Code de Validação"
                className="w-44 h-44 object-contain"
              />
            </div>
            <div className="space-y-1">
              <h4 className="font-black text-slate-800 text-xs">{doc.nome}</h4>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                Revisão Ativa: V{doc.active_version?.version_number || 1}
              </p>
              <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-widest">
                Validação: {publicValidationUrl.replace('http://', '').replace('https://', '')}
              </p>
            </div>
            <div className="w-full pt-3 border-t border-slate-200/60 flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              <span>ÓPURA DOCS</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 px-3.5 border border-slate-200 text-slate-500 font-medium text-[13px] rounded-[6px] hover:bg-slate-50 transition-all flex items-center justify-center"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => {
                const printContents = document.getElementById('printable-qr-label')?.innerHTML;
                if (printContents) {
                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Imprimir Etiqueta QR Code</title>
                          <style>
                            body {
                              font-family: system-ui, sans-serif;
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              height: 100vh;
                              margin: 0;
                              padding: 0;
                              background: white;
                            }
                            .label-card {
                              width: 80mm;
                              height: 80mm;
                              border: 1px solid #ccc;
                              padding: 5mm;
                              box-sizing: border-box;
                              display: flex;
                              flex-direction: column;
                              align-items: center;
                              justify-content: space-between;
                              text-align: center;
                            }
                            img {
                              width: 45mm;
                              height: 45mm;
                              margin-bottom: 2mm;
                            }
                            h4 {
                              margin: 0 0 1mm 0;
                              font-size: 11px;
                              font-weight: bold;
                              text-transform: uppercase;
                              word-break: break-word;
                            }
                            p {
                              margin: 0;
                              font-size: 9px;
                              color: #555;
                            }
                            .footer {
                              width: 100%;
                              border-top: 1px solid #eee;
                              padding-top: 1.5mm;
                              display: flex;
                              justify-content: space-between;
                              font-size: 8px;
                              color: #888;
                              text-transform: uppercase;
                            }
                            @media print {
                              body { height: auto; }
                              .label-card { border: none; width: 100%; height: auto; padding: 0; }
                            }
                          </style>
                        </head>
                        <body>
                          <div class="label-card">
                            <img src="${qrCodeImageUrl}" />
                            <div>
                              <h4>${doc.nome}</h4>
                              <p>REVISÃO ATIVA: V${doc.active_version?.version_number || 1}</p>
                              <p style="font-size: 7px; color: #999; margin-top: 0.5mm;">VALIDAÇÃO: ${publicValidationUrl.replace('https://', '').replace('http://', '')}</p>
                            </div>
                            <div class="footer">
                              <span>ÓPURA DOCS</span>
                              <span>${new Date().toLocaleDateString()}</span>
                            </div>
                          </div>
                          <script>
                            window.onload = function() {
                              window.print();
                              setTimeout(function() { window.close(); }, 500);
                            };
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }
                }
              }}
              className="flex-1 h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center"
            >
              Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentQrLabelModal;
