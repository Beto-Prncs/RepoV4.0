/**
 * Servicio para manejar animaciones y estados visuales
 * Separa la lógica de animación del componente principal
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Tipo de estados de animación
export type AnimationState = 
  'idle' | 
  'loading' | 
  'saving' | 
  'deleting' | 
  'refreshing' | 
  'transitioning' | 
  'loaded' | 
  'success' | 
  'error';

@Injectable()
export class ConfigAnimationService {
  // Estado de animación actual
  private animationStateSubject = new BehaviorSubject<AnimationState>('idle');
  animationState$ = this.animationStateSubject.asObservable();

  // Tiempo de duración de animaciones
  private animationDurations = {
    fade: 500,
    slide: 400,
    transition: 150,
    refresh: 500,
    shake: 500,
    pulse: 2000
  };

  constructor() {}

  /**
   * Cambia el estado de animación
   * @param state Nuevo estado
   */
  setState(state: AnimationState): void {
    this.animationStateSubject.next(state);
  }

  /**
   * Obtiene el estado actual
   * @returns Estado actual
   */
  getState(): AnimationState {
    return this.animationStateSubject.getValue();
  }

  /**
   * Aplica un efecto de transición entre tabs
   * @param callback Función a ejecutar después de la transición
   */
  applyTabTransition(callback: () => void): void {
    this.setState('transitioning');
    
    setTimeout(() => {
      callback();
      this.setState('loaded');
    }, this.animationDurations.transition);
  }

  /**
   * Aplica efecto de carga
   * @param callback Función a ejecutar para cargar datos
   */
  applyLoadingEffect(callback: () => Promise<void>): Promise<void> {
    this.setState('loading');
    
    return callback()
      .then(() => {
        this.setState('loaded');
      })
      .catch((error) => {
        this.setState('error');
        throw error;
      });
  }

  /**
   * Aplica efecto de guardado
   * @param callback Función para guardar datos
   */
  applySavingEffect(callback: () => Promise<void>): Promise<void> {
    this.setState('saving');
    
    return callback()
      .then(() => {
        this.setState('success');
        setTimeout(() => this.setState('idle'), 1000);
      })
      .catch((error) => {
        this.setState('error');
        setTimeout(() => this.setState('idle'), 1000);
        throw error;
      });
  }

  /**
   * Aplica efecto de eliminación
   * @param callback Función para eliminar datos
   */
  applyDeletingEffect(callback: () => Promise<void>): Promise<void> {
    this.setState('deleting');
    
    return callback()
      .then(() => {
        this.setState('success');
        setTimeout(() => this.setState('idle'), 1000);
      })
      .catch((error) => {
        this.setState('error');
        setTimeout(() => this.setState('idle'), 1000);
        throw error;
      });
  }

  /**
   * Aplica efecto de actualización de datos
   * @param callback Función para refrescar datos
   */
  applyRefreshEffect(callback: () => Promise<void>): Promise<void> {
    this.setState('refreshing');
    
    return callback()
      .then(() => {
        setTimeout(() => this.setState('idle'), this.animationDurations.refresh);
      })
      .catch((error) => {
        setTimeout(() => this.setState('idle'), this.animationDurations.refresh);
        throw error;
      });
  }

  /**
   * Genera clases CSS basadas en el estado actual
   * @param baseClass Clase base
   * @returns String con clases CSS
   */
  getAnimationClasses(baseClass: string = ''): string {
    const state = this.getState();
    let classes = baseClass ? `${baseClass} ` : '';
    
    switch (state) {
      case 'loading':
        classes += 'animate-pulse';
        break;
      case 'saving':
      case 'deleting':
        classes += 'opacity-70';
        break;
      case 'transitioning':
        classes += 'opacity-50 transform scale-98';
        break;
      case 'error':
        classes += 'animate-shake';
        break;
      case 'success':
        classes += 'animate-success';
        break;
      case 'refreshing':
        classes += 'animate-spin';
        break;
      default:
        break;
    }
    
    return classes;
  }
}