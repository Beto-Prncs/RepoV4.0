import { TestBed } from '@angular/core/testing';

import { ConfigAnimationService } from './config-animation.service';

describe('ConfigAnimationService', () => {
  let service: ConfigAnimationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfigAnimationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
