import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';
import { catchError, map, of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!tokens.hasTokens()) {
    router.navigate(['/login']);
    return false;
  }

  // If we already have the user in memory, allow through
  if (auth.user()) return true;

  // Otherwise reload from API (handles page refresh)
  return auth.loadUser().pipe(
    map(() => true),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};

export const adminGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);

  if (!tokens.hasTokens()) {
    router.navigate(['/login']);
    return false;
  }

  if (!tokens.isAdmin()) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};

export const publicGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  if (tokens.hasTokens()) {
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};
