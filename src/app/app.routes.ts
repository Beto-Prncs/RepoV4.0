import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./Components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./Components/regist/regist.component').then(c => c.RegistComponent)
  },
  {
    path: 'admin1',
    loadComponent: () => import('./Components/admin/admin.component').then(m => m.AdminComponent)
  },
  {
    path: 'worker',
    loadComponent: () => import('./Components/worker/worker.component').then(m => m.WorkerComponent)
  },
  {
    path: 'UserCreate',
    loadComponent: () => import('./functionalities/create-accounts/create-accounts.component').then(m => m.CreateAccountsComponent)
  },
  {
    path: 'reportsInterface',
    loadComponent: () => import('./functionalities/reports-interface/reports-interface.component').then(m => m.ReportsInterfaceComponent)
  },
  {
    path: 'reports',
    loadComponent: () => import('./functionalities/reports/reports.component').then(m => m.ReportsComponent)
  },
  {
    path: 'createReports',
    loadComponent: () => import('./functionalities/create-reports/create-reports.component').then(m => m.CreateReportsComponent)
  },
  {
    path: 'statistics',
    loadComponent: () => import('./functionalities/statistics/statistics.component').then(m => m.StatisticsComponent)
  },
  {
    path: 'configuration',
    loadComponent: () => import('./functionalities/configuration/configuration.component').then(m => m.ConfigurationComponent)
  },
 
  {
    path: 'worker-pendingtask',
    loadComponent: () => import('./functionalities/worker-pendingtask/worker-pendingtask.component').then(m => m.WorkerPendingtaskComponent)
  },
  {
    path: 'worker-completetask',
    loadComponent: () => import('./functionalities/worker-completetask/worker-completetask.component').then(m => m.WorkerCompleteTaskComponent)
  },
  {
    path: 'create-reports',
    loadComponent: () => import('./functionalities/create-reports/create-reports.component').then(m => m.CreateReportsComponent)
  },
  {
    path: 'worker-config',
    loadComponent: () => import('./functionalities/worker-config/worker-config.component').then(m => m.WorkerConfigComponent)
  },
  {
    path: 'admin-completed',
    loadComponent: () => import('./functionalities/admin-completed-tasks/admin-completed-tasks.component').then(m => m.AdminCompletedTasksComponent)
  },
  
];