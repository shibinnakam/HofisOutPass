/**
 * Holy Family International School (HOFIS) - Outpass System
 * AWS Configuration File
 */

const AWS_CONFIG = {
  // Set to false to connect directly to your live deployed AWS API Gateway & Lambda
  USE_MOCK_AWS: false,

  // AWS Region
  region: "ap-south-1",

  // Live AWS API Gateway Base URL
  apiEndpoint: "https://jrq7fg37tb.execute-api.ap-south-1.amazonaws.com/Prod",

  // Amazon Cognito Configuration (Paste from SAM deploy outputs if available)
  cognito: {
    userPoolId: "ap-south-1_xxxxxxxxx",
    userPoolClientId: "xxxxxxxxxxxxxxxxxxxxxxxxxx",
    identityPoolId: ""
  },

  // DynamoDB Table Names (for reference)
  tables: {
    students: "Hofis_Students",
    outpasses: "Hofis_Outpasses"
  }
};

window.AWS_CONFIG = AWS_CONFIG;
