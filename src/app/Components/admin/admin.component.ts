import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  DocumentData,
  QuerySnapshot,
  doc,
  updateDoc
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Usuario } from '../../models/interfaces';
import { AuthService } from '../../services/auth.service';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';
import { CloudinaryImageService } from '../../services/cloudinary-image.service';
import { SimpleModalService } from '../../services/simple-modal.service';

interface MenuItem {
  title: string;
  icon: string;
  route: string;
  description: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterModule, ClickOutsideDirective],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit, OnDestroy {
  usuario: Usuario | null = null;
  isLoading: boolean = true;
  isProfileMenuOpen: boolean = false;
  isUploading: boolean = false;
  uploadProgress: number = 0;
  window: any = window; // Para acceder a window en la plantilla

  // Inyección de dependencias
  private router = inject(Router);
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private cloudinaryImageService = inject(CloudinaryImageService);
  private modalService = inject(SimpleModalService);

  @ViewChild('fileInput') fileInput!: ElementRef;
  private userSubscription: Subscription | null = null;

  menuItems: MenuItem[] = [
    {
      title: 'Crear cuenta',
      icon: 'persona.png',
      route: '/UserCreate',
      description: 'Gestión de usuarios y permisos'
    },
    {
      title: 'Configuración',
      icon: 'tools.png',
      route: '/configuration',
      description: 'Ajustes del sistema'
    },
    {
      title: 'Reportes',
      icon: 'report.png',
      route: '/reportsInterface',
      description: 'Gestión de reportes de trabajo'
    },
    {
      title: 'Estadísticas',
      icon: 'estadistica.png',
      route: '/statistics',
      description: 'Análisis y métricas'
    }
  ];

  ngOnInit() {
    this.initializeUserData();
  }

  // Método para manejar cambios de tamaño de ventana
  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    // Actualizar posición del menú si está abierto
    if (this.isProfileMenuOpen) {
      this.updateDropdownPosition();
    }
  }

  // Método para cerrar el menú (usado por la directiva clickOutside)
  closeProfileMenu() {
    this.isProfileMenuOpen = false;
  }

  // Método para abrir/cerrar el menú de perfil
  toggleProfileMenu(event?: MouseEvent) {
    if (event) {
      event.stopPropagation(); // Evitar que el clic se propague
    }
    
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    
    // Si el menú se abre, necesitamos posicionarlo correctamente
    if (this.isProfileMenuOpen) {
      setTimeout(() => this.updateDropdownPosition(), 0);
    }
  }

  // Método para actualizar la posición del menú desplegable
  private updateDropdownPosition() {
    const dropdownMenu = document.querySelector('.dropdown-menu') as HTMLElement;
    const toggleButton = document.querySelector('.toggle-button') as HTMLElement;
    
    if (dropdownMenu && toggleButton) {
      const buttonRect = toggleButton.getBoundingClientRect();
      const menuWidth = dropdownMenu.offsetWidth;
      const windowWidth = window.innerWidth;
      
      // Calcular posición considerando el espacio disponible
      let leftPosition = 0;
      
      if (windowWidth < 640) {
        // Para móviles, centrar el menú
        leftPosition = (windowWidth - menuWidth) / 2;
      } else {
        // Para escritorio, alinear con el botón
        leftPosition = Math.min(
          buttonRect.right - menuWidth,
          windowWidth - menuWidth - 10
        );
        leftPosition = Math.max(10, leftPosition); // No permitir que se salga por la izquierda
      }
      
      // Establecer posición
      dropdownMenu.style.position = 'fixed';
      dropdownMenu.style.top = (buttonRect.bottom + 10) + 'px';
      dropdownMenu.style.left = leftPosition + 'px';
      dropdownMenu.style.maxHeight = '450px';
      dropdownMenu.style.overflowY = 'auto';
    }
  }

  // Método para abrir el selector de archivos
  openPhotoSelector() {
    this.fileInput.nativeElement.click();
  }

  // Método para manejar la selección de una nueva foto
  async onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    try {
      this.isUploading = true;
      const file = input.files[0];
      
      // Validar que sea una imagen
      if (!file.type.includes('image')) {
        this.showToast('Por favor seleccione un archivo de imagen válido.', 'error');
        return;
      }
      
      if (!this.usuario?.IdUsuario) {
        throw new Error('ID de usuario no disponible');
      }
      
      // Comprobar tamaño de archivo
      if (file.size > 3 * 1024 * 1024) { // 3MB
        this.modalService.confirm(
          'Imagen grande detectada',
          'La imagen seleccionada es grande. ¿Desea optimizarla para mejorar el rendimiento?',
          // Callback al aceptar
          () => {
            // Con optimización
            this.processAndUploadImage(file, input, true);
          },
          // Callback al cancelar
          () => {
            // Sin optimización
            this.processAndUploadImage(file, input, false);
          }
        );
      } else {
        // Procesar directamente si es menor de 3MB
        this.processAndUploadImage(file, input, true);
      }
    } catch (error: any) {
      console.error('Error inicial:', error);
      this.showToast('Error al procesar imagen: ' + (error.message || 'Intente nuevamente'), 'error');
      this.isUploading = false;
    }
  }

  // Método para procesar y subir imagen
  private async processAndUploadImage(file: File, input: HTMLInputElement, optimize: boolean) {
    this.showToast('Subiendo imagen...', 'info');
    
    try {
      if (optimize) {
        // Con optimización - Esperamos a que la promesa se resuelva y obtener el Observable
        const uploadObservable = await this.cloudinaryImageService.updateProfileImage(file, this.usuario!.IdUsuario);
        
        // Ahora podemos usar pipe() porque estamos trabajando con el Observable
        uploadObservable.pipe(
          finalize(() => {
            this.isUploading = false;
            input.value = '';
          })
        ).subscribe({
          next: (imageUrl) => this.handleUploadSuccess(imageUrl),
          error: (error) => this.handleUploadError(error)
        });
      } else {
        // Sin optimización - Este método devuelve un Observable directamente, no hay problema
        this.cloudinaryImageService.uploadProfileImage(file, this.usuario!.IdUsuario)
          .pipe(
            finalize(() => {
              this.isUploading = false;
              input.value = '';
            })
          )
          .subscribe({
            next: (imageUrl) => this.handleUploadSuccess(imageUrl),
            error: (error) => this.handleUploadError(error)
          });
      }
    } catch (error) {
      console.error('Error en el procesamiento de la imagen:', error);
      this.showToast('Error al procesar la imagen', 'error');
      this.isUploading = false;
    }
  }

  // Métodos auxiliares para mantener el código limpio
  private handleUploadSuccess(imageUrl: string) {
    if (this.usuario) {
      this.usuario = {
        ...this.usuario,
        Foto_Perfil: imageUrl
      };
    }
    this.showToast('Foto de perfil actualizada correctamente', 'success');
  }

  private handleUploadError(error: any) {
    console.error('Error al actualizar foto de perfil:', error);
    this.showToast('Error al actualizar la foto: ' + (error.message || 'Intente nuevamente'), 'error');
  }

  private async initializeUserData() {
    try {
      // Reiniciar estado de carga
      this.isLoading = true;
      this.usuario = null;
      
      // Obtener el usuario autenticado
      const currentUser = this.auth.currentUser;
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }
      
      // Verificar que el correo exista
      const userEmail = currentUser.email;
      if (!userEmail) {
        throw new Error('Correo de usuario no disponible');
      }
      
      // Consultar la colección de Usuarios
      const usuariosRef = collection(this.firestore, 'Usuario');
      const q = query(usuariosRef, where('Correo', '==', userEmail));
      
      // Ejecutar consulta
      const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(q);
      if (!querySnapshot.empty) {
        // Obtener el primer documento (debería ser único por correo)
        const usuarioDoc = querySnapshot.docs[0];
        const usuarioData = usuarioDoc.data() as Usuario;
        
        // Asignar datos de usuario
        this.usuario = {
          ...usuarioData,
          // Asegurar que todos los campos estén definidos
          Correo: usuarioData.Correo || '',
          Departamento: usuarioData.Departamento || '',
          Foto_Perfil: usuarioData.Foto_Perfil || '',
          IdUsuario: usuarioDoc.id, // Asegurar que se use el ID del documento
          NivelAdmin: usuarioData.NivelAdmin || '',
          Nombre: usuarioData.Nombre || '',
          Rol: usuarioData.Rol || '',
          Telefono: usuarioData.Telefono || '',
          Username: usuarioData.Username || ''
        };
        
        // Verificar si la imagen de perfil está accesible
        if (this.usuario.Foto_Perfil) {
          this.preloadImage(this.usuario.Foto_Perfil).catch(() => {
            console.warn('No se pudo cargar la imagen de perfil, usando imagen por defecto');
            if (this.usuario) {
              this.usuario.Foto_Perfil = ''; // Usar la imagen por defecto
            }
          });
        }
      } else {
        console.warn('No se encontró usuario en la base de datos');
        this.showToast('No se encontró su información de usuario', 'warning');
      }
    } catch (error: any) {
      console.error('Error al obtener datos de usuario:', error);
      this.handleAuthError(error);
    } finally {
      // Finalizar estado de carga después de un breve retraso para mostrar el spinner
      setTimeout(() => {
        this.isLoading = false;
      }, 800);
    }
  }
  
  // Método para precargar imagen y verificar que esté accesible
  private preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
  }

  // Método para manejar errores de autenticación
  private handleAuthError(error: any) {
    // Limpiar datos de usuario
    this.usuario = null;
    // Redirigir al login o mostrar mensaje de error
    this.router.navigate(['/login']);
  }

  // Método de navegación
  navigateTo(route: string) {
    // Validar que la ruta exista
    if (route) {
      this.router.navigate([route]);
    }
    // Cerrar el menú desplegable si está abierto
    this.isProfileMenuOpen = false;
  }

  async logout(): Promise<void> {
    try {
      this.isLoading = true;
      await this.authService.signOut();
    } catch (error) {
      console.error('Logout error:', error);
      this.showToast('Error al cerrar sesión. Por favor inténtelo nuevamente.', 'error');
      // En caso de error, intentar redirección forzada como último recurso
      window.location.href = '/login?forceRefresh=true&t=' + Date.now();
    } finally {
      this.isLoading = false;
    }
  }

  // Sistema de notificaciones mejorado usando Tailwind
  private showToast(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
    // Obtener el elemento toast
    const toast = document.getElementById('notification-toast');
    if (!toast) return;
    
    // Limpiar cualquier clase o contenido anterior
    toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 py-3 px-5 rounded-xl text-white text-sm font-medium z-50 shadow-lg flex items-center gap-2.5 transform transition-all duration-300 w-11/12 max-w-md justify-center';
    
    // Aplicar estilos según el tipo
    let icon = '';
    
    if (type === 'success') {
      toast.classList.add('bg-gradient-to-r', 'from-green-600', 'to-green-500');
      icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>';
    } else if (type === 'error') {
      toast.classList.add('bg-gradient-to-r', 'from-red-600', 'to-red-500');
      icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>';
    } else if (type === 'info') {
      toast.classList.add('bg-gradient-to-r', 'from-blue-600', 'to-blue-500');
      icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>';
    } else if (type === 'warning') {
      toast.classList.add('bg-gradient-to-r', 'from-yellow-600', 'to-yellow-500');
      icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>';
    }
    
    toast.innerHTML = icon + message;
    
    // Mostrar el toast con animación
    toast.classList.remove('hidden');
    
    // Ocultar después de 4 segundos
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-6');
      setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove('opacity-0', 'translate-y-6');
      }, 300);
    }, 4000);
  }

  ngOnDestroy() {
    // Limpiar cualquier suscripción pendiente
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}