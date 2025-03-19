import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OptionsAdminComponent } from './options-admin.component';

describe('OptionsAdminComponent', () => {
  let component: OptionsAdminComponent;
  let fixture: ComponentFixture<OptionsAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionsAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OptionsAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
