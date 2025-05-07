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
      // Aumentamos el timeout para asegurar que el DOM esté completamente cargado
      setTimeout(() => {
        this.initSignaturePad();
        this.resizeCanvas();
      }, 500);
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
      if (!this.signatureCanvas || !this.signatureCanvas.nativeElement) {
        return;
      }
      
      try {
        const canvas = this.signatureCanvas.nativeElement;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const parentWidth = canvas.parentElement?.offsetWidth || canvas.offsetWidth;
        
        // Guardar la firma actual si existe
        let data = null;
        if (this.signaturePad && !this.signaturePad.isEmpty()) {
          data = this.signaturePad.toData();
        }
        
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
        if (data && data.length && this.signaturePad) {
          this.signaturePad.fromData(data);
        }
      } catch (error) {
        console.error('Error al redimensionar el canvas:', error);
      }
    }
    
    private initSignaturePad(): void {
      if (!this.signatureCanvas || !this.signatureCanvas.nativeElement) {
        console.error('Canvas de firma no encontrado en el DOM');
        return;
      }
      
      try {
        const canvas = this.signatureCanvas.nativeElement;
        
        // Verifica y ajusta el contexto del canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('No se pudo obtener el contexto 2D del canvas');
          return;
        }
        
        // Si ya existe una instancia, destruirla antes de crear una nueva
        if (this.signaturePad) {
          try {
            // Intentar desconectar eventos si es posible
            if (typeof this.signaturePad.off === 'function') {
              this.signaturePad.off();
            }
          } catch (e) {
            console.log('No se pudieron desconectar eventos anteriores:', e);
          }
        }
        
        // Crear una nueva instancia con opciones optimizadas
        this.signaturePad = new SignaturePad(canvas, {
          backgroundColor: 'rgb(255, 255, 255)',
          penColor: 'rgb(0, 0, 0)',
          velocityFilterWeight: this.isMobile ? 0.4 : 0.7,
          minWidth: this.isMobile ? 1.0 : 0.5,
          maxWidth: this.isMobile ? 3.5 : 2.5,
          throttle: 16,
          minDistance: this.isMobile ? 2 : 1
        });
        
        // Verificar que la instancia se creó correctamente
        if (!this.signaturePad) {
          console.error('Error al crear la instancia de SignaturePad');
          return;
        }
        
        // Agregar event listeners para detectar cuando se firma si están disponibles
        try {
          if (typeof this.signaturePad.addEventListener === 'function') {
            this.signaturePad.addEventListener("beginStroke", () => {
              console.log("Comenzando a firmar");
            });
            
            this.signaturePad.addEventListener("endStroke", () => {
              console.log("Fin de trazo de firma");
            });
          }
        } catch (e) {
          console.log('SignaturePad no soporta eventos personalizados:', e);
        }
        
        // Configurar eventos touch optimizados para móviles
        if (this.isMobile) {
          this.setupMobileTouchEvents(canvas);
        }
        
        console.log('SignaturePad inicializado correctamente');
      } catch (error) {
        console.error('Error al inicializar SignaturePad:', error);
        this.handleError('Error al inicializar el pad de firmas');
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
    


// 1. Método clearSignature mejorado - Reemplaza tu método actual
clearSignature(): void {
  if (this.signaturePad) {
    // Borrar la firma
    this.signaturePad.clear();
    // Asegurar que también se resetee el signatureData
    this.signatureData = null;
    
    // Proporcionar retroalimentación visual al borrar
    const canvas = this.signatureCanvas?.nativeElement;
    if (canvas && canvas.parentElement) {
      // Efecto visual de "flash" en el contenedor
      canvas.parentElement.classList.add('cleared');
      setTimeout(() => {
        canvas.parentElement.classList.remove('cleared');
      }, 300);
    }
    
    // Proporcionar retroalimentación táctil al limpiar en dispositivos móviles
    if (this.isMobile && Capacitor.isPluginAvailable('Haptics')) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(err =>
        console.log('Error de haptics:', err)
      );
    }
    
    // Notificar al usuario
    this.showSuccess('Firma borrada correctamente');
  } else {
    // Si signaturePad no existe, recrearlo
    console.warn('SignaturePad no inicializado, intentando reinicializar...');
    setTimeout(() => {
      this.initSignaturePad();
      // Intentar borrar nuevamente después de la inicialización
      if (this.signaturePad) {
        this.signaturePad.clear();
        this.signatureData = null;
      } else {
        this.handleError('No se pudo inicializar el pad de firmas');
      }
    }, 100);
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
        let pdfUrl = null;
        if (this.pdfSrc) {
          try {
            console.log('Guardando PDF en Firebase Storage...');
            
            // Almacenar el PDF y obtener su URL
            pdfUrl = await this.taskService.storePdfForReporte(reporte.IdReporte, this.pdfSrc);
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
        
        // Importante: Actualizar el reporte con estado "Completado"
        await this.taskService.updateReporteStatus(
          reporte.IdReporte,
          'Completado',
          this.completionDescription
        );
        
        console.log('Estado del reporte actualizado a Completado');
        
        // Actualizar con la información adicional (materiales y firma)
        const updateData = {
          materialesUtilizados: this.materialsUsed,
          firmaDigital: this.signatureData,
          fechaCompletado: new Date(),
          reporteGenerado: true,
          evidenceImages: this.evidenceImages,
          IdUsuario: this.currentUser?.IdUsuario // Asegurarse de que el ID de usuario esté correcto
        };
        
        // Actualizar el documento del reporte
        const reporteRef = doc(this.firestore, 'Reportes', reporte.IdReporte);
        await updateDoc(reporteRef, updateData);
        
        console.log('Reporte completado con éxito. Datos actualizados:', updateData);
        
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
        this.handleError('Error al actualizar el estado del reporte: ' + (error instanceof Error ? error.message : 'Error desconocido'));
      } finally {
        this.isSubmitting = false;
      }
    }
    
    // Método mejorado para generar el PDF
    async generatePdf(reporte: Reporte): Promise<void> {
      try {
        this.isLoading = true;
        this.showSuccess('Generando PDF...');
        
        // Create a standard PDF document format that will be used for both preview and download
        const pdfDoc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        
        // Process and optimize images
        const { evidenceImages, additionalImages } = await this.processImagesForPDF();
        
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
        
        // Get document dimensions
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        const pageHeight = pdfDoc.internal.pageSize.getHeight();
        const margin = 20; // Standard margin in mm
        let yPosition = margin;
        
        // Add header with logo
        try {
          // Esta es una cadena base64 de un ejemplo de logo SVG - reemplázala con tu logo real
          const logoBase64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCAxMDAgNTAiPjx0ZXh0IHg9IjEwIiB5PSIzNSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjMwIiBmb250LXdlaWdodD0iYm9sZCI+UkVQTzwvdGV4dD48L3N2Zz4=';
          // Añadir logo al PDF
          pdfDoc.addImage(logoBase64, 'SVG', margin, yPosition, 40, 20);
        } catch (logoError) {
          console.error('Error al cargar el logo:', logoError);
          // Fallback to text if image fails
          pdfDoc.setFontSize(24);
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.text('REPO', margin, yPosition + 10);
        }
        
        // Add title centered on page
        pdfDoc.setFontSize(18);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('REPORTE DE TRABAJO COMPLETADO', pageWidth / 2, yPosition + 10, { align: 'center' });
        
        yPosition += 30; // Move down after header
        
        // Add report information
        pdfDoc.setFontSize(11);
        pdfDoc.setFont('helvetica', 'normal');
        
        // Left column info
        pdfDoc.text(`De: ${this.currentUser?.Nombre || 'Trabajador'}`, margin, yPosition);
        pdfDoc.text(`Para: ${companyName}`, margin, yPosition + 8);
        pdfDoc.text(`REF: ${reporte.Tipo_Trabajo}`, margin, yPosition + 16);
        pdfDoc.text(`Ubicación: ${reporte.location || 'No especificada'}`, margin, yPosition + 24);
        pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, margin, yPosition + 32);
        
        // Right column - Add QR code text placeholder
        pdfDoc.text("Código QR de la página", pageWidth - 60, yPosition);
        pdfDoc.text("Repo System", pageWidth - 60, yPosition + 8);
        
        yPosition += 45; // Move down after information section
        
        // Add horizontal separator
        pdfDoc.setDrawColor(220, 220, 220);
        pdfDoc.line(margin, yPosition, pageWidth - margin, yPosition);
        
        yPosition += 10; // Move down after separator
        
        // Problem description section
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Descripción del problema:', margin, yPosition);
        
        yPosition += 8;
        
        pdfDoc.setFontSize(11);
        pdfDoc.setFont('helvetica', 'normal');
        // Split text to fit in page width, accounting for margins
        const maxWidth = pageWidth - (2 * margin);
        const problemLines = pdfDoc.splitTextToSize(reporte.jobDescription || 'No especificado', maxWidth);
        
        // Check if we need a new page
        if (yPosition + (problemLines.length * 5) > pageHeight - margin) {
          pdfDoc.addPage();
          yPosition = margin;
        }
        
        pdfDoc.text(problemLines, margin, yPosition);
        yPosition += problemLines.length * 6 + 10;
        
        // Add horizontal separator
        pdfDoc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
        
        // Solution section
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Solución:', margin, yPosition);
        
        yPosition += 8;
        
        pdfDoc.setFontSize(11);
        pdfDoc.setFont('helvetica', 'normal');
        const solutionLines = pdfDoc.splitTextToSize(this.completionDescription, maxWidth);
        
        // Check if we need a new page
        if (yPosition + (solutionLines.length * 5) > pageHeight - margin) {
          pdfDoc.addPage();
          yPosition = margin;
        }
        
        pdfDoc.text(solutionLines, margin, yPosition);
        yPosition += solutionLines.length * 6 + 10;
        
        // Add horizontal separator
        pdfDoc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
        
        // Materials Used section
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Materiales Utilizados:', margin, yPosition);
        
        yPosition += 8;
        
        pdfDoc.setFontSize(11);
        pdfDoc.setFont('helvetica', 'normal');
        const materialsLines = pdfDoc.splitTextToSize(this.materialsUsed, maxWidth);
        
        // Check if we need a new page
        if (yPosition + (materialsLines.length * 5) > pageHeight - margin) {
          pdfDoc.addPage();
          yPosition = margin;
        }
        
        pdfDoc.text(materialsLines, margin, yPosition);
        yPosition += materialsLines.length * 6 + 15;
        
        // Evidence section - Using the combined images from processImagesForPDF
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Evidencias:', margin, yPosition);
        
        yPosition += 10;
        
        // Calculate image dimensions for consistent sizing
        const imageWidth = pageWidth - (2 * margin); // Full width minus margins
        const imageHeight = 80; // Fixed height for consistent appearance
        
        // Add evidence images
        if (evidenceImages.length > 0) {
          // Check if we need a new page
          if (yPosition + imageHeight > pageHeight - margin) {
            pdfDoc.addPage();
            yPosition = margin;
            pdfDoc.setFontSize(12);
            pdfDoc.setFont('helvetica', 'bold');
            pdfDoc.text('Evidencias (continuación):', margin, yPosition);
            yPosition += 10;
          }
          
          for (let i = 0; i < evidenceImages.length; i++) {
            try {
              // Check if we need a new page for each image
              if (yPosition + imageHeight > pageHeight - margin) {
                pdfDoc.addPage();
                yPosition = margin;
                pdfDoc.setFontSize(12);
                pdfDoc.setFont('helvetica', 'bold');
                pdfDoc.text('Evidencias (continuación):', margin, yPosition);
                yPosition += 10;
              }
              
              // Add image label
              pdfDoc.setFontSize(10);
              pdfDoc.setFont('helvetica', 'normal');
              pdfDoc.text(`Evidencia ${i + 1}:`, margin, yPosition);
              yPosition += 5;
              
              // Add the image with consistent dimensions
              pdfDoc.addImage(evidenceImages[i], 'JPEG', margin, yPosition, imageWidth, imageHeight);
              yPosition += imageHeight + 15; // Add space after image
            } catch (error) {
              console.error(`Error al añadir imagen ${i+1}:`, error);
              pdfDoc.text(`[No se pudo incluir la imagen ${i+1}]`, margin, yPosition);
              yPosition += 10;
            }
          }
        }
        
        // Add signature on a new page for better layout
        pdfDoc.addPage();
        yPosition = margin;
        
        pdfDoc.setFontSize(14);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('FIRMA Y FECHA', pageWidth / 2, yPosition, { align: 'center' });
        
        yPosition += 20;
        
        if (this.signatureData) {
          try {
            // Add signature with consistent dimensions
            pdfDoc.addImage(this.signatureData, 'JPEG', margin, yPosition, pageWidth - (2 * margin), 40);
            yPosition += 50;
            
            // Add signature metadata
            pdfDoc.setFontSize(10);
            pdfDoc.setFont('helvetica', 'normal');
            pdfDoc.text(`Firmado por: ${this.currentUser?.Nombre || 'Trabajador'}`, margin, yPosition);
            yPosition += 8;
            pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, margin, yPosition);
          } catch (error) {
            console.error('Error al agregar firma:', error);
            pdfDoc.text('Error al incluir la firma digital. Firma manuscrita autorizada.', margin, yPosition);
            yPosition += 10;
            pdfDoc.text(`Firmado por: ${this.currentUser?.Nombre || 'Trabajador'}`, margin, yPosition);
            yPosition += 8;
            pdfDoc.text(`Fecha: ${new Date().toLocaleDateString()}`, margin, yPosition);
          }
        }
        
        // Generate PDF for preview - use the same format for both preview and download
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
    
    // 3. Update the downloadPDF method to use the same template as generatePdf
    // Replace the current downloadPDF method with:
    
    async downloadPDF(reporte: Reporte): Promise<void> {
      try {
        this.isLoading = true;
        this.showSuccess('Preparando PDF para descarga...');
        
        // If we already have a generated PDF, use it directly
        if (!this.pdfSrc) {
          await this.generatePdf(reporte);
        }
        
        // Use the already generated PDF and save it
        const filename = `Reporte_${reporte.Tipo_Trabajo.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`;
        
        // Extract the PDF from the data URI
        if (this.pdfSrc) {
          const pdfData = this.pdfSrc.split(',')[1];
          const byteCharacters = atob(pdfData);
          const byteArrays = [];
          
          for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
            const slice = byteCharacters.slice(offset, offset + 1024);
            const byteNumbers = new Array(slice.length);
            
            for (let i = 0; i < slice.length; i++) {
              byteNumbers[i] = slice.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
          }
          
          const blob = new Blob(byteArrays, { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          // Create a download link and trigger it
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          
          // Clean up
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 100);
          
          this.showSuccess('PDF descargado correctamente');
        } else {
          throw new Error('No hay PDF generado para descargar');
        }
        
        this.isLoading = false;
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
      try {
        if (this.signaturePad) {
          return this.signaturePad.isEmpty();
        }
      } catch (error) {
        console.error('Error al verificar si la firma está vacía:', error);
      }
      
      // Si no hay nada o hay un error, consideramos que está vacía
      return true;
    }
  
    public resetSignatureComponent(): void {
      // 1. Limpiar datos de firma
      this.signatureData = null;
      
      // 2. Limpiar el canvas
      if (this.signatureCanvas && this.signatureCanvas.nativeElement) {
        const canvas = this.signatureCanvas.nativeElement;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      
      // 3. Reinicializar el componente de firma
      setTimeout(() => {
        this.initSignaturePad();
        if (this.signaturePad) {
          this.signaturePad.clear();
        }
      }, 100);
    }
    
    // 5. Asegurar que ngAfterViewInit inicialice correctamente el componente
  
    
    // 6. Agregar un verificador para asegurar que signaturePad esté disponible
    @HostListener('window:load', ['$event'])
  onWindowLoad(event: any) {
    // Verificar si el pad de firmas se ha inicializado correctamente
    if (!this.signaturePad && this.signatureCanvas?.nativeElement) {
      console.log('Inicializando signaturePad después de carga completa de la ventana');
      this.initSignaturePad();
    }
  }
  
}

