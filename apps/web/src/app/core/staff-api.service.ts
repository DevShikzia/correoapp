import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CreateLotInput,
  CreateMailInput,
  CreateStaffInput,
  Lot,
  Page,
  StaffMailItem,
  StaffSession,
  StaffUser,
  UpdateLotInput,
  UpdateStaffInput,
} from './staff.models';

const API_BASE_URL = '/api';
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
export class StaffApiService {
  private readonly http = inject(HttpClient);

  async login(username: string, password: string): Promise<StaffSession> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<StaffSession>>(
        `${API_BASE_URL}/auth/login`,
        { username, password },
        REQUEST_OPTIONS,
      ),
    );

    return response.data;
  }

  async me(): Promise<StaffUser> {
    const response = await firstValueFrom(
      this.http.get<DataResponse<{ user: StaffUser }>>(`${API_BASE_URL}/auth/me`, REQUEST_OPTIONS),
    );

    return response.data.user;
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/logout`, null, REQUEST_OPTIONS),
    );
  }

  async registerMail(input: CreateMailInput): Promise<StaffMailItem> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<StaffMailItem>>(`${API_BASE_URL}/mail`, input, REQUEST_OPTIONS),
    );

    return response.data;
  }

  async listPending(page: number, limit: number): Promise<Page<StaffMailItem>> {
    const response = await firstValueFrom(
      this.http.get<PageResponse<StaffMailItem>>(`${API_BASE_URL}/mail/pending`, {
        ...REQUEST_OPTIONS,
        params: { page, limit },
      }),
    );

    return this.toPage(response);
  }

  async deliverMail(id: string): Promise<StaffMailItem> {
    const response = await firstValueFrom(
      this.http.patch<DataResponse<StaffMailItem>>(
        `${API_BASE_URL}/mail/${encodeURIComponent(id)}/deliver`,
        null,
        REQUEST_OPTIONS,
      ),
    );

    return response.data;
  }

  async listLots(page: number, limit: number, search?: string): Promise<Page<Lot>> {
    const response = await firstValueFrom(
      this.http.get<PageResponse<Lot>>(`${API_BASE_URL}/lots`, {
        ...REQUEST_OPTIONS,
        params: {
          page,
          limit,
          ...(search !== undefined && search.length > 0 ? { search } : {}),
        },
      }),
    );

    return this.toPage(response);
  }

  async createLot(input: CreateLotInput): Promise<Lot> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<Lot>>(`${API_BASE_URL}/lots`, input, REQUEST_OPTIONS),
    );

    return response.data;
  }

  async updateLot(id: string, changes: UpdateLotInput): Promise<Lot> {
    const response = await firstValueFrom(
      this.http.patch<DataResponse<Lot>>(
        `${API_BASE_URL}/lots/${encodeURIComponent(id)}`,
        changes,
        REQUEST_OPTIONS,
      ),
    );

    return response.data;
  }

  async resetPin(id: string, pin: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${API_BASE_URL}/lots/${encodeURIComponent(id)}/reset-pin`,
        { pin },
        REQUEST_OPTIONS,
      ),
    );
  }

  async listStaff(page: number, limit: number): Promise<Page<StaffUser>> {
    const response = await firstValueFrom(
      this.http.get<PageResponse<StaffUser>>(`${API_BASE_URL}/staff`, {
        ...REQUEST_OPTIONS,
        params: { page, limit },
      }),
    );

    return this.toPage(response);
  }

  async createStaff(input: CreateStaffInput): Promise<StaffUser> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<StaffUser>>(`${API_BASE_URL}/staff`, input, REQUEST_OPTIONS),
    );

    return response.data;
  }

  async updateStaff(id: string, changes: UpdateStaffInput): Promise<StaffUser> {
    const response = await firstValueFrom(
      this.http.patch<DataResponse<StaffUser>>(
        `${API_BASE_URL}/staff/${encodeURIComponent(id)}`,
        changes,
        REQUEST_OPTIONS,
      ),
    );

    return response.data;
  }

  private toPage<T>(response: PageResponse<T>): Page<T> {
    return { items: response.data, meta: response.meta };
  }
}
