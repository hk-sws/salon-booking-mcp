// Central error type. Every non-2xx the API emits is an ApiError so the
// error handler can always produce { error, message, spoken, details }.

export type ErrorCode =
  | 'COMPANY_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'STYLIST_NOT_FOUND'
  | 'BOOKING_NOT_FOUND'
  | 'SERVICE_NOT_BOOKABLE'
  | 'STYLIST_SERVICE_MISMATCH'
  | 'OUTSIDE_BUSINESS_HOURS'
  | 'CLOSED_ON_DAY'
  | 'SLOT_TAKEN'
  | 'SLOT_IN_PAST'
  | 'WITHIN_CANCELLATION_WINDOW'
  | 'NO_SLOTS_IN_RANGE'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  COMPANY_NOT_FOUND: 404,
  SERVICE_NOT_FOUND: 404,
  STYLIST_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  SERVICE_NOT_BOOKABLE: 403,
  STYLIST_SERVICE_MISMATCH: 400,
  OUTSIDE_BUSINESS_HOURS: 400,
  CLOSED_ON_DAY: 400,
  SLOT_TAKEN: 409,
  SLOT_IN_PAST: 400,
  WITHIN_CANCELLATION_WINDOW: 422,
  NO_SLOTS_IN_RANGE: 200,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  spoken: string;
  details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    spoken: string,
    details?: Record<string, unknown>,
    statusCode?: number
  ) {
    super(message);
    this.code = code;
    this.spoken = spoken;
    this.details = details;
    this.statusCode = statusCode ?? DEFAULT_STATUS[code];
  }

  toResponse() {
    return {
      error: this.code,
      message: this.message,
      spoken: this.spoken,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
