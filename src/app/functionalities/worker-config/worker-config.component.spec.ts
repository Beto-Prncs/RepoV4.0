import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkerConfigComponent } from './worker-config.component';

describe('WorkerConfigComponent', () => {
  let component: WorkerConfigComponent;
  let fixture: ComponentFixture<WorkerConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkerConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkerConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
