import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { OwnerMailItem, OwnerMailPage, OwnerSession } from './portal.models';

const API_BASE_URL = '/api/public';
const REQUEST_OPTIONS = { withCredentials: true } as const;

interface DataResponse<T> {
  data: T;
}

interface PageResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

@Injectable({ providedIn: 'root' })
export class OwnerApiService {
  private readonly http = inject(HttpClient);

  async access(lotNumber: string, pin: string): Promise<OwnerSession> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<OwnerSession>>(
        `${API_BASE_URL}/access`,
        { lotNumber, pin },
        REQUEST_OPTIONS,
      ),
    );

    return response.data;
  }

  async me(): Promise<OwnerSession> {
    const response = await firstValueFrom(
      this.http.get<DataResponse<OwnerSession>>(`${API_BASE_URL}/me`, REQUEST_OPTIONS),
    );

    return response.data;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${API_BASE_URL}/logout`, null, REQUEST_OPTIONS));
  }

  async listMail(page: number, limit: number): Promise<OwnerMailPage> {
    const response = await firstValueFrom(
      this.http.get<PageResponse<OwnerMailItem>>(`${API_BASE_URL}/mail`, {
        ...REQUEST_OPTIONS,
        params: { page, limit },
      }),
    );

    return { items: response.data, meta: response.meta };
  }
}
