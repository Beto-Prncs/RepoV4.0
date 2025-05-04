import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef, AfterViewInit, HostListener, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
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
  import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
  import { Subscription, BehaviorSubject, from } from 'rxjs';
  import { FormsModule } from '@angular/forms';
  import { Usuario, Reporte } from '../../models/interfaces';
  import { TaskService } from '../../services/task.service';
  import { switchMap, catchError, tap, map } from 'rxjs/operators';
  import SignaturePad from 'signature_pad';
  import { PdfViewerModule } from 'ng2-pdf-viewer';
  import { jsPDF } from 'jspdf';
  import { CameraComponent } from '../../camera/camera.component';
  import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
  import { Capacitor } from '@capacitor/core';
  import { Haptics, ImpactStyle } from '@capacitor/haptics';
  import { CameraService, PhotoItem, ReportItem } from '../../services/camera.service';
  import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
  
  @Component({
    selector: 'app-worker-pendingtask',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, PdfViewerModule],
    templateUrl: './worker-pendingtask.component.html',
    styleUrl: './worker-pendingtask.component.scss',
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [CameraService]
  })
  export class WorkerPendingtaskComponent implements OnInit, OnDestroy, AfterViewInit {
    handleFileUpload(event: any): void {
      const file = event.target.files[0];
      if (!file) {
        return;
      }
      this.isLoading = true;
      this.errorMessage = '';
      // Check if the file is an image
      if (!file.type.match('image.*')) {
        this.errorMessage = 'Solo se permiten archivos de imagen';
        this.isLoading = false;
        return;
      }
      try {
        // Create a FileReader to read the file
        const reader = new FileReader();
        // Set up the onload event handler
        reader.onload = (e: any) => {
          // Get the file data as a data URL
          const imageDataUrl = e.target.result;
          // Update the current image
          this.imgUrl = imageDataUrl;
          // Add to photos collection through the service
          this.cameraService.addPhoto({
            url: imageDataUrl,
            date: new Date(),
            name: file.name
          });
          this.isLoading = false;
        };
        // Set up error handler
        reader.onerror = () => {
          this.errorMessage = 'Error al leer el archivo';
          this.isLoading = false;
        };
        // Read the file as a data URL
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error processing image:', error);
        this.errorMessage = 'Error al procesar la imagen';
        this.isLoading = false;
      }
    }
    
    // Añade esta propiedad para el sistema de pestañas
    activeTab: 'tasks' | 'reportes' | 'camera' | 'gallery' = 'reportes';
    @ViewChild('signatureCanvas') signatureCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild(CameraComponent) cameraComponent!: CameraComponent;
    private firestore: Firestore = inject(Firestore);
    private auth: Auth = inject(Auth);
    private router: Router = inject(Router);
    private taskService: TaskService = inject(TaskService);
    private formBuilder: FormBuilder = inject(FormBuilder);
    private cameraService: CameraService = inject(CameraService);
    private sanitizer: DomSanitizer = inject(DomSanitizer);
    
    // Observables y estados
    pendingReportes = new BehaviorSubject<Reporte[]>([]);
    pendingTasks: any[] = [];
    currentUser: Usuario | null = null;
    private subscriptions: Subscription[] = [];
    isLoading = true;
    isSubmitting = false;
    showErrors = false;
    selectedTask: any = null;
    
    // Mensajes para el usuario
    errorMessage: string = '';
    successMessage: string = '';
    
    // Datos del formulario y reportes
    completionDescription: string = '';
    materialsUsed: string = '';
    reportForm!: FormGroup;
    selectedReporte: Reporte | null = null;
    
    // Signature pad
    private signaturePad!: SignaturePad;
    signatureData: string | null = null;
    
    // PDF preview variables
    showPdfPreview = false;
    pdfSrc: any;
    safePdfUrl: SafeUrl | null = null;
    
    // Estado para los modales
    showCameraModal: boolean = false;
    showPreviewModal: boolean = false;
    evidenceImages: string[] = [];
    
    // Camera and gallery properties
    imgUrl: string = '';
    photos: PhotoItem[] = [];
    showGalleryView: boolean = false;
    
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
      this.initForm();
      // Subscribe to photos from camera service
      this.subscriptions.push(
        this.cameraService.photos$.subscribe(photos => {
          this.photos = photos;
          if (photos.length > 0 && !this.imgUrl) {
            this.imgUrl = photos[0].url;
          }
        })
      );
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
    
    // Inicializar formulario
    initForm() {
      this.reportForm = this.formBuilder.group({
        notes: ['', Validators.required],
        status: ['completed', Validators.required]
      });
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
          velocityFilterWeight: this.isMobile ? 0.4 : 0.7,
          minWidth: this.isMobile ? 1.0 : 0.5,
          maxWidth: this.isMobile ? 3.5 : 2.5,
          throttle: 16,
          minDistance: this.isMobile ? 2 : 1
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
            this.loadPendingTasks(); // Cargar también las tareas del sistema antiguo
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
    
    // Cargar tareas pendientes del sistema original
    async loadPendingTasks() {
      try {
        this.isLoading = true;
        const tasksRef = collection(this.firestore, 'Tasks');
        // Usamos la misma consulta que en el código original
        const q = query(tasksRef, where('status', '==', 'pending'));
        const querySnapshot = await getDocs(q);
        this.pendingTasks = [];
        querySnapshot.forEach((doc) => {
          this.pendingTasks.push({
            id: doc.id,
            ...doc.data()
          });
        });
        console.log('Tareas pendientes cargadas:', this.pendingTasks);
      } catch (error) {
        console.error('Error al cargar tareas pendientes:', error);
        this.errorMessage = 'Error al cargar las tareas pendientes. Intente nuevamente.';
      } finally {
        this.isLoading = false;
      }
    }
    
    // Seleccionar una tarea del sistema original
    selectTask(task: any) {
      this.selectedTask = task;
      this.selectedReporte = null; // Limpiar cualquier reporte seleccionado
      // Actualizar campos del formulario basados en la tarea seleccionada
      this.reportForm.patchValue({
        status: 'completed', // Por defecto, establecemos el estado como completado
        notes: '' // Limpiar notas para nueva tarea
      });
      // Limpiar imágenes de evidencia anteriores
      this.evidenceImages = [];
    }
    
    // Seleccionar un reporte del nuevo sistema
    selectReporte(reporte: Reporte) {
      this.selectedReporte = reporte;
      this.selectedTask = null; // Limpiar cualquier tarea seleccionada
      this.completionDescription = '';
      this.materialsUsed = '';
      // Limpiar imágenes de evidencia anteriores
      this.evidenceImages = [];
    }
    
    private loadPendingReportes(userId: string): void {
      // Limpiar suscripciones anteriores para evitar duplicados
      const existingSubscriptions = this.subscriptions.filter(sub =>
        sub && typeof sub.unsubscribe === 'function');
      existingSubscriptions.forEach(sub => sub.unsubscribe());
      console.log('Consultando reportes pendientes para el trabajador:', userId);
      // Esta es la parte crítica - asegurarse de que el servicio está consultando correctamente
      const subscription =
        this.taskService.getPendingReportesByWorker(userId).pipe(
          tap(reportes => {
            console.log('Reportes pendientes recibidos:', reportes);
            if (reportes && Array.isArray(reportes)) {
              this.pendingReportes.next(reportes);
            } else {
              console.error('El formato de reportes recibido no es un array:', reportes);
              this.pendingReportes.next([]);
            }
            this.isLoading = false;
          }),
          catchError(error => {
            console.error('Error al cargar reportes:', error);
            this.handleError('Error al cargar los reportes pendientes');
            this.isLoading = false;
            this.pendingReportes.next([]);
            return from([]);
          })
        ).subscribe();
      this.subscriptions.push(subscription);
    }
    
    // Camera and gallery methods
    // Method to take a picture
    async takePicture() {
      this.errorMessage = '';
      try {
        this.isLoading = true;
        try {
          const photoUrl = await this.cameraService.takePicture();
          if (photoUrl) {
            this.imgUrl = photoUrl;
          }
        } catch (error) {
          if (String(error).includes('Not implemented on web')) {
            throw new Error('Esta función no está disponible en navegadores web. Por favor, usa la aplicación móvil.');
          } else {
            throw error;
          }
        }
        if (!this.imgUrl) {
          throw new Error('No se obtuvo una imagen válida');
        }
        this.isLoading = false;
      } catch (error) {
        console.error('Error al capturar imagen:', error);
        this.errorMessage = String(error);
        this.isLoading = false;
      }
    }
    
    // Set main photo
    setMainPhoto(photo: PhotoItem) {
      this.imgUrl = photo.url;
    }
    
    // Delete photo from gallery
    deletePhoto(index: number) {
      this.cameraService.deletePhoto(index);
      // Update displayed image if necessary
      if (this.photos.length > 0 && !this.photos.some(p => p.url === this.imgUrl)) {
        this.imgUrl = this.photos[0].url;
      } else if (this.photos.length === 0) {
        this.imgUrl = '';
      }
    }
    
    // Add current image to evidence
    addToEvidence() {
      if (this.imgUrl && !this.evidenceImages.includes(this.imgUrl)) {
        this.evidenceImages.push(this.imgUrl);
        this.showSuccess('Imagen agregada como evidencia');
      } else if (this.evidenceImages.includes(this.imgUrl)) {
        this.handleError('Esta imagen ya está en la lista de evidencias');
      } else {
        this.handleError('No hay imagen para agregar');
      }
    }
    
    // Métodos para el modal de cámara
    openCameraModal() {
      this.showCameraModal = true;
      // Si ya hay un componente de cámara y está inicializado,
      // asegurarse de que esté en el modo de cámara
      if (this.cameraComponent) {
        this.cameraComponent.switchTab('camera');
      }
    }
    
    closeCameraModal() {
      this.showCameraModal = false;
      // Detener la cámara cuando se cierra el modal
      if (this.cameraComponent) {
        this.cameraComponent.stopCamera();
      }
    }
    
    // Guardar imágenes del componente de cámara
    saveEvidenceImages() {
      if (this.cameraComponent && this.cameraComponent.imageGallery.length > 0) {
        // Copiar imágenes del componente de cámara a las evidencias
        this.evidenceImages = [...this.cameraComponent.imageGallery];
        this.closeCameraModal();
      } else {
        this.errorMessage = 'No hay imágenes para guardar';
        setTimeout(() => this.errorMessage = '', 3000);
      }
    }
    
    // Eliminar imagen de evidencia
    removeEvidenceImage(index: number) {
      this.evidenceImages.splice(index, 1);
    }
    
    isGalleryEmpty(): boolean {
      return this.photos.length === 0;
    }
    
    // Métodos para el modal de vista previa
    previewReport() {
      if (!this.selectedTask) {
        this.errorMessage = 'Debes seleccionar una tarea para completar';
        setTimeout(() => this.errorMessage = '', 3000);
        return;
      }
      if (!this.reportForm.valid) {
        this.errorMessage = 'Por favor completa todos los campos requeridos';
        setTimeout(() => this.errorMessage = '', 3000);
        return;
      }
      this.showPreviewModal = true;
    }
    
    closePreviewModal() {
      this.showPreviewModal = false;
    }
    
    private validateForm(): boolean {
      // Si estamos trabajando con un reporte del nuevo sistema
      if (this.selectedReporte) {
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
      // Si estamos trabajando con una tarea del sistema original
      else if (this.selectedTask) {
        return this.reportForm.valid;
      }
      return false;
    }
    
    // Método mejorado para optimizar las imágenes para el PDF
    private optimizeImageForPDF(imageDataUrl: string): Promise<string> {
      return new Promise((resolve, reject) => {
        try {
          const img = new Image();
          img.onload = () => {
            // Crear un canvas para optimizar la imagen
            const canvas = document.createElement('canvas');
            // Limitar el tamaño máximo para evitar problemas de memoria
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;
            // Redimensionar si es necesario
            if (width > MAX_WIDTH) {
              height = (height * MAX_WIDTH) / width;
              width = MAX_WIDTH;
            }
            if (height > MAX_HEIGHT) {
              width = (width * MAX_HEIGHT) / height;
              height = MAX_HEIGHT;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              // Convertir a JPEG con calidad media para PDF
              const optimizedImage = canvas.toDataURL('image/jpeg', 0.7);
              resolve(optimizedImage);
            } else {
              resolve(imageDataUrl); // Fallback a la imagen original
            }
          };
          img.onerror = () => {
            reject(new Error('Error al cargar la imagen'));
          };
          img.src = imageDataUrl;
        } catch (error) {
          reject(error);
        }
      });
    }
    
    // Método para procesar todas las imágenes
    private async processImagesForPDF(): Promise<{evidenceImages: string[], additionalImages: string[]}> {
      const processedEvidenceImages: string[] = [];
      // Procesar imágenes de evidencia
      if (this.evidenceImages.length > 0) {
        for (const imageUrl of this.evidenceImages) {
          try {
            const optimizedImage = await this.optimizeImageForPDF(imageUrl);
            processedEvidenceImages.push(optimizedImage);
          } catch (error) {
            console.error('Error al procesar imagen de evidencia:', error);
          }
        }
      }
      // Procesar fotos adicionales
      const photoUrls = this.photos.map(p => p.url);
      const uniquePhotos = photoUrls.filter(url => !this.evidenceImages.includes(url));
      const processedAdditionalImages: string[] = [];
      if (uniquePhotos.length > 0) {
        for (const imageUrl of uniquePhotos) {
          try {
            const optimizedImage = await this.optimizeImageForPDF(imageUrl);
            processedAdditionalImages.push(optimizedImage);
          } catch (error) {
            console.error('Error al procesar foto adicional:', error);
          }
        }
      }
      return {
        evidenceImages: processedEvidenceImages,
        additionalImages: processedAdditionalImages
      };
    }
    
    async previewPdf(reporte: Reporte): Promise<void> {
      this.showErrors = true;
      if (!this.validateForm()) {
        this.handleError('Complete todos los campos requeridos antes de generar el PDF');
        return;
      }
      // Guardar la firma
      this.saveSignature();
      this.selectedReporte = reporte;
      try {
        this.isLoading = true;
        this.showSuccess('Generando vista previa del PDF...');
        // Generar el PDF
        await this.generatePdf(reporte);
        // Mostrar el modal de vista previa
        this.showPdfPreview = true;
      } catch (error) {
        console.error('Error al generar vista previa del PDF:', error);
        this.handleError('Error al generar la vista previa del PDF');
      } finally {
        this.isLoading = false;
      }
    }
    
    closePdfPreview(): void {
      this.showPdfPreview = false;
      if (this.safePdfUrl) {
        this.revokeObjectURL(this.safePdfUrl);
        this.safePdfUrl = null;
      }
      this.pdfSrc = null;
    }
    
    // Método de confirmación mejorado
    confirmCompletion(): void {
      if (this.selectedReporte) {
        // Guardar la referencia del PDF generado
        console.log('PDF listo para confirmar');
        
        // Cerrar vista previa y marcar como completado
        this.closePdfPreview();
        this.markAsCompleted(this.selectedReporte);
      }
    }
    
    private revokeObjectURL(safeUrl: SafeUrl): void {
      try {
        const urlStr = safeUrl.toString();
        const match = urlStr.match(/blob:http[^"']+/);
        if (match && match[0]) {
          URL.revokeObjectURL(match[0]);
        }
      } catch (error) {
        console.error('Error al revocar URL:', error);
      }
    }
    
    // Método mejorado para guardar el PDF cuando se completa un reporte
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
        
        // Generar el PDF si aún no lo hemos hecho
        if (!this.pdfSrc) {
          await this.generatePdf(reporte);
        }
        
        // Guardar el PDF en Firebase Storage
        if (this.pdfSrc) {
          try {
            console.log('Guardando PDF en Firebase Storage...');
            
            // Almacenar el PDF y obtener su URL
            const pdfUrl = await this.taskService.storePdfForReporte(reporte.IdReporte, this.pdfSrc);
            console.log('PDF guardado con éxito, URL:', pdfUrl);
            
            // Actualizar el reporte con la información del PDF
            await this.taskService.updateReporteWithPdfInfo(reporte.IdReporte, pdfUrl);
            console.log('Reporte actualizado con la información del PDF');
          } catch (pdfError) {
            console.error('Error al guardar el PDF:', pdfError);
            this.handleError('Error al guardar el PDF. El reporte se completará sin PDF.');
            // Continuar con el proceso incluso si falla el almacenamiento del PDF
          }
        } else {
          console.warn('No hay PDF para guardar');
        }
        
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
          reporteGenerado: true,
          evidenceImages: this.evidenceImages,
          IdUsuario: this.currentUser?.IdUsuario // Asegurarse de que el ID de usuario esté correcto
        });
        
        // Proporcionar retroalimentación táctil al completar (en dispositivos móviles)
        if (this.isMobile && Capacitor.isPluginAvailable('Haptics')) {
          Haptics.impact({ style: ImpactStyle.Heavy }).catch(err =>
            console.log('Error de haptics:', err)
          );
        }
        
        // Mostrar mensaje de éxito
        this.showSuccess('Reporte marcado como completado exitosamente');
        
        // Recargar los reportes para actualizar la vista
        if (this.currentUser?.IdUsuario) {
          this.loadPendingReportes(this.currentUser.IdUsuario);
        }
        
        // Limpiar formulario
        this.resetForm();
      } catch (error) {
        console.error('Error al marcar como completado:', error);
        this.handleError('Error al actualizar el estado del reporte');
      } finally {
        this.isSubmitting = false;
      }
    }
    
    // Método mejorado para generar el PDF
    async generatePdf(reporte: Reporte): Promise<void> {
      try {
        this.isLoading = true;
        this.showSuccess('Generando PDF...');
        
        // Asegurarse de que el PDF se guarde en formato correcto para Firebase Storage
        const pdfDoc = new jsPDF();
        
        // Process and optimize images
        const allImages = [...this.evidenceImages];
        // Add any other photos if needed
        if (allImages.length === 0 && this.imgUrl) {
          allImages.push(this.imgUrl);
        }
        
        // Fetch company information if available
        let companyName = "Empresa";
        if (reporte.IdEmpresa) {
          try {
            const companyDocRef = doc(this.firestore, 'Empresa', reporte.IdEmpresa);
            const companyDocSnap = await getDoc(companyDocRef);
            if (companyDocSnap.exists()) {
              // Define the interface for company data
              interface EmpresaData {
                Nombre: string;
                // Other fields as needed
              }
              const companyData = companyDocSnap.data() as EmpresaData;
              companyName = companyData.Nombre || "Empresa";
            }
          } catch (error) {
            console.error('Error al obtener datos de la empresa:', error);
          }
        }
        
        // Create PDF document with proper formatting
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        let yPosition = 30;
        
        // REPO logo - Use base64 encoded image for SVG
        try {
          // Esta es una cadena base64 de un ejemplo de logo SVG - reemplázala con tu logo real
          const logoBase64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCAxMDAgNTAiPjx0ZXh0IHg9IjEwIiB5PSIzNSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjMwIiBmb250LXdlaWdodD0iYm9sZCI+UkVQTzwvdGV4dD48L3N2Zz4=';
          // Añadir logo al PDF
          pdfDoc.addImage(logoBase64, 'SVG', 20, 20, 80, 40);
        } catch (logoError) {
          console.error('Error al cargar el logo:', logoError);
          // Fallback al texto original
          pdfDoc.setFontSize(24);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.text('REPO', 30, 30);
        }
        
        // Header information in a cleaner format with better spacing
        pdfDoc.setFontSize(11);
        pdfDoc.setFont('helvetica', 'normal');
        // Left column info - Updated with company name
        pdfDoc.text(`De: ${this.currentUser?.Nombre || 'Trabajador'}`, 30, 50);
        pdfDoc.text(`Para: ${companyName}`, 30, 58); // Now using the actual company name
        pdfDoc.text(`REF: ${reporte.Tipo_Trabajo}`, 30, 66);
        pdfDoc.text(`Ubicación: ${reporte.location || ''}`, 30, 74);
        pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, 30, 82);
        // Right column - Add QR code text placeholder as in the model
        pdfDoc.text("codido qr de la pagina", pageWidth - 60, 50);
        pdfDoc.text("Repo System", pageWidth - 60, 58);
        
        // Main content section starts
        yPosition = 100;
        pdfDoc.setFontSize(12);
        pdfDoc.text('Por medio de la presente, entrego el reporte de los Servicios Realizados:', 20, yPosition);
        
        // Problem section
        yPosition += 15;
        pdfDoc.setFontSize(12);
        pdfDoc.text('Descripcion del problema:', 20, yPosition);
        yPosition += 10;
        pdfDoc.setFontSize(11);
        const problemLines = pdfDoc.splitTextToSize(reporte.jobDescription || 'No especificado', pageWidth - 40);
        pdfDoc.text(problemLines, 30, yPosition);
        yPosition += problemLines.length * 6 + 5;
        
        // Add horizontal line after description - THIS IS IMPORTANT FOR MATCHING THE MODEL
        pdfDoc.line(20, yPosition, pageWidth - 20, yPosition);
        yPosition += 10;
        
        // Solution section
        pdfDoc.setFontSize(12);
        pdfDoc.text('Solución:', 20, yPosition);
        yPosition += 10;
        const solutionLines = pdfDoc.splitTextToSize(this.completionDescription, pageWidth - 40);
        pdfDoc.text(solutionLines, 30, yPosition);
        yPosition += solutionLines.length * 6 + 5;
        
        // Add horizontal line after solution - THIS IS IMPORTANT FOR MATCHING THE MODEL
        pdfDoc.line(20, yPosition, pageWidth - 20, yPosition);
        yPosition += 10;
        
        // Materials Used section
        pdfDoc.setFontSize(12);
        pdfDoc.text('Materiales Utilizados:', 20, yPosition);
        yPosition += 10;
        const materialsLines = pdfDoc.splitTextToSize(this.materialsUsed, pageWidth - 40);
        pdfDoc.text(materialsLines, 30, yPosition);
        yPosition += materialsLines.length * 6 + 15;
        
        // Evidence section
        pdfDoc.setFontSize(12);
        pdfDoc.text('Evidencias:', 20, yPosition);
        
        // Add images in the evidence section
        if (allImages.length > 0) {
          yPosition += 20;
          // Check if we need a new page
          if (yPosition > pdfDoc.internal.pageSize.getHeight() - 100) {
            pdfDoc.addPage();
            yPosition = 30;
            pdfDoc.text('Evidencias (continuación):', 20, yPosition);
            yPosition += 10;
          }
          
          // Add each image with proper spacing and layout
          for (let i = 0; i < allImages.length; i++) {
            try {
              // Check if we need a new page
              if (yPosition > pdfDoc.internal.pageSize.getHeight() - 110) {
                pdfDoc.addPage();
                yPosition = 30;
                pdfDoc.text('Evidencias (continuación):', 20, yPosition);
                yPosition += 10;
              }
              
              // Add optimized image with better dimensions to match model
              const imgWidth = 170;
              const imgHeight = 100;
              pdfDoc.addImage(allImages[i], 'JPEG', 20, yPosition, imgWidth, imgHeight);
              yPosition += imgHeight + 10;
            } catch (error) {
              console.error(`Error al añadir imagen ${i+1}:`, error);
              // Fallback method if error occurs
              try {
                pdfDoc.addImage(allImages[i], 'JPEG', 20, yPosition, 80, 60);
                yPosition += 70;
              } catch {
                pdfDoc.text(`[No se pudo incluir la imagen ${i+1}]`, 20, yPosition);
                yPosition += 15;
              }
            }
          }
        }
        
        // Add a new page for signature if needed
        if (this.signatureData) {
          if (yPosition > pdfDoc.internal.pageSize.getHeight() - 60) {
            pdfDoc.addPage();
            yPosition = 30;
          }
          yPosition += 20;
          try {
            // Add signature with proper size
            pdfDoc.addImage(this.signatureData, 'JPEG', 20, yPosition, 80, 40);
            yPosition += 50;
            // Add signature metadata
            pdfDoc.setFontSize(10);
            pdfDoc.text(`Firmado por: ${this.currentUser?.Nombre || 'Trabajador'}`, 20, yPosition);
            yPosition += 8;
            pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, yPosition);
          } catch (error) {
            console.error('Error al agregar firma:', error);
            pdfDoc.text('Error al incluir la firma digital. Firma manuscrita autorizada.', 20, yPosition);
            yPosition += 10;
            pdfDoc.text(`Firmado por: ${this.currentUser?.Nombre || 'Trabajador'}`, 20, yPosition);
            yPosition += 8;
            pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, yPosition);
          }
        }
        
        // Generate PDF for preview
        const pdfBlob = pdfDoc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        this.pdfSrc = pdfDoc.output('datauristring');
        
        console.log('PDF generado correctamente');
        this.isLoading = false;
        return Promise.resolve();
      } catch (error) {
        console.error('Error al generar PDF:', error);
        this.handleError('Error al generar PDF. Por favor intenta nuevamente.');
        this.isLoading = false;
        return Promise.reject(error);
      }
    }
    
    async downloadPDF(reporte: Reporte): Promise<void> {
      try {
        this.isLoading = true;
        // Mostrar mensaje de carga
        this.showSuccess('Generando PDF...');
        
        // Fetch company information if available
        let companyName = "Empresa";
        if (reporte.IdEmpresa) {
          try {
            const companyDocRef = doc(this.firestore, 'Empresa', reporte.IdEmpresa);
            const companyDocSnap = await getDoc(companyDocRef);
            if (companyDocSnap.exists()) {
              // Define the interface for company data
              interface EmpresaData {
                Nombre: string;
                // Other fields as needed
              }
              const companyData = companyDocSnap.data() as EmpresaData;
              companyName = companyData.Nombre || "Empresa";
            }
          } catch (error) {
            console.error('Error al obtener datos de la empresa:', error);
          }
        }
        
        // Procesar y optimizar todas las imágenes primero
        const { evidenceImages, additionalImages } = await this.processImagesForPDF();
        const pdfDoc = new jsPDF();
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        let yPosition = 20;
        
        // Title
        pdfDoc.setFontSize(18);
        pdfDoc.text('REPORTE DE TRABAJO COMPLETADO', pageWidth / 2, yPosition, { align: 'center' });
        
        // Basic info
        yPosition += 15;
        pdfDoc.setFontSize(12);
        pdfDoc.text(`Tipo de trabajo: ${reporte.Tipo_Trabajo}`, 20, yPosition);
        yPosition += 10;
        pdfDoc.text(`Fecha de asignación: ${new Date(reporte.fecha).toLocaleDateString()}`, 20, yPosition);
        yPosition += 10;
        pdfDoc.text(`Ubicación: ${reporte.location || 'No especificada'}`, 20, yPosition);
        yPosition += 10;
        pdfDoc.text(`Departamento: ${reporte.departamento || 'No especificado'}`, 20, yPosition);
        yPosition += 10;
        pdfDoc.text(`Prioridad: ${reporte.priority || 'No especificada'}`, 20, yPosition);
        yPosition += 10;
        pdfDoc.text(`Empresa: ${companyName}`, 20, yPosition); // Add company name here
        
        // Description section
        yPosition += 15;
        pdfDoc.setFontSize(14);
        pdfDoc.text('Descripción original del trabajo:', 20, yPosition);
        yPosition += 8;
        pdfDoc.setFontSize(11);
        const descriptionLines = pdfDoc.splitTextToSize(reporte.jobDescription || 'No especificada', pageWidth - 40);
        pdfDoc.text(descriptionLines, 20, yPosition);
        yPosition += descriptionLines.length * 6 + 10;
        
        // Completion description
        pdfDoc.setFontSize(14);
        pdfDoc.text('Descripción de la completación:', 20, yPosition);
        yPosition += 8;
        pdfDoc.setFontSize(11);
        const completionLines = pdfDoc.splitTextToSize(this.completionDescription, pageWidth - 40);
        pdfDoc.text(completionLines, 20, yPosition);
        yPosition += completionLines.length * 6 + 10;
        
        // Materials used
        pdfDoc.setFontSize(14);
        pdfDoc.text('Materiales utilizados:', 20, yPosition);
        yPosition += 8;
        pdfDoc.setFontSize(11);
        const materialsLines = pdfDoc.splitTextToSize(this.materialsUsed, pageWidth - 40);
        pdfDoc.text(materialsLines, 20, yPosition);
        yPosition += materialsLines.length * 6 + 20;
        
        // Evidence images section
        if (evidenceImages.length > 0) {
          // Nueva página para las imágenes para asegurar mejor visualización
          pdfDoc.addPage();
          yPosition = 20;
          pdfDoc.setFontSize(16);
          pdfDoc.text('EVIDENCIA FOTOGRÁFICA', pageWidth / 2, yPosition, { align: 'center' });
          yPosition += 15;
          
          // Add evidence images
          for (let i = 0; i < evidenceImages.length; i++) {
            try {
              // Check if we need a new page
              if (yPosition > pdfDoc.internal.pageSize.getHeight() - 80) {
                pdfDoc.addPage();
                yPosition = 20;
              }
              // Título de la imagen
              pdfDoc.setFontSize(12);
              pdfDoc.text(`Evidencia ${i + 1}`, 20, yPosition);
              yPosition += 10;
              // Agregar la imagen con mayor tamaño para mejor visualización
              pdfDoc.addImage(evidenceImages[i], 'JPEG', 20, yPosition, 170, 100);
              yPosition += 110; // Espacio para la siguiente imagen
            } catch (imgError) {
              console.error('Error adding image to PDF:', imgError);
              // Si falla, intentar añadir la imagen en un tamaño más pequeño
              try {
                pdfDoc.addImage(evidenceImages[i], 'JPEG', 20, yPosition, 80, 50);
                yPosition += 60;
              } catch (smallImgError) {
                console.error('Error adding image in small size:', smallImgError);
              }
            }
          }
        }
        
        // Add any additional images from photos array
        if (additionalImages.length > 0) {
          // Nueva página para las fotos adicionales
          pdfDoc.addPage();
          yPosition = 20;
          pdfDoc.setFontSize(16);
          pdfDoc.text('FOTOS ADICIONALES', pageWidth / 2, yPosition, { align: 'center' });
          yPosition += 15;
          
          // Add additional photos
          for (let i = 0; i < additionalImages.length; i++) {
            try {
              // Check if we need a new page
              if (yPosition > pdfDoc.internal.pageSize.getHeight() - 80) {
                pdfDoc.addPage();
                yPosition = 20;
              }
              // Título de la foto
              pdfDoc.setFontSize(12);
              pdfDoc.text(`Foto adicional ${i + 1}`, 20, yPosition);
              yPosition += 10;
              // Agregar la imagen
              pdfDoc.addImage(additionalImages[i], 'JPEG', 20, yPosition, 170, 100);
              yPosition += 110;
            } catch (imgError) {
              console.error('Error adding additional photo to PDF:', imgError);
              // Si falla, intentar añadir la foto en un tamaño más pequeño
              try {
                pdfDoc.addImage(additionalImages[i], 'JPEG', 20, yPosition, 80, 50);
                yPosition += 60;
              } catch (smallImgError) {
                console.error('Error adding photo in small size:', smallImgError);
              }
            }
          }
        }
        
        // Nueva página para la firma
        pdfDoc.addPage();
        yPosition = 20;
        
        // Date and signature
        pdfDoc.setFontSize(16);
        pdfDoc.text('FIRMA Y FECHA', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 20;
        
        if (this.signatureData) {
          try {
            // Agregar firma con mayor tamaño para mejor visualización
            pdfDoc.addImage(this.signatureData, 'JPEG', 20, yPosition, 170, 80);
            yPosition += 90;
            pdfDoc.setFontSize(12);
            pdfDoc.text(`Firmado por: ${this.currentUser?.Nombre || 'Trabajador'}`, 20, yPosition);
            yPosition += 10;
            pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, yPosition);
          } catch (signError) {
            console.error('Error adding signature to PDF:', signError);
            pdfDoc.setFontSize(10);
            pdfDoc.text('Error al agregar la firma digital', 20, yPosition);
            yPosition += 10;
            pdfDoc.text(`Firmado por: ${this.currentUser?.Nombre || 'Trabajador'}`, 20, yPosition);
            yPosition += 5;
            pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, yPosition);
          }
        }
        
        // Download the PDF
        pdfDoc.save(`Reporte_${reporte.Tipo_Trabajo.replace(/\s+/g, '_')}.pdf`);
        this.isLoading = false;
        this.showSuccess('PDF descargado correctamente');
      } catch (error) {
        console.error('Error al descargar PDF:', error);
        this.handleError('Error al descargar el PDF. Intenta nuevamente.');
        this.isLoading = false;
      }
    }
    
    // Method to enviar el reporte de tareas del sistema original
    async submitReport() {
      if (!this.reportForm.valid) {
        this.errorMessage = 'Por favor completa todos los campos requeridos';
        setTimeout(() => this.errorMessage = '', 3000);
        return;
      }
      
      if (!this.selectedTask) {
        this.errorMessage = 'Debes seleccionar una tarea para completar';
        setTimeout(() => this.errorMessage = '', 3000);
        return;
      }
      
      try {
        this.isLoading = true;
        this.errorMessage = '';
        this.successMessage = '';
        console.log('Iniciando envío de reporte para tarea:', this.selectedTask.id);
        
        this.closePreviewModal(); // Cerrar el modal de vista previa si está abierto
        
        // Subir imágenes a Firebase Storage
        const uploadedImageUrls: string[] = [];
        if (this.evidenceImages.length > 0) {
          console.log(`Procesando ${this.evidenceImages.length} imágenes`);
          const storage = getStorage();
          
          for (let i = 0; i < this.evidenceImages.length; i++) {
            const imageDataUrl = this.evidenceImages[i];
            try {
              console.log(`Procesando imagen ${i+1}/${this.evidenceImages.length}`);
              
              // Convertir Data URL a Blob
              const response = await fetch(imageDataUrl);
              const blob = await response.blob();
              
              // Crear referencia única para la imagen
              const imagePath = `task_evidence/${this.selectedTask.id}/${Date.now()}_${i}`;
              const storageRef = ref(storage, imagePath);
              
              // Subir la imagen
              console.log('Subiendo imagen a Firebase Storage...');
              await uploadBytes(storageRef, blob);
              
              // Obtener URL de descarga
              console.log('Obteniendo URL de descarga...');
              const downloadURL = await getDownloadURL(storageRef);
              console.log('URL obtenida:', downloadURL);
              
              uploadedImageUrls.push(downloadURL);
            } catch (imgError) {
              console.error(`Error al procesar imagen ${i+1}:`, imgError);
              // Continuar con las demás imágenes
            }
          }
        }
        
        // Verificar que hay un ID válido para la tarea
        if (!this.selectedTask.id) {
          throw new Error('ID de tarea no válido o no disponible');
        }
        
        console.log('Actualizando tarea en Firestore:', this.selectedTask.id);
        
        // Preparar datos para actualizar
        const updateData = {
          status: this.reportForm.value.status,
          completionNotes: this.reportForm.value.notes,
          evidenceImages: uploadedImageUrls,
          completedAt: new Date(),
          completedBy: this.currentUser?.IdUsuario || 'unknown'
        };
        
        // Actualizar la tarea en Firestore
        const taskDocRef = doc(this.firestore, 'Tasks', this.selectedTask.id);
        await updateDoc(taskDocRef, updateData);
        
        console.log('Tarea actualizada correctamente');
        
        // Mostrar mensaje de éxito
        this.successMessage = 'Tarea completada exitosamente';
        
        // Resetear el formulario y la selección después de un breve tiempo
        setTimeout(() => {
          this.resetForm(); // Usar el método resetForm existente
          this.loadPendingTasks(); // Recargar tareas pendientes
        }, 2000);
        
      } catch (error: unknown) {
        console.error('Error detallado al enviar reporte:', error);
        
        // Casting explícito a Error si sabemos que es un Error
        const errorMessage = error instanceof Error 
          ? error.message 
          : 'Error desconocido';
          
        this.errorMessage = `Error al enviar el reporte: ${errorMessage}`;
      
      } finally {
        // Asegurar que isLoading se desactive siempre, incluso en caso de error
        this.isLoading = false;
      }
    }
    
    private resetForm(): void {
      this.completionDescription = '';
      this.materialsUsed = '';
      this.signatureData = null;
      this.clearSignature();
      this.showErrors = false;
      this.reportForm.reset();
      this.selectedTask = null;
      this.selectedReporte = null;
      this.evidenceImages = [];
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
      // Revoke any object URLs to prevent memory leaks
      if (this.safePdfUrl) {
        this.revokeObjectURL(this.safePdfUrl);
      }
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