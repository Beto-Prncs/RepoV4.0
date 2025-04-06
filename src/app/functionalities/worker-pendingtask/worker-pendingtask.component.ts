import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  collectionData,
  Timestamp,
  doc,
  updateDoc,
  getDoc
} from '@angular/fire/firestore';
import { Subscription, BehaviorSubject, from } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Usuario, Reporte, ReportPDFData } from '../../models/interfaces';
import { TaskService } from '../../services/task.service';
import generateReportPDF from '../../lib/pdf';
import { switchMap, catchError, tap } from 'rxjs/operators';

@Component({
    selector: 'app-worker-pendingtask',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './worker-pendingtask.component.html',
    styleUrl: './worker-pendingtask.component.css'
})
export class WorkerPendingtaskComponent implements OnInit, OnDestroy {
    private firestore: Firestore = inject(Firestore);
    private auth: Auth = inject(Auth);
    private router: Router = inject(Router);
    private taskService: TaskService = inject(TaskService);
  
    pendingReportes = new BehaviorSubject<Reporte[]>([]);
    currentUser: Usuario | null = null;
    private subscriptions: Subscription[] = [];
    isLoading = true;
    reportDescription: string = '';
    errorMessage: string = '';
    successMessage: string = '';
    completionDescription: string = '';
  
    ngOnInit(): void {
      console.log('Inicializando componente worker-Pendingtask')
      this.setupAuthListener();
    }
  
    private setupAuthListener(): void {
      const authSub = this.auth.onAuthStateChanged(async (user) => {
        if (user) {
          console.log('Usuario autenticado:', user.email);
          try {
            await this.loadUserData(user.uid);
          } catch (error) {
            console.error('Error en la inicialización:', error);
            this.handleError('Error al cargar los datos del usuario');
          }
        } else {
          console.log('No hay usuario autenticado');
          this.router.navigate(['/login']);
        }
      });
  
      if (authSub) {
        this.subscriptions.push(new Subscription(() => authSub()));
      }
    }
  
    private async loadUserData(userId: string): Promise<void> {
      try {
        console.log('Cargando datos del usuario:', userId);
        const userDoc = await getDoc(doc(this.firestore, 'Usuario', userId));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          this.currentUser = {
            ...userData as Usuario,
            IdUsuario: userId
          };
          console.log('Datos de usuario cargados:', this.currentUser);
          
          if (this.currentUser.IdUsuario) {
            this.loadPendingReportes(this.currentUser.IdUsuario);
          } else {
            throw new Error('Usuario sin ID válido');
          }
        } else {
          throw new Error('No se encontró el documento del usuario');
        }
      } catch (error) {
        console.error('Error al cargar datos del usuario:', error);
        this.handleError('Error al cargar los datos del usuario');
      }
    }
  
    private loadPendingReportes(userId: string): void {
      const subscription = this.taskService.getPendingReportesByWorker(userId).pipe(
        tap(reportes => {
          console.log('Reportes pendientes recibidos:', reportes);
          this.pendingReportes.next(reportes);
          this.isLoading = false;
        }),
        catchError(error => {
          console.error('Error al cargar reportes:', error);
          this.handleError('Error al cargar los reportes pendientes');
          this.isLoading = false;
          return from([]);
        })
      ).subscribe();
  
      this.subscriptions.push(subscription);
    }
  
    async markAsCompleted(reporte: Reporte): Promise<void> {
        if (!this.completionDescription.trim()) {
          this.handleError('La descripción de completación es requerida');
          return;
        }
      
        if (!reporte.IdReporte) {
          this.handleError('Error: Reporte sin ID');
          return;
        }
      
        try {
          this.isLoading = true;
          
          await this.taskService.updateReporteStatus(
            reporte.IdReporte,
            'Completado',
            this.completionDescription
          );
    
          // Obtener datos de la empresa
          const empresaDoc = await getDoc(doc(this.firestore, 'Empresa', reporte.IdEmpresa));
          const empresaData = empresaDoc.exists() ? empresaDoc.data() : null;
      
          const pdfData: ReportPDFData = {
            trabajador: this.currentUser?.Username || 'No especificado',
            empresa: empresaData ? (empresaData as any)['Nombre'] || 'No especificada' : 'No especificada',
            nombreReporte: reporte.Tipo_Trabajo,
            ubicacion: reporte.location,
            fecha: new Date().toLocaleDateString('es-ES'),
            problema: reporte.jobDescription,
            descripcion: reporte.jobDescription,
            solucion: this.completionDescription,
            departamento: reporte.departamento,
            prioridad: reporte.priority,
            materialesUtilizados: 'No especificados',
            codigoQR: reporte.IdReporte
          };
      
          try {
            console.log('Generando PDF con datos:', pdfData);
            await generateReportPDF(pdfData);
            console.log('PDF generado exitosamente');
          } catch (pdfError) {
            console.error('Error al generar el PDF:', pdfError);
            this.handleError('Se completó el reporte pero hubo un error al generar el PDF');
          }
      
          this.showSuccess('Reporte marcado como completado exitosamente');
          this.resetForm();
          
          if (this.currentUser?.IdUsuario) {
            this.loadPendingReportes(this.currentUser.IdUsuario);
          }
          
          this.router.navigate(['/worker-completetask']);
        } catch (error) {
          console.error('Error al marcar como completado:', error);
          this.handleError('Error al marcar el reporte como completado');
        } finally {
          this.isLoading = false;
        }
      }
  
    private resetForm(): void {
      this.reportDescription = '';
      this.completionDescription = '';
    }
  
    private handleError(message: string): void {
      this.errorMessage = message;
      setTimeout(() => {
        this.errorMessage = '';
      }, 5000);
    }
  
    private showSuccess(message: string): void {
      this.successMessage = message;
      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
    }
  
    goBack(): void {
      this.router.navigate(['/worker']);
    }
  
    ngOnDestroy(): void {
      this.subscriptions.forEach(sub => sub.unsubscribe());
    }
  }