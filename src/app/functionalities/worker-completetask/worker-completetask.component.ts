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
import { Subscription, BehaviorSubject, from, Observable, of } from 'rxjs';
import { map, catchError, tap, take } from 'rxjs/operators';
import { Reporte, Usuario, Empresa } from '../../models/interfaces';
import { TaskService } from '../../services/task.service';
import { Storage, ref, getDownloadURL } from '@angular/fire/storage';

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
  private storage: Storage = inject(Storage);

  // Estados del componente
  completedTasks: Reporte[] = [];
  filteredTasks: Reporte[] = [];
  currentUser: Usuario | null = null;
  isLoading: boolean = true;
  errorMessage: string = '';
  successMessage: string = '';
  searchTerm: string = '';
  
  // Para el visor de PDF
  showPdfViewer: boolean = false;
  pdfUrl: SafeUrl | null = null;
  selectedReport: Reporte | null = null;
  
  // Datos de entidades y cache para empresas
  companyNamesCache = new Map<string, string>();
  companies$: BehaviorSubject<Empresa[]> = new BehaviorSubject<Empresa[]>([]);
  
  // Filtros 
  selectedCompany: string = '';
  selectedDateFilter: string = '';
  
  // Para almacenar suscripciones y liberarlas en el destroy
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    console.log('Initializing WorkerCompleteTaskComponent');
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

  private loadCompletedReportes(userId: string): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    console.log('Cargando reportes completados para usuario:', userId);
    
    // First, check if there are any completed reports in Firestore
    this.taskService.getReportesByStatus('Completado').pipe(
      take(1),
      tap(allCompletedReports => {
        console.log('Total completed reports in database:', allCompletedReports.length);
      })
    ).subscribe();
    
    // Usar el servicio de tareas para obtener reportes completados
    const subscription = this.taskService.getCompletedReportesByWorker(userId).pipe(
      tap(reportes => {
        console.log('Reportes completados recibidos:', reportes);
        this.completedTasks = reportes; // TaskService ya procesa las fechas
        this.filteredTasks = [...this.completedTasks]; // Inicializar lista filtrada
        this.applyFilters(); // Aplica filtros iniciales
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

  // Aplicar filtros a los reportes
  applyFilters(): void {
    let filtered = [...this.completedTasks];
    
    // Filtrar por empresa si hay una seleccionada
    if (this.selectedCompany) {
      filtered = filtered.filter(task => task.IdEmpresa === this.selectedCompany);
    }
    
    // Filtrar por fecha si está seleccionado
    if (this.selectedDateFilter) {
      filtered = this.applyDateFilter(filtered);
    }
    
    // Filtrar por término de búsqueda
    if (this.searchTerm?.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(task => {
        return (
          (task.Tipo_Trabajo?.toLowerCase().includes(searchLower)) ||
          (task.jobDescription?.toLowerCase().includes(searchLower)) ||
          (task.descripcionCompletado?.toLowerCase().includes(searchLower)) ||
          (this.getCompanyName(task.IdEmpresa).toLowerCase().includes(searchLower))
        );
      });
    }
    
    this.filteredTasks = filtered;
  }

  // Método separado para aplicar filtros de fecha
  private applyDateFilter(reports: Reporte[]): Reporte[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    return reports.filter(report => {
      // Usar la fecha de completado para filtrar
      const reportDate = new Date(report.fechaCompletado || report.fecha);
      reportDate.setHours(0, 0, 0, 0);

      switch (this.selectedDateFilter) {
        case 'today':
          return this.isSameDay(reportDate, today);
        case 'yesterday':
          return this.isSameDay(reportDate, yesterday);
        case 'week':
          return reportDate >= lastWeek;
        case 'month':
          return reportDate >= lastMonth;
        default:
          return true;
      }
    });
  }
  
  // Verificar si dos fechas son el mismo día
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  }

  resetFilters(): void {
    this.selectedCompany = '';
    this.selectedDateFilter = '';
    this.searchTerm = '';
    this.filteredTasks = [...this.completedTasks];
  }
  
  // Método para volver atrás
  goBack(): void {
    this.router.navigate(['/worker']);
  }
  
  // Formatear fecha para mostrar
  formatDate(date: any): string {
    if (!date) return 'Fecha no disponible';
    
    try {
      // Ya no necesitamos manejar Timestamp aquí
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
  
  // Obtener nombre de empresa del caché
  getCompanyName(idEmpresa: string): string {
    return this.companyNamesCache.get(idEmpresa) || 'Empresa no disponible';
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
  openPdfViewer(report: Reporte): void {
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

  // Cerrar visor de PDF
  closePdfViewer(): void {
    if (this.pdfUrl) {
      this.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.showPdfViewer = false;
    this.selectedReport = null;
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
  
  // Cargar PDF desde Firebase Storage
  private async loadPdfFromStorage(report: Reporte): Promise<void> {
    if (!report.IdReporte) {
      this.errorMessage = 'ID de reporte no disponible';
      this.closePdfViewer();
      return;
    }
    
    try {
      // Usar el método existente en TaskService para obtener la URL del PDF
      const downloadURL = await this.taskService.getPdfUrlForReporte(report.IdReporte);
      
      if (downloadURL) {
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(downloadURL);
        
        // Actualizar el reporte en la lista local si la URL es nueva
        if (!report.pdfUrl) {
          const index = this.completedTasks.findIndex(t => t.IdReporte === report.IdReporte);
          if (index !== -1) {
            this.completedTasks[index] = {
              ...this.completedTasks[index],
              pdfUrl: downloadURL
            };
            
            // Actualizar también la lista filtrada
            const filteredIndex = this.filteredTasks.findIndex(t => t.IdReporte === report.IdReporte);
            if (filteredIndex !== -1) {
              this.filteredTasks[filteredIndex] = {
                ...this.filteredTasks[filteredIndex],
                pdfUrl: downloadURL
              };
            }
          }
        }
      } else {
        throw new Error('No se pudo obtener la URL del PDF');
      }
    } catch (error) {
      console.error('Error al cargar PDF desde Storage:', error);
      this.errorMessage = 'No se pudo cargar el PDF. El archivo podría no existir.';
      setTimeout(() => this.errorMessage = '', 5000);
    } finally {
      this.isLoading = false;
    }
  }
  
  // Iniciar descarga de PDF
  async startDownload(report: Reporte): Promise<void> {
    if (!report.IdReporte) {
      this.errorMessage = 'ID de reporte no disponible';
      return;
    }
    
    try {
      this.isLoading = true;
      
      // Usar el método existente en TaskService para obtener la URL del PDF
      const downloadURL = await this.taskService.getPdfUrlForReporte(report.IdReporte);
      
      if (!downloadURL) {
        throw new Error('No se encontró el PDF');
      }
      
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
  
  // Verificar si un reporte tiene imágenes de evidencia
  hasEvidenceImages(report: Reporte): boolean {
    return report && Array.isArray(report.evidenceImages) && report.evidenceImages.length > 0;
  }
  
  // Obtener el número de imágenes de evidencia
  getEvidenceCount(report: Reporte): number {
    return report && Array.isArray(report.evidenceImages) ? report.evidenceImages.length : 0;
  }
  
  // Verificar si el reporte tiene firma digital
  hasSignature(report: Reporte): boolean {
    return Boolean(report && report.firmaDigital);
  }
  
  // Verificar si el reporte tiene materiales 
  hasMaterials(report: Reporte): boolean {
    return Boolean(report && report.materialesUtilizados && report.materialesUtilizados.trim() !== '');
  }
  
  // Buscar reportes con término de búsqueda
  onSearchChange(): void {
    this.applyFilters();
  }
  
  // Cargar empresas para el filtro
  private loadCompanies(): void {
    const companiesRef = collection(this.firestore, 'Empresa');
    
    const companiesSub = collectionData(
      companiesRef,
      { idField: 'IdEmpresa' }
    ).pipe(
      take(1),
      map(data => data as Empresa[]),
      tap(companies => {
        // Precarga el cache de nombres de empresas
        companies.forEach(company => {
          this.companyNamesCache.set(company.IdEmpresa, company.Nombre);
        });
        this.companies$.next(companies);
      }),
      catchError(error => {
        console.error('Error al cargar empresas:', error);
        return of([]);
      })
    ).subscribe();
    
    this.subscriptions.push(companiesSub);
  }
  
  // Configurar listener de autenticación
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
  
  // Cargar datos del usuario
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
          // Cargar reportes completados del trabajador
          this.loadCompletedReportes(this.currentUser.IdUsuario);
          
          // Cargar empresas para filtrado
          this.loadCompanies();
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
}