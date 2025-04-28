import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SafeUrl, DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Subscription, Observable, combineLatest, BehaviorSubject, of } from 'rxjs';
import { map, tap, switchMap, catchError } from 'rxjs/operators';
import { Reporte, Usuario, Empresa } from '../../models/interfaces';
import { TaskService } from '../../services/task.service';
import { AuthService } from '../../services/auth.service';
import { Firestore, collectionData, collection, getDoc, doc } from '@angular/fire/firestore';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent implements OnInit, OnDestroy {
  // Inyecciones
  private firestore: Firestore = inject(Firestore);
  private taskService: TaskService = inject(TaskService);
  private authService: AuthService = inject(AuthService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private router: Router = inject(Router);

  // Estado del componente
  currentView: 'pending' | 'completed' = 'pending';
  allReports: Reporte[] = [];
  filteredReports: Reporte[] = [];
  selectedReport: Reporte | null = null;
  safePdfUrl: SafeUrl | null = null;
  searchTerm: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  // Filtros
  companies$ = new BehaviorSubject<Empresa[]>([]);
  workers$ = new BehaviorSubject<Usuario[]>([]);
  selectedCompany: string = '';
  selectedWorker: string = '';
  selectedPriority: string = '';
  selectedDateFilter: string = '';
  
  // Suscripciones
  private subscriptions: Subscription[] = [];

  constructor() {}

  ngOnInit(): void {
    this.isLoading = true;
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadData(): void {
    // Cargar empresas
    const companiesSub = collectionData(collection(this.firestore, 'Empresa'), { idField: 'IdEmpresa' })
      .pipe(
        map(data => data as Empresa[]),
        catchError(error => {
          console.error('Error al cargar empresas:', error);
          return of([]);
        })
      )
      .subscribe(companies => {
        this.companies$.next(companies);
      });
    
    // Cargar trabajadores
    const workersSub = collectionData(
      collection(this.firestore, 'Usuario'),
      { idField: 'IdUsuario' }
    ).pipe(
      map(users => users.filter(user => user['Rol'] === 'worker') as Usuario[]),
      catchError(error => {
        console.error('Error al cargar trabajadores:', error);
        return of([]);
      })
    ).subscribe(workers => {
      this.workers$.next(workers);
    });

    // Cargar reportes
    this.loadReports();
    
    this.subscriptions.push(companiesSub, workersSub);
  }

  private loadReports(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    const reportesSub = this.taskService.getReportes()
      .pipe(
        tap(reportes => {
          this.allReports = reportes;
          this.applyFilters();
          this.isLoading = false;
        }),
        catchError(error => {
          console.error('Error al cargar reportes:', error);
          this.errorMessage = 'Error al cargar los reportes';
          this.isLoading = false;
          return of([]);
        })
      )
      .subscribe();
    
    this.subscriptions.push(reportesSub);
  }

  // Métodos para filtrado
  applyFilters(): void {
    let filtered = [...this.allReports];
    
    // Filtro por estado (pendiente/completado)
    filtered = filtered.filter(report => 
      this.currentView === 'pending' 
        ? report.estado === 'Pendiente' 
        : report.estado === 'Completado'
    );
    
    // Filtro por empresa
    if (this.selectedCompany) {
      filtered = filtered.filter(report => report.IdEmpresa === this.selectedCompany);
    }
    
    // Filtro por trabajador
    if (this.selectedWorker) {
      filtered = filtered.filter(report => report.IdUsuario === this.selectedWorker);
    }
    
    // Filtro por prioridad
    if (this.selectedPriority) {
      filtered = filtered.filter(report => report.priority === this.selectedPriority);
    }
    
    // Filtro por fecha
    if (this.selectedDateFilter) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      filtered = filtered.filter(report => {
        const reportDate = this.currentView === 'completed' && report.fechaCompletado 
          ? report.fechaCompletado 
          : report.fecha;
          
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
    
    // Filtro por término de búsqueda
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(report => {
        // Buscar en Tipo_Trabajo (título)
        if (report.Tipo_Trabajo && report.Tipo_Trabajo.toLowerCase().includes(searchLower)) {
          return true;
        }
        
        // Buscar en jobDescription (descripción)
        if (report.jobDescription && report.jobDescription.toLowerCase().includes(searchLower)) {
          return true;
        }
        
        // Buscar por nombre de trabajador (requiere búsqueda adicional)
        return false; // Completaremos esta parte más adelante
      });
    }
    
    this.filteredReports = filtered;
  }

  // Métodos de utilidad
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear();
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'Fecha no disponible';
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Obtener datos adicionales para mostrar
  async getCompanyName(idEmpresa: string): Promise<string> {
    try {
      const empresaDoc = await getDoc(doc(this.firestore, 'Empresa', idEmpresa));
      if (empresaDoc.exists()) {
        return empresaDoc.data()['Nombre'] || 'Empresa no disponible';
      }
      return 'Empresa no disponible';
    } catch (error) {
      console.error('Error al obtener nombre de empresa:', error);
      return 'Empresa no disponible';
    }
  }

  async getWorkerName(idUsuario: string): Promise<string> {
    try {
      const usuarioDoc = await getDoc(doc(this.firestore, 'Usuario', idUsuario));
      if (usuarioDoc.exists()) {
        return usuarioDoc.data()['Nombre'] || 'Trabajador no disponible';
      }
      return 'Trabajador no disponible';
    } catch (error) {
      console.error('Error al obtener nombre de trabajador:', error);
      return 'Trabajador no disponible';
    }
  }

  // Filtros y navegación
  setView(view: 'pending' | 'completed'): void {
    this.currentView = view;
    this.applyFilters();
  }

  onCompanyFilterChange(companyId: string): void {
    this.selectedCompany = companyId;
    this.applyFilters();
  }

  onWorkerFilterChange(workerId: string): void {
    this.selectedWorker = workerId;
    this.applyFilters();
  }

  onPriorityFilterChange(priority: string): void {
    this.selectedPriority = priority;
    this.applyFilters();
  }

  onDateFilterChange(dateFilter: string): void {
    this.selectedDateFilter = dateFilter;
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  resetFilters(): void {
    this.selectedCompany = '';
    this.selectedWorker = '';
    this.selectedPriority = '';
    this.selectedDateFilter = '';
    this.searchTerm = '';
    this.applyFilters();
  }

  // Acciones de reportes
  async openPdfPreview(report: Reporte): Promise<void> {
    this.selectedReport = report;
    
    try {
      // Normalmente aquí obtendrías la URL del PDF desde Firebase Storage
      // Como mencionaste que no tienes Storage pagado, vamos a mostrar un mensaje
      this.errorMessage = 'La generación de PDF requiere Firebase Storage. Se muestra la información del reporte en su lugar.';
      
      // Alternativa: mostrar la información del reporte en un formato estructurado
      const reportData = {
        trabajador: await this.getWorkerName(report.IdUsuario),
        empresa: await this.getCompanyName(report.IdEmpresa),
        nombreReporte: report.Tipo_Trabajo,
        ubicacion: report.location,
        fecha: this.formatDate(report.fecha),
        problema: report.jobDescription,
        descripcion: report.jobDescription,
        solucion: report.descripcionCompletado || 'No disponible',
        departamento: report.departamento,
        prioridad: report.priority,
        materialesUtilizados: 'No disponible',
        codigoQR: 'No disponible'
      };
      
      // Crear un HTML simple como alternativa al PDF
      const htmlContent = `
        <html>
          <head>
            <title>Reporte: ${reportData.nombreReporte}</title>
            <style>
              body { font-family: Arial, sans-serif; }
              .header { background: #f2f2f2; padding: 20px; margin-bottom: 20px; }
              .section { margin-bottom: 15px; }
              .label { font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${reportData.nombreReporte}</h1>
              <p>Fecha: ${reportData.fecha}</p>
            </div>
            <div class="section">
              <div class="label">Trabajador:</div>
              <div>${reportData.trabajador}</div>
            </div>
            <div class="section">
              <div class="label">Empresa:</div>
              <div>${reportData.empresa}</div>
            </div>
            <div class="section">
              <div class="label">Ubicación:</div>
              <div>${reportData.ubicacion}</div>
            </div>
            <div class="section">
              <div class="label">Descripción del problema:</div>
              <div>${reportData.problema}</div>
            </div>
            <div class="section">
              <div class="label">Solución aplicada:</div>
              <div>${reportData.solucion}</div>
            </div>
            <div class="section">
              <div class="label">Departamento:</div>
              <div>${reportData.departamento}</div>
            </div>
            <div class="section">
              <div class="label">Prioridad:</div>
              <div>${reportData.prioridad}</div>
            </div>
          </body>
        </html>
      `;
      
      // Convertir a blob y crear URL para iframe
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } catch (error) {
      console.error('Error al abrir vista previa:', error);
      this.errorMessage = 'Error al generar vista previa del reporte';
    }
  }

  closePreview(): void {
    this.selectedReport = null;
    this.safePdfUrl = null;
    this.errorMessage = '';
  }

  goBack(): void {
    this.router.navigate(['/admin1']);
  }
}