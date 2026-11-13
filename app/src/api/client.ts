import { accessToken, forgetAuth } from './auth';
import { API_URL } from './config';
import type { ApiError as ApiErrorBody } from './protocol';

/** Chyba volání API: status 0 = bez spojení se serverem. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ApiErrorBody['code'],
  ) {
    super(message);
  }
  get offline(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

/** Volání API s přihlašovacím tokenem; chyby převádí na ApiError s českou hláškou. */
export async function api<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  if (!token) throw new ApiError(401, 'Přihlaste se prosím.', 'unauthorized');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Nelze se spojit se serverem. Zkontrolujte připojení k internetu.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    if (res.status === 401) forgetAuth();
    throw new ApiError(res.status, err.error ?? (res.status >= 500 ? 'Server je dočasně nedostupný. Zkuste to prosím znovu.' : 'Požadavek se nepodařilo zpracovat.'), err.code);
  }
  return data as T;
}
