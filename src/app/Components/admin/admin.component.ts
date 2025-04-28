import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Subscription } from 'rxjs';
import { Usuario } from '../../models/interfaces';
import { AuthService } from '../../services/auth.service';
import { ClickOutsideDirective } from '../../directives/click-outside.directive'; // Ajusta la ruta según tu estructura

interface MenuItem {
  title: string;
  icon: string;
  route: string;
  description: string;
}
@Component({
  selector: 'app-admin',
  imports: [CommonModule, RouterModule, ClickOutsideDirective],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit, OnDestroy {

  usuario: Usuario | null = null;
  isLoading: boolean = true;
  isProfileMenuOpen: boolean = false;
  isUploading: boolean = false;
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
  
  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore,
    private authService: AuthService
  ) {}
  
  ngOnInit() {
    this.initializeUserData();
    // Ya no necesitamos el event listener manual ya que usaremos la directiva
    // document.addEventListener('click', this.closeMenuOnClickOutside.bind(this));
  }
  
  
  // Podemos eliminar este método ya que lo reemplazamos con la directiva
  /* 
  private closeMenuOnClickOutside(event: MouseEvent) {
    const profileMenu = document.querySelector('.user-profile-dropdown');
    if (this.isProfileMenuOpen && profileMenu && !profileMenu.contains(event.target as Node)) {
      this.isProfileMenuOpen = false;
    }
  }
  */
  
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
  }
  
  // Resto de métodos sin cambios...
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
        this.showErrorToast('Por favor seleccione un archivo de imagen válido.');
        return;
      }
      // Obtener referencia al storage
      const storage = getStorage();
      const currentUser = this.auth.currentUser;
      if (!currentUser || !currentUser.email || !this.usuario?.IdUsuario) {
        throw new Error('Usuario no autenticado o ID no disponible');
      }
      // Crear referencia para la imagen
      const storageRef = ref(storage, `profile_images/${this.usuario.IdUsuario}_${Date.now()}`);

      // Subir archivo
      await uploadBytes(storageRef, file);
      // Obtener URL de descarga
      const downloadURL = await getDownloadURL(storageRef);
      // Actualizar la URL en Firestore
      const userDocRef = doc(this.firestore, 'Usuario', this.usuario.IdUsuario);
      await updateDoc(userDocRef, {
        Foto_Perfil: downloadURL
      });
      // Actualizar la URL en el objeto local
      this.usuario = {
        ...this.usuario,
        Foto_Perfil: downloadURL
      };
      this.showSuccessToast('Foto de perfil actualizada correctamente');
    } catch (error) {
      console.error('Error al actualizar foto de perfil:', error);
      this.showErrorToast('Error al actualizar la foto de perfil');
    } finally {
      this.isUploading = false;
    }
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
        const usuarioDoc = querySnapshot.docs[0].data() as Usuario;

        // Asignar datos de usuario
        this.usuario = {
          ...usuarioDoc,
          // Asegurar que todos los campos estén definidos
          Correo: usuarioDoc.Correo || '',
          Departamento: usuarioDoc.Departamento || '',
          Foto_Perfil: usuarioDoc.Foto_Perfil || '',
          IdUsuario: usuarioDoc.IdUsuario || '',
          NivelAdmin: usuarioDoc.NivelAdmin || '',
          Nombre: usuarioDoc.Nombre || '',
          Rol: usuarioDoc.Rol || '',
          Telefono: usuarioDoc.Telefono || '',
          Username: usuarioDoc.Username || ''
        };
      } else {
        console.warn('No se encontró usuario en la base de datos');
      }
    } catch (error) {
      console.error('Error al obtener datos de usuario:', error);
      // Manejar el error, posiblemente redirigir al login
      this.handleAuthError(error);
    } finally {
      // Finalizar estado de carga
      this.isLoading = false;
    }
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
      // Usar el servicio de autenticación mejorado para un cierre de sesión completo
      await this.authService.signOut();
      // No necesitamos redireccionar aquí ya que el signOut() del servicio
      // ya maneja la redirección completa
    } catch (error) {
      console.error('Logout error:', error);
      // Implementar sistema de notificaciones visual
      this.showErrorToast('Error al cerrar sesión. Por favor inténtelo nuevamente.');
      // En caso de error, intentar redirección forzada como último recurso
      window.location.href = '/login?forceRefresh=true&t=' + Date.now();
    } finally {
      this.isLoading = false;
    }
  }
  
  private showErrorToast(message: string): void {
    console.error('Error:', message);
    // Aquí podrías implementar un sistema de notificaciones más avanzado
  }
  
  private showSuccessToast(message: string): void {
    console.log('Success:', message);
    // Aquí podrías implementar un sistema de notificaciones más avanzado
  }












  // Implementación de sistema de notificaciones visual
private notificationTimeoutId: any = null;
private notificationElement: HTMLElement | null = null;



private showToast(message: string, type: 'success' | 'error'): void {
  // Limpiar notificación existente
  this.clearNotification();
  
  // Crear elemento de notificación
  this.notificationElement = document.createElement('div');
  this.notificationElement.className = `notification-toast ${type}`;
  this.notificationElement.textContent = message;
  
  // Agregar estilos
  Object.assign(this.notificationElement.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    padding: '12px 20px',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '9999',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    opacity: '0',
    transition: 'opacity 0.3s ease'
  });
  
  // Establecer color según el tipo
  if (type === 'success') {
    this.notificationElement.style.backgroundColor = '#10b981'; // Verde
  } else {
    this.notificationElement.style.backgroundColor = '#ef4444'; // Rojo
  }
  
  // Agregar al DOM
  document.body.appendChild(this.notificationElement);
  
  // Mostrar con animación
  setTimeout(() => {
    if (this.notificationElement) {
      this.notificationElement.style.opacity = '1';
    }
  }, 50);
  
  // Establecer tiempo de expiración
  this.notificationTimeoutId = setTimeout(() => {
    this.clearNotification();
  }, 4000);
}

private clearNotification(): void {
  // Limpiar timeout
  if (this.notificationTimeoutId) {
    clearTimeout(this.notificationTimeoutId);
    this.notificationTimeoutId = null;
  }
  
  // Remover elemento del DOM si existe
  if (this.notificationElement) {
    this.notificationElement.style.opacity = '0'; // Animación de salida
    
    setTimeout(() => {
      if (this.notificationElement && this.notificationElement.parentNode) {
        this.notificationElement.parentNode.removeChild(this.notificationElement);
      }
      this.notificationElement = null;
    }, 300); // Tiempo para la animación
  }
}

// Limpiar notificación en ngOnDestroy
ngOnDestroy() {
  // Limpiar cualquier suscripción pendiente
  if (this.userSubscription) {
    this.userSubscription.unsubscribe();
  }
  
  // Limpiar notificación si existe
  this.clearNotification();
}
}