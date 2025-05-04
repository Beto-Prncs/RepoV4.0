// src/app/guards/admin-level.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminLevel2Guard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  
  try {
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) {
      return router.createUrlTree(['/login']);
    }
    
    const userData = await authService.getUserData(currentUser.uid);
    if (!userData || userData.Rol !== 'admin') {
      return router.createUrlTree(['/admin1']);
    }
    
    // Verificar que sea admin nivel 2 o superior
    const adminLevel = parseInt(userData.NivelAdmin || '1');
    if (adminLevel < 2) {
      return router.createUrlTree(['/admin1']);
    }
    
    return true;
  } catch (error) {
    console.error('Error en admin-level-2 guard:', error);
    return router.createUrlTree(['/login']);
  }
};

export const adminLevel3Guard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  
  try {
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) {
      return router.createUrlTree(['/login']);
    }
    
    const userData = await authService.getUserData(currentUser.uid);
    if (!userData || userData.Rol !== 'admin') {
      return router.createUrlTree(['/admin1']);
    }
    
    // Verificar que sea admin nivel 3
    const adminLevel = parseInt(userData.NivelAdmin || '1');
    if (adminLevel < 3) {
      return router.createUrlTree(['/admin1']);
    }
    
    return true;
  } catch (error) {
    console.error('Error en admin-level-3 guard:', error);
    return router.createUrlTree(['/login']);
  }
};