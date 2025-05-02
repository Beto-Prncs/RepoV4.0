import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const workerGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Usar el método getCurrentUser que ya has implementado
  const user = await authService.getCurrentUser();
  
  if (user) {
    // Verificar que el usuario es trabajador
    const isWorker = await authService.isWorker(user.uid);
    
    if (isWorker) {
      return true; // Usuario es trabajador, permite acceso
    } else {
      // No es trabajador, verificar si es admin
      const isAdmin = await authService.isAdmin(user.uid);
      
      if (isAdmin) {
        router.navigate(['/admin1']);
      } else {
        router.navigate(['/login']);
      }
      
      return false;
    }
  } else {
    // No hay usuario autenticado
    router.navigate(['/login']);
    return false;
  }
};