
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { Firestore, collection, collectionData, query, where, getDocs, orderBy } from '@angular/fire/firestore';
import { Observable, BehaviorSubject, combineLatest, of, Subject } from 'rxjs';
import { map, take, catchError, finalize, takeUntil, tap } from 'rxjs/operators';
import { Chart, registerables } from 'chart.js';
import { TaskService } from '../../services/task.service';
import { AuthService } from '../../services/auth.service';
import { Reporte, Empresa, Usuario } from '../../models/interfaces';

// Registrar todos los componentes de Chart.js
Chart.register(...registerables);

interface WorkersByDepartment {
  departamento: string;
  workers: Usuario[];
}

interface WorkerStats {
  id: string;
  name: string;
  totalReports: number;
  completedReports: number;
  pendingReports: number;
  avgTime: string;
  efficiency: number;
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
  // Referencias a los canvas de los gráficos
  @ViewChild('mainChart') mainChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('priorityChart') priorityChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('efficiencyChart') efficiencyChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('timeDistributionChart') timeDistributionChartRef!: ElementRef<HTMLCanvasElement>;

  // Instancias de Chart.js
  private mainChart: Chart | null = null;
  private priorityChart: Chart | null = null;
  private efficiencyChart: Chart | null = null;
  private timeDistributionChart: Chart | null = null;

  // Inyecciones
  private firestore: Firestore = inject(Firestore);
  private taskService: TaskService = inject(TaskService);
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);
  private location: Location = inject(Location);

  // Datos del usuario actual
  currentUser: Usuario | null = null;
  isAdmin: boolean = false;
  adminLevel: string = '';

  // Observables y BehaviorSubjects
  companies$: BehaviorSubject<Empresa[]> = new BehaviorSubject<Empresa[]>([]);
  workers$: BehaviorSubject<Usuario[]> = new BehaviorSubject<Usuario[]>([]);
  workersByDepartment$: BehaviorSubject<WorkersByDepartment[]> = new BehaviorSubject<WorkersByDepartment[]>([]);

  // Datos de reportes
  allReports: Reporte[] = [];
  filteredReports: Reporte[] = [];

  // Estado de UI
  isLoading: boolean = false;
  errorMessage: string = '';
  chartTitle: string = 'Distribución de Reportes';

  // Estadísticas calculadas
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

  // Opciones disponibles
  availableDepartments: string[] = [];

  // Colores para los gráficos
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

  // Control de suscripciones
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.isLoading = true;

    // Inicializar fechas para filtro personalizado
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    this.endDate = this.formatDateForInput(today);
    this.startDate = this.formatDateForInput(monthAgo);

    // Obtener el usuario actual y su nivel de permisos
    this.getCurrentUserInfo().then(() => {
      // Cargar datos iniciales
      this.loadInitialData();
    });
  }

  ngAfterViewInit(): void {
    // Los gráficos se crearán después de que los datos estén cargados
  }

  ngOnDestroy(): void {
    // Destruir los gráficos para liberar recursos
    if (this.mainChart) {
      this.mainChart.destroy();
    }
    if (this.priorityChart) {
      this.priorityChart.destroy();
    }
    if (this.efficiencyChart) {
      this.efficiencyChart.destroy();
    }
    if (this.timeDistributionChart) {
      this.timeDistributionChart.destroy();
    }

    // Completar observables
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Obtener información del usuario actual y sus permisos
  async getCurrentUserInfo(): Promise<void> {
    try {
      const authUser = await this.authService.getCurrentUser();
      if (!authUser) {
        console.error('No hay usuario autenticado');
        this.router.navigate(['/login']);
        return;
      }

      const userData = await this.authService.getUserData(authUser.uid);
      if (!userData) {
        console.error('No se encontraron datos del usuario');
        return;
      }

      this.currentUser = userData;
      this.isAdmin = userData.Rol === 'admin';
      this.adminLevel = userData.NivelAdmin || '';
      
      // Verificar si tenemos el campo createdBy
      const createdBy = userData['createdBy'];
      
      console.log('Usuario actual:', userData);
      console.log('Nivel admin:', this.adminLevel);
      console.log('Creado por:', createdBy || 'No definido');
    } catch (error) {
      console.error('Error al obtener información del usuario:', error);
      this.errorMessage = 'Error al verificar permisos de usuario';
    }
  }

  // Formatea una fecha para un input de tipo date
  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Navegar hacia atrás
  goBack(): void {
    this.location.back();
  }

  // Cargar datos iniciales
  private loadInitialData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Cargar empresas y trabajadores
    combineLatest([
      // Empresas
      collectionData(
        collection(this.firestore, 'Empresa'),
        { idField: 'IdEmpresa' }
      ).pipe(
        take(1),
        map(data => data as Empresa[]),
        tap(companies => {
          this.companies$.next(companies);
        }),
        catchError(error => {
          console.error('Error al cargar empresas:', error);
          this.errorMessage = 'Error al cargar datos de empresas.';
          return of([]);
        })
      ),

      // Trabajadores - Filtrar según permisos de admin
      this.getFilteredWorkers().pipe(
        tap(workers => {
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
        this.loadReportsData();
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  // Obtener trabajadores filtrados según el nivel de admin
  private getFilteredWorkers(): Observable<Usuario[]> {
    if (!this.currentUser) {
      return of([]);
    }

    // Si es admin nivel 3, mostrar trabajadores de toda su jerarquía
    if (this.isAdmin && this.adminLevel === '3') {
      return new Observable<Usuario[]>(observer => {
        // Paso 1: Obtener admins nivel 2 creados por este admin
        this.getAdminsCreatedBy(this.currentUser.IdUsuario, '2').then(adminsNivel2 => {
          // Paso 2: Obtener trabajadores creados directamente por el admin nivel 3
          this.authService.getWorkersCreatedBy(this.currentUser.IdUsuario).then(workersDirectos => {
            // Paso 3: Obtener trabajadores creados por cada admin nivel 2
            const promesasTrabajadoresNivel2 = adminsNivel2.map(admin => 
              this.authService.getWorkersCreatedBy(admin.IdUsuario)
            );
            
            Promise.all(promesasTrabajadoresNivel2).then(resultadosTrabajadores => {
              // Combinar todos los trabajadores
              const todosLosTrabajadores = [
                ...workersDirectos,
                ...resultadosTrabajadores.flat()
              ];
              
              console.log('Total trabajadores para admin nivel 3:', todosLosTrabajadores.length);
              observer.next(todosLosTrabajadores);
              observer.complete();
            }).catch(error => {
              console.error('Error obteniendo trabajadores de nivel 2:', error);
              // Si hay error, devolver al menos los trabajadores directos
              observer.next(workersDirectos);
              observer.complete();
            });
          }).catch(error => {
            console.error('Error obteniendo trabajadores directos:', error);
            observer.next([]);
            observer.complete();
          });
        }).catch(error => {
          console.error('Error obteniendo admins nivel 2:', error);
          observer.next([]);
          observer.complete();
        });
      });
    }
    
    // Si es admin nivel 2, mostrar trabajadores propios y del admin que lo creó
    else if (this.isAdmin && this.adminLevel === '2') {
      return new Observable<Usuario[]>(observer => {
        // Obtener el ID del creador
        const createdBy = this.currentUser['createdBy'];
        
        if (!createdBy) {
          // Si no tiene creador, solo mostrar sus propios trabajadores
          this.authService.getWorkersCreatedBy(this.currentUser.IdUsuario).then(workers => {
            observer.next(workers);
            observer.complete();
          }).catch(error => {
            console.error('Error obteniendo trabajadores:', error);
            observer.next([]);
            observer.complete();
          });
          return;
        }
        
        // Obtener trabajadores creados por este admin y por su creador
        Promise.all([
          this.authService.getWorkersCreatedBy(this.currentUser.IdUsuario),
          this.authService.getWorkersCreatedBy(createdBy)
        ]).then(([propiosWorkers, creatorsWorkers]) => {
          // Combinar ambos conjuntos eliminando duplicados (por ID)
          const workersMap = new Map<string, Usuario>();
          
          [...propiosWorkers, ...creatorsWorkers].forEach(worker => {
            workersMap.set(worker.IdUsuario, worker);
          });
          
          const combinedWorkers = Array.from(workersMap.values());
          console.log('Total trabajadores para admin nivel 2:', combinedWorkers.length);
          
          observer.next(combinedWorkers);
          observer.complete();
        }).catch(error => {
          console.error('Error combinando trabajadores:', error);
          observer.next([]);
          observer.complete();
        });
      });
    }
    
    // Para otros roles, mostrar todos los trabajadores
    return collectionData(
      query(collection(this.firestore, 'Usuario'), where('Rol', '==', 'worker')),
      { idField: 'IdUsuario' }
    ).pipe(
      map(users => users as Usuario[])
    );
  }

  // Obtener reportes según el nivel de permisos
  private loadReportsData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Obtener fechas de filtro
    const dateRange = this.getDateRangeFromPeriod();

    // Si no hay usuario autenticado, mostrar error
    if (!this.currentUser) {
      this.errorMessage = 'No hay usuario autenticado';
      this.isLoading = false;
      return;
    }

    // Obtener reportes según los filtros específicos primero
    let reportesObservable: Observable<Reporte[]>;

    if (this.selectedWorker) {
      // Filtrar por trabajador seleccionado
      reportesObservable = this.getReportesByWorker(this.selectedWorker, dateRange);
    } 
    else if (this.selectedDepartment) {
      // Filtrar por departamento seleccionado
      reportesObservable = this.getReportesByDepartment(this.selectedDepartment, dateRange);
    }
    else if (this.selectedCompany) {
      // Filtrar por empresa seleccionada
      reportesObservable = this.getReportesByCompany(this.selectedCompany, dateRange);
    }
    else {
      // Filtrar según nivel de admin
      if (this.isAdmin && this.adminLevel === '3') {
        // Admin nivel 3: reportes de su árbol jerárquico completo
        reportesObservable = this.getReportesByAdminLevel3(this.currentUser.IdUsuario, dateRange);
      }
      else if (this.isAdmin && this.adminLevel === '2') {
        // Admin nivel 2: reportes propios y reportes del admin que lo creó
        const createdBy = this.currentUser['createdBy']; // Acceder como propiedad indexada
        
        if (createdBy) {
          reportesObservable = this.getReportesByAdminLevel2(this.currentUser.IdUsuario, createdBy, dateRange);
        } else {
          // Si no tiene createdBy, solo mostrar sus propios reportes
          reportesObservable = this.getReportesByCreator(this.currentUser.IdUsuario, dateRange);
        }
      }
      else {
        // Otros roles: todos los reportes
        reportesObservable = this.getAllReportes(dateRange);
      }
    }

    // Ejecutar la consulta
    reportesObservable.pipe(
      take(1),
      tap(reportes => {
        this.allReports = reportes;
        this.filteredReports = reportes;
        this.calculateStatistics();
        this.createCharts();
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

  // Método para obtener reportes para admin nivel 3 (incluye toda su jerarquía)
  private getReportesByAdminLevel3(adminId: string, dateRange: {start: Date, end: Date}): Observable<Reporte[]> {
    return new Observable<Reporte[]>(observer => {
      // Paso 1: Obtener todos los admin nivel 2 creados por este admin
      this.getAdminsCreatedBy(adminId, '2').then(adminsNivel2 => {
        console.log('Admins nivel 2 creados por', adminId, ':', adminsNivel2);
        
        // Paso 2: Obtener trabajadores creados directamente por el admin nivel 3
        this.authService.getWorkersCreatedBy(adminId).then(workersDirectos => {
          console.log('Trabajadores creados directamente por admin nivel 3:', workersDirectos);
          
          // Paso 3: Obtener trabajadores creados por cada admin nivel 2
          const promesasTrabajadoresNivel2 = adminsNivel2.map(admin => 
            this.authService.getWorkersCreatedBy(admin.IdUsuario)
          );
          
          Promise.all(promesasTrabajadoresNivel2).then(resultadosTrabajadores => {
            // Aplanar el array de arrays de trabajadores
            const trabajadoresDeAdminsNivel2 = resultadosTrabajadores.flat();
            console.log('Trabajadores creados por admins nivel 2:', trabajadoresDeAdminsNivel2);
            
            // Combinar todos los trabajadores
            const todosLosTrabajadores = [...workersDirectos, ...trabajadoresDeAdminsNivel2];
            const idsUsuarios = todosLosTrabajadores.map(w => w.IdUsuario);
            
            if (idsUsuarios.length === 0) {
              observer.next([]);
              observer.complete();
              return;
            }
            
            // Dividir en chunks de 10 (límite de Firestore)
            const chunks = this.chunkArray(idsUsuarios, 10);
            const reportPromises: Promise<Reporte[]>[] = [];
            
            // Obtener reportes para cada chunk
            chunks.forEach(chunk => {
              const q = query(
                collection(this.firestore, 'Reportes'),
                where('IdUsuario', 'in', chunk),
                where('fecha', '>=', dateRange.start),
                where('fecha', '<=', dateRange.end)
              );
              
              const promise = getDocs(q).then(snapshot => {
                const reportes: any[] = [];
                snapshot.forEach(doc => {
                  reportes.push({
                    IdReporte: doc.id,
                    ...doc.data()
                  });
                });
                return this.processReportes(reportes);
              });
              
              reportPromises.push(promise);
            });
            
            // Combinar todos los resultados
            Promise.all(reportPromises).then(reportesArrays => {
              const allReportes = reportesArrays.flat();
              observer.next(allReportes);
              observer.complete();
            }).catch(error => {
              console.error('Error obteniendo reportes para admin nivel 3:', error);
              observer.error(error);
            });
          }).catch(error => {
            console.error('Error obteniendo trabajadores de admins nivel 2:', error);
            observer.error(error);
          });
        }).catch(error => {
          console.error('Error obteniendo trabajadores directos:', error);
          observer.error(error);
        });
      }).catch(error => {
        console.error('Error obteniendo admins nivel 2:', error);
        observer.error(error);
      });
    });
  }

  // Método para obtener reportes para admin nivel 2 (propios y del admin que lo creó)
  private getReportesByAdminLevel2(adminId: string, createdBy: string, dateRange: {start: Date, end: Date}): Observable<Reporte[]> {
    return new Observable<Reporte[]>(observer => {
      // Paso 1: Obtener trabajadores creados por el admin nivel 2
      this.authService.getWorkersCreatedBy(adminId).then(workersDirectos => {
        console.log('Trabajadores creados por admin nivel 2:', workersDirectos);
        
        // Paso 2: Obtener trabajadores creados por el admin nivel 3 que creó a este admin
        this.authService.getWorkersCreatedBy(createdBy).then(workersSuperior => {
          console.log('Trabajadores creados por el admin superior:', workersSuperior);
          
          // Combinar ambos conjuntos de trabajadores
          const todosLosTrabajadores = [...workersDirectos, ...workersSuperior];
          const idsUsuarios = todosLosTrabajadores.map(w => w.IdUsuario);
          
          if (idsUsuarios.length === 0) {
            observer.next([]);
            observer.complete();
            return;
          }
          
          // Dividir en chunks de 10 (límite de Firestore)
          const chunks = this.chunkArray(idsUsuarios, 10);
          const reportPromises: Promise<Reporte[]>[] = [];
          
          // Obtener reportes para cada chunk
          chunks.forEach(chunk => {
            const q = query(
              collection(this.firestore, 'Reportes'),
              where('IdUsuario', 'in', chunk),
              where('fecha', '>=', dateRange.start),
              where('fecha', '<=', dateRange.end)
            );
            
            const promise = getDocs(q).then(snapshot => {
              const reportes: any[] = [];
              snapshot.forEach(doc => {
                reportes.push({
                  IdReporte: doc.id,
                  ...doc.data()
                });
              });
              return this.processReportes(reportes);
            });
            
            reportPromises.push(promise);
          });
          
          // Combinar todos los resultados
          Promise.all(reportPromises).then(reportesArrays => {
            const allReportes = reportesArrays.flat();
            observer.next(allReportes);
            observer.complete();
          }).catch(error => {
            console.error('Error obteniendo reportes para admin nivel 2:', error);
            observer.error(error);
          });
        }).catch(error => {
          console.error('Error obteniendo trabajadores del admin superior:', error);
          observer.error(error);
        });
      }).catch(error => {
        console.error('Error obteniendo trabajadores directos:', error);
        observer.error(error);
      });
    });
  }

  // Método auxiliar para obtener admins de un nivel específico creados por un admin
  private async getAdminsCreatedBy(creatorId: string, nivel: string): Promise<Usuario[]> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(
        usersRef, 
        where('createdBy', '==', creatorId),
        where('Rol', '==', 'admin'),
        where('NivelAdmin', '==', nivel)
      );
      
      const snapshot = await getDocs(q);
      const admins: Usuario[] = [];
      
      snapshot.forEach(doc => {
        admins.push({
          IdUsuario: doc.id,
          ...doc.data() as Omit<Usuario, 'IdUsuario'>
        });
      });
      
      return admins;
    } catch (error) {
      console.error('Error obteniendo admins:', error);
      return [];
    }
  }

  // Obtener reportes por trabajador
  private getReportesByWorker(workerId: string, dateRange: {start: Date, end: Date}): Observable<Reporte[]> {
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('IdUsuario', '==', workerId),
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end)
    );
    
    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => this.processReportes(reportes))
    );
  }

  // Obtener reportes por departamento
  private getReportesByDepartment(departamento: string, dateRange: {start: Date, end: Date}): Observable<Reporte[]> {
    return new Observable<Reporte[]>(observer => {
      // Obtener trabajadores del departamento
      this.workers$.pipe(
        take(1),
        map(workers => workers.filter(w => w.Departamento === departamento))
      ).subscribe(
        departmentWorkers => {
          if (departmentWorkers.length === 0) {
            observer.next([]);
            observer.complete();
            return;
          }
          
          // Obtener IDs de los trabajadores
          const workerIds = departmentWorkers.map(w => w.IdUsuario);
          
          // Dividir en chunks de máximo 10 IDs (límite de Firestore para operador 'in')
          const chunks = this.chunkArray(workerIds, 10);
          const reportPromises: Promise<Reporte[]>[] = [];
          
          // Crear consultas para cada chunk
          chunks.forEach(chunk => {
            const q = query(
              collection(this.firestore, 'Reportes'),
              where('IdUsuario', 'in', chunk),
              where('fecha', '>=', dateRange.start),
              where('fecha', '<=', dateRange.end)
            );
            
            const promise = getDocs(q).then(snapshot => {
              const reportes: any[] = [];
              snapshot.forEach(doc => {
                reportes.push({
                  IdReporte: doc.id,
                  ...doc.data()
                });
              });
              return this.processReportes(reportes);
            });
            
            reportPromises.push(promise);
          });
          
          // Combinar resultados de todas las consultas
          Promise.all(reportPromises).then(reportesArrays => {
            const allReportes = reportesArrays.flat();
            observer.next(allReportes);
            observer.complete();
          }).catch(error => {
            console.error('Error obteniendo reportes por departamento:', error);
            observer.error(error);
          });
        },
        error => {
          console.error('Error filtrando trabajadores por departamento:', error);
          observer.error(error);
        }
      );
    });
  }

  // Obtener reportes por empresa
  private getReportesByCompany(empresaId: string, dateRange: {start: Date, end: Date}): Observable<Reporte[]> {
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('IdEmpresa', '==', empresaId),
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end)
    );
    
    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => this.processReportes(reportes))
    );
  }

  // Obtener reportes creados por un admin específico (para filtrado por nivel de admin)
  private getReportesByCreator(creatorId: string, dateRange: {start: Date, end: Date}): Observable<Reporte[]> {
    return new Observable<Reporte[]>(observer => {
      // Primero obtenemos los trabajadores creados por este admin
      this.authService.getUsersByCreator(creatorId).then(users => {
        // Filtrar solo los trabajadores (rol 'worker')
        const workers = users.filter(user => user.Rol === 'worker');
        
        // Extraer solo los IDs de los trabajadores
        const workerIds = workers.map(worker => worker.IdUsuario);
        
        if (workerIds.length === 0) {
          observer.next([]);
          observer.complete();
          return;
        }
        
        // Dividir en chunks de máximo 10 IDs
        const chunks = this.chunkArray(workerIds, 10);
        const reportPromises: Promise<Reporte[]>[] = [];
        
        chunks.forEach(chunk => {
          const q = query(
            collection(this.firestore, 'Reportes'),
            where('IdUsuario', 'in', chunk),
            where('fecha', '>=', dateRange.start),
            where('fecha', '<=', dateRange.end)
          );
          
          const promise = getDocs(q).then(snapshot => {
            const reportes: any[] = [];
            snapshot.forEach(doc => {
              reportes.push({
                IdReporte: doc.id,
                ...doc.data()
              });
            });
            return this.processReportes(reportes);
          });
          
          reportPromises.push(promise);
        });
        
        Promise.all(reportPromises).then(reportesArrays => {
          const allReportes = reportesArrays.flat();
          observer.next(allReportes);
          observer.complete();
        }).catch(error => {
          console.error('Error obteniendo reportes:', error);
          observer.error(error);
        });
      }).catch(error => {
        console.error('Error obteniendo usuarios:', error);
        observer.error(error);
      });
    });
  }

  // Obtener todos los reportes (sin filtrar por creador)
  private getAllReportes(dateRange: {start: Date, end: Date}): Observable<Reporte[]> {
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end)
    );
    
    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => this.processReportes(reportes))
    );
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

  // Método auxiliar para dividir arrays en grupos
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Obtener rango de fechas según el periodo seleccionado
  private getDateRangeFromPeriod(): { start: Date, end: Date } {
    let end = new Date();
    end.setHours(23, 59, 59, 999);
    let start = new Date();
    
    switch (this.selectedPeriod) {
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'custom':
        // Usar fechas seleccionadas por el usuario
        start = new Date(this.startDate);
        end = new Date(this.endDate);
        end.setHours(23, 59, 59, 999); // Hasta el final del día
        break;
    }
    
    start.setHours(0, 0, 0, 0); // Desde el inicio del día
    return { start, end };
  }

  // Calcular estadísticas generales
  private calculateStatistics(): void {
    if (!this.filteredReports || this.filteredReports.length === 0) {
      this.resetStatistics();
      return;
    }
    
    // Estadísticas básicas
    this.totalReports = this.filteredReports.length;
    this.completedReports = this.filteredReports.filter(r => r.estado === 'Completado').length;
    this.pendingReports = this.totalReports - this.completedReports;
    
    // Calcular tasas
    this.completionRate = (this.totalReports > 0)
      ? (this.completedReports / this.totalReports * 100).toFixed(1)
      : '0';
    this.pendingRate = (this.totalReports > 0)
      ? (this.pendingReports / this.totalReports * 100).toFixed(1)
      : '0';
    
    // Tiempo promedio de resolución
    this.calculateAverageCompletionTime();
    
    // Estadísticas por trabajador
    this.calculateWorkerStats();
  }

  // Calcular tiempo promedio de finalización
  private calculateAverageCompletionTime(): void {
    const completedReports = this.filteredReports.filter(r =>
      r.estado === 'Completado' && r.fecha && r.fechaCompletado
    );
    
    if (completedReports.length === 0) {
      this.avgCompletionTime = 'N/A';
      return;
    }
    
    let totalHours = 0;
    
    completedReports.forEach(report => {
      const startDate = new Date(report.fecha);
      const endDate = new Date(report.fechaCompletado);
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      totalHours += diffHours;
    });
    
    const avgHours = totalHours / completedReports.length;
    
    // Formatear el resultado
    if (avgHours < 24) {
      this.avgCompletionTime = `${avgHours.toFixed(1)}h`;
    } else {
      const days = Math.floor(avgHours / 24);
      const hours = avgHours % 24;
      this.avgCompletionTime = `${days}d ${hours.toFixed(1)}h`;
    }
  }

  // Calcular estadísticas por trabajador
  private calculateWorkerStats(): void {
    // Agrupar reportes por trabajador
    const reportsByWorker = new Map<string, Reporte[]>();
    this.filteredReports.forEach(report => {
      if (!reportsByWorker.has(report.IdUsuario)) {
        reportsByWorker.set(report.IdUsuario, []);
      }
      reportsByWorker.get(report.IdUsuario)?.push(report);
    });
    
    // Obtener información de trabajadores
    this.workers$.pipe(
      take(1),
      map(workers => {
        const stats: WorkerStats[] = [];
        workers.forEach(worker => {
          if (reportsByWorker.has(worker.IdUsuario)) {
            const workerReports = reportsByWorker.get(worker.IdUsuario) || [];
            const completedReports = workerReports.filter(r => r.estado === 'Completado');
            const pendingReports = workerReports.filter(r => r.estado === 'Pendiente');
            
            // Calcular tiempo promedio
            let avgTime = 'N/A';
            if (completedReports.length > 0) {
              let totalHours = 0;
              completedReports.forEach(report => {
                if (report.fecha && report.fechaCompletado) {
                  const startDate = new Date(report.fecha);
                  const endDate = new Date(report.fechaCompletado);
                  const diffMs = endDate.getTime() - startDate.getTime();
                  const diffHours = diffMs / (1000 * 60 * 60);
                  totalHours += diffHours;
                }
              });
              const avgHours = totalHours / completedReports.length;
              if (avgHours < 24) {
                avgTime = `${avgHours.toFixed(1)}h`;
              } else {
                const days = Math.floor(avgHours / 24);
                const hours = avgHours % 24;
                avgTime = `${days}d ${hours.toFixed(1)}h`;
              }
            }
            
            // Calcular eficiencia (porcentaje de reportes completados)
            const efficiency = workerReports.length > 0
              ? Math.round(completedReports.length / workerReports.length * 100)
              : 0;
            
            stats.push({
              id: worker.IdUsuario,
              name: worker.Nombre,
              totalReports: workerReports.length,
              completedReports: completedReports.length,
              pendingReports: pendingReports.length,
              avgTime,
              efficiency
            });
          }
        });
        
        // Ordenar por eficiencia (de mayor a menor)
        return stats.sort((a, b) => b.efficiency - a.efficiency);
      }),
      tap(stats => {
        this.workerStats = stats;
      })
    ).subscribe();
  }

  // Resetear estadísticas
  private resetStatistics(): void {
    this.totalReports = 0;
    this.completedReports = 0;
    this.pendingReports = 0;
    this.completionRate = '0';
    this.pendingRate = '0';
    this.avgCompletionTime = 'N/A';
    this.workerStats = [];
  }

  // Crear y actualizar los gráficos
  private createCharts(): void {
    setTimeout(() => {
      this.createMainChart();
      this.createPriorityChart();
      this.createEfficiencyChart();
      this.createTimeDistributionChart();
    }, 100);
  }

  // Crear el gráfico principal
  private createMainChart(): void {
    if (!this.mainChartRef) return;
    
    // Destruir el gráfico anterior si existe
    if (this.mainChart) {
      this.mainChart.destroy();
    }
    
    const ctx = this.mainChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Determinar los datos según el tipo de datos seleccionado
    let data: any;
    switch (this.selectedDataType) {
      case 'status':
        data = this.prepareStatusChartData();
        break;
      case 'priority':
        data = this.preparePriorityChartData();
        break;
      case 'department':
        data = this.prepareDepartmentChartData();
        break;
      case 'company':
        data = this.prepareCompanyChartData();
        break;
      case 'time':
        data = this.prepareTimeChartData();
        break;
      default:
        data = this.prepareStatusChartData();
    }
    
    // Actualizar el título del gráfico
    this.chartTitle = this.getChartTitle();
    
    // Crear el gráfico con Chart.js
    this.mainChart = new Chart(ctx, {
      type: this.selectedChartType as any,
      data: data,
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
        scales: this.selectedChartType !== 'pie' && this.selectedChartType !== 'doughnut' && this.selectedChartType !== 'polar' ? {
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
    });
  }

  // Crear el gráfico de prioridades
  private createPriorityChart(): void {
    if (!this.priorityChartRef) return;
    
    // Destruir el gráfico anterior si existe
    if (this.priorityChart) {
      this.priorityChart.destroy();
    }
    
    const ctx = this.priorityChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Preparar datos para el gráfico
    const data = this.preparePriorityChartData();
    
    // Crear el gráfico con Chart.js
    this.priorityChart = new Chart(ctx, {
      type: 'doughnut',
      data: data,
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
  }

  // Crear el gráfico de eficiencia por trabajador
  private createEfficiencyChart(): void {
    if (!this.efficiencyChartRef) return;
    
    // Destruir el gráfico anterior si existe
    if (this.efficiencyChart) {
      this.efficiencyChart.destroy();
    }
    
    const ctx = this.efficiencyChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Preparar datos de eficiencia
    const data = this.prepareEfficiencyChartData();
    
    // Crear el gráfico con Chart.js
    this.efficiencyChart = new Chart(ctx, {
      type: 'bar',
      data: data,
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
  }

  // Crear gráfico de distribución de tiempo
  private createTimeDistributionChart(): void {
    if (!this.timeDistributionChartRef) return;
    
    // Destruir el gráfico anterior si existe
    if (this.timeDistributionChart) {
      this.timeDistributionChart.destroy();
    }
    
    const ctx = this.timeDistributionChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    
    // Preparar datos para el gráfico
    const data = this.prepareTimeChartData();
    
    // Crear el gráfico con Chart.js
    this.timeDistributionChart = new Chart(ctx, {
      type: 'bar',
      data: data,
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
  }

  // Preparar datos para el gráfico de estado
  private prepareStatusChartData(): any {
    const completedCount = this.filteredReports.filter(r => r.estado === 'Completado').length;
    const pendingCount = this.filteredReports.filter(r => r.estado === 'Pendiente').length;
    return {
      labels: ['Completados', 'Pendientes'],
      datasets: [{
        data: [completedCount, pendingCount],
        backgroundColor: [this.chartColors.success, this.chartColors.warning],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(245, 158, 11, 1)'
        ],
        borderWidth: 1
      }]
    };
  }

  // Preparar datos para el gráfico de prioridad
  private preparePriorityChartData(): any {
    // Contar reportes por prioridad
    const priorityCounts: { [key: string]: number } = {};
    const priorities = ['Alta', 'Media', 'Baja', 'Sin prioridad'];
    
    // Inicializar contadores
    priorities.forEach(priority => {
      priorityCounts[priority] = 0;
    });
    
    // Contar reportes
    this.filteredReports.forEach(report => {
      const priority = report.priority || 'Sin prioridad';
      priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
    });
    
    // Convertir a arrays para Chart.js
    const labels = Object.keys(priorityCounts).filter(key => priorityCounts[key] > 0);
    const data = labels.map(label => priorityCounts[label]);
    
    // Asignar colores
    const backgroundColors = [
      'rgba(239, 68, 68, 0.8)', // Alta - Rojo
      'rgba(245, 158, 11, 0.8)', // Media - Naranja
      'rgba(16, 185, 129, 0.8)', // Baja - Verde
      'rgba(209, 213, 219, 0.8)' // Sin prioridad - Gris
    ];
    const borderColors = [
      'rgba(239, 68, 68, 1)',
      'rgba(245, 158, 11, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(209, 213, 219, 1)'
    ];
    
    return {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors.slice(0, labels.length),
        borderColor: borderColors.slice(0, labels.length),
        borderWidth: 1
      }]
    };
  }

  // Preparar datos para el gráfico por departamento
  private prepareDepartmentChartData(): any {
    // Agrupar reportes por departamento
    const departmentReports = new Map<string, Reporte[]>();
    
    // Necesitamos el mapa de trabajadores a departamentos
    const workerToDepartment = new Map<string, string>();
    this.workers$.getValue().forEach(worker => {
      workerToDepartment.set(worker.IdUsuario, worker.Departamento);
    });
    
    // Agrupar reportes
    this.filteredReports.forEach(report => {
      const department = workerToDepartment.get(report.IdUsuario) || 'Desconocido';
      if (!departmentReports.has(department)) {
        departmentReports.set(department, []);
      }
      departmentReports.get(department)?.push(report);
    });
    
    // Convertir a arrays para Chart.js
    const labels: string[] = [];
    const data: number[] = [];
    const backgroundColors: string[] = [];
    const borderColors: string[] = [];
    let colorIndex = 0;
    
    departmentReports.forEach((reports, department) => {
      labels.push(department);
      data.push(reports.length);
      backgroundColors.push(this.chartColors.background[colorIndex % this.chartColors.background.length]);
      borderColors.push(this.chartColors.border[colorIndex % this.chartColors.border.length]);
      colorIndex++;
    });
    
    return {
      labels: labels,
      datasets: [{
        label: 'Reportes por Departamento',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1
      }]
    };
  }

  // Preparar datos para el gráfico por empresa
  private prepareCompanyChartData(): any {
    // Agrupar reportes por empresa
    const companyReports = new Map<string, Reporte[]>();
    
    // Mapa de IDs a nombres de empresas
    const companyNames = new Map<string, string>();
    this.companies$.getValue().forEach(company => {
      companyNames.set(company.IdEmpresa, company.Nombre);
    });
    
    // Agrupar reportes
    this.filteredReports.forEach(report => {
      const companyId = report.IdEmpresa;
      const companyName = companyNames.get(companyId) || 'Desconocida';
      if (!companyReports.has(companyName)) {
        companyReports.set(companyName, []);
      }
      companyReports.get(companyName)?.push(report);
    });
    
    // Convertir a arrays para Chart.js
    const labels: string[] = [];
    const data: number[] = [];
    const backgroundColors: string[] = [];
    const borderColors: string[] = [];
    let colorIndex = 0;
    
    companyReports.forEach((reports, company) => {
      labels.push(company);
      data.push(reports.length);
      backgroundColors.push(this.chartColors.background[colorIndex % this.chartColors.background.length]);
      borderColors.push(this.chartColors.border[colorIndex % this.chartColors.border.length]);
      colorIndex++;
    });
    
    return {
      labels: labels,
      datasets: [{
        label: 'Reportes por Empresa',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1
      }]
    };
  }

  // Preparar datos para el gráfico de tiempo de resolución
  private prepareTimeChartData(): any {
    // Solo usar reportes completados
    const completedReports = this.filteredReports.filter(r =>
      r.estado === 'Completado' && r.fecha && r.fechaCompletado
    );
    
    if (completedReports.length === 0) {
      return {
        labels: ['No hay datos'],
        datasets: [{
          label: 'Tiempo de Resolución',
          data: [0],
          backgroundColor: 'rgba(209, 213, 219, 0.8)',
          borderColor: 'rgba(209, 213, 219, 1)',
          borderWidth: 1
        }]
      };
    }
    
    // Categorías de tiempo (en horas)
    const timeCategories = [
      { label: '< 1 hora', max: 1, count: 0 },
      { label: '1-4 horas', max: 4, count: 0 },
      { label: '4-12 horas', max: 12, count: 0 },
      { label: '12-24 horas', max: 24, count: 0 },
      { label: '1-3 días', max: 72, count: 0 },
      { label: '> 3 días', max: Infinity, count: 0 }
    ];
    
    // Contar reportes por categoría de tiempo
    completedReports.forEach(report => {
      const startDate = new Date(report.fecha);
      const endDate = new Date(report.fechaCompletado);
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      // Asignar a la categoría correspondiente
      for (const category of timeCategories) {
        if (diffHours <= category.max) {
          category.count++;
          break;
        }
      }
    });
    
    // Preparar datos para Chart.js
    const labels = timeCategories.map(cat => cat.label);
    const data = timeCategories.map(cat => cat.count);
    
    return {
      labels: labels,
      datasets: [{
        label: 'Tiempo de Resolución',
        data: data,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    };
  }

  // Preparar datos para el gráfico de eficiencia por trabajador
  private prepareEfficiencyChartData(): any {
    // Limitar a los 5 trabajadores con más reportes
    const topWorkers = this.workerStats
      .filter(worker => worker.totalReports > 0)
      .sort((a, b) => b.totalReports - a.totalReports)
      .slice(0, 5);
    
    if (topWorkers.length === 0) {
      return {
        labels: ['No hay datos'],
        datasets: [{
          label: 'Eficiencia',
          data: [0],
          backgroundColor: 'rgba(209, 213, 219, 0.8)',
          borderWidth: 1
        }]
      };
    }
    
    const labels = topWorkers.map(worker => worker.name);
    const data = topWorkers.map(worker => worker.efficiency);
    
    // Determinar colores según el valor de eficiencia
    const backgroundColors = data.map(value => {
      if (value >= 80) return 'rgba(16, 185, 129, 0.8)'; // Verde para alta eficiencia
      if (value >= 50) return 'rgba(245, 158, 11, 0.8)'; // Naranja para eficiencia media
      return 'rgba(239, 68, 68, 0.8)'; // Rojo para baja eficiencia
    });
    
    return {
      labels: labels,
      datasets: [{
        label: 'Eficiencia',
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 1
      }]
    };
  }

  // Obtener título del gráfico según el tipo de datos seleccionado
  private getChartTitle(): string {
    switch (this.selectedDataType) {
      case 'status':
        return 'Distribución por Estado';
      case 'priority':
        return 'Distribución por Prioridad';
      case 'department':
        return 'Reportes por Departamento';
      case 'company':
        return 'Reportes por Empresa';
      case 'time':
        return 'Tiempo de Resolución';
      default:
        return 'Estadísticas de Reportes';
    }
  }

  // Métodos para manejo de eventos de UI
  // Cambiar el tipo de gráfico
  updateChartType(): void {
    if (this.mainChart) {
      this.createMainChart();
    }
  }

  // Aplicar filtros
  applyFilters(): void {
    this.loadReportsData();
  }

  // Método para filtrar por departamento
  onDepartmentChange(): void {
    if (this.selectedDepartment) {
      // Si se selecciona un departamento, resetear el trabajador seleccionado
      this.selectedWorker = '';
    }
    this.loadReportsData();
  }

  // Resetear filtros
  resetFilters(): void {
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
    
    this.endDate = this.formatDateForInput(today);
    this.startDate = this.formatDateForInput(monthAgo);
    
    // Recargar datos
    this.loadReportsData();
  }
}