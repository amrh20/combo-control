import { Component } from '@angular/core';

@Component({
  selector: 'ctrl-financials',
  standalone: true,
  template: `
    <div class="page-placeholder">
      <h1>الماليات</h1>
      <p>سيتم بناء لوحة الماليات هنا قريباً.</p>
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
export class FinancialsComponent {}
