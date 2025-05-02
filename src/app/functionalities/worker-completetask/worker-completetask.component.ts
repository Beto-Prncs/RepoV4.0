import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule} from '@angular/router';
import { TaskService } from '../../services/task.service';
import { Auth } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { Reporte } from '../../models/interfaces';


@Component({
  selector: 'app-worker-completetask',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './worker-completetask.component.html',
  styleUrl: './worker-completetask.component.scss'
})
export class WorkerCompleteTaskComponent implements OnInit, OnDestroy {
  private taskService: TaskService = inject(TaskService);
  private router: Router = inject(Router);
  private auth: Auth = inject(Auth);

  completedTasks: Reporte[] = [];
  private subscription?: Subscription;
  isLoading = true;
  errorMessage = '';
  successMessage = '';

  ngOnInit() {
    console.log('Inicializando componente worker-completetask');
    this.setupAuthListener();
  }

  private setupAuthListener(): void {
    const authSub = this.auth.onAuthStateChanged(user => {
      if (user) {
        console.log('Usuario autenticado:', user.uid);
        this.loadCompletedTasks(user.uid);
      } else {
        console.log('No hay usuario autenticado');
        this.router.navigate(['/login']);
      }
    });

    if (authSub) {
      this.subscription = new Subscription(() => authSub());
    }
  }

  private loadCompletedTasks(userId: string): void {
    const tasksSub = this.taskService.getCompletedReportesByWorker(userId)
      .subscribe({
        next: (reportes) => {
          console.log('Reportes completados recibidos:', reportes);
          this.completedTasks = reportes;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al cargar reportes completados:', error);
          this.showError('Error al cargar los reportes completados');
          this.isLoading = false;
        }
      });

    if (tasksSub) {
      if (this.subscription) {
        this.subscription.add(tasksSub);
      } else {
        this.subscription = tasksSub;
      }
    }
  }

  convertToDate(fecha: Date | Timestamp): Date {
    if (fecha instanceof Timestamp) {
      return fecha.toDate();
    }
    return fecha as Date;
  }

  formatDate(date: Date | Timestamp): string {
    const dateObj = this.convertToDate(date);
    return new Intl.DateTimeFormat('es', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(dateObj);
  }

  getStatusClass(estado: string): string {
    switch (estado.toLowerCase()) {
      case 'completado':
        return 'status-completed';
      case 'pendiente':  
        return 'status-pending';
      default:
        return 'status-default';
    }
  }

  getPriorityClass(priority: string): string {
    switch (priority.toLowerCase()) {
      case 'alta':
        return 'priority-high';
      case 'media':
        return 'priority-medium';
      case 'baja':
        return 'priority-low';
      default:
        return 'priority-default';
    }
  }

  private showError(message: string): void {
    this.errorMessage = message;
    setTimeout(() => {
      this.errorMessage = '';
    }, 5000);
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  goBack(): void {
    this.router.navigate(['/worker']);
  }
}