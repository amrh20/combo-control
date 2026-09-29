import { Component } from '@angular/core';

@Component({
  selector: 'ctrl-fleet-management',
  standalone: true,
  template: `
    <div class="page-placeholder">
      <h1>إدارة الأسطول</h1>
      <p>سيتم بناء إدارة الأسطول هنا قريباً.</p>
    </div>
  `,
  styles: `
    .page-placeholder {
      padding: 24px 0;
      h1 {
        margin: 0 0 8px;
        font-family: 'Alexandria', sans-serif;
        font-size: 22px;
        font-weight: 700;
        color: var(--Combo-text-text-display);
      }
      p {
        margin: 0;
        color: var(--Combo-text-text-secondary-paragraph);
      }
    }
  `,
})
export class FleetManagementComponent {}
