// ==========================================================================
// CLI Seed Script for AWS DynamoDB & Amazon Cognito
// Sets Admin Accounts:
//   1) username: "hofis",  password: "hofis"
//   2) username: "shibin", password: "shibin"
// Run with: node seed.js
// ==========================================================================

const { seedDatabaseHandler } = require('./src/handler');

(async () => {
  console.log('Seeding AWS DynamoDB & Cognito with admins (hofis/hofis & shibin/shibin)...');
  const res = await seedDatabaseHandler();
  console.log('Result:', res.statusCode, res.body);
})();
