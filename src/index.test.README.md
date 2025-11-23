# API Integration Tests

This file (`src/index.test.ts`) contains comprehensive integration tests for all API endpoints in the Thistle application.

## Running the Tests

### Option 1: Manual Server Start (Recommended for Development)

1. Start the test server in one terminal:
   ```bash
   PORT=3001 bun run src/index.ts
   ```

2. Run the integration tests in another terminal:
   ```bash
   bun test src/index.test.ts
   ```

### Option 2: Run All Tests

To run all tests (both unit and integration):
```bash
bun test
```

**Note**: Integration tests will be skipped if the test server is not running on port 3001.

## Test Coverage

The integration tests cover the following endpoint groups:

### Authentication Endpoints
- `POST /api/auth/register` - User registration with validation and rate limiting
- `POST /api/auth/login` - User login with rate limiting
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user information

### Session Management
- `GET /api/sessions` - List user sessions
- `DELETE /api/sessions` - Delete specific session

### User Management
- `DELETE /api/user` - Delete user account
- `PUT /api/user/email` - Update user email
- `PUT /api/user/password` - Update user password
- `PUT /api/user/name` - Update user name
- `PUT /api/user/avatar` - Update user avatar

### Passkey Management
- `POST /api/passkeys/register/options` - Get passkey registration options
- `POST /api/passkeys/register/verify` - Verify and create passkey
- `POST /api/passkeys/authenticate/options` - Get authentication options
- `POST /api/passkeys/authenticate/verify` - Verify and authenticate with passkey
- `GET /api/passkeys` - List user passkeys
- `PUT /api/passkeys/:id` - Update passkey name
- `DELETE /api/passkeys/:id` - Delete passkey

### Health Endpoint
- `GET /api/health` - Check service health (database, whisper, storage)

### Transcription Endpoints
- `GET /api/transcriptions` - List user transcriptions
- `POST /api/transcriptions` - Upload audio file and start transcription
- `GET /api/transcriptions/:id` - Get transcription details
- `GET /api/transcriptions/:id/audio` - Get audio file with range support
- `GET /api/transcriptions/:id/stream` - SSE stream for transcription updates

### Admin Endpoints
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id/details` - Get user details
- `DELETE /api/admin/users/:id` - Delete user
- `PUT /api/admin/users/:id/role` - Update user role
- `PUT /api/admin/users/:id/name` - Update user name
- `PUT /api/admin/users/:id/email` - Update user email
- `POST /api/admin/users/:id/password-reset` - Send password reset email
- `GET /api/admin/users/:id/sessions` - List user sessions
- `DELETE /api/admin/users/:id/sessions` - Delete all user sessions
- `DELETE /api/admin/users/:id/sessions/:sessionId` - Delete specific session
- `DELETE /api/admin/users/:id/passkeys/:passkeyId` - Delete user passkey
- `GET /api/admin/transcriptions` - List all transcriptions
- `GET /api/admin/transcriptions/:id/details` - Get transcription details
- `DELETE /api/admin/transcriptions/:id` - Delete transcription

## Test Features

- **Automatic cleanup**: Test data is cleaned up before and after each test
- **Rate limit testing**: Validates rate limiting on sensitive endpoints
- **Authorization testing**: Ensures proper authentication and authorization
- **Validation testing**: Checks input validation and error handling
- **Security testing**: Tests for common vulnerabilities
- **File upload testing**: Validates file type and size restrictions

## Test Database

Tests use the same database as development. Test users and data are identified by email patterns (`test%`, `admin@%`) and are automatically cleaned up after tests run.

## Continuous Integration

For CI/CD pipelines, you can use a background server:

```bash
# Start server in background
PORT=3001 bun run src/index.ts &
SERVER_PID=$!

# Wait for server to be ready
sleep 2

# Run tests
bun test src/index.test.ts

# Kill server
kill $SERVER_PID
```

## Troubleshooting

### Tests are being skipped
- Make sure the test server is running on port 3001
- Check that there are no port conflicts
- Verify the server started successfully (check console output)

### Tests are failing with connection errors
- Ensure no firewall is blocking localhost connections
- Try increasing the timeout in the `beforeAll` hook
- Check that the database is accessible

### Rate limit tests are flaky
- Rate limits are shared across test runs
- Clean test data between runs: `rm thistle.db`
- Or adjust rate limit test expectations
