import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Subject, catchError, switchMap, takeWhile, timer } from 'rxjs';
import { CatalogImport, ImportPreview, ImportWriteBody, mergeImport } from '../../../core/models/catalog-import.model';
import { CatalogImportService } from '../../../core/services/catalog-import.service';
import { vendorErrorMessage } from '../../../core/services/vendor.service';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type WizardStep = 'upload' | 'preview' | 'progress' | 'done';

@Component({
  selector: 'ctrl-catalog-import',
  standalone: true,
  templateUrl: './catalog-import.component.html',
  styleUrl: './catalog-import.component.scss',
})
export class CatalogImportComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly imports = inject(CatalogImportService);
  private readonly vendorId = this.route.snapshot.paramMap.get('id')?.trim() ?? '';
  private readonly poll$ = new Subject<void>();

  readonly step = signal<WizardStep>('upload');
  readonly dragging = signal(false);
  readonly uploading = signal(false);
  readonly downloadingTemplate = signal(false);
  readonly downloadingErrors = signal(false);
  readonly previewing = signal(false);
  readonly committing = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly pollError = signal<string | null>(null);
  readonly fileLabel = signal('');
  readonly sheetName = signal('');
  readonly job = signal<CatalogImport | null>(null);
  readonly previewResult = signal<ImportPreview | null>(null);

  readonly progressPercent = computed(() => {
    const summary = this.job()?.summary;
    if (!summary || summary.total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((summary.processed / summary.total) * 100)));
  });

  readonly stepIndex = computed(() => {
    switch (this.step()) {
      case 'preview':
        return 1;
      case 'progress':
      case 'done':
        return 2;
      default:
        return 0;
    }
  });

  constructor() {
    if (!this.vendorId) {
      void this.router.navigate(['/vendors']);
      return;
    }

    this.poll$
      .pipe(
        switchMap(() => {
          const id = this.job()?.id;
          if (!id) {
            return EMPTY;
          }
          this.pollError.set(null);
          return timer(0, 2000).pipe(
            switchMap(() =>
              this.imports.get(this.vendorId, id).pipe(
                catchError((error: unknown) => {
                  this.pollError.set(this.fail(error, 'تعذر تحديث حالة الاستيراد.'));
                  return EMPTY;
                }),
              ),
            ),
            takeWhile((item) => item.status === 'RUNNING', true),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((job) => {
        this.job.set(mergeImport(this.job(), job));
        if (job.status === 'DONE' || job.status === 'FAILED') {
          this.step.set('done');
        }
      });
  }

  goBack(): void {
    void this.router.navigate(['/vendors', this.vendorId, 'catalog']);
  }

  downloadTemplate(): void {
    if (this.downloadingTemplate()) {
      return;
    }
    this.downloadingTemplate.set(true);
    this.uploadError.set(null);
    this.imports.downloadTemplate(this.vendorId).subscribe({
      next: (blob) => {
        this.downloadingTemplate.set(false);
        saveBlob(blob, 'catalog-import-template.xlsx');
      },
      error: (error: unknown) => {
        this.downloadingTemplate.set(false);
        this.uploadError.set(this.fail(error, 'تعذر تنزيل النموذج.'));
      },
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.onFile(event.dataTransfer?.files?.[0]);
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.onFile(input.files?.[0]);
    input.value = '';
  }

  onSheet(event: Event): void {
    this.sheetName.set((event.target as HTMLInputElement).value);
  }

  resetUpload(): void {
    this.step.set('upload');
    this.job.set(null);
    this.previewResult.set(null);
    this.fileLabel.set('');
    this.previewError.set(null);
    this.actionError.set(null);
    this.pollError.set(null);
  }

  commit(): void {
    const job = this.job();
    const body = job ? writeBody(job) : null;
    if (!job || !body || this.committing() || this.previewing()) {
      return;
    }
    this.committing.set(true);
    this.actionError.set(null);
    this.imports.commit(this.vendorId, job.id, body).subscribe({
      next: (updated) => {
        this.committing.set(false);
        this.job.set(mergeImport(this.job(), updated));
        if (updated.status === 'RUNNING') {
          this.step.set('progress');
          this.poll$.next();
          return;
        }
        this.step.set(updated.status === 'DONE' || updated.status === 'FAILED' ? 'done' : 'progress');
        if (updated.status !== 'DONE' && updated.status !== 'FAILED') {
          this.poll$.next();
        }
      },
      error: (error: unknown) => {
        this.committing.set(false);
        this.actionError.set(this.fail(error, 'تعذر بدء الاستيراد.'));
      },
    });
  }

  resume(): void {
    this.commit();
  }

  downloadErrors(): void {
    const job = this.job();
    if (!job || this.downloadingErrors()) {
      return;
    }
    this.downloadingErrors.set(true);
    this.actionError.set(null);
    this.imports.downloadErrors(this.vendorId, job.id).subscribe({
      next: (blob) => {
        this.downloadingErrors.set(false);
        saveBlob(blob, 'catalog-import-errors.xlsx');
      },
      error: (error: unknown) => {
        this.downloadingErrors.set(false);
        this.actionError.set(this.fail(error, 'تعذر تنزيل صفوف الأخطاء.'));
      },
    });
  }

  private onFile(file: File | undefined): void {
    if (!file || this.uploading()) {
      return;
    }
    const invalid = fileError(file);
    if (invalid) {
      this.uploadError.set(invalid);
      return;
    }
    this.uploadError.set(null);
    this.uploading.set(true);
    this.imports.upload(this.vendorId, file, this.sheetName()).subscribe({
      next: (job) => {
        this.uploading.set(false);
        this.job.set(job);
        this.fileLabel.set(file.name);
        this.previewResult.set(null);
        this.step.set('preview');
        this.loadPreview(job, file.name);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.uploadError.set(this.fail(error, 'تعذر رفع الملف.'));
      },
    });
  }

  private loadPreview(job: CatalogImport, fileName: string): void {
    const body = writeBody(job);
    if (!body) {
      this.previewError.set(unreadableHeadersMessage(job, fileName));
      return;
    }
    this.previewing.set(true);
    this.previewError.set(null);
    this.imports.preview(this.vendorId, job.id, body).subscribe({
      next: (result) => {
        this.previewing.set(false);
        this.previewResult.set(result);
      },
      error: (error: unknown) => {
        this.previewing.set(false);
        this.previewError.set(this.fail(error, 'تعذرت معاينة الملف.'));
      },
    });
  }

  private fail(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return vendorErrorMessage(error, fallback);
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return fallback;
  }
}

function unreadableHeadersMessage(job: CatalogImport, fileName: string): string {
  const lostArabic = fileName.toLowerCase().endsWith('.csv') || job.headers.some((header) => /^\?+$/.test(header.trim()));
  if (lostArabic) {
    return 'الحروف العربية في عناوين الملف اتمسحت لأن الملف اتحفظ CSV. افتح النموذج كـ Excel واحفظه .xlsx من غير تغيير النوع، وبعدين ارفعه.';
  }
  return 'عناوين الملف مش واضحة. استخدم نموذج الاستيراد من غير ما تغيّر صف العناوين.';
}

function writeBody(job: CatalogImport): ImportWriteBody | null {
  const fields = new Set(job.mapping.columns.map((column) => column.field));
  if (!fields.has('name') || !fields.has('price')) {
    return null;
  }
  return {
    columns: job.mapping.columns.map((column) => ({
      column: column.column,
      field: column.field,
      ...(column.name ? { name: column.name } : {}),
    })),
  };
}

function fileError(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
    return 'يُقبل ملف Excel ‏(.xlsx) أو CSV فقط.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'حجم الملف أكبر من 10 ميجابايت.';
  }
  return null;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
