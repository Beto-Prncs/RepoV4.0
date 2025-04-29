import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Firestore, collection, collectionData, query, where, getDocs, orderBy } from '@angular/fire/firestore';
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

// Importar pdfMake desde archivo de utilidades
import { pdfMake } from '../../utils/pdf-utils';

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
    NgxExtendedPdfViewerModule
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit, OnDestroy {
  // Inyecciones
  private firestore: Firestore = inject(Firestore);
  private taskService: TaskService = inject(TaskService);
  private authService: AuthService = inject(AuthService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private router: Router = inject(Router);
  private location: Location = inject(Location);

  // Estado del componente
  currentView: 'pending' | 'completed' = 'pending';
  filteredReports: Reporte[] = [];
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
  companies$: BehaviorSubject<Empresa[]> = new BehaviorSubject<Empresa[]>([]);
  workers$: BehaviorSubject<Usuario[]> = new BehaviorSubject<Usuario[]>([]);
  workersByDepartment$: BehaviorSubject<WorkersByDepartment[]> = new BehaviorSubject<WorkersByDepartment[]>([]);
  
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

  ngOnInit(): void {
    this.isLoading = true;
    // Configurar búsqueda con debounce
    this.setupSearchObservable();
    // Cargar datos iniciales (entidades y reportes)
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
      tap(() => this.applyLocalFilters()),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  // Carga inicial de datos
  private loadInitialData(): void {
    this.isLoading = true;
    this.errorMessage = '';

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

  // Carga de reportes desde el servidor
  private loadReportsFromServer(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Determinar qué tipo de consulta hacer basado en los filtros activos
    let reportsQuery$: Observable<Reporte[]>;

    if (this.selectedWorker) {
      // Filtrar por trabajador
      reportsQuery$ = this.currentView === 'pending' 
        ? this.taskService.getPendingReportesByWorker(this.selectedWorker)
        : this.taskService.getCompletedReportesByWorker(this.selectedWorker);
    }
    else if (this.selectedCompany) {
      // Filtrar por empresa y estado
      reportsQuery$ = this.taskService.getReportesByEmpresa(this.selectedCompany).pipe(
        map(reportes => reportes.filter(report => 
          this.currentView === 'pending' 
            ? report.estado === 'Pendiente' 
            : report.estado === 'Completado'
        ))
      );
    }
    else if (this.selectedPriority) {
      // Filtrar por prioridad y estado
      reportsQuery$ = this.taskService.getReportesByPriority(this.selectedPriority).pipe(
        map(reportes => reportes.filter(report => 
          this.currentView === 'pending' 
            ? report.estado === 'Pendiente' 
            : report.estado === 'Completado'
        ))
      );
    }
    else if (this.selectedDepartment) {
      // Filtrar por departamento y estado
      reportsQuery$ = this.taskService.getReportesByDepartamento(this.selectedDepartment).pipe(
        map(reportes => reportes.filter(report => 
          this.currentView === 'pending' 
            ? report.estado === 'Pendiente' 
            : report.estado === 'Completado'
        ))
      );
    }
    else {
      // Consulta base por estado (pendiente o completado)
      const reportesRef = collection(this.firestore, 'Reportes');
      const reportesQuery = query(
        reportesRef,
        where('estado', '==', this.currentView === 'pending' ? 'Pendiente' : 'Completado')
      );
      reportsQuery$ = collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
        map((reportes: any[]) => this.processReportes(reportes))
      );
    }

    // Ejecutar la consulta
    reportsQuery$.pipe(
      take(1), // Importante: asegura que solo se ejecuta una vez
      tap(reportes => {
        this.allReports = reportes;
        this.applyLocalFilters(); // Aplica filtros locales después de obtener los datos
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
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  // Aplicar filtros localmente (sin consultar Firebase nuevamente)
  private applyLocalFilters(): void {
    // Comenzar con todos los reportes obtenidos de la BD
    let result = [...this.allReports];

    // Aplicar filtro de fecha si está seleccionado
    if (this.selectedDateFilter) {
      result = this.applyDateFilter(result);
    }

    // Aplicar filtro de texto si existe
    if (this.searchTerm?.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      result = result.filter(report => {
        // Buscar en campos de texto y en nombres en caché
        return (
          (report.Tipo_Trabajo?.toLowerCase().includes(searchLower)) ||
          (report.jobDescription?.toLowerCase().includes(searchLower)) ||
          (this.workerNamesCache.get(report.IdUsuario)?.toLowerCase().includes(searchLower)) ||
          (this.companyNamesCache.get(report.IdEmpresa)?.toLowerCase().includes(searchLower))
        );
      });
    }

    // Actualizar los reportes filtrados
    this.filteredReports = result;
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
      // Determinar qué fecha usar
      const reportDate = this.currentView === 'completed' && report.fechaCompletado
        ? this.normalizeDate(report.fechaCompletado)
        : this.normalizeDate(report.fecha);

      // Normalizar fecha para comparación
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

  // Normaliza cualquier tipo de fecha a un objeto Date
  private normalizeDate(date: any): Date {
    if (!date) return new Date();
    if (date instanceof Date) {
      return date;
    }
    // Si es un timestamp de Firestore
    if (date && typeof date === 'object' && 'seconds' in date) {
      return new Date(date.seconds * 1000);
    }
    // Si es un string ISO o una fecha en formato string
    try {
      return new Date(date);
    } catch (error) {
      console.error('Error al convertir fecha:', error);
      return new Date();
    }
  }

  // Procesar reportes para normalizar fechas
  private processReportes(reportes: any[]): Reporte[] {
    return reportes.map(reporte => ({
      ...reporte,
      fecha: reporte.fecha?.toDate?.() || new Date(reporte.fecha),
      fechaCompletado: reporte.fechaCompletado?.toDate?.() ||
        (reporte.fechaCompletado ? new Date(reporte.fechaCompletado) : undefined),
      fechaActualizacion: reporte.fechaActualizacion?.toDate?.() ||
        (reporte.fechaActualizacion ? new Date(reporte.fechaActualizacion) : new Date())
    }));
  }

  // Métodos de utilidad
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  }

  formatDate(date: any): string {
    if (!date) return 'Fecha no disponible';
    try {
      const dateObj = this.normalizeDate(date);
      return dateObj.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error al formatear fecha:', error, date);
      return 'Fecha inválida';
    }
  }

  // Obtener nombres usando el caché (métodos síncronos)
  getCompanyName(idEmpresa: string): string {
    return this.companyNamesCache.get(idEmpresa) || 'Empresa no disponible';
  }

  getWorkerName(idUsuario: string): string {
    return this.workerNamesCache.get(idUsuario) || 'Trabajador no disponible';
  }

  getWorkerDepartment(idUsuario: string): string {
    return this.workerDepartmentCache.get(idUsuario) || 'Departamento no disponible';
  }

  // Método para filtrar por departamento
  onDepartmentChange(): void {
    if (this.selectedDepartment) {
      // Filtrar la lista de trabajadores por departamento
      this.workers$.pipe(
        take(1),
        map(workers => workers.filter(w => w.Departamento === this.selectedDepartment))
      ).subscribe(filteredWorkers => {
        // Si había un trabajador seleccionado y ya no está en el departamento, limpiarlo
        if (this.selectedWorker) {
          const worker = filteredWorkers.find(w => w.IdUsuario === this.selectedWorker);
          if (!worker) {
            this.selectedWorker = '';
          }
        }
      });
      
      // Cargar reportes por departamento
      this.loadReportsFromServer();
    } else {
      // Si se deselecciona el departamento, actualizar reportes
      this.loadReportsFromServer();
    }
  }

  // Eventos UI
  setView(view: 'pending' | 'completed'): void {
    if (this.currentView !== view) {
      this.currentView = view;
      // Recargar desde el servidor cuando cambia la vista
      this.loadReportsFromServer();
    }
  }

  onSearchChange(): void {
    this.searchTerms.next(this.searchTerm);
  }

  applyFilters(): void {
    // Si el filtro requiere consulta al servidor
    if (this.selectedCompany || this.selectedWorker || this.selectedPriority || this.selectedDepartment) {
      this.loadReportsFromServer();
    } else {
      // Si solo son filtros locales
      this.applyLocalFilters();
    }
  }

  resetFilters(): void {
    this.selectedCompany = '';
    this.selectedWorker = '';
    this.selectedPriority = '';
    this.selectedDateFilter = '';
    this.selectedDepartment = '';
    this.searchTerm = '';
    this.searchTerms.next('');
    // Recargar datos desde el servidor
    this.loadReportsFromServer();
  }

  // Método corregido para generar PDF
generatePDF(report: Reporte): void {
  try {
    // Usar datos del caché
    const workerName = this.getWorkerName(report.IdUsuario);
    const companyName = this.getCompanyName(report.IdEmpresa);
    const departmentName = this.getWorkerDepartment(report.IdUsuario);

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

    // Generar el PDF usando el objeto con casting a any para evitar errores de tipo
    const pdfObj = pdfMake.createPdf(docDefinition);
    
    // Para visualizar en el visor
    pdfObj.getBlob((blob) => {
      const url = URL.createObjectURL(blob);
      this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.selectedReport = report;
    });
  } catch (error) {
    console.error('Error al generar PDF:', error);
    this.errorMessage = 'Error al generar el PDF. Intenta nuevamente.';
  }
}
  
  // Vista previa del reporte
  openPdfPreview(report: Reporte): void {
    this.generatePDF(report);
  }

  closePreview(): void {
    if (this.safePdfUrl) {
      this.revokeObjectURL(this.safePdfUrl);
      this.safePdfUrl = null;
    }
    this.selectedReport = null;
  }

  // Método para descargar PDF corregido
  downloadPDF(report: Reporte): void {
    try {
      // Usar datos del caché
      const workerName = this.getWorkerName(report.IdUsuario);
      const companyName = this.getCompanyName(report.IdEmpresa);
      const departmentName = this.getWorkerDepartment(report.IdUsuario);

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

      // Generar el PDF para descarga
      const pdfObj = pdfMake.createPdf(docDefinition);
      pdfObj.download(`Reporte_${report.Tipo_Trabajo.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error al descargar PDF:', error);
      this.errorMessage = 'Error al descargar el PDF. Intenta nuevamente.';
    }
  }
}