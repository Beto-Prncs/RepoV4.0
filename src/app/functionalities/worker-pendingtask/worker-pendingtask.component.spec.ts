import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkerPendingtaskComponent } from './worker-pendingtask.component';

describe('WorkerPendingtaskComponent', () => {
  let component: WorkerPendingtaskComponent;
  let fixture: ComponentFixture<WorkerPendingtaskComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkerPendingtaskComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkerPendingtaskComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
