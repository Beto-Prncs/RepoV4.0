import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { adminLevelGuard } from './admin-level.guard';

describe('adminLevelGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => adminLevelGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
