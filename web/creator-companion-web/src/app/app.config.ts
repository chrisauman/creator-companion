import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
