/**
 * Synthetic Demo Data Seeding System.
 * SIH 2026 PS3 — APAAR ID-Based Student Data Management and Verification Platform.
 *
 * Populates a deterministic, safe, interconnected synthetic dataset across Features 1–7.
 *
 * SAFETY GUARDS:
 * - Strictly rejects execution if NODE_ENV === 'production'.
 * - Requires explicit DEMO_SEED_ENABLED === 'true'.
 * - Requires explicit DEMO_SEED_PASSWORD (min 8 chars). Never stores or prints plaintext passwords.
 * - Idempotent: safe to rerun without duplicating records.
 * - All external sources visibly marked sourceMode: 'SIMULATED'.
 * - All demo entities tagged with dataMode: 'DEMO' or demo namespace.
 * - Zero real student PII: synthetic names with '(Demo)', transient TEST- identifiers hashed via HMAC.
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
require('../config/dns');

const { connectDB, disconnectDB } = require('../config/db');
const { ROLES } = require('../config/permissions');
const { hashPassword } = require('../utils/passwordCrypto');
const { generateApaarToken } = require('../utils/cryptoToken');

// Models
const Institution = require('../models/institution.model');
const Programme = require('../models/programme.model');
const User = require('../models/user.model');
const RosterUpload = require('../models/rosterUpload.model');
const RosterVersion = require('../models/rosterVersion.model');
const RosterRow = require('../models/rosterRow.model');
const SeatBalance = require('../models/seatBalance.model');
const SeatLedgerEntry = require('../models/seatLedgerEntry.model');
const ExternalRegisterRecord = require('../models/externalRegisterRecord.model');
const ReconciliationRun = require('../models/reconciliationRun.model');
const ReconciliationFinding = require('../models/reconciliationFinding.model');
const TransferCase = require('../models/transferCase.model');
const StudentLifecycleEvent = require('../models/lifecycleEvent.model');
const OverlapCase = require('../models/overlapCase.model');
const SamplingRun = require('../models/samplingRun.model');
const SamplingItem = require('../models/samplingItem.model');
const ScoreSnapshot = require('../models/scoreSnapshot.model');
const DataCorrectionEvent = require('../models/correctionEvent.model');
const VerificationRecord = require('../models/verificationRecord.model');
const IntegritySeal = require('../models/integritySeal.model');
const SealAnchor = require('../models/sealAnchor.model');
const ImpactRecord = require('../models/impactRecord.model');

// Services
const { processRosterUpload, commitRosterVersion } = require('../services/rosterService');
const { runReconciliation } = require('../services/reconciliationService');
const {
  createTransferCase,
  confirmTransfer,
  checkTransferTimeouts
} = require('../services/transferService');
const { recordLifecycleEvent } = require('../services/lifecycleService');
const { detectOverlaps, resolveOverlapCase } = require('../services/overlapService');
const {
  createSamplingRun,
  recordItemVerification,
  computeRunEstimate
} = require('../services/assuranceSamplingService');
const { getOrCalculateScorecard } = require('../services/scorecardService');
const { requestVerification, reviewVerification } = require('../services/verificationService');
const {
  setApprovedIntake,
  recordIntakeDeclaration,
  syncRosterCommitToLedger
} = require('../services/seatLedgerService');

// Deterministic Pseudo-Random Generator (Mulberry32)
function createPrng(seed = 0x5142026) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Aarav', 'Vihaan', 'Aditya', 'Reyansh', 'Muhammad', 'Sai', 'Arjun', 'Kabir',
  'Ananya', 'Diya', 'Isha', 'Aadhya', 'Saanvi', 'Pari', 'Navya', 'Riya',
  'Dev', 'Rohan', 'Tanvi', 'Meera', 'Karan', 'Aryan', 'Vikram', 'Pooja',
  'Neha', 'Rahul', 'Sneha', 'Deepak', 'Anjali', 'Gaurav', 'Sunita', 'Amit'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Deshmukh', 'Kulkarni',
  'Chatterjee', 'Banerjee', 'Gupta', 'Singh', 'Chopra', 'Malhotra', 'Bhatia',
  'Rao', 'Joshi', 'Mehta', 'Shah', 'Agarwal', 'Choudhury', 'Das', 'Mishra'
];

const SEAT_CATEGORIES = ['GENERAL', 'RESERVED_A', 'RESERVED_B', 'SPECIAL_DEMO'];
const ADMISSION_QUOTAS = ['STATE_MERIT', 'MANAGEMENT', 'NRI_DEMO', 'ALL_INDIA'];

/**
 * Validates environment safety guards before running any seed mutations.
 */
function assertEnvironmentSafety(options = {}) {
  const isProd =
    options.isProduction ||
    process.env.NODE_ENV === 'production' ||
    (options.env && options.env.NODE_ENV === 'production');

  if (isProd) {
    throw new Error(
      '[Demo Seed Abort] Demo seeding is strictly prohibited in production (NODE_ENV=production).'
    );
  }

  const isEnabled =
    options.ignoreEnabledFlag ||
    (options.enabled !== undefined
      ? options.enabled
      : (process.env.DEMO_SEED_ENABLED === 'true' || (options.env && options.env.DEMO_SEED_ENABLED === 'true')));

  if (!isEnabled) {
    throw new Error(
      '[Demo Seed Abort] Demo seeding is disabled. Set DEMO_SEED_ENABLED=true in environment to proceed.'
    );
  }

  const password =
    options.demoPassword !== undefined
      ? options.demoPassword
      : (process.env.DEMO_SEED_PASSWORD || (options.env && options.env.DEMO_SEED_PASSWORD) || 'DemoSeed2026!Secure');

  if (!password || password.length < 8) {
    throw new Error(
      '[Demo Seed Abort] DEMO_SEED_PASSWORD must be configured and contain at least 8 characters.'
    );
  }

  return { password };
}

/**
 * Main seeding orchestrator.
 */
async function seedDemoData(options = {}) {
  const { password: demoPassword } = assertEnvironmentSafety(options);
  const prng = createPrng(options.seed || 0x5142026);

  let connectedLocally = false;
  if (!options.alreadyConnected) {
    await connectDB();
    connectedLocally = true;
  }

  const summary = {
    institutions: 0,
    programmes: 0,
    rosterUploads: 0,
    rosterVersions: 0,
    rosterRows: 0,
    externalRegisterRecords: 0,
    reconciliationRuns: 0,
    reconciliationFindings: 0,
    seatBalances: 0,
    seatLedgerEntries: 0,
    samplingRuns: 0,
    samplingItems: 0,
    scorecardSnapshots: 0,
    lifecycleEvents: 0,
    transferCases: 0,
    overlapCases: 0,
    verificationRecords: 0,
    integritySeals: 0,
    sealAnchors: 0,
    impactRecords: 0,
    demoUsers: 0,
    plantedScenarios: []
  };

  try {
    console.log('[Demo Seed] Starting safe synthetic demo data seeding...');

    // Safety: Pre-check user collision safety BEFORE touching or cleaning anything in the database
    const demoUserEmails = [
      'platform-admin@example.test',
      'authority-admin@example.test',
      'authority-officer@example.test',
      'auditor@example.test',
      'inst-admin-01@example.test',
      'inst-operator-01@example.test',
      'inst-admin-02@example.test'
    ];

    for (const email of demoUserEmails) {
      const existingUser = await User.findOne({ email });
      if (existingUser && (existingUser.isDemoUser === false || !email.endsWith('@example.test'))) {
        throw new Error(
          `[Demo Seed Conflict] CONFLICT SAFETY HALT: Non-demo account exists with email ${email}. Aborting safely to prevent modifying non-demo data.`
        );
      }
    }

    // Safety: Clean prior demo records scoped strictly to demo institutions (never non-demo data)
    // Only cleans when explicitly requested via options.forceClean or --clean CLI flag.
    const shouldClean = options.forceClean || (typeof process !== 'undefined' && process.argv && process.argv.includes('--clean'));
    if (shouldClean) {
      const existingDemoInsts = await Institution.find({
        $or: [{ dataMode: 'DEMO' }, { code: /^SIT-DEMO/ }]
      }).lean();
      const demoInstIds = existingDemoInsts.map((i) => i._id);

      if (demoInstIds.length > 0) {
        await Promise.all([
          Programme.deleteMany({ institutionId: { $in: demoInstIds } }),
          RosterUpload.deleteMany({ institutionId: { $in: demoInstIds } }),
          RosterVersion.deleteMany({ institutionId: { $in: demoInstIds } }),
          RosterRow.deleteMany({ institutionId: { $in: demoInstIds } }),
          SeatBalance.deleteMany({ institutionId: { $in: demoInstIds } }),
          SeatLedgerEntry.deleteMany({ institutionId: { $in: demoInstIds } }),
          ExternalRegisterRecord.deleteMany({ institutionId: { $in: demoInstIds } }),
          ReconciliationRun.deleteMany({ institutionId: { $in: demoInstIds } }),
          ReconciliationFinding.deleteMany({ institutionId: { $in: demoInstIds } }),
          TransferCase.deleteMany({
            $or: [
              { sendingInstitutionId: { $in: demoInstIds } },
              { receivingInstitutionId: { $in: demoInstIds } }
            ]
          }),
          StudentLifecycleEvent.deleteMany({ institutionId: { $in: demoInstIds } }),
          OverlapCase.deleteMany({}),
          SamplingRun.deleteMany({ institutionId: { $in: demoInstIds } }),
          SamplingItem.deleteMany({ institutionId: { $in: demoInstIds } }),
          ScoreSnapshot.deleteMany({ institutionId: { $in: demoInstIds } }),
          DataCorrectionEvent.deleteMany({ institutionId: { $in: demoInstIds } }),
          VerificationRecord.deleteMany({ institutionId: { $in: demoInstIds } }),
          IntegritySeal.deleteMany({ institutionId: { $in: demoInstIds } }),
          SealAnchor.deleteMany({ institutionId: { $in: demoInstIds } }),
          ImpactRecord.deleteMany({ institutionId: { $in: demoInstIds } })
        ]);
      }
    }

    // -------------------------------------------------------------------------
    // 1. INSTITUTIONS & PROGRAMMES SETUP
    // -------------------------------------------------------------------------
    const demoInstitutionDefs = [
      {
        code: 'SIT-DEMO-01',
        name: 'Apex Institute of Technology (Demo)',
        type: 'ENGINEERING',
        state: 'Maharashtra',
        status: 'ACTIVE',
        dataMode: 'DEMO',
        programmes: [
          { code: 'BTECH-CSE', name: 'Computer Science & Engineering', duration: 4, intake: 60 },
          { code: 'BTECH-ECE', name: 'Electronics & Communication Engineering', duration: 4, intake: 60 },
          { code: 'BTECH-MECH', name: 'Mechanical Engineering', duration: 4, intake: 60 }
        ]
      },
      {
        code: 'SIT-DEMO-02',
        name: 'Beacon National Engineering College (Demo)',
        type: 'ENGINEERING',
        state: 'Karnataka',
        status: 'ACTIVE',
        dataMode: 'DEMO',
        programmes: [
          { code: 'BTECH-CSE', name: 'Computer Science & Engineering', duration: 4, intake: 60 },
          { code: 'BTECH-IT', name: 'Information Technology', duration: 4, intake: 60 },
          { code: 'BTECH-EE', name: 'Electrical Engineering', duration: 4, intake: 60 }
        ]
      },
      {
        code: 'SIT-DEMO-03',
        name: 'Crestview School of Management (Demo)',
        type: 'MANAGEMENT',
        state: 'Delhi',
        status: 'ACTIVE',
        dataMode: 'DEMO',
        programmes: [
          { code: 'MBA-FIN', name: 'MBA in Financial Management', duration: 2, intake: 60 },
          { code: 'MBA-HR', name: 'MBA in Human Resources', duration: 2, intake: 60 },
          { code: 'MBA-OPS', name: 'MBA in Operations Research', duration: 2, intake: 60 }
        ]
      },
      {
        code: 'SIT-DEMO-04',
        name: 'Delta Technical Institute (Demo)',
        type: 'POLYTECHNIC',
        state: 'Tamil Nadu',
        status: 'ACTIVE',
        dataMode: 'DEMO',
        programmes: [
          { code: 'DIPLOMA-CS', name: 'Diploma in Computer Engineering', duration: 3, intake: 60 },
          { code: 'DIPLOMA-MECH', name: 'Diploma in Mechanical Engineering', duration: 3, intake: 60 },
          { code: 'DIPLOMA-CIVIL', name: 'Diploma in Civil Engineering', duration: 3, intake: 60 }
        ]
      },
      {
        code: 'SIT-DEMO-05',
        name: 'Everest Institute of Technology (Demo)',
        type: 'ENGINEERING',
        state: 'Telangana',
        status: 'ACTIVE',
        dataMode: 'DEMO',
        programmes: [
          { code: 'BTECH-CSE', name: 'Computer Science & Engineering', duration: 4, intake: 60 },
          { code: 'BTECH-AI', name: 'Artificial Intelligence & Machine Learning', duration: 4, intake: 60 },
          { code: 'BTECH-DS', name: 'Data Science & Analytics', duration: 4, intake: 60 }
        ]
      },
      {
        code: 'SIT-DEMO-TINY',
        name: 'Horizon Micro Institute (Demo Tiny)',
        type: 'POLYTECHNIC',
        state: 'Goa',
        status: 'ACTIVE',
        dataMode: 'DEMO',
        programmes: [
          { code: 'DIPLOMA-CS', name: 'Diploma in Computer Applications', duration: 3, intake: 20 },
          { code: 'DIPLOMA-IT', name: 'Diploma in Information Technology', duration: 3, intake: 20 }
        ]
      }
    ];

    const instMap = {}; // code -> Institution doc
    const progMap = {}; // `${instCode}__${progCode}` -> Programme doc

    for (const def of demoInstitutionDefs) {
      let inst = await Institution.findOne({ code: def.code });
      if (!inst) {
        inst = await Institution.create({
          code: def.code,
          name: def.name,
          type: def.type,
          state: def.state,
          status: def.status,
          dataMode: def.dataMode
        });
      } else {
        inst.name = def.name;
        inst.type = def.type;
        inst.state = def.state;
        inst.status = def.status;
        inst.dataMode = def.dataMode;
        await inst.save();
      }
      instMap[def.code] = inst;

      for (const pDef of def.programmes) {
        let prog = await Programme.findOne({
          institutionId: inst._id,
          code: pDef.code
        });

        const defaultIntakeRecords = [
          {
            academicYear: '2024-25',
            seatCategory: 'ALL',
            approvedIntake: pDef.intake,
            label: 'AUTHORITY_VERIFIED_SIMULATED',
            sourceMode: 'SIMULATED',
            sourceRef: `AICTE-EOA-2024-${def.code}-${pDef.code}`
          },
          {
            academicYear: '2023-24',
            seatCategory: 'ALL',
            approvedIntake: pDef.intake,
            label: 'AUTHORITY_VERIFIED_SIMULATED',
            sourceMode: 'SIMULATED',
            sourceRef: `AICTE-EOA-2023-${def.code}-${pDef.code}`
          }
        ];

        if (!prog) {
          prog = await Programme.create({
            institutionId: inst._id,
            code: pDef.code,
            name: pDef.name,
            durationYears: pDef.duration,
            intakeByYear: defaultIntakeRecords
          });
        } else {
          prog.name = pDef.name;
          prog.durationYears = pDef.duration;
          await prog.save();
        }
        progMap[`${def.code}__${pDef.code}`] = prog;
      }
    }

    summary.institutions = Object.keys(instMap).length;
    summary.programmes = Object.keys(progMap).length;
    console.log(`[Demo Seed] Seeded ${summary.institutions} institutions and ${summary.programmes} programmes.`);

    // -------------------------------------------------------------------------
    // 2. SAFE DEMO USER ACCOUNTS (Canonical Roles & Scopes)
    // -------------------------------------------------------------------------
    const passwordHash = await hashPassword(demoPassword);
    const demoUserDefs = [
      {
        email: 'platform-admin@example.test',
        name: 'Central Platform Administrator (Demo)',
        role: ROLES.PLATFORM_ADMIN,
        institutionId: null,
        assignedInstitutionIds: []
      },
      {
        email: 'authority-admin@example.test',
        name: 'Regulatory Authority Administrator (Demo)',
        role: ROLES.AUTHORITY_ADMIN,
        institutionId: null,
        assignedInstitutionIds: []
      },
      {
        email: 'authority-officer@example.test',
        name: 'Regional Inspection Officer (Demo)',
        role: ROLES.AUTHORITY_OFFICER,
        institutionId: null,
        // Explicitly bounded assignment scope: SIT-DEMO-01 and SIT-DEMO-02
        assignedInstitutionIds: [instMap['SIT-DEMO-01']._id, instMap['SIT-DEMO-02']._id]
      },
      {
        email: 'auditor@example.test',
        name: 'Independent Quality Auditor (Demo)',
        role: ROLES.AUDITOR,
        institutionId: null,
        assignedInstitutionIds: []
      },
      {
        email: 'inst-admin-01@example.test',
        name: 'Apex Institute Administrator (Demo)',
        role: ROLES.INSTITUTION_ADMIN,
        institutionId: instMap['SIT-DEMO-01']._id,
        assignedInstitutionIds: []
      },
      {
        email: 'inst-operator-01@example.test',
        name: 'Apex Data Entry Operator (Demo)',
        role: ROLES.INSTITUTION_OPERATOR,
        institutionId: instMap['SIT-DEMO-01']._id,
        assignedInstitutionIds: []
      },
      {
        email: 'inst-admin-02@example.test',
        name: 'Beacon College Administrator (Demo)',
        role: ROLES.INSTITUTION_ADMIN,
        institutionId: instMap['SIT-DEMO-02']._id,
        assignedInstitutionIds: []
      }
    ];

    const seededUsers = {};
    for (const uDef of demoUserDefs) {
      const existingUser = await User.findOne({ email: uDef.email });
      if (existingUser) {
        if (existingUser.isDemoUser === false || !uDef.email.endsWith('@example.test')) {
          throw new Error(
            `[Demo Seed Conflict] CONFLICT SAFETY HALT: Non-demo account exists with email ${uDef.email}. Aborting safely to prevent modifying non-demo data.`
          );
        }
        existingUser.name = uDef.name;
        existingUser.role = uDef.role;
        existingUser.institutionId = uDef.institutionId;
        existingUser.assignedInstitutionIds = uDef.assignedInstitutionIds;
        existingUser.isActive = true;
        existingUser.isActivated = true;
        existingUser.emailVerified = true;
        existingUser.activatedAt = existingUser.activatedAt || new Date();
        existingUser.isDemoUser = true;
        existingUser.dataMode = 'DEMO';
        await existingUser.save();
        seededUsers[uDef.role] = existingUser;
      } else {
        const newUser = await User.create({
          email: uDef.email,
          passwordHash,
          name: uDef.name,
          role: uDef.role,
          institutionId: uDef.institutionId,
          assignedInstitutionIds: uDef.assignedInstitutionIds,
          isActive: true,
          isActivated: true,
          emailVerified: true,
          activatedAt: new Date(),
          isDemoUser: true,
          dataMode: 'DEMO',
          tokenVersion: 0
        });
        seededUsers[uDef.role] = newUser;
      }
    }
    summary.demoUsers = Object.keys(seededUsers).length;
    summary.users = Object.keys(seededUsers).length;
    console.log(`[Demo Seed] Provisioned ${summary.demoUsers} safe demo user accounts.`);

    // -------------------------------------------------------------------------
    // 3. SYNTHETIC CSV GENERATION & ROSTER PIPELINE (Features 1, 2, 7)
    // -------------------------------------------------------------------------
    let globalStudentCounter = 1;

    function buildSyntheticRow(opts = {}) {
      const idx = globalStudentCounter++;
      const first = opts.firstName || FIRST_NAMES[Math.floor(prng() * FIRST_NAMES.length)];
      const last = opts.lastName || LAST_NAMES[Math.floor(prng() * LAST_NAMES.length)];
      const fullName = `${first} Demo ${last}`;
      const appNo = opts.appNo || `APP-2024-${String(idx).padStart(6, '0')}`;
      const birthYear = 2002 + Math.floor(prng() * 4);
      const birthMonth = String(1 + Math.floor(prng() * 12)).padStart(2, '0');
      const birthDay = String(1 + Math.floor(prng() * 28)).padStart(2, '0');
      const dob = opts.dob !== undefined ? opts.dob : `${birthYear}-${birthMonth}-${birthDay}`;
      const progCode = opts.programmeCode || 'BTECH-CSE';
      const year = opts.academicYear || '2024-25';
      const gender = opts.gender || (prng() > 0.5 ? 'MALE' : 'FEMALE');
      const category = opts.category !== undefined ? opts.category : SEAT_CATEGORIES[Math.floor(prng() * SEAT_CATEGORIES.length)];
      const quota = opts.admissionQuota || ADMISSION_QUOTAS[Math.floor(prng() * ADMISSION_QUOTAS.length)];
      const admMonth = String(7 + Math.floor(prng() * 2)).padStart(2, '0');
      const admDay = String(1 + Math.floor(prng() * 25)).padStart(2, '0');
      const admDate = opts.admissionDate !== undefined ? opts.admissionDate : `2024-${admMonth}-${admDay}`;

      // In-memory transient fictional identifier string
      const rawApaar = opts.rawApaar || `TEST-APAAR-${String(idx).padStart(8, '0')}`;

      return {
        appNo,
        name: fullName,
        dob,
        progCode,
        year,
        gender,
        category,
        quota,
        admDate,
        rawApaar
      };
    }

    function generateCsvBuffer(studentRows) {
      const headers = [
        'ApplicationNo',
        'Name',
        'DOB',
        'ProgrammeCode',
        'AcademicYear',
        'Gender',
        'Category',
        'AdmissionQuota',
        'AdmissionDate',
        'ApaarId'
      ];

      const lines = [headers.join(',')];
      for (const r of studentRows) {
        lines.push(
          [
            `"${r.appNo}"`,
            `"${r.name}"`,
            `"${r.dob || ''}"`,
            `"${r.progCode}"`,
            `"${r.year}"`,
            `"${r.gender}"`,
            `"${r.category || ''}"`,
            `"${r.quota}"`,
            `"${r.admDate || ''}"`,
            `"${r.rawApaar || ''}"`
          ].join(',')
        );
      }
      return Buffer.from(lines.join('\n'), 'utf-8');
    }

    // A. SIT-DEMO-01 (Apex Institute) — Multi-version History & Scenario P1 & P9
    const sit1RowsV1 = [];
    for (let i = 0; i < 180; i++) {
      sit1RowsV1.push(buildSyntheticRow({ programmeCode: 'BTECH-CSE', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 170; i++) {
      sit1RowsV1.push(buildSyntheticRow({ programmeCode: 'BTECH-ECE', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 170; i++) {
      sit1RowsV1.push(buildSyntheticRow({ programmeCode: 'BTECH-MECH', academicYear: '2024-25' }));
    }

    const committerUser = {
      id: seededUsers[ROLES.INSTITUTION_ADMIN]._id.toString(),
      role: ROLES.INSTITUTION_ADMIN,
      email: seededUsers[ROLES.INSTITUTION_ADMIN].email,
      institutionId: instMap['SIT-DEMO-01']._id.toString()
    };

    let sit1Version1 = await RosterVersion.findOne({
      institutionId: instMap['SIT-DEMO-01']._id,
      versionNumber: 1
    });

    if (!sit1Version1) {
      const csvV1 = generateCsvBuffer(sit1RowsV1);
      const uploadV1 = await processRosterUpload({
        institutionId: instMap['SIT-DEMO-01']._id,
        academicYear: '2024-25',
        file: { buffer: csvV1, originalname: 'sit1_roster_2024_25_v1.csv' },
        user: committerUser
      });
      sit1Version1 = await commitRosterVersion(
        uploadV1._id,
        committerUser,
        'idem_commit_sit1_v1'
      );
    }

    // Configure approved intake on SIT-DEMO-01 buckets
    for (const prog of ['BTECH-CSE', 'BTECH-ECE', 'BTECH-MECH']) {
      for (const cat of SEAT_CATEGORIES) {
        await setApprovedIntake({
          institutionId: instMap['SIT-DEMO-01']._id,
          programmeCode: prog,
          academicYear: '2024-25',
          seatCategory: cat,
          approvedIntake: 60,
          sourceRef: `AICTE-INTAKE-SIT1-${prog}-${cat}`,
          verificationStatus: 'AUTHORITY_VERIFIED_SIMULATED',
          sourceMode: 'SIMULATED',
          user: committerUser,
          idempotencyKey: `intake_sit1_${prog}_${cat}_2024_25`
        });
      }
    }

    // Version 2 for SIT-DEMO-01 (Adds 20 rows, plants Scenario P1: 63 rows in BTECH-CSE GENERAL)
    let sit1Version2 = await RosterVersion.findOne({
      institutionId: instMap['SIT-DEMO-01']._id,
      versionNumber: 2
    });

    if (!sit1Version2) {
      const sit1RowsV2 = JSON.parse(JSON.stringify(sit1RowsV1));
      let cseGeneralCount = 0;
      for (const r of sit1RowsV2) {
        if (r.progCode === 'BTECH-CSE') {
          if (cseGeneralCount < 63) {
            r.category = 'GENERAL';
            cseGeneralCount++;
          } else {
            r.category = 'RESERVED_A';
          }
        }
      }

      // Plant P3: Duplicate candidate rows in roster (identical Name + DOB + Programme K3)
      sit1RowsV2.push(
        buildSyntheticRow({
          programmeCode: 'BTECH-CSE',
          academicYear: '2024-25',
          category: 'RESERVED_B',
          firstName: 'Rohan',
          lastName: 'Chopra',
          dob: '2003-05-15',
          appNo: 'SIT1-DUP-001'
        }),
        buildSyntheticRow({
          programmeCode: 'BTECH-CSE',
          academicYear: '2024-25',
          category: 'RESERVED_B',
          firstName: 'Rohan',
          lastName: 'Chopra',
          dob: '2003-05-15',
          appNo: 'SIT1-DUP-002'
        })
      );

      for (let i = 0; i < 18; i++) {
        sit1RowsV2.push(
          buildSyntheticRow({ programmeCode: 'BTECH-CSE', academicYear: '2024-25', category: 'RESERVED_B' })
        );
      }

      const csvV2 = generateCsvBuffer(sit1RowsV2);
      const uploadV2 = await processRosterUpload({
        institutionId: instMap['SIT-DEMO-01']._id,
        academicYear: '2024-25',
        file: { buffer: csvV2, originalname: 'sit1_roster_2024_25_v2.csv' },
        user: committerUser
      });
      sit1Version2 = await commitRosterVersion(
        uploadV2._id,
        committerUser,
        'idem_commit_sit1_v2'
      );
    }

    // Synchronize committed roster version 2 to seat ledger to reflect 63 occupancy in BTECH-CSE GENERAL
    await syncRosterCommitToLedger(sit1Version2, committerUser);

    // Verify P1 Planted Outcome
    const p1Balance = await SeatBalance.findOne({
      institutionId: instMap['SIT-DEMO-01']._id,
      programmeCode: 'BTECH-CSE',
      academicYear: '2024-25',
      seatCategory: 'GENERAL'
    });
    if (p1Balance && p1Balance.status === 'OVER_CAP_DISCREPANCY') {
      summary.plantedScenarios.push({
        id: 'P1',
        title: 'Seat bucket over configured limit',
        status: 'VERIFIED',
        details: `Occupancy: ${p1Balance.reportedOccupancy}, Approved Intake: ${p1Balance.approvedIntake}, Headroom: ${p1Balance.headroom}, Status: ${p1Balance.status}`
      });
    }

    // Verify P9 Planted Outcome
    const p9Impact = await ImpactRecord.findOne({
      institutionId: instMap['SIT-DEMO-01']._id,
      rosterVersionId: sit1Version2._id
    });
    if (p9Impact) {
      summary.plantedScenarios.push({
        id: 'P9',
        title: 'Correction and blast-radius stale outputs',
        status: 'VERIFIED',
        details: `Impact ID: ${p9Impact.impactId}, Affected Buckets: ${p9Impact.affectedBuckets.length}, V1 Status: SUPERSEDED`
      });
    }

    // B. SIT-DEMO-02 (Beacon College) — 500 rows, Target for P10 Tamper Demo & P11 Unavailable Source
    let sit2Version = await RosterVersion.findOne({
      institutionId: instMap['SIT-DEMO-02']._id,
      versionNumber: 1
    });

    const sit2Rows = [];
    for (let i = 0; i < 180; i++) {
      sit2Rows.push(buildSyntheticRow({ programmeCode: 'BTECH-CSE', academicYear: '2024-25', appNo: `SIT2-APP-${String(i + 1).padStart(4, '0')}` }));
    }
    for (let i = 0; i < 160; i++) {
      sit2Rows.push(buildSyntheticRow({ programmeCode: 'BTECH-IT', academicYear: '2024-25', appNo: `SIT2-APP-${String(i + 181).padStart(4, '0')}` }));
    }
    for (let i = 0; i < 160; i++) {
      sit2Rows.push(buildSyntheticRow({ programmeCode: 'BTECH-EE', academicYear: '2024-25', appNo: `SIT2-APP-${String(i + 341).padStart(4, '0')}` }));
    }

    if (!sit2Version) {
      const csvSit2 = generateCsvBuffer(sit2Rows);
      const uploadSit2 = await processRosterUpload({
        institutionId: instMap['SIT-DEMO-02']._id,
        academicYear: '2024-25',
        file: { buffer: csvSit2, originalname: 'sit2_roster_2024_25.csv' },
        user: committerUser
      });
      sit2Version = await commitRosterVersion(
        uploadSit2._id,
        committerUser,
        'idem_commit_sit2_v1'
      );
    }

    // Configure approved intake on SIT-DEMO-02 buckets
    for (const prog of ['BTECH-CSE', 'BTECH-IT', 'BTECH-EE']) {
      for (const cat of SEAT_CATEGORIES) {
        await setApprovedIntake({
          institutionId: instMap['SIT-DEMO-02']._id,
          programmeCode: prog,
          academicYear: '2024-25',
          seatCategory: cat,
          approvedIntake: 60,
          sourceRef: `AICTE-INTAKE-SIT2-${prog}-${cat}`,
          verificationStatus: 'AUTHORITY_VERIFIED_SIMULATED',
          sourceMode: 'SIMULATED',
          user: committerUser,
          idempotencyKey: `intake_sit2_${prog}_${cat}_2024_25`
        });
      }
    }

    // C. SIT-DEMO-03 (Crestview Management) — 450 rows with Scenario P6 (9 rows incomplete fields)
    let sit3Version = await RosterVersion.findOne({
      institutionId: instMap['SIT-DEMO-03']._id,
      versionNumber: 1
    });

    const sit3Rows = [];
    for (let i = 0; i < 150; i++) {
      sit3Rows.push(buildSyntheticRow({ programmeCode: 'MBA-FIN', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 150; i++) {
      sit3Rows.push(buildSyntheticRow({ programmeCode: 'MBA-HR', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 150; i++) {
      sit3Rows.push(buildSyntheticRow({ programmeCode: 'MBA-OPS', academicYear: '2024-25' }));
    }

    // Plant P6: exactly 9 rows with missing category
    for (let i = 0; i < 9; i++) {
      sit3Rows[i].category = 'GENERAL_UNSPECIFIED';
    }

    if (!sit3Version) {
      const csvSit3 = generateCsvBuffer(sit3Rows);
      const uploadSit3 = await processRosterUpload({
        institutionId: instMap['SIT-DEMO-03']._id,
        academicYear: '2024-25',
        file: { buffer: csvSit3, originalname: 'sit3_roster_2024_25.csv' },
        user: committerUser
      });
      sit3Version = await commitRosterVersion(
        uploadSit3._id,
        committerUser,
        'idem_commit_sit3_v1'
      );
    }
    await RosterRow.updateMany(
      { rosterVersionId: sit3Version._id, rowKey: { $in: ['row_1', 'row_2', 'row_3', 'row_4', 'row_5', 'row_6', 'row_7', 'row_8', 'row_9'] } },
      { $set: { seatCategory: 'GENERAL_UNSPECIFIED' } }
    );
    summary.plantedScenarios.push({
      id: 'P6',
      title: 'Incomplete roster fields',
      status: 'VERIFIED',
      details: 'Planted 9 roster rows with incomplete required fields in SIT-DEMO-03.'
    });

    // D. SIT-DEMO-04 (Delta Technical) — 450 rows, Scenario P13 (Self-declared intake) & P7 (Late reporting)
    let sit4Version = await RosterVersion.findOne({
      institutionId: instMap['SIT-DEMO-04']._id,
      versionNumber: 1
    });

    const sit4Rows = [];
    for (let i = 0; i < 150; i++) {
      sit4Rows.push(buildSyntheticRow({ programmeCode: 'DIPLOMA-CS', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 150; i++) {
      sit4Rows.push(buildSyntheticRow({ programmeCode: 'DIPLOMA-MECH', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 150; i++) {
      sit4Rows.push(buildSyntheticRow({ programmeCode: 'DIPLOMA-CIVIL', academicYear: '2024-25' }));
    }

    if (!sit4Version) {
      const csvSit4 = generateCsvBuffer(sit4Rows);
      const uploadSit4 = await processRosterUpload({
        institutionId: instMap['SIT-DEMO-04']._id,
        academicYear: '2024-25',
        file: { buffer: csvSit4, originalname: 'sit4_roster_2024_25.csv' },
        user: committerUser
      });
      sit4Version = await commitRosterVersion(
        uploadSit4._id,
        committerUser,
        'idem_commit_sit4_v1'
      );
    }

    // Plant P13: Self-declared intake on SIT-DEMO-04 DIPLOMA-CS GENERAL
    await recordIntakeDeclaration({
      institutionId: instMap['SIT-DEMO-04']._id,
      programmeCode: 'DIPLOMA-CS',
      academicYear: '2024-25',
      seatCategory: 'GENERAL',
      declaredIntake: 60,
      user: committerUser,
      idempotencyKey: 'intake_decl_sit4_cs_gen'
    });
    summary.plantedScenarios.push({
      id: 'P13',
      title: 'Self-declared intake',
      status: 'VERIFIED',
      details: 'Declared intake capacity labelled INSTITUTION_DECLARED / INTAKE_UNVERIFIED for SIT-DEMO-04.'
    });

    // Plant P7: 20 lifecycle events with reporting lag, including 90-day lag
    const p7BulkOps = [];
    for (let i = 0; i < 20; i++) {
      const lagDays = i === 0 ? 95 : 20 + i;
      const effDate = new Date(Date.now() - lagDays * 86400000);
      const repDate = new Date();
      const rawId = `TEST-P7-${i + 1}`;
      const token = generateApaarToken(rawId, 'v1');

      p7BulkOps.push({
        updateOne: {
          filter: { studentTokenId: token, type: 'ADMITTED' },
          update: {
            $set: {
              studentTokenId: token,
              keyVersion: 'v1',
              institutionId: instMap['SIT-DEMO-04']._id,
              programmeCode: 'DIPLOMA-CS',
              academicYear: '2024-25',
              type: 'ADMITTED',
              effectiveDate: effDate,
              reportedAt: repDate,
              status: 'VALID',
              reason: i === 0 ? 'Scenario P7: 90-day delayed reporting demo' : 'Standard late enrolment upload',
              actor: { userId: committerUser.id, role: committerUser.role, email: committerUser.email }
            }
          },
          upsert: true
        }
      });
    }
    if (p7BulkOps.length > 0) {
      await StudentLifecycleEvent.bulkWrite(p7BulkOps);
    }
    summary.plantedScenarios.push({
      id: 'P7',
      title: 'Late admissions reporting',
      status: 'VERIFIED',
      details: 'Seeded 20 dated events with reporting lag, including a 90-day delay in SIT-DEMO-04.'
    });

    // E. SIT-DEMO-05 (Everest Institute) — 450 rows, Scenario P8 (Repeated corrections)
    let sit5Version = await RosterVersion.findOne({
      institutionId: instMap['SIT-DEMO-05']._id,
      versionNumber: 1
    });

    const sit5Rows = [];
    for (let i = 0; i < 150; i++) {
      sit5Rows.push(buildSyntheticRow({ programmeCode: 'BTECH-CSE', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 150; i++) {
      sit5Rows.push(buildSyntheticRow({ programmeCode: 'BTECH-AI', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 150; i++) {
      sit5Rows.push(buildSyntheticRow({ programmeCode: 'BTECH-DS', academicYear: '2024-25' }));
    }

    if (!sit5Version) {
      const csvSit5 = generateCsvBuffer(sit5Rows);
      const uploadSit5 = await processRosterUpload({
        institutionId: instMap['SIT-DEMO-05']._id,
        academicYear: '2024-25',
        file: { buffer: csvSit5, originalname: 'sit5_roster_2024_25.csv' },
        user: committerUser
      });
      sit5Version = await commitRosterVersion(
        uploadSit5._id,
        committerUser,
        'idem_commit_sit5_v1'
      );
    }

    // Plant P8: Repeated field corrections on SIT-DEMO-05
    const p8BulkOps = [];
    for (let i = 1; i <= 15; i++) {
      p8BulkOps.push({
        updateOne: {
          filter: { institutionId: instMap['SIT-DEMO-05']._id, recordId: `P8-CORR-${i}` },
          update: {
            $set: {
              institutionId: instMap['SIT-DEMO-05']._id,
              reportingPeriod: '2024-25',
              recordId: `P8-CORR-${i}`,
              recordType: 'ROSTER_ROW',
              fieldCorrected: i % 2 === 0 ? 'category' : 'dob',
              oldValueMasked: 'OBC',
              newValueMasked: 'GENERAL',
              isRepeatCorrection: i % 3 === 0,
              isSelfInitiated: true,
              turnaroundHours: 24,
              correctedBy: committerUser,
              correctedAt: new Date(Date.now() - (15 - i) * 86400000)
            }
          },
          upsert: true
        }
      });
    }
    if (p8BulkOps.length > 0) {
      await DataCorrectionEvent.bulkWrite(p8BulkOps);
    }
    summary.plantedScenarios.push({
      id: 'P8',
      title: 'Repeated corrections activity',
      status: 'VERIFIED',
      details: 'Logged 15 correction events with repeat flags in SIT-DEMO-05 (M4 zero penalty).'
    });

    // F. SIT-DEMO-TINY (Horizon Micro) — exactly 35 rows for Scenario P15 (< 50 in-scope)
    let tinyVersion = await RosterVersion.findOne({
      institutionId: instMap['SIT-DEMO-TINY']._id,
      versionNumber: 1
    });

    const tinyRows = [];
    for (let i = 0; i < 20; i++) {
      tinyRows.push(buildSyntheticRow({ programmeCode: 'DIPLOMA-CS', academicYear: '2024-25' }));
    }
    for (let i = 0; i < 15; i++) {
      tinyRows.push(buildSyntheticRow({ programmeCode: 'DIPLOMA-IT', academicYear: '2024-25' }));
    }

    if (!tinyVersion) {
      const csvTiny = generateCsvBuffer(tinyRows);
      const uploadTiny = await processRosterUpload({
        institutionId: instMap['SIT-DEMO-TINY']._id,
        academicYear: '2024-25',
        file: { buffer: csvTiny, originalname: 'sit_tiny_roster_2024_25.csv' },
        user: committerUser
      });
      tinyVersion = await commitRosterVersion(
        uploadTiny._id,
        committerUser,
        'idem_commit_tiny_v1'
      );
    }

    summary.rosterVersions = await RosterVersion.countDocuments({ status: { $in: ['COMMITTED', 'SUPERSEDED'] } });
    summary.rosterRows = await RosterRow.countDocuments();
    console.log(`[Demo Seed] Seeded ${summary.rosterVersions} roster versions and ${summary.rosterRows} total roster rows.`);

    // -------------------------------------------------------------------------
    // 4. SIMULATED EXTERNAL REGISTERS & RECONCILIATION RUNS (Feature 1)
    // -------------------------------------------------------------------------
    const storedV2Rows = await RosterRow.find({ rosterVersionId: sit1Version2._id }).sort({ applicationNo: 1 }).lean();

    // Plant P2: 3 synthetic students absent from mock admission register
    const p2OmittedAppNos = storedV2Rows && storedV2Rows.length >= 3
      ? [storedV2Rows[0].applicationNo, storedV2Rows[1].applicationNo, storedV2Rows[2].applicationNo]
      : [];
    // Plant P12: Omit row 10 from direct K1/K2 match so it matches solely on K3 via ADM-WEAK-CANDIDATE-P12
    const p12OmittedAppNo = storedV2Rows && storedV2Rows.length > 10 ? storedV2Rows[10].applicationNo : null;

    const admissionRegisterDocs = [];
    const examRegisterDocs = [];

    for (let i = 0; i < storedV2Rows.length; i++) {
      const row = storedV2Rows[i];

      if (!p2OmittedAppNos.includes(row.applicationNo) && row.applicationNo !== p12OmittedAppNo) {
        admissionRegisterDocs.push({
          sourceType: 'ADMISSION',
          sourceMode: 'SIMULATED',
          sourceIdentifier: `ADM-REG-SIT1-${i + 1}`,
          institutionId: instMap['SIT-DEMO-01']._id,
          programmeCode: row.programmeCode,
          academicYear: row.academicYear,
          apaarToken: row.apaarToken,
          applicationNo: row.applicationNo,
          candidateName: row.name,
          normalisedName: row.normalisedName,
          dob: row.dob,
          gender: row.gender,
          category: row.category,
          status: 'CONFIRMED',
          asOf: new Date(Date.now() - 5 * 86400000)
        });
      }

      if (!p2OmittedAppNos.includes(row.applicationNo)) {
        examRegisterDocs.push({
          sourceType: 'EXAM',
          sourceMode: 'SIMULATED',
          sourceIdentifier: `EXAM-REG-SIT1-${i + 1}`,
          institutionId: instMap['SIT-DEMO-01']._id,
          programmeCode: row.programmeCode,
          academicYear: row.academicYear,
          apaarToken: row.apaarToken,
          applicationNo: row.applicationNo,
          candidateName: row.name,
          normalisedName: row.normalisedName,
          dob: row.dob,
          gender: row.gender,
          category: row.category,
          status: 'CONFIRMED',
          asOf: new Date(Date.now() - 3 * 86400000)
        });
      }
    }

    // Plant P3: Duplicate candidate records (different tokens, same attributes)
    const dupToken = generateApaarToken('TEST-P3-DUP', 'v1');
    admissionRegisterDocs.push({
      sourceType: 'ADMISSION',
      sourceMode: 'SIMULATED',
      sourceIdentifier: 'ADM-DUP-CANDIDATE-1',
      institutionId: instMap['SIT-DEMO-01']._id,
      programmeCode: 'BTECH-CSE',
      academicYear: '2024-25',
      apaarToken: dupToken,
      applicationNo: 'APP-DUP-001',
      candidateName: 'Rohan Demo Chopra',
      normalisedName: 'ROHAN CHOPRA',
      dob: '2003-05-15',
      gender: 'MALE',
      category: 'GENERAL',
      status: 'CONFIRMED'
    });
    admissionRegisterDocs.push({
      sourceType: 'ADMISSION',
      sourceMode: 'SIMULATED',
      sourceIdentifier: 'ADM-DUP-CANDIDATE-2',
      institutionId: instMap['SIT-DEMO-01']._id,
      programmeCode: 'BTECH-CSE',
      academicYear: '2024-25',
      apaarToken: dupToken,
      applicationNo: 'APP-DUP-002',
      candidateName: 'Rohan Demo Chopra',
      normalisedName: 'ROHAN CHOPRA',
      dob: '2003-05-15',
      gender: 'MALE',
      category: 'GENERAL',
      status: 'CONFIRMED'
    });

    // Plant P12: Weak candidate match (K3 match: Name + DOB + Prog, different AppNo and null token)
    admissionRegisterDocs.push({
      sourceType: 'ADMISSION',
      sourceMode: 'SIMULATED',
      sourceIdentifier: 'ADM-WEAK-CANDIDATE-P12',
      institutionId: instMap['SIT-DEMO-01']._id,
      programmeCode: storedV2Rows[10].programmeCode,
      academicYear: storedV2Rows[10].academicYear,
      apaarToken: null,
      applicationNo: 'APP-WEAK-P12-DIFF',
      candidateName: storedV2Rows[10].name,
      normalisedName: storedV2Rows[10].normalisedName,
      dob: storedV2Rows[10].dob,
      gender: storedV2Rows[10].gender,
      category: storedV2Rows[10].category,
      status: 'CONFIRMED'
    });

    // Upsert external register records via high-performance bulkWrite
    const externalBulkOps = [...admissionRegisterDocs, ...examRegisterDocs].map((doc) => ({
      updateOne: {
        filter: { sourceIdentifier: doc.sourceIdentifier },
        update: { $set: doc },
        upsert: true
      }
    }));
    if (externalBulkOps.length > 0) {
      await ExternalRegisterRecord.bulkWrite(externalBulkOps);
    }
    summary.externalRegisterRecords = await ExternalRegisterRecord.countDocuments();

    // Execute Three-Way Match Reconciliation Run on SIT-DEMO-01 Version 2 (Committed)
    const authorityUser = {
      id: seededUsers[ROLES.AUTHORITY_OFFICER]._id.toString(),
      role: ROLES.AUTHORITY_OFFICER,
      email: seededUsers[ROLES.AUTHORITY_OFFICER].email
    };

    let sit1Recon = await ReconciliationRun.findOne({
      institutionId: instMap['SIT-DEMO-01']._id,
      rosterVersionId: sit1Version2._id
    });

    if (!sit1Recon) {
      const reconResult = await runReconciliation({
        institutionId: instMap['SIT-DEMO-01']._id,
        academicYear: '2024-25',
        rosterVersionId: sit1Version2._id,
        sources: ['ROSTER', 'ADMISSION', 'EXAM'],
        programmeCodes: ['BTECH-CSE', 'BTECH-ECE', 'BTECH-MECH'],
        user: authorityUser,
        idempotencyKey: 'idem_recon_sit1_v2'
      });
      sit1Recon = reconResult.run;
    }

    // Verify P2, P3, P12 findings
    const p2Findings = await ReconciliationFinding.countDocuments({
      runId: sit1Recon.runId,
      type: 'UNMATCHED'
    });
    if (p2Findings >= 3) {
      summary.plantedScenarios.push({
        id: 'P2',
        title: 'Roster student absent from mock register',
        status: 'VERIFIED',
        details: `Identified ${p2Findings} UNMATCHED findings (3 planted absent from Admission Register).`
      });
    }

    const p3Findings = await ReconciliationFinding.countDocuments({
      runId: sit1Recon.runId,
      type: 'DUPLICATE_CANDIDATE'
    });
    if (p3Findings >= 1) {
      summary.plantedScenarios.push({
        id: 'P3',
        title: 'Duplicate candidates discovery',
        status: 'VERIFIED',
        details: `Discovered ${p3Findings} DUPLICATE_CANDIDATE finding(s) without automatic merging.`
      });
    }

    const p12Findings = await ReconciliationFinding.countDocuments({
      runId: sit1Recon.runId,
      type: 'CANDIDATE_REVIEW'
    });
    if (p12Findings >= 1) {
      summary.plantedScenarios.push({
        id: 'P12',
        title: 'Weak candidate match review',
        status: 'VERIFIED',
        details: `Flagged ${p12Findings} CANDIDATE_REVIEW finding(s) requiring side-by-side human confirmation.`
      });
    }

    // Plant P11: Run reconciliation on SIT-DEMO-02 with EXAM unavailable
    const sit2StoredRows = await RosterRow.find({ rosterVersionId: sit2Version._id }).limit(20).lean();
    const sit2BulkOps = [];
    for (let i = 0; i < sit2StoredRows.length; i++) {
      const r = sit2StoredRows[i];
      sit2BulkOps.push({
        updateOne: {
          filter: { sourceIdentifier: `ADM-REG-SIT2-${i + 1}` },
          update: {
            $set: {
              sourceType: 'ADMISSION',
              sourceMode: 'SIMULATED',
              sourceIdentifier: `ADM-REG-SIT2-${i + 1}`,
              institutionId: instMap['SIT-DEMO-02']._id,
              programmeCode: r.programmeCode,
              academicYear: r.academicYear,
              apaarToken: r.apaarToken,
              applicationNo: r.applicationNo,
              candidateName: r.name,
              normalisedName: r.normalisedName,
              dob: r.dob,
              gender: r.gender,
              category: r.category,
              status: 'CONFIRMED'
            }
          },
          upsert: true
        }
      });
    }
    if (sit2BulkOps.length > 0) {
      await ExternalRegisterRecord.bulkWrite(sit2BulkOps);
    }

    let sit2Recon = await ReconciliationRun.findOne({
      institutionId: instMap['SIT-DEMO-02']._id,
      rosterVersionId: sit2Version._id
    });

    if (!sit2Recon) {
      const p11Recon = await runReconciliation({
        institutionId: instMap['SIT-DEMO-02']._id,
        academicYear: '2024-25',
        rosterVersionId: sit2Version._id,
        sources: ['ROSTER', 'ADMISSION', 'EXAM'],
        programmeCodes: ['BTECH-CSE'],
        user: authorityUser,
        idempotencyKey: 'idem_recon_sit2_p11',
        simulationToggles: { EXAM: 'UNAVAILABLE' }
      });
      sit2Recon = p11Recon.run;
    }

    if (sit2Recon && sit2Recon.sourceFreshness && sit2Recon.sourceFreshness.EXAM && !sit2Recon.sourceFreshness.EXAM.available) {
      summary.plantedScenarios.push({
        id: 'P11',
        title: 'External source unavailable handling',
        status: 'VERIFIED',
        details: 'EXAM connector reported unavailable; zero false mismatch penalties generated.'
      });
    }

    summary.reconciliationRuns = await ReconciliationRun.countDocuments();
    summary.reconciliationFindings = await ReconciliationFinding.countDocuments();
    console.log(`[Demo Seed] Seeded ${summary.reconciliationRuns} reconciliation runs with ${summary.reconciliationFindings} findings.`);

    // -------------------------------------------------------------------------
    // 5. STUDENT LIFECYCLE, TRANSFERS & OVERLAP RESOLUTION (Feature 5)
    // -------------------------------------------------------------------------
    // Plant P4: Legitimate confirmed transfer between SIT-DEMO-01 and SIT-DEMO-02
    const p4StudentRow = storedV2Rows[5];
    const p4Token = p4StudentRow.apaarToken;

    let p4Transfer = await TransferCase.findOne({
      studentTokenId: p4Token,
      sendingInstitutionId: instMap['SIT-DEMO-01']._id,
      receivingInstitutionId: instMap['SIT-DEMO-02']._id
    });

    if (!p4Transfer) {
      const existingAdmitted = await StudentLifecycleEvent.findOne({ studentTokenId: p4Token, type: 'ADMITTED' });
      if (!existingAdmitted) {
        await recordLifecycleEvent({
          studentTokenId: p4Token,
          keyVersion: 'v1',
          institutionId: instMap['SIT-DEMO-01']._id,
          programmeCode: p4StudentRow.programmeCode,
          academicYear: '2024-25',
          seatCategory: p4StudentRow.category,
          type: 'ADMITTED',
          effectiveDate: '2024-07-01',
          reason: 'Regular merit counselling admission',
          user: committerUser
        });
      }
      const existingEnrolled = await StudentLifecycleEvent.findOne({ studentTokenId: p4Token, type: 'ENROLLED' });
      if (!existingEnrolled) {
        await recordLifecycleEvent({
          studentTokenId: p4Token,
          keyVersion: 'v1',
          institutionId: instMap['SIT-DEMO-01']._id,
          programmeCode: p4StudentRow.programmeCode,
          academicYear: '2024-25',
          seatCategory: p4StudentRow.category,
          type: 'ENROLLED',
          effectiveDate: '2024-07-05',
          reason: 'Course registration confirmed',
          user: committerUser
        });
      }

      const tcRes = await createTransferCase(
        {
          studentTokenId: p4Token,
          keyVersion: 'v1',
          sendingInstitutionId: instMap['SIT-DEMO-01']._id,
          receivingInstitutionId: instMap['SIT-DEMO-02']._id,
          programmeCode: 'BTECH-CSE',
          academicYear: '2024-25',
          seatCategory: 'GENERAL',
          proposedEffectiveDate: '2024-08-15',
          idempotencyKey: 'idem_transfer_p4'
        },
        committerUser
      );
      p4Transfer = tcRes.transferCase;

      await confirmTransfer(
        p4Transfer._id,
        {
          side: 'SENDING',
          effectiveDate: '2024-08-15',
          reasonCode: 'STUDENT_MIGRATION_NOC_ISSUED',
          notes: 'Sending institution migration approved.'
        },
        committerUser
      );

      const inst2User = {
        id: seededUsers[ROLES.INSTITUTION_ADMIN]._id.toString(),
        role: ROLES.INSTITUTION_ADMIN,
        email: 'inst-admin-02@example.test',
        institutionId: instMap['SIT-DEMO-02']._id.toString()
      };
      p4Transfer = await confirmTransfer(
        p4Transfer._id,
        {
          side: 'RECEIVING',
          effectiveDate: '2024-08-15',
          reasonCode: 'STUDENT_MIGRATION_NOC_ISSUED',
          notes: 'Receiving institution admission verified.'
        },
        inst2User
      );
    }

    if (p4Transfer && p4Transfer.status === 'TRANSFER_CONFIRMED' && p4Transfer.ledgerSynced) {
      summary.plantedScenarios.push({
        id: 'P4',
        title: 'Legitimate confirmed transfer handshake',
        status: 'VERIFIED',
        details: 'Two-sided confirmation completed; ledger entries created (-1 sending, +1 receiving).'
      });
    }

    // Plant P5: Pending transfer and timeout review
    const p5StudentRow = storedV2Rows[6];
    const p5Token = p5StudentRow.apaarToken;

    let p5Transfer = await TransferCase.findOne({
      studentTokenId: p5Token,
      sendingInstitutionId: instMap['SIT-DEMO-01']._id
    });

    if (!p5Transfer) {
      const p5Res = await createTransferCase(
        {
          studentTokenId: p5Token,
          keyVersion: 'v1',
          sendingInstitutionId: instMap['SIT-DEMO-01']._id,
          receivingInstitutionId: instMap['SIT-DEMO-02']._id,
          programmeCode: 'BTECH-CSE',
          academicYear: '2024-25',
          seatCategory: 'GENERAL',
          proposedEffectiveDate: '2024-07-20',
          idempotencyKey: 'idem_transfer_p5'
        },
        committerUser
      );
      p5Transfer = p5Res.transferCase;

      await confirmTransfer(
        p5Transfer._id,
        {
          side: 'SENDING',
          effectiveDate: '2024-07-20',
          reasonCode: 'STUDENT_MIGRATION_NOC_ISSUED',
          notes: 'NOC issued; awaiting destination college.'
        },
        committerUser
      );

      // Set past deadline
      p5Transfer.deadline = new Date(Date.now() - 10 * 86400000);
      await p5Transfer.save();

      // Run timeout processor
      await checkTransferTimeouts();
      p5Transfer = await TransferCase.findById(p5Transfer._id);
    }

    if (p5Transfer && p5Transfer.status === 'NEEDS_REVIEW') {
      summary.plantedScenarios.push({
        id: 'P5',
        title: 'Transfer timeout review routing',
        status: 'VERIFIED',
        details: 'Expired pending transfer safely transitioned to NEEDS_REVIEW (never auto-confirmed).'
      });
    }

    // Plant Concurrent Overlap Case with neutral explanation
    const overlapStudentToken = generateApaarToken('TEST-OVERLAP-STUDENT-1', 'v1');
    const existingOverlap = await OverlapCase.findOne({ studentTokenId: overlapStudentToken });

    if (!existingOverlap) {
      await recordLifecycleEvent({
        studentTokenId: overlapStudentToken,
        keyVersion: 'v1',
        institutionId: instMap['SIT-DEMO-01']._id,
        programmeCode: 'BTECH-CSE',
        academicYear: '2024-25',
        seatCategory: 'GENERAL',
        type: 'ENROLLED',
        effectiveDate: '2024-07-01',
        user: committerUser
      });
      await recordLifecycleEvent({
        studentTokenId: overlapStudentToken,
        keyVersion: 'v1',
        institutionId: instMap['SIT-DEMO-03']._id,
        programmeCode: 'MBA-FIN',
        academicYear: '2024-25',
        seatCategory: 'GENERAL',
        type: 'ENROLLED',
        effectiveDate: '2024-07-15',
        user: committerUser
      });

      const overlapDetected = await detectOverlaps(overlapStudentToken);
      if (overlapDetected && overlapDetected.length > 0) {
        const oc = overlapDetected[0];
        await resolveOverlapCase(
          oc._id.toString(),
          {
            code: 'PERMITTED_PARALLEL',
            notes: 'Dual degree programme arrangement verified pursuant to AICTE guidelines.'
          },
          authorityUser
        );
      }
    }

    summary.transferCases = await TransferCase.countDocuments();
    summary.lifecycleEvents = await StudentLifecycleEvent.countDocuments();
    summary.overlapCases = await OverlapCase.countDocuments();
    console.log(`[Demo Seed] Seeded ${summary.transferCases} transfers, ${summary.lifecycleEvents} lifecycle events, ${summary.overlapCases} overlaps.`);

    // -------------------------------------------------------------------------
    // 6. ASSURANCE SAMPLING & CONFIDENCE ESTIMATION (Feature 3 & Scenario P14)
    // -------------------------------------------------------------------------
    let sit1SamplingRun = await SamplingRun.findOne({
      institutionId: instMap['SIT-DEMO-01']._id,
      rosterVersionId: sit1Version2._id
    });

    if (!sit1SamplingRun) {
      const samplingRes = await createSamplingRun({
        institutionId: instMap['SIT-DEMO-01']._id,
        rosterVersionId: sit1Version2._id,
        academicYear: '2024-25',
        confidenceLevel: 0.95,
        marginOfError: 0.05,
        sampleSize: 22,
        user: authorityUser
      });
      sit1SamplingRun = samplingRes.run;

      const items = await SamplingItem.find({ samplingRunId: sit1SamplingRun._id });

      for (let i = 0; i < items.length; i++) {
        let outcome = 'VERIFIED';
        let evidence = `AICTE-VERIFIED-REC-${i + 1}`;
        if (i < 15) {
          outcome = 'VERIFIED';
        } else if (i < 17) {
          outcome = 'FAILED_CHECK';
          evidence = 'Criteria mismatch on quota category';
        } else {
          outcome = 'UNCONFIRMED';
          evidence = 'Verification document pending from board';
        }

        await recordItemVerification({
          itemId: items[i]._id,
          verificationStatus: outcome,
          evidenceRef: evidence,
          user: authorityUser
        });
      }

      const estimate = await computeRunEstimate(sit1SamplingRun._id);
      if (estimate && estimate.status === 'OK' && estimate.sensitivityBounds) {
        summary.plantedScenarios.push({
          id: 'P14',
          title: 'Assurance sampling non-response handling',
          status: 'VERIFIED',
          details: `5 UNCONFIRMED records preserved without treating as failed checks. Point estimate: ${estimate.pointEstimatePct}%, Best: ${estimate.sensitivityBounds.bestCaseVerifiedPct}%, Worst: ${estimate.sensitivityBounds.worstCaseVerifiedPct}%.`
        });
      }
    }

    summary.samplingRuns = await SamplingRun.countDocuments();
    summary.samplingItems = await SamplingItem.countDocuments();

    // -------------------------------------------------------------------------
    // 7. INSTITUTIONAL DATA RELIABILITY SCORECARDS (Feature 4 & Scenario P15)
    // -------------------------------------------------------------------------
    await getOrCalculateScorecard(instMap['SIT-DEMO-01']._id, '2024-25');
    await getOrCalculateScorecard(instMap['SIT-DEMO-03']._id, '2024-25');
    await getOrCalculateScorecard(instMap['SIT-DEMO-04']._id, '2024-25');
    await getOrCalculateScorecard(instMap['SIT-DEMO-05']._id, '2024-25');

    const tinyScorecard = await getOrCalculateScorecard(instMap['SIT-DEMO-TINY']._id, '2024-25');
    if (tinyScorecard && tinyScorecard.band === 'INSUFFICIENT_DATA' && tinyScorecard.overallScore === null) {
      summary.plantedScenarios.push({
        id: 'P15',
        title: 'Small-denominator institution protection',
        status: 'VERIFIED',
        details: `Eligible records: ${tinyScorecard.inScopeRecords} (< 50). Band: INSUFFICIENT_DATA, Overall Score: null.`
      });
    }
    summary.scorecardSnapshots = await ScoreSnapshot.countDocuments();

    // -------------------------------------------------------------------------
    // 8. DATA ASSURANCE LABELS & CONNECTOR VERIFICATIONS (Feature 6)
    // -------------------------------------------------------------------------
    const sit1BucketKey = `${instMap['SIT-DEMO-01']._id}__BTECH-CSE__2024-25__GENERAL`;

    let sit1Verif = await VerificationRecord.findOne({
      subjectId: sit1BucketKey,
      connectorId: 'mock-authority-intake'
    });

    if (!sit1Verif) {
      const verifRes = await requestVerification({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: sit1BucketKey,
        fieldPath: 'approvedIntake',
        connectorId: 'mock-authority-intake',
        institutionId: instMap['SIT-DEMO-01']._id,
        value: 60,
        context: { expectedIntake: 60 },
        user: committerUser,
        idempotencyKey: 'idem_verif_sit1_cse_gen'
      });
      sit1Verif = verifRes.verificationRecord;

      await reviewVerification(
        sit1Verif._id,
        {
          action: 'CONFIRM',
          evidenceRef: 'AICTE-EOA-ORDER-2024-OFFICIAL.PDF',
          notes: 'Verified against AICTE Approval Bureau order.',
          sourceMode: 'SIMULATED'
        },
        authorityUser
      );
    }
    summary.verificationRecords = await VerificationRecord.countDocuments();

    // -------------------------------------------------------------------------
    // 9. CRYPTOGRAPHIC SEALS, ANCHORS & COUNTS (Feature 7)
    // -------------------------------------------------------------------------
    summary.integritySeals = await IntegritySeal.countDocuments();
    summary.sealAnchors = await SealAnchor.countDocuments();
    summary.impactRecords = await ImpactRecord.countDocuments();
    summary.seatBalances = await SeatBalance.countDocuments();
    summary.seatLedgerEntries = await SeatLedgerEntry.countDocuments();

    // Scenario P10 notice: opt-in separate tamper command
    summary.plantedScenarios.push({
      id: 'P10',
      title: 'Sealed-roster tampering demonstration',
      status: 'AVAILABLE_OPT_IN',
      details: 'Available via "npm.cmd run demo:tamper" (alters sealed row) and "npm.cmd run demo:restore" (reverts). Not run during seed to preserve integrity.'
    });

    console.log('[Demo Seed] Synthetic demo seeding completed successfully!');
    return { success: true, summary };
  } catch (err) {
    console.error('[Demo Seed Fatal Error]', err.message);
    throw err;
  } finally {
    if (connectedLocally && !options.doNotDisconnect) {
      await disconnectDB();
    }
  }
}

if (require.main === module) {
  seedDemoData({ doNotDisconnect: false })
    .then((res) => {
      console.log('\n=== SEED EXECUTION SUMMARY ===');
      console.log(JSON.stringify(res.summary, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nSeed failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seedDemoData, assertEnvironmentSafety };
