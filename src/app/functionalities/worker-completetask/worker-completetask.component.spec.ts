import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkerCompletetaskComponent

describe('WorkerCompletetaskComponent', () => {
  let component: WorkerCompletetaskComponent;
  let fixture: ComponentFixture<WorkerCompletetaskComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkerCompletetaskComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkerCompletetaskComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});