/**
 * User Management Controller.
 * Restricts administrative operations strictly to PLATFORM_ADMIN (and view to AUTHORITY_ADMIN).
 *
 * SAFEGUARDS:
 * - Protects against accidental disabling or demotion of the final active PLATFORM_ADMIN.
 * - Prevents self-demotion or self-disablement.
 * - Enforces required institutionId for institution roles.
 * - Increments tokenVersion on role/status/scope change for immediate session revocation.
 */
const mongoose = require('mongoose');
const User = require('../models/user.model');
const RefreshToken = require('../models/refreshToken.model');
const { hashPassword } = require('../utils/passwordCrypto');
const { logAuditEvent } = require('../services/auditService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { ROLES } = require('../config/permissions');

/**
 * GET /api/v1/users
 * Lists users with role/institution filtering and bounded pagination.
 */
async function handleListUsers(req, res, next) {
  try {
    const { role, institutionId, isActive, page = 1, limit = 20 } = req.query;

    const query = {};

    if (role && Object.values(ROLES).includes(role)) {
      query.role = role;
    }

    if (institutionId && mongoose.Types.ObjectId.isValid(institutionId)) {
      query.institutionId = institutionId;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(l)
    ]);

    return sendSuccess(
      res,
      {
        items: users.map((u) => u.toJSON()),
        pagination: {
          page: p,
          limit: l,
          total,
          totalPages: Math.ceil(total / l)
        }
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/users
 * Creates a new user account (PLATFORM_ADMIN only).
 */
async function handleCreateUser(req, res, next) {
  try {
    const { email, password, name, role, institutionId, assignedInstitutionIds } = req.body;

    if (!email || !password || !name || !role) {
      return sendError(res, 'VALIDATION_ERROR', 'email, password, name, and role are required.', 400);
    }

    if (!Object.values(ROLES).includes(role)) {
      return sendError(res, 'VALIDATION_ERROR', `Invalid role '${role}'. Must be one of: ${Object.values(ROLES).join(', ')}`, 400);
    }

    if (typeof password !== 'string' || password.length < 8) {
      return sendError(res, 'VALIDATION_ERROR', 'Password must be at least 8 characters long.', 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check email uniqueness
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return sendError(res, 'CONFLICT', 'A user with this email address already exists.', 409);
    }

    // Role-specific constraints
    let instId = null;
    if (role === ROLES.INSTITUTION_ADMIN || role === ROLES.INSTITUTION_OPERATOR) {
      if (!institutionId || !mongoose.Types.ObjectId.isValid(institutionId)) {
        return sendError(res, 'VALIDATION_ERROR', `institutionId is required for role ${role}.`, 400);
      }
      instId = institutionId;
    }

    let assignedList = [];
    if (role === ROLES.AUTHORITY_OFFICER && Array.isArray(assignedInstitutionIds)) {
      assignedList = assignedInstitutionIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    }

    const passwordHash = await hashPassword(password);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: String(name).trim(),
      role,
      institutionId: instId,
      assignedInstitutionIds: assignedList,
      isActive: true,
      tokenVersion: 0
    });

    await logAuditEvent({
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user._id,
      institutionId: user.institutionId,
      performedBy: req.user,
      details: { email: user.email, role: user.role }
    });

    return sendSuccess(res, user.toJSON(), 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/users/:id
 * Updates an existing user's role, name, institution context, or active status (PLATFORM_ADMIN only).
 */
async function handleUpdateUser(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid user ID format.', 400);
    }

    const user = await User.findById(id).select('+tokenVersion');
    if (!user) {
      return sendError(res, 'NOT_FOUND', 'User record not found.', 404);
    }

    const { name, role, institutionId, assignedInstitutionIds, isActive } = req.body;
    let scopeOrPrivilegeChanged = false;

    // Protection: Prevent disabling or demoting the last active PLATFORM_ADMIN
    if (user.role === ROLES.PLATFORM_ADMIN) {
      const willDemote = role && role !== ROLES.PLATFORM_ADMIN;
      const willDisable = isActive === false;

      if (willDemote || willDisable) {
        const remainingAdminCount = await User.countDocuments({
          role: ROLES.PLATFORM_ADMIN,
          isActive: true,
          _id: { $ne: user._id }
        });

        if (remainingAdminCount === 0) {
          return sendError(
            res,
            'SOLE_ADMIN_PROTECTION',
            'Cannot disable or demote the sole active PLATFORM_ADMIN on the platform.',
            400
          );
        }
      }
    }

    if (name && typeof name === 'string') {
      user.name = name.trim();
    }

    if (role && Object.values(ROLES).includes(role)) {
      if (user.role !== role) {
        user.role = role;
        scopeOrPrivilegeChanged = true;
      }
    }

    if (institutionId !== undefined) {
      if (institutionId === null) {
        user.institutionId = null;
        scopeOrPrivilegeChanged = true;
      } else if (mongoose.Types.ObjectId.isValid(institutionId)) {
        user.institutionId = institutionId;
        scopeOrPrivilegeChanged = true;
      }
    }

    if (Array.isArray(assignedInstitutionIds)) {
      user.assignedInstitutionIds = assignedInstitutionIds.filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
      );
      scopeOrPrivilegeChanged = true;
    }

    if (isActive !== undefined) {
      const nextActive = Boolean(isActive);
      if (user.isActive !== nextActive) {
        user.isActive = nextActive;
        scopeOrPrivilegeChanged = true;

        if (!nextActive) {
          // If disabled, revoke all active refresh tokens immediately
          await RefreshToken.updateMany(
            { userId: user._id, isRevoked: false },
            { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'ACCOUNT_DISABLED' } }
          );
        }
      }
    }

    // Invalidate prior access tokens if permissions, status, or institution context changed
    if (scopeOrPrivilegeChanged) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    await user.save();

    await logAuditEvent({
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: user._id,
      institutionId: user.institutionId,
      performedBy: req.user,
      details: {
        role: user.role,
        isActive: user.isActive,
        scopeOrPrivilegeChanged
      }
    });

    return sendSuccess(res, user.toJSON(), 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleListUsers,
  handleCreateUser,
  handleUpdateUser
};
