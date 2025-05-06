import { TestBed } from '@angular/core/testing';

import { ConfigStateService } from './config-state.service';

describe('ConfigStateService', () => {
  let service: ConfigStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfigStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
