import { Routes } from '@angular/router';
import { authGuard, publicGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  {
    path: 'login',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'forgot-password',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/onboarding/onboarding.component').then(m => m.OnboardingComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'entry/new',
    canActivate: [authGuard],
    loadComponent: () => import('./features/entry/new/new-entry.component').then(m => m.NewEntryComponent)
  },
  {
    path: 'entry/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/entry/view/view-entry.component').then(m => m.ViewEntryComponent)
  },
  {
    path: 'entry/:id/edit',
    canActivate: [authGuard],
    loadComponent: () => import('./features/entry/edit/edit-entry.component').then(m => m.EditEntryComponent)
  },
  {
    path: 'entries/by-tag/:name',
    canActivate: [authGuard],
    loadComponent: () => import('./features/entries/tagged-entries.component').then(m => m.TaggedEntriesComponent)
  },
  {
    path: 'trash',
    canActivate: [authGuard],
    loadComponent: () => import('./features/trash/trash.component').then(m => m.TrashComponent)
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent)
  },

  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-dashboard.component').then(m => m.AdminDashboardComponent)
  },
  {
    path: 'admin/users',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-users.component').then(m => m.AdminUsersComponent)
  },
  {
    path: 'admin/users/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-user-detail.component').then(m => m.AdminUserDetailComponent)
  },
  {
    path: 'admin/motivation',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-motivation.component').then(m => m.AdminMotivationComponent)
  },
  {
    path: 'admin/reminders',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-reminders.component').then(m => m.AdminRemindersComponent)
  },

  {
    path: 'billing/success',
    canActivate: [authGuard],
    loadComponent: () => import('./features/billing/billing-success.component').then(m => m.BillingSuccessComponent)
  },
  {
    path: 'billing/cancel',
    canActivate: [authGuard],
    loadComponent: () => import('./features/billing/billing-cancel.component').then(m => m.BillingCancelComponent)
  },

  { path: '**', loadComponent: () => import('./features/not-found/not-found.component').then(m => m.NotFoundComponent) }
];
