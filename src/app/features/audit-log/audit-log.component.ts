import { DatePipe } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs';
import {
  AUDIT_ENTITY_OPTIONS,
  AuditLogEntry,
  auditActorRoleLabel,
  auditEntityLabel,
  auditSnapshotsMissing,
  buildAuditDiff,
  formatAuditJson,
  isAuditEntity,
} from '../../core/models/audit.model';
import { AuditService } from '../../core/services/audit.service';
import { readControlValue } from '../../shared/utils/list-filter';

const PAGE_SIZE = 20;

@Component({
  selector: 'ctrl-audit-log',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent {
  private readonly auditService = inject(AuditService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loads = new Subject<void>();
  private readonly entityIdInput = new Subject<string>();

  readonly entityOptions = AUDIT_ENTITY_OPTIONS;
  readonly entityLabel = auditEntityLabel;
  readonly actorRoleLabel = auditActorRoleLabel;
  readonly formatJson = formatAuditJson;

  readonly entityFilter = signal('');
  readonly entityIdFilter = signal('');
  readonly logs = signal<AuditLogEntry[]>([]);
  readonly nextCursor = signal<string | null>(null);
  /** Cursor that loaded the current page. Absent on the first page. */
  readonly cursor = signal<string | undefined>(undefined);
  /** Cursors of the pages before this one, so Back can walk to the first page. */
  readonly backStack = signal<(string | undefined)[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly selected = signal<AuditLogEntry | null>(null);

  readonly pageNumber = computed(() => this.backStack().length + 1);
  readonly diffRows = computed(() => {
    const entry = this.selected();
    return entry ? buildAuditDiff(entry.before, entry.after) : [];
  });
  readonly snapshotsMissing = computed(() => {
    const entry = this.selected();
    return entry ? auditSnapshotsMissing(entry.before, entry.after) : false;
  });

  constructor() {
    this.loads
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.loadError.set(null);
          this.logs.set([]);
          const entity = this.entityFilter();
          const entityId = this.entityIdFilter().trim();
          return this.auditService
            .getLogs(entity || undefined, entityId || undefined, this.cursor(), PAGE_SIZE)
            .pipe(
              catchError(() => {
                this.loading.set(false);
                this.logs.set([]);
                this.nextCursor.set(null);
                this.loadError.set('تعذر تحميل سجل التعديلات.');
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.logs.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      });

    this.entityIdInput
      .pipe(
        debounceTime(300),
        map((value) => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.resetPage());

    this.loads.next();
  }

  @HostListener('document:keydown.escape')
  closeDiff(): void {
    this.selected.set(null);
  }

  reload(): void {
    this.loads.next();
  }

  onEntityChange(event: Event): void {
    const value = readControlValue(event);
    this.entityFilter.set(isAuditEntity(value) ? value : '');
    this.resetPage();
  }

  onEntityId(event: Event): void {
    const value = readControlValue(event);
    this.entityIdFilter.set(value);
    this.entityIdInput.next(value);
  }

  openDiff(entry: AuditLogEntry): void {
    this.selected.set(entry);
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeDiff();
    }
  }

  goNext(): void {
    const next = this.nextCursor();
    if (!next || this.loading()) {
      return;
    }
    this.selected.set(null);
    this.backStack.update((stack) => [...stack, this.cursor()]);
    this.cursor.set(next);
    this.loads.next();
  }

  goBack(): void {
    const stack = this.backStack();
    if (stack.length === 0 || this.loading()) {
      return;
    }
    this.selected.set(null);
    this.cursor.set(stack[stack.length - 1]);
    this.backStack.set(stack.slice(0, -1));
    this.loads.next();
  }

  diffKindLabel(kind: 'added' | 'removed' | 'changed'): string {
    if (kind === 'added') {
      return 'إضافة';
    }
    if (kind === 'removed') {
      return 'حذف';
    }
    return 'تعديل';
  }

  private resetPage(): void {
    this.selected.set(null);
    this.backStack.set([]);
    this.cursor.set(undefined);
    this.loads.next();
  }
}
