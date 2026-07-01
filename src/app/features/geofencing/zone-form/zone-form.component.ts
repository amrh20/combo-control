import { Component, inject, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { CITY_OPTIONS, CreateZonePayload } from '../models/zone.model';

/** The form-driven slice of the final payload (everything except geometry). */
export type ZoneFormValue = Omit<CreateZonePayload, 'geometry'>;

@Component({
  selector: 'ctrl-zone-form',
  standalone: true,
  imports: [
    NgClass,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    InputNumberModule,
    ToggleSwitchModule,
  ],
  templateUrl: './zone-form.component.html',
  styleUrl: './zone-form.component.scss',
})
export class GeofenceZoneFormComponent {
  private readonly fb = inject(FormBuilder);

  /** Whether a valid polygon has been drawn on the map. */
  readonly geometryReady = input(false);

  /** Emitted on a valid submit with the form fields. */
  readonly saveZone = output<ZoneFormValue>();

  readonly cityOptions = CITY_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    name:         ['', [Validators.required, Validators.minLength(2)]],
    city:         ['', Validators.required],
    deliveryFee:  [0, [Validators.required, Validators.min(0)]],
    minimumOrder: [0, [Validators.required, Validators.min(0)]],
    isActive:     [true],
  });

  submit(): void {
    if (this.form.invalid || !this.geometryReady()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saveZone.emit(this.form.getRawValue());
  }

  /** Helper for template error display. */
  invalid(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.invalid && (c.dirty || c.touched);
  }
}
