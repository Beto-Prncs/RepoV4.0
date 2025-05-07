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
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { Reporte, Usuario, Empresa, Departamento } from '../../models/interfaces';
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
  filteredTasks: Reporte[] = [];
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
  
  // Filtros
  empresas: Empresa[] = [];
  departamentos: Departamento[] = []; // Lista de departamentos para mapear IDs a nombres
  selectedEmpresa: string = 'Todas las empresas';
  selectedFecha: string = 'Todas las fechas';
  selectedPrioridad: string = 'Todas las prioridades';
  selectedDepartamento: string = 'Todos los departamentos'; // Nuevo filtro para departamentos
  searchQuery: string = '';
  
  // Fechas disponibles para filtrado
  fechasDisponibles: string[] = ['Todas las fechas', 'Hoy', 'Esta semana', 'Este mes'];
  
  // Prioridades disponibles para filtrado
  prioridadesDisponibles: string[] = ['Todas las prioridades', 'Alta', 'Media', 'Baja'];

  // Departamentos disponibles para filtrado
  departamentosDisponibles: string[] = ['Todos los departamentos'];
  
  ngOnInit(): void {
    this.setupAuthListener();
    this.loadEmpresas();
    this.loadDepartamentos(); // Cargar departamentos al iniciar
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
  
  // Cargar departamentos para el filtro
  loadDepartamentos(): void {
    const deptosRef = collection(this.firestore, 'Departamento');
    const subscription = collectionData(deptosRef, { idField: 'IdDepartamento' }).pipe(
      map((departamentos: any[]) => {
        this.departamentos = departamentos;
        this.departamentosDisponibles = ['Todos los departamentos', ...departamentos.map(d => d.Nombre)];
        console.log('Departamentos cargados:', this.departamentos);
      }),
      catchError(error => {
        console.error('Error al cargar departamentos:', error);
        return of(null);
      })
    ).subscribe();
    
    this.subscriptions.push(subscription);
  }
  
  // Cargar empresas para el filtro
  loadEmpresas(): void {
    const empresasRef = collection(this.firestore, 'Empresa');
    const subscription = collectionData(empresasRef, { idField: 'IdEmpresa' }).pipe(
      map((empresas: any[]) => {
        this.empresas = empresas;
        console.log('Empresas cargadas:', this.empresas);
      }),
      catchError(error => {
        console.error('Error al cargar empresas:', error);
        return of(null);
      })
    ).subscribe();
    
    this.subscriptions.push(subscription);
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
        this.applyFilters(); // Aplicar filtros iniciales
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
  
  // Método para obtener el nombre del departamento a partir del ID
  getDepartamentoName(departamentoId: string): string {
    const departamento = this.departamentos.find(d => d.IdDepartamento === departamentoId);
    return departamento ? departamento.Nombre : 'Departamento desconocido';
  }
  
  // Método para aplicar todos los filtros
  applyFilters(): void {
    let filteredResults = [...this.completedTasks];
    
    // Filtrar por empresa
    if (this.selectedEmpresa && this.selectedEmpresa !== 'Todas las empresas') {
      filteredResults = filteredResults.filter(task => 
        task.IdEmpresa === this.selectedEmpresa
      );
    }
    
    // Filtrar por fecha
    if (this.selectedFecha && this.selectedFecha !== 'Todas las fechas') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Domingo de esta semana
      
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      
      filteredResults = filteredResults.filter(task => {
        const taskDate = task.fechaCompletado ? new Date(task.fechaCompletado) : new Date(task.fecha);
        taskDate.setHours(0, 0, 0, 0);
        
        if (this.selectedFecha === 'Hoy') {
          return taskDate.getTime() === today.getTime();
        } else if (this.selectedFecha === 'Esta semana') {
          return taskDate >= weekStart;
        } else if (this.selectedFecha === 'Este mes') {
          return taskDate >= monthStart;
        }
        return true;
      });
    }
    
    // Filtrar por prioridad
    if (this.selectedPrioridad && this.selectedPrioridad !== 'Todas las prioridades') {
      filteredResults = filteredResults.filter(task => 
        task.priority === this.selectedPrioridad
      );
    }
    
    // Filtrar por departamento (usando el ID pero mostrando el nombre)
    if (this.selectedDepartamento && this.selectedDepartamento !== 'Todos los departamentos') {
      const selectedDept = this.departamentos.find(d => d.Nombre === this.selectedDepartamento);
      if (selectedDept) {
        filteredResults = filteredResults.filter(task => 
          task.departamento === selectedDept.IdDepartamento
        );
      }
    }
    
    // Filtrar por búsqueda
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filteredResults = filteredResults.filter(task => 
        (task.Tipo_Trabajo && task.Tipo_Trabajo.toLowerCase().includes(query)) ||
        (task.jobDescription && task.jobDescription.toLowerCase().includes(query)) ||
        (task.descripcionCompletado && task.descripcionCompletado.toLowerCase().includes(query)) ||
        (task.location && task.location.toLowerCase().includes(query)) ||
        (task.departamento && this.getDepartamentoName(task.departamento).toLowerCase().includes(query))
      );
    }
    
    this.filteredTasks = filteredResults;
  }
  
  // Métodos para actualizar filtros
  updateEmpresaFilter(empresa: string): void {
    this.selectedEmpresa = empresa;
    this.applyFilters();
  }
  
  updateFechaFilter(fecha: string): void {
    this.selectedFecha = fecha;
    this.applyFilters();
  }
  
  updatePrioridadFilter(prioridad: string): void {
    this.selectedPrioridad = prioridad;
    this.applyFilters();
  }
  
  updateDepartamentoFilter(departamento: string): void {
    this.selectedDepartamento = departamento;
    this.applyFilters();
  }
  
  updateSearchQuery(query: string): void {
    this.searchQuery = query;
    this.applyFilters();
  }
  
  clearFilters(): void {
    this.selectedEmpresa = 'Todas las empresas';
    this.selectedFecha = 'Todas las fechas';
    this.selectedPrioridad = 'Todas las prioridades';
    this.selectedDepartamento = 'Todos los departamentos';
    this.searchQuery = '';
    this.applyFilters();
  }
  
  // Método para volver atrás
  goBack(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
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
  
  private getSafeUrl(url: string): SafeUrl {
    try {
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } catch (error) {
      console.error('Error al sanitizar URL:', error);
      return '';
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
  
  // Obtener nombre de empresa
  getEmpresaName(empresaId: string): string {
    const empresa = this.empresas.find(e => e.IdEmpresa === empresaId);
    return empresa ? empresa.Nombre : 'Empresa';
  }
  
  // Abrir visor de PDF
  openPdfViewer(report: Reporte, event?: Event): void {
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
        // Usar bypassSecurityTrustResourceUrl para permitir la carga del PDF
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(report.pdfUrl);
        console.log('PDF cargado desde URL guardada:', report.pdfUrl);
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
      console.log('Intentando cargar PDF desde Storage para reporte:', report.IdReporte);
      
      const storage = getStorage();
      // Construir path al PDF basado en la estructura de carpetas
      const pdfPath = `reportes_pdf/${report.IdReporte}.pdf`;
      const pdfRef = ref(storage, pdfPath);
      
      console.log('Ruta del PDF en Storage:', pdfPath);
      
      // Obtener URL de descarga
      const downloadURL = await getDownloadURL(pdfRef);
      console.log('URL de descarga obtenida:', downloadURL);
      
      // Usar iframe directo con URL externa en lugar de objeto blob
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
      
      // Si falla la carga desde Storage, intentar obtener el PDF desde la URL guardada en Firestore
      if (report.pdfUrl) {
        console.log('Intentando usar URL guardada en el reporte:', report.pdfUrl);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(report.pdfUrl);
      } else {
        this.errorMessage = 'No se pudo cargar el PDF. El archivo podría no existir.';
        setTimeout(() => this.errorMessage = '', 5000);
      }
    } finally {
      this.isLoading = false;
    }
  }
  
  // Cerrar visor de PDF
  closePdfViewer(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (this.pdfUrl) {
      this.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.showPdfViewer = false;
    this.selectedReport = null;
  }
  
  // Iniciar descarga de PDF
  async startDownload(report: Reporte, event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!report || !report.IdReporte) {
      this.errorMessage = 'ID de reporte no disponible';
      return;
    }
    
    try {
      this.isLoading = true;
      
      let downloadURL = '';
      
      // Primero intentar usar la URL guardada en el reporte
      if (report.pdfUrl) {
        downloadURL = report.pdfUrl;
        console.log('Usando URL existente para descarga:', downloadURL);
      } else {
        // Si no hay URL guardada, obtenerla de Firebase Storage
        const storage = getStorage();
        const pdfPath = `reportes_pdf/${report.IdReporte}.pdf`;
        const pdfRef = ref(storage, pdfPath);
        
        downloadURL = await getDownloadURL(pdfRef);
        console.log('URL obtenida de Storage para descarga:', downloadURL);
      }
      
      // Abrir en nueva pestaña en lugar de usar elemento 'a'
      window.open(downloadURL, '_blank');
      
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
  
  private createSafePdfLink(url: string, fileName: string): HTMLAnchorElement {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank'; // Esto evita que la página actual se recargue
    link.rel = 'noopener noreferrer'; // Buena práctica de seguridad
    return link;
  }
  
  private preventDefaultAndExecute(event: Event | undefined, callback: Function): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    callback();
  }
  
  // Verificar si el reporte tiene imágenes
  hasImages(report: Reporte): boolean {
    return report.evidenceImages && Array.isArray(report.evidenceImages) && report.evidenceImages.length > 0;
  }
  
  // Obtener conteo de imágenes
  getImageCount(report: Reporte): number {
    return report.evidenceImages && Array.isArray(report.evidenceImages) ? report.evidenceImages.length : 0;
  }
}