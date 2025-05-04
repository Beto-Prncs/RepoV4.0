import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { 
  Firestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  collectionData,
  doc,
  getDoc
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { Subscription, BehaviorSubject, from } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Reporte, Usuario } from '../../models/interfaces';
import { TaskService } from '../../services/task.service';
import { getStorage, ref, getDownloadURL } from '@angular/fire/storage';

@Component({
  selector: 'app-worker-completetask',
  standalone: true,
  imports: [CommonModule, FormsModule, PdfViewerModule],
  templateUrl: './worker-completetask.component.html',
  styleUrl: './worker-completetask.component.scss'
})
export class WorkerCompleteTaskComponent implements OnInit, OnDestroy {
  // Inyección de servicios
  private firestore: Firestore = inject(Firestore);
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);
  private taskService: TaskService = inject(TaskService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);

  // Estados del componente
  completedTasks: Reporte[] = [];
  currentUser: Usuario | null = null;
  isLoading: boolean = true;
  errorMessage: string = '';
  successMessage: string = '';
  
  // Para el visor de PDF
  showPdfViewer: boolean = false;
  pdfUrl: SafeUrl | null = null;
  selectedReport: Reporte | null = null;
  
  // Para almacenar suscripciones y liberarlas en el destroy
  private subscriptions: Subscription[] = [];
  
  ngOnInit(): void {
    this.setupAuthListener();
  }
  
  ngOnDestroy(): void {
    // Desuscribir para evitar memory leaks
    this.subscriptions.forEach(sub => {
      if (sub) sub.unsubscribe();
    });
    
    // Liberar recursos URL
    if (this.pdfUrl) {
      this.revokeObjectURL(this.pdfUrl);
    }
  }
  
  // Revocar URL para liberar memoria
  private revokeObjectURL(safeUrl: SafeUrl): void {
    try {
      const urlStr = safeUrl.toString();
      const match = urlStr.match(/blob:http[^"']+/);
      if (match && match[0]) {
        URL.revokeObjectURL(match[0]);
      }
    } catch (error) {
      console.error('Error al revocar URL:', error);
    }
  }
  
  private setupAuthListener(): void {
    const authSub = this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log('Usuario autenticado:', user.email);
        try {
          await this.loadUserData(user.uid);
        } catch (error) {
          console.error('Error en la inicialización:', error);
          this.errorMessage = 'Error al cargar los datos del usuario';
        }
      } else {
        console.log('No hay usuario autenticado');
        this.router.navigate(['/login']);
      }
    });
    
    if (authSub) {
      this.subscriptions.push(new Subscription(() => authSub()));
    }
  }
  
  private async loadUserData(userId: string): Promise<void> {
    try {
      console.log('Cargando datos del usuario:', userId);
      const userDoc = await getDoc(doc(this.firestore, 'Usuario', userId));
      
      if (userDoc.exists()) {
        this.currentUser = {
          ...userDoc.data() as Usuario,
          IdUsuario: userId
        };
        
        console.log('Datos de usuario cargados:', this.currentUser);
        
        if (this.currentUser.IdUsuario) {
          this.loadCompletedReportes(this.currentUser.IdUsuario);
        } else {
          throw new Error('Usuario sin ID válido');
        }
      } else {
        throw new Error('No se encontró el documento del usuario');
      }
    } catch (error) {
      console.error('Error al cargar datos del usuario:', error);
      this.errorMessage = 'Error al cargar los datos del usuario';
      this.isLoading = false;
    }
  }
  
  // Cargar reportes completados
  private loadCompletedReportes(userId: string): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    // Usar el servicio de tareas para obtener reportes completados
    const subscription = this.taskService.getCompletedReportesByWorker(userId).pipe(
      tap(reportes => {
        console.log('Reportes completados recibidos:', reportes);
        this.completedTasks = reportes;
        this.isLoading = false;
      }),
      catchError(error => {
        console.error('Error al cargar reportes completados:', error);
        this.errorMessage = 'Error al cargar los reportes completados';
        this.isLoading = false;
        return from([]);
      })
    ).subscribe();
    
    this.subscriptions.push(subscription);
  }
  
  // Método para volver atrás
  goBack(): void {
    this.router.navigate(['/worker']);
  }
  
  // Formatear fecha para mostrar
  formatDate(date: any): string {
    if (!date) return 'Fecha no disponible';
    
    try {
      // Si es un timestamp de Firestore
      if (date && typeof date === 'object' && 'seconds' in date) {
        date = new Date(date.seconds * 1000);
      }
      // Si es una string o un objeto Date
      const dateObj = date instanceof Date ? date : new Date(date);
      
      return dateObj.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return 'Fecha inválida';
    }
  }
  
  // Determinar clase CSS según el estado
  getStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'completado':
        return 'completed';
      case 'pendiente':
        return 'pending';
      default:
        return 'default';
    }
  }
  
  // Determinar clase CSS según la prioridad
  getPriorityClass(priority: string): string {
    switch (priority?.toLowerCase()) {
      case 'alta':
        return 'high';
      case 'media':
        return 'medium';
      case 'baja':
        return 'low';
      default:
        return 'default';
    }
  }
  
  // Abrir visor de PDF
  openPdfViewer(report: Reporte, event: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    this.isLoading = true;
    this.selectedReport = report;
    this.showPdfViewer = true;
    
    // Primero intentar obtener el PDF desde la URL almacenada
    if (report.pdfUrl) {
      try {
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(report.pdfUrl);
        this.isLoading = false;
      } catch (error) {
        console.error('Error al cargar URL del PDF:', error);
        this.loadPdfFromStorage(report);
      }
    } else {
      // Si no hay URL directa, intentar cargar desde Storage
      this.loadPdfFromStorage(report);
    }
  }
  
  // Cargar PDF desde Firebase Storage
  private async loadPdfFromStorage(report: Reporte): Promise<void> {
    if (!report.IdReporte) {
      this.errorMessage = 'ID de reporte no disponible';
      this.closePdfViewer();
      return;
    }
    
    try {
      const storage = getStorage();
      // Construir path al PDF basado en la estructura de carpetas
      const pdfPath = `reportes_pdf/${report.IdReporte}.pdf`;
      const pdfRef = ref(storage, pdfPath);
      
      // Obtener URL de descarga
      const downloadURL = await getDownloadURL(pdfRef);
      this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(downloadURL);
      
      // Si no tenemos la URL almacenada, actualizar el documento
      if (!report.pdfUrl) {
        try {
          await this.taskService.updateReporteWithPdfInfo(report.IdReporte, downloadURL);
          console.log('URL de PDF actualizada en el reporte');
        } catch (updateError) {
          console.error('Error al actualizar URL de PDF en el reporte:', updateError);
        }
      }
    } catch (error) {
      console.error('Error al cargar PDF desde Storage:', error);
      this.errorMessage = 'No se pudo cargar el PDF. El archivo podría no existir.';
      setTimeout(() => this.errorMessage = '', 5000);
    } finally {
      this.isLoading = false;
    }
  }
  
  // Cerrar visor de PDF
  closePdfViewer(): void {
    if (this.pdfUrl) {
      this.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.showPdfViewer = false;
    this.selectedReport = null;
  }
  
  // Iniciar descarga de PDF
  async startDownload(report: Reporte, event: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!report.IdReporte) {
      this.errorMessage = 'ID de reporte no disponible';
      return;
    }
    
    try {
      this.isLoading = true;
      const storage = getStorage();
      const pdfPath = `reportes_pdf/${report.IdReporte}.pdf`;
      const pdfRef = ref(storage, pdfPath);
      
      // Obtener URL de descarga
      const downloadURL = await getDownloadURL(pdfRef);
      
      // Crear elemento a para descarga
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadURL;
      downloadLink.download = `Reporte_${report.Tipo_Trabajo.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      this.successMessage = 'Descarga iniciada correctamente';
      setTimeout(() => this.successMessage = '', 3000);
    } catch (error) {
      console.error('Error al descargar PDF:', error);
      this.errorMessage = 'Error al descargar el PDF';
      setTimeout(() => this.errorMessage = '', 5000);
    } finally {
      this.isLoading = false;
    }
  }
}