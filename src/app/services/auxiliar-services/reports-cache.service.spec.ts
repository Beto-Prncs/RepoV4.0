import { TestBed } from '@angular/core/testing';

import { ReportsCacheService } from './reports-cache.service';

describe('ReportsCacheService', () => {
  let service: ReportsCacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReportsCacheService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
