import { Component, OnInit, OnDestroy } from '@angular/core';
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
  QuerySnapshot
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { Usuario } from '../../models/interfaces';
interface MenuItem {
  title: string;
  icon: string;
  route: string;
  description: string;
}
@Component({
  selector: 'app-admin',
  imports: [CommonModule, RouterModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit, OnDestroy {
  usuario: Usuario | null = null;
  isLoading: boolean = true;
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
    private firestore: Firestore
  ) {}

  ngOnInit() {
    this.initializeUserData();
  }

  ngOnDestroy() {
    // Limpiar cualquier suscripción pendiente
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
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
  }

  // Método de logout
  async logout() {
    try {
      // Cerrar sesión
      await this.auth.signOut();
      
      // Limpiar datos locales
      localStorage.clear();
      
      // Redirigir al login
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      
      // Manejar posibles errores de logout
      this.handleAuthError(error);
    }
  }
}