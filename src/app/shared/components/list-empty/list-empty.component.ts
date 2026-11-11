import { Component, input } from '@angular/core';

@Component({
  selector: 'ctrl-list-empty',
  standalone: true,
  templateUrl: './list-empty.component.html',
  styleUrl: './list-empty.component.scss',
})
export class ListEmptyComponent {
  /** True when the list is empty because of search or filters. */
  filtered = input(false);
  icon = input('pi pi-inbox');
  filteredIcon = input('pi pi-search');
  title = input.required<string>();
  hint = input('');
  filteredTitle = input('لا توجد نتائج مطابقة');
  filteredHint = input('غيّر كلمة البحث أو أزل التصفية لعرض كل العناصر.');
}
