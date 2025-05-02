import { Component, OnInit, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  Auth,
  User,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail
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
  
    this.isLoading = true;
    try {
      // Verificar si es un correo electrónico válido
      if (!this.isValidEmail(this.usuario.identifier)) {
        this.showAuthError('Por favor, ingrese un correo electrónico válido');
        this.isLoading = false;
        return;
      }
  
      // Verificar si existe en Firestore para validar contraseña
      try {
        console.log('Buscando usuario por email en Firestore:', this.usuario.identifier);
        const usersRef = collection(this.firestore, 'Usuario');
        const q = query(usersRef, where('Correo', '==', this.usuario.identifier));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          console.log('Usuario no encontrado en Firestore');
          this.showAuthError('Usuario no encontrado');
          this.isLoading = false;
          return;
        }
        
        const userData = querySnapshot.docs[0].data();
        
        // Verificar si la contraseña en Firestore coincide
        if (userData['Password'] !== this.usuario.password) {
          console.log('La contraseña en Firestore no coincide con la ingresada');
          this.showAuthError('Contraseña incorrecta');
          this.isLoading = false;
          return;
        }
      } catch (error) {
        console.error('Error al verificar usuario en Firestore:', error);
        this.showAuthError('Error al verificar usuario');
        this.isLoading = false;
        return;
      }
  
      // Intentar iniciar sesión con Firebase Auth
      try {
        console.log('Intentando login con Firebase Auth para email:', this.usuario.identifier);
        const userCredential = await signInWithEmailAndPassword(
          this.auth,
          this.usuario.identifier,
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
  public async getUserByUsername(username: string): Promise<Usuario | null> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('Username', '==', username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        return {
          ...userDoc.data() as Usuario,
          IdUsuario: userDoc.id
        };
      }
      return null;
    } catch (error) {
      console.error('Error buscando usuario por username:', error);
      return null;
    }
  }

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

  async checkUserExistence(): Promise<void> 
  {
    const identifier = this.usuario.identifier;
    
    console.log('Verificando existencia de usuario para:', identifier);
    
    // 1. Verificar si es un email válido
    if (this.isValidEmail(identifier)) {
      console.log('El identificador es un email válido');
      
      // Verificar existencia en Firebase Auth
      try {
        const methods = await fetchSignInMethodsForEmail(this.auth, identifier);
        console.log('Métodos de inicio disponibles:', methods);
        
        if (methods && methods.length > 0) {
          console.log('El usuario existe en Firebase Auth');
        } else {
          console.log('El usuario NO existe en Firebase Auth');
        }
      } catch (error) {
        console.error('Error verificando métodos de inicio:', error);
      }
    } else {
      console.log('El identificador NO es un email válido, buscando por Username');
    }
    
    // 2. Listar todos los usuarios de Firestore para debugging
    try {
      console.log('Listando todos los usuarios en Firestore:');
      const usersRef = collection(this.firestore, 'Usuario');
      const snapshot = await getDocs(usersRef);
      
      console.log('Total de usuarios en Firestore:', snapshot.size);
      
      // Listar usuarios para debug (atención a los campos Correo y Username)
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`Usuario ${doc.id}: Email=${data['Correo'] || 'N/A'}, Username=${data['Username'] || 'N/A'}, Rol=${data['Rol'] || 'N/A'}, Password=${data['Password'] ? '[EXISTE]' : 'N/A'}`);
      });
      
    } catch (error) {
      console.error('Error listando usuarios:', error);
    }
  }

  async verifyFirebaseAuthUsers(): Promise<void> {
    try {
      // No podemos listar directamente todos los usuarios de Firebase Auth desde el cliente
      // Pero podemos verificar si el usuario actual está autenticado
      const currentUser = this.auth.currentUser;
      
      if (currentUser) {
        console.log('Usuario actualmente autenticado:', currentUser.email);
        console.log('UID del usuario autenticado:', currentUser.uid);
        
        // Verificar si este usuario existe en Firestore
        try {
          const userDoc = await getDoc(doc(this.firestore, 'Usuario', currentUser.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log('Usuario encontrado en Firestore:', userData);
            console.log('Correo en Firestore:', userData['Correo']);
            console.log('Username en Firestore:', userData['Username']);
          } else {
            console.log('¡Alerta! Usuario autenticado pero NO existe en Firestore con su UID');
            
            // Buscar por correo electrónico
            const usersRef = collection(this.firestore, 'Usuario');
            const q = query(usersRef, where('Correo', '==', currentUser.email));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              console.log('Usuario encontrado por correo pero con diferente ID:', 
                         querySnapshot.docs[0].id);
            } else {
              console.log('No se encontró usuario por correo en Firestore');
            }
          }
        } catch (error) {
          console.error('Error verificando usuario en Firestore:', error);
        }
      } else {
        console.log('No hay usuario actualmente autenticado');
      }
    } catch (error) {
      console.error('Error verificando usuarios de Firebase Auth:', error);
    }
  }
}