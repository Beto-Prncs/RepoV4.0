
import {Content, StyleDictionary } from "pdfmake/interfaces";

declare const require: any;
const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');
pdfMake.vfs = pdfFonts.pdfMake.vfs;

import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { variable64 } from "/home/user/r-epo/public/icons/assets/img";

(pdfMake as any).vfs = pdfFonts.pdfMake.vfs;

// Report Data Interface
interface ReportData {
  trabajador: string;
  codigoQR?: string;
  empresa: string;
  nombreReporte: string;
  ubicacion: string;
  fecha: string;
  problema: string;
  descripcion: string;
  solucion: string;
  materialesUtilizados: string;
  evidencias?: string[]; // Optional array of evidence image paths
}

// PDF Generation Options
interface PDFOptions {
  logoWidth?: number;
  includeQR?: boolean;
}

/**
 * Generate a detailed service report PDF
 * @param data Comprehensive report data
 * @param options Optional customization settings
 */
const generateReportPDF = (
  data: ReportData, 
  options: PDFOptions = {}
) => {
  // Validate required inputs
  if (!data.trabajador || !data.empresa || !data.nombreReporte) {
    throw new Error('Información esencial del reporte faltante');
  }

  // Default options
  const {
    logoWidth = 100,
    includeQR = true
  } = options;

  // Prepare content
  const content: Content[] = [];

  // Header with logo and report details
  content.push({
    columns: [
      // Logo
      { 
        image: variable64.miVar, 
        width: logoWidth,
        margin: [0, 0, 0, 10]
      },
      {
        stack: [
          { 
            text: `De: ${data.trabajador}`, 
            style: 'headerInfo',
            alignment: 'right'
          },
          { 
            text: `Para: ${data.empresa}`, 
            style: 'headerInfo',
            alignment: 'right'
          },
          { 
            text: `REF: ${data.nombreReporte}`, 
            style: 'headerInfo',
            alignment: 'right'
          }
        ]
      }
    ],
    margin: [0, 0, 0, 20]
  });

  // Report Metadata
  content.push({
    table: {
      widths: ['*', '*'],
      body: [
        [
          { text: `Ubicación: ${data.ubicacion}`, style: 'metadataLabel' },
          { text: `Fecha: ${data.fecha}`, style: 'metadataLabel', alignment: 'right' }
        ]
      ]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 20]
  });

  // Introductory Text
  content.push({
    text: 'Por medio de la presente, entrego el reporte de los Servicios Realizados:',
    style: 'introText',
    margin: [0, 0, 0, 10]
  });

  // Report Sections
  const sections = [
    { label: 'Problema', content: data.problema },
    { label: 'Descripción', content: data.descripcion },
    { label: 'Solución', content: data.solucion },
    { label: 'Materiales Utilizados', content: data.materialesUtilizados }
  ];

  sections.forEach(section => {
    content.push({
      text: `${section.label}:`,
      style: 'sectionLabel'
    });
    content.push({
      text: section.content,
      style: 'sectionContent',
      margin: [0, 0, 0, 15]
    });
  });

  // Evidence Section
  if (data.evidencias && data.evidencias.length > 0) {
    content.push({
      text: 'Evidencias:',
      style: 'sectionLabel'
    });
    
    const evidenceImages: Content[] = data.evidencias.map(img => ({
      image: img,
      width: 200,
      alignment: 'center',
      margin: [0, 10, 0, 10]
    }));

    content.push(...evidenceImages);
  }

  // Optional QR Code
  if (includeQR && data.codigoQR) {
    content.push({
      qr: data.codigoQR,
      fit: 100,
      alignment: 'right',
      margin: [0, 20, 0, 0]
    });
  }

  // Styles
  const styles: StyleDictionary = {
    headerInfo: {
      fontSize: 10,
      color: '#666666',
      alignment: 'right'
    },
    metadataLabel: {
      fontSize: 10,
      color: '#444444'
    },
    introText: {
      fontSize: 11,
      italics: true,
      color: '#333333'
    },
    sectionLabel: {
      fontSize: 12,
      bold: true,
      color: '#000000',
      margin: [0, 10, 0, 5]
    },
    sectionContent: {
      fontSize: 11,
      color: '#333333'
    }
  };

  // PDF Document Definition
  const docDefinition: TDocumentDefinitions = {
    content,
    styles,
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60]
  };

  // Generate and open the PDF
  try {
    pdfMake.createPdf(docDefinition).open();
  } catch (error) {
    console.error('Error al generar el PDF:', error);
    throw error;
  }
};

export default generateReportPDF;

// Example Usage
/*
const reportData: ReportData = {
  trabajador: 'Juan Pérez',
  empresa: 'Repo System',
  nombreReporte: 'Informe de Mantenimiento',
  ubicacion: 'Oficina Central',
  fecha: '15 de Febrero de 2024',
  problema: 'Falla en sistema de climatización',
  descripcion: 'Se detectó una anomalía en el sistema de aire acondicionado',
  solucion: 'Reemplazo de compresor y recarga de gas refrigerante',
  materialesUtilizados: 'Compresor XYZ, gas refrigerante R-410A',
  codigoQR: 'https://www.ejemplo.com/reporte/123',
  evidencias: ['/path/to/image1.jpg', '/path/to/image2.jpg']
};

generateReportPDF(reportData, {
  logoWidth: 80,
  includeQR: true
});
*/