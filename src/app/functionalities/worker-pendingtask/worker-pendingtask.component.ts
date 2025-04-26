import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CameraComponent } from '../../camera/camera.component';
import { Firestore, collection, doc, updateDoc, getDocs, query, where } from '@angular/fire/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

@Component({
  selector: 'app-worker-pending-task',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CameraComponent],
  templateUrl: './worker-pendingtask.component.html',
  styleUrl: './worker-pendingtask.component.scss'
})
export class WorkerPendingTaskComponent implements OnInit {
  // Referencia al componente de cámara
  @ViewChild(CameraComponent) cameraComponent!: CameraComponent;
  
  // Propiedades para la tarea y el formulario
  pendingTasks: any[] = [];
  selectedTask: any = null;
  isLoading: boolean = false;
  reportForm!: FormGroup;
  errorMessage: string = '';
  successMessage: string = '';
  
  // Estado para los modales
  showCameraModal: boolean = false;
  showPreviewModal: boolean = false;
  evidenceImages: string[] = [];

  constructor(
    private router: Router,
    private firestore: Firestore,
    private formBuilder: FormBuilder
  ) {}

  ngOnInit() {
    this.loadPendingTasks();
    this.initForm();
  }

  // Inicializar formulario
  initForm() {
    this.reportForm = this.formBuilder.group({
      notes: ['', Validators.required],
      status: ['completed', Validators.required]
    });
  }

  // Cargar tareas pendientes
  async loadPendingTasks() {
    try {
      this.isLoading = true;
      const tasksRef = collection(this.firestore, 'Tasks');
      const q = query(tasksRef, where('status', '==', 'pending'));
      const querySnapshot = await getDocs(q);
      
      this.pendingTasks = [];
      querySnapshot.forEach((doc) => {
        this.pendingTasks.push({
          id: doc.id,
          ...doc.data()
        });
      });
    } catch (error) {
      console.error('Error al cargar tareas pendientes:', error);
      this.errorMessage = 'Error al cargar las tareas pendientes. Intente nuevamente.';
    } finally {
      this.isLoading = false;
    }
  }

  // Seleccionar una tarea
  selectTask(task: any) {
    this.selectedTask = task;
    // Opcional: actualizar campos del formulario basados en la tarea seleccionada
    this.reportForm.patchValue({
      status: 'completed' // Por defecto, establecemos el estado como completado
    });
  }

  // Métodos para el modal de cámara
  openCameraModal() {
    this.showCameraModal = true;
  }

  closeCameraModal() {
    this.showCameraModal = false;
  }

  // Guardar imágenes del componente de cámara
  saveEvidenceImages() {
    if (this.cameraComponent && this.cameraComponent.imageGallery.length > 0) {
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

  // Métodos para el modal de vista previa
  previewReport() {
    if (this.reportForm.valid && this.selectedTask) {
      this.showPreviewModal = true;
    } else {
      this.errorMessage = 'Por favor completa todos los campos requeridos';
      setTimeout(() => this.errorMessage = '', 3000);
    }
  }

  closePreviewModal() {
    this.showPreviewModal = false;
  }

  // Método para enviar el reporte
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
      this.closePreviewModal(); // Cerrar el modal de vista previa si está abierto
      
      // Subir imágenes a Firebase Storage
      const uploadedImageUrls: string[] = [];
      
      if (this.evidenceImages.length > 0) {
        const storage = getStorage();
        
        for (const imageDataUrl of this.evidenceImages) {
          // Convertir Data URL a Blob
          const response = await fetch(imageDataUrl);
          const blob = await response.blob();
          
          // Crear referencia única para la imagen
          const imagePath = `task_evidence/${this.selectedTask.id}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          const storageRef = ref(storage, imagePath);
          
          // Subir la imagen
          await uploadBytes(storageRef, blob);
          
          // Obtener URL de descarga
          const downloadURL = await getDownloadURL(storageRef);
          uploadedImageUrls.push(downloadURL);
        }
      }
      
      // Actualizar la tarea en Firestore
      const taskDocRef = doc(this.firestore, 'Tasks', this.selectedTask.id);
      await updateDoc(taskDocRef, {
        status: this.reportForm.value.status,
        completionNotes: this.reportForm.value.notes,
        evidenceImages: uploadedImageUrls,
        completedAt: new Date()
      });
      
      // Mostrar mensaje de éxito
      this.successMessage = 'Tarea completada exitosamente';
      
      // Resetear el formulario y la selección
      setTimeout(() => {
        this.selectedTask = null;
        this.evidenceImages = [];
        this.reportForm.reset();
        this.loadPendingTasks(); // Recargar tareas pendientes
        this.successMessage = '';
        this.router.navigate(['/worker-completetask']); // Opcional: redireccionar
      }, 2000);
      
    } catch (error) {
      console.error('Error al enviar reporte:', error);
      this.errorMessage = 'Error al enviar el reporte. Por favor intenta nuevamente.';
      setTimeout(() => this.errorMessage = '', 5000);
    } finally {
      this.isLoading = false;
    }
  }

  // Volver a la página principal
  goBack() {
    this.router.navigate(['/worker']);
  }
}