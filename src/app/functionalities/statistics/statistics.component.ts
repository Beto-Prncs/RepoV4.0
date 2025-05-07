import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, inject, NgZone, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { Observable, BehaviorSubject, Subject, combineLatest, of, throwError } from 'rxjs';
import { map, take, catchError, finalize, takeUntil, tap, debounceTime, retry, distinctUntilChanged } from 'rxjs/operators';

import { Chart, registerables, ChartConfiguration } from 'chart.js';
import { Reporte, Empresa, Usuario } from '../../models/interfaces';
import { AuthService } from '../../services/auth.service';
import { StatisticsService } from '../../services/auxiliar-services/statistics.service';
import { StatisticsUtilsService, WorkerStats, ChartData } from '../../services/auxiliar-services/statistics-utils.service';

// Registrar todos los componentes de Chart.js
Chart.register(...registerables);

interface WorkersByDepartment {
  departamento: string;
  workers: Usuario[];
}
@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss'
})
export class StatisticsComponent implements OnInit, OnDestroy, AfterViewInit {
  // Referencias a canvas de gráficos
  @ViewChild('mainChart') mainChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('priorityChart') priorityChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('efficiencyChart') efficiencyChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('timeDistributionChart') timeDistributionChartRef!: ElementRef<HTMLCanvasElement>;
  
  // Instancias de gráficos
  private mainChart: Chart | null = null;
  private priorityChart: Chart | null = null;
  private efficiencyChart: Chart | null = null;
  private timeDistributionChart: Chart | null = null;
  
  // Servicios
  private authService: AuthService = inject(AuthService);
  private statsService: StatisticsService = inject(StatisticsService);
  private statsUtils: StatisticsUtilsService = inject(StatisticsUtilsService);
  private router: Router = inject(Router);
  private location: Location = inject(Location);
  
  // Datos del usuario actual
  currentUser: Usuario | null = null;
  isAdmin: boolean = false;
  adminLevel: string = '';
  
  // Fuentes de datos Observable
  companies$ = new BehaviorSubject<Empresa[]>([]);
  workers$ = new BehaviorSubject<Usuario[]>([]);
  workersByDepartment$ = new BehaviorSubject<WorkersByDepartment[]>([]);
  
  // Datos de reportes
  allReports: Reporte[] = [];
  filteredReports: Reporte[] = [];
  
  // Estado de la UI
  isLoading: boolean = false;
  errorMessage: string = '';
  chartTitle: string = 'Distribución de Reportes';
  
  // Estadísticas
  totalReports: number = 0;
  completedReports: number = 0;
  pendingReports: number = 0;
  completionRate: string = '0';
  pendingRate: string = '0';
  avgCompletionTime: string = '0h';
  workerStats: WorkerStats[] = [];
  
  // Filtros
  selectedCompany: string = '';
  selectedWorker: string = '';
  selectedDepartment: string = '';
  selectedPeriod: string = 'month';
  selectedChartType: string = 'bar';
  selectedDataType: string = 'status';
  startDate: string = '';
  endDate: string = '';
  
  // Departamentos disponibles
  availableDepartments: string[] = [];
  
  // Colores de gráficos
  chartColors = {
    primary: '#3B82F6',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#6366F1',
    background: [
      'rgba(59, 130, 246, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(239, 68, 68, 0.8)',
      'rgba(99, 102, 241, 0.8)',
      'rgba(14, 165, 233, 0.8)',
      'rgba(168, 85, 247, 0.8)',
      'rgba(236, 72, 153, 0.8)'
    ],
    border: [
      'rgba(59, 130, 246, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(245, 158, 11, 1)',
      'rgba(239, 68, 68, 1)',
      'rgba(99, 102, 241, 1)',
      'rgba(14, 165, 233, 1)',
      'rgba(168, 85, 247, 1)',
      'rgba(236, 72, 153, 1)'
    ]
  };
  
  // Manejo de suscripciones
  private destroy$ = new Subject<void>();
  // Sujeto para debounce de filtros
  private filterChange$ = new Subject<void>();
  // Control de estado para prevenir múltiples cargas
  private isLoadingData = false;
  
  ngOnInit(): void {
    console.log('Inicializando componente de estadísticas');
    this.isLoading = true;
    this.errorMessage = '';
    
    // Inicializar fechas para filtros
    this.initDefaultDates();
    
    // Configurar el debounce para aplicar filtros
    this.setupFilterDebounce();
    
    // Obtener información del usuario actual y permisos
    this.getCurrentUserInfo().then(() => {
      // Cargar datos iniciales después de obtener info del usuario
      this.loadInitialData();
    }).catch(error => {
      console.error('Error en la inicialización:', error);
      this.handleError('Error al cargar los datos del usuario');
    });
  }
  
  ngAfterViewInit(): void {
    // Los gráficos se crearán después de que se carguen los datos
  }
  
  ngOnDestroy(): void {
    // Destruir gráficos para liberar recursos
    this.destroyCharts();
    
    // Completar suscripciones
    this.destroy$.next();
    this.destroy$.complete();
    this.filterChange$.complete();
  }
  
  /**
   * Inicializar fechas predeterminadas para filtros
   */
  private initDefaultDates(): void {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    this.endDate = this.statsUtils.formatDateForInput(today);
    this.startDate = this.statsUtils.formatDateForInput(monthAgo);
    
    console.log('Fechas inicializadas:', { start: this.startDate, end: this.endDate });
  }
  
  /**
   * Configurar debounce para aplicar filtros
   */
  private setupFilterDebounce(): void {
    this.filterChange$.pipe(
      debounceTime(300), // Esperar 300ms para evitar múltiples llamadas
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadReportsData();
    });
  }
  
  /**
   * Obtener información del usuario actual y permisos
   */
  async getCurrentUserInfo(): Promise<void> {
    try {
      console.log('Obteniendo información del usuario actual');
      const authUser = await this.authService.getCurrentUser();
      
      if (!authUser) {
        console.error('No hay usuario autenticado');
        this.router.navigate(['/login']);
        return;
      }
      
      const userData = await this.authService.getUserData(authUser.uid);
      
      if (!userData) {
        console.error('No se encontraron datos del usuario');
        this.errorMessage = 'Error al verificar permisos de usuario';
        return;
      }
      
      this.currentUser = userData;
      this.isAdmin = userData.Rol === 'admin';
      this.adminLevel = userData.NivelAdmin || '';
      
      // Verificar si tenemos el campo createdBy
      const createdBy = userData['createdBy'];
      
      console.log('Usuario actual:', {
        nombre: userData.Nombre,
        rol: userData.Rol,
        nivel: this.adminLevel,
        createdBy: createdBy || 'No definido'
      });
      
    } catch (error) {
      console.error('Error al obtener información del usuario:', error);
      this.errorMessage = 'Error al verificar permisos de usuario';
      this.isLoading = false;
    }
  }
  
  /**
   * Volver a la página anterior
   */
  goBack(): void {
    this.location.back();
  }
  
  /**
   * Cargar datos iniciales (empresas y trabajadores)
   */
  private loadInitialData(): void {
    if (this.isLoadingData) {
      console.log('Ya hay una carga de datos en proceso');
      return;
    }
    
    this.isLoadingData = true;
    this.isLoading = true;
    this.errorMessage = '';
    
    console.log('Cargando datos iniciales de empresas y trabajadores');
    
    // Cargar empresas y trabajadores en paralelo con combineLatest
    combineLatest([
      // Cargar empresas
      this.statsService.getCompanies().pipe(
        take(1),
        tap(companies => {
          console.log(`Empresas cargadas: ${companies.length}`);
          this.companies$.next(companies);
        }),
        catchError(error => {
          console.error('Error al cargar empresas:', error);
          this.errorMessage = 'Error al cargar datos de empresas.';
          return of([]);
        })
      ),
      
      // Cargar trabajadores filtrados según nivel de administrador
      this.getFilteredWorkers().pipe(
        tap(workers => {
          console.log(`Trabajadores cargados: ${workers.length}`);
          
          // Organizar trabajadores por departamento
          this.organizeWorkersByDepartment(workers);
          
          // Actualizar workers$ para que esté disponible en el componente
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
        // Después de cargar entidades, cargar reportes
        this.isLoadingData = false;
        this.loadReportsData();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      error: (err) => {
        console.error('Error al cargar datos iniciales:', err);
        this.errorMessage = 'Error al cargar datos. Por favor, intente nuevamente.';
        this.isLoading = false;
        this.isLoadingData = false;
      }
    });
  }
  
  /**
   * Organizar trabajadores por departamento
   */
  private organizeWorkersByDepartment(workers: Usuario[]): void {
    // Extraer departamentos únicos
    const departmentsSet = new Set<string>();
    
    workers.forEach(w => {
      const dept = w.Departamento || 'Sin departamento';
      departmentsSet.add(dept);
    });
    
    // Convertir a array y ordenar
    this.availableDepartments = Array.from(departmentsSet).sort();
    
    console.log(`Departamentos disponibles: ${this.availableDepartments.length}`);
    
    // Organizar trabajadores por departamento
    const workersByDept = this.availableDepartments.map(dept => ({
      departamento: dept,
      workers: workers.filter(w => (w.Departamento || 'Sin departamento') === dept)
    }));
    
    this.workersByDepartment$.next(workersByDept);
  }
  
  /**
   * Obtener trabajadores filtrados según nivel de administrador
   */
  private getFilteredWorkers(): Observable<Usuario[]> {
    if (!this.currentUser) {
      console.error('No hay usuario autenticado para filtrar trabajadores');
      return of([]);
    }
    
    console.log(`Obteniendo trabajadores para admin nivel ${this.adminLevel}`);
    
    // Usar el servicio de estadísticas para obtener trabajadores filtrados según nivel de admin
    return this.statsService.getFilteredWorkers(
      this.currentUser.IdUsuario,
      this.adminLevel
    ).pipe(
      retry(1), // Reintentar una vez en caso de error
      catchError(err => {
        console.error('Error al obtener trabajadores filtrados:', err);
        return throwError(() => new Error('Error al cargar trabajadores. Verifique su conexión.'));
      })
    );
  }
  
  /**
   * Cargar datos de reportes basados en filtros y permisos
   */
  private loadReportsData(): void {
    if (this.isLoadingData) {
      console.log('Ya hay una carga de datos en proceso');
      return;
    }
    
    this.isLoadingData = true;
    this.isLoading = true;
    this.errorMessage = '';
    
    if (!this.currentUser) {
      this.errorMessage = 'No hay usuario autenticado';
      this.isLoading = false;
      this.isLoadingData = false;
      return;
    }
    
    console.log('Cargando reportes con los filtros actuales');
    
    // Obtener rango de fechas del período seleccionado
    const dateRange = this.statsUtils.getDateRangeFromPeriod(
      this.selectedPeriod,
      this.startDate,
      this.endDate
    );
    
    console.log('Rango de fechas:', {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString()
    });
    
    // Obtener reportes filtrados
    this.statsService.getFilteredReports(
      this.currentUser.IdUsuario,
      this.adminLevel,
      dateRange,
      this.selectedCompany,
      this.selectedDepartment,
      this.selectedWorker
    ).pipe(
      take(1),
      tap(reports => {
        console.log(`Reportes recibidos: ${reports.length}`);
        this.allReports = reports;
        this.filteredReports = reports;
        
        // Calcular estadísticas y crear gráficos
        this.calculateStatistics();
        this.createCharts();
      }),
      catchError(error => {
        console.error('Error al cargar reportes:', error);
        this.errorMessage = 'Error al cargar reportes. Por favor intente nuevamente.';
        this.filteredReports = [];
        this.allReports = [];
        
        // Resetear estadísticas en caso de error
        this.resetStatistics();
        
        return of([]);
      }),
      finalize(() => {
        this.isLoading = false;
        this.isLoadingData = false;
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }
  
  /**
   * Calcular estadísticas a partir de reportes
   */
  private calculateStatistics(): void {
    if (!this.filteredReports || this.filteredReports.length === 0) {
      this.resetStatistics();
      return;
    }
    
    console.log('Calculando estadísticas para', this.filteredReports.length, 'reportes');
    
    // Calcular estadísticas básicas
    const basicStats = this.statsUtils.calculateBasicStats(this.filteredReports);
    
    this.totalReports = basicStats.totalReports;
    this.completedReports = basicStats.completedReports;
    this.pendingReports = basicStats.pendingReports;
    this.completionRate = basicStats.completionRate;
    this.pendingRate = basicStats.pendingRate;
    this.avgCompletionTime = basicStats.avgCompletionTime;
    
    // Calcular estadísticas de trabajadores
    this.calculateWorkerStats();
  }
  
  /**
   * Calcular estadísticas para cada trabajador
   */
  private calculateWorkerStats(): void {
    this.workers$.pipe(
      take(1),
      map(workers => {
        return this.statsUtils.calculateWorkerStats(this.filteredReports, workers);
      }),
      tap(stats => {
        console.log(`Estadísticas calculadas para ${stats.length} trabajadores`);
        this.workerStats = stats;
      }),
      catchError(error => {
        console.error('Error al calcular estadísticas de trabajadores:', error);
        return of([]);
      })
    ).subscribe();
  }
  
  /**
   * Resetear estadísticas
   */
  private resetStatistics(): void {
    console.log('Reseteando estadísticas');
    
    this.totalReports = 0;
    this.completedReports = 0;
    this.pendingReports = 0;
    this.completionRate = '0';
    this.pendingRate = '0';
    this.avgCompletionTime = 'N/A';
    this.workerStats = [];
  }
  
  /**
   * Crear y actualizar gráficos
   */
  private createCharts(): void {
    console.log('Creando/actualizando gráficos');
    
    setTimeout(() => {
      try {
        // Destruir gráficos existentes antes de crear nuevos
        this.destroyCharts();
        
        // Crear nuevos gráficos
        this.createMainChart();
        this.createPriorityChart();
        this.createEfficiencyChart();
        this.createTimeDistributionChart();
      } catch (error) {
        console.error('Error al crear gráficos:', error);
        this.errorMessage = 'Error al generar gráficos. Por favor intente nuevamente.';
      }
    }, 100); // Pequeño retraso para asegurar que los elementos DOM estén disponibles
  }
  
  /**
   * Destruir gráficos existentes para liberar recursos
   */
  private destroyCharts(): void {
    if (this.mainChart) {
      this.mainChart.destroy();
      this.mainChart = null;
    }
    
    if (this.priorityChart) {
      this.priorityChart.destroy();
      this.priorityChart = null;
    }
    
    if (this.efficiencyChart) {
      this.efficiencyChart.destroy();
      this.efficiencyChart = null;
    }
    
    if (this.timeDistributionChart) {
      this.timeDistributionChart.destroy();
      this.timeDistributionChart = null;
    }
  }
  
  /**
   * Redimensionar el canvas cuando cambia el tamaño de la ventana
   */
  @HostListener('window:resize')
  onResize(): void {
    // Recrear gráficos para ajustar a nuevo tamaño
    this.createCharts();
  }
  
  /**
   * Crear gráfico principal
   */
  private createMainChart(): void {
    if (!this.mainChartRef || !this.mainChartRef.nativeElement) {
      console.warn('Referencia al canvas principal no disponible');
      return;
    }
    
    const ctx = this.mainChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('No se pudo obtener el contexto 2D del canvas principal');
      return;
    }
    
    try {
      // Determinar datos según el tipo de datos seleccionado
      let chartData: ChartData;
      
      switch (this.selectedDataType) {
        case 'status':
          chartData = this.statsUtils.prepareStatusChartData(this.filteredReports, this.chartColors);
          break;
        case 'priority':
          chartData = this.statsUtils.preparePriorityChartData(this.filteredReports);
          break;
        case 'department':
          chartData = this.statsUtils.prepareDepartmentChartData(
            this.filteredReports, 
            this.workers$.getValue(), 
            this.chartColors
          );
          break;
        case 'company':
          // Crear mapa de IDs de empresas a nombres
          const companyMap = new Map<string, string>();
          this.companies$.getValue().forEach(company => {
            companyMap.set(company.IdEmpresa, company.Nombre || company.IdEmpresa);
          });
          
          chartData = this.statsUtils.prepareCompanyChartData(
            this.filteredReports, 
            companyMap, 
            this.chartColors
          );
          break;
        case 'time':
          chartData = this.statsUtils.prepareTimeChartData(this.filteredReports);
          break;
        default:
          chartData = this.statsUtils.prepareStatusChartData(this.filteredReports, this.chartColors);
      }
      
      // Actualizar título del gráfico
      this.chartTitle = this.statsUtils.getChartTitle(this.selectedDataType);
      
      // Configuración del gráfico
      const chartConfig: ChartConfiguration = {
        type: this.selectedChartType as any,
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 1000,
            easing: 'easeOutQuart'
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                padding: 15,
                usePointStyle: true,
                font: {
                  size: 12
                }
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: 12,
              titleFont: {
                size: 14
              },
              bodyFont: {
                size: 13
              },
              cornerRadius: 6
            }
          },
          scales: this.shouldShowScales() ? {
            y: {
              beginAtZero: true,
              border: {
                display: false
              },
              ticks: {
                font: {
                  size: 11
                }
              }
            },
            x: {
              grid: {
                display: false
              },
              ticks: {
                font: {
                  size: 11
                }
              }
            }
          } : undefined
        }
      };
      
      // Crear gráfico con Chart.js
      this.mainChart = new Chart(ctx, chartConfig);
      
    } catch (error) {
      console.error('Error al crear gráfico principal:', error);
    }
  }
  
  /**
   * Determinar si se deben mostrar escalas (no para gráficos circulares)
   */
  private shouldShowScales(): boolean {
    return this.selectedChartType !== 'pie' && 
           this.selectedChartType !== 'doughnut' && 
           this.selectedChartType !== 'polar';
  }
  
  /**
   * Crear gráfico de prioridades
   */
  private createPriorityChart(): void {
    if (!this.priorityChartRef || !this.priorityChartRef.nativeElement) {
      console.warn('Referencia al canvas de prioridades no disponible');
      return;
    }
    
    const ctx = this.priorityChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('No se pudo obtener el contexto 2D del canvas de prioridades');
      return;
    }
    
    try {
      // Preparar datos para el gráfico
      const chartData = this.statsUtils.preparePriorityChartData(this.filteredReports);
      
      // Crear gráfico con Chart.js
      this.priorityChart = new Chart(ctx, {
        type: 'doughnut',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 800,
            easing: 'easeOutQuart'
          },
          plugins: {
            legend: {
              position: 'right',
              labels: {
                padding: 15,
                usePointStyle: true,
                font: {
                  size: 12
                }
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: 12,
              titleFont: {
                size: 14
              },
              bodyFont: {
                size: 13
              },
              cornerRadius: 6
            }
          }
        }
      });
    } catch (error) {
      console.error('Error al crear gráfico de prioridades:', error);
    }
  }
  
  /**
   * Crear gráfico de eficiencia
   */
  private createEfficiencyChart(): void {
    if (!this.efficiencyChartRef || !this.efficiencyChartRef.nativeElement) {
      console.warn('Referencia al canvas de eficiencia no disponible');
      return;
    }
    
    const ctx = this.efficiencyChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('No se pudo obtener el contexto 2D del canvas de eficiencia');
      return;
    }
    
    try {
      // Preparar datos de eficiencia
      const chartData = this.statsUtils.prepareEfficiencyChartData(this.workerStats);
      
      // Crear gráfico con Chart.js
      this.efficiencyChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 1200,
            easing: 'easeOutQuart'
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: 12,
              titleFont: {
                size: 14
              },
              bodyFont: {
                size: 13
              },
              cornerRadius: 6,
              callbacks: {
                label: function(context) {
                  return `Eficiencia: ${context.parsed.x}%`;
                }
              }
            }
          },
          scales: {
            y: {
              grid: {
                display: false
              },
              ticks: {
                font: {
                  size: 11
                }
              }
            },
            x: {
              beginAtZero: true,
              max: 100,
              border: {
                display: false
              },
              ticks: {
                font: {
                  size: 11
                },
                callback: function(value) {
                  return value + '%';
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error al crear gráfico de eficiencia:', error);
    }
  }
  
  /**
   * Crear gráfico de distribución de tiempos
   */
  private createTimeDistributionChart(): void {
    if (!this.timeDistributionChartRef || !this.timeDistributionChartRef.nativeElement) {
      console.warn('Referencia al canvas de distribución de tiempos no disponible');
      return;
    }
    
    const ctx = this.timeDistributionChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('No se pudo obtener el contexto 2D del canvas de distribución de tiempos');
      return;
    }
    
    try {
      // Preparar datos para el gráfico
      const chartData = this.statsUtils.prepareTimeChartData(this.filteredReports);
      
      // Crear gráfico con Chart.js
      this.timeDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 1000,
            easing: 'easeOutQuart'
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: 12,
              titleFont: {
                size: 14
              },
              bodyFont: {
                size: 13
              },
              cornerRadius: 6
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              border: {
                display: false
              },
              ticks: {
                font: {
                  size: 11
                }
              }
            },
            x: {
              grid: {
                display: false
              },
              ticks: {
                font: {
                  size: 11
                },
                maxRotation: 45,
                minRotation: 45
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error al crear gráfico de distribución de tiempos:', error);
    }
  }
  
  /**
   * Actualizar tipo de gráfico
   */
  updateChartType(): void {
    console.log('Actualizando tipo de gráfico a:', this.selectedChartType);
    
    if (this.mainChart) {
      // Recrear solo el gráfico principal con el nuevo tipo
      this.createMainChart();
    }
  }
  /**
   * Aplicar filtros
   */
  applyFilters(): void {
    console.log('Aplicando filtros:', {
      empresa: this.selectedCompany,
      departamento: this.selectedDepartment,
      trabajador: this.selectedWorker,
      periodo: this.selectedPeriod,
      tipoGráfico: this.selectedChartType,
      tipoDatos: this.selectedDataType
    });
    
    // Usar el subject de cambio de filtros para aplicar debounce
    this.filterChange$.next();
  }
  
  /**
   * Manejar cambio de departamento
   */
  onDepartmentChange(): void {
    console.log('Departamento seleccionado:', this.selectedDepartment);
    
    if (this.selectedDepartment) {
      // Si se selecciona un departamento, resetear el trabajador seleccionado
      this.selectedWorker = '';
    }
    
    // Aplicar filtros con el nuevo departamento
    this.applyFilters();
  }
  
  /**
   * Resetear filtros a valores predeterminados
   */
  resetFilters(): void {
    console.log('Reseteando filtros a valores predeterminados');
    
    this.selectedCompany = '';
    this.selectedWorker = '';
    this.selectedDepartment = '';
    this.selectedPeriod = 'month';
    this.selectedChartType = 'bar';
    this.selectedDataType = 'status';
    
    // Resetear fechas personalizadas al último mes
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    this.endDate = this.statsUtils.formatDateForInput(today);
    this.startDate = this.statsUtils.formatDateForInput(monthAgo);
    
    // Recargar datos con filtros reseteados
    this.loadReportsData();
  }
  
  /**
   * Manejar error genérico
   */
  private handleError(message: string): void {
    this.errorMessage = message;
    console.error(message);
    
    // Limpiar mensaje de error después de 5 segundos
    setTimeout(() => {
      if (this.errorMessage === message) {
        this.errorMessage = '';
      }
    }, 5000);
  }
}