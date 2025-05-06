import { Injectable, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  collectionData, 
  doc, 
  updateDoc, 
  Timestamp,
  setDoc,
  getDoc,
  addDoc,
  deleteDoc,
  getDocs
} from '@angular/fire/firestore';
import { Storage, ref, uploadString, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Reporte } from '../models/interfaces';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore: Firestore = inject(Firestore);
  private storage: Storage = inject(Storage);
  private authService: AuthService = inject(AuthService);

  constructor() { }

  /**
   * Get all pending reports assigned to a specific worker
   * @param workerId Worker ID
   * @returns Observable with array of pending reports
   */
  getPendingReportesByWorker(workerId: string): Observable<Reporte[]> {
    if (!workerId) {
      console.error('UserId es requerido para obtener reportes pendientes');
      return of([]);
    }
    
    console.log('Getting pending reports for worker:', workerId);
    const reportesRef = collection(this.firestore, 'Reportes');
    
    // Create query without orderBy to avoid index issues
    const reportesQuery = query(
      reportesRef,
      where('IdUsuario', '==', workerId),
      where('estado', '==', 'Pendiente')
    );
    
    console.log('Query params:', { workerId, estado: 'Pendiente' });
    
    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      tap(reportes => {
        console.log('Raw reports from Firestore:', JSON.stringify(reportes));
      }),
      map((reportes: any[]) => {
        console.log('Processing reports:', reportes.length);
        return this.processReportDates(reportes);
      }),
      tap(processedReports => {
        console.log('Processed reports:', processedReports.length);
      }),
      catchError(error => {
        console.error('Error getting pending reports:', error);
        return of([]);
      })
    );
  }

  /**
   * Get all completed reports for a specific worker
   * @param workerId Worker ID
   * @returns Observable with array of completed reports
   */
  getCompletedReportesByWorker(workerId: string): Observable<Reporte[]> {
    if (!workerId) {
      console.error('UserId es requerido para obtener reportes completados');
      return of([]);
    }
    
    console.log('Buscando reportes completados para userId:', workerId);
    const reportesRef = collection(this.firestore, 'Reportes');
    
    // Query with explicit logging - using getDocs for more direct debugging
    const reportesQuery = query(
      reportesRef,
      where('IdUsuario', '==', workerId),
      where('estado', '==', 'Completado')
    );
    
    console.log('Query params for completed reports:', { workerId, estado: 'Completado' });
    
    // Use getDocs instead of collectionData for more direct debugging
    return from(getDocs(reportesQuery)).pipe(
      tap(snapshot => {
        console.log('Query returned snapshot with', snapshot.size, 'documents');
        // Log each document ID for debugging
        snapshot.docs.forEach(doc => {
          console.log('Found document with ID:', doc.id);
        });
      }),
      map(snapshot => {
        const reportes: any[] = [];
        snapshot.forEach(doc => {
          console.log('Processing doc data:', JSON.stringify(doc.data()));
          reportes.push({
            IdReporte: doc.id,
            ...doc.data()
          });
        });
        return this.processReportDates(reportes);
      }),
      tap(processedReports => {
        console.log('Processed completed reports:', processedReports.length);
      }),
      catchError(error => {
        console.error('Error getting completed reports:', error);
        return of([]);
      })
    );
  }
  
  /**
   * Get all reports by status
   * @param status Status to filter by ('Pendiente' or 'Completado')
   * @returns Observable with array of reports with the specified status
   */
  getReportesByStatus(status: string): Observable<Reporte[]> {
    if (!status) {
      console.error('Status is required to get reports');
      return of([]);
    }
    
    console.log('Getting reports with status:', status);
    const reportesRef = collection(this.firestore, 'Reportes');
    
    // Create query for reports by status
    const reportesQuery = query(
      reportesRef,
      where('estado', '==', status)
    );
    
    return collectionData(reportesQuery, { idField: 'IdReporte' }).pipe(
      tap(reportes => {
        console.log('Raw reports from Firestore:', JSON.stringify(reportes));
      }),
      map((reportes: any[]) => {
        console.log('Processing reports:', reportes.length);
        return this.processReportDates(reportes);
      }),
      catchError(error => {
        console.error('Error getting reports by status:', error);
        return of([]);
      })
    );
  }

  /**
   * Process dates in reports to convert Firestore Timestamps to JavaScript Date objects
   * @param reportes Array of reports
   * @returns Processed array with correct date formats
   */
  private processReportDates(reportes: any[]): Reporte[] {
    console.log('Processing dates for reports:', reportes);
    return reportes.map(reporte => {
      // Check if each reporte has the expected properties
      if (!reporte) {
        console.error('Found undefined report in array');
        return null;
      }
      
      console.log('Processing report:', reporte.IdReporte);
      
      // Create a new object with proper date conversions
      const processed = {
        ...reporte,
        fecha: reporte.fecha ? this.convertToDate(reporte.fecha) : new Date(),
        fechaCompletado: reporte.fechaCompletado ? this.convertToDate(reporte.fechaCompletado) : undefined,
        fechaActualizacion: reporte.fechaActualizacion ? this.convertToDate(reporte.fechaActualizacion) : undefined,
        fechaGeneracionPdf: reporte.fechaGeneracionPdf ? this.convertToDate(reporte.fechaGeneracionPdf) : undefined
      };
      
      console.log('Processed report dates:', {
        id: processed.IdReporte,
        fecha: processed.fecha,
        estado: processed.estado
      });
      
      return processed;
    }).filter(report => report !== null) as Reporte[];
  }

  /**
   * Convert Firestore Timestamp to JavaScript Date
   * @param date Timestamp or Date object
   * @returns JavaScript Date object
   */
  private convertToDate(date: Timestamp | Date | any): Date {
    if (!date) {
      console.warn('Attempted to convert null/undefined date');
      return new Date(); // Return current date as fallback
    }
    
    try {
      // If it's a Firestore Timestamp
      if (date instanceof Timestamp || (date && typeof date.toDate === 'function')) {
        return date.toDate();
      }
      
      // If it's already a Date object
      if (date instanceof Date) {
        return date;
      }
      
      // If it's a timestamp number (seconds or milliseconds)
      if (typeof date === 'number') {
        // Check if it's seconds (Firestore) or milliseconds
        return date < 100000000000 ? new Date(date * 1000) : new Date(date);
      }
      
      // If it's an object with seconds and nanoseconds (Firestore timestamp format)
      if (date && date.seconds && typeof date.seconds === 'number') {
        return new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
      }
      
      // If it's a string, try to parse it
      if (typeof date === 'string') {
        return new Date(date);
      }
      
      // Default fallback
      console.warn('Unknown date format:', date);
      return new Date();
    } catch (error) {
      console.error('Error converting date:', error, date);
      return new Date(); // Return current date as fallback
    }
  }

  /**
   * Update report status
   * @param reporteId Report ID
   * @param estado New status ('Pendiente' or 'Completado')
   * @param descripcionCompletado Optional completion description
   * @returns Promise that resolves when the update is complete
   */
  async updateReporteStatus(
    reporteId: string, 
    estado: string, 
    descripcionCompletado?: string
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
        estado: estado,
        fechaActualizacion: new Date()
      };
      
      if (estado === 'Completado') {
        updateData.fechaCompletado = new Date();
        if (descripcionCompletado) {
          updateData.descripcionCompletado = descripcionCompletado;
        }
      }
      
      await updateDoc(reporteRef, updateData);
      console.log('Report status updated successfully');
    } catch (error) {
      console.error('Error updating report status:', error);
      throw error;
    }
  }

  /**
   * Store PDF for a report in Firebase Storage
   * @param reporteId Report ID
   * @param pdfDataUrl PDF data as data URL
   * @returns Promise with the download URL of the stored PDF
   */
  async storePdfForReporte(reporteId: string, pdfDataUrl: string): Promise<string> {
    try {
      console.log('Storing PDF for report:', reporteId);
      
      // Generate the path to the PDF
      const pdfPath = `reportes_pdf/${reporteId}.pdf`;
      const storageRef = ref(this.storage, pdfPath);

      // Extract base64 data from data URL (remove prefix)
      const base64Data = pdfDataUrl.split(',')[1];
      
      // Upload PDF to Firebase Storage
      await uploadString(storageRef, base64Data, 'base64');
      
      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);
      console.log('PDF stored successfully, URL:', downloadURL);
      
      // Update the report with PDF info
      await this.updateReporteWithPdfInfo(reporteId, downloadURL);
      
      return downloadURL;
    } catch (error) {
      console.error('Error storing PDF for report:', error);
      throw error;
    }
  }

  /**
   * Get PDF URL for a report
   * @param reporteId Report ID
   * @returns Promise with the PDF URL or null if not found
   */
  async getPdfUrlForReporte(reporteId: string): Promise<string | null> {
    try {
      console.log('Getting PDF URL for report:', reporteId);
      
      // First, check if the URL is already stored in the report document
      const reporteRef = doc(this.firestore, 'Reportes', reporteId);
      const reporteDoc = await getDoc(reporteRef);
      
      if (reporteDoc.exists()) {
        const reportData = reporteDoc.data();
        
        if (reportData['pdfUrl']) {
          console.log('Found PDF URL in report document:', reportData['pdfUrl']);
          return reportData['pdfUrl'];
        }
      }
      
      // If not, try to get the URL from Storage
      const pdfPath = `reportes_pdf/${reporteId}.pdf`;
      const storageRef = ref(this.storage, pdfPath);
      const downloadURL = await getDownloadURL(storageRef);
      
      // Update the report with the URL for future use
      await this.updateReporteWithPdfInfo(reporteId, downloadURL);
      
      return downloadURL;
    } catch (error) {
      console.error('PDF not found or access error:', error);
      return null;
    }
  }

  /**
   * Update report with PDF information
   * @param reporteId Report ID
   * @param pdfUrl URL of the PDF in Firebase Storage
   * @returns Promise that resolves when the update is complete
   */
  async updateReporteWithPdfInfo(reporteId: string, pdfUrl: string): Promise<void> {
    try {
      const reporteRef = doc(this.firestore, 'Reportes', reporteId);
      
      await updateDoc(reporteRef, {
        pdfUrl: pdfUrl,
        reportePdfGenerado: true,
        fechaGeneracionPdf: new Date()
      });
      
      console.log('Report PDF info updated successfully with URL:', pdfUrl);
    } catch (error) {
      console.error('Error updating report PDF info:', error);
      throw error;
    }
  }

  /**
   * Delete PDF from Storage
   * @param reporteId Report ID
   * @returns Promise that resolves when the deletion is complete
   */
  async deletePdfForReporte(reporteId: string): Promise<void> {
    try {
      const pdfPath = `reportes_pdf/${reporteId}.pdf`;
      const storageRef = ref(this.storage, pdfPath);
      
      await deleteObject(storageRef);
      console.log('PDF deleted successfully');
    } catch (error) {
      console.error('Error deleting PDF:', error);
      throw error;
    }
  }

  /**
   * Delete a report
   * @param reporteId Report ID
   * @returns Promise that resolves when the deletion is complete
   */
  async deleteReporte(reporteId: string): Promise<void> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }
      
      // Verify the user is an admin
      const userDoc = await getDoc(doc(this.firestore, 'Usuario', currentUser.uid));
      if (!userDoc.exists()) {
        throw new Error('Usuario no encontrado');
      }
      
      const userData = userDoc.data();
      if (userData['Rol'] !== 'admin') {
        throw new Error('Solo los administradores pueden eliminar reportes');
      }
      
      // Verify the report exists
      const reporteRef = doc(this.firestore, 'Reportes', reporteId);
      const reporteDoc = await getDoc(reporteRef);
      if (!reporteDoc.exists()) {
        throw new Error('El reporte no existe');
      }
      
      // Try to delete the PDF if it exists
      try {
        await this.deletePdfForReporte(reporteId);
      } catch (pdfError) {
        console.warn('No se pudo eliminar el PDF del reporte:', pdfError);
        // Continue with deleting the report even if PDF deletion fails
      }
      
      console.log('Eliminando reporte:', reporteId);
      await deleteDoc(reporteRef);
      console.log('Reporte eliminado exitosamente');
    } catch (error) {
      console.error('Error al eliminar reporte:', error);
      throw error;
    }
  }

  /**
   * Assign a new report task
   * @param reportData Report data to create
   * @returns Promise with the new report ID
   */
  async assignReporte(reportData: Omit<Reporte, 'IdReporte'>): Promise<string> {
    try {
      console.log('Attempting to assign report with data:', JSON.stringify(reportData));
      
      // 1. Obtain current user and verify they're an admin
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }
      
      // 2. Get current user data from Firestore
      const adminDoc = await getDoc(doc(this.firestore, 'Usuario', currentUser.uid));
      if (!adminDoc.exists()) {
        throw new Error('Usuario administrador no encontrado');
      }
      
      const adminData = adminDoc.data();
      if (adminData['Rol'] !== 'admin') {
        throw new Error('No tiene permisos para crear reportes');
      }
      
      // 3. Find worker user by Username
      const workersRef = collection(this.firestore, 'Usuario');
      
      console.log('Searching for worker with Username:', reportData.IdUsuario);
      
      const workerQuery = query(workersRef, 
        where('Username', '==', reportData.IdUsuario),
        where('Rol', '==', 'worker')
      );
      
      const workerSnapshot = await getDocs(workerQuery);
      if (workerSnapshot.empty) {
        console.error('Worker not found. Trying alternative search...');
        
        // Try alternative search without role restriction
        const altWorkerQuery = query(workersRef, 
          where('Username', '==', reportData.IdUsuario)
        );
        
        const altWorkerSnapshot = await getDocs(altWorkerQuery);
        if (altWorkerSnapshot.empty) {
          throw new Error('Usuario trabajador no encontrado');
        }
        
        const workerDoc = altWorkerSnapshot.docs[0];
        const workerId = workerDoc.id;
        console.log('Found worker with different role:', workerId);
        
        // 4. Create report with validated data and correct worker ID
        const reportesRef = collection(this.firestore, 'Reportes');
        const reporteData = {
          fecha: new Date(),
          estado: 'Pendiente',
          IdEmpresa: reportData.IdEmpresa,
          IdUsuario: workerId, // Use real worker ID
          Tipo_Trabajo: reportData.Tipo_Trabajo,
          jobDescription: reportData.jobDescription,
          location: reportData.location,
          priority: reportData.priority,
          departamento: reportData.departamento,
          fechaActualizacion: new Date()
        };
        
        // 5. Save the report
        const docRef = await addDoc(reportesRef, reporteData);
        
        // 6. Update report ID
        await updateDoc(doc(this.firestore, 'Reportes', docRef.id), {
          IdReporte: docRef.id
        });
        
        console.log('Reporte creado exitosamente:', docRef.id);
        return docRef.id;
      }
      
      const workerDoc = workerSnapshot.docs[0];
      const workerId = workerDoc.id;
      console.log('Found worker:', workerId);
      
      // 4. Create report with validated data and correct worker ID
      const reportesRef = collection(this.firestore, 'Reportes');
      const reporteData = {
        fecha: new Date(),
        estado: 'Pendiente',
        IdEmpresa: reportData.IdEmpresa,
        IdUsuario: workerId, // Use real worker ID
        Tipo_Trabajo: reportData.Tipo_Trabajo,
        jobDescription: reportData.jobDescription,
        location: reportData.location,
        priority: reportData.priority,
        departamento: reportData.departamento,
        fechaActualizacion: new Date()
      };
      
      console.log('Creating report with data:', JSON.stringify(reporteData));
      
      // 5. Save the report
      const docRef = await addDoc(reportesRef, reporteData);
      
      // 6. Update report ID
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
  
  // Additional methods for getting reports by department, company, priority, etc.
  getReportes(): Observable<Reporte[]> {
    console.log('Obteniendo todos los reportes');
    const reportesRef = collection(this.firestore, 'Reportes');
    return collectionData(reportesRef, { idField: 'IdReporte' }).pipe(
      map((reportes: any[]) => {
        console.log('Reportes recuperados:', reportes);
        return this.processReportDates(reportes);
      })
    );
  }
  
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
        return this.processReportDates(reportes);
      })
    );
  }
  
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
        return this.processReportDates(reportes);
      })
    );
  }
  
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
        return this.processReportDates(reportes);
      })
    );
  }
  
  async getFilteredReportes(): Promise<Observable<Reporte[]>> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        console.error('No hay usuario autenticado');
        return of([]);
      }
      
      // Get current user data
      const userData = await this.authService.getUserData(currentUser.uid);
      if (!userData) {
        console.error('Datos de usuario no encontrados');
        return of([]);
      }
      
      // If admin level 3, filter reports only by users created by them
      if (userData.Rol === 'admin' && userData.NivelAdmin === '3') {
        return this.getReportesByCreator(currentUser.uid);
      }
      
      // For other cases, return all reports
      return this.getReportes();
    } catch (error) {
      console.error('Error al filtrar reportes:', error);
      return of([]);
    }
  }
  
  getReportesByCreator(creatorId: string): Observable<Reporte[]> {
    return new Observable<Reporte[]>(observer => {
      // First get users created by this admin
      this.authService.getUsersByCreator(creatorId).then(users => {
        // Extract only user IDs
        const userIds = users.map(user => user.IdUsuario);
        
        if (userIds.length === 0) {
          observer.next([]);
          observer.complete();
          return;
        }
        
        // Get reports for these users
        const reportesRef = collection(this.firestore, 'Reportes');
        
        // Firebase doesn't allow 'in' queries with more than 10 elements
        // Split into groups of 10 if needed
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
            return this.processReportDates(reportes);
          });
          reportePromises.push(promise);
        });
        
        Promise.all(reportePromises).then(reportesArrays => {
          // Combine all report arrays
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
  
  // Helper method to split arrays into groups of specific size
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}