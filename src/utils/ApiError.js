class ApiError extends Error {
  constructor(statusCode, message, errors = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isApiError = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
