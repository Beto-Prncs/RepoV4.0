import { TestBed } from '@angular/core/testing';

import { CloudinaryImageService } from './cloudinary-image.service';

describe('CloudinaryImageService', () => {
  let service: CloudinaryImageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CloudinaryImageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
