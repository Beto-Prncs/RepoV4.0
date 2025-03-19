import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminCompletedTasksComponent } from './admin-completed-tasks.component';

describe('AdminCompletedTasksComponent', () => {
  let component: AdminCompletedTasksComponent;
  let fixture: ComponentFixture<AdminCompletedTasksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCompletedTasksComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminCompletedTasksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
