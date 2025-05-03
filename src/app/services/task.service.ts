import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  collectionData,
  updateDoc,
  getDocs,
  getDoc
} from '@angular/fire/firestore';
import { Observable, from, map, of } from 'rxjs';
import { Reporte } from '../models/interfaces';
import { AuthService } from './auth.service';
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from '@angular/fire/storage';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore: Firestore = inject(Firestore);
  private authService: AuthService = inject(AuthService);

  async assignReporte(reporte: Omit<Reporte, 'IdReporte'>): Promise<string> {
    try {
      // 1. Obtener el usuario actual y verificar que sea admin
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }

      // 2. Obtener los datos del usuario actual desde Firestore
      const adminDoc = await getDoc(doc(this.firestore, 'Usuario', currentUser.uid));
      if (!adminDoc.exists()) {
        throw new Error('Usuario administrador no encontrado');
      }

      const adminData = adminDoc.data();
      if (adminData['Rol'] !== 'admin') {
        throw new Error('No tiene permisos para crear reportes');
      }

      // 3. Buscar el usuario trabajador por su Username
      const workersRef = collection(this.firestore, 'Usuario');
      const workerQuery = query(workersRef, 
        where('Username', '==', reporte.IdUsuario),
        where('Rol', '==', 'worker')
      );
      
      const workerSnapshot = await getDocs(workerQuery);
      
      if (workerSnapshot.empty) {
        throw new Error('Usuario trabajador no encontrado');
      }

      const workerDoc = workerSnapshot.docs[0];
      const workerId = workerDoc.id;

      // 4. Crear el reporte con los datos validados y el ID correcto del trabajador
      const reportesRef = collection(this.firestore, 'Reportes');
      const reporteData = {
        fecha: new Date(),
        estado: 'Pendiente',
        IdEmpresa: reporte.IdEmpresa,
        IdUsuario: workerId, // Usar el ID real del trabajador
        Tipo_Trabajo: reporte.Tipo_Trabajo,
        jobDescription: reporte.jobDescription,
        location: reporte.location,
        priority: reporte.priority,
        departamento: reporte.departamento,
        fechaActualizacion: new Date()
      };

      // 5. Guardar el reporte
      const docRef = await addDoc(reportesRef, reporteData);

      // 6. Actualizar el ID del reporte
      await updateDoc(doc(this.firestore, 'Reportes', docRef.id), {
        IdReporte: docRef.id
      });

      console.log('Reporte creado exitosamente:', docRef.id);
      return docRef.id;

    } catch (error) {
      console.error('Error al asignar reporte:', error);
      throw error;
    }
  }

  getReportes(): Observable<Reporte[]> {
    console.log('Obteniendo todos los reportes');
    const reportesRef = collection(this.firestore, 'Reportes');
    return collectionData(reportesRef, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => {
        console.log('Reportes recuperados:', reportes);
        return this.processReportes(reportes);
      })
    );
  }

  getPendingReportesByWorker(userId: string): Observable<Reporte[]> {
    if (!userId) {
      console.error('UserId es requerido para obtener reportes pendientes');
      return of([]);
    }

    console.log('Buscando reportes pendientes para userId:', userId);
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('IdUsuario', '==', userId),
      where('estado', '==', 'Pendiente')
    );

    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => {
        console.log('Reportes pendientes encontrados:', reportes);
        return this.processReportes(reportes);
      })
    );
  }

  getCompletedReportesByWorker(userId: string): Observable<Reporte[]> {
    if (!userId) {
      console.error('UserId es requerido para obtener reportes completados');
      return of([]);
    }

    console.log('Buscando reportes completados para userId:', userId);
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('IdUsuario', '==', userId),
      where('estado', '==', 'Completado')
    );

    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => {
        console.log('Reportes completados encontrados:', reportes);
        return this.processReportes(reportes);
      })
    );
  }

  async updateReporteStatus(
    reporteId: string,
    status: string,
    descripcion?: string
  ): Promise<void> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }

      const reporteRef = doc(this.firestore, 'Reportes', reporteId);
      const reporteDoc = await getDoc(reporteRef);

      if (!reporteDoc.exists()) {
        throw new Error('El reporte no existe');
      }

      const reporteData = reporteDoc.data();

      const userDoc = await getDoc(doc(this.firestore, 'Usuario', currentUser.uid));
      if (!userDoc.exists()) {
        throw new Error('Usuario no encontrado');
      }

      const userData = userDoc.data();
      const isAdmin = userData['Rol'] === 'admin';
      const isAssignedWorker = reporteData['IdUsuario'] === currentUser.uid;

      if (!isAdmin && !isAssignedWorker) {
        throw new Error('No tiene permisos para actualizar este reporte');
      }

      const updateData: any = {
        estado: status,
        fechaActualizacion: new Date()
      };

      if (status === 'Completado') {
        updateData.fechaCompletado = new Date();
        if (descripcion) {
          updateData.descripcionCompletado = descripcion;
        }
      }

      await updateDoc(reporteRef, updateData);
      console.log('Estado del reporte actualizado exitosamente');
    } catch (error) {
      console.error('Error al actualizar estado del reporte:', error);
      throw error;
    }
  }

  async deleteReporte(reporteId: string): Promise<void> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }

      // Verificar si el usuario es admin
      const userDoc = await getDoc(doc(this.firestore, 'Usuario', currentUser.uid));
      if (!userDoc.exists()) {
        throw new Error('Usuario no encontrado');
      }

      const userData = userDoc.data();
      if (userData['Rol'] !== 'admin') {
        throw new Error('Solo los administradores pueden eliminar reportes');
      }

      // Verificar que el reporte existe
      const reporteRef = doc(this.firestore, 'Reportes', reporteId);
      const reporteDoc = await getDoc(reporteRef);
      if (!reporteDoc.exists()) {
        throw new Error('El reporte no existe');
      }

      // Intentar eliminar el PDF si existe
      try {
        await this.deletePdfForReporte(reporteId);
      } catch (pdfError) {
        console.warn('No se pudo eliminar el PDF del reporte:', pdfError);
        // Continuar con la eliminación del reporte aunque falle la eliminación del PDF
      }

      console.log('Eliminando reporte:', reporteId);
      await deleteDoc(reporteRef);
      console.log('Reporte eliminado exitosamente');
    } catch (error) {
      console.error('Error al eliminar reporte:', error);
      throw error;
    }
  }

  // Método auxiliar para procesar las fechas de los reportes
  private processReportes(reportes: any[]): Reporte[] {
    return reportes.map(reporte => ({
      ...reporte,
      fecha: reporte.fecha?.toDate?.() || new Date(reporte.fecha),
      fechaCompletado: reporte.fechaCompletado?.toDate?.() ||
                      (reporte.fechaCompletado ? new Date(reporte.fechaCompletado) : undefined),
      fechaActualizacion: reporte.fechaActualizacion?.toDate?.() || 
                         (reporte.fechaActualizacion ? new Date(reporte.fechaActualizacion) : new Date()),
      fechaGeneracionPdf: reporte.fechaGeneracionPdf?.toDate?.() ||
                         (reporte.fechaGeneracionPdf ? new Date(reporte.fechaGeneracionPdf) : undefined)
    }));
  }

  // Método para obtener reportes por departamento
  getReportesByDepartamento(departamento: string): Observable<Reporte[]> {
    if (!departamento) {
      console.error('Departamento es requerido para obtener reportes');
      return of([]);
    }

    console.log('Buscando reportes para departamento:', departamento);
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('departamento', '==', departamento)
    );

    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => {
        console.log('Reportes encontrados para departamento:', reportes);
        return this.processReportes(reportes);
      })
    );
  }

  // Método para obtener reportes por empresa
  getReportesByEmpresa(empresaId: string): Observable<Reporte[]> {
    if (!empresaId) {
      console.error('ID de empresa es requerido para obtener reportes');
      return of([]);
    }

    console.log('Buscando reportes para empresa:', empresaId);
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('IdEmpresa', '==', empresaId)
    );

    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => {
        console.log('Reportes encontrados para empresa:', reportes);
        return this.processReportes(reportes);
      })
    );
  }

  // Método para obtener reportes por prioridad
  getReportesByPriority(priority: string): Observable<Reporte[]> {
    if (!priority) {
      console.error('Prioridad es requerida para obtener reportes');
      return of([]);
    }

    console.log('Buscando reportes por prioridad:', priority);
    const reportesRef = collection(this.firestore, 'Reportes');
    const reportesQuery = query(
      reportesRef,
      where('priority', '==', priority)
    );

    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => {
        console.log('Reportes encontrados por prioridad:', reportes);
        return this.processReportes(reportes);
      })
    );
  }

  // Método para obtener reportes filtrados por el administrador actual
  async getFilteredReportes(): Promise<Observable<Reporte[]>> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        console.error('No hay usuario autenticado');
        return of([]);
      }
      
      // Obtener datos del usuario actual
      const userData = await this.authService.getUserData(currentUser.uid);
      if (!userData) {
        console.error('Datos de usuario no encontrados');
        return of([]);
      }
      
      // Si es admin nivel 3, filtrar reportes solo de usuarios creados por él
      if (userData.Rol === 'admin' && userData.NivelAdmin === '3') {
        return this.getReportesByCreator(currentUser.uid);
      }
      
      // Para otros casos, devolver todos los reportes
      return this.getReportes();
    } catch (error) {
      console.error('Error al filtrar reportes:', error);
      return of([]);
    }
  }

  // Método para obtener reportes de usuarios creados por un administrador específico
  getReportesByCreator(creatorId: string): Observable<Reporte[]> {
    return new Observable<Reporte[]>(observer => {
      // Primero obtenemos los usuarios creados por este administrador
      this.authService.getUsersByCreator(creatorId).then(users => {
        // Extraer solo los IDs de los usuarios
        const userIds = users.map(user => user.IdUsuario);
        
        if (userIds.length === 0) {
          observer.next([]);
          observer.complete();
          return;
        }
        
        // Obtener reportes para estos usuarios
        const reportesRef = collection(this.firestore, 'Reportes');
        
        // Firebase no permite consultas 'IN' con más de 10 elementos
        // Dividimos en grupos de 10 si es necesario
        const userIdChunks = this.chunkArray(userIds, 10);
        const reportePromises: Promise<Reporte[]>[] = [];
        
        userIdChunks.forEach(chunk => {
          const q = query(reportesRef, where('IdUsuario', 'in', chunk));
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
          reportePromises.push(promise);
        });
        
        Promise.all(reportePromises).then(reportesArrays => {
          // Combinar todos los arrays de reportes
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

  // Método auxiliar para dividir arrays en grupos de un tamaño específico
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Almacena un PDF en Firebase Storage cuando un trabajador completa un reporte
   * @param reporteId - El ID del reporte
   * @param pdfDataUrl - El PDF como una URL de datos
   * @returns Promise con la URL de descarga
   */
  async storePdfForReporte(reporteId: string, pdfDataUrl: string): Promise<string> {
    try {
      const storage = getStorage();
      const pdfPath = `reportes_pdf/${reporteId}.pdf`;
      const storageRef = ref(storage, pdfPath);
      
      // Extraer datos base64 de la URL de datos (eliminar el prefijo)
      const base64Data = pdfDataUrl.split(',')[1];
      
      // Subir el PDF a Firebase Storage
      await uploadString(storageRef, base64Data, 'base64');
      
      // Obtener la URL de descarga del PDF
      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (error) {
      console.error('Error al almacenar el PDF:', error);
      throw error;
    }
  }

  /**
   * Obtiene la URL del PDF para un reporte específico si existe
   * @param reporteId - El ID del reporte
   * @returns Promise con la URL de descarga o null si no se encuentra
   */
  async getPdfUrlForReporte(reporteId: string): Promise<string | null> {
    try {
      const storage = getStorage();
      const pdfPath = `reportes_pdf/${reporteId}.pdf`;
      const storageRef = ref(storage, pdfPath);
      
      // Intentar obtener la URL de descarga del PDF
      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (error) {
      console.error('PDF no encontrado o error de acceso:', error);
      return null;
    }
  }

  /**
   * Actualiza un reporte en Firestore con información del PDF
   * @param reporteId - El ID del reporte
   * @param pdfUrl - La URL del PDF almacenado
   */
  async updateReporteWithPdfInfo(reporteId: string, pdfUrl: string): Promise<void> {
    try {
      const reporteRef = doc(this.firestore, 'Reportes', reporteId);
      await updateDoc(reporteRef, {
        pdfUrl: pdfUrl,
        reportePdfGenerado: true,
        fechaGeneracionPdf: new Date()
      });
    } catch (error) {
      console.error('Error al actualizar reporte con información de PDF:', error);
      throw error;
    }
  }

  /**
   * Elimina un PDF de Storage
   * @param reporteId - El ID del reporte
   */
  async deletePdfForReporte(reporteId: string): Promise<void> {
    try {
      const storage = getStorage();
      const pdfPath = `reportes_pdf/${reporteId}.pdf`;
      const storageRef = ref(storage, pdfPath);
      
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Error al eliminar PDF:', error);
      throw error;
    }
  }
}