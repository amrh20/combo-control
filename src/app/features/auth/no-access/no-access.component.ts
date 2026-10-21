import { Component } from '@angular/core';

@Component({
  selector: 'ctrl-no-access',
  standalone: true,
  template: `
    <section class="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-20 text-center">
      <span
        class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500"
        aria-hidden="true"
      >
        <i class="pi pi-lock text-xl"></i>
      </span>
      <h1 class="m-0 text-[22px] font-bold text-[var(--Combo-text-text-display)]">
        لا توجد صلاحيات
      </h1>
      <p class="m-0 text-sm leading-relaxed text-gray-500">
        هذا الحساب لا يملك صلاحية عرض أي صفحة في لوحة التحكم.
      </p>
    </section>
  `,
})
export class NoAccessComponent {}
