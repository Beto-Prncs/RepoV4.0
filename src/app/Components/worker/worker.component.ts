import { Component, ElementRef, OnInit, ViewChild, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Auth, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL } from '@angular/fire/storage';
import { Usuario } from '../../models/interfaces';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-worker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './worker.component.html',
  styleUrl: './worker.component.scss'
})
export class WorkerComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private storage: Storage = inject(Storage);
  private router: Router = inject(Router);
  
  usuario: Usuario | null = null;
  currentRoute = '';
  isMobile = false;

  // Configuración de menús y funcionalidades
  menuItems = [
    {
      title: 'Inicio',
      icon: 'home.png',
      route: '/worker',
      description: 'Página principal'
    },
    {
      title: 'Reportes Pendientes',
      icon: 'pending.png',
      route: '/worker-pendingtask',
      description: 'Ver reportes pendientes'
    },
    {
      title: 'Trabajos Completados',
      icon: 'completed.png',
      route: '/worker-completetask',
      description: 'Ver trabajos completados'
    },
    {
      title: 'Estadísticas',
      icon: 'stats.png',
      route: '/worker-statistics',
      description: 'Ver estadísticas'
    },
    {
      title: 'Configuración',
      icon: 'tools.png',
      route: '/configuration',
      description: 'Ajustes del sistema'
    }
  ];

  constructor() {
    // Detectar dispositivo móvil
    this.isMobile = this.detectMobile();
    
    // Suscribirse a los cambios de ruta
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentRoute = event.urlAfterRedirects;
    });
  }

  ngOnInit(): void {
    console.log('Inicializando componente worker');
    this.loadUserData();
    this.currentRoute = this.router.url;
    
    // Configurar el sidebar según el tamaño de pantalla
    this.setupSidebar();
  }

  // Detectar si es un dispositivo móvil
  private detectMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Verificar si una ruta está activa
  isActiveRoute(route: string): boolean {
    return this.currentRoute === route;
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.setupSidebar();
  }

  // Configurar el sidebar según el tamaño de la pantalla
  private setupSidebar(): void {
    if (window.innerWidth < 992) {
      // En dispositivos móviles, ocultar el sidebar inicialmente
      this.closeSidebar();
    } else {
      // En desktop, mostrar el sidebar
      this.showSidebar();
    }
  }

  // Mostrar el sidebar (usado para desktop)
  private showSidebar(): void {
    const sidebar = document.getElementById('mySidebar');
    
    if (sidebar) {
      sidebar.style.display = 'block';
      sidebar.style.transform = 'none';
    }
  }

  // Abrir el sidebar (para móvil)
  openSidebar(): void {
    console.log('Abriendo sidebar');
    const sidebar = document.getElementById('mySidebar');
    const overlay = document.getElementById('myOverlay');
    
    if (sidebar && overlay) {
      // Estilos para el sidebar
      sidebar.style.display = 'block';
      sidebar.style.transform = 'none';
      sidebar.style.zIndex = '1001';
      
      // Mostrar el overlay
      overlay.style.display = 'block';
      
      // Evitar scroll del body
      document.body.style.overflow = 'hidden';
    }
  }

  // Cerrar el sidebar (para móvil)
  closeSidebar(): void {
    console.log('Cerrando sidebar');
    const sidebar = document.getElementById('mySidebar');
    const overlay = document.getElementById('myOverlay');
    
    if (sidebar && overlay) {
      if (window.innerWidth < 992) {
        // Solo ocultar en móviles
        sidebar.style.display = 'none';
        overlay.style.display = 'none';
      }
      
      // Restaurar scroll del body
      document.body.style.overflow = '';
    }
  }

  // Cargar datos del usuario
  async loadUserData(): Promise<void> {
    try {
      const user = this.auth.currentUser;
      
      if (user) {
        const userDoc = await getDoc(doc(this.firestore, 'Usuario', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          this.usuario = {
            ...userData as Usuario,
            IdUsuario: user.uid
          };
          console.log('Usuario cargado:', this.usuario);
        } else {
          console.log('No se encontró el documento del usuario');
          this.router.navigate(['/login']);
        }
      } else {
        console.log('No hay usuario autenticado');
        this.router.navigate(['/login']);
      }
    } catch (error) {
      console.error('Error al cargar datos del usuario:', error);
    }
  }

  // Navegar a diferentes rutas
  navigateTo(route: string): void {
    console.log('Navegando a:', route);
    // En móvil, cerrar el sidebar al navegar
    if (window.innerWidth < 992) {
      this.closeSidebar();
    }
    
    this.router.navigate([route]);
  }

  // Cerrar sesión
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }

  // Abrir selector de archivo para foto de perfil
  openPhotoSelector(): void {
    this.fileInput.nativeElement.click();
  }

  // Manejar selección de foto
  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    
    if (input.files && input.files.length > 0 && this.usuario?.IdUsuario) {
      const file = input.files[0];
      const storageRef = ref(this.storage, `profiles/${this.usuario.IdUsuario}/profile.jpg`);
      
      try {
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        uploadTask.on('state_changed',
          (snapshot) => {
            // Progreso
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log(`Upload progress: ${progress}%`);
          },
          (error) => {
            // Error
            console.error('Error al subir la imagen:', error);
          },
          async () => {
            // Completado
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Actualizar URL en Firestore
              await this.updateUserPhotoURL(downloadURL);
              
              // Actualizar UI
              this.usuario = {
                ...this.usuario!,
                Foto_Perfil: downloadURL
              };
            } catch (error) {
              console.error('Error al obtener URL:', error);
            }
          }
        );
      } catch (error) {
        console.error('Error al subir la imagen:', error);
      }
    }
  }

  // Actualizar URL de foto en Firestore
  private async updateUserPhotoURL(photoURL: string): Promise<void> {
    if (this.usuario?.IdUsuario) {
      try {
        const userRef = doc(this.firestore, 'Usuario', this.usuario.IdUsuario);
        await updateDoc(userRef, {
          Foto_Perfil: photoURL
        });
      } catch (error) {
        console.error('Error al actualizar foto de perfil:', error);
      }
    }
  }
}