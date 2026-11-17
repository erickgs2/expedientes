import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { AllergyOption } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { PatientsService } from '../patient-drive/patients.service';
import { HistoriaClinicaService } from './historia-clinica.service';

const STEPS = ['personalInfo', 'medicalInfo', 'personalHistory', 'familyHistory'] as const;

/**
 * The historia clínica as a guided interview: four short steps instead of one long accordion, big
 * answers to tap for the closed questions, and the whole record saved each time the doctor moves
 * on — so leaving mid-interview loses at most the step in progress. `?paso=N` opens a given step,
 * which is how the overview's section links land on the right one.
 *
 * Read-only users get the same steps with every field disabled and nothing to save.
 */
@Component({
  selector: 'app-historia-clinica-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatIconModule,
    TranslocoModule,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else {
      <header class="interview-head">
        <div class="titles">
          <p class="eyebrow">{{ 'historiaClinica.title' | transloco }}</p>
          <h1>{{ patient()?.fullName }}</h1>
          <p class="status" aria-live="polite">
            @if (saving()) {
              {{ 'historiaClinica.interview.saving' | transloco }}
            } @else if (lastSavedAt(); as at) {
              {{ 'historiaClinica.interview.savedAt' | transloco: { time: at } }}
            } @else if (!canEdit) {
              {{ 'historiaClinica.interview.readOnly' | transloco }}
            } @else {
              {{ 'historiaClinica.interview.autosaveHint' | transloco }}
            }
          </p>
        </div>
        @if (allergyNames().length > 0) {
          <span class="allergy-chip">
            <mat-icon aria-hidden="true">warning</mat-icon>
            {{ 'historiaClinica.fields.alergias' | transloco }}: {{ allergyNames().join(', ') }}
          </span>
        }
      </header>

      <ol class="stepper" [attr.aria-label]="'historiaClinica.interview.steps' | transloco">
        @for (s of steps; track s; let i = $index) {
          <li>
            <button
              type="button"
              class="step"
              [class.is-current]="step() === i"
              [class.is-done]="sectionFilled()[i]"
              [attr.aria-current]="step() === i ? 'step' : null"
              (click)="goTo(i)"
            >
              <span class="bar" aria-hidden="true"></span>
              <span class="step-label">
                {{ i + 1 }} · {{ 'historiaClinica.sections.' + s | transloco }}
                @if (sectionFilled()[i]) {
                  <span aria-hidden="true">✓</span>
                }
              </span>
            </button>
          </li>
        }
      </ol>

      <form [formGroup]="form" (ngSubmit)="next()" class="interview">
        <h2>{{ 'historiaClinica.sections.' + steps[step()] | transloco }}</h2>
        <p class="hint">{{ 'historiaClinica.interview.hint.' + steps[step()] | transloco }}</p>

        @switch (step()) {
          @case (0) {
            <div class="grid">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'patientDrive.phone' | transloco }}</mat-label>
                <input matInput type="tel" autocomplete="tel" formControlName="phone" />
                <mat-hint>
                  @if (patient()?.contactPatient; as c) {
                    {{ 'companions.noticesVia' | transloco: { name: c.fullName, phone: c.phone } }}
                  } @else {
                    {{ 'patientDrive.phoneHint' | transloco }}
                  }
                </mat-hint>
                @if (form.controls.phone.hasError('required') && form.controls.phone.touched) {
                  <mat-error>{{ 'patientDrive.phoneRequired' | transloco }}</mat-error>
                }
              </mat-form-field>
              <!-- The CURP and phone live on the Patient record; this is where they get corrected. -->
              <mat-form-field appearance="outline">
                <mat-label>{{ 'patientDrive.curp' | transloco }}</mat-label>
                <input matInput formControlName="documentId" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'historiaClinica.fields.fechaNacimiento' | transloco }}</mat-label>
                <input matInput type="date" formControlName="fechaNacimiento" />
                @if (edad() !== null) {
                  <mat-hint>{{ 'historiaClinica.fields.edad' | transloco }}: {{ edad() }}</mat-hint>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'historiaClinica.fields.ocupacion' | transloco }}</mat-label>
                <input matInput formControlName="ocupacion" />
              </mat-form-field>
            </div>

            <fieldset class="choice">
              <legend>{{ 'historiaClinica.fields.sexo' | transloco }}</legend>
              <mat-button-toggle-group formControlName="sexo" class="toggles" hideSingleSelectionIndicator>
                <mat-button-toggle value="femenino">{{ 'historiaClinica.sexoOptions.femenino' | transloco }}</mat-button-toggle>
                <mat-button-toggle value="masculino">{{ 'historiaClinica.sexoOptions.masculino' | transloco }}</mat-button-toggle>
                <mat-button-toggle value="otro">{{ 'historiaClinica.sexoOptions.otro' | transloco }}</mat-button-toggle>
              </mat-button-toggle-group>
            </fieldset>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.alergias' | transloco }}</mat-label>
              <mat-chip-grid #allergyGrid [disabled]="!canEdit">
                @for (name of allergyNames(); track name) {
                  <mat-chip-row (removed)="removeAllergy(name)">
                    {{ name }}
                    <button matChipRemove type="button" [attr.aria-label]="name"><mat-icon>cancel</mat-icon></button>
                  </mat-chip-row>
                }
              </mat-chip-grid>
              <input
                [placeholder]="'historiaClinica.allergyPlaceholder' | transloco"
                [matChipInputFor]="allergyGrid"
                [matAutocomplete]="allergyAuto"
                [(ngModel)]="allergyInput"
                [ngModelOptions]="{ standalone: true }"
                [disabled]="!canEdit"
                (ngModelChange)="onAllergyInputChange($event)"
                (matChipInputTokenEnd)="addAllergyFromInput($event)"
              />
              <mat-autocomplete #allergyAuto="matAutocomplete" (optionSelected)="selectAllergyOption($event)">
                @for (option of allergyOptions(); track option.id) {
                  <mat-option [value]="option.name">{{ option.name }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.queQuiereElPaciente' | transloco }}</mat-label>
              <textarea matInput rows="3" formControlName="queQuiereElPaciente"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.queNecesitaElPaciente' | transloco }}</mat-label>
              <textarea matInput rows="3" formControlName="queNecesitaElPaciente"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.atributosEmocionales' | transloco }}</mat-label>
              <textarea matInput rows="2" formControlName="atributosEmocionales"></textarea>
            </mat-form-field>
          }
          @case (1) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.enfermedadesActuales' | transloco }}</mat-label>
              <textarea matInput rows="3" formControlName="enfermedadesActuales"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.medicamentosAcne3Meses' | transloco }}</mat-label>
              <textarea matInput rows="2" formControlName="medicamentosAcne3Meses"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.cirugiasEsteticasAnteriores' | transloco }}</mat-label>
              <textarea matInput rows="3" formControlName="cirugiasEsteticasAnteriores"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.rutinaCuidadoFacial' | transloco }}</mat-label>
              <textarea matInput rows="3" formControlName="rutinaCuidadoFacial"></textarea>
            </mat-form-field>
          }
          @case (2) {
            <fieldset class="choice">
              <legend>{{ 'historiaClinica.fields.posibilidadEmbarazo' | transloco }}</legend>
              <mat-button-toggle-group formControlName="posibilidadEmbarazo" class="toggles" hideSingleSelectionIndicator>
                <mat-button-toggle value="si">{{ 'common.yes' | transloco }}</mat-button-toggle>
                <mat-button-toggle value="no">{{ 'common.no' | transloco }}</mat-button-toggle>
                <mat-button-toggle value="no_aplica">{{ 'historiaClinica.notApplicable' | transloco }}</mat-button-toggle>
              </mat-button-toggle-group>
            </fieldset>
            <div class="grid">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'historiaClinica.fields.consumoAlcohol' | transloco }}</mat-label>
                <input matInput formControlName="consumoAlcohol" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'historiaClinica.fields.consumoTabaco' | transloco }}</mat-label>
                <input matInput formControlName="consumoTabaco" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'historiaClinica.fields.consumoDrogas' | transloco }}</mat-label>
                <input matInput formControlName="consumoDrogas" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'historiaClinica.fields.tipoFrecuenciaEjercicio' | transloco }}</mat-label>
                <input matInput formControlName="tipoFrecuenciaEjercicio" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'historiaClinica.fields.vacunas' | transloco }}</mat-label>
                <input matInput formControlName="vacunas" />
              </mat-form-field>
            </div>
          }
          @case (3) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'historiaClinica.fields.antecedentesHeredofamiliares' | transloco }}</mat-label>
              <textarea matInput rows="6" formControlName="antecedentesHeredofamiliares"></textarea>
            </mat-form-field>
          }
        }

        <div class="action-bar">
          <button mat-stroked-button type="button" [disabled]="saving()" (click)="previous()">
            {{ (step() === 0 ? 'historiaClinica.interview.close' : 'historiaClinica.interview.previous') | transloco }}
          </button>
          <span class="count">{{ 'historiaClinica.interview.stepOf' | transloco: { n: step() + 1, total: steps.length } }}</span>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ nextLabel() | transloco }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 880px;
        margin: 0 auto;
      }
      .interview-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px 16px;
        margin-bottom: 20px;
      }
      .titles h1 {
        margin: 0;
      }
      .eyebrow {
        margin: 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .status {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .allergy-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 32px;
        padding: 0 12px;
        border: 1px solid var(--mat-sys-error);
        border-radius: 16px;
        color: var(--mat-sys-error);
        font-size: 13px;
        font-weight: 600;
      }
      .allergy-chip mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .stepper {
        list-style: none;
        margin: 0 0 28px;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .step {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        min-height: 44px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--mat-sys-on-surface-variant);
        font: inherit;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      .bar {
        display: block;
        height: 4px;
        border-radius: 2px;
        background: var(--plate-line);
      }
      .step.is-done .bar {
        background: var(--mat-sys-on-surface-variant);
      }
      .step.is-current {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .step.is-current .bar {
        background: var(--plate-mark);
      }
      .interview h2 {
        margin: 0;
        font-size: 1.875rem;
        font-weight: 700;
        letter-spacing: -0.015em;
      }
      .hint {
        margin: 4px 0 24px;
        color: var(--mat-sys-on-surface-variant);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 4px 16px;
      }
      .full-width {
        width: 100%;
      }
      .choice {
        margin: 0 0 20px;
        padding: 0;
        border: 0;
      }
      .choice legend {
        margin-bottom: 8px;
        font-weight: 600;
      }
      .toggles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        width: 100%;
        border-radius: var(--plate-radius);
      }
      .toggles .mat-button-toggle {
        min-height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .action-bar {
        position: sticky;
        bottom: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 24px -16px 0;
        padding: 12px 16px;
        border-top: 1px solid var(--plate-line);
        background: var(--mat-sys-surface);
      }
      .action-bar button {
        min-height: 48px;
      }
      .count {
        flex: 1;
        text-align: center;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 599px) {
        .stepper .step-label {
          display: none;
        }
      }
    `,
  ],
})
export class HistoriaClinicaFormComponent implements OnInit {
  private readonly historiaClinicaService = inject(HistoriaClinicaService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly fb = inject(FormBuilder);
  private readonly patientsService = inject(PatientsService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly steps = STEPS;
  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly exists = signal(false);
  protected readonly step = signal(0);
  protected readonly lastSavedAt = signal<string | null>(null);
  protected readonly allergyOptions = signal<AllergyOption[]>([]);
  protected readonly allergyNames = signal<string[]>([]);
  protected allergyInput = '';
  /** Allergies live outside the form group, so their edits are tracked separately. */
  private allergiesDirty = false;
  protected canEdit = false;

  protected readonly form = this.fb.group({
    documentId: [''],
    // Required, unlike the CURP: the column is non-null and a blank number would quietly stop this
    // patient's WhatsApp appointment reminders.
    phone: ['', Validators.required],
    ocupacion: [''],
    fechaNacimiento: [''],
    sexo: [''],
    queQuiereElPaciente: [''],
    queNecesitaElPaciente: [''],
    atributosEmocionales: [''],
    enfermedadesActuales: [''],
    medicamentosAcne3Meses: [''],
    cirugiasEsteticasAnteriores: [''],
    rutinaCuidadoFacial: [''],
    consumoAlcohol: [''],
    consumoTabaco: [''],
    consumoDrogas: [''],
    tipoFrecuenciaEjercicio: [''],
    vacunas: [''],
    posibilidadEmbarazo: [''],
    antecedentesHeredofamiliares: [''],
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  /** Fields each step holds, for the "✓" in the stepper. */
  private static readonly STEP_FIELDS: string[][] = [
    ['ocupacion', 'fechaNacimiento', 'sexo', 'queQuiereElPaciente', 'queNecesitaElPaciente', 'atributosEmocionales'],
    ['enfermedadesActuales', 'medicamentosAcne3Meses', 'cirugiasEsteticasAnteriores', 'rutinaCuidadoFacial'],
    ['consumoAlcohol', 'consumoTabaco', 'consumoDrogas', 'tipoFrecuenciaEjercicio', 'vacunas', 'posibilidadEmbarazo'],
    ['antecedentesHeredofamiliares'],
  ];

  protected readonly sectionFilled = computed(() => {
    const value = this.formValue() as Record<string, string | null | undefined>;
    return HistoriaClinicaFormComponent.STEP_FIELDS.map((fields) =>
      fields.every((f) => String(value[f] ?? '').trim() !== '')
    );
  });

  protected readonly edad = computed(() => {
    const value = this.formValue().fechaNacimiento;
    if (!value) return null;
    // Parse as local midnight, not UTC midnight (`new Date('YYYY-MM-DD')` parses as UTC, but
    // getMonth()/getDate() below read back in local time — for negative UTC-offset timezones
    // that mismatch can shift the date back a day near a month boundary).
    const birth = new Date(`${value}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const hasHadBirthdayThisYear =
      now.getMonth() > birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    if (!hasHadBirthdayThisYear) age -= 1;
    return age;
  });

  protected readonly nextLabel = computed(() => {
    const last = this.step() === STEPS.length - 1;
    if (!this.canEdit) return last ? 'historiaClinica.interview.finishReadOnly' : 'historiaClinica.interview.next';
    return last ? 'historiaClinica.interview.finish' : 'historiaClinica.interview.saveNext';
  });

  async ngOnInit(): Promise<void> {
    const requested = Number(this.route.snapshot.queryParamMap.get('paso'));
    if (Number.isInteger(requested) && requested >= 1 && requested <= STEPS.length) {
      this.step.set(requested - 1);
    }

    const patient = this.patient();
    if (!patient) {
      this.loading.set(false);
      return;
    }
    // Patched before the historia load on purpose: that returns early when the patient has no
    // clinical history yet, and the CURP lives on the patient record — a brand-new patient is
    // exactly who still needs to have theirs filled in.
    this.form.patchValue({ documentId: patient.documentId ?? '', phone: patient.phone });
    // A patient reached through a companion may have no phone of their own.
    if (patient.contactPatientId) {
      this.form.controls.phone.clearValidators();
      this.form.controls.phone.updateValueAndValidity();
    }

    // `finally`, not a trailing `set(false)`: Angular does not await `ngOnInit`, so a rejected
    // load would otherwise leave the page stuck on "Cargando...". The error itself is reported by
    // `errorInterceptor`.
    try {
      const historia = await this.historiaClinicaService.get(patient.id);
      this.exists.set(historia !== null);
      if (historia) {
        this.form.patchValue({
          ocupacion: historia.ocupacion ?? '',
          fechaNacimiento: historia.fechaNacimiento ? historia.fechaNacimiento.substring(0, 10) : '',
          sexo: historia.sexo ?? '',
          queQuiereElPaciente: historia.queQuiereElPaciente ?? '',
          queNecesitaElPaciente: historia.queNecesitaElPaciente ?? '',
          atributosEmocionales: historia.atributosEmocionales ?? '',
          enfermedadesActuales: historia.enfermedadesActuales ?? '',
          medicamentosAcne3Meses: historia.medicamentosAcne3Meses ?? '',
          cirugiasEsteticasAnteriores: historia.cirugiasEsteticasAnteriores ?? '',
          rutinaCuidadoFacial: historia.rutinaCuidadoFacial ?? '',
          consumoAlcohol: historia.consumoAlcohol ?? '',
          consumoTabaco: historia.consumoTabaco ?? '',
          consumoDrogas: historia.consumoDrogas ?? '',
          tipoFrecuenciaEjercicio: historia.tipoFrecuenciaEjercicio ?? '',
          vacunas: historia.vacunas ?? '',
          posibilidadEmbarazo: historia.posibilidadEmbarazo ?? '',
          antecedentesHeredofamiliares: historia.antecedentesHeredofamiliares ?? '',
        });
        this.allergyNames.set(historia.allergies.map((entry) => entry.allergy.name));
      }
    } finally {
      this.canEdit = this.auth.hasPermission('historia-clinica', this.exists() ? 'edit' : 'create');
      if (!this.canEdit) this.form.disable();
      this.form.markAsPristine();
      this.loading.set(false);
    }
  }

  // --- navigation ---------------------------------------------------------------------------

  protected async goTo(index: number): Promise<void> {
    if (index === this.step()) return;
    if (!(await this.saveIfNeeded())) return;
    this.setStep(index);
  }

  protected async next(): Promise<void> {
    if (!(await this.saveIfNeeded())) return;
    if (this.step() < STEPS.length - 1) {
      this.setStep(this.step() + 1);
    } else {
      await this.leave();
    }
  }

  protected async previous(): Promise<void> {
    if (!(await this.saveIfNeeded())) return;
    if (this.step() === 0) {
      await this.leave();
    } else {
      this.setStep(this.step() - 1);
    }
  }

  private setStep(index: number): void {
    this.step.set(index);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { paso: index + 1 },
      replaceUrl: true,
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private async leave(): Promise<void> {
    const patient = this.patient();
    if (patient) await this.router.navigate(['/pacientes', patient.id, 'resumen']);
  }

  // --- allergies ----------------------------------------------------------------------------

  protected async onAllergyInputChange(value: string): Promise<void> {
    this.allergyOptions.set(
      value.trim() ? await this.historiaClinicaService.searchAllergies(value) : []
    );
  }

  protected addAllergyFromInput(event: MatChipInputEvent): void {
    const value = event.value.trim();
    if (value) this.addAllergy(value);
    event.chipInput.clear();
    this.allergyInput = '';
    this.allergyOptions.set([]);
  }

  protected selectAllergyOption(event: MatAutocompleteSelectedEvent): void {
    this.addAllergy(event.option.viewValue);
    this.allergyInput = '';
    this.allergyOptions.set([]);
  }

  private addAllergy(name: string): void {
    if (this.allergyNames().includes(name)) return;
    this.allergyNames.update((names) => [...names, name]);
    this.allergiesDirty = true;
  }

  protected removeAllergy(name: string): void {
    this.allergyNames.update((names) => names.filter((n) => n !== name));
    this.allergiesDirty = true;
  }

  // --- saving -------------------------------------------------------------------------------

  /** Saves when something changed; returns whether it is safe to move on. */
  private async saveIfNeeded(): Promise<boolean> {
    if (!this.canEdit) return true;
    if (!this.form.dirty && !this.allergiesDirty) return true;
    return this.save();
  }

  /**
   * Writes the whole historia clínica, then the CURP and phone on the patient record. Stops rather
   * than save partially when the phone is blank: otherwise the clinical history would be written
   * while the phone change was quietly dropped.
   */
  private async save(): Promise<boolean> {
    const patient = this.patient();
    if (!patient) return false;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // The only required field is on the first step: take the doctor there to fix it.
      if (this.form.controls.phone.invalid && this.step() !== 0) this.setStep(0);
      return false;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const clean = (v: string | null | undefined) => v?.trim() || null;
    const input = {
      ocupacion: clean(raw.ocupacion),
      fechaNacimiento: clean(raw.fechaNacimiento),
      sexo: clean(raw.sexo),
      queQuiereElPaciente: clean(raw.queQuiereElPaciente),
      queNecesitaElPaciente: clean(raw.queNecesitaElPaciente),
      atributosEmocionales: clean(raw.atributosEmocionales),
      enfermedadesActuales: clean(raw.enfermedadesActuales),
      medicamentosAcne3Meses: clean(raw.medicamentosAcne3Meses),
      cirugiasEsteticasAnteriores: clean(raw.cirugiasEsteticasAnteriores),
      rutinaCuidadoFacial: clean(raw.rutinaCuidadoFacial),
      consumoAlcohol: clean(raw.consumoAlcohol),
      consumoTabaco: clean(raw.consumoTabaco),
      consumoDrogas: clean(raw.consumoDrogas),
      tipoFrecuenciaEjercicio: clean(raw.tipoFrecuenciaEjercicio),
      vacunas: clean(raw.vacunas),
      posibilidadEmbarazo: clean(raw.posibilidadEmbarazo),
      antecedentesHeredofamiliares: clean(raw.antecedentesHeredofamiliares),
      allergyNames: this.allergyNames(),
    };
    const documentId = raw.documentId?.trim() ?? '';
    const phone = raw.phone?.trim() ?? '';

    try {
      if (this.exists()) {
        await this.historiaClinicaService.update(patient.id, input);
      } else {
        await this.historiaClinicaService.create(patient.id, input);
        this.exists.set(true);
      }
      // Only the patient fields that actually changed are sent, so an ordinary step does not
      // generate a pointless write and audit entry against the patient.
      const changes: { documentId?: string; phone?: string } = {};
      if (documentId !== (patient.documentId ?? '')) changes.documentId = documentId;
      if (phone && phone !== patient.phone) changes.phone = phone;
      if (Object.keys(changes).length > 0) {
        const updated = await this.patientsService.updateDetails(patient.id, changes);
        this.activePatient.select(updated);
      }
      this.form.markAsPristine();
      this.allergiesDirty = false;
      this.lastSavedAt.set(
        new Date().toLocaleTimeString(this.transloco.getActiveLang(), {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
      return true;
    } catch (error) {
      // `errorInterceptor` already tells the user; stay on the step so nothing typed is lost.
      console.error('Failed to save historia clínica', error);
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
