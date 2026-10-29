/**
 * Transfer Service.
 * Implements two-sided, institution-authorised student transfer handshake.
 * Integrates confirmed transfers into Seat Ledger (TRANSFER_OUT / TRANSFER_IN) idempotently.
 * Enforces strict authorization, date-gap tolerances, and deadline timeouts.
 */
const mongoose = require('mongoose');
const TransferCase = require('../models/transferCase.model');
const Institution = require('../models/institution.model');
const Programme = require('../models/programme.model');
const SeatLedgerEntry = require('../models/seatLedgerEntry.model');
const SeatBalance = require('../models/seatBalance.model');
const { deriveStudentToken } = require('../utils/cryptoToken');
const { recordLifecycleEvent } = require('./lifecycleService');
const { getOrCreateBucket, computeBalanceMetrics } = require('./seatLedgerService');
const { getActiveOccupancyRule } = require('./occupancyRuleService');

const DEFAULT_CONFIRMATION_WINDOW_DAYS = 30;
const DEFAULT_DATE_GAP_TOLERANCE_DAYS = 7;

/**
 * Initiates a new transfer case.
 */
async function createTransferCase(data, user) {
  const {
    rawApaar,
    studentTokenId,
    keyVersion = 'v1',
    sendingInstitutionId,
    receivingInstitutionId,
    programmeCode,
    academicYear,
    seatCategory = 'GENERAL',
    proposedEffectiveDate,
    confirmationWindowDays = DEFAULT_CONFIRMATION_WINDOW_DAYS,
    idempotencyKey = null
  } = data;

  if (!sendingInstitutionId || !receivingInstitutionId) {
    const error = new Error('Both sendingInstitutionId and receivingInstitutionId are required.');
    error.statusCode = 400;
    throw error;
  }

  if (String(sendingInstitutionId) === String(receivingInstitutionId)) {
    const error = new Error('Sending and receiving institutions must be different.');
    error.statusCode = 422;
    error.code = 'INVALID_TRANSFER_INSTITUTIONS';
    throw error;
  }

  // Idempotency replay check
  if (idempotencyKey) {
    const existing = await TransferCase.findOne({ idempotencyKey });
    if (existing) {
      return { transferCase: existing, isReplay: true };
    }
  }

  // Resolve student token reference
  let token = studentTokenId;
  let ver = keyVersion;
  if (!token && rawApaar) {
    const derived = deriveStudentToken(rawApaar, keyVersion, sendingInstitutionId);
    if (derived.status === 'MISSING_IDENTIFIER') {
      const error = new Error('Missing student identifier; cannot initiate transfer.');
      error.statusCode = 400;
      throw error;
    }
    token = derived.token;
    ver = derived.keyVersion;
  }

  if (!token) {
    const error = new Error('Student identifier is required.');
    error.statusCode = 400;
    throw error;
  }

  // Verify institutions exist
  const [sender, receiver] = await Promise.all([
    Institution.findById(sendingInstitutionId),
    Institution.findById(receivingInstitutionId)
  ]);

  if (!sender) {
    const error = new Error(`Sending institution ${sendingInstitutionId} not found.`);
    error.statusCode = 404;
    throw error;
  }
  if (!receiver) {
    const error = new Error(`Receiving institution ${receivingInstitutionId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  // Reject duplicate active pending transfer cases
  const activeDuplicate = await TransferCase.findOne({
    studentTokenId: token,
    sendingInstitutionId,
    receivingInstitutionId,
    status: { $in: ['PENDING', 'NEEDS_REVIEW'] }
  });

  if (activeDuplicate) {
    const error = new Error('An active pending transfer case already exists for this student and institution pair.');
    error.statusCode = 409;
    error.code = 'DUPLICATE_TRANSFER_CASE';
    throw error;
  }

  const effective = proposedEffectiveDate ? new Date(proposedEffectiveDate) : new Date();
  if (isNaN(effective.getTime())) {
    const error = new Error('Invalid proposedEffectiveDate format.');
    error.statusCode = 400;
    throw error;
  }

  const deadline = new Date(Date.now() + confirmationWindowDays * 24 * 60 * 60 * 1000);

  // Derive opaque studentRef
  const derived = deriveStudentToken(token, ver, sendingInstitutionId);
  const studentRef = derived.studentRef;

  let transferCase;
  try {
    transferCase = await TransferCase.create({
      studentTokenId: token,
      keyVersion: ver,
      studentRef,
      sendingInstitutionId,
      receivingInstitutionId,
      programmeCode: programmeCode ? programmeCode.toUpperCase().trim() : 'UNKNOWN',
      academicYear: academicYear ? academicYear.trim() : '2024-25',
      seatCategory: seatCategory ? seatCategory.toUpperCase().trim() : 'GENERAL',
      proposedEffectiveDate: effective,
      status: 'PENDING',
      statusReason: 'Transfer initiated; awaiting sending and receiving institution confirmations.',
      deadline,
      sendingConfirmation: { status: 'PENDING' },
      receivingConfirmation: { status: 'PENDING' },
      history: [
        {
          action: 'TRANSFER_INITIATED',
          by: user ? user.id : 'system',
          role: user ? user.role : 'INSTITUTION_ADMIN',
          institutionId: user && user.institutionId ? user.institutionId : sendingInstitutionId,
          at: new Date(),
          notes: `Transfer case initiated towards ${receiver.name}.`
        }
      ],
      ...(idempotencyKey ? { idempotencyKey } : {})
    });
  } catch (err) {
    if (err.code === 11000) {
      const error = new Error('An active pending transfer case already exists for this student and institution pair.');
      error.statusCode = 409;
      error.code = 'DUPLICATE_TRANSFER_CASE';
      throw error;
    }
    throw err;
  }

  // Record TRANSFER_OUT_REQUESTED event at sending institution
  try {
    await recordLifecycleEvent(
      {
        studentTokenId: token,
        keyVersion: ver,
        institutionId: sendingInstitutionId,
        type: 'TRANSFER_OUT_REQUESTED',
        effectiveDate: effective,
        sourceRef: transferCase._id.toString(),
        programmeCode: transferCase.programmeCode,
        academicYear: transferCase.academicYear,
        seatCategory: transferCase.seatCategory,
        reason: 'Transfer handshake initiated'
      },
      user
    );
  } catch (_) {}

  return { transferCase, isReplay: false };
}

/**
 * Records one side of the two-sided transfer confirmation.
 */
async function confirmTransfer(transferId, payload, user) {
  // Auditor is strictly read-only
  if (user && user.role === 'AUDITOR') {
    const error = new Error('Auditor role is read-only and cannot confirm transfers.');
    error.statusCode = 403;
    throw error;
  }

  const transferCase = await TransferCase.findById(transferId);
  if (!transferCase) {
    const error = new Error(`Transfer case ${transferId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  let side = payload.side;
  const isInstitutionUser = user && user.role && user.role.startsWith('INSTITUTION_');
  if (!side && isInstitutionUser && user.institutionId) {
    const uId = String(user.institutionId);
    if (uId === String(transferCase.sendingInstitutionId)) {
      side = 'SENDING';
    } else if (uId === String(transferCase.receivingInstitutionId)) {
      side = 'RECEIVING';
    }
  }

  if (!side || !['SENDING', 'RECEIVING'].includes(side)) {
    const error = new Error("side must be either 'SENDING' or 'RECEIVING'.");
    error.statusCode = 400;
    throw error;
  }

  // Authorization check: Only institution admin of the named institution can confirm their side
  if (isInstitutionUser) {
    const userInstId = user.institutionId ? String(user.institutionId) : null;
    const targetInstId =
      side === 'SENDING'
        ? String(transferCase.sendingInstitutionId)
        : String(transferCase.receivingInstitutionId);

    if (userInstId !== targetInstId) {
      const error = new Error(
        `Institution user cannot confirm for ${side} institution. Mismatched institution authority.`
      );
      error.statusCode = 403;
      error.code = 'FORBIDDEN_TRANSFER_CONFIRMATION';
      throw error;
    }
  }

  const { effectiveDate, notes = null } = payload;
  const reason = payload.reason || payload.reasonCode || null;

  if (!effectiveDate) {
    const error = new Error('effectiveDate is required for transfer confirmation.');
    error.statusCode = 400;
    throw error;
  }

  const parsedEffective = new Date(effectiveDate);
  if (isNaN(parsedEffective.getTime())) {
    const error = new Error('Invalid effectiveDate format.');
    error.statusCode = 400;
    throw error;
  }

  // If already confirmed on this side, return safely (idempotent)
  const currentConfirmation =
    side === 'SENDING' ? transferCase.sendingConfirmation : transferCase.receivingConfirmation;
  if (currentConfirmation.status === 'CONFIRMED') {
    return transferCase;
  }

  // Update confirmation details
  const updateData = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    effectiveDate: parsedEffective,
    confirmedBy: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'INSTITUTION_ADMIN',
      email: user ? user.email : null
    },
    reason,
    notes
  };

  if (side === 'SENDING') {
    transferCase.sendingConfirmation = updateData;
  } else {
    transferCase.receivingConfirmation = updateData;
  }

  transferCase.history.push({
    action: `${side}_CONFIRMATION_RECORDED`,
    by: user ? user.id : 'system',
    role: user ? user.role : 'INSTITUTION_ADMIN',
    institutionId:
      side === 'SENDING' ? transferCase.sendingInstitutionId : transferCase.receivingInstitutionId,
    at: new Date(),
    notes: notes || `Confirmed by ${side.toLowerCase()} institution.`
  });

  // Record corresponding lifecycle event
  try {
    const targetInst =
      side === 'SENDING' ? transferCase.sendingInstitutionId : transferCase.receivingInstitutionId;
    const eventType = side === 'SENDING' ? 'TRANSFER_OUT_CONFIRMED' : 'TRANSFER_IN_CONFIRMED';

    await recordLifecycleEvent(
      {
        studentTokenId: transferCase.studentTokenId,
        keyVersion: transferCase.keyVersion,
        institutionId: targetInst,
        type: eventType,
        effectiveDate: parsedEffective,
        sourceRef: transferCase._id.toString(),
        programmeCode: transferCase.programmeCode,
        academicYear: transferCase.academicYear,
        seatCategory: transferCase.seatCategory,
        reason: reason || `${side} transfer confirmed`
      },
      user
    );
  } catch (_) {}

  // Check handshake completion: Are BOTH sides confirmed?
  const sendingConfirmed = transferCase.sendingConfirmation.status === 'CONFIRMED';
  const receivingConfirmed = transferCase.receivingConfirmation.status === 'CONFIRMED';

  if (sendingConfirmed && receivingConfirmed) {
    const sendDate = new Date(transferCase.sendingConfirmation.effectiveDate);
    const recvDate = new Date(transferCase.receivingConfirmation.effectiveDate);

    const diffDays = Math.abs(Math.floor((recvDate - sendDate) / (1000 * 60 * 60 * 24)));
    transferCase.dateGapDays = diffDays;

    if (diffDays > DEFAULT_DATE_GAP_TOLERANCE_DAYS) {
      transferCase.status = 'NEEDS_REVIEW';
      transferCase.statusReason = `Date gap between sending (${sendDate.toISOString().split('T')[0]}) and receiving (${recvDate.toISOString().split('T')[0]}) effective dates is ${diffDays} days, exceeding the ${DEFAULT_DATE_GAP_TOLERANCE_DAYS}-day tolerance.`;
    } else {
      transferCase.status = 'TRANSFER_CONFIRMED';
      transferCase.statusReason = 'Two-sided institution confirmation completed within date tolerance.';

      // Synchronize with Seat Ledger idempotently
      await syncTransferToLedger(transferCase, user);

      // Mark Scorecards stale on both institutions
      try {
        const scorecardService = require('./scorecardService');
        scorecardService
          .markSnapshotsStale(transferCase.sendingInstitutionId, transferCase.academicYear, 'TRANSFER_CONFIRMED')
          .catch(() => {});
        scorecardService
          .markSnapshotsStale(transferCase.receivingInstitutionId, transferCase.academicYear, 'TRANSFER_CONFIRMED')
          .catch(() => {});
      } catch (_) {}
    }
  } else {
    // Only one side confirmed so far
    transferCase.status = 'PENDING';
    transferCase.statusReason = `Awaiting confirmation from ${side === 'SENDING' ? 'receiving' : 'sending'} institution.`;
  }

  await transferCase.save();
  return transferCase;
}

/**
 * Rejects a transfer from one side.
 */
async function rejectTransfer(transferId, payload, user) {
  // Auditor is strictly read-only
  if (user && user.role === 'AUDITOR') {
    const error = new Error('Auditor role is read-only and cannot reject transfers.');
    error.statusCode = 403;
    throw error;
  }

  const transferCase = await TransferCase.findById(transferId);
  if (!transferCase) {
    const error = new Error(`Transfer case ${transferId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  let side = payload.side;
  const isInstitutionUser = user && user.role && user.role.startsWith('INSTITUTION_');
  if (!side && isInstitutionUser && user.institutionId) {
    const uId = String(user.institutionId);
    if (uId === String(transferCase.sendingInstitutionId)) {
      side = 'SENDING';
    } else if (uId === String(transferCase.receivingInstitutionId)) {
      side = 'RECEIVING';
    }
  }

  if (!side || !['SENDING', 'RECEIVING'].includes(side)) {
    const error = new Error("side must be either 'SENDING' or 'RECEIVING'.");
    error.statusCode = 400;
    throw error;
  }

  // Authorization check
  if (isInstitutionUser) {
    const userInstId = user.institutionId ? String(user.institutionId) : null;
    const targetInstId =
      side === 'SENDING'
        ? String(transferCase.sendingInstitutionId)
        : String(transferCase.receivingInstitutionId);

    if (userInstId !== targetInstId) {
      const error = new Error(`Institution user cannot reject for ${side} institution.`);
      error.statusCode = 403;
      error.code = 'FORBIDDEN_TRANSFER_CONFIRMATION';
      throw error;
    }
  }

  const reason = payload.reason || payload.reasonCode;
  const notes = payload.notes || null;

  if (!reason || !String(reason).trim()) {
    const error = new Error('reason or reasonCode is required for transfer rejection.');
    error.statusCode = 400;
    throw error;
  }

  const rejectData = {
    status: 'REJECTED',
    confirmedAt: new Date(),
    confirmedBy: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'INSTITUTION_ADMIN',
      email: user ? user.email : null
    },
    reason: reason.trim(),
    notes
  };

  if (side === 'SENDING') {
    transferCase.sendingConfirmation = rejectData;
  } else {
    transferCase.receivingConfirmation = rejectData;
  }

  transferCase.status = 'TRANSFER_REJECTED';
  transferCase.statusReason = `Transfer rejected by ${side.toLowerCase()} institution: ${reason}`;

  transferCase.history.push({
    action: `${side}_REJECTION_RECORDED`,
    by: user ? user.id : 'system',
    role: user ? user.role : 'INSTITUTION_ADMIN',
    institutionId:
      side === 'SENDING' ? transferCase.sendingInstitutionId : transferCase.receivingInstitutionId,
    at: new Date(),
    notes: reason
  });

  await transferCase.save();
  return transferCase;
}

/**
 * Checks pending transfers and marks expired cases as NEEDS_REVIEW (never auto-confirms).
 */
async function checkTransferTimeouts() {
  const expiredCases = await TransferCase.find({
    status: 'PENDING',
    deadline: { $lt: new Date() }
  });

  const updatedCases = [];
  for (const tc of expiredCases) {
    tc.status = 'NEEDS_REVIEW';
    tc.statusReason = 'Confirmation deadline expired without complete two-sided confirmation.';
    tc.history.push({
      action: 'DEADLINE_EXPIRED_TIMEOUT',
      by: 'system',
      role: 'SYSTEM',
      institutionId: tc.sendingInstitutionId,
      at: new Date(),
      notes: 'Moved to NEEDS_REVIEW upon deadline expiration.'
    });
    await tc.save();
    updatedCases.push(tc);
  }

  return {
    timeoutCount: updatedCases.length,
    timedOutCount: updatedCases.length,
    cases: updatedCases
  };
}

/**
 * Synchronizes confirmed transfer movements into the Seat Ledger (idempotently).
 */
async function syncTransferToLedger(transferCase, user) {
  if (transferCase.ledgerSynced) {
    return; // Already synced; prevent duplicate transactions
  }

  const {
    _id,
    sendingInstitutionId,
    receivingInstitutionId,
    programmeCode,
    academicYear,
    seatCategory,
    sendingConfirmation,
    receivingConfirmation
  } = transferCase;

  const outIdempKey = `transfer_out_${_id}`;
  const inIdempKey = `transfer_in_${_id}`;

  const createdEntries = [];

  // 1. Sending Institution: TRANSFER_OUT (-1 delta)
  const sendBucket = await getOrCreateBucket({
    institutionId: sendingInstitutionId,
    programmeCode,
    academicYear,
    seatCategory,
    user
  });

  const sendRule = await getActiveOccupancyRule({
    institutionId: sendingInstitutionId,
    programmeCode,
    academicYear
  });

  const sendOcc = Math.max(0, sendBucket.reportedOccupancy - 1);
  const sendMetrics = computeBalanceMetrics(
    sendBucket.approvedIntake,
    sendOcc,
    sendRule.warningThresholdPct,
    sendBucket.verificationStatus
  );

  const outEffectiveDate = sendingConfirmation.effectiveDate || new Date();

  const outEntry = await SeatLedgerEntry.create({
    bucketKey: sendBucket.bucketKey,
    institutionId: sendingInstitutionId,
    programmeId: sendBucket.programmeId,
    programmeCode,
    academicYear,
    seatCategory,
    type: 'TRANSFER_OUT',
    delta: -1,
    intakeDelta: 0,
    balanceAfter: {
      approvedIntake: sendMetrics.approvedIntake,
      reportedOccupancy: sendOcc,
      headroom: sendMetrics.headroom,
      utilisationPct: sendMetrics.utilisationPct
    },
    effectiveDate: outEffectiveDate,
    sourceReference: _id.toString(),
    sourceMode: 'INSTITUTION_REPORTED',
    verificationStatus: 'AUTHORITY_VERIFIED',
    actor: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'SYSTEM',
      email: user ? user.email : null
    },
    reason: `Two-sided transfer confirmed to receiving institution ${receivingInstitutionId}`,
    idempotencyKey: outIdempKey
  });

  sendBucket.reportedOccupancy = sendOcc;
  sendBucket.headroom = sendMetrics.headroom;
  sendBucket.utilisationPct = sendMetrics.utilisationPct;
  sendBucket.status = sendMetrics.status;
  await sendBucket.save();
  createdEntries.push(outEntry._id);

  // 2. Receiving Institution: TRANSFER_IN (+1 delta)
  const recvBucket = await getOrCreateBucket({
    institutionId: receivingInstitutionId,
    programmeCode,
    academicYear,
    seatCategory,
    user
  });

  const recvRule = await getActiveOccupancyRule({
    institutionId: receivingInstitutionId,
    programmeCode,
    academicYear
  });

  const recvOcc = recvBucket.reportedOccupancy + 1;
  const recvMetrics = computeBalanceMetrics(
    recvBucket.approvedIntake,
    recvOcc,
    recvRule.warningThresholdPct,
    recvBucket.verificationStatus
  );

  const inEffectiveDate = receivingConfirmation.effectiveDate || new Date();

  const inEntry = await SeatLedgerEntry.create({
    bucketKey: recvBucket.bucketKey,
    institutionId: receivingInstitutionId,
    programmeId: recvBucket.programmeId,
    programmeCode,
    academicYear,
    seatCategory,
    type: 'TRANSFER_IN',
    delta: 1,
    intakeDelta: 0,
    balanceAfter: {
      approvedIntake: recvMetrics.approvedIntake,
      reportedOccupancy: recvOcc,
      headroom: recvMetrics.headroom,
      utilisationPct: recvMetrics.utilisationPct
    },
    effectiveDate: inEffectiveDate,
    sourceReference: _id.toString(),
    sourceMode: 'INSTITUTION_REPORTED',
    verificationStatus: 'AUTHORITY_VERIFIED',
    actor: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'SYSTEM',
      email: user ? user.email : null
    },
    reason: `Two-sided transfer confirmed from sending institution ${sendingInstitutionId}`,
    idempotencyKey: inIdempKey
  });

  recvBucket.reportedOccupancy = recvOcc;
  recvBucket.headroom = recvMetrics.headroom;
  recvBucket.utilisationPct = recvMetrics.utilisationPct;
  recvBucket.status = recvMetrics.status;
  await recvBucket.save();
  createdEntries.push(inEntry._id);

  transferCase.ledgerSynced = true;
  transferCase.ledgerEntries = createdEntries;
}

const { resolveInstitutionId } = require('../utils/institutionResolver');

/**
 * Lists transfer cases subject to institution scoping.
 */
async function listTransferCases(filter = {}, { page = 1, limit = 25 }, user) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const query = {};
  if (filter.status) query.status = filter.status;
  if (filter.academicYear) query.academicYear = filter.academicYear;
  if (filter.programmeCode) query.programmeCode = filter.programmeCode;

  // Institution scoping: caller can only see cases where they are sender or receiver
  const isInstitutionUser = user && user.role && user.role.startsWith('INSTITUTION_');
  if (isInstitutionUser && user.institutionId) {
    const instId = new mongoose.Types.ObjectId(user.institutionId);
    query.$or = [{ sendingInstitutionId: instId }, { receivingInstitutionId: instId }];
  } else if (filter.institutionId) {
    const resolvedId = (await resolveInstitutionId(filter.institutionId)) || filter.institutionId;
    if (mongoose.Types.ObjectId.isValid(resolvedId)) {
      const instObjId = new mongoose.Types.ObjectId(resolvedId);
      query.$or = [{ sendingInstitutionId: instObjId }, { receivingInstitutionId: instObjId }];
    }
  }

  const [items, total] = await Promise.all([
    TransferCase.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .populate('sendingInstitutionId', 'name code type')
      .populate('receivingInstitutionId', 'name code type')
      .lean(),
    TransferCase.countDocuments(query)
  ]);

  return {
    items,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l)
    }
  };
}

/**
 * Retrieves a single transfer case by ID.
 */
async function getTransferCaseById(id, user) {
  const tc = await TransferCase.findById(id)
    .populate('sendingInstitutionId', 'name code type')
    .populate('receivingInstitutionId', 'name code type')
    .lean();

  if (!tc) {
    const error = new Error(`Transfer case ${id} not found.`);
    error.statusCode = 404;
    throw error;
  }

  // Scoping check
  const isInstitutionUser = user && user.role && user.role.startsWith('INSTITUTION_');
  if (isInstitutionUser && user.institutionId) {
    const userInst = String(user.institutionId);
    const sendInst = tc.sendingInstitutionId._id ? String(tc.sendingInstitutionId._id) : String(tc.sendingInstitutionId);
    const recvInst = tc.receivingInstitutionId._id ? String(tc.receivingInstitutionId._id) : String(tc.receivingInstitutionId);

    if (userInst !== sendInst && userInst !== recvInst) {
      const error = new Error('Cross-institution transfer access is strictly prohibited.');
      error.statusCode = 403;
      throw error;
    }
  }

  return tc;
}

module.exports = {
  createTransferCase,
  confirmTransfer,
  rejectTransfer,
  checkTransferTimeouts,
  syncTransferToLedger,
  listTransferCases,
  getTransferCaseById,
  DEFAULT_CONFIRMATION_WINDOW_DAYS,
  DEFAULT_DATE_GAP_TOLERANCE_DAYS
};
