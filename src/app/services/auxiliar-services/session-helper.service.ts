import { Injectable } from '@angular/core';

/**
 * Servicio para manejar datos de sesión
 * Este servicio ayuda a mantener la sesión del administrador durante operaciones críticas
 */
@Injectable({
  providedIn: 'root'
})
export class SessionHelperService {
  // Almacenamiento temporal de credenciales administrativas
  // Esta es una implementación básica y no se recomienda para entornos de producción
  // ya que almacena información sensible en memoria
  private tempAdminCredentials: {email: string | null, password: string | null} = {
    email: null,
    password: null
  };

  constructor() {
    console.log('SessionHelperService inicializado');
  }

  /**
   * Almacena temporalmente las credenciales del administrador
   * @param email Email del administrador
   * @param password Contraseña del administrador
   */
  setAdminCredentials(email: string, password: string): void {
    console.log('Guardando credenciales temporales del administrador');
    this.tempAdminCredentials = { email, password };
  }

  /**
   * Obtiene las credenciales del administrador almacenadas temporalmente
   * @returns Objeto con email y password del administrador
   */
  getAdminCredentials(): {email: string | null, password: string | null} {
    console.log('Recuperando credenciales temporales del administrador');
    return this.tempAdminCredentials;
  }

  /**
   * Elimina las credenciales temporales del administrador
   * Debe llamarse después de completar la operación o en caso de error
   */
  clearAdminCredentials(): void {
    console.log('Limpiando credenciales temporales del administrador');
    this.tempAdminCredentials = { email: null, password: null };
  }

  /**
   * Verifica si hay credenciales de administrador almacenadas
   * @returns true si hay credenciales almacenadas
   */
  hasAdminCredentials(): boolean {
    return !!(this.tempAdminCredentials.email && this.tempAdminCredentials.password);
  }

  /**
   * Almacena datos de sesión en localStorage
   * Útil para guardar información no sensible entre sesiones
   * @param key Clave para almacenar el valor
   * @param value Valor a almacenar
   */
  setSessionData(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error al guardar datos en localStorage:', error);
    }
  }

  /**
   * Recupera datos de sesión de localStorage
   * @param key Clave del valor a recuperar
   * @returns El valor almacenado o null si no existe
   */
  getSessionData(key: string): any {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error al recuperar datos de localStorage:', error);
      return null;
    }
  }

  /**
   * Elimina datos de sesión de localStorage
   * @param key Clave del valor a eliminar
   */
  removeSessionData(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Error al eliminar datos de localStorage:', error);
    }
  }

  /**
   * Limpia todos los datos de sesión de localStorage
   */
  clearAllSessionData(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error al limpiar localStorage:', error);
    }
  }
}