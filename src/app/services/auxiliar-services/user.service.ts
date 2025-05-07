import { Injectable, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  UserCredential,
  signOut
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  getDoc
} from '@angular/fire/firestore';
import { Observable, from, throwError, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { SessionHelperService } from './session-helper.service';
import { environment } from '../../environments/environments';

// Definición de la interfaz para los datos de usuario
export interface UserCreationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
  phone?: string;
  department?: string;
  adminLevel?: string;
  role: 'admin' | 'worker';
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private http: HttpClient = inject(HttpClient);
  private sessionHelper: SessionHelperService = inject(SessionHelperService);

  constructor() {}

  /**
   * Verifica si un nombre de usuario ya existe
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('Username', '==', username));
      const querySnapshot = await getDocs(q);
      return querySnapshot.empty;
    } catch (error) {
      console.error('Error verificando disponibilidad de nombre de usuario:', error);
      return false;
    }
  }

  /**
   * Crea un nuevo usuario sin afectar la sesión actual del admin
   */
  async createUserWithoutSession(userData: UserCreationData, creatorId: string): Promise<any> {
    // 1. Validaciones iniciales
    if (!userData.email || !userData.password || !userData.firstName ||
      !userData.lastName || !userData.username) {
      throw new Error('Faltan datos requeridos para crear el usuario');
    }

    // 2. Verificar que el nombre de usuario no exista
    const isAvailable = await this.isUsernameAvailable(userData.username);
    if (!isAvailable) {
      throw new Error('El nombre de usuario ya está en uso');
    }

    try {
      // 3. Obtener referencia al usuario actual
      const currentUser = this.auth.currentUser;
      if (!currentUser) {
        throw new Error('No hay un usuario autenticado para crear la cuenta');
      }

      // Guardar información del usuario actual para restaurar sesión después
      const currentEmail = currentUser.email;
      const currentUid = currentUser.uid;
      console.log('Creando usuario con sesión actual:', currentUid);

      // 4. Crear el nuevo usuario
      let newUserUid: string;
      try {
        // Crear el nuevo usuario
        const tempUserCredential = await createUserWithEmailAndPassword(
          this.auth, 
          userData.email,
          userData.password
        );
        newUserUid = tempUserCredential.user.uid;
        console.log('Usuario creado con UID:', newUserUid);

        // Guardar datos en Firestore
        await this.saveUserToFirestore(newUserUid, userData, creatorId);
        
        // IMPORTANTE: Cerrar sesión del nuevo usuario inmediatamente
        await signOut(this.auth);
        console.log('Sesión del nuevo usuario cerrada');
        
        // Restaurar la sesión del administrador
        if (currentEmail) {
          try {
            // Volver a iniciar sesión con el administrador
            const adminCredential = await this.sessionHelper.getAdminCredentials();
            if (adminCredential && adminCredential.email && adminCredential.password) {
              await signInWithEmailAndPassword(
                this.auth, 
                adminCredential.email, 
                adminCredential.password
              );
              console.log('Sesión del administrador restaurada');
            } else {
              console.warn('No se pudo restaurar la sesión del administrador, necesitará iniciar sesión nuevamente');
            }
          } catch (signInError) {
            console.error('Error al restaurar la sesión del administrador:', signInError);
          }
        }

        return {
          success: true,
          uid: newUserUid
        };
      } catch (error) {
        console.error('Error en el proceso de creación:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('Error detallado al crear usuario:', error);
      throw error;
    }
  }

  /**
   * Guarda los datos del usuario en Firestore
   */
  private async saveUserToFirestore(uid: string, userData: UserCreationData, creatorId: string): Promise<void> {
    try {
      const userFirestoreData: Record<string, any> = {
        'IdUsuario': uid,
        'Nombre': `${userData.firstName} ${userData.lastName}`,
        'Correo': userData.email,
        'Username': userData.username,
        'Password': userData.password, // Nota: en una app real, nunca guardarías passwords en texto plano
        'Foto_Perfil': "",
        'Rol': userData.role,
        'Telefono': userData.phone || "",
        'Departamento': userData.department || "",
        'NivelAdmin': userData.role === 'admin' ? userData.adminLevel : "",
        'createdBy': creatorId,
        'createdAt': new Date()
      };
      
      await setDoc(doc(this.firestore, 'Usuario', uid), userFirestoreData);
      console.log('Datos de usuario guardados en Firestore');
      
      // Crear documento para trigger de correo automático usando la extensión Trigger Email from Firestore
      const emailDocData = {
        to: userData.email,
        message: {
          subject: '¡Bienvenido a Repo System!',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background-color: white; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .credentials { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .button { display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; }
                .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #777; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>¡Bienvenido a Repo System!</h1>
                </div>
                <div class="content">
                  <p>Hola <strong>${userData.firstName} ${userData.lastName}</strong>,</p>
                  <p>Tu cuenta ha sido creada exitosamente. A continuación, encontrarás tus credenciales de acceso:</p>
                  <div class="credentials">
                    <p><strong>Rol:</strong> ${userData.role === 'admin' ? 'Administrador' : 'Trabajador'}</p>
                    <p><strong>Nombre de usuario:</strong> ${userData.username}</p>
                    <p><strong>Contraseña:</strong> ${userData.password}</p>
                    <p><strong>Correo electrónico:</strong> ${userData.email}</p>
                  </div>
                  <p>Por seguridad, te recomendamos cambiar tu contraseña después del primer inicio de sesión.</p>
                  <a href="${environment.appUrl}/login" class="button">Iniciar sesión</a>
                  <p>Si tienes alguna pregunta o problema, no dudes en contactar al administrador del sistema.</p>
                  <p>¡Gracias por ser parte de nuestro equipo!</p>
                </div>
                <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} Repo System. Todos los derechos reservados.</p>
                </div>
              </div>
            </body>
            </html>
          `
        }
      };
      
      // Crear documento en la colección 'mail' para activar la extensión
      await setDoc(doc(this.firestore, 'mail', `welcome_${uid}`), emailDocData);
      console.log('Documento para envío de correo creado');
      
    } catch (error) {
      console.error('Error guardando datos en Firestore:', error);
      throw error;
    }
  }

  /**
   * Determina si estamos en entorno de desarrollo
   */
  private isDevEnvironment(): boolean {
    return !environment.production;
  }

  /**
   * Obtiene un usuario por su ID
   */
  async getUserById(userId: string): Promise<any> {
    try {
      const userRef = doc(this.firestore, 'Usuario', userId);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        throw new Error('No se encontró el usuario con el ID especificado');
      }
      return {
        id: userDoc.id,
        ...userDoc.data()
      };
    } catch (error) {
      console.error('Error obteniendo usuario por ID:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los usuarios
   */
  async getAllUsers(): Promise<any[]> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const snapshot = await getDocs(usersRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error obteniendo todos los usuarios:', error);
      return [];
    }
  }

  /**
   * Obtiene usuarios por rol
   */
  async getUsersByRole(role: 'admin' | 'worker'): Promise<any[]> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('Rol', '==', role));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error obteniendo usuarios con rol ${role}:`, error);
      return [];
    }
  }

  /**
   * Obtiene usuarios creados por un administrador específico
   */
  async getUsersCreatedBy(adminId: string): Promise<any[]> {
    try {
      const usersRef = collection(this.firestore, 'Usuario');
      const q = query(usersRef, where('createdBy', '==', adminId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error obteniendo usuarios creados por administrador:', error);
      return [];
    }
  }

  /**
   * Actualiza la información de un usuario
   */
  async updateUser(userId: string, userData: Partial<UserCreationData>): Promise<void> {
    try {
      // Preparar los datos para actualizar (convertir a formato de Firestore)
      const updateData: Record<string, any> = {};
      if (userData.firstName && userData.lastName) {
        updateData['Nombre'] = `${userData.firstName} ${userData.lastName}`;
      }
      if (userData.email) {
        updateData['Correo'] = userData.email;
      }
      if (userData.username) {
        // Verificar si el nombre de usuario ya existe (excepto para el mismo usuario)
        const usersRef = collection(this.firestore, 'Usuario');
        const q = query(
          usersRef,
          where('Username', '==', userData.username),
          where('IdUsuario', '!=', userId)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          throw new Error('El nombre de usuario ya está en uso por otro usuario');
        }
        updateData['Username'] = userData.username;
      }
      if (userData.password) {
        updateData['Password'] = userData.password;
      }
      if (userData.phone !== undefined) {
        updateData['Telefono'] = userData.phone;
      }
      if (userData.department !== undefined) {
        updateData['Departamento'] = userData.department;
      }
      if (userData.role === 'admin' && userData.adminLevel !== undefined) {
        updateData['NivelAdmin'] = userData.adminLevel;
      }

      // Actualizar el documento en Firestore
      if (Object.keys(updateData).length > 0) {
        await updateDoc(doc(this.firestore, 'Usuario', userId), updateData);
      }
    } catch (error) {
      console.error('Error actualizando usuario:', error);
      throw error;
    }
  }

  /**
   * Elimina un usuario
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      // En una implementación real, deberías también eliminar el usuario de Firebase Auth
      // Esto normalmente requiere privilegios de administrador y posiblemente una Cloud Function
      // Eliminar el documento de Firestore
      await deleteDoc(doc(this.firestore, 'Usuario', userId));
    } catch (error) {
      console.error('Error eliminando usuario:', error);
      throw error;
    }
  }
}