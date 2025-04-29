// src/app/utils/pdf-utils.ts
// Usamos importaciones ES6 en lugar de require
import * as pdfMakeModule from 'pdfmake/build/pdfmake';
import * as pdfFontsModule from 'pdfmake/build/vfs_fonts';

// Obtenemos la instancia real (puede estar en .default en algunas configuraciones)
const pdfMakeInstance: any = (pdfMakeModule as any).default || pdfMakeModule;
const pdfFontsInstance: any = (pdfFontsModule as any).default || pdfFontsModule;

// Verificamos la estructura de los objetos importados
if (pdfFontsInstance.pdfMake && pdfFontsInstance.pdfMake.vfs) {
  pdfMakeInstance.vfs = pdfFontsInstance.pdfMake.vfs;
} else if (pdfFontsInstance.vfs) {
  pdfMakeInstance.vfs = pdfFontsInstance.vfs;
}

// Exportamos como pdfMake para mantener compatibilidad
export const pdfMake = pdfMakeInstance;