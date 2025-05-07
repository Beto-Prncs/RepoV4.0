// statistics.service.ts - Versión optimizada
import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs, orderBy, Timestamp, documentId } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, of, from, forkJoin, combineLatest } from 'rxjs';
import { map, catchError, tap, switchMap, take } from 'rxjs/operators';
import { Reporte, Usuario, Empresa } from '../../models/interfaces';
import { AuthService } from '../auth.service';

/**
 * Servicio mejorado para manejar estadísticas con optimizaciones de rendimiento
 */
@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private firestore: Firestore = inject(Firestore);
  private authService: AuthService = inject(AuthService);
  
  // Cache para mejorar el rendimiento
  private companiesCache = new Map<string, Empresa>();
  private workersCache = new Map<string, Usuario>();
  private reportsCache = new Map<string, Reporte[]>();

  /**
   * Obtener todas las empresas desde Firestore con caché
   */
  getCompanies(): Observable<Empresa[]> {
    // Verificar caché primero
    if (this.companiesCache.size > 0) {
      const cachedCompanies = Array.from(this.companiesCache.values());
      console.log('Usando empresas en caché:', cachedCompanies.length);
      return of(cachedCompanies);
    }

    console.log('Obteniendo empresas desde Firestore');
    const companiesRef = collection(this.firestore, 'Empresa');
    return from(getDocs(companiesRef)).pipe(
      map(snapshot => {
        const companies: Empresa[] = [];
        snapshot.forEach(doc => {
          const empresa = {
            IdEmpresa: doc.id,
            ...doc.data() as Omit<Empresa, 'IdEmpresa'>
          };
          companies.push(empresa);
          this.companiesCache.set(doc.id, empresa);
        });
        return companies;
      }),
      catchError(error => {
        console.error('Error al obtener empresas:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener trabajadores según el nivel de administrador y permisos
   * Mejorado con caché y manejo eficiente de promesas
   */
  getFilteredWorkers(userId: string, adminLevel: string): Observable<Usuario[]> {
    console.log(`Obteniendo trabajadores filtrados para admin nivel ${adminLevel}`);
    
    if (adminLevel === '3') {
      return this.getAdminLevel3Workers(userId);
    } else if (adminLevel === '2') {
      return this.getAdminLevel2Workers(userId);
    } else {
      return this.getAllWorkers();
    }
  }

  /**
   * Obtener todos los trabajadores directamente
   */
  private getAllWorkers(): Observable<Usuario[]> {
    console.log('Obteniendo todos los trabajadores');
    const workersRef = collection(this.firestore, 'Usuario');
    const q = query(workersRef, where('Rol', '==', 'worker'));
    
    return from(getDocs(q)).pipe(
      map(snapshot => {
        const workers: Usuario[] = [];
        snapshot.forEach(doc => {
          const worker = {
            IdUsuario: doc.id,
            ...doc.data() as Omit<Usuario, 'IdUsuario'>
          };
          workers.push(worker);
          // Actualizar caché de trabajadores
          this.workersCache.set(doc.id, worker);
        });
        console.log(`Encontrados ${workers.length} trabajadores`);
        return workers;
      }),
      catchError(error => {
        console.error('Error al obtener todos los trabajadores:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener trabajadores para admin nivel 3 (todos los trabajadores en jerarquía)
   * Versión optimizada con manejo de promesas en paralelo
   */
  private getAdminLevel3Workers(adminId: string): Observable<Usuario[]> {
    return new Observable<Usuario[]>(observer => {
      console.log('Obteniendo trabajadores para admin nivel 3:', adminId);
      
      const allWorkers = new Map<string, Usuario>();
      
      // Paso 1: Obtener todos los administradores nivel 2 creados por este admin
      this.getAdminsCreatedBy(adminId, '2')
        .then(adminsLevel2 => {
          console.log('Admins nivel 2 encontrados:', adminsLevel2.length);
          
          // Paso 2: Obtener trabajadores creados directamente por admin nivel 3
          return this.authService.getWorkersCreatedBy(adminId)
            .then(directWorkers => {
              console.log('Trabajadores directos encontrados:', directWorkers.length);
              
              // Añadir trabajadores directos al mapa
              directWorkers.forEach(worker => {
                allWorkers.set(worker.IdUsuario, worker);
                this.workersCache.set(worker.IdUsuario, worker);
              });
              
              // Crear un array de promesas para obtener todos los trabajadores de los admins nivel 2
              const workerPromises = adminsLevel2.map(admin => 
                this.authService.getWorkersCreatedBy(admin.IdUsuario)
              );
              
              // Ejecutar todas las promesas en paralelo
              return Promise.all(workerPromises)
                .then(workersArrays => {
                  // Procesar los resultados
                  workersArrays.forEach(workers => {
                    workers.forEach(worker => {
                      if (!allWorkers.has(worker.IdUsuario)) {
                        allWorkers.set(worker.IdUsuario, worker);
                        this.workersCache.set(worker.IdUsuario, worker);
                      }
                    });
                  });
                  
                  const result = Array.from(allWorkers.values());
                  console.log('Total trabajadores combinados:', result.length);
                  observer.next(result);
                  observer.complete();
                });
            });
        })
        .catch(error => {
          console.error('Error al obtener trabajadores para admin nivel 3:', error);
          observer.next([]);
          observer.complete();
        });
    });
  }

  /**
   * Obtener trabajadores para admin nivel 2
   * Optimizado para reducir consultas redundantes
   */
  private getAdminLevel2Workers(adminId: string): Observable<Usuario[]> {
    return new Observable<Usuario[]>(observer => {
      console.log('Obteniendo trabajadores para admin nivel 2:', adminId);
      
      this.authService.getUserData(adminId)
        .then(userData => {
          if (!userData) {
            console.error('No se encontraron datos de usuario');
            observer.next([]);
            observer.complete();
            return;
          }
          
          const createdBy = userData['createdBy'];
          console.log('Usuario creado por:', createdBy || 'Ninguno');
          
          // Obtener trabajadores creados por este admin
          this.authService.getWorkersCreatedBy(adminId)
            .then(directWorkers => {
              console.log('Trabajadores directos encontrados:', directWorkers.length);
              
              // Almacenar en caché
              directWorkers.forEach(worker => this.workersCache.set(worker.IdUsuario, worker));
              
              // Si no hay creador, solo devolver trabajadores directos
              if (!createdBy) {
                observer.next(directWorkers);
                observer.complete();
                return;
              }
              
              // Obtener trabajadores creados por el creador
              this.authService.getWorkersCreatedBy(createdBy)
                .then(creatorWorkers => {
                  console.log('Trabajadores del creador encontrados:', creatorWorkers.length);
                  
                  // Actualizar caché
                  creatorWorkers.forEach(worker => this.workersCache.set(worker.IdUsuario, worker));
                  
                  // Combinar trabajadores evitando duplicados usando un Map
                  const combinedWorkersMap = new Map<string, Usuario>();
                  directWorkers.forEach(worker => combinedWorkersMap.set(worker.IdUsuario, worker));
                  creatorWorkers.forEach(worker => {
                    if (!combinedWorkersMap.has(worker.IdUsuario)) {
                      combinedWorkersMap.set(worker.IdUsuario, worker);
                    }
                  });
                  
                  const combinedWorkers = Array.from(combinedWorkersMap.values());
                  console.log('Total trabajadores combinados:', combinedWorkers.length);
                  observer.next(combinedWorkers);
                  observer.complete();
                })
                .catch(error => {
                  console.error('Error al obtener trabajadores del creador:', error);
                  observer.next(directWorkers); // Fallback a trabajadores directos
                  observer.complete();
                });
            })
            .catch(error => {
              console.error('Error al obtener trabajadores directos:', error);
              observer.next([]);
              observer.complete();
            });
        })
        .catch(error => {
          console.error('Error al obtener datos de usuario:', error);
          observer.next([]);
          observer.complete();
        });
    });
  }

  /**
   * Obtener administradores creados por un administrador específico con un nivel específico
   * Optimizado para mejor rendimiento
   */
  async getAdminsCreatedBy(creatorId: string, level: string): Promise<Usuario[]> {
    console.log(`Buscando admins nivel ${level} creados por ${creatorId}`);
    
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(
        usersRef,
        where('createdBy', '==', creatorId),
        where('Rol', '==', 'admin'),
        where('NivelAdmin', '==', level)
      );
      
      const snapshot = await getDocs(q);
      const admins: Usuario[] = [];
      
      snapshot.forEach(doc => {
        const admin = {
          IdUsuario: doc.id,
          ...doc.data() as Omit<Usuario, 'IdUsuario'>
        };
        admins.push(admin);
        this.workersCache.set(doc.id, admin); // Guardar en caché
      });
      
      console.log(`Encontrados ${admins.length} admins nivel ${level}`);
      return admins;
    } catch (error) {
      console.error(`Error al obtener admins nivel ${level}:`, error);
      return [];
    }
  }

  /**
   * Obtener reportes basados en parámetros de filtrado
   * Optimizado para consultas más eficientes y uso de caché
   */
  getFilteredReports(
    userId: string,
    adminLevel: string,
    dateRange: { start: Date, end: Date },
    selectedCompany: string = '',
    selectedDepartment: string = '',
    selectedWorker: string = ''
  ): Observable<Reporte[]> {
    console.log('Obteniendo reportes filtrados con parámetros:', {
      userId, adminLevel, dateRange, 
      selectedCompany, selectedDepartment, selectedWorker
    });
    
    // Creamos una clave de caché basada en los parámetros
    const cacheKey = `${userId}_${adminLevel}_${dateRange.start.getTime()}_${dateRange.end.getTime()}_${selectedCompany}_${selectedDepartment}_${selectedWorker}`;
    
    // Verificar si tenemos los datos en caché
    if (this.reportsCache.has(cacheKey)) {
      console.log('Usando reportes en caché');
      return of(this.reportsCache.get(cacheKey) || []);
    }
    
    // Si hay filtros específicos, aplicarlos primero
    let reportsObservable: Observable<Reporte[]>;
    
    if (selectedWorker) {
      reportsObservable = this.getReportsByWorker(selectedWorker, dateRange);
    } else if (selectedDepartment) {
      reportsObservable = this.getReportsByDepartment(selectedDepartment, dateRange);
    } else if (selectedCompany) {
      reportsObservable = this.getReportsByCompany(selectedCompany, dateRange);
    } else {
      // Filtrar por nivel de administrador
      if (adminLevel === '3') {
        reportsObservable = this.getReportsByAdminLevel3(userId, dateRange);
      } else if (adminLevel === '2') {
        reportsObservable = this.getReportsByAdminLevel2(userId, dateRange);
      } else {
        reportsObservable = this.getAllReports(dateRange);
      }
    }
    
    // Procesar los reportes y guardarlos en caché
    return reportsObservable.pipe(
      tap(reports => {
        console.log(`Obtenidos ${reports.length} reportes`);
        this.reportsCache.set(cacheKey, reports);
      })
    );
  }

  /**
   * Obtener reportes para un trabajador específico
   */
  getReportsByWorker(workerId: string, dateRange: { start: Date, end: Date }): Observable<Reporte[]> {
    console.log('Obteniendo reportes para trabajador:', workerId);
    
    const reportsRef = collection(this.firestore, 'Reportes');
    const q = query(
      reportsRef,
      where('IdUsuario', '==', workerId),
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end)
    );
    
    return from(getDocs(q)).pipe(
      map(snapshot => {
        const reports: any[] = [];
        snapshot.forEach(doc => {
          reports.push({
            IdReporte: doc.id,
            ...doc.data()
          });
        });
        return this.processReportDates(reports);
      }),
      catchError(error => {
        console.error('Error al obtener reportes por trabajador:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener reportes por departamento - Optimizado
   */
  getReportsByDepartment(department: string, dateRange: { start: Date, end: Date }): Observable<Reporte[]> {
    console.log('Obteniendo reportes para departamento:', department);
    
    return new Observable<Reporte[]>(observer => {
      // Primero obtener trabajadores en el departamento
      this.getDepartmentWorkers(department).then(workers => {
        if (workers.length === 0) {
          console.log('No hay trabajadores en este departamento');
          observer.next([]);
          observer.complete();
          return;
        }
        
        console.log(`Encontrados ${workers.length} trabajadores en el departamento`);
        const workerIds = workers.map(w => w.IdUsuario);
        
        // Limitación de Firestore: consultas 'in' limitadas a 10 elementos
        const chunks = this.chunkArray(workerIds, 10);
        const reportPromises: Promise<Reporte[]>[] = [];
        
        // Crear una consulta para cada chunk
        chunks.forEach((chunk, index) => {
          console.log(`Procesando chunk ${index + 1}/${chunks.length} con ${chunk.length} trabajadores`);
          const q = query(
            collection(this.firestore, 'Reportes'),
            where('IdUsuario', 'in', chunk),
            where('fecha', '>=', dateRange.start),
            where('fecha', '<=', dateRange.end)
          );
          
          const promise = getDocs(q).then(snapshot => {
            const reports: any[] = [];
            snapshot.forEach(doc => {
              reports.push({
                IdReporte: doc.id,
                ...doc.data()
              });
            });
            return this.processReportDates(reports);
          });
          
          reportPromises.push(promise);
        });
        
        // Combinar todos los resultados
        Promise.all(reportPromises).then(reportArrays => {
          const allReports = reportArrays.flat();
          console.log(`Total reportes encontrados: ${allReports.length}`);
          observer.next(allReports);
          observer.complete();
        }).catch(error => {
          console.error('Error al obtener reportes por departamento:', error);
          observer.error(error);
        });
      }).catch(error => {
        console.error('Error al obtener trabajadores del departamento:', error);
        observer.error(error);
      });
    });
  }

  /**
   * Obtener trabajadores por departamento - Optimizado
   */
  private async getDepartmentWorkers(department: string): Promise<Usuario[]> {
    console.log('Obteniendo trabajadores del departamento:', department);
    
    try {
      const workersRef = collection(this.firestore, 'Usuario');
      const q = query(workersRef, where('Departamento', '==', department));
      const snapshot = await getDocs(q);
      
      const workers: Usuario[] = [];
      snapshot.forEach(doc => {
        const worker = {
          IdUsuario: doc.id,
          ...doc.data() as Omit<Usuario, 'IdUsuario'>
        };
        workers.push(worker);
        this.workersCache.set(doc.id, worker);
      });
      
      console.log(`Encontrados ${workers.length} trabajadores en el departamento`);
      return workers;
    } catch (error) {
      console.error('Error al obtener trabajadores por departamento:', error);
      return [];
    }
  }

  /**
   * Obtener reportes por empresa
   */
  getReportsByCompany(companyId: string, dateRange: { start: Date, end: Date }): Observable<Reporte[]> {
    console.log('Obteniendo reportes para empresa:', companyId);
    
    const reportsRef = collection(this.firestore, 'Reportes');
    const q = query(
      reportsRef,
      where('IdEmpresa', '==', companyId),
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end)
    );
    
    return from(getDocs(q)).pipe(
      map(snapshot => {
        const reports: any[] = [];
        snapshot.forEach(doc => {
          reports.push({
            IdReporte: doc.id,
            ...doc.data()
          });
        });
        const processedReports = this.processReportDates(reports);
        console.log(`Encontrados ${processedReports.length} reportes para la empresa`);
        return processedReports;
      }),
      catchError(error => {
        console.error('Error al obtener reportes por empresa:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener reportes para admin nivel 3 (todos los reportes en jerarquía)
   * Versión optimizada con mejor manejo de promesas
   */
  getReportsByAdminLevel3(adminId: string, dateRange: { start: Date, end: Date }): Observable<Reporte[]> {
    console.log('Obteniendo reportes para admin nivel 3:', adminId);
    
    return new Observable<Reporte[]>(observer => {
      // Obtener todos los trabajadores en la jerarquía del admin
      this.getAdminLevel3Workers(adminId).pipe(take(1)).subscribe({
        next: workers => {
          if (workers.length === 0) {
            console.log('No se encontraron trabajadores para este admin');
            observer.next([]);
            observer.complete();
            return;
          }
          
          const workerIds = workers.map(w => w.IdUsuario);
          console.log(`Procesando reportes para ${workerIds.length} trabajadores`);
          
          // Dividir en chunks para consultas 'in'
          const chunks = this.chunkArray(workerIds, 10);
          const reportPromises: Promise<Reporte[]>[] = [];
          
          // Crear consultas para cada chunk
          chunks.forEach((chunk, index) => {
            console.log(`Procesando chunk ${index + 1}/${chunks.length}`);
            const q = query(
              collection(this.firestore, 'Reportes'),
              where('IdUsuario', 'in', chunk),
              where('fecha', '>=', dateRange.start),
              where('fecha', '<=', dateRange.end)
            );
            
            const promise = getDocs(q).then(snapshot => {
              const reports: any[] = [];
              snapshot.forEach(doc => {
                reports.push({
                  IdReporte: doc.id,
                  ...doc.data()
                });
              });
              return this.processReportDates(reports);
            });
            
            reportPromises.push(promise);
          });
          
          // Combinar todos los resultados
          Promise.all(reportPromises).then(reportArrays => {
            const allReports = reportArrays.flat();
            console.log(`Total reportes encontrados: ${allReports.length}`);
            observer.next(allReports);
            observer.complete();
          }).catch(error => {
            console.error('Error al obtener reportes para admin nivel 3:', error);
            observer.error(error);
          });
        },
        error: error => {
          console.error('Error al obtener trabajadores para admin nivel 3:', error);
          observer.error(error);
        }
      });
    });
  }

  /**
   * Obtener reportes para admin nivel 2 (reportes de trabajadores del admin y su creador)
   */
  getReportsByAdminLevel2(adminId: string, dateRange: { start: Date, end: Date }): Observable<Reporte[]> {
    console.log('Obteniendo reportes para admin nivel 2:', adminId);
    
    return new Observable<Reporte[]>(observer => {
      // Obtener todos los trabajadores en la jerarquía del admin nivel 2
      this.getAdminLevel2Workers(adminId).pipe(take(1)).subscribe({
        next: workers => {
          if (workers.length === 0) {
            console.log('No se encontraron trabajadores para este admin nivel 2');
            observer.next([]);
            observer.complete();
            return;
          }
          
          const workerIds = workers.map(w => w.IdUsuario);
          console.log(`Procesando reportes para ${workerIds.length} trabajadores`);
          
          // Dividir en chunks para consultas 'in'
          const chunks = this.chunkArray(workerIds, 10);
          const reportPromises: Promise<Reporte[]>[] = [];
          
          // Crear consultas para cada chunk
          chunks.forEach((chunk, index) => {
            console.log(`Procesando chunk ${index + 1}/${chunks.length}`);
            const q = query(
              collection(this.firestore, 'Reportes'),
              where('IdUsuario', 'in', chunk),
              where('fecha', '>=', dateRange.start),
              where('fecha', '<=', dateRange.end)
            );
            
            const promise = getDocs(q).then(snapshot => {
              const reports: any[] = [];
              snapshot.forEach(doc => {
                reports.push({
                  IdReporte: doc.id,
                  ...doc.data()
                });
              });
              return this.processReportDates(reports);
            });
            
            reportPromises.push(promise);
          });
          
          // Combinar todos los resultados
          Promise.all(reportPromises).then(reportArrays => {
            const allReports = reportArrays.flat();
            console.log(`Total reportes encontrados: ${allReports.length}`);
            observer.next(allReports);
            observer.complete();
          }).catch(error => {
            console.error('Error al obtener reportes para admin nivel 2:', error);
            observer.error(error);
          });
        },
        error: error => {
          console.error('Error al obtener trabajadores para admin nivel 2:', error);
          observer.error(error);
        }
      });
    });
  }

  /**
   * Obtener todos los reportes (sin filtrado)
   */
  getAllReports(dateRange: { start: Date, end: Date }): Observable<Reporte[]> {
    console.log('Obteniendo todos los reportes en el rango de fechas');
    
    const reportsRef = collection(this.firestore, 'Reportes');
    const q = query(
      reportsRef,
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end),
      orderBy('fecha', 'desc') // Ordenar por fecha descendente para optimizar
    );
    
    return from(getDocs(q)).pipe(
      map(snapshot => {
        const reports: any[] = [];
        snapshot.forEach(doc => {
          reports.push({
            IdReporte: doc.id,
            ...doc.data()
          });
        });
        const processedReports = this.processReportDates(reports);
        console.log(`Total reportes encontrados: ${processedReports.length}`);
        return processedReports;
      }),
      catchError(error => {
        console.error('Error al obtener todos los reportes:', error);
        return of([]);
      })
    );
  }

  /**
   * Procesar fechas de reportes para convertir timestamps de Firestore a objetos Date
   */
  private processReportDates(reports: any[]): Reporte[] {
    return reports.map(report => ({
      ...report,
      fecha: this.convertToDate(report.fecha),
      fechaCompletado: report.fechaCompletado ? this.convertToDate(report.fechaCompletado) : undefined,
      fechaActualizacion: report.fechaActualizacion ? this.convertToDate(report.fechaActualizacion) : undefined
    }));
  }

  /**
   * Convertir timestamp de Firestore a Date
   */
  private convertToDate(timestamp: any): Date {
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    } else if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    } else if (timestamp instanceof Date) {
      return timestamp;
    } else if (typeof timestamp === 'string') {
      return new Date(timestamp);
    } else if (timestamp && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }
    return new Date();
  }

  /**
   * Método auxiliar para dividir arrays en chunks del tamaño especificado
   */
  chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  /**
   * Limpiar caché para pruebas o cuando se necesite forzar recarga
   */
  clearCache(): void {
    this.companiesCache.clear();
    this.workersCache.clear();
    this.reportsCache.clear();
    console.log('Caché de estadísticas limpiado');
  }
}