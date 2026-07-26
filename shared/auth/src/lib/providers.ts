import { APP_INITIALIZER, EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { AuthStore } from './auth.store';

function initAuth() {
  return () => {
    const auth = inject(AuthStore);
    auth.rehydrate();
  };
}

export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      multi: true,
    },
  ]);
}
