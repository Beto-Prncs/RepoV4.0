import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService } from './services/camera.service';
@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './camera.component.html',
  styleUrl: './camera.component.css'
})
export class CameraComponent {
  cameraService = inject(CameraService);
  imgUrl: string = '';
  errorMessage: string = '';
  loading: boolean = false;
  
  // Galería de imágenes
  imageGallery: string[] = [];
  selectedImage: string | null = null;

  async takePicture() {
    this.errorMessage = ''; 
    try {
      this.loading = true;
      this.imgUrl = await this.cameraService.takePicture();
      if (!this.imgUrl) {
        throw new Error('No se obtuvo una imagen válida');
      }

      // Añadir la imagen a la galería
      this.imageGallery.unshift(this.imgUrl);
      
      this.loading = false;
    } catch (error) {
      console.error('Error al capturar imagen:', error);
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.loading = false;
    }
  }

  async loadFromGallery() {
    this.errorMessage = '';
    try {
      this.loading = true;
      const images = await this.cameraService.getPhotosFromGallery(5);
      
      if (images && images.length > 0) {
        // Añadimos las imágenes al principio de la galería
        this.imageGallery = [...images, ...this.imageGallery];
        
        // Seleccionamos la primera imagen cargada
        if (images.length > 0) {
          this.selectImage(images[0]);
        }
      }
      
      this.loading = false;
    } catch (error) {
      console.error('Error al cargar imágenes:', error);
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.loading = false;
    }
  }

  selectImage(image: string) {
    this.selectedImage = image;
  }

  deleteImage(index: number) {
    // Primero verificamos si la imagen a borrar es la seleccionada
    if (this.selectedImage === this.imageGallery[index]) {
      this.selectedImage = null;
    }
    
    // Luego eliminamos la imagen de la galería
    this.imageGallery.splice(index, 1);
  }

  clearGallery() {
    this.imageGallery = [];
    this.selectedImage = null;
    this.imgUrl = '';
  }
}