import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  TreatmentItemDetail,
  TreatmentProductInput,
  TreatmentProductRecord,
} from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class TreatmentProductService {
  private readonly http = inject(HttpClient);

  getItem(itemId: string): Promise<TreatmentItemDetail> {
    return firstValueFrom(
      this.http.get<{ item: TreatmentItemDetail }>(`/api/treatment-items/${itemId}`)
    ).then((r) => r.item);
  }

  list(itemId: string): Promise<TreatmentProductRecord[]> {
    return firstValueFrom(
      this.http.get<{ products: TreatmentProductRecord[] }>(
        `/api/treatment-items/${itemId}/products`
      )
    ).then((r) => r.products);
  }

  create(
    itemId: string,
    input: TreatmentProductInput,
    photo: Blob | null
  ): Promise<TreatmentProductRecord> {
    return firstValueFrom(
      this.http.post<{ product: TreatmentProductRecord }>(
        `/api/treatment-items/${itemId}/products`,
        this.toFormData(input, photo)
      )
    ).then((r) => r.product);
  }

  update(
    itemId: string,
    productId: string,
    input: TreatmentProductInput,
    photo: Blob | null
  ): Promise<TreatmentProductRecord> {
    return firstValueFrom(
      this.http.patch<{ product: TreatmentProductRecord }>(
        `/api/treatment-items/${itemId}/products/${productId}`,
        this.toFormData(input, photo)
      )
    ).then((r) => r.product);
  }

  delete(itemId: string, productId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/treatment-items/${itemId}/products/${productId}`)
    ).then(() => undefined);
  }

  brands(q: string): Promise<string[]> {
    return firstValueFrom(
      this.http.get<{ brands: string[] }>('/api/treatment-products/brands', { params: { q } })
    ).then((r) => r.brands);
  }

  private toFormData(input: TreatmentProductInput, photo: Blob | null): FormData {
    const formData = new FormData();
    formData.append('brand', input.brand);
    formData.append('lotNumber', input.lotNumber);
    formData.append('expiryDate', input.expiryDate);
    if (photo) {
      formData.append('photo', photo, 'product.jpg');
    }
    return formData;
  }
}
