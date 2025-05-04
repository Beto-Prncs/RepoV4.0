import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { Usuario } from '../../models/interfaces';
import {
  Firestore,
  doc,
  deleteDoc,
  collection,
  query,
  getDocs,
  where
} from '@angular/fire/firestore';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-users.component.html',
  styleUrl: './manage-users.component.css'
})
export class ManageUsersComponent implements OnInit {
  private authService: AuthService = inject(AuthService);
  private firestore: Firestore = inject(Firestore);
  private router: Router = inject(Router);
  private destroyRef: DestroyRef = inject(DestroyRef);

  users$ = new BehaviorSubject<Usuario[]>([]);
  isAdmin3 = false;
  isLoading = false;
  currentAdminId = '';
  showConfirmDialog = false;
  userToDelete: Usuario | null = null;
  errorMessage = '';
  successMessage = '';
  filterRole: 'all' | 'admin' | 'worker' = 'all';

  constructor() {}

  async ngOnInit() {
    await this.checkAdminPermissions();
    this.loadUsers();
  }

  private async checkAdminPermissions(): Promise<void> {
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        this.router.navigate(['/login']);
        return;
      }

      const userData = await this.authService.getUserData(currentUser.uid);
      if (!userData || userData.Rol !== 'admin') {
        this.router.navigate(['/admin1']);
        return;
      }

      // Verificar nivel de admin
      this.isAdmin3 = userData.NivelAdmin === '3';
      this.currentAdminId = currentUser.uid;

      if (!this.isAdmin3) {
        this.router.navigate(['/admin1']);
      }
    } catch (error) {
      console.error('Error verificando permisos:', error);
      this.showError('Error al verificar permisos de administrador');
      this.router.navigate(['/admin1']);
    }
  }

  loadUsers(role: 'all' | 'admin' | 'worker' = 'all'): void {
    this.isLoading = true;
    this.filterRole = role;

    // Usar el método async/await sin observable
    this.fetchUsers(role);
  }

  private async fetchUsers(role: 'all' | 'admin' | 'worker' = 'all'): Promise<void> {
    try {
      const users = await this.authService.getUsersCreatedBy(this.currentAdminId);
      
      // Filtrar por rol si es necesario
      let filteredUsers = users;
      if (role !== 'all') {
        filteredUsers = users.filter(user => user.Rol === role);
      }
      
      this.users$.next(filteredUsers);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      this.showError('Error al cargar usuarios');
    } finally {
      this.isLoading = false;
    }
  }

  showDeleteConfirmation(user: Usuario): void {
    this.userToDelete = user;
    this.showConfirmDialog = true;
  }

  cancelDelete(): void {
    this.userToDelete = null;
    this.showConfirmDialog = false;
  }

  async confirmDelete(): Promise<void> {
    if (!this.userToDelete) return;

    this.isLoading = true;
    try {
      // Primero verificar si el usuario tiene reportes asignados
      if (this.userToDelete.Rol === 'worker') {
        const reportesRef = collection(this.firestore, 'Reportes');
        const q = query(reportesRef, where('IdUsuario', '==', this.userToDelete.Username));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          throw new Error('No se puede eliminar el usuario porque tiene reportes asignados');
        }
      }
      
      // Eliminar el usuario de Firestore
      const userDocId = this.userToDelete.IdUsuario;
      await deleteDoc(doc(this.firestore, 'Usuario', userDocId));
      
      this.showSuccess(`Usuario "${this.userToDelete.Nombre}" eliminado correctamente`);
      this.cancelDelete();
      this.loadUsers(this.filterRole);
    } catch (error: any) {
      this.showError(error.message || 'Error al eliminar usuario');
    } finally {
      this.isLoading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/admin1']);
  }

  setFilter(role: 'all' | 'admin' | 'worker'): void {
    this.loadUsers(role);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    setTimeout(() => this.errorMessage = '', 5000);
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    setTimeout(() => this.successMessage = '', 3000);
  }
}