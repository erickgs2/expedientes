import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { TreatmentType, TreatmentTypeUsage } from '@expedientes/shared-types';
import { TreatmentTypesService } from './treatment-types.service';
import {
  CONSENT_SECTIONS,
  ConsentSectionKey,
  ConsentSectionMeta,
  exampleBody,
} from './treatment-consent-sections';
import { TreatmentTypeUnsavedDialogComponent } from './treatment-type-unsaved-dialog.component';

export interface TreatmentTypeFormDialogData {
  treatmentType: TreatmentType | null;
  /** How widely the type is used, when known — shown beside the "available" switch. */
  usage?: TreatmentTypeUsage | null;
}

type FormKey = 'name' | ConsentSectionKey;

interface FormValue extends Record<ConsentSectionKey, string> {
  name: string;
  active: boolean;
}

/**
 * Create or edit a treatment type: its name, whether it is offered for new treatments, and the
 * five consent sections. Beside the form, a live sheet shows the sections as they will print on
 * the consent, highlighting the one being edited. Closing with unsaved changes asks first.
 */
@Component({
  selector: 'app-treatment-type-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslocoModule,
  ],
  template: `
    <div class="shell">
      <header class="top">
        <div class="heading">
          <p class="eyebrow">
            {{ (isEdit ? 'treatmentCatalog.form.editTitle' : 'treatmentCatalog.form.newTitle') | transloco }}
          </p>
          <h2 class="title">{{ titleName() || ('treatmentCatalog.form.untitled' | transloco) }}</h2>
        </div>
        <span class="progress" aria-live="polite">
          <span class="segments" aria-hidden="true">
            @for (s of sections; track s.key) {
              <span class="seg" [class.is-on]="filled()[s.key]"></span>
            }
          </span>
          {{ 'treatmentCatalog.form.progress' | transloco: { n: filledCount(), total: sections.length } }}
        </span>
        <button
          mat-icon-button
          type="button"
          (click)="requestClose()"
          [attr.aria-label]="'treatmentCatalog.form.close' | transloco"
        >
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <div class="body">
        <form class="form-col" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'treatmentCatalog.name' | transloco }}</mat-label>
            <input matInput formControlName="name" required (focus)="focused.set('name')" />
            @if (form.controls.name.hasError('required')) {
              <mat-error>{{ 'treatmentCatalog.form.nameRequired' | transloco }}</mat-error>
            }
          </mat-form-field>

          @if (isEdit) {
            <div class="available">
              <div>
                <p class="available-title">{{ 'treatmentCatalog.form.availableTitle' | transloco }}</p>
                <p class="hint">
                  @if (data.usage && data.usage.patientCount > 0) {
                    {{
                      (data.usage.patientCount === 1
                        ? 'treatmentCatalog.form.availableUsedOne'
                        : 'treatmentCatalog.form.availableUsedMany') | transloco: { n: data.usage.patientCount }
                    }}
                  } @else {
                    {{ 'treatmentCatalog.form.availableNone' | transloco }}
                  }
                </p>
              </div>
              <mat-slide-toggle
                formControlName="active"
                hideIcon
                [attr.aria-label]="'treatmentCatalog.form.availableTitle' | transloco"
              ></mat-slide-toggle>
            </div>
          }

          <h3 class="group-title">{{ 'treatmentCatalog.form.consentText' | transloco }}</h3>

          @for (s of sections; track s.key) {
            @if (isOpen(s)) {
              <mat-form-field appearance="outline" class="full">
                <mat-label>{{ s.labelKey | transloco }}</mat-label>
                <textarea
                  matInput
                  [id]="'tt-' + s.key"
                  [formControlName]="s.key"
                  [rows]="s.required ? 5 : 4"
                  [placeholder]="s.example"
                  [required]="s.required"
                  (focus)="focused.set(s.key)"
                ></textarea>
                <mat-hint>
                  {{ (s.required ? 'treatmentCatalog.form.required' : 'treatmentCatalog.form.optional') | transloco }}
                  · {{ 'treatmentCatalog.form.printsAs' | transloco: { heading: s.pdfHeading } }}
                </mat-hint>
                @if (s.required && form.controls[s.key].hasError('required')) {
                  <mat-error>{{ 'treatmentCatalog.form.descriptionRequired' | transloco }}</mat-error>
                }
              </mat-form-field>
            } @else {
              <div class="empty-section" [attr.aria-label]="s.labelKey | transloco">
                <p class="empty-label">
                  <strong>{{ s.labelKey | transloco }}</strong>
                  <span class="hint"> · {{ 'treatmentCatalog.form.optional' | transloco }}</span>
                </p>
                <div class="empty-row">
                  <span class="hint grow">{{ 'treatmentCatalog.form.emptySection' | transloco }}</span>
                  <button mat-stroked-button type="button" (click)="useExample(s)">
                    <mat-icon>content_copy</mat-icon>
                    {{ 'treatmentCatalog.form.useExample' | transloco }}
                  </button>
                  <button mat-button type="button" (click)="openSection(s)">
                    {{ 'treatmentCatalog.form.write' | transloco }}
                  </button>
                </div>
              </div>
            }
          }
        </form>

        <aside class="preview-col" [attr.aria-label]="'treatmentCatalog.form.previewTitle' | transloco">
          <div class="preview-head">
            <h3>{{ 'treatmentCatalog.form.previewTitle' | transloco }}</h3>
          </div>
          <ul class="checklist">
            @for (s of sections; track s.key) {
              <li [class.is-on]="filled()[s.key]">
                <span class="check" aria-hidden="true">
                  @if (filled()[s.key]) {
                    <mat-icon>check</mat-icon>
                  }
                </span>
                {{ s.labelKey | transloco }}
              </li>
            }
          </ul>

          <div class="paper" lang="es">
            <p class="paper-title">CONSENTIMIENTO INFORMADO</p>
            <p class="paper-subtitle">{{ titleName() || '—' }}</p>
            <p class="paper-slot">{{ 'treatmentCatalog.form.previewBefore' | transloco }}</p>
            @for (s of sections; track s.key) {
              @if (filled()[s.key] || focused() === s.key) {
                <div class="paper-section" [class.is-focused]="focused() === s.key">
                  <p class="paper-heading">{{ s.pdfHeading }}</p>
                  <p class="paper-text">{{ values()[s.key] || '…' }}</p>
                </div>
              }
            }
            <p class="paper-slot">{{ 'treatmentCatalog.form.previewAfter' | transloco }}</p>
            <div class="paper-signatures">
              <div><div class="sig-line"></div><p>PACIENTE</p></div>
              <div><div class="sig-line"></div><p>MÉDICO TRATANTE</p></div>
            </div>
          </div>
          <p class="hint small">{{ 'treatmentCatalog.form.previewNote' | transloco }}</p>
        </aside>
      </div>

      <footer class="bottom">
        <span class="hint grow" aria-live="polite">
          @if (saveError()) {
            <span class="error">{{ 'treatmentCatalog.form.saveError' | transloco }}</span>
          } @else if (dirtyCount() > 0) {
            {{ 'treatmentCatalog.form.unsaved' | transloco: { n: dirtyCount() } }}
          } @else {
            {{ 'treatmentCatalog.form.noChanges' | transloco }}
          }
        </span>
        <button mat-stroked-button type="button" (click)="requestClose()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="form.invalid || saving() || (isEdit && dirtyCount() === 0)"
          (click)="save()"
        >
          <mat-icon>check</mat-icon>
          {{ 'common.save' | transloco }}
        </button>
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .shell {
        display: flex;
        flex-direction: column;
        max-height: 94dvh;
        background: var(--mat-sys-surface);
      }
      .top,
      .bottom {
        display: flex;
        align-items: center;
        gap: 12px 16px;
        padding: 14px 24px;
        background: var(--mat-sys-surface-container-lowest);
      }
      .top {
        border-bottom: 1px solid var(--plate-line);
      }
      .bottom {
        border-top: 1px solid var(--plate-line);
        flex-wrap: wrap;
      }
      .heading {
        flex: 1;
        min-width: 0;
      }
      .eyebrow {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--mat-sys-on-surface-variant);
      }
      .title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.01em;
        overflow-wrap: anywhere;
      }
      .progress {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .segments {
        display: inline-flex;
        gap: 3px;
      }
      .seg {
        width: 14px;
        height: 6px;
        border-radius: 3px;
        background: var(--plate-line);
      }
      .seg.is-on {
        background: var(--mat-sys-on-surface);
      }
      .body {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .form-col {
        flex: 1 1 560px;
        min-width: 0;
        overflow: auto;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .full {
        width: 100%;
      }
      .available {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 8px;
        padding: 12px 14px;
        border: 1px solid var(--plate-line);
        border-radius: 12px;
        background: var(--mat-sys-surface-container-lowest);
      }
      .available p {
        margin: 0;
      }
      .available-title {
        font-weight: 600;
      }
      .group-title {
        margin: 10px 0 8px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--mat-sys-on-surface-variant);
      }
      .hint {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .hint.small {
        font-size: 12px;
        margin: 0;
      }
      .grow {
        flex: 1 1 200px;
      }
      .error {
        color: var(--mat-sys-error);
      }
      .empty-section {
        margin-bottom: 18px;
      }
      .empty-label {
        margin: 0 0 6px;
        font-size: 13px;
      }
      .empty-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        padding: 10px 12px;
        border: 1.5px dashed var(--plate-line-strong);
        border-radius: 10px;
      }
      .preview-col {
        flex: 0 0 420px;
        overflow: auto;
        padding: 20px;
        border-left: 1px solid var(--plate-line);
        background: var(--mat-sys-surface-container-low);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .preview-head h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
      }
      .checklist {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .checklist li {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .checklist li.is-on {
        color: var(--mat-sys-on-surface);
      }
      .check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 1.5px dashed var(--plate-line-strong);
        box-sizing: border-box;
      }
      .is-on .check {
        border: 0;
        background: var(--mat-sys-on-surface);
        color: var(--mat-sys-surface);
      }
      .check mat-icon {
        width: 13px;
        height: 13px;
        font-size: 13px;
      }
      /* A sheet of paper: always ink-on-white, in light and dark theme alike. */
      .paper {
        box-sizing: border-box;
        padding: 24px 26px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 4px;
        background: #ffffff;
        color: #1c1c19;
        font-size: 10.5px;
        line-height: 1.55;
      }
      .paper p {
        margin: 0;
      }
      .paper-title {
        text-align: center;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .paper-subtitle {
        margin-bottom: 10px !important;
        text-align: center;
        color: #42474e;
        overflow-wrap: anywhere;
      }
      .paper-slot {
        margin: 8px 0 !important;
        padding: 6px 8px;
        border: 1px dashed rgba(28, 28, 25, 0.32);
        color: #42474e;
        font-size: 9.5px;
      }
      .paper-section {
        margin: 8px 0;
        padding: 2px 4px;
        border-radius: 3px;
      }
      .paper-section.is-focused {
        box-shadow: 0 0 0 2px var(--mat-sys-primary);
      }
      .paper-heading {
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .paper-text {
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .paper-signatures {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 20px;
        margin-top: 16px;
        text-align: center;
      }
      .paper-signatures p {
        margin-top: 3px !important;
        font-weight: 700;
        font-size: 9.5px;
      }
      .sig-line {
        height: 30px;
        border-bottom: 1px solid #1c1c19;
      }
      /* Narrow screens: the preview goes under the form and the whole body scrolls. */
      @media (max-width: 900px) {
        .body {
          flex-direction: column;
          overflow: auto;
        }
        .form-col,
        .preview-col {
          flex: none;
          overflow: visible;
        }
        .preview-col {
          border-left: 0;
          border-top: 1px solid var(--plate-line);
        }
        .progress {
          display: none;
        }
      }
    `,
  ],
})
export class TreatmentTypeFormDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<TreatmentTypeFormDialogComponent>);
  private readonly treatmentTypesService = inject(TreatmentTypesService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly saving = signal(false);
  protected readonly saveError = signal(false);
  private confirmingClose = false;

  // `data` must be a field injected before any field initializer that reads it (`form` below) —
  // this project's established MAT_DIALOG_DATA field-ordering convention; see
  // RoleFormDialogComponent for the production-build-only TS2729 error this avoids.
  protected readonly data = inject<TreatmentTypeFormDialogData>(MAT_DIALOG_DATA);
  protected readonly isEdit = !!this.data.treatmentType;

  // The worked examples (CONSENT_SECTION_EXAMPLES) are shown as placeholders and offered as a
  // starting point, but never saved on their own — each section's real content is specific to
  // the procedure, and the risks and alternatives carry the consent's legal weight.
  protected readonly sections = CONSENT_SECTIONS;

  protected readonly form = this.fb.nonNullable.group({
    name: [this.data.treatmentType?.name ?? '', Validators.required],
    consentDescription: [this.data.treatmentType?.consentDescription ?? '', Validators.required],
    consentRisks: [this.data.treatmentType?.consentRisks ?? ''],
    consentAlternatives: [this.data.treatmentType?.consentAlternatives ?? ''],
    consentAftercare: [this.data.treatmentType?.consentAftercare ?? ''],
    consentContraindications: [this.data.treatmentType?.consentContraindications ?? ''],
    active: [this.data.treatmentType?.active ?? true],
  });

  private readonly initial: FormValue = this.form.getRawValue();

  /** The whole form as a signal, so the preview, progress and change count stay live. */
  protected readonly values = signal<FormValue>(this.initial);

  /** Which field has focus, so the preview can highlight the matching section. */
  protected readonly focused = signal<FormKey | null>(null);
  /** Optional sections the user chose to write in while they are still empty. */
  private readonly opened = signal<ReadonlySet<ConsentSectionKey>>(new Set());

  protected readonly titleName = computed(() => this.values().name.trim());

  protected readonly filled = computed(() => {
    const v = this.values();
    const out = {} as Record<ConsentSectionKey, boolean>;
    for (const s of CONSENT_SECTIONS) out[s.key] = !!v[s.key].trim();
    return out;
  });

  protected readonly filledCount = computed(
    () => Object.values(this.filled()).filter(Boolean).length
  );

  protected readonly dirtyCount = computed(() => {
    const v = this.values();
    const keys = Object.keys(this.initial) as (keyof FormValue)[];
    return keys.filter((k) => {
      const a = v[k];
      const b = this.initial[k];
      return typeof a === 'string' && typeof b === 'string' ? a.trim() !== b.trim() : a !== b;
    }).length;
  });

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.values.set(this.form.getRawValue()));
    // Escape and backdrop clicks go through the same unsaved-changes check as Cancel.
    this.dialogRef
      .keydownEvents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        void this.requestClose();
      });
    this.dialogRef
      .backdropClick()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.requestClose());
  }

  /** Required sections and any with text are always shown as fields; empty optional ones collapse. */
  protected isOpen(s: ConsentSectionMeta): boolean {
    return s.required || this.filled()[s.key] || this.opened().has(s.key) || !!this.initial[s.key];
  }

  protected openSection(s: ConsentSectionMeta): void {
    this.opened.update((set) => new Set(set).add(s.key));
    this.focusSection(s.key);
  }

  protected useExample(s: ConsentSectionMeta): void {
    this.form.controls[s.key].setValue(exampleBody(s.example));
    this.form.controls[s.key].markAsDirty();
    this.openSection(s);
  }

  private focusSection(key: ConsentSectionKey): void {
    afterNextRender(
      () => {
        const el = this.host.nativeElement.querySelector(`#tt-${key}`) as HTMLTextAreaElement | null;
        el?.focus();
        el?.select();
      },
      { injector: this.injector }
    );
  }

  protected async requestClose(): Promise<void> {
    if (this.saving() || this.confirmingClose) return;
    if (this.dirtyCount() > 0) {
      this.confirmingClose = true;
      const discard = await firstValueFrom(
        this.dialog.open(TreatmentTypeUnsavedDialogComponent).afterClosed()
      );
      this.confirmingClose = false;
      if (discard !== true) return;
    }
    this.dialogRef.close(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set(false);
    try {
      const raw = this.form.getRawValue();
      const sections = {
        consentDescription: raw.consentDescription.trim(),
        consentRisks: raw.consentRisks.trim() || null,
        consentAlternatives: raw.consentAlternatives.trim() || null,
        consentAftercare: raw.consentAftercare.trim() || null,
        consentContraindications: raw.consentContraindications.trim() || null,
      };
      if (this.data.treatmentType) {
        await this.treatmentTypesService.update(this.data.treatmentType.id, {
          name: raw.name.trim(),
          ...sections,
          active: raw.active,
        });
      } else {
        await this.treatmentTypesService.create(raw.name.trim(), sections);
      }
      this.dialogRef.close(true);
    } catch {
      this.saveError.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}
