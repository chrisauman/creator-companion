import { ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { Router, provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import * as Sentry from '@sentry/angular';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Without scrollPositionRestoration: 'top', Angular keeps the prior
    // page's window scrollTop when navigating to a new route — so on
    // mobile, opening an entry from a deep-scrolled dashboard would
    // land the user mid-entry with the headline cut off. 'top' resets
    // each new navigation; 'enabled' would also restore on Back.
    // anchorScrolling lets `#fragment` URLs scroll to the matching id.
    provideRouter(routes, withInMemoryScrolling({
      scrollPositionRestoration: 'top',
      anchorScrolling: 'enabled'
    })),
    provideHttpClient(withInterceptors([authInterceptor])),

    // ── Sentry providers ──────────────────────────────────────────
    // ErrorHandler installs Sentry as Angular's global error sink so
    // template errors, signal-update throws, and any other unhandled
    // exception are forwarded to Sentry. createErrorHandler() is a
    // no-op wrapper when Sentry.init wasn't called (sentryDsn empty
    // in dev) — safe to leave wired up regardless.
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler({
        showDialog: false  // No "report this error" dialog — feels intrusive in a journaling app
      })
    },
    // TraceService instruments the Router so each navigation becomes
    // a Sentry performance transaction. Pair with provideAppInitializer
    // so the Router subscription is set up before any nav happens.
    {
      provide: Sentry.TraceService,
      deps: [Router]
    },
    provideAppInitializer(() => {
      inject(Sentry.TraceService);
    })
  ]
};
