import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportsInterfaceComponent } from './reports-interface.component';

describe('ReportsInterfaceComponent', () => {
  let component: ReportsInterfaceComponent;
  let fixture: ComponentFixture<ReportsInterfaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsInterfaceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportsInterfaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
