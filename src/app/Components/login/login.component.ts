import { Component, OnInit, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  Auth,
  User,
  signInWithEmailAndPassword,
} from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
import { Usuario } from '../../models/interfaces';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})

export class LoginComponent implements OnInit {
  showPassword = false;
  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private ngZone: NgZone,
    private authService: AuthService
  ) {}

  usuario = {
    identifier: '', // Ahora acepta email o username
    password: ''
  };

  showError = false;
  errorMessage = 'Usuario o contraseña incorrectos';
  isLoading = false;

  onInputChange(): void {
    this.showError = false;
  }

  async Ingresa(): Promise<void> {
    // Validar campos
    if (!this.usuario.identifier || !this.usuario.password) {
      this.showAuthError('Por favor, complete todos los campos');
      return;
    }
  
    // Validar formato de email
    if (!this.isValidEmail(this.usuario.identifier)) {
      this.showAuthError('Por favor, ingrese un correo electrónico válido');
      return;
    }
  
    this.isLoading = true;
    try {
      const userEmail = this.usuario.identifier;
  
      // Buscar el usuario en Firestore para verificar la contraseña
      try {
        console.log('Buscando usuario por email:', userEmail); 
        const usersRef = collection(this.firestore, 'Usuario'); 
        const q = query(usersRef, where('Correo', '==', userEmail)); 
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          console.log('Usuario no encontrado por email en Firestore');
          // No mostramos error aquí, continuamos con la autenticación de Firebase
        } else {
          const userData = querySnapshot.docs[0].data(); 
          const userId = querySnapshot.docs[0].id;
          
          // Verificar si la contraseña en Firestore coincide
          if (userData['Password'] !== this.usuario.password) {
            console.log('La contraseña en Firestore no coincide con la ingresada'); 
            this.showAuthError('Contraseña incorrecta');
            this.isLoading = false;
            return;
          }
        }
      } catch (error) {
        console.error('Error buscando usuario por email:', error);
        // No mostramos error aquí, continuamos con la autenticación de Firebase
      }
  
      // Intentar iniciar sesión con Firebase Auth
      try {
        console.log('Intentando login con Firebase Auth para email:', userEmail); 
        const userCredential = await signInWithEmailAndPassword(
          this.auth, 
          userEmail,
          this.usuario.password
        );
        
        // Si llegamos aquí, el login con Firebase Auth fue exitoso 
        console.log('Login con Firebase Auth exitoso');
        // Procesamos el login exitoso
        await this.processUserLogin(userCredential.user);
      } catch (authError: any) {
        console.error('Error en autenticación con Firebase:', authError);
        // Manejar errores específicos de Firebase Auth 
        if (authError.code === 'auth/user-not-found') { 
          this.showAuthError('Usuario no encontrado');
        } else if (authError.code === 'auth/wrong-password') { 
          this.showAuthError('Contraseña incorrecta');
        } else if (authError.code === 'auth/invalid-credential') { 
          this.showAuthError('Credenciales inválidas');
        } else if (authError.code === 'auth/invalid-email') {
          this.showAuthError('Correo electrónico inválido');
        } else {
          this.showAuthError('Error de autenticación: ' + authError.message);
        }
        this.isLoading = false;
      }
    } catch (error: any) {
      console.error('Error general en login:', error); 
      this.showAuthError('Error al iniciar sesión'); 
      this.isLoading = false;
    }
  }

  // Nuevo método para validar si una cadena es un email
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Nuevo método para buscar usuario por username
  

  async signInWithGoogle(): Promise<void> {
    this.isLoading = true;
    try {
      // Usar el método del AuthService en lugar de llamar directamente
      const result = await this.authService.loginWithGoogle();
      if (result.user) {
        await this.processUserLogin(result.user);
      } else {
        this.showAuthError('No se pudo obtener la información del usuario');
      }
    } catch (error: any) {
      this.handleGoogleAuthError(error);
    } finally {
      this.isLoading = false;
    }
  }

  private async processUserLogin(user: User): Promise<void> {
    try {
      if (!user.email) {
        this.showAuthError('Correo electrónico no disponible');
        return;
      }
      // Verificar si el usuario existe en la base de datos usando el campo Correo
      const usuariosRef = collection(this.firestore, 'Usuario');
      const q = query(usuariosRef, where('Correo', '==', user.email));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnapshot = querySnapshot.docs[0];
        const userData = docSnapshot.data() as Usuario;
        // Crear o actualizar documento utilizando el UID de autenticación como ID del documento
        const userDocRef = doc(this.firestore, 'Usuario', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
          // Si no existe documento con el UID como ID, crear uno nuevo
          await setDoc(userDocRef, {
            ...userData,
            Correo: user.email,
            IdUsuario: user.uid
          });
          console.log('Documento de usuario creado con UID como ID:', user.uid);
        }
        // Almacenar información de usuario
        localStorage.setItem('userRole', userData.Rol);
        localStorage.setItem('userEmail', userData.Correo);
        localStorage.setItem('userUid', user.uid);
        if (userData.Username) {
          localStorage.setItem('username', userData.Username);
        }
        
        // Redirección usando ngZone para manejar el contexto de Angular
        this.ngZone.run(() => {
          switch(userData.Rol) {
            case 'admin':
              this.router.navigate(['/admin1']);
              break;
            case 'worker':
              this.router.navigate(['/worker']);
              break;
            default:
              this.showAuthError('Usuario sin rol asignado');
              this.authService.signOut(); // Usar el método del servicio
          }
        });
      } else {
        await this.authService.signOut(); // Usar el método del servicio
        this.showAuthError('Usuario no registrado en el sistema');
      }
    } catch (error) {
      console.error('Error al procesar inicio de sesión:', error);
      await this.authService.signOut(); // Usar el método del servicio
      this.showAuthError('Error al verificar permisos');
    }
  }

  private handleAuthError(error: any): void {
    this.showError = true;
    switch (error.code) {
      case 'auth/user-not-found':
        this.errorMessage = 'Usuario no encontrado';
        break;
      case 'auth/wrong-password':
        this.errorMessage = 'Contraseña incorrecta';
        break;
      case 'auth/invalid-email':
        this.errorMessage = 'Correo electrónico inválido';
        break;
      default:
        this.errorMessage = 'Error al iniciar sesión';
    }
    this.usuario.password = '';
  }

  private handleGoogleAuthError(error: any): void {
    this.showError = true;
    switch (error.code) {
      case 'auth/popup-blocked':
        this.errorMessage = 'El popup fue bloqueado. Por favor, permite ventanas emergentes.';
        break;
      case 'auth/popup-closed-by-user':
        this.errorMessage = 'Inicio de sesión cancelado';
        break;
      case 'auth/unauthorized-domain':
        this.errorMessage = 'Dominio no autorizado. Contacte al administrador.';
        break;
      default:
        this.errorMessage = 'Error al iniciar sesión con Google';
    }
  }

  private showAuthError(message: string): void {
    this.showError = true;
    this.errorMessage = message;
  }

  ngOnInit() {
    // Verificar si viene de un cierre de sesión forzado
    const urlParams = new URLSearchParams(window.location.search);
    const forceRefresh = urlParams.get('forceRefresh');
    if (forceRefresh === 'true') {
      // Asegurarse de limpiar todo el estado localmente
      localStorage.clear();
      sessionStorage.clear();
      // Forzar limpieza de IndexedDB
      const cleanupPromises = ['firebaseLocalStorageDb', 'firebaseAuth']
        .map(dbName => this.deleteIndexedDB(dbName));
      Promise.all(cleanupPromises).finally(() => {
        // Configurar persistencia
        this.authService.setPersistenceSession();
        // Limpieza de URL
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('forceRefresh');
        cleanUrl.searchParams.delete('t');
        window.history.replaceState({}, document.title, cleanUrl.pathname);
      });
    } else {
      // Configurar persistencia normalmente
      this.authService.setPersistenceSession();
    }
  }

  // Método auxiliar para eliminar bases de datos IndexedDB
  private deleteIndexedDB(dbName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject();
      request.onblocked = () => {
        console.warn(`Base de datos ${dbName} bloqueada, cerrando conexiones...`);
        resolve(); // Continuamos de todos modos
      };
    });
  }

  // Método para navegar a la página de recuperación de contraseña
  goToPasswordRecovery(): void {
    this.router.navigate(['/recuperar-contrasena']);
  }
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}