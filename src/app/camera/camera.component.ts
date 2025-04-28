import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './camera.component.html',
  styleUrl: './camera.component.scss'
})
export class CameraComponent implements OnInit, AfterViewInit {
  // Referencia al elemento de vista previa de la cámara
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
  
  // Propiedades de la cámara
  stream: MediaStream | null = null;
  isInitialized = false;
  isCameraActive = false;
  isMobile = false;
  hasCameraPermission = false;
  cameraError = '';
  
  // Propiedades de la galería de imágenes
  imageGallery: string[] = [];
  selectedTab: 'camera' | 'gallery' = 'camera';
  
  constructor() {
    // Detectar si estamos en un dispositivo móvil
    this.isMobile = Capacitor.isNativePlatform() || 
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  ngOnInit() {
    console.log('Inicializando componente de cámara');
    console.log('¿Es dispositivo móvil?', this.isMobile);
  }

  ngAfterViewInit() {
    // Inicializar la cámara después de que la vista esté lista
    this.initializeCamera();
  }

  // Cambiar entre las pestañas de cámara y galería
  switchTab(tab: 'camera' | 'gallery') {
    this.selectedTab = tab;
    if (tab === 'camera' && !this.isCameraActive && this.isInitialized) {
      this.startCamera();
    }
  }

  // Inicializar la cámara
  async initializeCamera() {
    try {
      if (this.isMobile) {
        // En dispositivos móviles, verificamos los permisos de la cámara
        const permissionStatus = await Camera.checkPermissions();
        this.hasCameraPermission = permissionStatus.camera === 'granted';
        
        if (!this.hasCameraPermission) {
          const requestResult = await Camera.requestPermissions();
          this.hasCameraPermission = requestResult.camera === 'granted';
        }
        
        if (!this.hasCameraPermission) {
          this.cameraError = 'Se requieren permisos de cámara para esta función.';
          return;
        }
      } else {
        // En navegadores web, usamos la API MediaDevices
        await this.startCamera();
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Error al inicializar la cámara:', error);
      this.cameraError = 'No se pudo inicializar la cámara. Por favor, verifica los permisos.';
    }
  }

  // Iniciar la cámara web en navegadores
  async startCamera() {
    try {
      if (this.isMobile) {
        // En móviles no usamos el stream directamente, sino la API de Capacitor
        return;
      }
      
      // Para navegadores web, usamos la API MediaDevices
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Usar cámara trasera si está disponible
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      if (this.videoElement && this.videoElement.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
        this.isCameraActive = true;
      }
    } catch (error) {
      console.error('Error al iniciar la cámara:', error);
      this.cameraError = 'No se pudo acceder a la cámara. Por favor, verifica los permisos.';
    }
  }

  // Detener la cámara web
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.videoElement && this.videoElement.nativeElement) {
      this.videoElement.nativeElement.srcObject = null;
    }
    
    this.isCameraActive = false;
  }

  // Tomar una foto desde la cámara web o dispositivo móvil
  async takePhoto() {
    try {
      if (this.isMobile) {
        // En dispositivos móviles, usamos la API de Capacitor
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
          promptLabelHeader: 'Tomar foto',
          promptLabelCancel: 'Cancelar',
          promptLabelPhoto: 'Galería',
          promptLabelPicture: 'Cámara'
        });
        
        if (image.dataUrl) {
          this.imageGallery.push(image.dataUrl);
          
          // Proporcionar retroalimentación táctil
          if (Capacitor.isPluginAvailable('Haptics')) {
            Haptics.impact({ style: ImpactStyle.Medium }).catch(err => 
              console.log('Error de haptics:', err)
            );
          }
        }
      } else {
        // En navegadores web, capturamos la imagen del video
        if (this.videoElement && this.videoElement.nativeElement && this.canvasElement && this.canvasElement.nativeElement) {
          const video = this.videoElement.nativeElement;
          const canvas = this.canvasElement.nativeElement;
          
          // Establecer dimensiones del canvas iguales al video
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          // Dibujar el frame actual del video en el canvas
          const context = canvas.getContext('2d');
          if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convertir a data URL y guardar en la galería
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            this.imageGallery.push(dataUrl);
            
            // Cambiar a la pestaña de galería después de tomar la foto
            this.selectedTab = 'gallery';
          }
        }
      }
    } catch (error) {
      console.error('Error al tomar la foto:', error);
      
      // Si el usuario canceló, no mostramos error
      if (error instanceof Error && error.message.includes('cancelled')) {
        return;
      }
      
      this.cameraError = 'Error al capturar la imagen. Por favor, inténtalo de nuevo.';
      setTimeout(() => this.cameraError = '', 3000);
    }
  }

  // Seleccionar una foto de la galería del dispositivo
  async selectFromGallery() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });
      
      if (image.dataUrl) {
        this.imageGallery.push(image.dataUrl);
        this.selectedTab = 'gallery';
      }
    } catch (error) {
      console.error('Error al seleccionar la foto:', error);
      
      // Si el usuario canceló, no mostramos error
      if (error instanceof Error && error.message.includes('cancelled')) {
        return;
      }
      
      this.cameraError = 'Error al seleccionar la imagen. Por favor, inténtalo de nuevo.';
      setTimeout(() => this.cameraError = '', 3000);
    }
  }

  // Eliminar una foto de la galería
  removePhoto(index: number) {
    if (index >= 0 && index < this.imageGallery.length) {
      this.imageGallery.splice(index, 1);
      
      // Retroalimentación táctil al eliminar
      if (this.isMobile && Capacitor.isPluginAvailable('Haptics')) {
        Haptics.impact({ style: ImpactStyle.Light }).catch(err => 
          console.log('Error de haptics:', err)
        );
      }
    }
  }

  // Limpiar todas las fotos
  clearAllPhotos() {
    this.imageGallery = [];
  }

  // Método para verificar si la galería está vacía
  isGalleryEmpty(): boolean {
    return this.imageGallery.length === 0;
  }

  // Cleanup cuando el componente se destruye
  ngOnDestroy() {
    this.stopCamera();
  }
}