import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const convertPdfToImage = async (file: File): Promise<File> => {
  return new Promise(async (resolve, reject) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1); // Import first page
      
      const viewport = page.getViewport({ scale: 3.0 }); // High resolution scale
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error("Could not get canvas context");
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      await page.render(renderContext).promise;
      
      canvas.toBlob((blob) => {
        if (blob) {
          const imageFile = new File([blob], file.name.replace('.pdf', '.png'), { type: 'image/png' });
          resolve(imageFile);
        } else {
          reject(new Error("Could not convert canvas to blob"));
        }
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
};
