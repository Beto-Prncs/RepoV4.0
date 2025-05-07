import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../environments/environments';
import { Firestore, doc, updateDoc, arrayUnion } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryImageService {
  private readonly cloudName: string = environment.cloudinary.cloudName;
  private readonly uploadPreset: string = environment.cloudinary.uploadPreset;
  private readonly uploadUrl: string = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
  
  // Para guardar URLs de Cloudinary en memoria caché
  private imageCache = new Map<string, string>();

  private http = inject(HttpClient);
  private firestore = inject(Firestore);

  /**
   * Sube una imagen a Cloudinary sin actualizar ningún documento en Firestore
   * @param file Archivo a subir
   * @param idPrefix Prefijo para el ID público
   * @param folder Carpeta en Cloudinary
   * @returns Observable con la URL segura de Cloudinary
   */
  uploadImage(file: File, idPrefix: string, folder: string = 'reportes'): Observable<string> {
    // Validaciones básicas
    if (!file || !file.type.includes('image')) {
      return throwError(() => new Error('El archivo debe ser una imagen'));
    }

    // Generar un ID único
    const uniqueId = `${idPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Preparar FormData para la subida a Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('public_id', uniqueId);
    formData.append('folder', folder);
    
    // Añadir etiquetas para mejor organización
    formData.append('tags', folder + ',' + idPrefix);
    
    // Opciones para mejorar la entrega de imágenes
    formData.append('quality', 'auto');
    formData.append('fetch_format', 'auto');
    
    // Subir a Cloudinary
    return this.http.post<any>(this.uploadUrl, formData).pipe(
      map(response => {
        const imageUrl = response.secure_url;
        
        // Guardar en caché para futuras referencias
        this.cacheImageUrl(uniqueId, imageUrl);
        
        return imageUrl;
      }),
      catchError(error => {
        console.error('Error al subir imagen a Cloudinary:', error);
        return throwError(() => new Error('Error al subir imagen: ' + (error.message || 'Intente nuevamente')));
      })
    );
  }

  /**
   * Sube una imagen a Cloudinary y actualiza el documento en Firestore
   * @param file Archivo a subir
   * @param docId ID del documento
   * @param collectionName Nombre de la colección
   * @param fieldName Campo a actualizar (por defecto 'Foto_Perfil')
   * @returns Observable con la URL de la imagen
   */
  uploadProfileImage(file: File, docId: string, collectionName: string = 'Usuario', fieldName: string = 'Foto_Perfil'): Observable<string> {
    // Validaciones básicas
    if (!file || !file.type.includes('image')) {
      return throwError(() => new Error('El archivo debe ser una imagen'));
    }
    if (!docId) {
      return throwError(() => new Error('ID de documento no disponible'));
    }

    // Preparar FormData para la subida a Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    
    // Organización de imágenes por carpetas y etiquetas
    const uniqueId = `${collectionName}_${docId}_${Date.now()}`;
    formData.append('public_id', uniqueId);
    formData.append('folder', collectionName);
    formData.append('tags', collectionName + ',' + docId);
    
    // Configuración de calidad
    formData.append('quality', 'auto');
    formData.append('fetch_format', 'auto');
    
    // Subir a Cloudinary
    return this.http.post<any>(this.uploadUrl, formData).pipe(
      switchMap(response => {
        const imageUrl = response.secure_url;
        
        // Guardar en caché
        this.cacheImageUrl(uniqueId, imageUrl);
        
        // Para reportes, podemos querer añadir la URL a un array en lugar de reemplazar un campo
        if (collectionName === 'Reportes' && fieldName === 'evidenceImages') {
          // Actualizar un array de imágenes
          const docRef = doc(this.firestore, collectionName, docId);
          return from(updateDoc(docRef, {
            [fieldName]: arrayUnion(imageUrl) // Añadir al array sin duplicados
          })).pipe(
            map(() => imageUrl)
          );
        } else {
          // Actualizar Firestore con la nueva URL
          const docRef = doc(this.firestore, collectionName, docId);
          return from(updateDoc(docRef, {
            [fieldName]: imageUrl // Actualizar el campo especificado
          })).pipe(
            map(() => imageUrl)
          );
        }
      }),
      catchError(error => {
        console.error('Error al subir imagen o actualizar documento:', error);
        return throwError(() => new Error('Error al procesar imagen: ' + (error.message || 'Intente nuevamente')));
      })
    );
  }

  /**
   * Sube múltiples imágenes a Cloudinary
   * @param files Array de archivos a subir
   * @param docId ID del documento
   * @param collectionName Nombre de la colección
   * @returns Observable con array de URLs
   */
  uploadMultipleImages(files: File[], docId: string, collectionName: string = 'Reportes'): Observable<string[]> {
    if (!files || files.length === 0) {
      return of([]);
    }

    // Filtrar solo imágenes
    const imageFiles = files.filter(file => file.type.includes('image'));
    
    if (imageFiles.length === 0) {
      return of([]);
    }

    // Crear un array de observables, uno por cada imagen
    const uploadObservables = imageFiles.map(file => 
      from(this.optimizeImage(file)).pipe(
        switchMap(optimizedFile => this.uploadImage(optimizedFile, `${collectionName}_${docId}`, collectionName))
      )
    );

    // Combinar todos los observables en uno solo que emita array de URLs
    return from(Promise.all(uploadObservables.map(obs => 
      obs.toPromise().catch(error => {
        console.error('Error en subida individual:', error);
        return null; // Devolver null para los que fallan
      })
    ))).pipe(
      map(results => results.filter(url => url !== null) as string[])
    );
  }

  /**
   * Optimiza y comprime una imagen antes de subirla
   * @param file Archivo de imagen a optimizar
   * @param maxWidth Ancho máximo (por defecto 1200px)
   * @returns Promise con el archivo optimizado
   */
  async optimizeImage(file: File, maxWidth: number = 1200): Promise<File> {
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
   * @param file Archivo de imagen
   * @param userId ID del usuario
   * @returns Observable con la URL de la imagen
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

  /**
   * Almacena la URL de una imagen en la caché local
   * @param id Identificador único de la imagen
   * @param url URL de Cloudinary
   */
  private cacheImageUrl(id: string, url: string): void {
    this.imageCache.set(id, url);
  }

  /**
   * Obtiene una URL de Cloudinary de la caché
   * @param id Identificador único de la imagen
   * @returns URL de Cloudinary o null si no existe
   */
  getCachedImageUrl(id: string): string | null {
    return this.imageCache.get(id) || null;
  }

  /**
   * Elimina una URL de la caché
   * @param id Identificador único de la imagen
   */
  removeCachedImage(id: string): void {
    this.imageCache.delete(id);
  }

  /**
   * Extrae el public_id de una URL de Cloudinary
   * @param cloudinaryUrl URL completa de Cloudinary
   * @returns public_id de la imagen
   */
  extractPublicId(cloudinaryUrl: string): string | null {
    // Ejemplo: https://res.cloudinary.com/CLOUD_NAME/image/upload/v1234567890/folder/image_id.jpg
    try {
      const urlParts = cloudinaryUrl.split('/');
      // Buscar la posición de 'upload' en la URL
      const uploadIndex = urlParts.findIndex(part => part === 'upload');
      
      if (uploadIndex === -1 || uploadIndex + 2 >= urlParts.length) {
        return null;
      }
      
      // Obtener todo después de 'upload/v12345/'
      const parts = urlParts.slice(uploadIndex + 2);
      
      // Eliminar la extensión del archivo
      let publicId = parts.join('/');
      const extensionIndex = publicId.lastIndexOf('.');
      
      if (extensionIndex !== -1) {
        publicId = publicId.substring(0, extensionIndex);
      }
      
      return publicId;
    } catch (error) {
      console.error('Error al extraer public_id:', error);
      return null;
    }
  }
}