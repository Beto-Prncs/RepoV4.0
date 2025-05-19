import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs, orderBy, Timestamp, documentId } from '@angular/fire/firestore';
import { Observable, of, from, forkJoin } from 'rxjs';
import { map, catchError, tap, take } from 'rxjs/operators';
import { Reporte, Usuario, Empresa } from '../../models/interfaces';
import { AuthService } from '../auth.service';

/**
 * Servicio mejorado para manejar estadísticas con normalización de datos
 */
@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private firestore: Firestore = inject(Firestore);
  private authService: AuthService = inject(AuthService);

  constructor() { }

  /**
   * Obtener empresas desde Firestore
   */
  getCompanies(): Observable<Empresa[]> {
    console.log('Obteniendo empresas desde Firestore');
    const companiesRef = collection(this.firestore, 'Empresa');
    return from(getDocs(companiesRef)).pipe(
      map(snapshot => {
        const companies: Empresa[] = [];
        snapshot.forEach(doc => {
          // Normalizar datos de empresa
          const empresa = this.normalizeCompany({
            IdEmpresa: doc.id,
            ...doc.data() as Omit<Empresa, 'IdEmpresa'>
          });
          companies.push(empresa);
        });
        console.log(`Obtenidas ${companies.length} empresas`);
        return companies;
      }),
      catchError(error => {
        console.error('Error al obtener empresas:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener trabajadores filtrados según nivel de administrador
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
   * Obtener todos los trabajadores
   */
  private getAllWorkers(): Observable<Usuario[]> {
    console.log('Obteniendo todos los trabajadores');
    const workersRef = collection(this.firestore, 'Usuario');
    const q = query(workersRef, where('Rol', '==', 'worker'));
    return from(getDocs(q)).pipe(
      map(snapshot => {
        const workers: Usuario[] = [];
        snapshot.forEach(doc => {
          // Normalizar datos de trabajador
          const worker = this.normalizeUser({
            IdUsuario: doc.id,
            ...doc.data() as Omit<Usuario, 'IdUsuario'>
          });
          workers.push(worker);
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
   * Obtener trabajadores para admin nivel 3
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
              
              // Añadir trabajadores directos normalizados al mapa
              directWorkers.forEach(worker => {
                const normalizedWorker = this.normalizeUser(worker);
                allWorkers.set(normalizedWorker.IdUsuario, normalizedWorker);
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
                      const normalizedWorker = this.normalizeUser(worker);
                      if (!allWorkers.has(normalizedWorker.IdUsuario)) {
                        allWorkers.set(normalizedWorker.IdUsuario, normalizedWorker);
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
              
              // Normalizar trabajadores
              const normalizedDirectWorkers = directWorkers.map(worker => this.normalizeUser(worker));
              
              // Si no hay creador, solo devolver trabajadores directos
              if (!createdBy) {
                observer.next(normalizedDirectWorkers);
                observer.complete();
                return;
              }
              
              // Obtener trabajadores creados por el creador
              this.authService.getWorkersCreatedBy(createdBy)
                .then(creatorWorkers => {
                  console.log('Trabajadores del creador encontrados:', creatorWorkers.length);
                  
                  // Normalizar trabajadores del creador
                  const normalizedCreatorWorkers = creatorWorkers.map(worker => this.normalizeUser(worker));
                  
                  // Combinar trabajadores evitando duplicados usando un Map
                  const combinedWorkersMap = new Map<string, Usuario>();
                  
                  normalizedDirectWorkers.forEach(worker => 
                    combinedWorkersMap.set(worker.IdUsuario, worker)
                  );
                  
                  normalizedCreatorWorkers.forEach(worker => {
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
                  observer.next(normalizedDirectWorkers); // Fallback a trabajadores directos
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
   * Obtener administradores creados por un administrador específico
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
        const admin = this.normalizeUser({
          IdUsuario: doc.id,
          ...doc.data() as Omit<Usuario, 'IdUsuario'>
        });
        admins.push(admin);
      });
      
      console.log(`Encontrados ${admins.length} admins nivel ${level}`);
      return admins;
    } catch (error) {
      console.error(`Error al obtener admins nivel ${level}:`, error);
      return [];
    }
  }

  /**
   * Obtener reportes filtrados según parámetros
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
    
    return reportsObservable.pipe(
      tap(reports => {
        console.log(`Obtenidos ${reports.length} reportes`);
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
        return this.normalizeReports(reports);
      }),
      catchError(error => {
        console.error('Error al obtener reportes por trabajador:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener reportes por departamento
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
            return this.normalizeReports(reports);
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
   * Obtener trabajadores por departamento
   */
  private async getDepartmentWorkers(department: string): Promise<Usuario[]> {
    console.log('Obteniendo trabajadores del departamento:', department);
    
    try {
      // Buscar por ambos campos: Departamento y departamento (en caso de inconsistencia)
      const workersRef = collection(this.firestore, 'Usuario');
      const q = query(
        workersRef, 
        where('Departamento', '==', department)
      );
      
      const snapshot = await getDocs(q);
      const workers: Usuario[] = [];
      
      snapshot.forEach(doc => {
        const worker = this.normalizeUser({
          IdUsuario: doc.id,
          ...doc.data() as Omit<Usuario, 'IdUsuario'>
        });
        workers.push(worker);
      });
      
      // Si no encontramos trabajadores, intentar con el otro caso de atributo
      if (workers.length === 0) {
        const q2 = query(
          workersRef, 
          where('departamento', '==', department)
        );
        
        const snapshot2 = await getDocs(q2);
        snapshot2.forEach(doc => {
          const worker = this.normalizeUser({
            IdUsuario: doc.id,
            ...doc.data() as Omit<Usuario, 'IdUsuario'>
          });
          workers.push(worker);
        });
      }
      
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
        const processedReports = this.normalizeReports(reports);
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
   * Obtener reportes para admin nivel 3
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
              return this.normalizeReports(reports);
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
   * Obtener reportes para admin nivel 2
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
              return this.normalizeReports(reports);
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
   * Obtener todos los reportes
   */
  getAllReports(dateRange: { start: Date, end: Date }): Observable<Reporte[]> {
    console.log('Obteniendo todos los reportes en el rango de fechas');
    
    const reportsRef = collection(this.firestore, 'Reportes');
    const q = query(
      reportsRef,
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
        const processedReports = this.normalizeReports(reports);
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
   * Normalizar reportes para manejar inconsistencias en los atributos
   */
  private normalizeReports(reports: any[]): Reporte[] {
    return reports.map(report => {
      // Asegurar que todos los campos necesarios existan
      const normalizedReport: Reporte = {
        IdReporte: report.IdReporte || '',
        IdEmpresa: report.IdEmpresa || '',
        IdUsuario: report.IdUsuario || '',
        Tipo_Trabajo: report.Tipo_Trabajo || '',
        // Gestionar la inconsistencia del campo departamento
        departamento: report.departamento || report.Departamento || '',
        estado: report.estado || 'Pendiente',
        fecha: this.convertToDate(report.fecha) || new Date(),
        fechaActualizacion: this.convertToDate(report.fechaActualizacion) || new Date(),
        jobDescription: report.jobDescription || '',
        location: report.location || '',
        priority: report.priority || 'Media'
      };

      // Añadir campos que solo están presentes en reportes completados
      if (report.estado === 'Completado') {
        normalizedReport.fechaCompletado = this.convertToDate(report.fechaCompletado);
        normalizedReport.evidenceImages = report.evidenceImages || [];
        normalizedReport.firmaDigital = report.firmaDigital || '';
        normalizedReport.materialesUtilizados = report.materialesUtilizados || '';
        normalizedReport.descripcionCompletado = report.descripcionCompletado || '';
        normalizedReport.reporteGenerado = report.reporteGenerado || false;
      }

      return normalizedReport;
    });
  }

  /**
   * Normalizar usuario para manejar inconsistencias en los atributos
   */
  private normalizeUser(user: any): Usuario {
    // Asegurar que todos los campos necesarios existan
    return {
      IdUsuario: user.IdUsuario || '',
      Correo: user.Correo || '',
      Nombre: user.Nombre || '',
      Username: user.Username || '',
      Password: user.Password || '',
      Foto_Perfil: user.Foto_Perfil || '',
      Telefono: user.Telefono || '',
      Rol: user.Rol || 'worker',
      // Manejar la inconsistencia del campo Departamento
      Departamento: user.Departamento || user.departamento || '',
      IdDepartamento: user.IdDepartamento || user.Departamento || '',
      NivelAdmin: user.NivelAdmin || '',
      createdBy: user.createdBy || ''
    };
  }

  /**
   * Normalizar empresa para manejar posibles inconsistencias
   */
  private normalizeCompany(company: any): Empresa {
    return {
      IdEmpresa: company.IdEmpresa || '',
      Nombre: company.Nombre || '',
      Correo: company.Correo || '',
      Direccion: company.Direccion || '',
      Sector: company.Sector || ''
    };
  }

  /**
   * Convertir timestamp de Firestore a Date
   */
  private convertToDate(timestamp: any): Date {
    if (!timestamp) return new Date();
    
    try {
      // Si es un Timestamp de Firestore
      if (timestamp instanceof Timestamp || (timestamp && typeof timestamp.toDate === 'function')) {
        return timestamp.toDate();
      }
      
      // Si ya es un Date
      if (timestamp instanceof Date) {
        return timestamp;
      }
      
      // Si es un número (segundos o milisegundos)
      if (typeof timestamp === 'number') {
        return timestamp < 100000000000 ? new Date(timestamp * 1000) : new Date(timestamp);
      }
      
      // Si es un objeto con seconds y nanoseconds (formato Firestore)
      if (timestamp && timestamp.seconds && typeof timestamp.seconds === 'number') {
        return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
      }
      
      // Si es una cadena, intentar parsearla
      if (typeof timestamp === 'string') {
        return new Date(timestamp);
      }
      
      return new Date();
    } catch (error) {
      console.error('Error al convertir fecha:', error, timestamp);
      return new Date();
    }
  }

  /**
   * Método auxiliar para dividir arrays en chunks
   */
  chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}