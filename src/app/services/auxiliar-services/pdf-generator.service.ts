// pdf-generator.service.ts
import { Injectable } from '@angular/core';
import { Reporte, Usuario, Empresa } from '../../models/interfaces';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Observable, from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { TaskService } from '../task.service';
import { pdfMake } from '../../utils/pdf-utils';
import { HttpClient } from '@angular/common/http';
import { ReportsCacheService } from './reports-cache.service';

@Injectable({
  providedIn: 'root'
})
export class PdfGeneratorService {
  constructor(
    private sanitizer: DomSanitizer,
    private taskService: TaskService,
    private http: HttpClient,
    private reportsCacheService?: ReportsCacheService
  ) {}

  // Método mejorado para generar PDF en el cliente
  generatePdfInBrowser(report: Reporte, workerName: string, companyName: string, departmentName: string): Observable<SafeUrl> {
    return from(this.createPdfDefinition(report, workerName, companyName, departmentName)).pipe(
      map(docDefinition => {
        // Generar PDF localmente con pdfMake
        return new Promise<SafeUrl>((resolve, reject) => {
          try {
            const pdfObj = pdfMake.createPdf(docDefinition);
            pdfObj.getBlob((blob) => {
              const url = URL.createObjectURL(blob);
              resolve(this.sanitizer.bypassSecurityTrustResourceUrl(url));
            });
          } catch (error) {
            console.error('Error generando PDF:', error);
            reject(error);
          }
        });
      }),
      switchMap(promise => from(promise)),
      catchError(error => {
        console.error('Error en generación de PDF:', error);
        return of(null);
      })
    );
  }

  // Generar o recuperar URL de PDF
  generateSafePdfUrl(report: Reporte): Observable<SafeUrl | null> {
    if (!report.IdReporte) {
      return of(null);
    }

    // Si tenemos la URL del PDF en el reporte y no hay problemas CORS
    if (report.pdfUrl) {
      // Intentar primero con la URL almacenada
      return this.testCorsAccess(report.pdfUrl).pipe(
        switchMap(corsWorks => {
          if (corsWorks) {
            // Si CORS funciona, usar la URL directa
            return of(this.sanitizer.bypassSecurityTrustResourceUrl(report.pdfUrl as string));
          } else {
            // Si hay problemas CORS, generar localmente
            return this.generatePdfLocally(report);
          }
        }),
        catchError(() => {
          // Si hay error al verificar CORS, generar localmente
          return this.generatePdfLocally(report);
        })
      );
    } else {
      // Si no tenemos URL almacenada, intentamos obtener desde Firebase
      return from(this.taskService.getPdfUrlForReporte(report.IdReporte)).pipe(
        switchMap(url => {
          if (url) {
            // Verificar si podemos acceder sin problemas CORS
            return this.testCorsAccess(url).pipe(
              switchMap(corsWorks => {
                if (corsWorks) {
                  return of(this.sanitizer.bypassSecurityTrustResourceUrl(url));
                } else {
                  return this.generatePdfLocally(report);
                }
              })
            );
          } else {
            // Si no hay URL, generar localmente
            return this.generatePdfLocally(report);
          }
        }),
        catchError(() => {
          // Si hay error, generar localmente
          return this.generatePdfLocally(report);
        })
      );
    }
  }

  // Método para generar PDF localmente usando pdfMake
  private generatePdfLocally(report: Reporte): Observable<SafeUrl | null> {
    // Obtener datos necesarios para el PDF
    const workerName = this.getDefaultName(report.IdUsuario);
    const companyName = this.getDefaultName(report.IdEmpresa);
    const departmentName = report.departamento || 'No especificado';

    // Generar PDF en el navegador
    return this.generatePdfInBrowser(report, workerName, companyName, departmentName);
  }

  // Método para probar si podemos acceder a una URL (verificar CORS)
  private testCorsAccess(url: string): Observable<boolean> {
    // Usar una petición HEAD para verificar acceso sin descargar todo el contenido
    return this.http.head(url, { observe: 'response' }).pipe(
      map(response => response.status === 200),
      catchError(() => of(false))
    );
  }

  // Método auxiliar para obtener un nombre por defecto
  private getDefaultName(id: string | undefined): string {
    if (!id) return 'No disponible';
    
    // Si tenemos el caché de reportes disponible, intentar obtener nombres
    if (this.reportsCacheService) {
      // Intentar obtener nombre de usuario
      const usuario = this.reportsCacheService.getCachedUsuario(id);
      if (usuario) return usuario.Nombre;
      
      // Intentar obtener nombre de empresa
      const empresa = this.reportsCacheService.getCachedEmpresa(id);
      if (empresa) return empresa.Nombre;
    }
    
    // Si no encontramos nada, devolver el ID
    return `ID: ${id}`;
  }

  // Crear definición de PDF para pdfMake
  private async createPdfDefinition(report: Reporte, workerName: string, companyName: string, departmentName: string): Promise<any> {
    // Definir con casting para evitar errores de tipo
    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      header: {
        text: 'Sistema de Automatización y Gestión de Reportes de Trabajo',
        alignment: 'center',
        margin: [0, 20, 0, 10],
        fontSize: 14,
        bold: true,
        color: '#3b82f6'
      },
      footer: {
        text: `Reporte generado el ${new Date().toLocaleDateString('es-ES')}`,
        alignment: 'center',
        margin: [0, 10, 0, 0],
        fontSize: 8,
        color: '#64748b'
      },
      content: [
        {
          text: report.Tipo_Trabajo || 'Reporte de Trabajo',
          style: 'header',
          alignment: 'center',
          margin: [0, 0, 0, 20]
        },
        {
          columns: [
            {
              width: '*',
              text: [
                { text: 'Fecha del reporte: ', bold: true },
                this.formatDate(report.fecha)
              ]
            },
            {
              width: '*',
              text: [
                { text: 'Prioridad: ', bold: true },
                report.priority || 'No especificada'
              ],
              alignment: 'right'
            }
          ],
          margin: [0, 0, 0, 15]
        },
        {
          style: 'tableExample',
          table: {
            widths: ['*', '*'],
            body: [
              [
                { text: 'Información General', style: 'tableHeader', colSpan: 2, alignment: 'center' },
                {}
              ],
              [
                { text: 'Trabajador Asignado', bold: true },
                workerName
              ],
              [
                { text: 'Departamento', bold: true },
                departmentName
              ],
              [
                { text: 'Empresa', bold: true },
                companyName
              ],
              [
                { text: 'Ubicación', bold: true },
                report.location || 'No especificada'
              ],
              [
                { text: 'Estado', bold: true },
                report.estado
              ]
            ]
          }
        },
        {
          text: 'Descripción del Problema',
          style: 'subheader',
          margin: [0, 20, 0, 10]
        },
        {
          text: report.jobDescription || 'No disponible',
          style: 'content',
          margin: [0, 0, 0, 20]
        }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          color: '#1e293b',
          margin: [0, 10, 0, 10]
        },
        subheader: {
          fontSize: 14,
          bold: true,
          color: '#3b82f6',
          margin: [0, 5, 0, 5]
        },
        tableExample: {
          margin: [0, 5, 0, 15]
        },
        tableHeader: {
          bold: true,
          fontSize: 12,
          color: '#1e293b',
          fillColor: '#f1f5f9'
        },
        content: {
          fontSize: 12,
          color: '#334155',
          lineHeight: 1.4
        }
      }
    };

    // Agregar sección de solución si el reporte está completado
    if (report.estado === 'Completado' && report.descripcionCompletado) {
      docDefinition.content.push(
        {
          text: 'Solución Aplicada',
          style: 'subheader',
          margin: [0, 20, 0, 10]
        },
        {
          text: report.descripcionCompletado,
          style: 'content',
          margin: [0, 0, 0, 20]
        }
      );

      // Materiales utilizados si están disponibles
      if (report.materialesUtilizados) {
        docDefinition.content.push(
          {
            text: 'Materiales Utilizados',
            style: 'subheader',
            margin: [0, 20, 0, 10]
          },
          {
            text: report.materialesUtilizados,
            style: 'content',
            margin: [0, 0, 0, 20]
          }
        );
      }
    }

    // Agregar sección para firma digital si existe
    if (report.firmaDigital) {
      docDefinition.content.push(
        {
          text: 'Firma Digital',
          style: 'subheader',
          margin: [0, 20, 0, 10]
        },
        {
          image: report.firmaDigital,
          width: 200,
          alignment: 'center',
          margin: [0, 0, 0, 10]
        },
        {
          text: `Firmado por: ${workerName}`,
          alignment: 'center',
          style: 'content',
          margin: [0, 0, 0, 5]
        },
        {
          text: `Fecha: ${this.formatDate(report.fechaCompletado || new Date())}`,
          alignment: 'center',
          style: 'content'
        }
      );
    }

    // Agregar evidencias si existen
    if (report.evidenceImages && report.evidenceImages.length > 0) {
      docDefinition.content.push(
        {
          text: 'Evidencias',
          style: 'subheader',
          margin: [0, 20, 0, 10]
        }
      );

      // Limitar a 3 evidencias para no sobrecargar el PDF
      const maxImages = Math.min(report.evidenceImages.length, 3);
      for (let i = 0; i < maxImages; i++) {
        try {
          docDefinition.content.push(
            {
              text: `Evidencia ${i + 1}:`,
              style: 'content',
              margin: [0, 5, 0, 5]
            },
            {
              image: report.evidenceImages[i],
              width: 300,
              alignment: 'center',
              margin: [0, 0, 0, 15]
            }
          );
        } catch (error) {
          console.error(`Error añadiendo imagen ${i + 1}:`, error);
          docDefinition.content.push({
            text: `[No se pudo incluir la imagen ${i + 1}]`,
            style: 'content',
            margin: [0, 5, 0, 5],
            color: '#ef4444'
          });
        }
      }

      // Indicar si hay más evidencias que no se muestran
      if (report.evidenceImages.length > maxImages) {
        docDefinition.content.push({
          text: `Hay ${report.evidenceImages.length - maxImages} evidencias adicionales no mostradas en este PDF.`,
          style: 'content',
          margin: [0, 5, 0, 15],
          italics: true
        });
      }
    }

    return docDefinition;
  }

  // Formatear fecha para el PDF
  private formatDate(date: any): string {
    if (!date) return new Date().toLocaleDateString('es-ES');
    
    try {
      // Si es un timestamp de Firestore
      if (date && typeof date === 'object' && 'seconds' in date) {
        return new Date(date.seconds * 1000).toLocaleDateString('es-ES');
      }
      
      // Si ya es Date
      if (date instanceof Date) {
        return date.toLocaleDateString('es-ES');
      }
      
      // Si es string
      return new Date(date).toLocaleDateString('es-ES');
    } catch (error) {
      console.error('Error formateando fecha:', error);
      return new Date().toLocaleDateString('es-ES');
    }
  }

  // Método para manejar la descarga de PDF
  downloadPdf(report: Reporte): Observable<boolean> {
    // Obtener datos necesarios para el PDF
    const workerName = this.getDefaultName(report.IdUsuario);
    const companyName = this.getDefaultName(report.IdEmpresa);
    const departmentName = report.departamento || 'No especificado';
    
    return this.generatePdfInBrowser(report, workerName, companyName, departmentName).pipe(
      map(safeUrl => {
        if (!safeUrl) return false;
        
        try {
          // Extraer URL del SafeUrl
          const urlStr = safeUrl.toString();
          const match = urlStr.match(/blob:http[^"']+/);
          
          if (match && match[0]) {
            // Crear enlace de descarga
            const link = document.createElement('a');
            link.href = match[0];
            link.download = `Reporte_${report.Tipo_Trabajo?.replace(/\s+/g, '_') || 'Trabajo'}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Limpiar blob URL después de un tiempo
            setTimeout(() => URL.revokeObjectURL(match[0]), 100);
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error en descarga de PDF:', error);
          return false;
        }
      }),
      catchError(() => of(false))
    );
  }
}