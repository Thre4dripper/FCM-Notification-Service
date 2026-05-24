const { handler } = require('./dist/main.js');

// Simulates an API Gateway POST request
handler({
  httpMethod: 'POST',
  body: JSON.stringify({
    deviceToken: 'YOUR_DEVICE_TOKEN',
    data: {
      title: 'Test Notification',
      body: 'Hello from Lambda!',
    },
  }),
  headers: { 'Content-Type': 'application/json' },
  queryStringParameters: null,
  pathParameters: null,
  isBase64Encoded: false,
})
  .then(result => {
    console.log('Status:', result.statusCode);
    console.log('Body:', JSON.parse(result.body));
  })
  .catch(console.error);
