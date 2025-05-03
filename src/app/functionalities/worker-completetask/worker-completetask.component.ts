import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule} from '@angular/router';
import { TaskService } from '../../services/task.service';
import { Auth } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { Reporte } from '../../models/interfaces';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PdfViewerModule } from 'ng2-pdf-viewer';

@Component({
  selector: 'app-worker-completetask',
  standalone: true,
  imports: [CommonModule, RouterModule, PdfViewerModule],
  templateUrl: './worker-completetask.component.html',
  styleUrl: './worker-completetask.component.scss'
})
export class WorkerCompleteTaskComponent implements OnInit, OnDestroy {
  private taskService: TaskService = inject(TaskService);
  private router: Router = inject(Router);
  private auth: Auth = inject(Auth);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  
  completedTasks: Reporte[] = [];
  private subscription = new Subscription();
  isLoading = true;
  errorMessage = '';
  successMessage = '';
  
  // PDF viewer properties
  selectedReport: Reporte | null = null;
  showPdfViewer = false;
  pdfUrl: SafeResourceUrl | null = null;
  
  ngOnInit() {
    console.log('Inicializando componente worker-completetask');
    this.setupAuthListener();
  }
  
  private setupAuthListener(): void {
    const authSub = this.auth.onAuthStateChanged(user => {
      if (user) {
        console.log('Usuario autenticado:', user.uid);
        this.loadCompletedTasks(user.uid);
      } else {
        console.log('No hay usuario autenticado');
        this.router.navigate(['/login']);
      }
    });
    
    if (authSub) {
      this.subscription.add(new Subscription(() => authSub()));
    }
  }
  
  private loadCompletedTasks(userId: string): void {
    const tasksSub = this.taskService.getCompletedReportesByWorker(userId)
      .subscribe({
        next: (reportes) => {
          console.log('Reportes completados recibidos:', reportes.length);
          this.completedTasks = reportes;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar reportes completados:', error);
          this.showError('Error al cargar los reportes completados');
          this.isLoading = false;
        }
      });
      
    this.subscription.add(tasksSub);
  }
  
  convertToDate(fecha: Date | Timestamp): Date {
    if (fecha instanceof Timestamp) {
      return fecha.toDate();
    }
    return fecha as Date;
  }
  
  formatDate(date: Date | Timestamp): string {
    const dateObj = this.convertToDate(date);
    return new Intl.DateTimeFormat('es', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(dateObj);
  }
  
  getStatusClass(estado: string): string {
    switch (estado?.toLowerCase() || '') {
      case 'completado':
        return 'status-completed';
      case 'pendiente': 
        return 'status-pending';
      default:
        return 'status-default';
    }
  }
  
  getPriorityClass(priority: string): string {
    switch (priority?.toLowerCase() || '') {
      case 'alta':
        return 'priority-high';
      case 'media':
        return 'priority-medium';
      case 'baja':
        return 'priority-low';
      default:
        return 'priority-default';
    }
  }
  
  // Método para abrir el visor de PDF
  openPdfViewer(report: Reporte, event: MouseEvent): void {
    // Prevenir la propagación del evento para evitar recarga de página
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!report) {
      this.showError('Reporte no válido');
      return;
    }
    
    console.log('Abriendo visor de PDF para reporte:', report.IdReporte);
    this.isLoading = true;
    this.selectedReport = report;

    // Usar una función asíncrona interna para manejar la carga del PDF
    (async () => {
      try {
        let pdfUrlValue = report.pdfUrl;
        
        // Si no hay URL almacenada pero sí tenemos ID de reporte, buscar en Storage
        if (!pdfUrlValue && report.IdReporte) {
          try {
            pdfUrlValue = await this.taskService.getPdfUrlForReporte(report.IdReporte);
            
            if (pdfUrlValue) {
              // Actualizar el reporte con la URL obtenida
              await this.taskService.updateReporteWithPdfInfo(report.IdReporte, pdfUrlValue);
              console.log('Reporte actualizado con URL de PDF:', pdfUrlValue);
            }
          } catch (error) {
            console.error('Error al obtener URL del PDF:', error);
          }
        }
        
        if (pdfUrlValue) {
          this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfUrlValue);
          this.showPdfViewer = true;
          console.log('Mostrando visor de PDF');
        } else {
          this.showError('No se encontró el PDF para este reporte');
        }
      } catch (error) {
        console.error('Error al procesar el PDF:', error);
        this.showError('Error al cargar el PDF');
      } finally {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    })();
  }
  
  // Método para descargar el PDF
  startDownload(report: Reporte | null, event: MouseEvent): void {
    // Prevenir la propagación del evento para evitar recarga de página
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!report) {
      this.showError('No hay reporte seleccionado');
      return;
    }
    
    console.log('Iniciando descarga para reporte:', report.IdReporte);
    this.isLoading = true;

    // Usar una función asíncrona interna para manejar la descarga
    (async () => {
      try {
        let pdfUrlValue = report.pdfUrl;
        
        // Si no hay URL almacenada pero sí tenemos ID de reporte, buscar en Storage
        if (!pdfUrlValue && report.IdReporte) {
          try {
            pdfUrlValue = await this.taskService.getPdfUrlForReporte(report.IdReporte);
            
            if (pdfUrlValue) {
              // Actualizar el reporte con la URL obtenida
              await this.taskService.updateReporteWithPdfInfo(report.IdReporte, pdfUrlValue);
            }
          } catch (error) {
            console.error('Error al obtener URL del PDF:', error);
          }
        }
        
        if (pdfUrlValue) {
          // Crear un enlace temporal para descargar
          const link = document.createElement('a');
          link.href = pdfUrlValue;
          link.target = '_blank';
          link.download = `Reporte_${report.Tipo_Trabajo.replace(/\s+/g, '_')}.pdf`;
          
          // Añadir el enlace al documento, hacer clic y luego eliminarlo
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            this.showSuccess('Descarga iniciada');
          }, 100);
        } else {
          this.showError('No se encontró el PDF para este reporte');
        }
      } catch (error) {
        console.error('Error al descargar el PDF:', error);
        this.showError('Error al descargar el PDF');
      } finally {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    })();
  }
  
  // Cerrar el visor de PDF
  closePdfViewer(): void {
    this.showPdfViewer = false;
    this.pdfUrl = null;
    this.selectedReport = null;
    this.cdr.detectChanges();
  }
  
  private showError(message: string): void {
    this.errorMessage = message;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.errorMessage = '';
      this.cdr.detectChanges();
    }, 5000);
  }
  
  private showSuccess(message: string): void {
    this.successMessage = message;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.successMessage = '';
      this.cdr.detectChanges();
    }, 3000);
  }
  
  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
  
  goBack(): void {
    this.router.navigate(['/worker']);
  }
}