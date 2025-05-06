/**
 * Servicio para manejar los formularios de configuración
 * Encapsula la creación y validación de formularios
 */
import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ValidationErrors } from '@angular/forms';

@Injectable()
export class ConfigFormService {
  constructor(private fb: FormBuilder) {}

  /**
   * Crea un formulario para departamentos
   * @returns FormGroup
   */
  createDepartmentForm(): FormGroup {
    return this.fb.group({
      name: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(100)
      ]]
    });
  }

  /**
   * Crea un formulario para empresas
   * @returns FormGroup
   */
  createCompanyForm(): FormGroup {
    return this.fb.group({
      Nombre: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(100)
      ]],
      Correo: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(100)
      ]],
      Direccion: ['', [
        Validators.required,
        Validators.minLength(5),
        Validators.maxLength(200)
      ]],
      Sector: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(100)
      ]]
    });
  }

  /**
   * Crea un formulario de búsqueda
   * @returns FormGroup
   */
  createSearchForm(): FormGroup {
    return this.fb.group({
      term: ['', [
        Validators.maxLength(50)
      ]]
    });
  }

  /**
   * Valida un correo electrónico
   * @param email Correo a validar
   * @returns boolean
   */
  isValidEmail(email: string): boolean {
    if (!email) return false;
    
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return emailPattern.test(email);
  }

  /**
   * Verifica si un campo tiene error
   * @param form Formulario
   * @param fieldName Nombre del campo
   * @returns boolean
   */
  hasFieldError(form: FormGroup, fieldName: string): boolean {
    if (!form) return false;
    
    const field = form.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  /**
   * Obtiene el mensaje de error para un campo
   * @param form Formulario
   * @param fieldName Nombre del campo
   * @returns string con el mensaje de error
   */
  getFieldErrorMessage(form: FormGroup, fieldName: string): string {
    if (!form) return '';
    
    const field = form.get(fieldName);
    if (!field || !field.errors) return '';
    
    const errors: ValidationErrors = field.errors;
    
    // Determinar el tipo de error y devolver mensaje apropiado
    if (errors['required']) {
      return 'Este campo es obligatorio.';
    }
    
    if (errors['minlength']) {
      return `Debe tener al menos ${errors['minlength'].requiredLength} caracteres.`;
    }
    
    if (errors['maxlength']) {
      return `No debe exceder ${errors['maxlength'].requiredLength} caracteres.`;
    }
    
    if (errors['email']) {
      return 'Debe ingresar un correo electrónico válido.';
    }
    
    return 'Error de validación en el campo.';
  }

  /**
   * Marca todos los campos de un formulario como tocados
   * @param form Formulario
   * Útil para mostrar errores en validación de submit
   */
  markAllAsTouched(form: FormGroup): void {
    if (!form) return;
    
    Object.keys(form.controls).forEach(key => {
      const control = form.get(key);
      if (control) {
        control.markAsTouched();
      }
    });
  }

  /**
   * Restablece un formulario
   * @param form Formulario
   */
  resetForm(form: FormGroup): void {
    if (!form) return;
    
    form.reset();
    
    // Eliminar estados de error
    Object.keys(form.controls).forEach(key => {
      const control = form.get(key);
      if (control) {
        control.setErrors(null);
      }
    });
  }
}