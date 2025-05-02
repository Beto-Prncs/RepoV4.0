import { Injectable, Renderer2, RendererFactory2, inject } from '@angular/core';

export interface ModalOptions {
  title: string;
  message: string;
  okText?: string;
  cancelText?: string | null;
  onOk?: () => void;
  onCancel?: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class SimpleModalService {
  private renderer: Renderer2;
  private modalElement: HTMLElement | null = null;
  private backdropElement: HTMLElement | null = null;

  constructor(private rendererFactory: RendererFactory2) {
    this.renderer = this.rendererFactory.createRenderer(null, null);
  }

  /**
   * Muestra un diálogo modal simple
   */
  showModal(options: ModalOptions): void {
    // Limpiar modal anterior si existe
    this.closeModal();
    
    // Crear el backdrop
    this.backdropElement = this.renderer.createElement('div');
    this.renderer.addClass(this.backdropElement, 'fixed');
    this.renderer.addClass(this.backdropElement, 'inset-0');
    this.renderer.addClass(this.backdropElement, 'bg-black/50');
    this.renderer.addClass(this.backdropElement, 'backdrop-blur-sm');
    this.renderer.addClass(this.backdropElement, 'z-50');
    this.renderer.setStyle(this.backdropElement, 'animation', 'fadeIn 0.3s');
    
    // Crear el modal
    this.modalElement = this.renderer.createElement('div');
    this.renderer.addClass(this.modalElement, 'fixed');
    this.renderer.addClass(this.modalElement, 'left-1/2');
    this.renderer.addClass(this.modalElement, 'top-1/2');
    this.renderer.addClass(this.modalElement, '-translate-x-1/2');
    this.renderer.addClass(this.modalElement, '-translate-y-1/2');
    this.renderer.addClass(this.modalElement, 'bg-white');
    this.renderer.addClass(this.modalElement, 'rounded-xl');
    this.renderer.addClass(this.modalElement, 'p-6');
    this.renderer.addClass(this.modalElement, 'shadow-xl');
    this.renderer.addClass(this.modalElement, 'w-11/12');
    this.renderer.addClass(this.modalElement, 'max-w-md');
    this.renderer.addClass(this.modalElement, 'z-50');
    this.renderer.setStyle(this.modalElement, 'animation', 'zoomIn 0.3s');
    
    // Título
    const title = this.renderer.createElement('h3');
    this.renderer.addClass(title, 'text-xl');
    this.renderer.addClass(title, 'font-bold');
    this.renderer.addClass(title, 'text-indigo-900');
    this.renderer.addClass(title, 'mb-3');
    this.renderer.appendChild(title, this.renderer.createText(options.title));
    this.renderer.appendChild(this.modalElement, title);
    
    // Mensaje
    const message = this.renderer.createElement('p');
    this.renderer.addClass(message, 'text-gray-700');
    this.renderer.addClass(message, 'mb-6');
    this.renderer.appendChild(message, this.renderer.createText(options.message));
    this.renderer.appendChild(this.modalElement, message);
    
    // Contenedor de botones
    const buttonContainer = this.renderer.createElement('div');
    this.renderer.addClass(buttonContainer, 'flex');
    this.renderer.addClass(buttonContainer, 'justify-end');
    this.renderer.addClass(buttonContainer, 'gap-3');
    
    // Botón de cancelar (opcional)
    if (options.cancelText !== null) {
      const cancelButton = this.renderer.createElement('button');
      this.renderer.addClass(cancelButton, 'px-4');
      this.renderer.addClass(cancelButton, 'py-2');
      this.renderer.addClass(cancelButton, 'border');
      this.renderer.addClass(cancelButton, 'border-gray-300');
      this.renderer.addClass(cancelButton, 'rounded-lg');
      this.renderer.addClass(cancelButton, 'text-gray-700');
      this.renderer.addClass(cancelButton, 'hover:bg-gray-50');
      this.renderer.addClass(cancelButton, 'transition-colors');
      this.renderer.appendChild(cancelButton, this.renderer.createText(options.cancelText || 'Cancelar'));
      
      this.renderer.listen(cancelButton, 'click', () => {
        this.closeModal();
        if (options.onCancel) {
          options.onCancel();
        }
      });
      
      this.renderer.appendChild(buttonContainer, cancelButton);
    }
    
    // Botón de confirmar
    const okButton = this.renderer.createElement('button');
    this.renderer.addClass(okButton, 'px-4');
    this.renderer.addClass(okButton, 'py-2');
    this.renderer.addClass(okButton, 'bg-indigo-900');
    this.renderer.addClass(okButton, 'text-white');
    this.renderer.addClass(okButton, 'rounded-lg');
    this.renderer.addClass(okButton, 'hover:bg-indigo-800');
    this.renderer.addClass(okButton, 'transition-colors');
    this.renderer.appendChild(okButton, this.renderer.createText(options.okText || 'Aceptar'));
    
    this.renderer.listen(okButton, 'click', () => {
      this.closeModal();
      if (options.onOk) {
        options.onOk();
      }
    });
    
    this.renderer.appendChild(buttonContainer, okButton);
    this.renderer.appendChild(this.modalElement, buttonContainer);
    
    // Agregar a DOM
    this.renderer.appendChild(document.body, this.backdropElement);
    this.renderer.appendChild(document.body, this.modalElement);
    
    // Agregar estilos para animaciones
    const style = this.renderer.createElement('style');
    this.renderer.appendChild(
      style,
      this.renderer.createText(`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes zoomIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes zoomOut {
          from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          to { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
        }
      `)
    );
    this.renderer.appendChild(document.head, style);
    
    // Detectar tecla ESC para cerrar
    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        this.closeModal();
        if (options.onCancel) {
          options.onCancel();
        }
      }
    };
    
    document.addEventListener('keydown', escHandler);
    
    // Clic en backdrop para cerrar
    if (this.backdropElement) {
      this.renderer.listen(this.backdropElement, 'click', () => {
        document.removeEventListener('keydown', escHandler);
        this.closeModal();
        if (options.onCancel) {
          options.onCancel();
        }
      });
    }
  }

  /**
   * Muestra un diálogo de confirmación
   */
  confirm(title: string, message: string, okCallback?: () => void, cancelCallback?: () => void): void {
    this.showModal({
      title,
      message,
      okText: 'Aceptar',
      cancelText: 'Cancelar',
      onOk: okCallback,
      onCancel: cancelCallback
    });
  }

  /**
   * Muestra un mensaje de alerta
   */
  alert(title: string, message: string, callback?: () => void): void {
    this.showModal({
      title,
      message,
      okText: 'Aceptar',
      cancelText: null, // Sin botón de cancelar
      onOk: callback
    });
  }

  /**
   * Cierra el modal actual
   */
  closeModal(): void {
    if (this.modalElement) {
      this.renderer.setStyle(this.modalElement, 'animation', 'zoomOut 0.2s');
    }
    
    if (this.backdropElement) {
      this.renderer.setStyle(this.backdropElement, 'animation', 'fadeOut 0.2s');
    }
    
    // Remover elementos después de la animación
    setTimeout(() => {
      if (this.modalElement) {
        this.renderer.removeChild(document.body, this.modalElement);
        this.modalElement = null;
      }
      
      if (this.backdropElement) {
        this.renderer.removeChild(document.body, this.backdropElement);
        this.backdropElement = null;
      }
    }, 200);
  }
}