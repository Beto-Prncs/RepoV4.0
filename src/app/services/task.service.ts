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
                         (reporte.fechaActualizacion ? new Date(reporte.fechaActualizacion) : new Date())
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
}