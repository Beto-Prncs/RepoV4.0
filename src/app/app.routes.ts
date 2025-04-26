import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { workerGuard } from './guards/worker.guard';
import { logoutGuard } from './guards/logout.guard';
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./Components/login/login.component').then(m => m.LoginComponent),
    canActivate: [logoutGuard]
  },
  {
    path: 'login',
    redirectTo: '',
    pathMatch: 'full'
  },
  {
    path: 'register',
    loadComponent: () => import('./Components/regist/regist.component').then(c => c.RegistComponent)
  },
  {
    path: 'admin1',
    loadComponent: () => import('./Components/admin/admin.component').then(m => m.AdminComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'worker',
    loadComponent: () => import('./Components/worker/worker.component').then(m => m.WorkerComponent),
    canActivate: [authGuard, workerGuard]
  },
  {
    path: 'UserCreate',
    loadComponent: () => import('./functionalities/create-accounts/create-accounts.component').then(m => m.CreateAccountsComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'reportsInterface',
    loadComponent: () => import('./functionalities/reports-interface/reports-interface.component').then(m => m.ReportsInterfaceComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'reports',
    loadComponent: () => import('./functionalities/reports/reports.component').then(m => m.ReportsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'createReports',
    loadComponent: () => import('./functionalities/create-reports/create-reports.component').then(m => m.CreateReportsComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'statistics',
    loadComponent: () => import('./functionalities/statistics/statistics.component').then(m => m.StatisticsComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'configuration',
    loadComponent: () => import('./functionalities/configuration/configuration.component').then(m => m.ConfigurationComponent),
    canActivate: [authGuard]
  },
 
  {
    path: 'worker-pendingtask',
    loadComponent: () => import('./functionalities/worker-pendingtask/worker-pendingtask.component').then(m => m.WorkerPendingTaskComponent),
    canActivate: [authGuard, workerGuard]
  },
  {
    path: 'worker-completetask',
    loadComponent: () => import('./functionalities/worker-completetask/worker-completetask.component').then(m => m.WorkerCompleteTaskComponent),
    canActivate: [authGuard, workerGuard]
  },
  
  {
    path: 'worker-config',
    loadComponent: () => import('./functionalities/worker-config/worker-config.component').then(m => m.WorkerConfigComponent),
    canActivate: [authGuard, workerGuard]
  },
  {
    path: 'admin-completed',
    loadComponent: () => import('./functionalities/admin-completed-tasks/admin-completed-tasks.component').then(m => m.AdminCompletedTasksComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];