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
      <a *appHasPermission="'valoracion:view'" mat-button routerLink="/valoracion">{{
        'historiaClinica.viewValoraciones' | transloco
      }}</a>
      <a *appHasPermission="'valoracion:view'" mat-button routerLink="/photos">{{
        'photoTimeline.navLink' | transloco
      }}</a>
      <a *appHasPermission="'treatments:view'" mat-button routerLink="/treatments">{{
        'historiaClinica.viewTreatments' | transloco
      }}</a>
      <button
        *appHasPermission="'appointments:create'"
        mat-button
        type="button"
        (click)="openAppointmentDialog()"
      >
        {{ 'historiaClinica.scheduleAppointment' | transloco }}
      </button>
      <form [formGroup]="form" (ngSubmit)="save()">
        <!-- mat-accordion (multi=false by default) keeps a single section open at a time -->
        <mat-accordion>
        <mat-expansion-panel [expanded]="true">
          <mat-expansion-panel-header>
            <mat-panel-title>{{ 'historiaClinica.sections.personalInfo' | transloco }}</mat-panel-title>
          </mat-expansion-panel-header>

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
        >
          {{ 'common.save' | transloco }}
        </button>
      </form>
    }
  `,
  styles: [
    `
      .full-width {
        width: 100%;
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

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly exists = signal(false);

  protected readonly allergyOptions = signal<AllergyOption[]>([]);
  protected readonly allergyNames = signal<string[]>([]);
  protected allergyInput = '';

  protected readonly form = this.fb.group({
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

    try {
      if (this.exists()) {
        await this.historiaClinicaService.update(patient.id, input);
      } else {
        await this.historiaClinicaService.create(patient.id, input);
        this.exists.set(true);
      }
    } finally {
      this.saving.set(false);
    }
  }
}
