/**
 * Standard API envelope helper matching SIH 2026 PS3 Global Conventions (§4).
 */
function sendSuccess(res, data = {}, statusCode = 200, meta = null) {
  const response = {
    success: true,
    data,
    requestId: res.req ? res.req.id : null
  };
  if (meta) {
    response.meta = meta;
  }
  return res.status(statusCode).json(response);
}

function sendError(res, code, message, statusCode = 400, details = []) {
  const response = {
    success: false,
    error: {
      code,
      message
    },
    requestId: res.req ? res.req.id : null
  };
  if (Array.isArray(details) && details.length > 0) {
    response.error.details = details;
  }
  return res.status(statusCode).json(response);
}

module.exports = {
  sendSuccess,
  sendError
};
