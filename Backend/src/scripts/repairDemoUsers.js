const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
require('../config/dns').configureDns();

const mongoose = require('mongoose');
const { hashPassword, verifyPassword } = require('../utils/passwordCrypto');

const User = require('../models/user.model');
const Institution = require('../models/institution.model');

async function repair() {
  console.log('[Repair] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);

  const instApex = await Institution.findOne({ code: 'SIT-DEMO-01' });
  const instBeacon = await Institution.findOne({ code: 'SIT-DEMO-02' });

  const demoPassword = process.env.DEMO_SEED_PASSWORD || 'DemoSeed2026!Secure';
  console.log('[Repair] Hashing demo password with scrypt...');
  const passwordHash = await hashPassword(demoPassword);

  const demoUsers = [
    {
      email: 'platform-admin@example.test',
      name: 'Central Platform Administrator (Demo)',
      role: 'PLATFORM_ADMIN',
      institutionId: null,
      assignedInstitutionIds: []
    },
    {
      email: 'authority-admin@example.test',
      name: 'Regulatory Authority Administrator (Demo)',
      role: 'AUTHORITY_ADMIN',
      institutionId: null,
      assignedInstitutionIds: []
    },
    {
      email: 'authority-officer@example.test',
      name: 'Regional Inspection Officer (Demo)',
      role: 'AUTHORITY_OFFICER',
      institutionId: null,
      assignedInstitutionIds: instApex && instBeacon ? [instApex._id, instBeacon._id] : []
    },
    {
      email: 'auditor@example.test',
      name: 'Independent Quality Auditor (Demo)',
      role: 'AUDITOR',
      institutionId: null,
      assignedInstitutionIds: []
    },
    {
      email: 'inst-admin-01@example.test',
      name: 'Apex Institute Administrator (Demo)',
      role: 'INSTITUTION_ADMIN',
      institutionId: instApex?._id || null,
      assignedInstitutionIds: []
    },
    {
      email: 'inst-operator-01@example.test',
      name: 'Apex Data Entry Operator (Demo)',
      role: 'INSTITUTION_OPERATOR',
      institutionId: instApex?._id || null,
      assignedInstitutionIds: []
    },
    {
      email: 'inst-admin-02@example.test',
      name: 'Beacon College Administrator (Demo)',
      role: 'INSTITUTION_ADMIN',
      institutionId: instBeacon?._id || null,
      assignedInstitutionIds: []
    }
  ];

  for (const u of demoUsers) {
    let doc = await User.findOne({ email: u.email }).select('+passwordHash');
    if (!doc) {
      console.log(`[Repair] Creating missing demo account: ${u.email}`);
      doc = new User({
        email: u.email,
        name: u.name,
        role: u.role,
        institutionId: u.institutionId,
        assignedInstitutionIds: u.assignedInstitutionIds,
        passwordHash,
        isActive: true,
        isActivated: true,
        emailVerified: true,
        isDemoUser: true,
        dataMode: 'DEMO',
        failedLoginAttempts: 0,
        lockUntil: null
      });
      await doc.save();
    } else {
      console.log(`[Repair] Updating demo account: ${u.email}`);
      doc.name = u.name;
      doc.role = u.role;
      doc.institutionId = u.institutionId;
      doc.assignedInstitutionIds = u.assignedInstitutionIds;
      doc.passwordHash = passwordHash;
      doc.isActive = true;
      doc.isActivated = true;
      doc.emailVerified = true;
      doc.isDemoUser = true;
      doc.dataMode = 'DEMO';
      doc.failedLoginAttempts = 0;
      doc.lockUntil = null;
      await doc.save();
    }

    // Double check verification
    const verified = await verifyPassword(demoPassword, doc.passwordHash);
    console.log(`  ✓ ${u.email} [${u.role}] password valid: ${verified}, isActivated: ${doc.isActivated}, isActive: ${doc.isActive}`);
  }

  console.log('[Repair] All demo user accounts repaired and verified successfully!');
  await mongoose.disconnect();
}

repair().catch((err) => {
  console.error('[Repair Error]', err);
  process.exit(1);
});
