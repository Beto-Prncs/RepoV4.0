
import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef, AfterViewInit,
  HostListener } from '@angular/core';
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
    getDoc,
    addDoc
  } from '@angular/fire/firestore';
  import { Subscription, BehaviorSubject, from } from 'rxjs';
  
  import { FormsModule } from '@angular/forms';
  import { Usuario, Reporte } from '../../models/interfaces';
  import { TaskService } from '../../services/task.service';
  import { switchMap, catchError, tap } from 'rxjs/operators';
  import SignaturePad from 'signature_pad';
  import { PdfViewerModule } from 'ng2-pdf-viewer';
  import { jsPDF } from 'jspdf';
  // Nueva forma de importar funcionalidades específicas de Capacitor en versión 3+
  import { Capacitor } from '@capacitor/core';
  import { Haptics, ImpactStyle } from '@capacitor/haptics';

@Component({
    selector: 'app-worker-pendingtask',
    standalone: true,
    imports: [CommonModule, FormsModule, PdfViewerModule],
    templateUrl: './worker-pendingtask.component.html',
    styleUrl: './worker-pendingtask.component.scss'
})
export class WorkerPendingtaskComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('signatureCanvas') signatureCanvas!: ElementRef<HTMLCanvasElement>;
  private firestore: Firestore = inject(Firestore);
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);
  private taskService: TaskService = inject(TaskService);
  // Observables y estados
  pendingReportes = new BehaviorSubject<Reporte[]>([]);
  currentUser: Usuario | null = null;
  private subscriptions: Subscription[] = [];
  isLoading = true;
  isSubmitting = false;
  showErrors = false;

  // Mensajes para el usuario
  errorMessage: string = '';
  successMessage: string = '';
  // Datos del formulario
  completionDescription: string = '';
  materialsUsed: string = '';
  // Signature pad
  private signaturePad!: SignaturePad;
  signatureData: string | null = null;
  // PDF preview variables
  showPdfPreview = false;
  pdfSrc: any;
  selectedReporte: Reporte | null = null;
  // Flag para detectar plataforma móvil
  isMobile: boolean = false;
  
  constructor() {
    // Detectar si estamos en dispositivo móvil usando Capacitor
    this.isMobile = Capacitor.isNativePlatform() || 
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    console.log('Ejecutando en plataforma móvil:', this.isMobile);
  }
  
  ngOnInit(): void {
    console.log('Inicializando componente worker-pendingtask');
    this.setupAuthListener();
  }

  ngAfterViewInit(): void {
    // Inicializar el pad de firmas después de que la vista se haya inicializado
    setTimeout(() => {
      this.initSignaturePad();
      this.resizeCanvas();
    }, 300);
  }
  
  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.resizeCanvas();
  }
  
  private resizeCanvas(): void {
    if (this.signatureCanvas && this.signatureCanvas.nativeElement) {
      const canvas = this.signatureCanvas.nativeElement;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const parentWidth = canvas.parentElement?.offsetWidth || canvas.offsetWidth;
      
      // Guardar la firma actual si existe
      const data = this.signaturePad?.toData();
      
      // Configurar el canvas con las dimensiones correctas
      canvas.width = parentWidth * ratio;
      canvas.height = 200 * ratio;
      canvas.style.width = `${parentWidth}px`;
      canvas.style.height = '200px';
      
      // Ajustar el contexto del canvas para el ratio de píxeles
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
      }
      
      // Reinicializar el pad de firmas con el canvas redimensionado
      this.initSignaturePad();
      
      // Restaurar la firma si había una
      if (data && data.length) {
        this.signaturePad.fromData(data);
      }
    }
  }
  
  private initSignaturePad(): void {
    if (this.signatureCanvas && this.signatureCanvas.nativeElement) {
      const canvas = this.signatureCanvas.nativeElement;
      
      // Opciones mejoradas para dispositivos móviles
      this.signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
        velocityFilterWeight: this.isMobile ? 0.4 : 0.7,  // Menor valor para dispositivos móviles
        minWidth: this.isMobile ? 1.0 : 0.5,              // Línea más gruesa en móviles
        maxWidth: this.isMobile ? 3.5 : 2.5,              // Línea más gruesa en móviles
        throttle: 16,                                     // 60fps
        minDistance: this.isMobile ? 2 : 1                // Mayor valor para dispositivos móviles
      });

      // Configurar eventos touch optimizados para móviles
      if (this.isMobile) {
        this.setupMobileTouchEvents(canvas);
      }
    }
  }
  
  // Método específico para manejar eventos touch en móviles
  private setupMobileTouchEvents(canvas: HTMLCanvasElement): void {
    const signatureBox = canvas.parentElement as HTMLElement;
    
    // Prevenir scroll y otros gestos del navegador durante la firma
    const preventDefaultAction = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    canvas.addEventListener('touchstart', preventDefaultAction, { passive: false });
    canvas.addEventListener('touchmove', preventDefaultAction, { passive: false });
    canvas.addEventListener('touchend', preventDefaultAction, { passive: false });
    
    // Retroalimentación táctil (vibración) al empezar y terminar la firma
    if (Capacitor.isPluginAvailable('Haptics')) {
      canvas.addEventListener('touchstart', async () => {
        try {
          await Haptics.impact({ style: ImpactStyle.Light });
        } catch (error) {
          console.log('Haptics no disponible:', error);
        }
      });
      
      canvas.addEventListener('touchend', async () => {
        try {
          await Haptics.impact({ style: ImpactStyle.Light });
        } catch (error) {
          console.log('Haptics no disponible:', error);
        }
      });
    }
    
    // Agregar indicadores visuales para mejorar la experiencia
    signatureBox.addEventListener('touchstart', () => {
      signatureBox.classList.add('active-signing');
    });
    
    signatureBox.addEventListener('touchend', () => {
      signatureBox.classList.remove('active-signing');
    });
  }
  
  clearSignature(): void {
    if (this.signaturePad) {
      this.signaturePad.clear();
      this.signatureData = null;
      
      // Proporcionar retroalimentación táctil al limpiar
      if (this.isMobile && Capacitor.isPluginAvailable('Haptics')) {
        Haptics.impact({ style: ImpactStyle.Medium }).catch(err => 
          console.log('Error de haptics:', err)
        );
      }
    }
  }
  
  saveSignature(): void {
    if (this.signaturePad && !this.signaturePad.isEmpty()) {
      // Usar formato más eficiente para móviles
      this.signatureData = this.signaturePad.toDataURL('image/jpeg', 0.8);
      
      // Proporcionar retroalimentación táctil al guardar
      if (this.isMobile && Capacitor.isPluginAvailable('Haptics')) {
        Haptics.impact({ style: ImpactStyle.Medium }).catch(err => 
          console.log('Error de haptics:', err)
        );
      }
      
      // Indicar éxito
      this.showSuccess('Firma guardada correctamente');
    } else {
      this.handleError('No hay firma para guardar');
    }
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
  
  previewPdf(reporte: Reporte): void {
    this.showErrors = true;
    
    if (!this.validateForm()) {
      this.handleError('Complete todos los campos requeridos antes de generar el PDF');
      return;
    }
    
    // Guardar la firma
    this.saveSignature();
    this.selectedReporte = reporte;
    this.generatePdf(reporte);
    this.showPdfPreview = true;
  }
  
  private validateForm(): boolean {
    // Validar que todos los campos obligatorios estén completos
    if (!this.completionDescription.trim()) {
      return false;
    }
    
    if (!this.materialsUsed.trim()) {
      return false;
    }
    
    // Validar que haya una firma
    if (this.signaturePad && this.signaturePad.isEmpty() && !this.signatureData) {
      return false;
    }
    
    return true;
  }
  
  closePdfPreview(): void {
    this.showPdfPreview = false;
    this.pdfSrc = null;
  }

  confirmCompletion(): void {
    if (this.selectedReporte) {
      this.markAsCompleted(this.selectedReporte);
      this.closePdfPreview();
    }
  }
  
  generatePdf(reporte: Reporte): void {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 20;
      
      // Title
      doc.setFontSize(18);
      doc.text('REPORTE DE TRABAJO COMPLETADO', pageWidth / 2, yPosition, { align: 'center' });
      
      // Basic info
      yPosition += 15;
      doc.setFontSize(12);
      doc.text(`Tipo de trabajo: ${reporte.Tipo_Trabajo}`, 20, yPosition);
      yPosition += 10;
      doc.text(`Fecha de asignación: ${new Date(reporte.fecha).toLocaleDateString()}`, 20, yPosition);
      yPosition += 10;
      doc.text(`Ubicación: ${reporte.location || 'No especificada'}`, 20, yPosition);
      yPosition += 10;
      doc.text(`Departamento: ${reporte.departamento || 'No especificado'}`, 20, yPosition);
      yPosition += 10;
      doc.text(`Prioridad: ${reporte.priority || 'No especificada'}`, 20, yPosition);

      // Description section
      yPosition += 15;
      doc.setFontSize(14);
      doc.text('Descripción original del trabajo:', 20, yPosition);
      yPosition += 8;
      doc.setFontSize(11);
      const descriptionLines = doc.splitTextToSize(reporte.jobDescription || 'No especificada', pageWidth - 40);
      doc.text(descriptionLines, 20, yPosition);
      yPosition += descriptionLines.length * 6 + 10;
      
      // Completion description
      doc.setFontSize(14);
      doc.text('Descripción de la completación:', 20, yPosition);
      yPosition += 8;
      doc.setFontSize(11);
      const completionLines = doc.splitTextToSize(this.completionDescription, pageWidth - 40);
      doc.text(completionLines, 20, yPosition);
      yPosition += completionLines.length * 6 + 10;
      
      // Materials used
      doc.setFontSize(14);
      doc.text('Materiales utilizados:', 20, yPosition);
      yPosition += 8;
      doc.setFontSize(11);
      const materialsLines = doc.splitTextToSize(this.materialsUsed, pageWidth - 40);
      doc.text(materialsLines, 20, yPosition);
      yPosition += materialsLines.length * 6 + 20;
      
      // Date and signature
      if (this.signatureData) {
        doc.addImage(this.signatureData, 'JPEG', 20, yPosition, 80, 40);
        yPosition += 45;
        doc.setFontSize(10);
        doc.text(`Firmado por: ${this.currentUser?.Nombre || 'Trabajador'}`, 20, yPosition);
        yPosition += 5;
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, yPosition);
      }
      
      // Save PDF as data URI string
      this.pdfSrc = doc.output('datauristring');
    } catch (error) {
      console.error('Error al generar PDF:', error);
      this.handleError('Error al generar la vista previa del PDF');
    }
  }
  
  async markAsCompleted(reporte: Reporte): Promise<void> {
    if (!this.validateForm()) {
      this.showErrors = true;
      this.handleError('Complete todos los campos requeridos');
      return;
    }
    
    // Guardar la firma si no se ha hecho aún
    if (!this.signatureData) {
      this.saveSignature();
    }
    
    if (!reporte.IdReporte) {
      this.handleError('Error: Reporte sin ID');
      return;
    }
    
    try {
      this.isSubmitting = true;
      
      // Actualizar el reporte en Firestore con todos los detalles
      await this.taskService.updateReporteStatus(
        reporte.IdReporte,
        'Completado',
        this.completionDescription
      );
      
      // Actualizar con la información adicional (materiales y firma)
      const reporteRef = doc(this.firestore, 'Reportes', reporte.IdReporte);
      await updateDoc(reporteRef, {
        materialesUtilizados: this.materialsUsed,
        firmaDigital: this.signatureData,
        fechaCompletado: new Date(),
        reporteGenerado: true
      });
      
      // Solo guardamos metadatos en Firestore (no el PDF completo)
      const reporteMetadataRef = collection(this.firestore, 'ReportesMetadata');
      await addDoc(reporteMetadataRef, {
        reporteId: reporte.IdReporte,
        trabajadorId: this.currentUser?.IdUsuario,
        nombreTrabajador: this.currentUser?.Nombre || 'Trabajador',
        fechaCompletado: new Date(),
        tipoTrabajo: reporte.Tipo_Trabajo,
        fechaCreacionMetadata: new Date()
      });

      // Proporcionar retroalimentación táctil al completar (en dispositivos móviles)
      if (this.isMobile && Capacitor.isPluginAvailable('Haptics')) {
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(err => 
          console.log('Error de haptics:', err)
        );
      }

      // Limpiar formulario
      this.resetForm();
      this.showSuccess('Reporte marcado como completado exitosamente');
      
      // Recargar los reportes para actualizar la vista
      if (this.currentUser?.IdUsuario) {
        this.loadPendingReportes(this.currentUser.IdUsuario);
      }
    } catch (error) {
      console.error('Error al marcar como completado:', error);
      this.handleError('Error al actualizar el estado del reporte');
    } finally {
      this.isSubmitting = false;
    }
  }
  
  private resetForm(): void {
    this.completionDescription = '';
    this.materialsUsed = '';
    this.signatureData = null;
    this.clearSignature();
    this.showErrors = false;
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

  isSignatureEmpty(): boolean {
    // Verificamos primero si hay datos de firma guardados
    if (this.signatureData) {
      return false;
    }
    
    // Si no hay datos guardados, verificamos si existe signaturePad y si está vacío
    // Solo si signaturePad existe, llamamos a isEmpty()
    if (this.signaturePad) {
      return this.signaturePad.isEmpty();
    }
    
    // Si no hay nada, consideramos que está vacía
    return true;
  }
}