import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { ValoracionSummary } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { ValoracionService } from './valoracion.service';

@Component({
  selector: 'app-valoracion-list',
  standalone: true,
  imports: [MatListModule, MatButtonModule, TranslocoModule, HasPermissionDirective, RouterLink],
  template: `
    <h1>{{ 'valoracion.listTitle' | transloco }} — {{ patient()?.fullName }}</h1>
    <button
      *appHasPermission="'valoracion:create'"
      mat-flat-button
      color="primary"
      [disabled]="creating()"
      (click)="createNew()"
    >
      {{ 'valoracion.new' | transloco }}
    </button>
    <a *appHasPermission="'valoracion:view'" mat-button routerLink="/photos">{{
      'photoTimeline.navLink' | transloco
    }}</a>
    <mat-list>
      @for (v of valoraciones(); track v.id) {
        <mat-list-item (click)="openDetail(v.id)" class="clickable">
          <span matListItemTitle>{{ v.fecha.substring(0, 10) }}</span>
          <span matListItemLine>{{ v.notas || ('valoracion.noNotes' | transloco) }}</span>
        </mat-list-item>
      } @empty {
        <p>{{ 'valoracion.empty' | transloco }}</p>
      }
    </mat-list>
  `,
  styles: [
    `
      .clickable {
        cursor: pointer;
      }
    `,
  ],
})
export class ValoracionListComponent implements OnInit {
  private readonly valoracionService = inject(ValoracionService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly router = inject(Router);

  protected readonly patient = this.activePatient.patient;
  protected readonly valoraciones = signal<ValoracionSummary[]>([]);
  protected readonly creating = signal(false);

  async ngOnInit(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;
    this.valoraciones.set(await this.valoracionService.list(patient.id));
  }

  async createNew(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;
    this.creating.set(true);
    try {
      const valoracion = await this.valoracionService.create(patient.id);
      this.router.navigate(['/valoracion', valoracion.id]);
    } finally {
      this.creating.set(false);
    }
  }

  openDetail(id: string): void {
    this.router.navigate(['/valoracion', id]);
  }
}
