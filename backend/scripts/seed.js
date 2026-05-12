import 'dotenv/config';
import bcrypt from 'bcrypt';
import * as fileStore from '../src/services/fileStore.js';

const sampleFaqs = [
  { question: 'What are the office hours?', alternates: ['when are you open', 'office timings'], answer: 'Monday to Saturday, 9 AM to 9 PM.', category: 'General' },
  { question: 'What is the return policy?', alternates: ['can I return a product', 'returns'], answer: 'You can return any product within 30 days with a receipt.', category: 'Policy' },
  { question: 'How do I contact support?', alternates: ['customer service', 'help desk'], answer: 'Email support@example.com or call 1-800-555-0100.', category: 'Support' },
  { question: 'Do you offer free shipping?', alternates: ['shipping cost', 'delivery charges'], answer: 'Free shipping on orders over ₹500.', category: 'Shipping' },
  { question: 'Where is the office located?', alternates: ['address', 'office location'], answer: '4th Floor, Prestige Tower, MG Road, Bangalore 560001.', category: 'General' },
  { question: 'What payment methods are accepted?', alternates: ['how to pay', 'payment options'], answer: 'We accept UPI, credit/debit cards, net banking, and wallets.', category: 'Payment' },
  { question: 'How long does delivery take?', alternates: ['delivery time', 'when will I get my order'], answer: 'Standard delivery: 3–5 business days. Express: 1–2 days.', category: 'Shipping' },
  { question: 'Is there a product warranty?', alternates: ['warranty period', 'guarantee'], answer: 'All products carry a 1-year warranty against manufacturing defects.', category: 'Policy' },
  { question: 'How do I track my order?', alternates: ['order tracking', 'where is my order'], answer: 'You will receive a tracking link via email once your order ships.', category: 'Orders' },
  { question: 'How do I reset my password?', alternates: ['forgot password', 'password reset'], answer: 'Click "Forgot Password" on the login page and follow the email instructions.', category: 'Account' },
];

const now = new Date().toISOString();
const questions = sampleFaqs.map((q, i) => ({
  id: `q_${String(i + 1).padStart(3, '0')}`,
  ...q,
  active: true,
  created_by: 'admin@example.com',
  created_at: now,
  updated_by: 'admin@example.com',
  updated_at: now,
}));

const passwordHash = await bcrypt.hash('changeme', 10);

await fileStore.write('faqs', { version: 1, last_updated: now, questions });
await fileStore.write('admins', {
  admins: [{
    teams_user_id: '29:demo-admin-id',
    email: 'admin@example.com',
    name: 'Demo Admin',
    web_password_hash: passwordHash,
    notifications_enabled: true,
    active: true,
  }],
});
await fileStore.write('suggestions', {
  next_id: 3,
  suggestions: [
    {
      id: 'S-001', type: 'update',
      submitted_by: { teams_user_id: '29:user-abc', name: 'Rahul Verma', email: 'rahul@example.com', conversation_reference: null },
      target_faq_id: 'q_001', target_question_snippet: 'What are the office hours?',
      current_answer: 'Monday to Saturday, 9 AM to 9 PM.',
      proposed_question: null, proposed_answer: 'Monday to Friday, 10 AM to 6 PM.',
      status: 'pending', created_at: now, reviewed_by: null, reviewed_at: null, review_reason: null, applied: false,
    },
    {
      id: 'S-002', type: 'report',
      submitted_by: { teams_user_id: '29:user-xyz', name: 'Priya Singh', email: 'priya@example.com', conversation_reference: null },
      target_faq_id: 'q_004', target_question_snippet: 'Do you offer free shipping?',
      current_answer: 'Free shipping on orders over ₹500.',
      proposed_question: null, proposed_answer: null,
      status: 'approved', created_at: now, reviewed_by: 'admin@example.com', reviewed_at: now, review_reason: null, applied: false,
    },
  ],
});

// Pause briefly to let write queue flush before logging
await new Promise(r => setTimeout(r, 200));

console.log('\n✅ Seed complete');
console.log('─────────────────────────────');
console.log(`FAQs written:        ${questions.length}`);
console.log('Admin email:         admin@example.com');
console.log('Admin password:      changeme');
console.log('Admin Teams user ID: 29:demo-admin-id');
console.log('Sample suggestions:  2 (1 pending, 1 approved)');
console.log('─────────────────────────────');
console.log('\nNext steps:');
console.log('1. Copy .env.example → .env and set JWT_SECRET');
console.log('2. npm run dev');
console.log('3. curl http://localhost:3000/api/health');
console.log('4. To make yourself admin, edit backend/data/admins.json');
console.log('   and replace "29:demo-admin-id" with your real Teams user ID.\n');
process.exit(0);
