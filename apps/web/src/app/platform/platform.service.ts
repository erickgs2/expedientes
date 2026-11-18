import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { HANDLES_OWN_ERRORS } from '../auth/http-context';
import { firstValueFrom } from 'rxjs';
import type {
  ClinicListFilter,
  ClinicListTab,
  GrantPremiumRequest,
  GrantPremiumResult,
  NewPriceRequest,
  PlatformAdminView,
  PlatformAuditEntry,
  PlatformClinicDetail,
  PlatformClinicList,
  PlatformLegalOverview,
  PlatformLoginResponse,
  PlatformOverview,
  PlatformPriceVersion,
  PlatformTotpSetup,
  PublishLegalRequest,
} from '@expedientes/shared-types';

const API = '/api/plataforma';

/** The platform portal's API and its separate session (cookie scoped to /api/plataforma). */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly http = inject(HttpClient);

  readonly admin = signal<PlatformAdminView | null>(null);
  private restoring: Promise<void> | null = null;
  /** The sign-in screen reports its own errors, and a 401 there must not redirect to itself. */
  private readonly inline = { context: new HttpContext().set(HANDLES_OWN_ERRORS, true) };

  login(email: string, password: string): Promise<PlatformLoginResponse> {
    return firstValueFrom(this.http.post<PlatformLoginResponse>(`${API}/auth/login`, { email, password }, this.inline));
  }

  totpSetup(): Promise<PlatformTotpSetup> {
    return firstValueFrom(this.http.get<PlatformTotpSetup>(`${API}/auth/totp-setup`, this.inline));
  }

  async verifyTotp(code: string): Promise<void> {
    const { admin } = await firstValueFrom(
      this.http.post<{ admin: PlatformAdminView }>(`${API}/auth/totp`, { code }, this.inline)
    );
    this.admin.set(admin);
  }

  restore(): Promise<void> {
    this.restoring ??= firstValueFrom(this.http.get<{ admin: PlatformAdminView }>(`${API}/auth/me`, this.inline))
      .then(({ admin }) => this.admin.set(admin))
      .catch(() => this.admin.set(null))
      .finally(() => (this.restoring = null));
    return this.restoring;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/logout`, {}));
    this.admin.set(null);
  }

  overview(): Promise<PlatformOverview> {
    return firstValueFrom(this.http.get<PlatformOverview>(`${API}/overview`));
  }

  private listParams(tab: ClinicListTab, q: string, filter: ClinicListFilter | null): HttpParams {
    let params = new HttpParams().set('tab', tab);
    if (q.trim()) params = params.set('q', q.trim());
    if (filter) params = params.set('filter', filter);
    return params;
  }

  clinics(tab: ClinicListTab, q: string, filter: ClinicListFilter | null): Promise<PlatformClinicList> {
    return firstValueFrom(
      this.http.get<PlatformClinicList>(`${API}/clinics`, { params: this.listParams(tab, q, filter) })
    );
  }

  clinicsCsvUrl(tab: ClinicListTab, q: string, filter: ClinicListFilter | null): string {
    return `${API}/clinics/export?${this.listParams(tab, q, filter).toString()}`;
  }

  clinic(id: string): Promise<PlatformClinicDetail> {
    return firstValueFrom(this.http.get<PlatformClinicDetail>(`${API}/clinics/${id}`));
  }

  setClinicStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${API}/clinics/${id}/status`, { status, reason }));
  }

  grant(input: GrantPremiumRequest): Promise<GrantPremiumResult> {
    return firstValueFrom(this.http.post<GrantPremiumResult>(`${API}/grants`, input));
  }

  revokeGrant(id: string, reason: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${API}/grants/${id}/revoke`, { reason }));
  }

  prices(): Promise<PlatformPriceVersion[]> {
    return firstValueFrom(this.http.get<{ versions: PlatformPriceVersion[] }>(`${API}/prices`)).then(
      (r) => r.versions
    );
  }

  createPrice(input: NewPriceRequest): Promise<PlatformPriceVersion[]> {
    return firstValueFrom(this.http.post<{ versions: PlatformPriceVersion[] }>(`${API}/prices`, input)).then(
      (r) => r.versions
    );
  }

  legal(): Promise<PlatformLegalOverview> {
    return firstValueFrom(this.http.get<PlatformLegalOverview>(`${API}/legal`));
  }

  legalBody(id: string): Promise<string> {
    return firstValueFrom(this.http.get<{ body: string }>(`${API}/legal/${id}`)).then((r) => r.body);
  }

  publishLegal(input: PublishLegalRequest): Promise<{ recipients: number }> {
    return firstValueFrom(this.http.post<{ recipients: number }>(`${API}/legal`, input));
  }

  audit(): Promise<PlatformAuditEntry[]> {
    return firstValueFrom(this.http.get<{ entries: PlatformAuditEntry[] }>(`${API}/audit`)).then(
      (r) => r.entries
    );
  }
}
