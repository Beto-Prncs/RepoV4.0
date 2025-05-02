import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../environments/environments';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryImageService {
  private readonly cloudName: string = environment.cloudinary.cloudName;
  private readonly uploadPreset: string = environment.cloudinary.uploadPreset;
  private readonly uploadUrl: string = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;

  private http = inject(HttpClient);
  private firestore = inject(Firestore);

  /**
   * Sube una imagen a Cloudinary y actualiza el perfil del usuario
   */
  uploadProfileImage(file: File, userId: string, collectionName: string = 'Usuario'): Observable<string> {
    // Validaciones básicas
    if (!file || !file.type.includes('image')) {
      return throwError(() => new Error('El archivo debe ser una imagen'));
    }
    if (!userId) {
      return throwError(() => new Error('ID de usuario no disponible'));
    }

    // Preparar FormData para la subida a Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('public_id', `user_${userId}_${Date.now()}`); // ID único
    
    // Subir a Cloudinary
    return this.http.post<any>(this.uploadUrl, formData).pipe(
      switchMap(response => {
        const imageUrl = response.secure_url;
        
        // Actualizar Firestore con la nueva URL
        const userRef = doc(this.firestore, collectionName, userId);
        return from(updateDoc(userRef, {
          Foto_Perfil: imageUrl
        })).pipe(
          map(() => imageUrl) // Devolver la URL de la imagen
        );
      }),
      catchError(error => {
        console.error('Error al subir imagen:', error);
        return throwError(() => new Error('Error al subir imagen: ' + (error.message || 'Intente nuevamente')));
      })
    );
  }

  /**
   * Optimiza y comprime una imagen antes de subirla
   */
  async optimizeImage(file: File, maxWidth: number = 500): Promise<File> {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            // Determinar nuevas dimensiones manteniendo el aspect ratio
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
            
            // Crear canvas para redimensionar
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            // Dibujar imagen redimensionada
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('No se pudo obtener el contexto 2D del canvas'));
              return;
            }
            
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convertir a Blob
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('Error al generar blob'));
                return;
              }
              
              // Crear nuevo archivo con el mismo nombre pero comprimido
              const optimizedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              
              resolve(optimizedFile);
            }, 'image/jpeg', 0.85); // Calidad 85%
          };
          
          img.onerror = () => {
            reject(new Error('Error al cargar la imagen para optimización'));
          };
          
          img.src = event.target?.result as string;
        };
        
        reader.onerror = () => {
          reject(new Error('Error al leer el archivo para optimización'));
        };
        
        reader.readAsDataURL(file);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Actualiza la imagen de perfil, primero optimizándola
   */
  async updateProfileImage(file: File, userId: string): Promise<Observable<string>> {
    try {
      // Optimizar la imagen antes de subirla
      const optimizedFile = await this.optimizeImage(file);
      // Subir la imagen optimizada
      return this.uploadProfileImage(optimizedFile, userId);
    } catch (error) {
      return throwError(() => error);
    }
  }
}