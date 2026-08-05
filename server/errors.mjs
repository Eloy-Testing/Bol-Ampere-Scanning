export class AppError extends Error {
  constructor(code, status = 500, message = 'Service unavailable.') {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export class ConfigurationError extends AppError {
  constructor() {
    super('configuration_unavailable', 503, 'Service configuration is unavailable.');
    this.name = 'ConfigurationError';
  }
}

export class DatabaseError extends AppError {
  constructor() {
    super('database_unavailable', 503, 'Shared scanner state is unavailable.');
    this.name = 'DatabaseError';
  }
}

export class UpstreamError extends AppError {
  constructor() {
    super('verification_unavailable', 503, 'Live verification is unavailable.');
    this.name = 'UpstreamError';
  }
}

export class ValidationError extends AppError {
  constructor() {
    super('invalid_request', 400, 'The request was invalid.');
    this.name = 'ValidationError';
  }
}

export function publicError(error) {
  if (error instanceof AppError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  return {
    status: 503,
    body: { error: { code: 'service_unavailable', message: 'Service unavailable.' } },
  };
}
