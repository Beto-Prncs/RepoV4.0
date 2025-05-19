import { TestBed } from '@angular/core/testing';

import { ReportsFilterService } from './reports-filter.service';

describe('ReportsFilterService', () => {
  let service: ReportsFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReportsFilterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
