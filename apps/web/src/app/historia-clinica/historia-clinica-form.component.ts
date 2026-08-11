import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import type { AllergyOption } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { PatientsService } from '../patient-drive/patients.service';
import { HistoriaClinicaService } from './historia-clinica.service';
import {
  AppointmentFormComponent,
  type AppointmentFormDialogData,
} from '../appointments/appointment-form.component';

@Component({
  selector: 'app-historia-clinica-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatExpansionModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatIconModule,
    MatDialogModule,
    RouterLink,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else {
      <h1>{{ 'historiaClinica.title' | transloco }} — {{ patient()?.fullName }}</h1>
      <nav class="quick-actions" [attr.aria-label]="'historiaClinica.quickActions' | transloco">
        <a *appHasPermission="'valoracion:view'" class="quick-action" routerLink="/valoracion">
          <mat-icon aria-hidden="true">assignment</mat-icon>
          <span>{{ 'historiaClinica.viewValoraciones' | transloco }}</span>
        </a>
        <a *appHasPermission="'valoracion:view'" class="quick-action" routerLink="/photos">
          <mat-icon aria-hidden="true">photo_library</mat-icon>
          <span>{{ 'photoTimeline.navLink' | transloco }}</span>
        </a>
        <a *appHasPermission="'treatments:view'" class="quick-action" routerLink="/treatments">
          <mat-icon aria-hidden="true">medical_services</mat-icon>
          <span>{{ 'historiaClinica.viewTreatments' | transloco }}</span>
        </a>
        <button
          *appHasPermission="'appointments:create'"
          class="quick-action"
          type="button"
          (click)="openAppointmentDialog()"
        >
          <mat-icon aria-hidden="true">event_available</mat-icon>
          <span>{{ 'historiaClinica.scheduleAppointment' | transloco }}</span>
        </button>
      </nav>
      <form [formGroup]="form" (ngSubmit)="save()">
        <!-- mat-accordion (multi=false by default) keeps a single section open at a time -->
        <mat-accordion>
        <mat-expansion-panel [expanded]="true">
          <mat-expansion-panel-header>
            <mat-panel-title>{{ 'historiaClinica.sections.personalInfo' | transloco }}</mat-panel-title>
          </mat-expansion-panel-header>

          <!-- Lives on the Patient record, not the clinical history, but this is where it gets
               filled in: it is optional at registration, so most patients arrive without one. -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'patientDrive.curp' | transloco }}</mat-label>
            <input matInput formControlName="documentId" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.ocupacion' | transloco }}</mat-label>
            <input matInput formControlName="ocupacion" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.fechaNacimiento' | transloco }}</mat-label>
            <input matInput type="date" formControlName="fechaNacimiento" />
          </mat-form-field>

          @if (edad() !== null) {
            <p class="computed-field">{{ 'historiaClinica.fields.edad' | transloco }}: {{ edad() }}</p>
          }

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.sexo' | transloco }}</mat-label>
            <mat-select formControlName="sexo">
              <mat-option value="femenino">{{ 'historiaClinica.sexoOptions.femenino' | transloco }}</mat-option>
              <mat-option value="masculino">{{ 'historiaClinica.sexoOptions.masculino' | transloco }}</mat-option>
              <mat-option value="otro">{{ 'historiaClinica.sexoOptions.otro' | transloco }}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.alergias' | transloco }}</mat-label>
            <mat-chip-grid #allergyGrid>
              @for (name of allergyNames(); track name) {
                <mat-chip-row (removed)="removeAllergy(name)">
                  {{ name }}
                  <button matChipRemove type="button"><mat-icon>cancel</mat-icon></button>
                </mat-chip-row>
              }
            </mat-chip-grid>
            <input
              [placeholder]="'historiaClinica.allergyPlaceholder' | transloco"
              [matChipInputFor]="allergyGrid"
              [matAutocomplete]="allergyAuto"
              [(ngModel)]="allergyInput"
              [ngModelOptions]="{ standalone: true }"
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
            <textarea matInput formControlName="queQuiereElPaciente"></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.queNecesitaElPaciente' | transloco }}</mat-label>
            <textarea matInput formControlName="queNecesitaElPaciente"></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.atributosEmocionales' | transloco }}</mat-label>
            <textarea matInput formControlName="atributosEmocionales"></textarea>
          </mat-form-field>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>{{ 'historiaClinica.sections.medicalInfo' | transloco }}</mat-panel-title>
          </mat-expansion-panel-header>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.enfermedadesActuales' | transloco }}</mat-label>
            <textarea matInput formControlName="enfermedadesActuales"></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.medicamentosAcne3Meses' | transloco }}</mat-label>
            <textarea matInput formControlName="medicamentosAcne3Meses"></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.cirugiasEsteticasAnteriores' | transloco }}</mat-label>
            <textarea matInput formControlName="cirugiasEsteticasAnteriores"></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.rutinaCuidadoFacial' | transloco }}</mat-label>
            <textarea matInput formControlName="rutinaCuidadoFacial"></textarea>
          </mat-form-field>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>{{ 'historiaClinica.sections.personalHistory' | transloco }}</mat-panel-title>
          </mat-expansion-panel-header>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.consumoAlcohol' | transloco }}</mat-label>
            <input matInput formControlName="consumoAlcohol" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.consumoTabaco' | transloco }}</mat-label>
            <input matInput formControlName="consumoTabaco" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.consumoDrogas' | transloco }}</mat-label>
            <input matInput formControlName="consumoDrogas" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.tipoFrecuenciaEjercicio' | transloco }}</mat-label>
            <input matInput formControlName="tipoFrecuenciaEjercicio" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.vacunas' | transloco }}</mat-label>
            <input matInput formControlName="vacunas" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.posibilidadEmbarazo' | transloco }}</mat-label>
            <mat-select formControlName="posibilidadEmbarazo">
              <mat-option value="si">{{ 'common.yes' | transloco }}</mat-option>
              <mat-option value="no">{{ 'common.no' | transloco }}</mat-option>
              <mat-option value="no_aplica">{{ 'historiaClinica.notApplicable' | transloco }}</mat-option>
            </mat-select>
          </mat-form-field>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>{{ 'historiaClinica.sections.familyHistory' | transloco }}</mat-panel-title>
          </mat-expansion-panel-header>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'historiaClinica.fields.antecedentesHeredofamiliares' | transloco }}</mat-label>
            <textarea matInput formControlName="antecedentesHeredofamiliares"></textarea>
          </mat-form-field>
        </mat-expansion-panel>
        </mat-accordion>

        <button
          *appHasPermission="exists() ? 'historia-clinica:edit' : 'historia-clinica:create'"
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="saving()"
          class="mt-2"
        >
          {{ 'common.save' | transloco }}
        </button>
      </form>
    }
  `,
  styles: [
    `
    .mt-2 {
      margin-top: 5px;
    }
      .full-width {
        width: 100%;
      }
      /* Tiles rather than bare text links: they read as tappable, sit on the 8pt grid, and give
         every target a comfortable touch area on a phone. Two per row on a narrow screen,
         growing to four across on desktop. */
      .quick-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
        gap: 12px;
        margin: 0 0 24px;
      }
      .quick-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 8px;
        min-height: 92px;
        padding: 16px 12px;
        border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        border-radius: 12px;
        background: var(--mat-sys-surface-container-low, transparent);
        color: var(--mat-sys-on-surface);
        font: inherit;
        font-weight: 500;
        line-height: 1.3;
        text-decoration: none;
        cursor: pointer;
        appearance: none;
        transition: background-color 150ms ease-out, border-color 150ms ease-out,
          transform 150ms ease-out;
      }
      .quick-action mat-icon {
        color: var(--mat-sys-primary);
        font-size: 28px;
        width: 28px;
        height: 28px;
      }
      .quick-action:hover {
        background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
        border-color: var(--mat-sys-primary);
      }
      .quick-action:active {
        transform: scale(0.97);
      }
      .computed-field {
        margin: 0 0 16px 0;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      }
      mat-expansion-panel {
        margin-bottom: 12px;
      }
    `,
  ],
})
export class HistoriaClinicaFormComponent implements OnInit {
  private readonly historiaClinicaService = inject(HistoriaClinicaService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly patientsService = inject(PatientsService);

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly exists = signal(false);

  protected readonly allergyOptions = signal<AllergyOption[]>([]);
  protected readonly allergyNames = signal<string[]>([]);
  protected allergyInput = '';

  protected readonly form = this.fb.group({
    documentId: [''],
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

  private readonly fechaNacimientoValue = toSignal(this.form.controls.fechaNacimiento.valueChanges, {
    initialValue: this.form.controls.fechaNacimiento.value,
  });

  protected readonly edad = computed(() => {
    const value = this.fechaNacimientoValue();
    if (!value) return null;
    // Parse as local midnight, not UTC midnight (`new Date('YYYY-MM-DD')` parses as UTC, but
    // getMonth()/getDate() below read back in local time — for negative UTC-offset timezones
    // that mismatch can shift the date back a day near a month boundary and throw off the
    // "already had a birthday this year" comparison).
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

  async ngOnInit(): Promise<void> {
    const patient = this.patient();
    if (!patient) {
      this.loading.set(false);
      return;
    }

    // Patched outside the try below on purpose: that block returns early when the patient has no
    // clinical history yet, and the CURP lives on the patient record — a brand-new patient is
    // exactly who still needs to have theirs filled in.
    this.form.patchValue({ documentId: patient.documentId ?? '' });

    // `finally`, not a trailing `set(false)`: Angular does not await `ngOnInit`, so a rejected
    // load would otherwise leave the page stuck on "Cargando..." with no way forward. The error
    // itself is already reported by `errorInterceptor`.
    try {
      const historia = await this.historiaClinicaService.get(patient.id);
      if (!historia) return;

      this.exists.set(true);
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
    } finally {
      this.loading.set(false);
    }
  }

  protected async onAllergyInputChange(value: string): Promise<void> {
    this.allergyOptions.set(
      value.trim() ? await this.historiaClinicaService.searchAllergies(value) : []
    );
  }

  protected addAllergyFromInput(event: MatChipInputEvent): void {
    const value = event.value.trim();
    if (value) {
      this.allergyNames.update((names) => (names.includes(value) ? names : [...names, value]));
    }
    event.chipInput.clear();
    this.allergyInput = '';
    this.allergyOptions.set([]);
  }

  protected selectAllergyOption(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.viewValue;
    this.allergyNames.update((names) => (names.includes(value) ? names : [...names, value]));
    this.allergyInput = '';
    this.allergyOptions.set([]);
  }

  protected removeAllergy(name: string): void {
    this.allergyNames.update((names) => names.filter((n) => n !== name));
  }

  protected openAppointmentDialog(): void {
    const patient = this.patient();
    if (!patient) return;
    this.dialog.open(AppointmentFormComponent, {
      data: {
        appointment: null,
        initialPatientId: patient.id,
        initialPatientName: patient.fullName,
      } as AppointmentFormDialogData,
    });
  }

  async save(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;

    this.saving.set(true);
    const raw = this.form.value;
    const input = {
      ocupacion: raw.ocupacion?.trim() || null,
      fechaNacimiento: raw.fechaNacimiento?.trim() || null,
      sexo: raw.sexo?.trim() || null,
      queQuiereElPaciente: raw.queQuiereElPaciente?.trim() || null,
      queNecesitaElPaciente: raw.queNecesitaElPaciente?.trim() || null,
      atributosEmocionales: raw.atributosEmocionales?.trim() || null,
      enfermedadesActuales: raw.enfermedadesActuales?.trim() || null,
      medicamentosAcne3Meses: raw.medicamentosAcne3Meses?.trim() || null,
      cirugiasEsteticasAnteriores: raw.cirugiasEsteticasAnteriores?.trim() || null,
      rutinaCuidadoFacial: raw.rutinaCuidadoFacial?.trim() || null,
      consumoAlcohol: raw.consumoAlcohol?.trim() || null,
      consumoTabaco: raw.consumoTabaco?.trim() || null,
      consumoDrogas: raw.consumoDrogas?.trim() || null,
      tipoFrecuenciaEjercicio: raw.tipoFrecuenciaEjercicio?.trim() || null,
      vacunas: raw.vacunas?.trim() || null,
      posibilidadEmbarazo: raw.posibilidadEmbarazo?.trim() || null,
      antecedentesHeredofamiliares: raw.antecedentesHeredofamiliares?.trim() || null,
      allergyNames: this.allergyNames(),
    };

    const documentId = raw.documentId?.trim() ?? '';

    try {
      if (this.exists()) {
        await this.historiaClinicaService.update(patient.id, input);
      } else {
        await this.historiaClinicaService.create(patient.id, input);
        this.exists.set(true);
      }

      // The CURP belongs to the patient record, so it needs its own call. Only sent when it
      // actually changed, to avoid a pointless write and audit entry on every save of this form.
      if (documentId !== (patient.documentId ?? '')) {
        const updated = await this.patientsService.updateDocumentId(patient.id, documentId);
        // Re-select so the banner and anything else reading the active patient show the new value
        // rather than the stale one this page was opened with.
        this.activePatient.select(updated);
      }
    } finally {
      this.saving.set(false);
    }
  }
}
