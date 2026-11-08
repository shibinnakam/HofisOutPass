// ==========================================================================
// CLI Seed Script for AWS DynamoDB & Amazon Cognito
// Sets default Admin Username: "hofis" and Password: "hofis"
// Run with: node seed.js
// ==========================================================================

const { seedDatabaseHandler } = require('./src/handler');

(async () => {
  console.log('Seeding AWS DynamoDB & Cognito with default admin (hofis / hofis)...');
  const res = await seedDatabaseHandler();
  console.log('Result:', res.statusCode, res.body);
})();

