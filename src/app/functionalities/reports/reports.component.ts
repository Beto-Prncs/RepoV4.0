import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Firestore, collection, collectionData, query, where, orderBy } from '@angular/fire/firestore';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { Observable, BehaviorSubject, combineLatest, of, Subject } from 'rxjs';
import { map, take, catchError, finalize, debounceTime, distinctUntilChanged, tap, takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../services/task.service';
import { AuthService } from '../../services/auth.service';
import { Reporte, Empresa, Usuario } from '../../models/interfaces';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { HttpClientModule } from '@angular/common/http';

// Importar servicios auxiliares
import { ReportsCacheService } from '../../services/auxiliar-services/reports-cache.service';
import { ReportsFilterService } from '../../services/auxiliar-services/reports-filter.service';
import { PdfGeneratorService } from '../../services/auxiliar-services/pdf-generator.service';
import { PaginationService } from '../../services/auxiliar-services/pagination.service';

interface WorkersByDepartment {
  departamento: string;
  workers: Usuario[];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    NgxExtendedPdfViewerModule,
    HttpClientModule
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit, OnDestroy {
  successMessage: string = '';
  // Inyecciones
  private firestore: Firestore = inject(Firestore);
  private taskService: TaskService = inject(TaskService);
  private authService: AuthService = inject(AuthService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private router: Router = inject(Router);
  private location: Location = inject(Location);
  
  // Inyección de los nuevos servicios
  private reportsCacheService = inject(ReportsCacheService);
  private reportsFilterService = inject(ReportsFilterService);
  private pdfGeneratorService = inject(PdfGeneratorService);
  private paginationService = inject(PaginationService);
  
  // Estado del componente
  currentView: 'pending' | 'completed' = 'pending';
  filteredReports: Reporte[] = [];
  paginatedReports: Reporte[] = [];
  allReports: Reporte[] = []; // Almacena todos los reportes para filtrado local
  selectedReport: Reporte | null = null;
  safePdfUrl: SafeUrl | null = null;
  searchTerm: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';
  
  // Datos de entidades y cache
  companyNamesCache = new Map<string, string>();
  workerNamesCache = new Map<string, string>();
  workerDepartmentCache = new Map<string, string>();
  
  // Observables de entidades
  companies$ = new BehaviorSubject<Empresa[]>([]);
  workers$ = new BehaviorSubject<Usuario[]>([]);
  workersByDepartment$ = new BehaviorSubject<WorkersByDepartment[]>([]);
  
  // Filtros
  selectedCompany: string = '';
  selectedWorker: string = '';
  selectedPriority: string = '';
  selectedDateFilter: string = '';
  selectedDepartment: string = '';
  
  // Opciones disponibles
  availablePriorities: string[] = ['Alta', 'Media', 'Baja'];
  availableDepartments: string[] = [];
  
  // Gestión de suscripciones
  private destroy$ = new Subject<void>();
  private searchTerms = new Subject<string>();
  
  // Variables de paginación
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;
  
  ngOnInit(): void {
    this.isLoading = true;
    
    // Inicializar paginación
    this.paginationService.setItemsPerPage(this.itemsPerPage);
    
    // Suscribirse a cambios de paginación
    this.paginationService.currentPage$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(page => {
      this.currentPage = page;
      this.updatePaginatedReports();
    });
    
    // Configurar búsqueda con debounce
    this.setupSearchObservable();
    
    // Cargar datos iniciales
    this.loadInitialData();
  }
  
  ngOnDestroy(): void {
    // Señal para finalizar todas las suscripciones
    this.destroy$.next();
    this.destroy$.complete();
    
    // Liberar recursos URL
    if (this.safePdfUrl) {
      this.revokeObjectURL(this.safePdfUrl);
    }
  }
  
  // Navegar hacia atrás
  goBack(): void {
    this.location.back();
  }
  
  // Extraer y revocar URL de un SafeUrl
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
  
  // Configurar observable para búsquedas con debounce
  private setupSearchObservable(): void {
    this.searchTerms.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.applyFilters()),
      takeUntil(this.destroy$)
    ).subscribe();
  }
  
  // Carga inicial de datos
  private loadInitialData(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    // Verificar si ya tenemos datos en caché
    if (this.reportsCacheService.isCacheInitialized()) {
      this.initializeFromCache();
      return;
    }
    
    // Cargar empresas y trabajadores una sola vez
    combineLatest([
      // Empresas
      collectionData(
        collection(this.firestore, 'Empresa'),
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
          this.reportsCacheService.setCachedEmpresas(companies);
        }),
        catchError(error => {
          console.error('Error al cargar empresas:', error);
          this.errorMessage = 'Error al cargar datos de empresas.';
          return of([]);
        })
      ),
      
      // Trabajadores
      collectionData(
        collection(this.firestore, 'Usuario'),
        { idField: 'IdUsuario' }
      ).pipe(
        take(1),
        map(users => users.filter(user => user['Rol'] === 'worker') as Usuario[]),
        tap(workers => {
          // Precarga el cache de nombres de trabajadores y departamentos
          workers.forEach(worker => {
            this.workerNamesCache.set(worker.IdUsuario, worker.Nombre);
            this.workerDepartmentCache.set(worker.IdUsuario, worker.Departamento);
          });
          
          // Organizar trabajadores por departamento
          const departments = [...new Set(workers.map(w => w.Departamento))];
          this.availableDepartments = departments;
          
          const workersByDept = departments.map(dept => ({
            departamento: dept,
            workers: workers.filter(w => w.Departamento === dept)
          }));
          
          this.workersByDepartment$.next(workersByDept);
          this.workers$.next(workers);
          this.reportsCacheService.setCachedUsuarios(workers);
        }),
        catchError(error => {
          console.error('Error al cargar trabajadores:', error);
          this.errorMessage = 'Error al cargar datos de trabajadores.';
          return of([]);
        })
      )
    ]).pipe(
      finalize(() => {
        // Al completar la carga de entidades, cargar reportes
        this.loadReportsFromServer();
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }
  
  // Inicializar datos desde caché
  private initializeFromCache(): void {
    const companies = this.reportsCacheService.getAllCachedEmpresas();
    const workers = this.reportsCacheService.getAllCachedUsuarios();
    const reportes = this.reportsCacheService.getAllCachedReportes();
    
    // Actualizar caches
    companies.forEach(company => {
      this.companyNamesCache.set(company.IdEmpresa, company.Nombre);
    });
    
    workers.forEach(worker => {
      this.workerNamesCache.set(worker.IdUsuario, worker.Nombre);
      this.workerDepartmentCache.set(worker.IdUsuario, worker.Departamento);
    });
    
    // Actualizar observables
    this.companies$.next(companies);
    this.workers$.next(workers);
    
    // Departamentos
    const departments = this.reportsCacheService.getCachedDepartamentos();
    this.availableDepartments = departments;
    
    const workersByDept = departments.map(dept => ({
      departamento: dept,
      workers: workers.filter(w => w.Departamento === dept)
    }));
    
    this.workersByDepartment$.next(workersByDept);
    
    // Actualizar reportes
    this.allReports = reportes;
    this.applyFilters();
    this.isLoading = false;
  }
  
  // Carga de reportes desde el servidor con optimizaciones
  private loadReportsFromServer(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    // Verificar usuario actual y permisos
    this.authService.getCurrentUser().then(user => {
      if (!user) {
        this.errorMessage = 'Usuario no autenticado';
        this.isLoading = false;
        return;
      }
      
      // Verificar nivel de administrador para filtrar reportes
      this.taskService.getFilteredReportes().then(reportesObservable => {
        reportesObservable.pipe(
          take(1),
          tap(reportes => {
            this.allReports = reportes;
            
            // Guardar en caché
            const cacheKey = this.currentView;
            this.reportsCacheService.setCachedReportes(cacheKey, reportes);
            
            // Aplicar filtros locales y paginación
            this.applyFilters();
          }),
          catchError(error => {
            console.error('Error al cargar reportes:', error);
            this.errorMessage = 'Error al cargar los reportes. Por favor, intenta nuevamente.';
            this.filteredReports = [];
            this.allReports = [];
            return of([]);
          }),
          finalize(() => {
            this.isLoading = false;
          })
        ).subscribe();
      }).catch(error => {
        console.error('Error al obtener reportes filtrados:', error);
        this.errorMessage = 'Error al obtener reportes filtrados';
        this.isLoading = false;
      });
    });
  }
  
  // Aplicar filtros y paginación
  applyFilters(): void {
    // Usar el servicio de filtrado
    this.filteredReports = this.reportsFilterService.applyFilters(
      this.allReports,
      this.searchTerm,
      this.selectedCompany,
      this.selectedWorker,
      this.selectedPriority,
      this.selectedDateFilter,
      this.selectedDepartment,
      this.currentView
    );
    
    // Actualizar paginación
    this.paginationService.calculateTotalPages(this.filteredReports.length);
    this.totalPages = this.paginationService.getTotalPages();
    
    // Resetear a la primera página cuando cambian los filtros
    this.paginationService.resetPagination();
    
    // Actualizar reportes paginados
    this.updatePaginatedReports();
  }
  
  // Actualizar la lista paginada de reportes
  private updatePaginatedReports(): void {
    this.paginatedReports = this.paginationService.paginateItems(this.filteredReports);
  }
  
  // Métodos de navegación de paginación
  nextPage(): void {
    this.paginationService.nextPage();
  }
  
  previousPage(): void {
    this.paginationService.previousPage();
  }
  
  goToPage(page: number): void {
    this.paginationService.goToPage(page);
  }
  
  onSearchChange(): void {
    this.searchTerms.next(this.searchTerm);
  }
  
  // Cambiar vista entre pendientes y completados
  setView(view: 'pending' | 'completed'): void {
    if (this.currentView !== view) {
      this.currentView = view;
      
      // Verificar si tenemos los datos en caché
      const cachedReportes = this.reportsCacheService.getCachedReportes(view);
      
      if (cachedReportes) {
        // Usar datos de caché
        this.allReports = cachedReportes;
        this.applyFilters();
      } else {
        // Recargar desde el servidor
        this.loadReportsFromServer();
      }
    }
  }
  
  // Actualizaciones para departamentos
  onDepartmentChange(): void {
    if (this.selectedDepartment) {
      this.applyFilters();
    } else {
      this.applyFilters();
    }
  }
  
  // Limpiar filtros
  resetFilters(): void {
    this.selectedCompany = '';
    this.selectedWorker = '';
    this.selectedPriority = '';
    this.selectedDateFilter = '';
    this.selectedDepartment = '';
    this.searchTerm = '';
    this.searchTerms.next('');
    
    // Aplicar filtros con valores limpios
    this.applyFilters();
  }
  
  // Obtener nombres usando el caché
  getCompanyName(idEmpresa: string): string {
    return this.companyNamesCache.get(idEmpresa) || 'Empresa no disponible';
  }
  
  getWorkerName(idUsuario: string): string {
    return this.workerNamesCache.get(idUsuario) || 'Trabajador no disponible';
  }
  
  getWorkerDepartment(idUsuario: string): string {
    return this.workerDepartmentCache.get(idUsuario) || 'Departamento no disponible';
  }
  
  // Vista previa del reporte con PDF mejorado
  openPdfPreview(report: Reporte): void {
    this.selectedReport = report;
    this.isLoading = true;
    
    // Usar el servicio de PDF optimizado para generar en el navegador
    this.pdfGeneratorService.generatePdfInBrowser(
      report,
      this.getWorkerName(report.IdUsuario),
      this.getCompanyName(report.IdEmpresa),
      this.getWorkerDepartment(report.IdUsuario)
    ).subscribe({
      next: (safeUrl) => {
        if (safeUrl) {
          this.safePdfUrl = safeUrl;
        } else {
          this.errorMessage = 'No se pudo generar el PDF';
          setTimeout(() => this.errorMessage = '', 3000);
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error al generar PDF:', error);
        this.errorMessage = 'Error al generar el PDF';
        setTimeout(() => this.errorMessage = '', 3000);
        this.isLoading = false;
      }
    });
  }
  
  closePreview(): void {
    if (this.safePdfUrl) {
      this.revokeObjectURL(this.safePdfUrl);
      this.safePdfUrl = null;
    }
    this.selectedReport = null;
  }
  
  // Método para descargar PDF optimizado
  downloadPDF(report: Reporte): void {
    this.isLoading = true;
    
    this.pdfGeneratorService.downloadPdf(report).subscribe({
      next: (success) => {
        if (success) {
          this.successMessage = 'PDF descargado correctamente';
        } else {
          this.errorMessage = 'Error al descargar el PDF';
        }
        setTimeout(() => {
          this.successMessage = '';
          this.errorMessage = '';
        }, 3000);
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Error al descargar el PDF';
        setTimeout(() => this.errorMessage = '', 3000);
        this.isLoading = false;
      }
    });
  }
  
  // Método para formatear fechas
  formatDate(date: any): string {
    return this.reportsFilterService.formatDate(date);
  }
  
  // Métodos auxiliares para la interfaz de paginación
  getPageNumbers(): number[] {
    const totalPages = this.totalPages;
    const currentPage = this.currentPage;
    
    if (totalPages <= 7) {
      return Array.from({length: totalPages}, (_, i) => i + 1);
    }
    
    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5, -1, totalPages];
    }
    
    if (currentPage >= totalPages - 2) {
      return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    
    return [1, -1, currentPage - 1, currentPage, currentPage + 1, -1, totalPages];
  }
}