import { Injectable } from '@angular/core';
import { Platform } from '@angular/cdk/platform';

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;

  constructor(private platform: Platform) {}

  async takePicture(): Promise<string> {
    try {
      // Si estamos en web, usamos la API de MediaDevices
      if (this.platform.isBrowser) {
        return await this.takePictureWeb();
      } else {
        // Si estuviéramos en móvil, aquí iría la implementación de Capacitor
        throw new Error('Esta aplicación solo está implementada para web por ahora');
      }
    } catch (error) {
      console.error('Error al capturar imagen:', error);
      throw error;
    }
  }

  private async takePictureWeb(): Promise<string> {
    try {
      // Verificamos permisos solicitando el stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });

      // Creamos un elemento de video para capturar la imagen
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Esperamos a que el video esté listo
      return new Promise<string>((resolve, reject) => {
        video.onloadedmetadata = () => {
          // Creamos un canvas para capturar la imagen
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          // Dibujamos el frame actual del video en el canvas
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('No se pudo crear el contexto del canvas'));
            return;
          }
          
          // Esperamos un momento para que el video se inicie completamente
          setTimeout(() => {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convertimos el canvas a una URL de datos
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            
            // Detenemos todas las pistas de video
            stream.getTracks().forEach(track => track.stop());
            
            resolve(imageDataUrl);
          }, 300);
        };
        
        video.onerror = () => {
          reject(new Error('Error al inicializar el video'));
        };
      });
    } catch (error) {
      console.error('Error al acceder a la cámara:', error);
      throw new Error('No se pudo acceder a la cámara. Asegúrate de conceder permisos.');
    }
  }

  // Método para cargar imágenes desde el sistema de archivos local
  async getPhotosFromGallery(limit: number = 10): Promise<string[]> {
    try {
      return new Promise<string[]>((resolve) => {
        // Creamos un input de tipo file para seleccionar imágenes
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        
        input.onchange = (event) => {
          const files = (event.target as HTMLInputElement).files;
          if (!files || files.length === 0) {
            resolve([]);
            return;
          }
          
          // Limitamos la cantidad de archivos a procesar
          const filesToProcess = Array.from(files).slice(0, limit);
          const imageUrls: string[] = [];
          
          let processed = 0;
          filesToProcess.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
              if (e.target?.result) {
                imageUrls.push(e.target.result as string);
              }
              
              processed++;
              if (processed === filesToProcess.length) {
                resolve(imageUrls);
              }
            };
            reader.readAsDataURL(file);
          });
        };
        
        // Simulamos un clic en el input para abrir el selector de archivos
        input.click();
      });
    } catch (error) {
      console.error('Error al obtener fotos:', error);
      throw new Error('No se pudieron cargar las imágenes');
    }
  }
}