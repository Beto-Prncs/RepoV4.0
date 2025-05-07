import { TestBed } from '@angular/core/testing';

import { StatisticsUtilsService } from './statistics-utils.service';

describe('StatisticsUtilsService', () => {
  let service: StatisticsUtilsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StatisticsUtilsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
